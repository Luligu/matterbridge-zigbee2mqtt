# Changelog

All notable changes to this project will be documented in this file.

## [2.0.7] - 2024-04-10

### Fixed

- [payload]: Fixed the case when z2m has some issues and send null or undefined in the payload (https://github.com/khaidakin).

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
