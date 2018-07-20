// static parameters
var odLinMin = 0.5
var odLinMax = 1.23
var lightMin = 400
var expRegMult = 281.9177
var expRegExpo = 1.016269

/**
* Luminostat regulator
*
* @script Lights - Luminostat
* @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
* @version 0.1.1
* @modified 11.7.2018 (JaCe)
*
* @notes For proper function of the script a pump has to be set to ID 4
*
* @param {number} odLinMin Min OD for linear regulated range
* @param {number} odLinMax Max OD for linear regulated range
* @param {number} lightMin Min light for linear regulated range
* @param {number} expRegMult Exponential regression multiplier
* @param {number} expRegExpo Exponential regression exponent
*
* @return Light intensity
*
*/

// dynamic parameters
var lightMax = lightMin * (1 + (odLinMax - odLinMin) / odLinMin)

importPackage(java.util)
importPackage(java.lang)
importPackage(Packages.psi.bioreactor.core.protocol)

function round(number, decimals) {
    // Rounding specific decimal point number
    return +(Math.round(number + 'e+' + decimals) + 'e-' + decimals)
}

function controlLight(odValue) {
    // Check for OD noise/overshots and do primitive OD averaging
    if (theAccessory.context().getInt('odNoise', 1)) {
        theAccessory.context().put('odNoise', 0)
        theAccessory.context().put('odLast', odValue)
        return null
    }
    if (Math.abs(1 - odValue / odLast) < 0.04) {
        odValue = (odValue + odLast) / 2
        theAccessory.context().put('odLast', odValue)
        if (odValue > odLinMax) {
            result = Math.min(expRegMult * Math.exp(expRegExpo * odValue), theAccessory.getMax());
        } else if (odValue > odLinMin) {
            result = Math.min(lightMin + (lightMax - lightMin) * (odValue - odLinMin) / (odLinMax - odLinMin), theAccessory.getMax());
        } else {
            result = theAccessory.getValue();
        }
    } else {
        theAccessory.context().put('odNoise', 1)
        theAccessory.context().put('odLast', odValue)
        return null
    }
}

// dynamic parameters
var odSensor = theGroup.getAccessory("od-sensors.od-680") // query OD accessory by key
var odValue = odSensor.getValue()
var odLast = theAccessory.context().getDouble('odLast', 0.0)

if (!isNaN(odValue) && (round(odValue, 3) !== round(odLast, 3))) {
    controlLight(odValue)
}
