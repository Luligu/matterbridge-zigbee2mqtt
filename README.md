# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge?label=docker%20version&sort=semver)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge.svg)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-zigbee2mqtt/actions/workflows/build%20matterbridge%20plugin.yml/badge.svg)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-matter--history-blue)](https://www.npmjs.com/package/matter-history)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

Matterbridge zigbee2mqtt is a matterbridge production-level plugin that expose all zigbee2mqtt devices and groups to Matter.

No hub or dedicated hardware needed.

## Prerequisites

### Matterbridge

Follow these steps to install or update Matterbridge if it is not already installed and up to date:

on Windows:

```
npm install -g matterbridge
```

on Linux (you need the necessary permissions):

```
sudo npm install -g matterbridge
```

See the complete guidelines on [Matterbridge](https://github.com/Luligu/matterbridge/blob/main/README.md) for more information.

### Zigbee2mqtt

A fully working installation of zigbee2MQTT is required.

See the guidelines on [zigbee2mqtt](https://github.com/Koenkk/zigbee2mqtt/blob/master/README.md) for more information.

## How to install

### If you want to use the plugin

On windows:

```
cd $HOME\Matterbridge
npm install -g matterbridge-zigbee2mqtt
matterbridge -add matterbridge-zigbee2mqtt
```

On linux:

```
cd ~/Matterbridge
sudo npm install -g matterbridge-zigbee2mqtt
matterbridge -add matterbridge-zigbee2mqtt
```

Then start Matterbridge

```
matterbridge -bridge
```

### If you want to contribute to the plugin

On windows:

```
cd $HOME\Matterbridge
git clone https://github.com/Luligu/matterbridge-zigbee2mqtt
cd matterbridge-zigbee2mqtt
npm install
npm run build
matterbridge -add .\
```

On linux:

```
cd ~/Matterbridge
git clone https://github.com/Luligu/matterbridge-zigbee2mqtt
cd matterbridge-zigbee2mqtt
npm install
npm run build
matterbridge -add ./
```

Then start Matterbridge

```
matterbridge -bridge
```

# Config file

If needed you can configure the mqtt host, port, topic, username and password.

If the whiteList is defined only the devices included are exposed to Matter.

If the blackList is defined the devices included will not be exposed to Matter.

If any device creates issues put it in the blackList.

The switchList, lightList and outletList are used if you want to expose the z2m device like switch, light or outlet.

The featureBlackList allows to globally (for all devices) blacklist a z2m feature if you don't want to expose it (e.g. device_temperature).

The deviceFeatureBlackList allows to blacklist a z2m feature for a single device if you don't want to expose it (e.g. temperature for a motion sensor).

The unregisterOnShutdown option allows to remove from the bridge all z2m devices when you shut down Matterbridge.

These are the default vules:

```
{
  "name": "matterbridge-zigbee2mqtt",
  "type": "DynamicPlatform",
  "unregisterOnShutdown": false,
  "host": "localhost",
  "port": 1883,
  "topic": "zigbee2mqtt",
  "username": "",
  "password": "",
  "whiteList": [],
  "blackList": [],
  "switchList": [],
  "lightList": [],
  "outletList": [],
  "featureBlackList": [],
  "deviceFeatureBlackList": {}
}
```

If you want to exclude "device_temperature" for all the devices, add to the config

```
{
  ...
  "featureBlackList": ["device_temperature"]
  ...
}
```

If you want to exclude "temperature" and "humidity" for the device "My motion sensor" and
"device_temperature" only for the device "My climate sensor", add to the config

```
{
  ...
  "deviceFeatureBlackList": {
    "My motion sensor": ["temperature", "humidity"],
    "My climate sensor": ["device_temperature"]
  }
  ...
}
```

From the release 1.2.14 of Matterbridge you can edit the config file directly in the frontend.

You can edit the config file manually if you prefer:

- shutdown Matterbridge before: if you use docker send docker stop matterbridge;
- edit and save the config;
- start Matterbridge: if you use docker send docker start matterbridge.

On windows:

```
cd $HOME\.matterbridge
notepad matterbridge-zigbee2mqtt.config.json
```

On linux:

```
cd ~/.matterbridge
nano matterbridge-zigbee2mqtt.config.json
```

# Frequently Asked Questions

## What is supported?

Out of the box, this plugin supports all possible conversion from zigbee2mqtt to Matter 1.1.

The latest release also supports all clusters in the multi endpoints devices (e.g. DIY devices or the double channel switches/dimmers).

Since the Matter support in the available ecosystems (controllers) is sometimes limited and, when available, only covers Matter 1.1 specifications, some z2m devices cannot be exposed properly or cannot be exposed at all.

We discoverd that Matter support in Home Assistant includes some clusters not supported by other ecosystems. These clusters like EveHistory have been added so with HA you can see Voltage, Current, Consumption and TotalConsumption (screenshot https://github.com/Luligu/matterbridge/blob/main/screenshot/Screenshot%20HA%20sm-dc-power-m.png).

## Unsupported devices

If one of your devices is not supported out of the box, open an issue and we will try to support it if possible.

## Conversion strategies between zigbee2MQTT and Matter ecosystems

- The Coordinator and the dedicated routers (Texas.Instruments and SMLIGHT) are exposed like DoorLock. They change state when permitJoin is changed from z2m and turn on or off permitJoin when they are opened or closed from the controller. If you don't want to see them in the controller app just add them to the blackList.

- Scene buttons are now fully exposed (all actions). The actions are mapped in groups of 3, with each group on a sub endpoint. This is because the controllers expose event in group of single, double, long press.
  In the log you will find the mapping schema like this one:

```
[16:25:14.321] [Smart button] Device Smart button has actions mapped to these switches on sub endpoints:
[16:25:14.321] [Smart button]    controller events      <=> zigbee2mqtt actions
[16:25:14.322] [Smart button] -- Button 1: Single Press <=> single
[16:25:14.323] [Smart button] -- Button 1: Double Press <=> double
[16:25:14.323] [Smart button] -- Button 1: Long Press   <=> hold
[16:25:14.323] [Smart button] -- Button 2: Single Press <=> brightness_move_to_level
[16:25:14.324] [Smart button] -- Button 2: Double Press <=> color_temperature_move
[16:25:14.324] [Smart button] -- Button 2: Long Press   <=> brightness_step_up
[16:25:14.324] [Smart button] -- Button 3: Single Press <=> brightness_step_down
[16:25:14.324] [Smart button] -- Button 3: Double Press <=> on
[16:25:14.325] [Smart button] -- Button 3: Long Press   <=> off
```

![See the screenshot here](https://github.com/Luligu/matterbridge-zigbee2mqtt/blob/main/screenshot/Smart%20button.png)

# Known issues

For general controller issues check the Matterbridge Known issues section

[See the known issues here](https://github.com/Luligu/matterbridge?tab=readme-ov-file#known-issues)

## Apple Home

## Home Assistant (Matter Server is still in Beta)

## Google Home

## Alexa

In the plugin config add each switch device to the lightList or outletList cause they don't show up like switch (Matterbridge uses a modified switch device type without client cluster that Alexa doesn't recognize).

## SmartThings

## eWeLink

## Tuya/Smart Life
