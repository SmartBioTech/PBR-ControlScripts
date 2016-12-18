/**
 * PI-Curve Measurement
 *
 * @script PI-Curve Measurement - Photosynthesis Efficiency Quantification
 * @author CzechGlobe - Departoment of Adaptive Biotechnologies (JaCe)
 * @version 0.3
 * @modified 17.12.2016 by JaCe
 * @notes For proper function of the script "Lights", "Bubble intr. valve" and "Stirrer" protocols have to be disabled
 *
 * @param {number} durationO2 duration of O2 evolution measurement
 * @param {number} durationO2resp duration of O2 respiration measurement
 * @param {number} durationO2relax duration of O2 relaxation phase
 * @param {number} periodO2 period of O2 regular measurements
 * @param {number} periodO2fast period of O2 measurements during O2 rates measurement
 *
 * @return dO2 measurements period
 *
 */

importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);
importPackage(Packages.psi.bioreactor.core.regression);

// Static parameters set by user
var durationO2 = 120; // [s]
var durationO2resp = 120; // [s]
var durationO2relax = 120; // [s]
var rateEvalPeriod = 60; // [s]
var measurementPeriod = 10800; // [s]
var periodO2 = 60; // [s]
var periodO2fast = 5; // [s]
var stirrerValue = [50,100]; // [%] defines normal and fast measurement stirrer intensity
var lightSteps = [ 0.5, 1, 2, 4 ];

var expDuration = Number(theExperiment.getDurationSec());
var measurementTime = Number(theAccessory.context().get("measurementTime", expDuration));
var initialization = Number(theAccessory.context().get("initialization", 0));

if (!initialization) {
   theAccessory.getDataHistory().setCapacity(Math.max(durationO2, durationO2resp));
   theAccessory.context().put("rateO2Evol", []);
   theAccessory.context().put("rateO2Resp", []);
   theAccessory.context().put("initialization", 1);
   theGroup.getAccessory("pwm.stirrer").setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));
   measurementTime=measurementTime+600;
}

function round(number, decimals) {
    return +(Math.round(number + "e+" + decimals) + "e-" + decimals);
}

function controlLights(intensityRed, intensityBlue) {
   light0.setRunningProtoConfig(new ProtoConfig(intensityRed));
   light1.setRunningProtoConfig(new ProtoConfig(intensityBlue));
   //theExperiment.addEvent("Lights changed to " + intensityRed + "/" + intensityBlue + " uE (Red/Blue)");
}

if(expDuration >= measurementTime){
   var changeCounter = Number(theAccessory.context().get("changeCounter", 0));
	var suspended = Number(theAccessory.context().get("suspended", 0));
	var suspendedLights = Number(theAccessory.context().get("suspendedLights", 0));
	var relaxation = Number(theAccessory.context().get("relaxation", 0));
 	var resumeTime = Number(theAccessory.context().get("resumeTime", 0));

 	var light0 = theGroup.getAccessory("actinic-lights.light-Red");
	var light1 = theGroup.getAccessory("actinic-lights.light-Blue");
 	var stirrer = theGroup.getAccessory("pwm.stirrer");
 	var bubbles = theGroup.getAccessory("switches.valve-0");

 	if (!suspended) {
 	   theAccessory.context().put("suspended", 1);
 	   theAccessory.context().put("modeO2EvolResp", 1);
 	   resumeTime = expDuration+durationO2+durationO2resp;
 	   theAccessory.context().put("resumeTime", resumeTime);
 	   theAccessory.context().put("light0Value", light0.getValue());
 	   theAccessory.context().put("light1Value", light1.getValue());

 	   if (!changeCounter) theExperiment.addEvent("PI-curve measurement START");

 	   bubbles.setRunningProtoConfig(ProtoConfig.OFF);
 	   bubbles.suspend(resumeTime);
      stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[1]));
      controlLights(light0.getValue()*lightSteps[changeCounter],light1.getValue());
 	}
   if ((expDuration > (resumeTime-durationO2resp))&&!suspendedLights) {
      theAccessory.context().put("suspendedLights", 1);

      light0.suspend(resumeTime);
      light1.suspend(resumeTime);

      var regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN,rateEvalPeriod/periodO2fast);
      var rateO2Evol = theAccessory.context().get("rateO2Evol",[]);
      rateO2Evol[changeCounter] = round(regCoefLin[1]*600,2);
 	}
 	if ((expDuration > resumeTime)&&!relaxation) {
 	   theAccessory.context().put("modeO2EvolResp", 0);
 	   theAccessory.context().put("relaxation", 1);

      controlLights(theAccessory.context().get("light0Value", light0.getValue()),theAccessory.context().get("light1Value", light1.getValue()));
      light0.resume(expDuration);
      light1.resume(expDuration);
      bubbles.setRunningProtoConfig(ProtoConfig.ON);
      bubbles.resume(expDuration);
      stirrer.setRunningProtoConfig(new ProtoConfig(stirrerValue[0]));

      var regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN,rateEvalPeriod/periodO2fast);
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

         bubbles.setRunningProtoConfig(ProtoConfig.ON);
         bubbles.resume(expDuration);
         theAccessory.context().put("changeCounter", 0);
         theAccessory.context().put("measurementTime", expDuration+measurementPeriod-lightSteps.length*(durationO2+durationO2resp+durationO2relax));
         theExperiment.addEvent("PI-curve DONE. O2 rates are " + rateO2Evol.join(", ") + " and " + rateO2Resp.join(", ") + " units/min");
         rateO2Evol = []; rateO2Resp = [];
      }
 	}
 	result=periodO2fast;
}
else {
   result=periodO2;
}

/*
theAccessory.context().put("modeO2EvolResp", 0);
theAccessory.context().get("changeCounter", 0)
theAccessory.context().put("suspended", 0);
theAccessory.context().put("suspendedLights", 0);
theAccessory.context().put("relaxation", 0);
theAccessory.context().put("resumeTime", 0);
theAccessory.context().remove("measurementTime");
theAccessory.context().put("measurementTime", expDuration+600);
*/
