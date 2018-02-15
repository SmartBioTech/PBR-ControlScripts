var UserDefinedProtocol = {
   // -turbidostat settings
   turbidostatODMin: 0.4,
   turbidostatODMax: 0.425,
   turbidostatODType: 720,
   ODReadoutInterval: 60,
   // -peristaltic pump settings
   peristalticPumpID: 5,
   peristalticPumpSpeed: 100,
   peristalticPumpSlowDownRange: 25,
   peristalticPumpSlowDownFactor: 75,
   // -optimizer stability check
   growthStatistics: true,
   regressionODType: 680,
   analyzedStepsMin: 6,
   intervalOfConfidenceMax: 3.0,
   growthTrendMax: 1.5,
   stabilizationTimeMin: 8,
   growthRateEvalDelay: 420,
   growthRateEvalFrac: false,
   growthRateEvalDelayFrac: 50,
   // -optimizer parameters
   controlledParameter: "none",
   controlledParameterSteps: [[ 1100, 25 ], [ 440, 25 ], [ 55, 25 ]]
};

/**
 * OD Regulator Using External/Additional Pump
 *
 * @script Peristaltic Pump - Automatic Growth Characterization
 * @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
 * @version 3.0.6
 * @modified 15.2.2018 (JaCe)
 *
 * @notes For proper functionality of the script "OD Regulator" protocol has to be disabled as well as appropriate
 *        controlled accessory protocols (i.e. Lights, Thermoregulation, GMS, Stirrer).
 *        The controlled pump has to be set to ID 5 to allow compatibility with other scripts
 *
 * @param {number} turbidostatODMin [AU] - Minimum OD/lower bound for OD regulator/turbidostat
 * @param {number} turbidostatODMax [AU] - Maximum OD/upper bound for OD regulator/turbidostat
 * @param {number} turbidostatODType [680/720/735] - OD sensor used for turbidostat control
 * @param {number} ODReadoutInterval [s] - Defines how often is the OD measured
 * @param {number} peristalticPumpSpeed [%] - Nominal pump speed used for dilution of the suspension
 * @param {number} peristalticPumpSlowDownRange [%] - Lower range where the pump slows down
 * @param {number} peristalticPumpSlowDownFactor [%] - Slow down factor for the pump
 * @param {number} growthStatistics [true/false] - Enable or disable calculation of growth statistics
 * @param {number} regressionODType [680/720/735] - OD sensor used for doubling time determination
 * @param {number} analyzedStepsMin [-] - Number of steps to be analyzed for stability check
 * @param {number} intervalOfConfidenceMax [%] - Maximum allowed percents of 95% Confidence Interval
 * @param {number} growthTrendMax [%] - Maximum growth speed trend in time
 * @param {number} stabilizationTimeMin [h] - Minimum duration of each characterization step
 * @param {number} growthRateEvalDelay [s] - Time after dilution where data for doubling time determination are ignored
 * @param {number} growthRateEvalFrac [true/false] - Defines whether to use fraction or time for doubling time determination
 * @param {number} growthRateEvalDelayFrac [%] - Fraction of first part of data that are ignored for doubling time determination
 *                 start to be collected. This is to prevent influence of post dilution effect on doubling time evaluation
 * @param {string} controlledParameter ["none"/"temperature"/"lights"/"GMS"/"stirrer"/"ODRange"] - Supported parameters to control by the script
 * @param {array} controlledParameterSteps - List of values for the controlled parameter. Examples:
 *                temperature = [ 28, 32, 34, 30, 26, 22 ]; // [oC]
 *                lights = [[ 55, 25 ],[ 110, 25 ],[ 220, 25 ],[ 440, 25 ],[ 880,25 ]]; // [uE]
 *                GMS = [[ 195.88, 5.873 ],[ 195.88, 12.478 ],[ 185.30, 18.257 ],[ 185.30,25.274 ]]; // [ml/min]
 *                stirrer = [ 30, 50, 65, 80, 95 ]; // [%] !!! works only with SW version 0.7.14 and later
 *                ODRange = [[0.4, 0.425], [0.2, 0.215], [0.1, 0.113]]; // [AU]
 *
 * @return Flow of external/additional pump
 *
 */

// Libraries import
importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);
importPackage(Packages.psi.bioreactor.core.regression);

// Functions definition
function round(number, decimals) {
   // Rounding specific decimal point number
   return +(Math.round(number + "e+" + decimals) + "e-" + decimals);
}
function debugLogger(message, status) {
   if ((status === undefined) || (status === 1) || (status === "on")) {
      theLogger.info("[" + theGroup.getName() + "] " + message);
   } else {
      return null;
   }
}
function controlParameter(parameter, values) {
   // Control accessory functions
   if ((parameter === undefined) || (parameter === "none") || (values === undefined)) {
      return null;
   }
   var unit;
   switch(parameter) {
      case "lights":
         var light0 = theGroup.getAccessory("actinic-lights.light-Red");
         var light1 = theGroup.getAccessory("actinic-lights.light-Blue");
         unit = " uE";
         light0.setRunningProtoConfig(new ProtoConfig(Number(values[0]))); //Red
         light1.setRunningProtoConfig(new ProtoConfig(Number(values[1]))); //Blue
         debugLogger("Lights changed.");
         break;
      case "temperature":
         var thermoreg = theGroup.getAccessory("thermo.thermo-reg");
         unit = String.fromCharCode(176)+"C";
         thermoreg.setRunningProtoConfig(new ProtoConfig(Number(values)));
         debugLogger("Temperature changed.");
         break;
      case "GMS":
         var valve0 = theGroup.getAccessory("gas-mixer.valve-0-reg"); // CO2
         var valve1 = theGroup.getAccessory("gas-mixer.valve-1-reg"); // Air
         unit = " ml/min";
         valve0.setRunningProtoConfig(new ProtoConfig(Number(values[0])));
         valve0.setRunningProtoConfig(new ProtoConfig(Number(values[1])));
         debugLogger("GMS settings changed. Gas Mixing set to Air flow " + round(flowAir, 2) + " ml/min and CO2 flow " + round(flowCO2, 2) + " ml/min (" + round((flowCO2/(flowCO2+flowAir) + 400 / 1e6) * 100, 1) + "%)");
         break;
      case "stirrer":
         var stirrer = theGroup.getAccessory("pwm.stirrer");
         unit = "%";
         stirrer.setRunningProtoConfig(new ProtoConfig(Number(values)));
         debugLogger("Stirrer changed.");
         break;
      case "ODRange":
         theAccessory.context().put("odMinModifier", Number(values[0]) / UserDefinedProtocol.turbidostatODMin);
         theAccessory.context().put("odMaxModifier", Number(values[1]) / UserDefinedProtocol.turbidostatODMax);
         unit = " AU";
         debugLogger("Turbidostat OD range changed.");
         break;
      default:
         return;
   }
   theAccessory.context().put("controlledParameterText", parameter + " " + (Array.isArray(values) ? values.join(" and ") : values) + unit);
   theExperiment.addEvent(parameter[0].toUpperCase() + parameter.slice(1) + " changed to " + (Array.isArray(values) ? values.join(" and ") : values) + unit);
}
// Inicialization of the script
if (!theAccessory.context().getInt("initialization", 0)) {
   theAccessory.context().clear();
   switch(UserDefinedProtocol.controlledParameter) {
      case "lights":
         if (theGroup.getAccessory("actinic-lights.light-Red").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable red light protocol.");
         }
         if (theGroup.getAccessory("actinic-lights.light-Blue").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable red light protocol.");
         }
         break;
      case "temperature":
         if (theGroup.getAccessory("thermo.thermo-reg").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable thermoregulator protocol.");
         }
         break;
      case "GMS":
         if (theGroup.getAccessory("gas-mixer.valve-0-reg").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable GMS CO2 protocol.");
         }
         if (theGroup.getAccessory("gas-mixer.valve-1-reg").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable GMS Air/N2 protocol.");
         }
         break;
      case "stirrer":
         if (theGroup.getAccessory("pwm.stirrer").getProtoConfigValue()) {
            theExperiment.addEvent("!!! Disable stirrer protocol.");
         }
         break;
      case "none":
         break;
      default:
         theExperiment.addEvent("!!! Unknown parameter set for control - check controlledParameter setting.")
   }
   if (UserDefinedProtocol.turbidostatODType === 720 || 735) {
      if(theGroup.getAccessory("od-sensors.od-720") === null) {
         theAccessory.context().put("OD7XYString", "od-sensors.od-735");
      } else {
         theAccessory.context().put("OD7XYString", "od-sensors.od-720");
      }
   }
   if (UserDefinedProtocol.regressionODType === 720 || 735) {
      if(theGroup.getAccessory("od-sensors.od-720") === null) {
         theAccessory.context().put("RegOD7XYString", "od-sensors.od-735");
      } else {
         theAccessory.context().put("RegOD7XYString", "od-sensors.od-720");
      }
   }
   controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[0]);
   theAccessory.context().put("initialization", 1);
   debugLogger("Peristaltic Pump - Growth Optimizer initialization successful.");
}
function setODSensorString(ODType) {
   // Set ODtype = [turbidostat, regression]
   switch (UserDefinedProtocol[ODType+"ODType"]) {
      case 680:
         odString = "od-sensors.od-680";
         break;
      case 720:
         odString = "od-sensors.od-720";
         break;
      case 735:
         odString = "od-sensors.od-735";
         break;
      default:
         odString = "od-sensors.od-680";
   }
   switch (ODType) {
      case "turbidostat":
         text = "Sensor";
         break;
      case "regression":
         text = "SensorRegression";
         break;
      default:
         text = "Sensor";
   }
   eval("od" + text + "String = " + odString);
   debugLogger("OD sensor string set");
}
function controlPump() {
   // Control the pump
   //Following ready for function
   //setODSensorString("turbidostat");
   //setODSensorString("regression");
   switch (UserDefinedProtocol.turbidostatODType) {
      case 680:
         odSensorString = "od-sensors.od-680";
         break;
      default:
         odSensorString = theAccessory.context().get("OD7XYString", "od-sensors.od-720");
   }
   switch (UserDefinedProtocol.regressionODType) {
      case 680:
         odSensorRegressionString = "od-sensors.od-680";
         break;
      default:
         odSensorRegressionString = theAccessory.context().get("RegOD7XYString", "od-sensors.od-720");
   }
   var odSensor = theGroup.getAccessory(odSensorString);
   var odSensorRegression = theGroup.getAccessory(odSensorRegressionString);
   if (odSensor === null || odSensor.hasError()) {
      return null; // pump not influenced
   }
   var odValue = odSensor.getValue();
   var odLast = theAccessory.context().getDouble("odLast", 0.0);
   var odNoise = theAccessory.context().getInt("odNoise", 1);
   var odMinModifier = theAccessory.context().getDouble("odMinModifier", 1.0);
   var odMaxModifier = theAccessory.context().getDouble("odMaxModifier", 1.0);
   // Check for OD noise/overshots and primitive OD averaging
   if (!Double.isNaN(odValue) && (round(odValue, 3) != round(odLast, 3))) {
      if (odNoise) {
         theAccessory.context().put("odNoise", 0);
         theAccessory.context().put("odLast", odValue);
         return null;
      }
      if (pumpState || (Math.abs(1 - odValue / odLast) < 0.04)) {
         odValue = (odValue + odLast) / 2;
         theAccessory.context().put("odLast", odValue);
      }
      else {
         theAccessory.context().put("odNoise", 1);
         theAccessory.context().put("odLast", odValue);
         return null;
      }
   } else {
      return null;
   }
   // Check for reversed OD range
   if (UserDefinedProtocol.turbidostatODMin > UserDefinedProtocol.turbidostatODMax) {
      UserDefinedProtocol.turbidostatODMin = (UserDefinedProtocol.turbidostatODMax - UserDefinedProtocol.turbidostatODMin) + (UserDefinedProtocol.turbidostatODMax = UserDefinedProtocol.turbidostatODMin);
      debugLogger("OD range reversed.", 0);
   }
   // Start step growth rate evaluation
   if ((odValue > (UserDefinedProtocol.turbidostatODMax * odMaxModifier)) && !pumpState) {
      theAccessory.context().put("modeDilution", 1);
      theAccessory.context().put("modeStabilized", 0);
      var stepCounter = theAccessory.context().getInt("stepCounter", 0);
      var expDuration = theAccessory.context().get("expDuration", 0.0);
      var stepDuration = theAccessory.context().get("stepDuration", 0.0);
      var stepDoublingTime = theAccessory.context().get("stepDoublingTime", 0.0);
      var stabilizedTime = theAccessory.context().getInt("stabilizedTime", 0);
      if (!Array.isArray(expDuration)) {
         stepCounter = 0;
         expDuration = []; stepDuration = []; stepDoublingTime = [];
         theAccessory.context().put("expDuration", expDuration);
         theAccessory.context().put("stepDuration", stepDuration);
         theAccessory.context().put("stepDoublingTime", stepDoublingTime);
         theAccessory.context().put("stabilizedTime", theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMin * 3600);
         odSensorRegression.getDataHistory().setCapacity(600);
      }
      expDuration[stepCounter] = theExperiment.getDurationSec();
      stepDuration[stepCounter] = expDuration[stepCounter] - theAccessory.context().getInt("lastPumpStop", expDuration[stepCounter]);
      if ((stepDuration[stepCounter] > 0) && UserDefinedProtocol.growthStatistics) {
         var DHCapacity = (Math.floor(stepDuration[stepCounter] / UserDefinedProtocol.ODReadoutInterval) - 3) > 0 ? (Math.floor(stepDuration[stepCounter] / UserDefinedProtocol.ODReadoutInterval) - 3) : 60;
         var regCoefExp = odSensorRegression.getDataHistory().regression(ETrendFunction.EXP, Math.ceil(DHCapacity - (UserDefinedProtocol.growthRateEvalFrac ? DHCapacity * (1 - UserDefinedProtocol.growthRateEvalDelayFrac / 100) : UserDefinedProtocol.growthRateEvalDelay / UserDefinedProtocol.ODReadoutInterval)));
         debugLogger("Growth parameters: " + regCoefExp.join(", "));
         stepDoublingTime[stepCounter] = (1 / (Number(regCoefExp[1]) * 3600 * 10)) * Math.LN2;
         theExperiment.addEvent("Doubling time of the step was " + round(stepDoublingTime[stepCounter], 2) + " h and step no. is " + (++stepCounter));
         theAccessory.context().put("stepCounter", stepCounter);
         if (stepCounter >= UserDefinedProtocol.analyzedStepsMin) {
            var stepDoublingTimeAvg = 0; var stepDoublingTimeSD = 0; var stepDoublingTimeIC95 = 0; var stepTrend = 0; var sumXY = 0; var sumX = 0; var sumY = 0; var sumX2 = 0; var sumY2 = 0;
            // Average of steps doubling time
            for (var i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedStepsMin); i--) {
               stepDoublingTimeAvg += Number(stepDoublingTime[i]);
            }
            stepDoublingTimeAvg /= UserDefinedProtocol.analyzedStepsMin;
            // IC95 of steps doubling time
            for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedStepsMin); i--) {
               stepDoublingTimeSD += Math.pow(stepDoublingTime[i] - stepDoublingTimeAvg, 2);
            }
            stepDoublingTimeSD = Math.sqrt(stepDoublingTimeSD/UserDefinedProtocol.analyzedStepsMin);
            stepDoublingTimeIC95 = stepDoublingTimeSD/Math.sqrt(UserDefinedProtocol.analyzedStepsMin) * 1.96;
            // Trend of steps doubling time
            for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedStepsMin); i--) {
               sumX += Number(expDuration[i]);
               sumX2 += Math.pow(expDuration[i], 2);
               sumY += Number(stepDoublingTime[i]);
               sumY2 += Math.pow(stepDoublingTime[i], 2);
               sumXY += Number(expDuration[i]) * Number(stepDoublingTime[i]);
            }
            stepTrend = (UserDefinedProtocol.analyzedStepsMin * sumXY - sumX * sumY) / (UserDefinedProtocol.analyzedStepsMin * sumX2 - Math.pow(sumX, 2)) * 3600;
            theExperiment.addEvent("Steps doubling time Avg: " + round(stepDoublingTimeAvg, 2) + " h, IC95 " + round(stepDoublingTimeIC95, 2) + " h (" + round(stepDoublingTimeIC95 / stepDoublingTimeAvg * 100, 1) + "%) with " + round(stepTrend, 2) + " h/h trend (" + round(stepTrend / stepDoublingTimeAvg * 100, 1) + "%)");
            // Growth stability test and parameters control
            if ((stepDoublingTimeIC95 / stepDoublingTimeAvg) <= (UserDefinedProtocol.intervalOfConfidenceMax / 100) && (Math.abs(stepTrend / stepDoublingTimeAvg) <= (UserDefinedProtocol.growthTrendMax / 100)) && (stabilizedTime <= Number(theExperiment.getDurationSec()))) {
               theAccessory.context().put("modeStabilized", 1);
               var changeCounter = theAccessory.context().getInt("changeCounter", 0);
               theExperiment.addEvent("*** Stabilized doubling time TD (" + theGroup.getAccessory("thermo.thermo-reg").getValue() + String.fromCharCode(176) + "C, " + theAccessory.context().getString("controlledParameterText", "no parameter") + ") is " + round(stepDoublingTimeAvg, 2) + String.fromCharCode(177) + round(stepDoublingTimeIC95, 2) + " h (IC95)");
               if (UserDefinedProtocol.controlledParameterSteps.length > 1) {
                  if (changeCounter < (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
                     controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[++changeCounter]);
                     theAccessory.context().put("changeCounter", changeCounter);
                  } else if (changeCounter < 2 * (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
                     controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[2 * (UserDefinedProtocol.controlledParameterSteps.length - 1) - (++changeCounter)]);
                     theAccessory.context().put("changeCounter", changeCounter);
                  } else {
                     controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[1]);
                     theAccessory.context().put("changeCounter", 1);
                  }
                  theAccessory.context().remove("stepCounter");
                  theAccessory.context().remove("expDuration");
                  theAccessory.context().remove("stepDoublingTime");
                  theAccessory.context().remove("stabilizedTime");
               }
            }
         }
      }
      debugLogger("Pump max speed.");
      return theAccessory.getMax(); // fast
   } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier)) && pumpState) {
      theAccessory.context().put("modeDilution", 0);
      theAccessory.context().put("lastPumpStop", theExperiment.getDurationSec());
      debugLogger("Pump stopped.");
      return ProtoConfig.OFF; // pump off
   } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier + ((UserDefinedProtocol.turbidostatODMax * odMaxModifier) - (UserDefinedProtocol.turbidostatODMin * odMinModifier)) * UserDefinedProtocol.peristalticPumpSlowDownRange / 100)) && pumpState) {
      debugLogger("Pump low speed.", 0);
      return theAccessory.getMax() * UserDefinedProtocol.peristalticPumpSlowDownFactor / 100; // slow down the pump
   } else {
      return null; //pump not influenced
   }
}

// Set the pump
var pumpState = !Double.isNaN(theAccessory.getValue());
// Check whether O2 evolution and respiration measurement mode is active
if (theGroup.getAccessory("probes.o2").context().getInt("modeO2EvolResp", 0)) {
   if (pumpState) {
      theAccessory.context().put("pumpSuspended", 1);
      result = theAccessory.getMin();
   }
} else if (theAccessory.context().getInt("pumpSuspended", 0)) {
   theAccessory.context().put("pumpSuspended", 0);
   result = theAccessory.getMax();
} else {
   result = controlPump();
}
