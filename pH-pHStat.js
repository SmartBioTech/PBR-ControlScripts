/**
* pH regulator using external/additional pump
*
* @script Peristaltic Pump - Growth Optimizer
* @author CzechGlobe - Department of Adaptive Biotechnologies (JaCe)
* @version 0.1
* @modified 16.2.2017 (JaCe)
*
* @notes For proper function of the script a pump has to be set to ID 4
*
* @param {number} pHmin Min pH/lower bound for pH stat (base) activation
*
* @return Flow of external/additional pump
*
*/
   

importPackage(java.util);
importPackage(java.lang);
importPackage(Packages.psi.bioreactor.core.protocol);

// Static parameters set by user
var pHmin = 4.52; // lower bound of pH-stat

var ph = Number(theAccessory.getValue());
var pump = theGroup.getAccessory("pumps.pump-4");
if (ph > pHmin) {
   //pump.setRunningProtoConfig(ProtoConfig.ON);
   pump.setRunningProtoConfig(new ProtoConfig(500));
}
else
{
   pump.setRunningProtoConfig(ProtoConfig.OFF);
}
result = 60;
