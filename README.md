# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
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

The 3 switchList, lightList and outletList are used if you want to expose the z2m device like switch, light or outlet.

The featureBlackList allows to blacklist a z2m feature if you don't want to expose it (e.g. device_temperature).

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
  "featureBlackList": []
}
```

You can edit the config file:

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

Since the Matter support in the available ecosystems (controllers) is very limited and, when available, only covers Matter 1.1 specifications, some z2m devices cannot be exposed properly or cannot be exposed at all.

We discoverd that Matter support in Home Assistant is instead advanced and includes some clusters not supported by other ecosystems. These clusters like EveHistory have been added so with HA you can see Voltage, Current, Consumption and TotalConsumption (screenshot https://github.com/Luligu/matterbridge/blob/main/screenshot/Screenshot%20HA%20sm-dc-power-m.png).
## Unsupported devices

If one of your devices is not supported out of the box, open an issue and we will try to support it if possible.

# Known issues

## Conversion issues between zigbee2MQTT and Matter ecosystems

## Apple Home issues

### DoorLock
The DoorLock cluster in the Home app takes a while to get online. The Home app shows no response for 1 or 2 seconds but then the accessory goes online.

## Home Assistant issues (Matter Server for HA is still in Beta)

