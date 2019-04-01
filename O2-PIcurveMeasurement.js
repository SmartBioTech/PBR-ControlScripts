var UserDefinedProtocol = {
  oxygenMeasurementInterval: 60,
  oxygenRapidMeasurementInterval: 4,
  oxygenMeasurementDuration: 150,
  respirationMeasurementDuration: 120,
  relaxationPhaseDuration: 0,
  photosynthesisRateCurveEvalFraction: 2 / 3,
  photosynthesisMeasurementPeriod: 3600,
  turbidostatSynchronization: false,
  growthStabilitySynchronization: false,
  stirrerIntensityValues: [50, 75],
  lightStepMultiplierValues: [ 1 ],
  lightStepMultiplierColors: ['red'],
  photosynthesisCurveLightMultiplierValues: [ 1 ]
}

/* globals
  importPackage, java, Packages, theGroup, theAccessory, theExperiment, theLogger, ProtoConfig, ETrendFunction, result: true
*/

/**
 * PI-Curves Measurement
 *
 * @script PI-Curves Measurement - Photosynthesis Efficiency Quantification
 * @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
 * @version 1.2.3
 * @modified 16.3.2019 (JaCe)
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
importPackage(java.util)
importPackage(java.lang)
importPackage(Packages.psi.bioreactor.core.protocol)
importPackage(Packages.psi.bioreactor.core.regression)

// Context parameters
var experimentDuration = theExperiment.getDurationSec()
var measurementTime = theAccessory.context().getInt('measurementTime', experimentDuration)
function round (number, decimals) {
  return +(Math.round(number + 'e+' + decimals) + 'e-' + decimals)
}
function debugLogger (message, status) {
  if ((status === undefined) || (status === 1) || (status === 'on')) {
    theLogger.info('[' + theGroup.getName() + '] ' + message)
  } else {
    return null
  }
}
function controlLights (intensityRed, intensityBlue) {
  light0.setRunningProtoConfig(new ProtoConfig(intensityRed))
  light1.setRunningProtoConfig(new ProtoConfig(intensityBlue))
}
if (!theAccessory.context().getBool('initialization', false)) {
  theAccessory.context().clear()
  if (theGroup.getAccessory('pwm.stirrer').getProtoConfigValue()) {
    theExperiment.addEvent('!!! Disable stirrer protocol.')
  }
  if (theGroup.getAccessory('switches.valve-0').getProtoConfigValue()) {
    theExperiment.addEvent('!!! Disable bubble intr. valve protocol.')
  }
  theAccessory.getDataHistory().setCapacity(Math.max(UserDefinedProtocol.oxygenMeasurementDuration, UserDefinedProtocol.respirationMeasurementDuration))
  theAccessory.context().put('rateO2Evol', [])
  theAccessory.context().put('rateO2EvolR2', [])
  theAccessory.context().put('rateO2Resp', [])
  theAccessory.context().put('rateO2RespR2', [])
  theAccessory.context().put('initialization', true)
  theGroup.getAccessory('pwm.stirrer').setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]))
  theGroup.getAccessory('switches.valve-0').setRunningProtoConfig(ProtoConfig.ON)
  measurementTime = experimentDuration + 600
  theAccessory.context().put('measurementTime', measurementTime)
  var light1String
  if (theGroup.getAccessory('actinic-lights.light-Blue') === null) {
    light1String = 'actinic-lights.light-White'
  } else {
    light1String = 'actinic-lights.light-Blue'
  }
  theAccessory.context().put('light1String', light1String)
  debugLogger('PI-Curves Measurement - Photosynthesis Efficiency Quantification initialization successful.')
}
if (experimentDuration >= measurementTime) {
  var stirrer, bubbles
  var turbidostat = theGroup.getAccessory('pumps.pump-5')
  var dilution = UserDefinedProtocol.turbidostatSynchronization ? turbidostat.context().getInt('modeDilution', 0) : 1
  var stabilized = UserDefinedProtocol.growthStabilitySynchronization ? turbidostat.context().getInt('modeStabilized', 0) : 1
  if (dilution && stabilized) {
    var regCoefLin, rateO2Evol, rateO2Resp, rateO2EvolR2, rateO2RespR2
    var changeCounter = theAccessory.context().getInt('changeCounter', 0)
    var multiplierStep = theAccessory.context().getInt('multiplierStep', 0)
    var resumeTime = theAccessory.context().getInt('resumeTime', 0)
    // PI-curve phase parameters
    var bubblingSuspended = theAccessory.context().getInt('bubblingSuspended', 0)
    var photosynthesis = theAccessory.context().getInt('photosynthesis', 0)
    var respiration = theAccessory.context().getInt('respiration', 0)
    // Accessories inicialization
    stirrer = theGroup.getAccessory('pwm.stirrer')
    bubbles = theGroup.getAccessory('switches.valve-0')
    var light0 = theGroup.getAccessory('actinic-lights.light-Red')
    var light1 = theGroup.getAccessory(theAccessory.context().get('light1String', 'actinic-lights.light-Blue'))
    if (!bubblingSuspended) {
      theAccessory.context().put('bubblingSuspended', 1)
      theAccessory.context().put('modeO2EvolResp', 1)
      resumeTime = experimentDuration + UserDefinedProtocol.oxygenMeasurementDuration + UserDefinedProtocol.respirationMeasurementDuration
      theAccessory.context().put('resumeTime', resumeTime)
      theAccessory.context().put('light0Value', light0.getValue())
      theAccessory.context().put('light1Value', light1.getValue())
      bubbles.setRunningProtoConfig(ProtoConfig.OFF)
      stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[1]))
      controlLights(light0.getValue() * UserDefinedProtocol.lightStepMultiplierValues[changeCounter] * UserDefinedProtocol.photosynthesisCurveLightMultiplierValues[multiplierStep], light1.getValue() * UserDefinedProtocol.lightStepMultiplierValues[changeCounter] * UserDefinedProtocol.photosynthesisCurveLightMultiplierValues[multiplierStep])
    }
    if ((experimentDuration > (resumeTime - UserDefinedProtocol.respirationMeasurementDuration)) && !photosynthesis) {
      theAccessory.context().put('photosynthesis', 1)
      if (UserDefinedProtocol.respirationMeasurementDuration > 0) {
        light0.suspend(resumeTime)
        light1.suspend(resumeTime)
      }
      regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN, Math.ceil(UserDefinedProtocol.photosynthesisRateCurveEvalFraction * UserDefinedProtocol.oxygenMeasurementDuration / UserDefinedProtocol.oxygenRapidMeasurementInterval))
      debugLogger('O2 evol. parameters: ' + regCoefLin.join(', '))
      rateO2Evol = theAccessory.context().get('rateO2Evol', [])
      rateO2EvolR2 = theAccessory.context().get('rateO2EvolR2', [])
      rateO2Evol[changeCounter] = round(regCoefLin[1] * 600, 2)
      rateO2EvolR2[changeCounter] = round(regCoefLin[2], 3)
      // TODO should be function1
    }
    if ((experimentDuration > resumeTime) && !respiration) {
      theAccessory.context().put('respiration', 1)
      bubbles.setRunningProtoConfig(ProtoConfig.ON)
      stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]))
      if (UserDefinedProtocol.respirationMeasurementDuration > 0) {
        light0.resume(experimentDuration)
        light1.resume(experimentDuration)
        controlLights(theAccessory.context().getDouble('light0Value', light0.getValue()), theAccessory.context().getDouble('light1Value', light1.getValue()))
        regCoefLin = theAccessory.getDataHistory().regression(ETrendFunction.LIN, Math.ceil(UserDefinedProtocol.photosynthesisRateCurveEvalFraction * UserDefinedProtocol.respirationMeasurementDuration / UserDefinedProtocol.oxygenRapidMeasurementInterval))
        debugLogger('O2 resp. parameters: ' + regCoefLin.join(', '))
        rateO2Resp = theAccessory.context().get('rateO2Resp', [])
        rateO2RespR2 = theAccessory.context().get('rateO2RespR2', [])
        rateO2Resp[changeCounter] = round(regCoefLin[1] * 600, 2)
        rateO2RespR2[changeCounter] = round(regCoefLin[2], 3)
        // TODO should be function1
      }
    }
    if (experimentDuration > (resumeTime + UserDefinedProtocol.relaxationPhaseDuration)) {
      theAccessory.context().put('bubblingSuspended', 0)
      theAccessory.context().put('photosynthesis', 0)
      theAccessory.context().put('respiration', 0)
      theAccessory.context().put('changeCounter', ++changeCounter)
      if (changeCounter >= UserDefinedProtocol.lightStepMultiplierValues.length) {
        theAccessory.context().put('changeCounter', 0)
        theAccessory.context().put('measurementTime', experimentDuration + UserDefinedProtocol.photosynthesisMeasurementPeriod - UserDefinedProtocol.lightStepMultiplierValues.length * (UserDefinedProtocol.oxygenMeasurementDuration + UserDefinedProtocol.respirationMeasurementDuration + UserDefinedProtocol.relaxationPhaseDuration))
        bubbles.setRunningProtoConfig(ProtoConfig.ON)
        stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]))
        theAccessory.context().put('modeO2EvolResp', 0)
        multiplierStep = multiplierStep < (UserDefinedProtocol.photosynthesisCurveLightMultiplierValues.length - 1) ? ++multiplierStep : 0
        theAccessory.context().put('multiplierStep', multiplierStep)
        rateO2Evol = theAccessory.context().get('rateO2Evol', [])
        rateO2EvolR2 = theAccessory.context().get('rateO2EvolR2', [])
        rateO2Resp = theAccessory.context().get('rateO2Resp', [])
        rateO2RespR2 = theAccessory.context().get('rateO2RespR2', [])
        theAccessory.context().put('rateO2Evol', [])
        theAccessory.context().put('rateO2EvolR2', [])
        theAccessory.context().put('rateO2Resp', [])
        theAccessory.context().put('rateO2RespR2', [])
        theExperiment.addEvent('PI-curve DONE. O2 rates are ' + rateO2Evol.join(', ') + ' and ' + rateO2Resp.join(', ') + ' units/min (R2 ' + rateO2EvolR2.join(', ') + ' and ' + rateO2RespR2.join(', ') + ')')
        debugLogger('PI-curve finished.')
      }
    }
    result = UserDefinedProtocol.oxygenRapidMeasurementInterval
  }
} else if (experimentDuration > theAccessory.context().getInt('checkupTime', 0)) {
  // Here comes a hack that solves an issue with strange periodic behaviour of both the bubble interrupting valve and the stirrer, when they turn off in uncontrolled manner - most likely bug in the software
  stirrer = theGroup.getAccessory('pwm.stirrer')
  bubbles = theGroup.getAccessory('switches.valve-0')
  theAccessory.context().put('checkupTime', experimentDuration + 10)
  bubbles.setRunningProtoConfig(ProtoConfig.ON)
  stirrer.setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.stirrerIntensityValues[0]))
  result = UserDefinedProtocol.oxygenMeasurementInterval
} else {
  result = UserDefinedProtocol.oxygenMeasurementInterval
}
