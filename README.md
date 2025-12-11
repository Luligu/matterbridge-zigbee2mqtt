# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge?label=docker%20version&sort=semver)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge.svg)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-zigbee2mqtt/actions/workflows/build-matterbridge-plugin.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-zigbee2mqtt/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-zigbee2mqtt/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-zigbee2mqtt)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-matter--history-blue)](https://www.npmjs.com/package/matter-history)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

Matterbridge zigbee2mqtt is a matterbridge production-level plugin that expose all zigbee2mqtt devices and groups to Matter. Scenes are supported too.

No hub or dedicated hardware needed.

No cloud: all is local and fast.

The connection to the MQTT broker is possible with **mqtt** (tcp), **mqtts** (tls), **mqtt+unix** (Unix socket), **ws** (web socket) and **wss** (secure web socket). Self signed certificates and mutual tls are supported too.

Interested in super fast and autonomous **[automations for zigbee2mqtt](https://github.com/Luligu/zigbee2mqtt-automations)**? Try this: https://github.com/Luligu/zigbee2mqtt-automations.

If you like this project and find it useful, please consider giving it a star on [GitHub](https://github.com/Luligu/matterbridge-zigbee2mqtt) and sponsoring it.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/bmc-button.svg" alt="Buy me a coffee" width="120"></a>

## Introduction

Matterbridge enables non-Matter devices (Zigbee devices) to integrate with the Matter communication protocol. Bridges allow platforms that use other protocol standards to interoperate with the Matter ecosystem by integrating a Matter server into, or between, existing smart gateways, controllers, and hubs. Many commercial smart gateways provide a built-in Matter bridge that translates Matter to Zigbee or other protocols, making it possible for other ecosystems to communicate with them.

The Matterbridge zigbee2mqtt plugin acts as a Matter Bridge, exposing all Zigbee devices, groups and scenes from [Zigbee2MQTT](https://github.com/Koenkk/zigbee2mqtt/blob/master/README.md) as Matter devices to third-party Matter controllers like Apple Home, Google Home, Amazon Alexa, and SmartThings, all while remaining local on the user's network. This allows fast, secure, and cloud-free control of Zigbee2MQTT-connected Zigbee devices from all major voice assistants as well as other third-party Matter clients.

## Prerequisites

### Matterbridge

See the guidelines on [Matterbridge](https://matterbridge.io/README.html) for more information.

### Zigbee2mqtt

See the guidelines on [zigbee2mqtt](https://www.zigbee2mqtt.io/) for more information.

## How to install the plugin

### With the frontend (preferred method)

Just open the frontend, select the matterbridge-zigbee2mqtt plugin and click on install. If you are using Matterbridge with Docker (I suggest you do it), all plugins are already loaded in the container so you just need to select and add it.

### Without the frontend

On windows:

```
cd $HOME\Matterbridge
npm install -g matterbridge-zigbee2mqtt --omit=dev
matterbridge -add matterbridge-zigbee2mqtt
```

On linux and macOS:

```
cd ~/Matterbridge
sudo npm install -g matterbridge-zigbee2mqtt --omit=dev
matterbridge -add matterbridge-zigbee2mqtt
```

Then start Matterbridge

```
matterbridge
```

## If you want to contribute to the plugin

Clone the plugin

```
cd ~/Matterbridge
git clone https://github.com/Luligu/matterbridge-zigbee2mqtt
cd matterbridge-zigbee2mqtt
npm ci
npm run dev:link
npm run build
matterbridge -add .
```

Then start Matterbridge

```
matterbridge
```

# Config file

All configurations can (and should) be done with the frontend.

If needed you can configure the mqtt host, port, topic, username and password.

If the whiteList is defined only the devices included are exposed to Matter.

If the blackList is defined the devices included will not be exposed to Matter.

If any device creates issues put it in the blackList.

The switchList, lightList and outletList are used if you want to expose the z2m device like switch, light or outlet.

The featureBlackList allows to globally (for all devices) blacklist a z2m feature if you don't want to expose it (e.g. device_temperature).

The deviceFeatureBlackList allows to blacklist a z2m feature for a single device if you don't want to expose it (e.g. temperature for a motion sensor).

The scenesType enable and set how to expose the scenes.

The scenesPrefix enable the prefix with device/grop name to the scene device.

The debug option allows to set the debug mode only for the plugin.

The unregisterOnShutdown option allows to remove from the bridge all z2m devices when you shut down Matterbridge.

These are the default vules:

```json
{
  "name": "matterbridge-zigbee2mqtt",
  "type": "DynamicPlatform",
  "version": "3.0.0",
  "host": "mqtt://localhost",
  "port": 1883,
  "protocolVersion": 5,
  "topic": "zigbee2mqtt",
  "username": "",
  "password": "",
  "clientId": "",
  "ca": "",
  "cert": "",
  "key": "",
  "rejectUnauthorized": true,
  "whiteList": [],
  "blackList": [],
  "switchList": [],
  "lightList": [],
  "outletList": [],
  "featureBlackList": [],
  "deviceFeatureBlackList": {},
  "scenesType": "outlet",
  "scenesPrefix": true,
  "postfix": "",
  "debug": false,
  "unregisterOnShutdown": false
}
```

If you want to exclude "device_temperature" for all the devices, add to the config

```json
{
  ...
  "featureBlackList": ["device_temperature"]
  ...
}
```

If you want to exclude "temperature" and "humidity" for the device "My motion sensor" and
"device_temperature" only for the device "My climate sensor", add to the config

```json
{
  ...
  "deviceFeatureBlackList": {
    "My motion sensor": ["temperature", "humidity"],
    "My climate sensor": ["device_temperature"]
  }
  ...
}
```

From the release 1.2.14 of Matterbridge you can edit the config file directly in the frontend. I strongly suggest you use the integrated config editor.

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

Out of the box, this plugin supports all possible conversion from zigbee2mqtt to Matter 1.4.

It also supports all clusters in the multi endpoints devices (e.g. DIY devices or the double channel switches/dimmers).

Since the Matter support in the available ecosystems (controllers) is sometimes limited and, when available, only covers Matter 1.2 specifications, some z2m devices cannot be exposed properly or cannot be exposed at all.

## Scenes in groups and devices

With release 2.5.0 has been added support for scenes in groups and devices.

In the config select what device type you want to use to expose the command that runs the scene: 'light' | 'outlet' | 'switch' | 'mounted_switch'.

Switch is not supported by Alexa. Mounted Switch is not supported by Apple Home.

The virtual device takes the name of the group or device it belongs to, with added the name of scene. If scenesPrefix is disabled, it takes only the name of the scene. Consider that in Matter the node name is 32 characters long. Consider also that each scene name must by unique if scenesPrefix is disabled.

The state of the virtual device is always reverted to off in a few seconds.

It is possibile to disable the feature globally with featureBlackList (add "scenes" to the list) and on a per device/group base with deviceFeatureBlackList (add "scenes" to the list).

## Availability

If the availability is enabled in zigbee2mqtt settings, it is used to set the corresponding device/group reachable or not.

[Screenshot](https://github.com/user-attachments/assets/7e0d395f-19e4-4e7f-b263-0cae3df70be4)

## Retain

If the retain option is enabled in zigbee2mqtt settings or device setting, at restart all retained states are updated. I suggest to use this option expecially for battery powered devices.

To enable retain globally, stop zigbee2mqtt, add retain: true to device_options and restart zigbee2mqtt.

```
device_options:
  retain: true
```

To enable retain for a single device set it in the device settings.

[Screenshot](https://github.com/user-attachments/assets/5ae09f2a-6cff-4623-92f4-87f7721ee443)

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

## Unix socket (Linux only)

**Note**: Unix domain sockets (mqtt+unix://) are always local and do not support TLS. Security is enforced through filesystem permissions on the socket file.

### Create the directory for the Unix socket on the host

```bash
# Create the directory for the Unix socket if it doesn't exist
sudo mkdir -p /var/run/mosquitto

# Make sure the mosquitto user can access the socket
sudo chown mosquitto:mosquitto /var/run/mosquitto

# Allow group users (e.g. matterbridge) to access the socket
sudo chmod 750 /var/run/mosquitto

# Add your user to the mosquitto group to access the socket without sudo
sudo usermod -aG mosquitto $USER

# If matterbridge runs like user matterbridge, add the matterbridge user to the mosquitto group to access the socket without sudo
sudo usermod -aG mosquitto matterbridge
```

Log out and back in after running usermod -aG for the group changes to take effect.

```bash
# Check the appropriate permissions for the directory
sudo -u mosquitto ls -ld /var/run/mosquitto
sudo -u mosquitto ls -l /var/run/mosquitto/mqtt.sock
```

### Configure mosquitto to use Unix socket on the host

Add this to your mosquitto.conf

```
# Unix socket listener
listener 0 /var/run/mosquitto/mqtt.sock
protocol mqtt
allow_anonymous false
```

Restart mosquitto.

```bash
sudo systemctl restart mosquitto
```

### Configure docker to use Unix socket

Create the directory on the host

```bash
mkdir -p "$HOME/mosquitto/run"
sudo chown 1883:1883 "$HOME/mosquitto/run"
sudo chmod 770 "$HOME/mosquitto/run"
```

Add the unix socket volume for each service using it (i.e. mosquitto, zigbee2mqtt and matterbridge).

```
  volumes:
    - "${HOME}/mosquitto/run:/var/run/mosquitto"
```

# Known issues

For general controller issues check the Matterbridge Known issues section

[See the known issues here](https://github.com/Luligu/matterbridge?tab=readme-ov-file#known-general-issues)
