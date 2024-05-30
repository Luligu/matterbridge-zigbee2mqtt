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

import { BridgedDeviceBasicInformationCluster, DoorLock, DoorLockCluster, Level, Logger, Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform, PlatformConfig } from 'matterbridge';
import { AnsiLogger, dn, gn, db, wr, zb, payloadStringify, rs, debugStringify } from 'node-ansi-logger';

import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup, BridgedBaseDevice } from './entity.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';
import path from 'path';

type DeviceFeatureBlackList = {
  [key: string]: string[];
};

export class ZigbeePlatform extends MatterbridgeDynamicPlatform {
  // extension
  private publishCallBack: ((entityName: string, topic: string, message: string) => Promise<void>) | undefined = undefined;
  private permitJoinCallBack: ((entityName: string, permit: boolean) => Promise<void>) | undefined = undefined;

  // platform
  private bridgedDevices: BridgedBaseDevice[] = [];
  private zigbeeEntities: ZigbeeEntity[] = [];
  private injectTimer: NodeJS.Timeout | undefined;

  // z2m
  private mqttHost = 'localhost';
  private mqttPort = 1883;
  private mqttTopic = 'zigbee2mqtt';
  private mqttUsername = '';
  private mqttPassword = '';
  private whiteList: string[] = [];
  private blackList: string[] = [];
  public lightList: string[] = [];
  public outletList: string[] = [];
  public switchList: string[] = [];
  public featureBlackList: string[] = [];
  public deviceFeatureBlackList: DeviceFeatureBlackList = {};

  // zigbee2Mqtt
  public debugEnabled: boolean;
  public shouldStart: boolean;
  public shouldConfigure: boolean;
  public z2m!: Zigbee2MQTT;
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
    if (config.switchList) this.switchList = config.switchList as string[];
    if (config.lightList) this.lightList = config.lightList as string[];
    if (config.outletList) this.outletList = config.outletList as string[];
    if (config.featureBlackList) this.featureBlackList = config.featureBlackList as string[];
    if (config.deviceFeatureBlackList) this.deviceFeatureBlackList = config.deviceFeatureBlackList as DeviceFeatureBlackList;
    // Save back to create a default plugin config.json
    config.host = this.mqttHost;
    config.port = this.mqttPort;
    config.topic = this.mqttTopic;
    config.username = this.mqttUsername;
    config.password = this.mqttPassword;
    config.whiteList = this.whiteList;
    config.blackList = this.blackList;

    if (config.type === 'MatterbridgeExtension') {
      this.z2m = new Zigbee2MQTT(this.mqttHost, this.mqttPort, this.mqttTopic, this.mqttUsername, this.mqttPassword);
      this.z2m.setLogDebug(this.debugEnabled);
      this.log.debug('Created ZigbeePlatform as Matterbridge extension');
      return;
    }
    this.log.info(`Loaded zigbee2mqtt parameters from ${path.join(matterbridge.matterbridgeDirectory, 'matterbridge-zigbee2mqtt.config.json')}${rs}:`);
    // this.log.debug(`Config:')}${rs}`, config);

    this.z2m = new Zigbee2MQTT(this.mqttHost, this.mqttPort, this.mqttTopic, this.mqttUsername, this.mqttPassword);
    this.z2m.setLogDebug(this.debugEnabled);
    this.z2m.setDataPath(path.join(matterbridge.matterbridgePluginDirectory, 'matterbridge-zigbee2mqtt'));

    this.log.info(`Connecting to MQTT broker: ${'mqtt://' + this.mqttHost + ':' + this.mqttPort.toString()}`);
    this.z2m.start();

    this.z2m.on('mqtt_connect', () => {
      this.log.debug(`zigbee2MQTT connected to MQTT server ${this.z2m.mqttHost}:${this.z2m.mqttPort}`);
      this.z2m.subscribe(this.z2m.mqttTopic + '/#');
    });

    this.z2m.on('online', () => {
      this.log.info('zigbee2MQTT is online');
      // TODO check single availability
      this.updateAvailability(true);
    });

    this.z2m.on('offline', () => {
      if (this.z2mBridgeInfo === undefined) return;
      this.log.warn('zigbee2MQTT is offline');
      // TODO check single availability
      this.updateAvailability(false);
    });

    this.z2m.on('permit_join', async (device: string, time: number, status: boolean) => {
      this.log.info(`zigbee2MQTT sent permit_join device: ${device} time: ${time} status: ${status}`);
      for (const zigbeeEntity of this.zigbeeEntities) {
        if (zigbeeEntity.bridgedDevice?.isRouter && (device === undefined || device === zigbeeEntity.bridgedDevice.deviceName)) {
          this.log.info(`*- ${zigbeeEntity.bridgedDevice.deviceName} ${zigbeeEntity.bridgedDevice.number} (${zigbeeEntity.bridgedDevice.name})`);
          if (zigbeeEntity.device && status) {
            zigbeeEntity.bridgedDevice.getClusterServer(DoorLockCluster)?.setLockStateAttribute(DoorLock.LockState.Unlocked);
            zigbeeEntity.bridgedDevice.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
            this.log.info(`Device ${zigbeeEntity.entityName} unlocked`);
          }
          if (zigbeeEntity.device && !status) {
            zigbeeEntity.bridgedDevice.getClusterServer(DoorLockCluster)?.setLockStateAttribute(DoorLock.LockState.Locked);
            zigbeeEntity.bridgedDevice.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
            this.log.info(`Device ${zigbeeEntity.entityName} locked`);
          }
        }
      }
    });

    this.z2m.on('device_joined', async (friendly_name: string, ieee_address: string) => {
      this.log.info(`zigbee2MQTT sent device_joined device: ${friendly_name} ieee_address: ${ieee_address}`);
      // Here nothing to do, we wait eventually device_interview
    });

    this.z2m.on('device_announce', async (friendly_name: string, ieee_address: string) => {
      this.log.info(`zigbee2MQTT sent device_announce device: ${friendly_name} ieee_address: ${ieee_address}`);
      // Here nothing to do, we wait device_interview
    });

    this.z2m.on('device_leave', async (friendly_name: string, ieee_address: string) => {
      this.log.info(`zigbee2MQTT sent device_leave device: ${friendly_name} ieee_address: ${ieee_address}`);
      await this.unregisterZigbeeEntity(friendly_name);
    });

    this.z2m.on('device_remove', async (friendly_name: string, status: string, block: boolean, force: boolean) => {
      this.log.info(`zigbee2MQTT sent device_remove device: ${friendly_name} status: ${status} block: ${block} force: ${force}`);
      if (status === 'ok') await this.unregisterZigbeeEntity(friendly_name);
    });

    this.z2m.on('device_interview', async (friendly_name: string, ieee_address: string, status: string, supported: boolean) => {
      this.log.info(`zigbee2MQTT sent device_interview device: ${friendly_name} ieee_address: ${ieee_address} status: ${status} supported: ${supported}`);
      if (status === 'successful' && supported) {
        if (!this.validateWhiteBlackList(friendly_name)) return;
        this.log.info(`Registering device: ${friendly_name}`);
        const bridgedDevice = this.z2mBridgeDevices?.find((device) => device.friendly_name === friendly_name);
        if (bridgedDevice) await this.registerZigbeeDevice(bridgedDevice);
      }
    });

    this.z2m.on('device_rename', async (ieee_address: string, from: string, to: string) => {
      this.log.info(`zigbee2MQTT sent device_rename ieee_address: ${ieee_address} from: ${from} to: ${to}`);
      await this.unregisterZigbeeEntity(from);
      const bridgedDevice = this.z2mBridgeDevices?.find((device) => device.ieee_address === ieee_address);
      if (bridgedDevice) await this.registerZigbeeDevice(bridgedDevice);
    });

    this.z2m.on('device_options', async (ieee_address: string, status: string, from: object, to: object) => {
      this.log.info(`zigbee2MQTT sent device_options ieee_address: ${ieee_address} status ${status} from: ${debugStringify(from)} to: ${debugStringify(to)}`);
    });

    this.z2m.on('group_add', async (friendly_name: string, id: number, status: string) => {
      this.log.info(`zigbee2MQTT sent group_add friendly_name: ${friendly_name} id ${id} status ${status}`);
      if (!this.validateWhiteBlackList(friendly_name)) return;
      this.log.info(`Registering group: ${friendly_name}`);
      const bridgedGroup = this.z2mBridgeGroups?.find((group) => group.friendly_name === friendly_name);
      if (bridgedGroup) await this.registerZigbeeGroup(bridgedGroup);
    });

    this.z2m.on('group_remove', async (friendly_name: string, status: string) => {
      this.log.info(`zigbee2MQTT sent group_remove friendly_name: ${friendly_name} status ${status}`);
      if (status === 'ok') await this.unregisterZigbeeEntity(friendly_name);
    });

    this.z2m.on('group_rename', async (from: string, to: string, status: string) => {
      this.log.info(`zigbee2MQTT sent group_rename from: ${from} to ${to} status ${status}`);
      if (status === 'ok') {
        await this.unregisterZigbeeEntity(from);
        const bridgedGroup = this.z2mBridgeGroups?.find((group) => group.friendly_name === to);
        if (bridgedGroup) await this.registerZigbeeGroup(bridgedGroup);
      }
    });

    this.z2m.on('group_add_member', async (group_friendly_name: string, device_ieee_address: string, status: string) => {
      this.log.info(`zigbee2MQTT sent group_add_member group ${group_friendly_name} add device ieee_address ${device_ieee_address} status ${status}`);
      if (status === 'ok') {
        await this.unregisterZigbeeEntity(group_friendly_name);
        const bridgedGroup = this.z2mBridgeGroups?.find((group) => group.friendly_name === group_friendly_name);
        if (bridgedGroup) await this.registerZigbeeGroup(bridgedGroup);
      }
    });

    this.z2m.on('group_remove_member', async (group_friendly_name: string, device_friendly_name: string, status: string) => {
      this.log.info(`zigbee2MQTT sent group_remove_member group ${group_friendly_name} remove device friendly_name ${device_friendly_name} status ${status}`);
      if (status === 'ok') {
        await this.unregisterZigbeeEntity(group_friendly_name);
        const bridgedGroup = this.z2mBridgeGroups?.find((group) => group.friendly_name === group_friendly_name);
        if (bridgedGroup) await this.registerZigbeeGroup(bridgedGroup);
      }
    });

    this.z2m.on('bridge-info', async (bridgeInfo: BridgeInfo) => {
      this.z2mBridgeInfo = bridgeInfo;
      this.log.info(`zigbee2MQTT version ${this.z2mBridgeInfo.version} zh version ${this.z2mBridgeInfo.zigbee_herdsman.version} zhc version ${this.z2mBridgeInfo.zigbee_herdsman_converters.version}`);
    });

    this.z2m.on('bridge-devices', async (devices: BridgeDevice[]) => {
      this.log.info(`zigbee2MQTT sent ${devices.length} devices ${this.z2mDevicesRegistered ? 'already registered' : ''}`);
      if (config.injectDevices) {
        const data = this.z2m.readConfig(path.join(matterbridge.matterbridgeDirectory, config.injectDevices as string));
        this.log.warn(`***Injecting ${data.devices.length} devices from ${config.injectDevices}`);
        this.z2mBridgeDevices = [devices, data.devices].flat();
      } else this.z2mBridgeDevices = devices;

      if (this.shouldStart) {
        if (!this.z2mDevicesRegistered && this.z2mBridgeDevices) {
          for (const device of this.z2mBridgeDevices) {
            await this.registerZigbeeDevice(device);
          }
          this.z2mDevicesRegistered = true;
        }
      }
      if (this.shouldConfigure) {
        this.log.info(`Configuring ${this.zigbeeEntities.length} zigbee entities.`);
        for (const bridgedEntity of this.zigbeeEntities) {
          if (bridgedEntity.isDevice && bridgedEntity.device) await this.requestDeviceUpdate(bridgedEntity.device);
        }
        for (const device of this.bridgedDevices) {
          device.configure();
        }
      }
    });

    this.z2m.on('bridge-groups', async (groups: BridgeGroup[]) => {
      this.log.info(`zigbee2MQTT sent ${groups.length} groups ${this.z2mGroupsRegistered ? 'already registered' : ''}`);
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
        this.log.info(`Configuring ${this.zigbeeEntities.length} zigbee entities.`);
        for (const bridgedEntity of this.zigbeeEntities) {
          if (bridgedEntity.isGroup && bridgedEntity.group) await this.requestGroupUpdate(bridgedEntity.group);
        }
        for (const device of this.bridgedDevices) {
          device.configure();
        }
      }
    });

    this.log.debug('Created zigbee2mqtt dynamic platform');
  }

  async waiter(name: string, check: () => boolean, exitWithReject = false, resolveTimeout = 5000, resolveInterval = 500) {
    this.log.debug(`**Waiter ${name} started...`);
    return new Promise<boolean>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.log.debug(`****Waiter ${name} exited for timeout...`);
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        if (exitWithReject) reject(new Error(`Waiter ${name} exited due to timeout`));
        else resolve(false);
      }, resolveTimeout);

      const intervalId = setInterval(() => {
        if (check()) {
          this.log.debug(`**Waiter ${name} exited for true condition...`);
          clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve(true);
        }
      }, resolveInterval);
    });
  }

  override async onStart(reason?: string) {
    this.log.info(`Starting zigbee2mqtt dynamic platform v${this.version}: ` + reason);

    // await this.waiter('false', () => false, true, 10 * 1000, 500);

    const hasInfo = await this.waiter('z2mBridgeInfo', () => this.z2mBridgeInfo !== undefined);

    const hasDevices = await this.waiter('z2mBridgeDevices & z2mBridgeGroups', () => this.z2mBridgeDevices !== undefined || this.z2mBridgeGroups !== undefined);

    if (!hasInfo || !hasDevices) {
      this.log.error('Exiting due to missing zigbee2mqtt bridge info or devices/groups');
      return;
    }

    if (!this.z2mDevicesRegistered || !this.z2mGroupsRegistered) {
      this.shouldStart = true;
      this.log.debug('Setting flag to start when zigbee2mqtt sends devices: ', reason);
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
      this.log.debug('Setting flag to configure when zigbee2mqtt sends devices');
    }

    this.log.info(`Configuring ${this.zigbeeEntities.length} zigbee entities.`);
    for (const bridgedEntity of this.zigbeeEntities) {
      if (bridgedEntity.isDevice && bridgedEntity.device) await this.requestDeviceUpdate(bridgedEntity.device);
      if (bridgedEntity.isGroup && bridgedEntity.group) await this.requestGroupUpdate(bridgedEntity.group);
    }

    this.log.info(`Configuring ${this.bridgedDevices.length} matter devices.`);
    for (const device of this.bridgedDevices) {
      device.configure();
    }
    for (const device of this.bridgedDevices.filter((device) => device.isRouter)) {
      this.log.info(`Configuring router ${device.deviceName}.`);
      if (this.z2mBridgeInfo?.permit_join) {
        device.getClusterServer(DoorLockCluster)?.setLockStateAttribute(DoorLock.LockState.Unlocked);
        device.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
      } else {
        device.getClusterServer(DoorLockCluster)?.setLockStateAttribute(DoorLock.LockState.Locked);
        device.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
      }
      device.configure();
    }

    if (this.config.injectPayloads) {
      this.injectTimer = setInterval(() => {
        const data = this.z2m.readConfig(path.join(this.matterbridge.matterbridgeDirectory, this.config.injectPayloads as string));
        this.log.warn(`***Injecting ${data.payloads.length} payloads from ${this.config.injectPayloads}`);
        for (const payload of data.payloads) {
          this.z2m.emitPayload(payload.topic, payload.payload);
        }
      }, 60 * 1000);
    }
  }

  override async onShutdown(reason?: string) {
    this.log.debug('Shutting down zigbee2mqtt platform: ' + reason);
    if (this.injectTimer) clearInterval(this.injectTimer);
    //this.updateAvailability(false);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
    this.z2m.stop();
    this.publishCallBack = undefined;
  }

  public setPublishCallBack(onPublish: (entityName: string, topic: string, message: string) => Promise<void>): void {
    this.publishCallBack = onPublish;
  }

  public setPermitJoinCallBack(onPermitJoin: (entityName: string, permit: boolean) => Promise<void>): void {
    this.permitJoinCallBack = onPermitJoin;
  }

  public async publish(topic: string, subTopic: string, message: string) {
    if (this.config.type === 'MatterbridgeExtension') {
      if (this.publishCallBack && !topic.startsWith('bridge/request')) await this.publishCallBack(topic, subTopic, message);
      if (this.permitJoinCallBack && topic.startsWith('bridge/request')) await this.permitJoinCallBack('', message === '{"value":true}');
    } else {
      await this.z2m.publish(this.z2m.mqttTopic + '/' + topic + (subTopic === '' ? '' : '/' + subTopic), message);
      this.log.info(`MQTT publish topic: ${this.z2m.mqttTopic + '/' + topic + (subTopic === '' ? '' : '/' + subTopic)} message: ${message}`);
    }
  }

  public emit(eventName: string, data: Payload) {
    this.z2m.emit(eventName, data);
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

  private async registerZigbeeDevice(device: BridgeDevice): Promise<ZigbeeDevice | undefined> {
    if (!this.validateWhiteBlackList(device.friendly_name)) {
      return undefined;
    }
    this.log.debug(`Registering device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    const matterDevice = new ZigbeeDevice(this, device);
    if (matterDevice.bridgedDevice) {
      await this.registerDevice(matterDevice.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterDevice.bridgedDevice);
      this.zigbeeEntities.push(matterDevice);
      this.log.debug(`Registered device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    } else this.log.warn(`Device ${dn}${device.friendly_name}${wr} ID: ${device.ieee_address} not registered`);
    return matterDevice;
  }

  public async registerZigbeeGroup(group: BridgeGroup): Promise<ZigbeeGroup | undefined> {
    if (!this.validateWhiteBlackList(group.friendly_name)) {
      return undefined;
    }
    this.log.debug(`Registering group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    const matterGroup = new ZigbeeGroup(this, group);
    if (matterGroup.bridgedDevice) {
      await this.registerDevice(matterGroup.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterGroup.bridgedDevice);
      this.zigbeeEntities.push(matterGroup);
      this.log.debug(`Registered group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    } else this.log.warn(`Group ${gn}${group.friendly_name}${wr} ID: ${group.id} not registered`);
    return matterGroup;
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
  private async unregisterZigbeeEntity(friendly_name: string) {
    /*
    for (const zigbeeEntity of this.zigbeeEntities) {
      if (zigbeeEntity.entityName === friendly_name) this.log.warn(`***Found device: ${friendly_name}`);
      else this.log.info(`**Device: ${zigbeeEntity.entityName}`);
    }
    */
    const entity = this.zigbeeEntities.find((entity) => entity.entityName === friendly_name);
    if (entity) {
      this.log.info(`Removing device: ${friendly_name}`);
      await this.unregisterDevice(entity.bridgedDevice as unknown as MatterbridgeDevice);
      this.zigbeeEntities = this.zigbeeEntities.filter((entity) => entity.entityName !== friendly_name);
      this.bridgedDevices = this.bridgedDevices.filter((device) => device.deviceName !== friendly_name);
    }
    /*
    for (const zigbeeEntity of this.zigbeeEntities) {
      if (zigbeeEntity.entityName === friendly_name) this.log.warn(`***Found device: ${friendly_name}`);
      else this.log.info(`**Device: ${zigbeeEntity.entityName}`);
    }
    */
  }

  private updateAvailability(available: boolean) {
    if (this.bridgedDevices.length === 0) return;
    this.log.info(`Setting availability for ${this.bridgedDevices.length} devices to ${available}`);
    for (const bridgedDevice of this.bridgedDevices) {
      bridgedDevice.getClusterServer(BridgedDeviceBasicInformationCluster)?.setReachableAttribute(available);
      bridgedDevice.getClusterServer(BridgedDeviceBasicInformationCluster)?.triggerReachableChangedEvent({ reachableNewValue: available });
    }
  }
}
