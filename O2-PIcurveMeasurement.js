/**
 * PI-Curve Measurement
 *
 * @script PI-Curve Measurement - Photosynthesis Efficiency Quantification
 * @author CzechGlobe - Departoment of Adaptive Biotechnologies (JaCe)
 * @version 0.6
 * @modified 11.04.2017 (JaCe)
 * @notes For proper function of the script "Lights", "Bubble intr. valve" and "Stirrer" protocols have to be disabled
 *
 * @param {number} durationO2 Duration of O2 evolution measurement
 * @param {number} durationO2resp Duration of O2 respiration measurement
 * @param {number} durationO2relax Duration of O2 relaxation phase
 * @param {number} rateEvalPart Last part of the measurement used for rate evaluation
 * @param {number} measurementPeriod How often to measure PI curves
 * @param {boolean} measerementPumpSync Defines whether the measurement is synchronized with dilutions
 * @param {boolean} measerementStabSync Defines whether the measurement is synchronized with stability achieved
 * @param {number} periodO2 Period of O2 regular measurements
 * @param {number} periodO2fast Period of O2 measurements during PI curve measurement
 * @param {array} stirrerValue Couple of values for stirrer during normal and fast (O2 evol/resp) measurement
 * @param {array} lightSteps Set of light multipliers for PI curve measurements
 *
 * @return dO2 measurements period
 *
 */

importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);
importPackage(Packages.psi.bioreactor.core.regression);

// Static parameters set by user
var durationO2 = 180; // [s] duration of O2 evolution measurement
var durationO2resp = 180; // [s] duration of O2 respiration measurement
var durationO2relax = 120; // [s] duration of O2 relaxation phase
var rateEvalPart = 2/3; // [s] dast part of the measurement used for rate evaluation
var measurementPeriod = 10800; // [s] how often to measure PI curves
var measurementPumpSync = true; // [false/true] defines whether the measurement is synchronized with dilutions
var measurementStabSync = false; // [false/true] defines whether the measurement is synchronized with stable growth
var periodO2 = 60; // [s] period of O2 regular measurements
var periodO2fast = 5; // [s] period of O2 measurements during PI curve measurement
var stirrerValue = [50,60]; // [%] defines normal and fast measurement stirrer intensity
var lightSteps = [ 1, 1, 1 ]; // set of light multipliers for PI curve measurements
var multipliers = [ 1, 0.125, 0.25, 0.5, 1, 2, 4, 8 ];
//var lightSteps = [ 0.25, 0.5, 1, 6.25 ];

// Context parameters
var expDuration = Number(theExperiment.getDurationSec());
var measurementTime = Number(theAccessory.context().get("measurementTime", expDuration));
var checkupTime = Number(theAccessory.context().get("checkupTime", 0));
var initialization = Number(theAccessory.context().get("initialization", 0));

// Accessories inicialization
var stirrer = theGroup.getAccessory("pwm.stirrer");
var bubbles = theGroup.getAccessory("switches.valve-0");

function resetContext() {
   theAccessory.context().remove("modeO2EvolResp");
   theAccessory.context().remove("changeCounter");
   theAccessory.context().remove("suspended");
   theAccessory.context().remove("suspendedLights");
   theAccessory.context().remove("relaxation");
   theAccessory.context().remove("resumeTime");
   theAccessory.context().remove("measurementTime");
   theAccessory.context().remove("initialization");
   theAccessory.context().remove("light0Value");
   theAccessory.context().remove("light1Value");
   theAccessory.context().remove("rateO2Evol");
   theAccessory.context().remove("rateO2Resp");
   theAccessory.context().remove("checkupTime");
   theAccessory.context().remove("multiplierStep");
}

function round(number, decimals) {
   return +(Math.round(number + "e+" + decimals) + "e-" + decimals);
}

function controlLights(intensityRed, intensityBlue) {
   light0.setRunningProtoConfig(new ProtoConfig(intensityRed));
   light1.setRunningProtoConfig(new ProtoConfig(intensityBlue));
}

if (!initialization) {
   theAccessory.getDataHistory().setCapacity(Math.max(durationO2, durationO2resp));
   theAccessory.context().put("rateO2Evol", []);
   theAccessory.context().put("rateO2Resp", []);
   theAccessory.context().put("initialization", 1);
   theGroup.getAccessory("pwm.stirrer").setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));
   measurementTime=measurementTime+600;
   theAccessory.context().put("measurementTime", measurementTime);
}

measurementPumpSync ? dilution = Number(theGroup.getAccessory("pumps.pump-5").context().get("modeDilution", 0)) : dilution = 1;
measurementStabSync ? stabilized = Number(theGroup.getAccessory("pumps.pump-5").context().get("modeStabilized", 0)) : stabilized = 1;

if((expDuration >= measurementTime) && dilution && stabilized){
   var changeCounter = Number(theAccessory.context().get("changeCounter", 0));
   var suspended = Number(theAccessory.context().get("suspended", 0));
   var suspendedLights = Number(theAccessory.context().get("suspendedLights", 0));
   var relaxation = Number(theAccessory.context().get("relaxation", 0));
   var resumeTime = Number(theAccessory.context().get("resumeTime", 0));

   var light0 = theGroup.getAccessory("actinic-lights.light-Red");
   var light1 = theGroup.getAccessory("actinic-lights.light-Blue");

   if (!suspended) {
      theAccessory.context().put("suspended", 1);
      theAccessory.context().put("modeO2EvolResp", 1);
      resumeTime = expDuration+durationO2+durationO2resp;
      theAccessory.context().put("resumeTime", resumeTime);
      theAccessory.context().put("light0Value", light0.getValue());
      theAccessory.context().put("light1Value", light1.getValue());
      if (!changeCounter) theExperiment.addEvent("PI-curve START");
      bubbles.setRunningProtoConfig(ProtoConfig.OFF);
      stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[1]));
      controlLights(light0.getValue()*lightSteps[changeCounter]*multipliers[Number(theAccessory.context().get("multiplierStep", 0))], light1.getValue());
   }
   if ((expDuration > (resumeTime-durationO2resp))&&!suspendedLights) {
      theAccessory.context().put("suspendedLights", 1);
      light0.suspend(resumeTime);
      light1.suspend(resumeTime);
      var regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN,Math.ceil(rateEvalPart*durationO2/periodO2fast));
      var rateO2Evol = theAccessory.context().get("rateO2Evol",[]);
      rateO2Evol[changeCounter] = round(regCoefLin[1]*600,2);
   }
   if ((expDuration > resumeTime)&&!relaxation) {   
      theAccessory.context().put("relaxation", 1);
      controlLights(theAccessory.context().get("light0Value", light0.getValue()),theAccessory.context().get("light1Value", light1.getValue()));
      light0.resume(expDuration);
      light1.resume(expDuration);
      bubbles.setRunningProtoConfig(ProtoConfig.ON);
      stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));
      var regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN,Math.ceil(rateEvalPart*durationO2resp/periodO2fast));
      var rateO2Resp = theAccessory.context().get("rateO2Resp",[]);
      rateO2Resp[changeCounter] = round(regCoefLin[1]*600,2);
   }
   if (expDuration > (resumeTime + durationO2relax)) {
      theAccessory.context().put("suspended", 0);
      theAccessory.context().put("suspendedLights", 0);
      theAccessory.context().put("relaxation", 0);
      theAccessory.context().put("changeCounter", ++changeCounter);
      if (changeCounter >= lightSteps.length) {
         var rateO2Evol = theAccessory.context().get("rateO2Evol",[]);
         var rateO2Resp = theAccessory.context().get("rateO2Resp",[]);
         theAccessory.context().put("changeCounter", 0);
         theAccessory.context().put("measurementTime", expDuration+measurementPeriod-lightSteps.length*(durationO2+durationO2resp+durationO2relax));
         theExperiment.addEvent("PI-curve DONE. O2 rates are " + rateO2Evol.join(", ") + " and " + rateO2Resp.join(", ") + " units/min");
         theAccessory.context().put("rateO2Evol", []);
         theAccessory.context().put("rateO2Resp", []);
         bubbles.setRunningProtoConfig(ProtoConfig.ON);
         stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));
         theAccessory.context().put("modeO2EvolResp", 0);
         theAccessory.context().put("multiplierStep", theAccessory.context().get("multiplierStep", 0) + 1.0);
      }
   }
   result=periodO2fast;
}
else {
   if (expDuration > checkupTime) {
      theAccessory.context().put("checkupTime", expDuration+10);
      bubbles.setRunningProtoConfig(ProtoConfig.ON);
      stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));
   }
   result=periodO2;
}
