var UserDefinedProtocol = {
  // -turbidostat settings
  turbidostatODMin: 0.4,
  turbidostatODMax: 0.425,
  turbidostatODType: 720,
  ODReadoutInterval: 60,
  // -optimizer parameters
  controlledParameter: 'temperature',
  controlledParameterSteps: [ 25 ],
  particleSwarmOptimizer: true,
  // -optimizer stability check
  growthStatistics: true,
  regressionODType: 680,
  regressionCoDMin: 75,
  stabilizationTimeMin: 12,
  stabilizationTimeMax: 36,
  growthRateEvalFrac: 2 / 3,
  analyzedSteps: 6,
  growthTrendMax: 1.5,
  intervalOfConfidenceMax: 3.5,
  // -peristaltic pump settings
  peristalticPumpID: 5,
  peristalticPumpSpeed: 100,
  peristalticPumpSlowDownRange: 25,
  peristalticPumpSlowDownFactor: 75,
  // -advanced options
  growthRateEvalDelay: 420,
  groupGMS: theGroup
}

/* global
  importPackage, java, Packages, theServer, theGroup, theAccessory, theExperiment, theLogger, ProtoConfig, ETrendFunction, result: true
*/

/**
 * OD Regulator Using External/Additional Pump
 *
 * @script Peristaltic Pump - Automatic Growth Characterization
 * @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
 * @copyright Jan Červený 2020(c)
 * @license MIT
 * @version 3.3.3
 * @modified 20.8.2020 (JaCe)
 *
 * @notes For proper functionality of the script "OD Regulator" protocol has to be disabled as well as chosen
 *        controlled accessory protocols (i.e. Lights, Thermoregulation, GMS, Stirrer).
 *        The controlled pump has to be set to ID 5 to allow compatibility with other scripts
 *
 * -turbidostat settings
 * @param {number} turbidostatODMin [AU] - Minimum OD/lower bound for OD regulator/turbidostat
 * @param {number} turbidostatODMax [AU] - Maximum OD/upper bound for OD regulator/turbidostat
 * @param {number} turbidostatODType [680/720/735] - OD sensor used for turbidostat control
 * @param {number} ODReadoutInterval [s] - Defines how often is the OD measured
 * -optimizer parameters
 * @param {string} controlledParameter ['none'/'temperature'/'lights'/'GMS'/'stirrer'/'ODRange'] - Supported parameters to control by the script
 * @param {array} controlledParameterSteps - List of values for the controlled parameter. Examples:
 *                temperature = [ 28, 32, 34, 30, 26, 22 ]; // [oC]
 *                lights = [[ 55, 25 ],[ 110, 25 ],[ 220, 25 ],[ 440, 25 ],[ 880,25 ]]; // [uE]
 *                GMS = [[ 195.88, 5.873 ],[ 195.88, 12.478 ],[ 185.30, 18.257 ],[ 185.30,25.274 ]]; // [ml/min]
 *                stirrer = [ 30, 50, 65, 80, 95 ]; // [%] !!! works only with SW version 0.7.14 and later
 *                ODRange = [[0.4, 0.425], [0.2, 0.215], [0.1, 0.113]]; // [AU]
 * -optimizer stability check
 * @param {number} growthStatistics [true/false] - Enable or disable calculation of growth statistics. Note that the doubling time (Dt) calculation also includes information about the fit coefficient of determination (CoD in %), known as R-squared
 * @param {number} regressionODType [680/720/735] - OD sensor used for doubling time determination
 * @param {number} regressionCoDMin [%] - Minimum accpeted coefficient of determination for staility check evaluation (values below are ignored)
 * @param {number} stabilizationTimeMin [h] - Minimum duration of each characterization step
 * @param {number} stabilizationTimeMax [h] - Maximum duration of each characterization step
 * @param {number} growthRateEvalFrac [0-1] - Defines whether to use particular fraction of the data points for doubling time determination.
 * @param {number} analyzedSteps [-] - Number of steps to be analyzed for stability check
 * @param {number} growthTrendMax [%] - Maximum growth speed trend in time
 * @param {number} intervalOfConfidenceMax [%] - Maximum allowed percents of 95% Confidence Interval
 * -peristaltic pump settings
 * @param {number} peristalticPumpID [3-7] - Defines peristaltic pump ID set to the pump that is used for fresh media supply (quasi-continuous mode)
 * @param {number} peristalticPumpSpeed [%] - Nominal pump speed used for dilution of the suspension
 * @param {number} peristalticPumpSlowDownRange [%] - Lower range where the pump slows down
 * @param {number} peristalticPumpSlowDownFactor [%] - Slow down factor for the pump
 * -advanced options
 * @param {number} growthRateEvalDelay [s] - Time after dilution where data for doubling time determination are ignored. By default growthRateEvalFrac, i.e. only limited fraction of the data points is used for calculations.
 *                 This is to prevent influence of post dilution effect on doubling time evaluation. If 0 or false, growthRateEvalDelay is used instead. Note that to completely disable data limitation you need to set both growthRateEvalFrac and growthRateEvalDelay to 0.
 * @param {string} groupGMS - Identifies the group that contains Gas Mixing System. System value - do not change unless sure what you are doing!
 *
 * @return Flow of external/additional pump
 *
 */

// Libraries import
importPackage(java.util)
importPackage(java.lang)
importPackage(Packages.psi.bioreactor.core.protocol)
importPackage(Packages.psi.bioreactor.core.regression)

// Inicialization of the control script
if (!theAccessory.context().getInt('initiated', 0)) {
  try {
    theAccessory.context().clear()
    theAccessory.context().put('stabilizedTimeMax', theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMax * 3600)
    var light1String
    if (theGroup.getAccessory('actinic-lights.light-Blue') === null) {
      light1String = 'actinic-lights.light-White'
    } else {
      light1String = 'actinic-lights.light-Blue'
    }
    theAccessory.context().put('light1String', light1String)
    switch (UserDefinedProtocol.controlledParameter) {
      case 'lights':
        if (theGroup.getAccessory('actinic-lights.light-Red').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable RED LIGHT protocol')
        }
        if (light1String === 'actinic-lights.light-Blue') {
          if (theGroup.getAccessory('actinic-lights.light-Blue').getProtoConfigValue()) {
            theExperiment.addEvent('!!! Disable BLUE LIGHT protocol')
          }
        } else if (theGroup.getAccessory('actinic-lights.light-White').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable WHITE LIGHT protocol')
        }
        break
      case 'temperature':
        if (theGroup.getAccessory('thermo.thermo-reg').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable THERMOREGULATOR protocol')
        }
        break
      case 'GMS':
        if (UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-0-reg').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable GMS CO2 protocol')
        }
        if (UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-1-reg').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable GMS Air/N2 protocol')
        }
        break
      case 'stirrer':
        if (theGroup.getAccessory('pwm.stirrer').getProtoConfigValue()) {
          theExperiment.addEvent('!!! Disable STIRRER protocol')
        }
        break
      case 'ODRange':
        break
      case 'none':
        break
      default:
        theExperiment.addEvent('!!! Unknown parameter set for control - check controlledParameter setting')
    }
    if (UserDefinedProtocol.turbidostatODType === 680 || UserDefinedProtocol.regressionODType === 680) {
      if (Number(theGroup.getAccessory('od-sensors.od-680').getProtoConfigValue()) !== UserDefinedProtocol.ODReadoutInterval) {
        theExperiment.addEvent('!!! OD680 measurement protocol is set to wrong interval. Please correct it !!!')
      }
    } 
    if (UserDefinedProtocol.turbidostatODType === 720 || UserDefinedProtocol.regressionODType === 720 || UserDefinedProtocol.turbidostatODType === 735 || UserDefinedProtocol.regressionODType === 735 ) {
      var OD7XYString
      if (theGroup.getAccessory('od-sensors.od-720') === null) {
        OD7XYString = 'od-sensors.od-735'
        if (Number(theGroup.getAccessory(OD7XYString).getProtoConfigValue()) !== UserDefinedProtocol.ODReadoutInterval) {
          theExperiment.addEvent('!!! OD735 measurement protocol is set to wrong interval. Please correct it !!!')
        }
      } else {
        OD7XYString = 'od-sensors.od-720'
        if (Number(theGroup.getAccessory(OD7XYString).getProtoConfigValue()) !== UserDefinedProtocol.ODReadoutInterval) {
          theExperiment.addEvent('!!! OD720 measurement protocol is set to wrong interval. Please correct it !!!')
        }
      }
      theAccessory.context().put('OD7XYString', OD7XYString)
    }
    controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[0])
    theAccessory.context().put('initiated', 1)
    debugLogger('Peristaltic Pump - Growth Optimizer initialization successful.')
  } catch (error) {
    debugLogger('Initialization ERROR. ' + error.name + ' : ' + error.message)
  }
}

// Set the pump
try {
  var pumpState = !isNaN(theAccessory.getValue())
  // Check whether O2 evolution and respiration measurement mode is active
  if (theGroup.getAccessory('probes.o2').context().getInt('modeO2EvolResp', 0)) {
    if (pumpState) {
      theAccessory.context().put('pumpSuspended', 1)
      result = theAccessory.getMin()
    }
  } else if (theAccessory.context().getInt('pumpSuspended', 0)) {
    theAccessory.context().put('pumpSuspended', 0)
    result = theAccessory.getMax() * UserDefinedProtocol.peristalticPumpSpeed / 100
  } else {
    result = controlPump()
  }
} catch (error) {
  debugLogger('The pump activity ERROR. ' + error.name + ' : ' + error.message)
}
/**
  function setODSensorString (ODType) {
    // Set ODtype = [turbidostat, regression]
    switch (UserDefinedProtocol[ODType+'ODType']) {
    case 680:
      odString = 'od-sensors.od-680'
      break
    case 720:
      odString = 'od-sensors.od-720'
      break
    case 735:
      odString = 'od-sensors.od-735'
      break
    default:
      odString = 'od-sensors.od-680'
    }
    switch (ODType) {
    case 'turbidostat':
      text = 'Sensor'
      break
    case 'regression':
      text = 'SensorRegression'
      break
    default:
      text = 'Sensor'
    }
    eval('od' + text + 'String = ' + odString)
    debugLogger('OD sensor string set')
  }
  */

// Common functions
function round (number, decimals) {
  // Rounding specific decimal point number
  return +(Math.round(number + 'e+' + decimals) + 'e-' + decimals)
}
function getRandomOnInterval(min, max) {
  return Math.random() * (max - min) + min;
}
function debugLogger (message, status) {
  if ((status === undefined) || (status === 1) || (status === 'on')) {
    theLogger.info('[' + theGroup.getName() + '] ' + message)
  } else {
    return null
  }
}
function getSumArrReduce(total, num) {
  return total + num;
}
function controlParameter (parameter, values) {
  // Control accessory functions
  if ((parameter === undefined) || (parameter === 'none') || (values === undefined)) {
    return null
  }
  var unit
  switch (parameter) {
    case 'lights':
      var light0 = theGroup.getAccessory('actinic-lights.light-Red')
      var light1 = theGroup.getAccessory(theAccessory.context().get('light1String', 'actinic-lights.light-Blue'))
      unit = ' uE'
      light0.setRunningProtoConfig(new ProtoConfig(Number(values[0]))) // Red
      light1.setRunningProtoConfig(new ProtoConfig(Number(values[1]))) // Blue || White
      debugLogger('Lights changed. Channel 0 set to ' + round(values[0], 0) + unit + ' and channel 1 set to ' + round(values[1], 0) + unit)
      break
    case 'temperature':
      var thermoreg = theGroup.getAccessory('thermo.thermo-reg')
      unit = ' ' + String.fromCharCode(176) + 'C'
      thermoreg.setRunningProtoConfig(new ProtoConfig(Number(values)))
      debugLogger('Temperature changed. Thermoregulator set to ' + round(values, 2) + unit)
      break
    case 'GMS':
      var valve0 = UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-0-reg') // CO2
      var valve1 = UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-1-reg') // Air
      unit = ' ml/min'
      valve0.setRunningProtoConfig(new ProtoConfig(Number(values[0])))
      valve1.setRunningProtoConfig(new ProtoConfig(Number(values[1])))
      var flowAir = valve0.getProtoConfigValue()
      var flowCO2 = valve1.getProtoConfigValue()
      debugLogger('GMS settings changed. Gas Mixing set to Air flow ' + round(flowAir, 0) + unit + ' and CO2 flow ' + round(flowCO2, 1) + unit + ' (' + round((flowCO2 / (flowCO2 + flowAir) + 395 / 1e6) * 100, 1) + '%)')
      break
    case 'stirrer':
      var stirrer = theGroup.getAccessory('pwm.stirrer')
      unit = '%'
      stirrer.setRunningProtoConfig(new ProtoConfig(Number(values)))
      debugLogger('Stirrer changed. Stirrer set to ' + round(values, 0) + unit)
      break
    case 'ODRange':
      theAccessory.context().put('odMinModifier', Number(values[0]) / UserDefinedProtocol.turbidostatODMin)
      theAccessory.context().put('odMaxModifier', Number(values[1]) / UserDefinedProtocol.turbidostatODMax)
      unit = ' AU'
      debugLogger('Turbidostat settings changed. OD range set to ' + round(values[0], 3) + ' - ' + round(values[1], 3) + unit)
      break
    default:
      return null
  }
  theAccessory.context().put('controlledParameterText', parameter + ' ' + (Array.isArray(values) ? values.join(' and ') : values) + unit)
  theExperiment.addEvent(parameter[0].toUpperCase() + parameter.slice(1) + ' changed to ' + (Array.isArray(values) ? values.join(' and ') : values) + unit)
}
// Control activity of the peristaltic pump 
function controlPump () {
  // Following code ready for functional implementation
  // setODSensorString("turbidostat");
  // setODSensorString("regression");
  var odSensorString, odSensorRegressionString
  switch (UserDefinedProtocol.turbidostatODType) {
    case 680:
      odSensorString = 'od-sensors.od-680'
      break
    default:
      odSensorString = theAccessory.context().get('OD7XYString', 'od-sensors.od-720')
  }
  switch (UserDefinedProtocol.regressionODType) {
    case 680:
      odSensorRegressionString = 'od-sensors.od-680'
      break
    default:
      odSensorRegressionString = theAccessory.context().get('RegOD7XYString', 'od-sensors.od-720')
  }
  var odSensor = theGroup.getAccessory(odSensorString)
  var odSensorRegression = theGroup.getAccessory(odSensorRegressionString)
  if (odSensor === null || odSensor.hasError()) {
    return null // pump not influenced
  }
  var odValue = odSensor.getValue()
  var odLast = theAccessory.context().getDouble('odLast', 0.0)
  var odNoise = theAccessory.context().getInt('odNoise', 1)
  var odMinModifier = theAccessory.context().getDouble('odMinModifier', 1.0)
  var odMaxModifier = theAccessory.context().getDouble('odMaxModifier', 1.0)
  var changeCounter = theAccessory.context().getInt('changeCounter', 0)
  var stepCounter = theAccessory.context().getInt('stepCounter', 0)
  // Check for OD noise/overshots and primitive OD averaging
  if (!isNaN(odValue) && (round(odValue, 3) !== round(odLast, 3))) {
    if (odNoise) {
      theAccessory.context().put('odNoise', 0)
      theAccessory.context().put('odLast', odValue)
      return null
    }
    if (pumpState || (Math.abs(1 - odValue / odLast) < 0.04)) {
      odValue = (odValue + odLast) / 2
      theAccessory.context().put('odLast', odValue)
    } else {
      theAccessory.context().put('odNoise', 1)
      theAccessory.context().put('odLast', odValue)
      return null
    }
  } else {
    return null
  }
  // Check for reversed OD range
  if (UserDefinedProtocol.turbidostatODMin > UserDefinedProtocol.turbidostatODMax) {
    UserDefinedProtocol.turbidostatODMin = (UserDefinedProtocol.turbidostatODMax - UserDefinedProtocol.turbidostatODMin) + (UserDefinedProtocol.turbidostatODMax = UserDefinedProtocol.turbidostatODMin)
    debugLogger('OD range reversed.', 0)
  }
  if (theAccessory.context().getInt('stabilizedTimeMax', 0) <= Number(theExperiment.getDurationSec()) && (stepCounter !== 0)) {
    theAccessory.context().put('stabilizedTimeMax', theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMax * 3600)
    if (UserDefinedProtocol.particleSwarmOptimizer) {
      var stepDoublingTime = theAccessory.context().get('stepDoublingTime', [ 999.9 ])
      var len = stepDoublingTime.length
      stepDoublingTime = len > 2 ? stepDoublingTime.slice(1, len).reduce(getSumArrReduce, 0) / (len - 1) : stepDoublingTime[len - 1]
      controlParameter(UserDefinedProtocol.controlledParameter, PSO(stepDoublingTime))
      theAccessory.context().remove('stepCounter')
      theAccessory.context().remove('expDuration')
      theAccessory.context().remove('stepDoublingTime')
      theAccessory.context().remove('stabilizedTime')
    } else if (UserDefinedProtocol.controlledParameterSteps.length > 1) {
      if (changeCounter < (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
        controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[++changeCounter])
        theAccessory.context().put('changeCounter', changeCounter)
      } else if (changeCounter < 2 * (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
        controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[2 * (UserDefinedProtocol.controlledParameterSteps.length - 1) - (++changeCounter)])
        theAccessory.context().put('changeCounter', changeCounter)
      } else {
        controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[1])
        theAccessory.context().put('changeCounter', 1)
      }
      theAccessory.context().remove('stepCounter')
      theAccessory.context().remove('expDuration')
      theAccessory.context().remove('stepDoublingTime')
      theAccessory.context().remove('stabilizedTime')
    }  
  }
  // Start step growth rate evaluation
  if (((odValue > (UserDefinedProtocol.turbidostatODMax * odMaxModifier)) && !pumpState)) {
    theAccessory.context().put('modeDilution', 1)
    theAccessory.context().put('modeStabilized', 0)
    // var stepCounter = theAccessory.context().getInt('stepCounter', 0)
    var expDuration = theAccessory.context().get('expDuration', 0.0)
    var stepDuration = theAccessory.context().get('stepDuration', 0.0)
    var stepDoublingTime = theAccessory.context().get('stepDoublingTime', [ 999.9 ])
    var stabilizedTime = theAccessory.context().getInt('stabilizedTime', 0)
    // var stabilizedTimeMax = theAccessory.context().getInt('stabilizedTimeMax', 0)
    if (!Array.isArray(expDuration)) {
      stepCounter = 0
      expDuration = []; stepDuration = []; stepDoublingTime = []
      theAccessory.context().put('expDuration', expDuration)
      theAccessory.context().put('stepDuration', stepDuration)
      theAccessory.context().put('stepDoublingTime', stepDoublingTime)
      theAccessory.context().put('stabilizedTime', theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMin * 3600)
      theAccessory.context().put('stabilizedTimeMax', theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMax * 3600)
      odSensorRegression.getDataHistory().setCapacity(600)
    }
    expDuration[stepCounter] = theExperiment.getDurationSec()
    stepDuration[stepCounter] = expDuration[stepCounter] - theAccessory.context().getInt('lastPumpStop', expDuration[stepCounter])
    if ((stepDuration[stepCounter] > 0) && UserDefinedProtocol.growthStatistics) {
      var DHCapacity = (Math.floor(stepDuration[stepCounter] / UserDefinedProtocol.ODReadoutInterval) - 3) > 0 ? (Math.floor(stepDuration[stepCounter] / UserDefinedProtocol.ODReadoutInterval) - 3) : 60
      var regCoefExp = odSensorRegression.getDataHistory().regression(ETrendFunction.EXP, Math.ceil(DHCapacity - (UserDefinedProtocol.growthRateEvalFrac ? DHCapacity * (UserDefinedProtocol.growthRateEvalFrac / 100) : UserDefinedProtocol.growthRateEvalDelay / UserDefinedProtocol.ODReadoutInterval)))
      debugLogger('Growth parameters: A=' + regCoefExp[0] +', B=' + regCoefExp[1] + ', R2=' + regCoefExp[2])
      if (Number(regCoefExp[2]) >= UserDefinedProtocol.regressionCoDMin / 100) {
        stepDoublingTime[stepCounter] = (1 / (Number(regCoefExp[1]) * 3600 * 10)) * Math.LN2
        theAccessory.context().put('stepCounter', ++stepCounter)
      }
      theExperiment.addEvent('Doubling time of the step was ' + round((1 / (Number(regCoefExp[1]) * 3600 * 10)) * Math.LN2, 2) + ' h (CoD ' + round(Number(regCoefExp[2]) * 100, 1) + '%)')
      if (stepCounter >= UserDefinedProtocol.analyzedSteps) {
        var stepDoublingTimeAvg = 0
        var stepDoublingTimeSD = 0
        var stepDoublingTimeIC95 = 0
        var stepTrend = 0
        // var stepCoD = 0
        var sumXY = 0
        var sumX = 0
        var sumY = 0
        var sumX2 = 0
        // var sumY2 = 0
        // Average of steps doubling time
        for (var i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps); i--) {
          stepDoublingTimeAvg += Number(stepDoublingTime[i])
        }
        stepDoublingTimeAvg /= UserDefinedProtocol.analyzedSteps
        // IC95 of steps doubling time
        for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps); i--) {
          stepDoublingTimeSD += Math.pow(stepDoublingTime[i] - stepDoublingTimeAvg, 2)
        }
        stepDoublingTimeSD = Math.sqrt(stepDoublingTimeSD / UserDefinedProtocol.analyzedSteps)
        stepDoublingTimeIC95 = stepDoublingTimeSD / Math.sqrt(UserDefinedProtocol.analyzedSteps) * 1.96
        // Trend of steps doubling time
        for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps); i--) {
          sumX += Number(expDuration[i])
          sumX2 += Math.pow(expDuration[i], 2)
          sumY += Number(stepDoublingTime[i])
          // sumY2 += Math.pow(stepDoublingTime[i], 2)
          sumXY += Number(expDuration[i]) * Number(stepDoublingTime[i])
        }
        stepTrend = (UserDefinedProtocol.analyzedSteps * sumXY - sumX * sumY) / (UserDefinedProtocol.analyzedSteps * sumX2 - Math.pow(sumX, 2)) * 3600
        // stepCoD = (UserDefinedProtocol.analyzedSteps * sumXY - sumX * sumY) / (Math.sqrt((UserDefinedProtocol.analyzedSteps * sumX2 - Math.pow(sumX, 2)) * (UserDefinedProtocol.analyzedSteps * sumY2 - Math.pow(sumY, 2))))
        theExperiment.addEvent('Steps doubling time Avg: ' + round(stepDoublingTimeAvg, 2) + ' h, IC95 ' + round(stepDoublingTimeIC95, 2) + ' h (' + round(stepDoublingTimeIC95 / stepDoublingTimeAvg * 100, 1) + '%) with ' + round(stepTrend, 2) + ' h/h trend (' + round(stepTrend / stepDoublingTimeAvg * 100, 1) + '%)')
        // Growth stability test and parameters control
        if (((stepDoublingTimeIC95 / stepDoublingTimeAvg) <= (UserDefinedProtocol.intervalOfConfidenceMax / 100) && (Math.abs(stepTrend / stepDoublingTimeAvg) <= (UserDefinedProtocol.growthTrendMax / 100)) && (stabilizedTime <= Number(theExperiment.getDurationSec())))) {
          theAccessory.context().put('modeStabilized', 1)
          // changeCounter = theAccessory.context().getInt('changeCounter', 0)
          theExperiment.addEvent('*** Stabilized doubling time Dt (' + theGroup.getAccessory('thermo.thermo-reg').getValue() + '  ' + String.fromCharCode(176) + 'C, ' + theAccessory.context().getString('controlledParameterText', 'no parameter') + ') is ' + round(stepDoublingTimeAvg, 2) + String.fromCharCode(177) + round(stepDoublingTimeIC95, 2) + ' h (IC95)')
          if (UserDefinedProtocol.particleSwarmOptimizer) {
            controlParameter(UserDefinedProtocol.controlledParameter, PSO(stepDoublingTimeAvg))
          } else if (UserDefinedProtocol.controlledParameterSteps.length > 1) {
            if (changeCounter < (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
              controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[++changeCounter])
              theAccessory.context().put('changeCounter', changeCounter)
            } else if (changeCounter < 2 * (UserDefinedProtocol.controlledParameterSteps.length - 1)) {
              controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[2 * (UserDefinedProtocol.controlledParameterSteps.length - 1) - (++changeCounter)])
              theAccessory.context().put('changeCounter', changeCounter)
            } else {
              controlParameter(UserDefinedProtocol.controlledParameter, UserDefinedProtocol.controlledParameterSteps[1])
              theAccessory.context().put('changeCounter', 1)
            }
            theAccessory.context().put('stabilizedTimeMax', theExperiment.getDurationSec() + UserDefinedProtocol.stabilizationTimeMax * 3600)
            theAccessory.context().remove('stepCounter')
            theAccessory.context().remove('expDuration')
            theAccessory.context().remove('stepDoublingTime')
            theAccessory.context().remove('stabilizedTime')
          }
        }
      }
    }
    debugLogger('Pump max speed.')
    return theAccessory.getMax() * UserDefinedProtocol.peristalticPumpSpeed / 100 // fast
  } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier)) && pumpState) {
    theAccessory.context().put('modeDilution', 0)
    theAccessory.context().put('lastPumpStop', theExperiment.getDurationSec())
    debugLogger('Pump stopped.')
    return ProtoConfig.OFF // pump off
  } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier + ((UserDefinedProtocol.turbidostatODMax * odMaxModifier) - (UserDefinedProtocol.turbidostatODMin * odMinModifier)) * UserDefinedProtocol.peristalticPumpSlowDownRange / 100)) && pumpState) {
    debugLogger('Pump low speed.', 0)
    return theAccessory.getMax() * UserDefinedProtocol.peristalticPumpSpeed / 100 * UserDefinedProtocol.peristalticPumpSlowDownFactor / 100 // slow down the pump
  } else {
    return null // pump not influenced
  }  
}
// PSO implementation
function PSO (particleFitness) {
  /**
   * Particle Swarm Optimization.
   * 
   * Changes parameter(s) in optimal way as evaluated by PSO algorithm. It requires actual fitness of the particle that is expected to be minimized, e.g. doubling time.
   * 
   * @since 3.3.0
   * 
   * @param {number}    particleFitness   Fitness of the particle.
   * 
   * @return {array}         New parameters / conditions.          
   */
  debugLogger('BioArInEO-PSO executed') 
  theAccessory.context().put('particleLastFitness', particleFitness)
  var parameterSearchRange = [15, 35]
  var particlePosition = Number(theAccessory.context().get('particlePosition', UserDefinedProtocol.controlledParameterSteps[0])) //TODO multidimensional support
  theAccessory.context().put('particleLastPosition', particlePosition)
  var particleBestPosition = Number(theAccessory.context().get('particleBestPosition', particlePosition))
  var particleBestFitness = theAccessory.context().get('particleBestFitness', particleFitness)
  var particleStep = theAccessory.context().get('particleStep', 0.2 * (parameterSearchRange[1] - parameterSearchRange[0]) * (getRandomOnInterval(-1, 1) > 0 ? 1 : -1)) // ! PSI PBR JS doesn't support Math.sign()
  var maxStep = 5 // TODO adjust to multiparameter version, i.e. for each parameter reccommended limit (5 is for temperature)
  var swarmLeader = theServer.getGroupByName('DoAB-PBR01-group') // TODO add identifier from UserDefinedProtocol instead
  var swarmBestPosition = Number(swarmLeader.getAccessory('pumps.pump-5').context().get('swarmBestPosition', particlePosition))
  var swarmBestFitness = swarmLeader.getAccessory('pumps.pump-5').context().get('swarmBestFitness', particleFitness)
  debugLogger('BioArInEO-PSO best swarm position is ' + swarmBestPosition + ' with fitness ' + swarmBestFitness)
  var neighborsList = ['DoAB-PBR02-group'] // TODO  add  identifier from UserDefinedProtocol. !!! needs to be adjusted for each particle
  var neighborsPosition = []
  var neighborsFitness = []
  var index, len
  for ( index = 0, len = neighborsList.length; index < len; ++index) {
    neighborsPosition.push(theServer.getGroupByName(neighborsList[index]).getAccessory('pumps.pump-5').context().get('particleLastPosition', particlePosition));
    neighborsFitness.push(theServer.getGroupByName(neighborsList[index]).getAccessory('pumps.pump-5').context().get('particleLastFitness', particleFitness))
  }
  var neighborsBestFitness = Math.min.apply(null, neighborsFitness)
  var neighborsBestPosition = Number(neighborsPosition[neighborsFitness.indexOf(neighborsBestFitness)])
  debugLogger('BioArInEO-PSO best neighbors position is ' + neighborsBestPosition + ' with fitness ' + neighborsBestFitness)
  var newPosition = []
  // try {
  //   swarmBestPosition = swarmBestPosition.split(',')
  // } catch (error) {
  //   debugLogger('BioArInEO-PSO ERROR. ' + error.name + ' : ' + error.message)
  // }
  // for i in range(len(Swarm.multiparametric_space)):
  var particleCognitionLearning = 2.1
  var particleSocialLearning = 1.1
  var particleGlobalLearning = 1.6
  var particleInertiaWeighting = 2 * 0.8 / (particleCognitionLearning + particleSocialLearning + particleGlobalLearning - 2)
  debugLogger('BioArInEO-PSO evaluating new step') 
  var newStep = particleInertiaWeighting * particleStep + particleCognitionLearning * Math.random() * (particleBestPosition - particlePosition) + particleSocialLearning * Math.random() * (neighborsBestPosition - particlePosition) + particleGlobalLearning * Math.random() * (swarmBestPosition - particlePosition)
  if (newStep > maxStep) {
    newStep = maxStep
  } 
  theAccessory.context().put('particleStep', newStep)
  if (!(particleFitness > swarmBestFitness)) {
    theAccessory.context().put('particleBestPosition', particlePosition)
    theAccessory.context().put('particleBestFitness', particleFitness)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestPosition', particlePosition)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestFitness', particleFitness)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestParticle', theGroup)
  } else if (!(particleFitness > particleBestFitness)) {
    theAccessory.context().put('particleBestPosition', particlePosition)
    theAccessory.context().put('particleBestFitness', particleFitness)
  }
  if ((particlePosition + newStep) > parameterSearchRange[1]) {
    newPosition.push(parameterSearchRange[1])
  } else if ((particlePosition + newStep) < parameterSearchRange[0]) {
    newPosition.push(parameterSearchRange[0])
  } else {
    newPosition.push(particlePosition + newStep)
  }
  theAccessory.context().put('particlePosition', newPosition)
  debugLogger('BioArInEO-PSO new step is ' + newStep + ' and position is ' + newPosition)
  theServer.sendMail('PSO on ' + theGroup.getName() , 'INFO', ': new step is ' + newStep + ' and position is ' + newPosition) // Email notifications
  return newPosition
}
