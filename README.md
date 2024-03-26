# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge zigbee2mqtt plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-zigbee2mqtt.svg)](https://www.npmjs.com/package/matterbridge-zigbee2mqtt)
![Node.js CI](https://github.com/Luligu/matterbridge-zigbee2mqtt/actions/workflows/build%20matterbridge%20plugin.yml/badge.svg)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-matter--history-blue)](https://www.npmjs.com/package/matter-history)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

Matterbridge zigbee2mqtt is production-level plugin that expose all zigbee2mqtt devices and groups to Matter.

## Prerequisites

### Matterbridge

See the guidelines on [Matterbridge](https://github.com/Luligu/matterbridge/blob/main/README.md) for more information.

### Zigbee2mqtt

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

# Config file

If needed you can configure the mqtt host, port, topic, username and password.

If the whiteList is defined only the devices included are exposed to Matter.

If the blackList is defined the devices included will not be exposed to Matter.

If any device creates issues put it in the blackList.

```
{
  "name": "matterbridge-zigbee2mqtt",
  "type": "DynamicPlatform",
  "host": "localhost",
  "port": 1883,
  "topic": "zigbee2mqtt",
  "username": "",
  "password": "",
  "whiteList": [],
  "blackList": []
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
