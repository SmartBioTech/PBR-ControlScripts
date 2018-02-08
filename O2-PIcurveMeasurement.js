var UserDefinedProtocol = {
   oxygenMeasurementInterval: 60,
   oxygenRapidMeasurementInterval: 4,
   oxygenMeasurementDuration: 150,
   respirationMeasurementDuration: 120,
   relaxationPhaseDuration: 120,
   photosynthesisRateCurveEvalFraction: 1/2,
   photosynthesisMeasurementPeriod: 10800,
   turbidostatSynchronization: false,
   growthStabilitySynchronization: false,
   stirrerIntensityValues: [50, 50],
   lightStepMultiplierValues: [ 1, 1, 1 ], // this means to measure O2 evol./ resp. in triplicate
   lightStepMultiplierColors: ["red"],
   photosynthesisCurveLightMultiplierValues: [ 1 ] // example for PI curve measurement [ 8, 4, 2, 1, 1/2, 1/4, 1/8, 1/16 ]
};

/**
 * PI-Curves Measurement
 *
 * @script PI-Curves Measurement - Photosynthesis Efficiency Quantification
 * @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
 * @version 1.1.1
 * @modified 13.6.2017 (JaCe)
 * @notes For proper function of the script following protocols have to be disabled: "Lights", "Bubble intr. valve" and "Stirrer" 
 *
 * @param {number} oxygenMeasurementDuration [s] Duration of O2 evolution measurement
 * @param {number} respirationMeasurementDuration [s] Duration of O2 respiration measurement
 * @param {number} relaxationPhaseDuration [s] Duration of O2 relaxation phase
 * @param {number} photosynthesisRateCurveEvalFraction [s] Last part of the measurement used for photosynthesis rate evaluation
 * @param {number} photosynthesisMeasurementPeriod [s] How often to measure PI curves
 * @param {boolean} turbidostatSynchronization [false/true] Defines whether the measurement is synchronized with dilutions
 * @param {boolean} growthStabilitySynchronization [false/true] Defines whether the measurement is synchronized with achieved stability of growth (as determined by the Growth Optimizer)
 * @param {number} oxygenMeasurementInterval [s] Interval of regular periodic dO2 measurements
 * @param {number} oxygenRapidMeasurementInterval [s] Interval of rapid dO2 measurements during PI-curve
 * @param {array} stirrerIntensityValues [%, %] Defines stirrer intensity during normal and rapid measurements of O2 evolution/respiration
 * @param {array} lightStepMultiplierValues [x, ...] Set of light multipliers for PI curve measurements
 * @param {array} lightStepMultiplierColors ["red", "blue", "white", "all"] Defines type of lights that will be modified/manipulated during PI-curve measurements
 * @param {array} photosynthesisCurveLightMultiplierValues [x, ...] Set of light multipliers for PI curve measurements
 *
 * @return dO2 readout period
 *
 */

// Libraries to import
importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);
importPackage(Packages.psi.bioreactor.core.regression);

// Context parameters
var experimentDuration = theExperiment.getDurationSec();
var measurementTime = theAccessory.context().getInt("measurementTime", experimentDuration);
function round(number, decimals) {
   return +(Math.round(number + "e+" + decimals) + "e-" + decimals);
}
function debugLogger(message, status) {
   if ((status === undefined) || (status === 1) || (status === "on")) {
      theLogger.info("[" + theGroup.getName() + "] " + message);
   } else {
      return null;
   }
}
function controlLights(intensityRed, intensityBlue) {
   light0.setRunningProtoConfig(new ProtoConfig(intensityRed));
   light1.setRunningProtoConfig(new ProtoConfig(intensityBlue));
}
if (!theAccessory.context().getBool("initialization", false)) {
   theAccessory.context().clear();
   if (theGroup.getAccessory("pwm.stirrer").getProtoConfigValue()) {
      theExperiment.addEvent("Clear stirrer protocol!!!");
   }
   if (theGroup.getAccessory("switches.valve-0").getProtoConfigValue()) {
      theExperiment.addEvent("Clear bubble intr. valve protocol!!!");
   }
   theAccessory.getDataHistory().setCapacity(Math.max(UserDefinedProtocol.oxygenMeasurementDuration,  UserDefinedProtocol.respirationMeasurementDuration));
   theAccessory.context().put("rateO2Evol", []);
   theAccessory.context().put("rateO2Resp", []);
   theAccessory.context().put("initialization", true);
   theGroup.getAccessory("pwm.stirrer").setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]));
   theGroup.getAccessory("switches.valve-0").setRunningProtoConfig(ProtoConfig.ON);
   measurementTime = experimentDuration + 600;
   theAccessory.context().put("measurementTime", measurementTime);
   debugLogger("PI-Curves Measurement - Photosynthesis Efficiency Quantification initialization successful.");
}
if (experimentDuration >= measurementTime) {
   var turbidostat = theGroup.getAccessory("pumps.pump-5");
   var dilution = UserDefinedProtocol.turbidostatSynchronization ? turbidostat.context().getInt("modeDilution", 0) : 1;
   var stabilized = UserDefinedProtocol.growthStabilitySynchronization ? turbidostat.context().getInt("modeStabilized", 0) : 1;
   if (dilution && stabilized) {
      var regCoefLin, rateO2Evol;
      var changeCounter = theAccessory.context().getInt("changeCounter", 0);
      var multiplierStep = theAccessory.context().getInt("multiplierStep", 0);
      var resumeTime = theAccessory.context().getInt("resumeTime", 0);
      // PI-curve phase parameters 
      var bubblingSuspended = theAccessory.context().getInt("bubblingSuspended", 0);
      var lightSuspended = theAccessory.context().getInt("lightSuspended", 0);
      var relaxation = theAccessory.context().getInt("relaxation", 0);
      // Accessories inicialization
      var stirrer = theGroup.getAccessory("pwm.stirrer");
      var bubbles = theGroup.getAccessory("switches.valve-0");
      var light0 = theGroup.getAccessory("actinic-lights.light-Red");
      var light1 = theGroup.getAccessory("actinic-lights.light-Blue");
      if (!bubblingSuspended) {
         theAccessory.context().put("bubblingSuspended", 1);
         theAccessory.context().put("modeO2EvolResp", 1);
         resumeTime = experimentDuration + UserDefinedProtocol.oxygenMeasurementDuration + UserDefinedProtocol.respirationMeasurementDuration;
         theAccessory.context().put("resumeTime", resumeTime);
         theAccessory.context().put("light0Value", light0.getValue());
         theAccessory.context().put("light1Value", light1.getValue());
         bubbles.setRunningProtoConfig(ProtoConfig.OFF);
         stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[1]));
         controlLights(light0.getValue() * UserDefinedProtocol.lightStepMultiplierValues[changeCounter] * UserDefinedProtocol.photosynthesisCurveLightMultiplierValues[multiplierStep], light1.getValue());
      }
      if ((UserDefinedProtocol.respirationMeasurementDuration > 0 ) && (experimentDuration > (resumeTime - UserDefinedProtocol.respirationMeasurementDuration)) && !lightSuspended) {
         theAccessory.context().put("lightSuspended", 1);
         light0.suspend(resumeTime);
         light1.suspend(resumeTime);
         // TODO should be function1
         regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN, Math.ceil(UserDefinedProtocol.photosynthesisRateCurveEvalFraction * UserDefinedProtocol.oxygenMeasurementDuration / UserDefinedProtocol.oxygenRapidMeasurementInterval));
         debugLogger("O2 evol. parameters: " + regCoefLin.join(", "));
         rateO2Evol = theAccessory.context().get("rateO2Evol", []);
         rateO2Evol[changeCounter] = round(regCoefLin[1] * 600, 2);
      }
      if ((UserDefinedProtocol.relaxationPhaseDuration > 0) && (experimentDuration > resumeTime) && !relaxation) {   
         theAccessory.context().put("relaxation", 1);
         controlLights(theAccessory.context().getDouble("light0Value", light0.getValue()), theAccessory.context().getDouble("light1Value", light1.getValue()));
         light0.resume(experimentDuration);
         light1.resume(experimentDuration);
         // TODO should be function1
         bubbles.setRunningProtoConfig(ProtoConfig.ON);
         stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]));
         regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN, Math.ceil(UserDefinedProtocol.photosynthesisRateCurveEvalFraction * UserDefinedProtocol.respirationMeasurementDuration / UserDefinedProtocol.oxygenRapidMeasurementInterval));
         debugLogger("O2 resp. parameters: " + regCoefLin.join(", "));
         rateO2Resp = theAccessory.context().get("rateO2Resp", []);
         rateO2Resp[changeCounter] = round(regCoefLin[1] * 600, 2);
      }
      if (experimentDuration > (resumeTime + UserDefinedProtocol.relaxationPhaseDuration)) {
         theAccessory.context().put("bubblingSuspended", 0);
         theAccessory.context().put("lightSuspended", 0);
         theAccessory.context().put("relaxation", 0);
         theAccessory.context().put("changeCounter", ++changeCounter);
         if (changeCounter >= UserDefinedProtocol.lightStepMultiplierValues.length) {
            rateO2Evol = theAccessory.context().get("rateO2Evol", []);
            rateO2Resp = theAccessory.context().get("rateO2Resp", []);
            theAccessory.context().put("changeCounter", 0);
            theAccessory.context().put("measurementTime", experimentDuration + UserDefinedProtocol.photosynthesisMeasurementPeriod - UserDefinedProtocol.lightStepMultiplierValues.length * (UserDefinedProtocol.oxygenMeasurementDuration + UserDefinedProtocol.respirationMeasurementDuration + UserDefinedProtocol.relaxationPhaseDuration));
            theExperiment.addEvent("PI-curve DONE. O2 rates are " + rateO2Evol.join(", ") + " and " + rateO2Resp.join(", ") + " units/min");
            theAccessory.context().put("rateO2Evol", []);
            theAccessory.context().put("rateO2Resp", []);
            bubbles.setRunningProtoConfig(ProtoConfig.ON);
            stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]));
            theAccessory.context().put("modeO2EvolResp", 0);
            multiplierStep = multiplierStep < (UserDefinedProtocol.photosynthesisCurveLightMultiplierValues.length - 1) ? ++multiplierStep : 0;
            theAccessory.context().put("multiplierStep", multiplierStep);
            debugLogger("PI-curve finished.");
         }
      }
      result = UserDefinedProtocol.oxygenRapidMeasurementInterval;
   }
} else if (experimentDuration > theAccessory.context().getInt("checkupTime", 0)) {
   // Here comes a hack that solves an issue with strange periodic behaviour of both bubble interrupting valve and stirrer, when they turn off in uncontrolled manner - most likely bug in the software
      var stirrer = theGroup.getAccessory("pwm.stirrer");
      var bubbles = theGroup.getAccessory("switches.valve-0");
      theAccessory.context().put("checkupTime", experimentDuration + 10);
      bubbles.setRunningProtoConfig(ProtoConfig.ON);
      stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]));
      result = UserDefinedProtocol.oxygenMeasurementInterval;
} else {
   result = UserDefinedProtocol.oxygenMeasurementInterval;
}
