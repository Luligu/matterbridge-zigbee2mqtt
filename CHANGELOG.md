# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin changelog

If you like this project and find it useful, please consider giving it a star on GitHub at https://github.com/Luligu/matterbridge-zigbee2mqtt and sponsoring it.

All notable changes to this project will be documented in this file.

### Breaking Changes

- Unless you are using docker (in that case all is already updated), please update Matterbridge to >=1.5.5 to work with matterbridge-zigbee2mqtt >=2.1.17. This is a one time issue due to the update to matter.js 0.10.x.

## [2.1.17] - 2024-09-20

### Changed

- [matterbridge]: Removed Matterbridge deprecated method to get the child endpoints.
- [package]: Updated dependencies.
- [plugin]: Moved trigger code to matterbridge triggerSwitchEvent.

### Added

- [matterbridge]: Added a check of the current Matterbridge version (required v1.5.5).
- [plugin]: Added configuration of ColorControl cluster features (HS, XY, CT).
- [plugin]: Removed the superset device types.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.16] - 2024-09-04

### Changed

- [package]: Final update to matter.js 0.10.0.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.15] - 2024-09-03

### Changed

- [package]: Updated Thermostat cluster to matter.js 0.10.0.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.14] - 2024-08-29

### Added

- [config]: Added parameter postfixHostname (default true). If you change it, the controllers will remove and recreate all the devices! (https://github.com/L2jLiga)

### Changed

- [package]: Updated dependencies.
- [package]: Updated imports.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.13] - 2024-08-22

### Changed

- [package]: Updated dependencies.

### Fixed

- [package]: Fixed MQTT protocol.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.12] - 2024-08-21

### Changed

- [schema]: Changed schema file to add MQTT protocol.
- [schema]: Changed descriptions in schema for easier setup.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.11] - 2024-08-20

### Changed

- [package]: Updated dependencies.
- [package]: Update mqtt to 5.10.0.

### Fixed

- [package]: Fixed dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.10] - 2024-08-09

### Changed

- [package]: Updated dependencies.
- [package]: Update mqtt to 5.9.1.

### Fixed

- [z2m]: Fixed issue: 'Only supported EndpointInterface implementation is Endpoint'.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.9] - 2024-07-28

### Changed

- [package]: Updated dependencies.
- [logger]: Update node-ansi-logger to 2.0.6.
- [storage]: Update node-persist-manager to 1.0.8.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.8] - 2024-07-23

### Changed

- [z2m]: Updated matterbridge imports.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.7] - 2024-07-11

### Fixed

- [z2m]: Fixed trigger when the endpoint is undefined.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.6] - 2024-07-10

### Changed

- [package]: Updated dependencies.
- [imports]: Updated matterbridge imports.

### Fixed

- [z2m]: Fixed the detection of color_temp only lights.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.5] - 2024-07-01

### Changed

- [z2m]: Added transition to ColorControl if the zigbee device supports it and the controller sends it. You can disable this globally adding transition to the featureBlackList or only for the single device adding transition to the deviceFeatureBlackList. (Thanks Stefan Schweiger).

### Fixed

- [zigbee]: Fixed WindowCovering.targetPositionLiftPercent100ths update (Thanks Nitay Ben-Zvi).

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.4] - 2024-06-30

### Changed

- [dependencies]: Update dependencies.
- [dependencies]: Update eslint to 9.6.0.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.3] - 2024-06-23

### Added

- [zigbee]: Added new properties: co - CarbonMonoxideConcentrationMeasurement, co2 - CarbonDioxideConcentrationMeasurement, formaldehyd - FormaldehydeConcentrationMeasurement, pm1 - Pm1ConcentrationMeasurement, pm25 - Pm25ConcentrationMeasurement, pm10 - Pm10ConcentrationMeasurement

### Changed

- [bridge/info]: Log error when advanced.output is set to 'attribute'.

### Fixed

- [bridge/info]: Fixed the issue when advanced.output is set 'attribute_and_json'. (Thanks copystring).
- [bridge/info]: Fixed the issue when include_device_information is set to true. (Thanks copystring).

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.2] - 2024-06-21

### Added

- [dependencies]: Update dependencies.
- [start]: Refactor start sequence.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.1.1] - 2024-06-20

### Added

- [dependencies]: Update dependencies (mqtt to 5.7.2).
- [schema]: Added info log when the plugin starts to register devices and groups. Added empty bridge/config and bridge/definitions handlers.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

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

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.17] - 2024-06-16

### Fixed

- [LevelControl]: Fixed the issue that caused LevelControl missing in child endpoint (Thanks jpadie).

### Added

- [dependencies]: Update dependencies

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.16] - 2024-06-06

### Added

- [dependencies]: Update dependencies
- [matterbridge]: Added bridgeOnline to the start checks.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.15] - 2024-06-01

### Added

- [dependencies]: Update dependencies
- [matterbridge]: Adapted the code to the new start mode of Matterbridge.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.14] - 2024-05-09

### Added

- [mqtt]: Added Keekalive to MQTT.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.13] - 2024-05-02

### Added

- [groups]: Added ColorControl.

### Fixed

- [payload]: Fixed the case when z2m sends empty action in the payload.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [2.0.12] - 2024-04-30

### Added

- [action]: Added support for devices with more then 3 events/actions. All SwitchCluster actions are mapped in groups of 3 on sub endpoints. The mapping schema is shown in log.
- [mqtt]: Added handles for group_add, group_remove, group_rename, group_add_member and group_remove_member

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

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
