# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin changelog

All notable changes to this project will be documented in this file.

If you like this project and find it useful, please consider giving it a star on [GitHub](https://github.com/Luligu/matterbridge-zigbee2mqtt) and sponsoring it.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="120"></a>

## [3.0.3] - 2025-12-12

### Added

- [mqtt]: Added a guide to setup Unix socket on the host.
- [mqtt]: Added a guide to setup Unix socket with docker.
- [mqtt]: Added support for web socket connection: use ws://mqtthost.
- [mqtt]: Added support for secure web socket connection: use wss://mqtthost.

### Changed

- [package]: Updated dependencies.
- [mqtt]: Clarified in the schema that the mqtt port is not used with Unix socket.
- [mqtt]: Use mqtt+unix:///path for Unix socket.
- [mqtt]: Removed options.protocol. Thanks Rob van Oostenrijk (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/133).

### Fixed

- [mqtt]: Fixed wrong log messages with Unix socket. Thanks Rob van Oostenrijk (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/133).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [3.0.2] - 2025-12-01

### Added

- [scenes]: Added await for creation.
- [mqtt]: Added config for a fixed clientId. If not provided, a random clientId will be generated. (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/138)
- [mqtt]: Added Unix socket support on Linux: use unix://<SOCKET_PATH> for Unix socket (e.g. unix:///var/run/mqtt.sock). (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/133)
- [zigbee2mqtt]: Added frontend package detection. With the new windfront, link or bookmarks to the specific device page are not possible. (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/136)

### Changed

- [package]: Updated dependencies.
- [package]: Bumped package to automator v.2.1.0.
- [package]: Updated to the current Matterbridge signatures.
- [package]: Requires Matterbridge v.3.4.0.
- [package]: Updated to the Matterbridge Jest module.
- [tvoc]: Removed voc_index from the converter. (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/129)

### Fixed

- [cover]: Fixed wrong update with motor reversed. Zigbee2MQTT cover: 0 = fully closed, 100 = fully open (with invert_cover = false). Use invert_cover configuration on zigbee2mqtt if your cover has inverted position.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [3.0.1] - 2025-11-14

### Changed

- [package]: Updated dependencies.
- [package]: Bumped package to automator v.2.0.12.
- [package]: Updated to the current Matterbridge signatures.
- [jest]: Updated jestHelpers to v.1.0.12.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [3.0.0] - 2025-11-08

### Added

- [tvoc]: Added voc_index to the converter. Thanks Funca (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/129).
- [cover]: Added check for reverse_direction === 'back' and reverse_direction === true (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/121 and https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/131).
- [test]: Improved test coverage to 85%.

### Changed

- [package]: Updated dependencies.
- [package]: Bumped platform to v.3.0.0.
- [package]: Bumped entity to v.3.3.0.
- [package]: Bumped zigbee to v.3.0.0.
- [package]: Bumped package to automator v.2.0.11.
- [jest]: Bumped jestHelpers to v.1.0.11.
- [package]: Require matterbridge v.3.3.0.
- [package]: Added default config.
- [package]: Added typed ZigbeePlatformConfig.
- [platform]: Updated to new signature PlatformMatterbridge.
- [workflows]: Improved speed on Node CI.
- [workflows]: Use shallow clones and --no-fund --no-audit for faster builds.
- [devcontainer]: Added the plugin name to the container.
- [devcontainer]: Improved performance of first build with shallow clone.

### Fixed

- [platform]: Fixed specific zbminir2 device case for all devices. Thanks subst4nc3 (https://github.com/Luligu/matterbridge-zigbee2mqtt/issues/126).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.8.1] - 2025-10-02

### Automations and scenes

The package [zigbee2mqtt-automations](https://github.com/Luligu/zigbee2mqtt-automations) has been updated to version 3.0.0 that includes also scenes.

### Changed

- [package]: Updated dependencies.
- [package]: Updated package to Automator v. 2.0.7.
- [workflows]: Ignore any .md in build.yaml.
- [workflows]: Ignore any .md in codeql.yaml.
- [workflows]: Ignore any .md in codecov.yaml.
- [jest]: Updated jestHelpers to v. 1.0.6.

### Fixed

- [platform]: Fixed command handlers execution when the controllers send scenes.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.8.0] - 2025-09-14

### Breaking changes

Some color conversion have been optimized to improve performnces.

It is possible that existing scenes on the controllers now render the color in a different nuance.

If this is the case, update the color attributes in the controller scenes.

### Automations and scenes

The package [zigbee2mqtt-automations](https://github.com/Luligu/zigbee2mqtt-automations) has been updated to version 3.0.0 that includes also scenes.

### Added

- [adaptiveLighting]: Added support for **Apple Home Adaptive Lighting**. See https://github.com/Luligu/matterbridge/discussions/390.
- [platform]: Optimized command handlers execution and perfomance when the controllers send huge light scenes.
- [devcontainer]: Added the plugin name to the container.
- [devcontainer]: Improved performance of first build with shallow clone.
- [workflows]: The publish workflow now triggers automatically the docker build of matterbridge.
- [jest]: Added jest helper module v. 1.0.6.

### Changed

- [package]: Updated dependencies.
- [package]: Updated package to Automator v. 2.0.6.
- [workflows]: Ignore any .md anywhere.
- [workflows]: Improved speed on Node CI.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.7.0] - 2025-07-14

### Added

- [entity]: Added the ability to cache commands for a single light device or group. They will be executed in once. This helps to execute scenes from the controller in large setups.
- [composed]: Added the ability to send commands on child enpoint also for ColorControl cluster.
- [startup]: Changed the timeout for the connection to the mqtt broker to 60 seconds. This resolve the race condition when docker compose (or a host reboot) starts mosquitto, zigbee2mqtt and matterbridge in the same moment.
- [jest]: Added a few more test. Coverage will improve in the next releases.

### Changed

- [package]: Updated dependencies.
- [package]: Updated package to Automator v. 2.0.2.
- [DevContainer]: Added support for the [**Matterbridge Plugin Dev Container**](https://github.com/Luligu/matterbridge/blob/dev/README-DEV.md#matterbridge-plugin-dev-container) with optimized named volumes for `matterbridge` and `node_modules`.
- [GitHub]: Added GitHub issue templates for bug reports and feature requests.
- [ESLint]: Refactored the flat config.
- [ESLint]: Added the plugins `eslint-plugin-promise`, `eslint-plugin-jsdoc`, and `@vitest/eslint-plugin`.
- [Jest]: Refactored the flat config.
- [Vitest]: Added Vitest for TypeScript project testing. It will replace Jest, which does not work correctly with ESM module mocks.
- [JSDoc]: Added missing JSDoc comments, including `@param` and `@returns` tags.
- [CodeQL]: Added CodeQL badge in the readme.
- [Codecov]: Added Codecov badge in the readme.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.6.0] - 2025-06-07

### Added

- [npm]: The dev of matterbridge-zigbee2mqtt is published with tag **dev** on **npm** each day at 00:00 UTC if there is a new commit.
- [mqtt]: Added MQTT SSL/TLS server authentication. Prefix host with mqtts:// and provide the ca certificate for self-signed server certificates.
- [mqtt]: Added MQTT SSL/TLS client authentication. Prefix host with mqtts:// and provide the client certificate and key. Provide also the ca certificate for self-signed client certificates.

### Changed

- [package]: Updated package.
- [package]: Updated dependencies.

### Fixed

- [subscribe]: Removed async from handlers.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.5.0] - 2025-05-26

### Added

- [scenes]: Added scenes support for groups and devices. See the README.md for explanations.
- [waterLeak]: Added waterLeakDetector device type for zigbee property "water_leak". Default to false (i.e. no alarm) since is not possible to get the property.
- [rainSensor]: Added rainSensor device type for zigbee property "rain". Default to false (i.e. no alarm) since is not possible to get the property.
- [smokeSensor]: Added smokeSensor device type for zigbee property "smoke". Default to false (i.e. no alarm) since is not possible to get the property.
- [colorTemp]: Added conversion from color temperature to rgb for the rgb devices that don't support color_temp.
- [battery]: Set batChargeLevel to warning if battery is less than 40% and the device doesn't expose battery_low.
- [battery]: Set batChargeLevel to critical if battery is less than 20% and the device doesn't expose battery_low.
- [retain]: Send retained mqtt states at startup if z2m has retain enabled. See the README.md for explanations.
- [logger]: Added onChangeLoggerLevel() to the platform.

### Changed

- [package]: Updated package.
- [package]: Updated dependencies.
- [plugin]: Requires Matterbridge 3.0.4.
- [config]: As anticipated in the previous release, the parameter postfixHostname has been removed. Use postfix if needed.
- [colorRgb]: Changed the default device type from colorTemperatureLight to extendedColorLight to solve the SmartThings issue with colors.
- [colorTemp]: The min and max mired values for color_temp are now set in the cluster.

### Fixed

- [logger]: Fixed logger not always taking the correct value from the frontend.
- [issue104]: Solved wrong mode AUTO in system_mode for HEAT only devices.
- [issue107]: Solved motor_direction reversed.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.7] - 2025-03-19

### Added

- [select]: Added the possibility to whitelist or blacklist with the device serial (i.e. 0x187a3efffe357548) or the group serial (i.e. group-1).

### Changed

- [package]: Updated package.
- [package]: Updated dependencies.
- [plugin]: Requires Matterbridge 2.2.5.
- [config]: Added parameter postfix (3 characters max) to be consistent with the other plugins. This parameter works with the Devices panel in the home page.
- [config]: The old postfixHostname will be removed in the next release. If you were using postfixHostname, please change it with postfix, the controllers will likely remove and recreate all the devices so make a backup of configurations (i.e. room assignements) and automations on the controller!

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.6] - 2025-02-20

### Changed

- [package]: Updated package.
- [package]: Updated dependencies.

### Fixed

- [schema]: Fix wrong default in schema (thanks https://github.com/robvanoostenrijk).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.5] - 2025-02-05

### Added

- [thermostat]: Added fan_only mode (tested by https://github.com/robvanoostenrijk). No controllers seem to support this mode in UI right now.

### Changed

- [package]: Updated dependencies.

### Fixed

- [thermostat]: Fix thermostat bug (thanks https://github.com/robvanoostenrijk).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.4] - 2025-02-02

### Changed

- [plugin]: Requires Matterbridge 2.1.0.
- [package]: Updated package.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.3] - 2025-01-20

### Changed

- [plugin]: Requires Matterbridge 1.7.3.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.2] - 2025-01-11

### Fixed

- [endpoint]: Fixed blacklist of child endpoints.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.1] - 2025-01-11

### Added

- [selectEntity]: Added selectEntity to get the features names from a list in the config editor.
- [configUrl]: Added zigbeeFrontend in the config to prefix configUrl to get a link to the zigbee2mqtt frontend from the Matterbridge frontend Devices page. This allows to open the device configuration from the frontend.

### Changed

- [plugin]: Requires Matterbridge 1.7.2.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.4.0] - 2025-01-08

### Added

- [selectDevice]: Added selectDevice to get the device names from a list in the config editor.

### Changed

- [illuminace_lux]: Follow removal of illuminace_lux https://github.com/Koenkk/zigbee-herdsman-converters/pull/8304
- [plugin]: Requires Matterbridge 1.7.1.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.3.2] - 2024-12-24

### Changed

- [package]: Updated package.
- [package]: Updated dependencies.
- [plugin]: Use platform white and black list.
- [platform]: Use platform endpoint number check.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.3.1] - 2024-12-12

### Added

- [colorControl] Update ColorControl cluster
- [levelControl] Update currentLevel to minLevel

### Changed

- [package]: Updated dependencies.
- [plugin]: Requires Matterbridge 1.6.6.

### Fixed

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.3.0] - 2024-12-04

### Added

- [matterbridge]: Verified to work with Matterbridge edge (matter.js new API).
- [covers]: Add position movement updates to the controller.
- [covers]: Fix group cover at controller.
- [zigbeeEntity]: Add create async to ZigbeeDevice and ZigbeeGroup.

### Changed

- [package]: Updated dependencies.
- [plugin]: Requires Matterbridge 1.6.5.

### Fixed

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.2.2] - 2024-11-26

### Added

- [thermostat]: Added min_temperature_limit and max_temperature_limit converter to thermostats.
- [thermostat]: Added min_heat_setpoint_limit and max_heat_setpoint_limit converter to thermostats.
- [thermostat]: Added configuration for heat only and cool only thermostats.
- [matter]: Added tagList to child endpoints.

### Changed

- [mqtt]: Username and password are passed like undefined unless set.
- [readme]: Updated install script.
- [readme]: Updated build script.
- [package]: Updated dependencies.
- [plugin]: Requires Matterbridge 1.6.2.

### Fixed

- [thermostat]: Fixed the case when instead of current_heating_setpoint the property is occupied_heating_setpoint.
- [thermostat]: Fixed the case when instead of current_cooling_setpoint the property is occupied_cooling_setpoint.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.2.1] - 2024-10-11

### Fixed

- [entity]: Fixed propertyMap.
- [entity]: Fixed energy kWh.
- [entity]: Fixed log.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.2.0] - 2024-10-10

### Added

- [groups]: Refactor the group to support also covers.

### Changed

- [matterbridge]: Removed EveHistory energy measurement in favor of Matter 1.3 ElectricalPowerMeasurement and ElectricalEnergyMeasurement (supported by Home Assistant from version 2024.10).
- [matterbridge]: Updated to new child endpoints MatterbridgeDevice methods.
- [entity]: Code optimization.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.19] - 2024-10-01

### Changed

- [package]: Upgrade to new workflows.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.17] - 2024-09-21

### Changed

- [matterbridge]: Removed Matterbridge deprecated method to get the child endpoints.
- [package]: Updated dependencies.
- [plugin]: Moved trigger code to matterbridge triggerSwitchEvent.

### Added

- [matterbridge]: Added a check of the current Matterbridge version (required v1.5.5).
- [plugin]: Added configuration of ColorControl cluster features (HS, XY, CT).
- [plugin]: Removed the superset device types.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.16] - 2024-09-04

### Changed

- [package]: Final update to matter.js 0.10.0.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.15] - 2024-09-03

### Changed

- [package]: Updated Thermostat cluster to matter.js 0.10.0.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.14] - 2024-08-29

### Added

- [config]: Added parameter postfixHostname (default true). If you change it, the controllers will remove and recreate all the devices! (https://github.com/L2jLiga)

### Changed

- [package]: Updated dependencies.
- [package]: Updated imports.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.13] - 2024-08-22

### Changed

- [package]: Updated dependencies.

### Fixed

- [package]: Fixed MQTT protocol.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.12] - 2024-08-21

### Changed

- [schema]: Changed schema file to add MQTT protocol.
- [schema]: Changed descriptions in schema for easier setup.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.11] - 2024-08-20

### Changed

- [package]: Updated dependencies.
- [package]: Update mqtt to 5.10.0.

### Fixed

- [package]: Fixed dependencies.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.10] - 2024-08-09

### Changed

- [package]: Updated dependencies.
- [package]: Update mqtt to 5.9.1.

### Fixed

- [z2m]: Fixed issue: 'Only supported EndpointInterface implementation is Endpoint'.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.9] - 2024-07-28

### Changed

- [package]: Updated dependencies.
- [logger]: Update node-ansi-logger to 2.0.6.
- [storage]: Update node-persist-manager to 1.0.8.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.8] - 2024-07-23

### Changed

- [z2m]: Updated matterbridge imports.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.7] - 2024-07-11

### Fixed

- [z2m]: Fixed trigger when the endpoint is undefined.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.6] - 2024-07-10

### Changed

- [package]: Updated dependencies.
- [imports]: Updated matterbridge imports.

### Fixed

- [z2m]: Fixed the detection of color_temp only lights.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.5] - 2024-07-01

### Changed

- [z2m]: Added transition to ColorControl if the zigbee device supports it and the controller sends it. You can disable this globally adding transition to the featureBlackList or only for the single device adding transition to the deviceFeatureBlackList. (Thanks Stefan Schweiger).

### Fixed

- [zigbee]: Fixed WindowCovering.targetPositionLiftPercent100ths update (Thanks Nitay Ben-Zvi).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.4] - 2024-06-30

### Changed

- [dependencies]: Update dependencies.
- [dependencies]: Update eslint to 9.6.0.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.3] - 2024-06-23

### Added

- [zigbee]: Added new properties: co - CarbonMonoxideConcentrationMeasurement, co2 - CarbonDioxideConcentrationMeasurement, formaldehyd - FormaldehydeConcentrationMeasurement, pm1 - Pm1ConcentrationMeasurement, pm25 - Pm25ConcentrationMeasurement, pm10 - Pm10ConcentrationMeasurement

### Changed

- [bridge/info]: Log error when advanced.output is set to 'attribute'.

### Fixed

- [bridge/info]: Fixed the issue when advanced.output is set 'attribute_and_json'. (Thanks copystring).
- [bridge/info]: Fixed the issue when include_device_information is set to true. (Thanks copystring).

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.2] - 2024-06-21

### Added

- [dependencies]: Update dependencies.
- [start]: Refactor start sequence.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.1] - 2024-06-20

### Added

- [dependencies]: Update dependencies (mqtt to 5.7.2).
- [schema]: Added info log when the plugin starts to register devices and groups. Added empty bridge/config and bridge/definitions handlers.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.1.0] - 2024-06-19

### Added

- [dependencies]: Update dependencies.
- [schema]: Added schema to the root directory of the plugin.
- [z2m]: Added soil_moisture property as humidity sensor.
- [z2m]: Added transition if the zigbee device supports it and the controller sends it. You can disable this globally adding transition to the featureBlackList or only for the single device adding transition to the deviceFeatureBlackList. (Thanks Stefan Schweiger).

### Changed

- [matter]: Removed PowerSourceConfiguration cluster that is deprecated in Matter 1.3.

### Fixed

- [schema]: Username and password are no more required fields (Thanks Stefan Schweiger).
- [LevelControl]: Fixed the commandHandler for LevelControl in child endpoint (Thanks jpadie).
- [availability]: Fixed the issue that caused the availability event sent before the start to be ignored.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.17] - 2024-06-16

### Fixed

- [LevelControl]: Fixed the issue that caused LevelControl missing in child endpoint (Thanks jpadie).

### Added

- [dependencies]: Update dependencies

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.16] - 2024-06-06

### Added

- [dependencies]: Update dependencies
- [matterbridge]: Added bridgeOnline to the start checks.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.15] - 2024-06-01

### Added

- [dependencies]: Update dependencies
- [matterbridge]: Adapted the code to the new start mode of Matterbridge.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.14] - 2024-05-09

### Added

- [mqtt]: Added Keekalive to MQTT.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.13] - 2024-05-02

### Added

- [groups]: Added ColorControl.

### Fixed

- [payload]: Fixed the case when z2m sends empty action in the payload.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.12] - 2024-04-30

### Added

- [action]: Added support for devices with more then 3 events/actions. All SwitchCluster actions are mapped in groups of 3 on sub endpoints. The mapping schema is shown in log.
- [mqtt]: Added handles for group_add, group_remove, group_rename, group_add_member and group_remove_member

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="80"></a>

## [2.0.11] - 2024-04-26

### Added

- [mqtt]: Added handles for device_joined, device_announce, device_leave, device_remove, device_interview, device_rename.
- [exposes]: Added deviceFeatureBlackList to the config to exclude a feature on a device level (See the config section for guidelines on how to use it).
- [mqtt]: Incoming messages are filtered by featureBlackList and deviceFeatureBlackList (if only blacklisted features change, the message is not processed). If present, the features included in featureBlackList and deviceFeatureBlackList are also removed from the payload.
- [routers] Added the SMLIGHT routers (with router firmware) to the router list. They are exposed like DoorLock so it is possible, like for the Coordinator and the Texas instruments router, to ask Siri to turn on/off permit join.

## [2.0.10] - 2024-04-22

### Added

- [z2m]: Added a check for not changed mqtt messages.
- [extension]: Finalized implementation of zigbee2MQTT internal extension v. 1.0.0.

### Changed

- [z2m]: Changed vendorName and productName with the values from device definition if present.

## [2.0.9] - 2024-04-19

### Added

- [extension]: Implementation of zigbee2MQTT internal extension.

## [2.0.8] - 2024-04-16

### Added

- [extension]: Started implementation of zigbee2MQTT internal extension.
- [presence]: Added feature presence (https://github.com/nitaybz).
- [FlowMeasurement]: Added FlowMeasurement cluster.

## [2.0.7] - 2024-04-11

### Added

- [config.featureBlackList] z2m features with name in the list will be ignored (e.g. device_temperature) (https://github.com/nitaybz).
- [config.switchList] Device with friendly name in the list will be exposed like switch.
- [config.lightList] Device with friendly name in the list will be exposed like light.
- [config.outletList] Devices with friendly name in the list will be exposed like outlet.

### Fixed

- [payload]: Fixed the case when z2m sends null or undefined in the payload (https://github.com/khaidakin).

## [2.0.6] - 2024-04-09

### Added

- [electrical] Added support for voltage current power energy (right now they show up only in Home Assistant)
- [multiendpoint]: Added the support for electrical measurements and temperature (thanks https://github.com/khaidakin).

### Changed

- [discovery]: Refactored the zigbee2mqtt discovery: now multi endpoints devices (mostly DIY devices) are supported.

## [2.0.5] - 2024-04-01

### Added

- [Coordinator and routers]: Coordinator and TexasInstruments pure routers are exposed like DoorLock. They change state when permitJoin is changed and turn on or off the permitJoin when they are opened or closed from the controller.
- [thermostat]: Added the Thermostat cluster (thanks https://github.com/khaidakin).
- [multiendpoint]: Added the support for OnOff cluster with child enpoints (thanks https://github.com/khaidakin).

<!-- Commented out section
## [1.1.2] - 2024-03-08

### Added

- [Feature 1]: Description of the feature.
- [Feature 2]: Description of the feature.

### Changed

- [Feature 3]: Description of the change.
- [Feature 4]: Description of the change.

### Deprecated

- [Feature 5]: Description of the deprecation.

### Removed

- [Feature 6]: Description of the removal.

### Fixed

- [Bug 1]: Description of the bug fix.
- [Bug 2]: Description of the bug fix.

### Security

- [Security 1]: Description of the security improvement.
-->
