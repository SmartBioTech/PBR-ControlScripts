/**
 * OD regulator using external/additional pump
 *
 * @script Peristaltic Pump - Growth Optimizer
 * @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
 * @version 1.9
 * @modified 20.2.2017 (JaCe)
 *
 * @notes For proper function of the script "OD Regulator" protocol has to be disabled as well as appropriate
 *        controlled accessory protocol (i.e. Lights, Thermoregulation, GMS, Stirrer).
 *        The pump has to be set to ID 5 to allow compatibility with other scripts
 *
 * @param {number} minOD Min OD/lower bound for OD regulator/turbidostat
 * @param {number} maxOD Max OD/upper bound for OD regulator/turbidostat
 * @param {number} typeOD OD sensor used for turbidostat control
 * @param {number} intervalOD Defines how often is OD measured
 * @param {number} pumpSpeed Nominal pump speed used for dilution of the suspension
 * @param {number} slowDownRange Lower range where the pump slows down
 * @param {number} slowDownFact Slow down factor for the pump
 * @param {number} analyzedSteps Number of steps to be analyzed for stability check
 * @param {number} optimalStability Max allowed percents of 95% Confidence Interval
 * @param {number} optimalTrend Max growth speed trend in time
 * @param {numebr} stabilizationTimeMin Minimal duration of each characterization step
 * @param {numebr} growthCurveStablePart Fraction of the last part of the groth data used for doubling time determination
 * @param {numebr} controlledParameter Supported parameters to control are "none", "temperature", "lights", "GMS", "stirrer"
 * @param {numebr} parameterSteps Values range of the parameter controlled
 *
 * @return Flow of external/additional pump
 *
 */

importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);
importPackage(Packages.psi.bioreactor.core.regression);

// Static parameters set by user
// -turbidostat
var maxOD = 0.52; // upper bound of OD regulator
var minOD = 0.48; // lower bound of OD regulator
var typeOD = 680; // [nm] OD sensor user for turbidostat control
var intervalOD = 60; // [s] how often is measured OD
// -peristaltic pump
var pumpSpeed = 100; // [%] speed of the peristaltic pump
var slowDownRange = 25; // [%] lower range where the pump slows down
var slowDownFact = 50; // [%] slow down factor
// -optimizer stability
var analyzedSteps = 6; // number of steps to be analyzed for stability check
var optimalStability = 3.0; // [%] max percents of 95% confidence interval
var optimalTrend = 1.0; // [%] max trend of change in time
var stabilizationTimeMin = 12; // [h] minimal time required for stability check
var growthCurveStablePart = 2/3; // fraction of the last part of the groth data used for doubling time determination
// -optimizer parameters
var controlledParameter = "none"; // supported parameters to control are none, temperature, lights, GMS, stirrer
var parameterSteps = [[ 1100,25 ],[ 440,25 ],[ 55,25 ]]; // values range of the parameter controlled
/*
temperature = [ 28, 32, 34, 30, 26, 22 ]; // [oC]
lights = [[ 55, 25 ],[ 110, 25 ],[ 220, 25 ],[ 440, 25 ],[ 880,25 ]]; // [uE]
GMS = [[ 195.88, 5.873 ],[ 195.88, 12.478 ],[ 185.30, 18.257 ],[ 185.30,25.274 ]]; // [ml/min]
stirrer = [ 30, 50, 65, 80, 95 ]; // [%] !!! works only with SW version 0.7.14 and later
*/

function resetContext() {
   theAccessory.context().remove("stepCounter");
   theAccessory.context().remove("expDuration");
   theAccessory.context().remove("stepDuration");
   theAccessory.context().remove("stepDoublingTime");
   theAccessory.context().remove("changeCounter");
   theAccessory.context().remove("lastPumpStop");
   theAccessory.context().remove("lastOD");
   theAccessory.context().remove("stabilizedTime");
   theAccessory.context().remove("controlledParameterText");
   theAccessory.context().remove("dilution");
}

function round(number, decimals) {
   return +(Math.round(number + "e+" + decimals) + "e-" + decimals);
}

// Control accessory functions
function controlParameter(parameter, values) {
   if (parameter === undefined) {
      return;
   }
   if (values === undefined) {
      return;
   }
   switch(parameter) {
      case "lights":
         var light0 = theGroup.getAccessory("actinic-lights.light-Red");
         var light1 = theGroup.getAccessory("actinic-lights.light-Blue");
         var unit = " uE";
         light0.setRunningProtoConfig(new ProtoConfig(Number(values[0]))); //Red
         light1.setRunningProtoConfig(new ProtoConfig(Number(values[1]))); //Blue
         break;
      case "temperature":
         var thermoreg = theGroup.getAccessory("thermo.thermo-reg");
         var unit = String.fromCharCode(176)+"C";
         thermoreg.setRunningProtoConfig(new ProtoConfig(Number(values)));
         break;
      case "GMS":
         var valve0 = theGroup.getAccessory("gas-mixer.valve-0-reg"); // CO2
         var valve1 = theGroup.getAccessory("gas-mixer.valve-1-reg"); // Air
         var unit = " ml/min";
         valve0.setRunningProtoConfig(new ProtoConfig(Number(values[0])));
         valve0.setRunningProtoConfig(new ProtoConfig(Number(values[1])));
         theExperiment.addEvent("Gas Mixing set to Air flow " + round(flowAir,2) + " ml/min and CO2 flow " + round(flowCO2, 2) + " ml/min (" + round((flowCO2/(flowCO2+flowAir)+400/1e6)*100, 1) + "%)");
         break;
      case "stirrer":
         var stirrer = theGroup.getAccessory("pwm.stirrer");
         var unit = "%";
         stirrer.setRunningProtoConfig(new ProtoConfig(Number(values)));
         break;
      default:
         return;
   }
   theAccessory.context().put("controlledParameterText", parameter + " " + (Array.isArray(values) ? values.join(" and ") : values) + unit);
   theExperiment.addEvent(parameter[0].toUpperCase() + parameter.slice(1) + " changed to " + (Array.isArray(values) ? values.join(" and ") : values) + unit);
}

// Control the pump
function controlPump() {
   switch (typeOD) {
      case 680:
         odSensorString = "od-sensors.od-680";
         break;
      case 720:
         odSensorString = "od-sensors.od-720";
         break;
      case 735:
         odSensorString = "od-sensors.od-735";
         break;
      default:
         odSensorString = "od-sensors.od-680";
   }
   
   var odSensor = theGroup.getAccessory(odSensorString);
   if (odSensor === null || odSensor.hasError()) {
      return null; // pump not influenced
   }
   
   var odVal = odSensor.getValue();
   var lastOD = Number(theAccessory.context().get("lastOD", 0));
   var odNoise = Number(theAccessory.context().get("odNoise", 1));

   // Check for OD noise/overshots and primitive OD averaging
   if (!Double.isNaN(odVal) && (round(odVal,3) != round(lastOD,3))) {
      if (odNoise) {
         theAccessory.context().put("odNoise", 0);
         theAccessory.context().put("lastOD", odVal);
         return null;
      }
      if (pumpSet || (Math.abs(1-odVal/lastOD) < 0.04)) {
         odVal = (odVal + lastOD) / 2;
         theAccessory.context().put("lastOD", odVal);
      }
      else {
         theAccessory.context().put("odNoise", 1);
         theAccessory.context().put("lastOD", odVal);
         return null;
      }
   }
   else return null;

   // Start step growth rate evaluation
   if (odVal > maxOD && !pumpSet) {
      theAccessory.context().put("modeDilution", 1);
      var stepCounter = Number(theAccessory.context().get("stepCounter", 0));
      var expDuration = theAccessory.context().get("expDuration", 0);
      var stepDuration = theAccessory.context().get("stepDuration", 0);
      var stepDoublingTime = theAccessory.context().get("stepDoublingTime", 0);
      var stabilizedTime = theAccessory.context().get("stabilizedTime", 0);
      if (expDuration == 0) {
         stepCounter=0;
         expDuration=[]; stepDuration=[]; stepDoublingTime=[];
         theAccessory.context().put("expDuration", expDuration);
         theAccessory.context().put("stepDuration", stepDuration);
         theAccessory.context().put("stepDoublingTime", stepDoublingTime);
         theAccessory.context().put("stabilizedTime", Number(theExperiment.getDurationSec()) + stabilizationTimeMin * 3600);
         odSensor.getDataHistory().setCapacity(600);
      }
      expDuration[stepCounter] = Number(theExperiment.getDurationSec());
      stepDuration[stepCounter] = expDuration[stepCounter]-Number(theAccessory.context().get("lastPumpStop", expDuration[stepCounter]));
      if (stepDuration[stepCounter] > 0) {
         var DHCapacity = (Math.floor(stepDuration[stepCounter]/intervalOD)-3)>0 ? (Math.floor(stepDuration[stepCounter]/intervalOD)-3) : 60;
         var regCoefExp = odSensor.getDataHistory().regression(ETrendFunction.EXP,Math.ceil(DHCapacity*growthCurveStablePart));
         stepDoublingTime[stepCounter] = Number(1/(regCoefExp[1]*3600*10))*Math.LN2;
         theExperiment.addEvent("External pump started, doubling time of the step was " + round(stepDoublingTime[stepCounter],2) + " h and step no. is " + (++stepCounter));
         theAccessory.context().put("stepCounter", stepCounter);
         if (stepCounter >= analyzedSteps) {
            var stepDoublingTimeAvg = 0; var stepDoublingTimeSD = 0; var stepDoublingTimeIC95 = 0; var stepTrend = 0; var sumXY = 0; var sumX = 0; var sumY = 0; var sumX2 = 0; var sumY2 = 0;

            // Average of steps doubling time
            for (var i = (stepCounter - 1); i >= (stepCounter - analyzedSteps); i--) {
               stepDoublingTimeAvg += Number(stepDoublingTime[i]);
            }
            stepDoublingTimeAvg /= analyzedSteps;

            // IC95 of steps doubling time
            for (i = (stepCounter - 1); i >= (stepCounter - analyzedSteps); i--) {
               stepDoublingTimeSD += Math.pow(stepDoublingTime[i] - stepDoublingTimeAvg,2);
            }
            stepDoublingTimeSD = Math.sqrt(stepDoublingTimeSD/analyzedSteps);
            stepDoublingTimeIC95 = stepDoublingTimeSD/Math.sqrt(analyzedSteps) * 1.96;

            // Trend of steps doubling time
            for (i = (stepCounter - 1); i >= (stepCounter - analyzedSteps); i--) {
               sumX += Number(expDuration[i]);
               sumX2 += Math.pow(expDuration[i],2);
               sumY += Number(stepDoublingTime[i]);
               sumY2 += Math.pow(stepDoublingTime[i],2);
               sumXY += Number(expDuration[i]) * Number(stepDoublingTime[i]);
            }
            stepTrend = (analyzedSteps * sumXY - sumX * sumY) / (analyzedSteps * sumX2 - Math.pow(sumX,2)) * 3600;
            theExperiment.addEvent("Steps doubling time Avg: " + round(stepDoublingTimeAvg,2) + " h, IC95 " + round(stepDoublingTimeIC95,2) + " (" + round(stepDoublingTimeIC95/stepDoublingTimeAvg*100,1) + "%) with " + round(stepTrend,2) + " h/h trend (" + round(stepTrend/stepDoublingTimeAvg*100,1) + "%)");

            // Growth stability test and parameters control
            if (stepDoublingTimeIC95 / stepDoublingTimeAvg <= optimalStability / 100 && Math.abs(stepTrend/stepDoublingTimeAvg) <= optimalTrend / 100 && stabilizedTime <= Number(theExperiment.getDurationSec())) {
               var changeCounter = Number(theAccessory.context().get("changeCounter", 0));
               theExperiment.addEvent("*** Stabilized doubling time TD (" + theAccessory.context().get("controlledParameterText", 0) + ") is " + round(stepDoublingTimeAvg,2) + String.fromCharCode(177) + round(stepDoublingTimeIC95,2) + " h (IC95)");
               if (parameterSteps.length > 1) {
                  if (changeCounter < parameterSteps.length) {
                     controlParameter(controlledParameter, parameterSteps[changeCounter]);
                     theAccessory.context().put("changeCounter", ++changeCounter);
                  }
                  else if (changeCounter < (2 * parameterSteps.length - 1)) {
                     controlParameter(controlledParameter, parameterSteps[2*lightRedSteps.length - 1 - changeCounter]);
                     theAccessory.context().put("changeCounter", ++changeCounter);
                  }
                  else {
                     theAccessory.context().put("changeCounter", 0);
                  }
                  theAccessory.context().remove("stepCounter");
                  theAccessory.context().remove("expDuration");
                  theAccessory.context().remove("stepDoublingTime");
                  theAccessory.context().remove("stabilizedTime");
               }
            }
         }
      }
      else theExperiment.addEvent("External pump started");
      return theAccessory.getMax(); // fast
   }
   else if (odVal <= minOD && pumpSet) {
      theAccessory.context().put("modeDilution", 0);
      theAccessory.context().put("lastPumpStop", theExperiment.getDurationSec());
      theExperiment.addEvent("External pump stopped");
      return ProtoConfig.OFF; // pump off
   }
   else if (odVal <= (minOD+(maxOD-minOD)*slowDownRange/100) && pumpSet) {
      return theAccessory.getMax()*slowDownFact/100; // slow down the pump
   }
   else return null; //pump not influenced
}

// Set the result
var pumpSet = !Double.isNaN(theAccessory.getValue());
// Check whether O2 evolution and respiration measurement mode is active
var modeO2EvolResp = Number(theGroup.getAccessory("probes.o2").context().get("modeO2EvolResp", 0));
if (modeO2EvolResp) {
   if (pumpSet) {
      result = theAccessory.getMin();
      theAccessory.context().put("pumpSuspended", 1);
   }
}
else if (Number(theAccessory.context().get("pumpSuspended", 0))) {
   theAccessory.context().put("pumpSuspended", 0);
   result = theAccessory.getMax();
}
else result = controlPump();
