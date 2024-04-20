# Changelog

All notable changes to this project will be documented in this file.

## [2.0.10] - 2024-04-21

### Added

- [z2m]: Added a check for duplicated mqtt messages.

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
