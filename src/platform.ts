/**
 * This file contains the class ZigbeePlatform.
 *
 * @file platform.ts
 * @author Luca Liguori
 * @date 2023-12-29
 * @version 2.0.3
 *
 * Copyright 2023, 2024 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. *
 */

import { Level, Logger, Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { AnsiLogger, dn, gn, db, wr, zb, payloadStringify, rs } from 'node-ansi-logger';

import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup, BridgedBaseDevice } from './entity.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';
import path from 'path';

export class ZigbeePlatform extends MatterbridgeDynamicPlatform {
  // platform
  private bridgedDevices: BridgedBaseDevice[] = [];
  private bridgedEntities: ZigbeeEntity[] = [];

  // z2m
  private mqttHost = 'localhost';
  private mqttPort = 1883;
  private mqttTopic = 'zigbee2mqtt';
  private mqttUsername = '';
  private mqttPassword = '';
  private whiteList: string[] = [];
  private blackList: string[] = [];

  // zigbee2Mqtt
  public debugEnabled: boolean;
  public shouldStart: boolean;
  public shouldConfigure: boolean;
  public z2m: Zigbee2MQTT;
  public z2mDevicesRegistered = false;
  public z2mGroupsRegistered = false;
  private z2mBridgeInfo: BridgeInfo | undefined;
  private z2mBridgeDevices: BridgeDevice[] | undefined;
  private z2mBridgeGroups: BridgeGroup[] | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    this.debugEnabled = matterbridge.debugEnabled;
    this.shouldStart = false;
    this.shouldConfigure = false;

    if (config.host) this.mqttHost = config.host as string;
    if (config.port) this.mqttPort = config.port as number;
    if (config.topic) this.mqttTopic = config.topic as string;
    if (config.username) this.mqttUsername = config.username as string;
    if (config.password) this.mqttPassword = config.password as string;
    if (config.whiteList) this.whiteList = config.whiteList as string[];
    if (config.blackList) this.blackList = config.blackList as string[];
    // Save back to create a default plugin config.json
    config.host = this.mqttHost;
    config.port = this.mqttPort;
    config.topic = this.mqttTopic;
    config.username = this.mqttUsername;
    config.password = this.mqttPassword;
    config.whiteList = this.whiteList;
    config.blackList = this.blackList;
    this.log.info(`Loaded zigbee2mqtt parameters from ${path.join(matterbridge.matterbridgeDirectory, 'matterbridge-zigbee2mqtt.config.json')}:\n${rs}` /*, config*/);

    this.z2m = new Zigbee2MQTT(this.mqttHost, this.mqttPort, this.mqttTopic, this.mqttUsername, this.mqttPassword);
    this.z2m.setDataPath(path.join(matterbridge.matterbridgePluginDirectory, 'matterbridge-zigbee2mqtt'));

    this.z2m.start();

    this.z2m.on('mqtt_connect', () => {
      this.log.debug(`zigbee2MQTT connected to MQTT server ${this.z2m.mqttHost}:${this.z2m.mqttPort}`);
      this.z2m.subscribe(this.z2m.mqttTopic + '/#');
    });

    this.z2m.on('online', () => {
      this.log.info('zigbee2MQTT is online');
      // TODO check single availability
      //this.updateAvailability(true);
    });

    this.z2m.on('offline', () => {
      this.log.warn('zigbee2MQTT is offline');
      // TODO check single availability
      //this.updateAvailability(false);
    });

    this.z2m.on('bridge-info', async (bridgeInfo: BridgeInfo) => {
      this.z2mBridgeInfo = bridgeInfo;
      this.log.debug(`zigbee2MQTT sent bridge-info version: ${this.z2mBridgeInfo.version}`);
    });

    this.z2m.on('bridge-devices', async (devices: BridgeDevice[]) => {
      this.z2mBridgeDevices = devices;
      if (this.shouldStart) {
        if (!this.z2mDevicesRegistered && this.z2mBridgeDevices) {
          for (const device of this.z2mBridgeDevices) {
            await this.registerZigbeeDevice(device);
          }
          this.z2mDevicesRegistered = true;
        }
      }
      if (this.shouldConfigure) {
        this.log.info(`Configuring ${this.bridgedEntities.length} zigbee entities.`);
        for (const bridgedEntity of this.bridgedEntities) {
          if (bridgedEntity.isDevice && bridgedEntity.device) await this.requestDeviceUpdate(bridgedEntity.device);
        }
        for (const device of this.bridgedDevices) {
          device.configure();
        }
      }
      this.log.debug(`zigbee2MQTT sent ${devices.length} devices ${this.z2mDevicesRegistered ? 'already registered' : ''}`);
    });

    this.z2m.on('bridge-groups', async (groups: BridgeGroup[]) => {
      this.z2mBridgeGroups = groups;
      if (this.shouldStart) {
        if (!this.z2mGroupsRegistered && this.z2mBridgeGroups) {
          for (const group of this.z2mBridgeGroups) {
            await this.registerZigbeeGroup(group);
          }
          this.z2mGroupsRegistered = true;
        }
      }
      if (this.shouldConfigure) {
        this.log.info(`Configuring ${this.bridgedEntities.length} zigbee entities.`);
        for (const bridgedEntity of this.bridgedEntities) {
          if (bridgedEntity.isGroup && bridgedEntity.group) await this.requestGroupUpdate(bridgedEntity.group);
        }
        for (const device of this.bridgedDevices) {
          device.configure();
        }
      }
      this.log.debug(`zigbee2MQTT sent ${groups.length} groups ${this.z2mGroupsRegistered ? 'already registered' : ''}`);
    });

    this.log.debug('Created zigbee2mqtt dynamic platform');
  }

  override async onStart(reason?: string) {
    this.log.debug('Starting zigbee2mqtt dynamic platform: ' + reason);

    if (!this.z2mDevicesRegistered || !this.z2mGroupsRegistered) {
      this.shouldStart = true;
      this.log.warn('Setting should start zigbee2mqtt dynamic platform: ', reason);
    }

    if (this.debugEnabled) Logger.defaultLogLevel = Level.INFO;

    if (!this.z2mDevicesRegistered && this.z2mBridgeDevices) {
      for (const device of this.z2mBridgeDevices) {
        await this.registerZigbeeDevice(device);
      }
      this.z2mDevicesRegistered = true;
    }

    if (!this.z2mGroupsRegistered && this.z2mBridgeGroups) {
      for (const group of this.z2mBridgeGroups) {
        await this.registerZigbeeGroup(group);
      }
      this.z2mGroupsRegistered = true;
    }

    if (this.debugEnabled) Logger.defaultLogLevel = Level.DEBUG;
  }

  override async onConfigure() {
    if (!this.z2mDevicesRegistered || !this.z2mGroupsRegistered) {
      this.shouldConfigure = true;
      this.log.warn('Setting should configure zigbee2mqtt dynamic platform');
    }

    this.log.info(`Configuring ${this.bridgedEntities.length} zigbee entities.`);
    for (const bridgedEntity of this.bridgedEntities) {
      if (bridgedEntity.isDevice && bridgedEntity.device) await this.requestDeviceUpdate(bridgedEntity.device);
      if (bridgedEntity.isGroup && bridgedEntity.group) await this.requestGroupUpdate(bridgedEntity.group);
    }

    this.log.info(`Configuring ${this.bridgedDevices.length} matter devices.`);
    for (const device of this.bridgedDevices) {
      device.configure();
    }
  }

  override async onShutdown(reason?: string) {
    this.log.debug('Shutting down zigbee2mqtt platform: ' + reason);
    //this.updateAvailability(false);
    await this.unregisterAllDevices();
    this.z2m.stop();
  }

  private async requestDeviceUpdate(device: BridgeDevice) {
    this.log.debug(`Requesting update for ${device.friendly_name} model_id: ${device.model_id} manufacturer: ${device.manufacturer}`);
    const payload: Payload = {};
    if (device.power_source === 'Battery' || !device.definition || !device.definition.exposes) return;
    for (const feature of device.definition.exposes) {
      if (feature.features) {
        for (const subFeature of feature.features) {
          if (subFeature.access & 0b100) {
            payload[subFeature.property] = '';
          }
        }
      }
      if (feature.access & 0b100) {
        payload[feature.property] = '';
      }
    }
    if (payload && Object.keys(payload).length > 0) {
      const topic = this.z2m.mqttTopic + '/' + device.friendly_name + '/get';
      await this.z2m.publish(topic, payloadStringify(payload), false);
    }
  }

  private async requestGroupUpdate(group: BridgeGroup) {
    this.log.debug(`Requesting update for ${group.friendly_name}`);
    const payload: Payload = {};
    payload['state'] = '';
    if (payload && Object.keys(payload).length > 0) {
      const topic = this.z2m.mqttTopic + '/' + group.friendly_name + '/get';
      await this.z2m.publish(topic, payloadStringify(payload), false);
    }
  }

  public validateWhiteBlackList(entityName: string) {
    if (this.whiteList.length > 0 && !this.whiteList.find((name) => name === entityName)) {
      this.log.warn(`Skipping ${dn}${entityName}${wr} because not in whitelist`);
      return false;
    }
    if (this.blackList.length > 0 && this.blackList.find((name) => name === entityName)) {
      this.log.warn(`Skipping ${dn}${entityName}${wr} because in blacklist`);
      return false;
    }
    return true;
  }

  private async registerZigbeeDevice(device: BridgeDevice) {
    if (!this.validateWhiteBlackList(device.friendly_name)) {
      return;
    }
    this.log.debug(`Registering device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    const matterDevice = new ZigbeeDevice(this, device);
    if (matterDevice.bridgedDevice) {
      await this.registerDevice(matterDevice.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterDevice.bridgedDevice);
      this.bridgedEntities.push(matterDevice);
      this.log.debug(`Registered device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    } else this.log.warn(`Device ${dn}${device.friendly_name}${wr} ID: ${device.ieee_address} not registered`);
  }

  public async registerZigbeeGroup(group: BridgeGroup) {
    if (!this.validateWhiteBlackList(group.friendly_name)) {
      return;
    }
    this.log.debug(`Registering group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    const matterGroup = new ZigbeeGroup(this, group);
    if (matterGroup.bridgedDevice) {
      await this.registerDevice(matterGroup.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterGroup.bridgedDevice);
      this.bridgedEntities.push(matterGroup);
      this.log.debug(`Registered group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    } else this.log.warn(`Group ${gn}${group.friendly_name}${wr} ID: ${group.id} not registered`);
  }

  /*
  public async unregisterAll() {
    this.log.warn(`Unregistering ${this.bridgedEntities.length} accessories`);
    
    for (const bridgedDevice of this.bridgedDevices) {
      this.log.warn(`- ${bridgedDevice.deviceName} ${bridgedDevice.id} (${bridgedDevice.name})`);
      this.matterAggregator?.removeBridgedDevice(bridgedDevice);
    }
    
    this.bridgedDevices.splice(0);
    for (const bridgedEntity of this.bridgedEntities) {
      this.log.warn(`- ${bridgedEntity.bridgedDevice?.deviceName} ${bridgedEntity.bridgedDevice?.id} (${bridgedEntity.bridgedDevice?.name})`);
      await this.unregisterDevice(bridgedEntity.bridgedDevice as unknown as MatterbridgeDevice);
    }
    this.bridgedEntities.splice(0);
  }
  */

  public updateAvailability(available: boolean) {
    this.log.debug(`Setting availability for ${this.bridgedDevices.length} accessories`);
    for (const bridgedDevice of this.bridgedDevices) {
      bridgedDevice.setBridgedDeviceReachability(available);
    }
  }
}
