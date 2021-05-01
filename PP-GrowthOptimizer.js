var UserDefinedProtocol = {
  // -turbidostat settings
  turbidostatODMin: 0.3325,
  turbidostatODMax: 0.3675,
  turbidostatODType: 720,
  ODReadoutInterval: 60,
  // -optimizer parameters
  controlledParameter: 'none',
  controlledParameterSteps: [ 28 ],
  particleSwarmOptimizer: false,
  controlledParameters: [ 'temperature' ],
  controlledParametersIC: [ 28 ],
  parametersSearchRange: [ 18, 38 ],
  parametersMaxStep: [ 5 ],
  swarmLeaderGroup: 'DoAB-PBR01-group',
  particleNeighborsGroupList: [ 'DoAB-PBR02-group' ],
  // -optimizer stability check
  growthStatistics: true,
  regressionODType: 680,
  regressionCoDMin: 75,
  stabilizationTimeMin: 8,
  stabilizationTimeMax: 24,
  growthRateEvalFrac: 3 / 4,
  analyzedSteps: 6,
  growthTrendMax: 1.5,
  CI95AmplitudeMax: 2.5,
  // -peristaltic pump settings
  peristalticPumpID: 5,
  peristalticPumpSpeed: 100,
  peristalticPumpSlowDownRange: 20,
  peristalticPumpSlowDownFactor: 75,
  // -advanced options
  growthRateEvalDelay: 420,
  groupGMS: theGroup,
  mediaCarbonization: false,
  carbonizationOff: 4.2,
  carbonizationNormal: 8.4,
  carbonizationBoost: 37.0
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
 * @version 3.6.2
 * @modified 26.4.2021 (JaCe)
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
 *                lights = [[ 55, 25 ], [ 110, 25 ], [ 220, 25 ], [ 440, 25 ], [ 880,25 ]]; // [uE]
 *                GMS = [[ 9.6, 990 ], [ 19.6, 1880 ], [ 39.6, 1940 ]]; // [ml/min]
 *                stirrer = [ 30, 50, 65, 80, 95 ]; // [%] !!! works only with SW version 0.7.14 and later
 *                ODRange = [[0.4, 0.425], [0.2, 0.215], [0.1, 0.113]]; // [AU]
 * -optimizer stability check
 * @param {boolean} growthStatistics [true/false] - Enable or disable calculation of growth statistics. Note that the doubling time (Dt) calculation also includes information about the fit coefficient of determination (CoD in %), known as R-squared
 * @param {number} regressionODType [680/720/735] - OD sensor used for doubling time determination
 * @param {number} regressionCoDMin [%] - Minimum accpeted coefficient of determination for staility check evaluation (values below are ignored)
 * @param {number} stabilizationTimeMin [h] - Minimum duration of each characterization step
 * @param {number} stabilizationTimeMax [h] - Maximum duration of each characterization step
 * @param {number} growthRateEvalFrac [0-1] - Defines whether to use particular fraction of the data points for doubling time determination.
 * @param {number} analyzedSteps [-] - Number of steps to be analyzed for stability check
 * @param {number} growthTrendMax [%] - Maximum growth speed trend in time
 * @param {number} intervalOfConfidenceAmplitudeMax [%] - Maximum allowed amblitude of 95% Confidence Interval in percents from mean
 * -peristaltic pump settings
 * @param {number} peristalticPumpID [3-7] - Defines peristaltic pump ID set to the pump that is used for fresh media supply (quasi-continuous mode)
 * @param {number} peristalticPumpSpeed [%] - Nominal pump speed used for dilution of the suspension
 * @param {number} peristalticPumpSlowDownRange [%] - Lower range where the pump slows down
 * @param {number} peristalticPumpSlowDownFactor [%] - Slow down factor for the pump
 * -advanced options
 * @param {number} growthRateEvalDelay [s] - Time after dilution where data for doubling time determination are ignored. By default growthRateEvalFrac, i.e. only limited fraction of the data points is used for calculations.
 *                 This is to prevent influence of post dilution effect on doubling time evaluation. If 0 or false, growthRateEvalDelay is used instead. Note that to completely disable data limitation you need to set both growthRateEvalFrac and growthRateEvalDelay to 0.
 * @param {object} groupGMS - Identifies the group that contains Gas Mixing System. System value - do not change unless sure what you are doing! Example: theServer.getGroupByName('GROUP-NAME')
 * @param {boolean} mediaCarbonization [true/false] - Enable or disable media carbonization during turbidostat pump action.
 * @param {double} carbonizationOff [ml/min] - GMS CO2 channel flow when no carbonization of media is activated.
 * @param {double} carbonizationNormal [ml/min] - GMS CO2 channel flow when weak carbonization of media is activated.
 * @param {double} carbonizationBoost [ml/min] - GMS CO2 channel flow when intensive carbonization of media is activated.
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
if (!theAccessory.context().get('initiated', false)) {
  try {
    theAccessory.context().clear()
    theAccessory.context().put('stabilizedTime', Number(theExperiment.getDurationSec()) + UserDefinedProtocol.stabilizationTimeMin * 3600)
    theAccessory.context().put('stabilizedTimeMax', Number(theExperiment.getDurationSec()) + UserDefinedProtocol.stabilizationTimeMax * 3600)
    var light1String
    if (theGroup.getAccessory('actinic-lights.light-Blue') === null) {
      light1String = 'actinic-lights.light-White'
    } else {
      light1String = 'actinic-lights.light-Blue'
    }
    theAccessory.context().put('light1String', light1String)
    if (UserDefinedProtocol.particleSwarmOptimizer) {
      var parameters = UserDefinedProtocol.controlledParameters
      var values = UserDefinedProtocol.controlledParametersIC
    } else {
      var parameters = [ UserDefinedProtocol.controlledParameter ]
      var values = UserDefinedProtocol.controlledParameterSteps
    }
    for (var i = 0; i < parameters.length; i++) {
      switch (parameters[i]) {
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
        case 'light-red':
          if (theGroup.getAccessory('actinic-lights.light-Red').getProtoConfigValue()) {
            theExperiment.addEvent('!!! Disable RED LIGHT protocol')
          }
          break
        case 'light-blue':
          if (theGroup.getAccessory('actinic-lights.light-Blue').getProtoConfigValue()) {
            theExperiment.addEvent('!!! Disable BLUE LIGHT protocol')
          }
          break
        case 'light-white':
          if (theGroup.getAccessory('actinic-lights.light-White').getProtoConfigValue()) {
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
        case 'GMS-CO2':
          if (UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-0-reg').getProtoConfigValue()) {
            theExperiment.addEvent('!!! Disable GMS CO2 protocol')
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
          continue
      }
      controlParameter(parameters[i], values[i])
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
    if (UserDefinedProtocol.turbidostatODMin > UserDefinedProtocol.turbidostatODMax) {
      debugLogger('OD range reversed.')
      theExperiment.addEvent('OD range set in reversed order - will be automatically corrected.')
    }
    theAccessory.context().put('initiated', true)
    debugLogger('Peristaltic Pump - Growth Optimizer initialization successful.')
  } catch (error) {
    debugLogger('Initialization ERROR. ' + error.name + ' : ' + error.message)
  }
}

// Trigger media carbonization
if (UserDefinedProtocol.groupGMS === theGroup) {
  try {
    switch(theAccessory.context().getInt('carbonization', 0)) {
      case -1:
        theGroup.getAccessory('gas-mixer.valve-0-reg').setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.carbonizationOff))
        theAccessory.context().put('carbonization', 0)
        break
      case 1: 
        theGroup.getAccessory('gas-mixer.valve-0-reg').setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.carbonizationNormal))
        break
      case 2:
        theGroup.getAccessory('gas-mixer.valve-0-reg').setRunningProtoConfig(new ProtoConfig(UserDefinedProtocol.carbonizationBoost))
        break
      default:
    }
  } catch (error) {
    debugLogger('Carbonization ERROR. ' + error.name + ' : ' + error.message)
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
    case 'light-red':
      var light0 = theGroup.getAccessory('actinic-lights.light-Red')
      unit = ' uE'
      light0.setRunningProtoConfig(new ProtoConfig(Number(values))) // Red
      debugLogger('Red Light changed. Light set to ' + round(values, 0) + unit)
      break
    case 'light-white':
    case 'light-blue':
      var light1 = theGroup.getAccessory(theAccessory.context().get('light1String', 'actinic-lights.light-Blue'))
      unit = ' uE'
      light1.setRunningProtoConfig(new ProtoConfig(Number(values))) // Blue || White
      debugLogger('White/blue light changed. Light set to ' + round(values, 0) + unit)
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
      var flowCO2 = valve0.getProtoConfigValue()
      var flowAir = valve1.getProtoConfigValue()
      debugLogger('GMS settings changed. Gas Mixing set to Air flow ' + round(flowAir, 0) + unit + ' and CO2 flow ' + round(flowCO2, 1) + unit + ' (' + round((flowCO2 / (flowCO2 + flowAir) + 395 / 1e6) * 100, 1) + '%)')
      break
    case 'GMS-CO2':
        var valve0 = UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-0-reg') // CO2
        var valve1 = UserDefinedProtocol.groupGMS.getAccessory('gas-mixer.valve-1-reg') // Air
        unit = ' ml/min'
        valve0.setRunningProtoConfig(new ProtoConfig(Number(values)))
        var flowCO2 = valve0.getProtoConfigValue()
        var flowAir = valve1.getProtoConfigValue()
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
function changeParameter(parameter, direction) {
  if ((parameter === undefined) || (parameter === 'none')) {
    return null
  }
  if(direction === undefined) {
    direction = theAccessory.context().get('controlledParameterDirection', 'next')
  }
  var controlledParameterPosition = theAccessory.context().getInt('controlledParameterPosition', 1)
  var positions = []
  positions.push(UserDefinedProtocol.controlledParameterSteps[controlledParameterPosition-1])
  var len = UserDefinedProtocol.controlledParameterSteps.length
  if(direction === 'reverse') {
    direction = (theAccessory.context().get('controlledParameterDirection', 'next') === 'previous') ? 'next' : 'previous'
  }
  switch(direction) {
    case 'next':
      if(++controlledParameterPosition > len) {
        theAccessory.context().put('controlledParameterDirection', 'previous')
        controlledParameterPosition = controlledParameterPosition - 2
      }
      break;
    case 'previous':
      if(--controlledParameterPosition < 1) {
        theAccessory.context().put('controlledParameterDirection', 'next')
        controlledParameterPosition = controlledParameterPosition + 2
      }
      break;
    default:
  }
  theAccessory.context().put('controlledParameterPosition', controlledParameterPosition)
  controlParameter(parameter, UserDefinedProtocol.controlledParameterSteps[controlledParameterPosition-1])
  positions.push(UserDefinedProtocol.controlledParameterSteps[controlledParameterPosition-1])
  return positions
}
// Control activity of the peristaltic pump 
function controlPump () {
  // Following code ready for functional implementation
  // setODSensorString("turbidostat");
  // setODSensorString("regression");
  var odSensorString, odSensorRegressionString
  var experimentDuration = Number(theExperiment.getDurationSec())
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
  }
  if (theAccessory.context().getInt('stabilizedTimeMax', 0) <= experimentDuration && !pumpState) {
    var stepDoublingTime = theAccessory.context().get('stepDoublingTime', [ 999.9 ])
    var len = stepDoublingTime.length
    var stepDoublingTimeAvg = len > 2 ? len > UserDefinedProtocol.analyzedSteps ? stepDoublingTime.slice(len - UserDefinedProtocol.analyzedSteps, len).reduce(getSumArrReduce, 0) / (UserDefinedProtocol.analyzedSteps) : stepDoublingTime.slice(1, len).reduce(getSumArrReduce, 0) / (len - 1) : stepDoublingTime[len - 1]
    theAccessory.context().put('stabilizedTime', experimentDuration + UserDefinedProtocol.stabilizationTimeMin * 3600)
    theAccessory.context().put('stabilizedTimeMax', experimentDuration + UserDefinedProtocol.stabilizationTimeMax * 3600)
    theAccessory.context().remove('stepAccumulated')
    theAccessory.context().remove('stepCounter')
    theAccessory.context().remove('expDuration')
    theAccessory.context().remove('stepDoublingTime')
    if (UserDefinedProtocol.particleSwarmOptimizer) {
      PSO(stepDoublingTimeAvg)
    } else if (UserDefinedProtocol.controlledParameterSteps.length > 1) {
      var positions = changeParameter(UserDefinedProtocol.controlledParameter)
      debugLogger('OPTIMIZER executed on max. time with fitness ' + stepDoublingTimeAvg.toFixed(2) + ' for [ ' + positions[0].toFixed(2) + ' ] and new position is [ ' + positions[1].toFixed(2) + ' ]') 
      theServer.sendMail('OPTIMIZER (max. time) on ' + theGroup.getName() , 'NONE', ': fitness ' + stepDoublingTimeAvg.toFixed(2) + ' for [ ' + positions[0].toFixed(2) + ' ] and set new position [ ' + positions[1].toFixed(2) + ' ]') // Email notification
    } 
  }
  // Start step growth rate evaluation
  if (((odValue > (UserDefinedProtocol.turbidostatODMax * odMaxModifier)) && !pumpState)) {
    theAccessory.context().put('modeDilution', 1)
    theAccessory.context().put('modeStabilized', 0)
    var expDuration = theAccessory.context().get('expDuration', 0.0)
    var stepDuration = theAccessory.context().get('stepDuration', 0.0)
    var stepDoublingTime = theAccessory.context().get('stepDoublingTime', [ 999.9 ])
    var stabilizedTime = theAccessory.context().getInt('stabilizedTime', 0)
    if (!Array.isArray(expDuration)) {
      stepCounter = 0
      expDuration = []; stepDuration = []; stepDoublingTime = []
      theAccessory.context().put('expDuration', expDuration)
      theAccessory.context().put('stepDuration', stepDuration)
      theAccessory.context().put('stepDoublingTime', stepDoublingTime)
      odSensorRegression.getDataHistory().setCapacity(600)
    }
    expDuration[stepCounter] = experimentDuration
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
        var stepDoublingTimeCI95 = 0
        var stepTrend = 0
        var stepAccumulated = theAccessory.context().getInt('stepAccumulated', 0)
        var sumXY = 0
        var sumX = 0
        var sumY = 0
        var sumX2 = 0
        // var sumY2 = 0
        // Average of steps doubling time
        for (var i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps - stepAccumulated); i--) {
          stepDoublingTimeAvg += Number(stepDoublingTime[i])
        }
        stepDoublingTimeAvg /= (UserDefinedProtocol.analyzedSteps + stepAccumulated)
        // CI95 of steps doubling time
        for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps - stepAccumulated); i--) {
          stepDoublingTimeSD += Math.pow(stepDoublingTime[i] - stepDoublingTimeAvg, 2)
        }
        stepDoublingTimeSD = Math.sqrt(stepDoublingTimeSD / (UserDefinedProtocol.analyzedSteps + stepAccumulated - 1))
        stepDoublingTimeCI95 = stepDoublingTimeSD / Math.sqrt(UserDefinedProtocol.analyzedSteps + stepAccumulated) * 1.96
        // Trend of steps doubling time
        for (i = (stepCounter - 1); i >= (stepCounter - UserDefinedProtocol.analyzedSteps - stepAccumulated); i--) {
          sumX += Number(expDuration[i])
          sumX2 += Math.pow(expDuration[i], 2)
          sumY += Number(stepDoublingTime[i])
          // sumY2 += Math.pow(stepDoublingTime[i], 2)
          sumXY += Number(expDuration[i]) * Number(stepDoublingTime[i])
        }
        stepTrend = ((UserDefinedProtocol.analyzedSteps + stepAccumulated) * sumXY - sumX * sumY) / ((UserDefinedProtocol.analyzedSteps + stepAccumulated) * sumX2 - Math.pow(sumX, 2)) * 3600
        theExperiment.addEvent('Average step doubling time is ' + round(stepDoublingTimeAvg, 2) + String.fromCharCode(177) + round(stepDoublingTimeCI95, 2) + ' h (CI95, ' + round(stepDoublingTimeCI95 / stepDoublingTimeAvg * 100, 1) + '%) with ' + round(stepTrend, 2) + ' h/h trend (' + round(stepTrend / stepDoublingTimeAvg * 100, 1) + '%)')
        // Growth stability test and parameters control
        if ((Math.abs(stepTrend / stepDoublingTimeAvg) <= (UserDefinedProtocol.growthTrendMax / 100)) || stepAccumulated) {
            // TODO this solution removes stepTrend criteria check if at least once reached (expecting convergence!!!). May need to be upgraded later.
            theAccessory.context().put('stepAccumulated', stepAccumulated + 1)
          if ((stabilizedTime <= experimentDuration) && ((stepDoublingTimeCI95 / stepDoublingTimeAvg) <= (UserDefinedProtocol.CI95AmplitudeMax / 100))) {
            theAccessory.context().put('modeStabilized', 1)
            theAccessory.context().put('stabilizedTime', experimentDuration + UserDefinedProtocol.stabilizationTimeMin * 3600)
            theAccessory.context().put('stabilizedTimeMax', experimentDuration + UserDefinedProtocol.stabilizationTimeMax * 3600)
            theAccessory.context().remove('stepAccumulated')
            theAccessory.context().remove('stepCounter')
            theAccessory.context().remove('expDuration')
            theAccessory.context().remove('stepDoublingTime')
            theExperiment.addEvent('*** Stabilized doubling time Dt (' + theGroup.getAccessory('thermo.thermo-reg').getValue() + '  ' + String.fromCharCode(176) + 'C, ' + theAccessory.context().getString('controlledParameterText', 'no parameter') + ') is ' + round(stepDoublingTimeAvg, 2) + String.fromCharCode(177) + round(stepDoublingTimeCI95, 2) + ' h (CI95)')
            if (UserDefinedProtocol.particleSwarmOptimizer) {
              PSO(stepDoublingTimeAvg)
            } else if (UserDefinedProtocol.controlledParameterSteps.length > 1) {
              var positions = changeParameter(UserDefinedProtocol.controlledParameter)
              debugLogger('OPTIMIZER executed with fitness ' + stepDoublingTimeAvg.toFixed(2) + ' for [ ' + positions[0].toFixed(2) + ' ] and new position is [ ' + positions[1].toFixed(2) + ' ]') 
              theServer.sendMail('OPTIMIZER on ' + theGroup.getName() , 'NONE', ': fitness ' + stepDoublingTimeAvg.toFixed(2) + ' for [ ' + positions[0].toFixed(2) + ' ] and set new position [ ' + positions[1].toFixed(2) + ' ]') // Email notification
            }
          }
        }
      }
    }
    debugLogger('Pump max speed.')
    if (UserDefinedProtocol.mediaCarbonization && ((theAccessory.context().getDouble('pHpostDilution',7.0) - theAccessory.context().getDouble('pHpreDilution',7.0)) > 0)) {
      debugLogger('Carbonization initiated')
      theAccessory.context().put('carbonization', 1)
      UserDefinedProtocol.groupGMS.getAccessory('pumps.pump-5').context().put('carbonization', 1)
    }
    theAccessory.context().put('pHpreDilution', theGroup.getAccessory('probes.ph').getValue())
    return theAccessory.getMax() * UserDefinedProtocol.peristalticPumpSpeed / 100 // fast
  } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier)) && pumpState) {
    theAccessory.context().put('modeDilution', 0)
    theAccessory.context().put('lastPumpStop', experimentDuration)
    debugLogger('Pump stopped.')
    if (UserDefinedProtocol.mediaCarbonization && theAccessory.context().getInt('carbonization', 0)) {
      debugLogger('Carbonization terminated')
      theAccessory.context().put('carbonization', 0)
      UserDefinedProtocol.groupGMS.getAccessory('pumps.pump-5').context().put('carbonization', -1)
    }
    theAccessory.context().put('pHpostDilution', theGroup.getAccessory('probes.ph').getValue())
    return ProtoConfig.OFF // pump off
  } else if ((odValue <= (UserDefinedProtocol.turbidostatODMin * odMinModifier + ((UserDefinedProtocol.turbidostatODMax * odMaxModifier) - (UserDefinedProtocol.turbidostatODMin * odMinModifier)) * UserDefinedProtocol.peristalticPumpSlowDownRange / 100)) && pumpState) {
    debugLogger('Pump low speed', 0)
    if (UserDefinedProtocol.mediaCarbonization && ((theGroup.getAccessory('probes.ph').getValue() - theAccessory.context().getDouble('pHpreDilution',7.0)) > 0) && (theAccessory.context().getInt('carbonization', 0) < 2)) {
      debugLogger('Carbonization boost')
      theAccessory.context().put('carbonization', 2)
      UserDefinedProtocol.groupGMS.getAccessory('pumps.pump-5').context().put('carbonization', 2)
    } else if (UserDefinedProtocol.mediaCarbonization && (theAccessory.context().getInt('carbonization', 0) == 1)) {
      debugLogger('Carbonization terminated')
      theAccessory.context().put('carbonization', 0)
      UserDefinedProtocol.groupGMS.getAccessory('pumps.pump-5').context().put('carbonization', -1)
    }
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
  if (particleFitness === undefined) {
    particleFitness = 999.9
  }
  theAccessory.context().put('particleLastFitness', particleFitness)
  var particlePosition = theAccessory.context().get('particlePosition', UserDefinedProtocol.controlledParametersIC)
  debugLogger('BioArInEO-PSO executed with fitness ' + particleFitness.toFixed(2) + ' and position [ ' + particlePosition.map(function(ae){return ae.toFixed(2)}) + ' ]') 
  theAccessory.context().put('particleLastPosition', particlePosition)
  var particleBestPosition = theAccessory.context().get('particleBestPosition', particlePosition)
  var particleBestFitness = theAccessory.context().get('particleBestFitness', particleFitness)
  var swarmLeader = theServer.getGroupByName(UserDefinedProtocol.swarmLeaderGroup)
  var swarmBestPosition = swarmLeader.getAccessory('pumps.pump-5').context().get('swarmBestPosition', particlePosition)
  var swarmBestFitness = swarmLeader.getAccessory('pumps.pump-5').context().get('swarmBestFitness', particleFitness)
  var swarmBestParticle = swarmLeader.getAccessory('pumps.pump-5').context().get('swarmBestParticle', undefined)
  var neighborsList = UserDefinedProtocol.particleNeighborsGroupList
  var parametersSearchRange = UserDefinedProtocol.parametersSearchRange
  var particleStep =  theAccessory.context().get('particleStep', undefined)
  var temporaryTest = false
  if (particleStep === undefined) {
    temporaryTest = true
    particleStep = []
  }
  var neighborsBestPosition = []
  var neighborsBestFitness = []
  var newPosition = []
  var newStep = []
  var particleCognitionLearning = 2.1
  var particleSocialLearning = 1.1
  var particleGlobalLearning = 1.6
  var particleInertiaWeighting = 2 * 0.8 / (particleCognitionLearning + particleSocialLearning + particleGlobalLearning - 2)
  var temporaryNeighborPosition
  var neighborsPosition
  var neighborsFitness
  for (var index = 0, len = UserDefinedProtocol.controlledParameters.length; index < len; index++) {
    neighborsPosition = []
    neighborsFitness = []
    if (len > 1) {
      parametersSearchRange = UserDefinedProtocol.parametersSearchRange[index]
    }
    if (temporaryTest) {
      particleStep.push(0.2 * (parametersSearchRange[1] - parametersSearchRange[0]) * (getRandomOnInterval(-1, 1) > 0 ? 1 : -1)) // ! PSI PBR JS doesn't support Math.sign()
    }
    debugLogger('BioArInEO-PSO particle step for ' + UserDefinedProtocol.controlledParameters[index] + ' was ' + particleStep[index].toFixed(2) + ' (|max| ' + UserDefinedProtocol.parametersMaxStep[index].toFixed(2) + ' )') 
    for (var indexN = 0, lenN = neighborsList.length; indexN < lenN; ++indexN) {
      temporaryNeighborPosition = theServer.getGroupByName(neighborsList[indexN]).getAccessory('pumps.pump-5').context().get('particleLastPosition', undefined)
      if (temporaryNeighborPosition === undefined) {
        neighborsPosition.push(particlePosition[index])
      } else {
        neighborsPosition.push(temporaryNeighborPosition[index])
      }
      neighborsFitness.push(theServer.getGroupByName(neighborsList[indexN]).getAccessory('pumps.pump-5').context().get('particleLastFitness', particleFitness))
    }
    neighborsBestFitness.push(Math.min.apply(null, neighborsFitness))
    neighborsBestPosition.push(Number(neighborsPosition[neighborsFitness.indexOf(neighborsBestFitness[index])]))
    //debugLogger('BioArInEO-PSO neighbors best position for ' + UserDefinedProtocol.controlledParameters[index] + ' is ' + neighborsBestPosition[index].toFixed(2) + ' with fitness ' + neighborsBestFitness[index].toFixed(2))
    // PSO steps for debugging
    var cognitionPart = particleFitness > particleBestFitness ? particleCognitionLearning * Math.random() * (particleBestPosition[index] - particlePosition[index]) : 0
    var socialPart = particleFitness > neighborsBestFitness[index] ? particleSocialLearning * Math.random() * (neighborsBestPosition[index] - particlePosition[index]) : 0
    var globalPart = particleFitness > swarmBestFitness ? particleGlobalLearning * Math.random() * (swarmBestPosition[index] - particlePosition[index]) : 0
    newStep.push(particleInertiaWeighting * particleStep[index] + cognitionPart + socialPart + globalPart)
    debugLogger('BioArInEO-PSO new uncorrected step for ' + UserDefinedProtocol.controlledParameters[index] + ' is ' + newStep[index].toFixed(2) + ' with [ ' + Array(cognitionPart.toFixed(2),socialPart.toFixed(2),globalPart.toFixed(2)).toString() + ' ]')
    if (Math.abs(newStep[index]) > Number(UserDefinedProtocol.parametersMaxStep[index])) {
      newStep[index] = Number(UserDefinedProtocol.parametersMaxStep[index]) * (newStep[index] > 0 ? 1 : -1)
    }
    if ((particlePosition[index] + newStep[index]) > parametersSearchRange[1]) {
      newPosition.push(parametersSearchRange[1])
    } else if ((particlePosition[index] + newStep[index]) < parametersSearchRange[0]) {
      newPosition.push(parametersSearchRange[0])
    } else {
      newPosition.push(particlePosition[index] + newStep[index])
    }
    controlParameter(UserDefinedProtocol.controlledParameters[index], round(newPosition[index], 2))
  }
  if (!(particleFitness > swarmBestFitness)) {
    swarmBestPosition = particlePosition
    swarmBestFitness = particleFitness
    swarmBestParticle = theGroup
    theAccessory.context().put('particleBestPosition', particlePosition)
    theAccessory.context().put('particleBestFitness', particleFitness)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestPosition', swarmBestPosition)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestFitness', swarmBestFitness)
    swarmLeader.getAccessory('pumps.pump-5').context().put('swarmBestParticle', swarmBestParticle)
  } else if (!(particleFitness > particleBestFitness)) {
    theAccessory.context().put('particleBestPosition', particlePosition)
    theAccessory.context().put('particleBestFitness', particleFitness)
  }
  theAccessory.context().put('particleStep', newStep)
  theAccessory.context().put('particlePosition', newPosition)
  debugLogger('BioArInEO-PSO best swarm position is [ ' + swarmBestPosition.map(function(ae){return ae.toFixed(2)}) + ' ] with fitness ' + swarmBestFitness.toFixed(2))
  debugLogger('BioArInEO-PSO best swarm particle is ' + swarmBestParticle)
  debugLogger('BioArInEO-PSO best neighbors position is [ ' + neighborsBestPosition.map(function(ae){return ae.toFixed(2)}) + ' ] with fitness ' + neighborsBestFitness[0].toFixed(2))
  debugLogger('BioArInEO-PSO new step is [ ' + newStep.map(function(ae){return ae.toFixed(2)}) + ' ] and position is [ ' + newPosition.map(function(ae){return ae.toFixed(2)}) + ' ]')
  theServer.sendMail('PSO on ' + theGroup.getName() , 'NONE', ': for fitness ' + particleFitness.toFixed(2) + ' new step is [ ' + newStep.map(function(ae){return ae.toFixed(2)}) + ' ] and position is [ ' + newPosition.map(function(ae){return ae.toFixed(2)}) + ' ]') // Email notifications
}
