# PBR-Scripts
Set of Control Scripts for PSI Bioreactor Client software developed in Department of Adaptive Biotechnologies. These scripts allow automatization of both basic and advanced funcionalities not available in standard distribution of the client software. 

## Getting Started

Put one of the below listed .js file content to PSI Bioreactor Client software protocol scripting part and modify appropriately UserDefined section (object).

1. [PP-GrowthOptimizer](https://gcri-doab.github.io/PBR-Scripts/PP-GrowthOptimizer.js)
Script for automatic quazi-continous characterization and consequent optimization of microorganism cultivated in PBRs based on programatic control of selected PBR parameters. The script is activated on a peristaltic pump scripting protocol.
2. [O2-PIcurveMeasurement](https://gcri-doab.github.io/PBR-Scripts/O2-PIcurveMeasurement.js)
Script for automatic measurement of oxygen evolution and respiration under different irradiances (PI curve measurements). The script is activated on the oxygen probe (O2 dissolved) scripting protocol.

### Examples

1. PP-GrowthOptimizer
```
```
2. O2-PIcurveMeasurement
```
lightStepMultiplierValues: [ 1, 1, 1 ] // this setting enables measurement of O2 evolution/respiration in triplicate
```

## Authors

* **Jan Červený** - *Initial work* - [Department of Adaptive Biotechnologies](http://www.czechglobe.cz/en/institute-structure/research-sector/v-domain-adaptive-and-innovative-techniques/#doab)

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License

Licensed under [MIT license](https://gcri-doab.github.io/PBR-Scripts/LICENSE)

## Acknowledgments

Projects supporting development:

1. Services and access to state-of-the-art facilities for systems biology across Europe; project „Center for Systems Biology ([C4Sys](http://c4sys.cz))“
2. Innovations for mitigation of global change impacts; project „[CzechGlobe 2020](http://www.czechglobe.cz/en/) – Development of the Centre of Global Climate Change Impacts Studies“
3. Investigation on dynamics of complex reaction networks in enzyme reactors and photobioreactorsproject
