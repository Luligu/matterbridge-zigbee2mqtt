/**
 * This file contains the class ZigbeePlatform.
 *
 * @file platform.ts
 * @author Luca Liguori
 * @date 2023-12-29
 * @version 2.2.2
 *
 * Copyright 2023, 2024, 2025 Luca Liguori.
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

import { Matterbridge, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, dn, gn, db, wr, zb, payloadStringify, rs, debugStringify, CYAN, er, nf } from 'matterbridge/logger';
import { isValidNumber, isValidString, waiter } from 'matterbridge/utils';
import { BridgedDeviceBasicInformation, DoorLock } from 'matterbridge/matter/clusters';
import path from 'path';

import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup /* , BridgedBaseDevice*/ } from './entity.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';

type DeviceFeatureBlackList = Record<string, string[]>;

export class ZigbeePlatform extends MatterbridgeDynamicPlatform {
  // extension
  private publishCallBack: ((entityName: string, topic: string, message: string) => Promise<void>) | undefined = undefined;
  private permitJoinCallBack: ((entityName: string, permit: boolean) => Promise<void>) | undefined = undefined;

  // platform
  public bridgedDevices: MatterbridgeEndpoint[] = [];
  public zigbeeEntities: ZigbeeEntity[] = [];
  private injectTimer: NodeJS.Timeout | undefined;

  // z2m
  private mqttHost = 'localhost';
  private mqttPort = 1883;
  private mqttTopic = 'zigbee2mqtt';
  private mqttUsername: string | undefined = undefined;
  private mqttPassword: string | undefined = undefined;
  private mqttProtocol: 4 | 5 | 3 = 5;
  public lightList: string[] = [];
  public outletList: string[] = [];
  public switchList: string[] = [];
  public featureBlackList: string[] = [];
  public deviceFeatureBlackList: DeviceFeatureBlackList = {};
  public postfixHostname = true;

  // zigbee2Mqtt
  public debugEnabled: boolean;
  public shouldStart: boolean;
  public shouldConfigure: boolean;
  public z2m!: Zigbee2MQTT;
  public z2mDevicesRegistered = false;
  public z2mGroupsRegistered = false;
  public z2mBridgeOnline: boolean | undefined;
  public z2mBridgeInfo: BridgeInfo | undefined;
  public z2mBridgeDevices: BridgeDevice[] | undefined;
  public z2mBridgeGroups: BridgeGroup[] | undefined;
  private z2mDeviceAvailability = new Map<string, boolean>();
  private availabilityTimer: NodeJS.Timeout | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('2.1.0')) {
      throw new Error(`This plugin requires Matterbridge version >= "2.1.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`);
    }

    // this.log.debug(`Config:')}${rs}`, config);
    this.debugEnabled = config.debug as boolean;
    this.shouldStart = false;
    this.shouldConfigure = false;

    if (config.host) this.mqttHost = config.host as string;
    if (config.port) this.mqttPort = config.port as number;
    if (config.topic) this.mqttTopic = config.topic as string;
    if (config.username) this.mqttUsername = config.username as string;
    if (config.password) this.mqttPassword = config.password as string;
    if (config.protocolVersion && typeof config.protocolVersion === 'number' && config.protocolVersion >= 3 && config.protocolVersion <= 5) this.mqttProtocol = config.protocolVersion as 4 | 5 | 3;
    if (config.switchList) this.switchList = config.switchList as string[];
    if (config.lightList) this.lightList = config.lightList as string[];
    if (config.outletList) this.outletList = config.outletList as string[];
    if (config.featureBlackList) this.featureBlackList = config.featureBlackList as string[];
    if (config.deviceFeatureBlackList) this.deviceFeatureBlackList = config.deviceFeatureBlackList as DeviceFeatureBlackList;
    this.postfixHostname = (config.postfixHostname as boolean) ?? true;

    // Save back to create a default plugin config.json
    config.host = this.mqttHost;
    config.port = this.mqttPort;
    config.protocolVersion = this.mqttProtocol;
    config.topic = this.mqttTopic;
    config.username = this.mqttUsername;
    config.password = this.mqttPassword;
    config.postfixHostname = this.postfixHostname;

    if (config.type === 'MatterbridgeExtension') {
      this.z2m = new Zigbee2MQTT(this.mqttHost, this.mqttPort, this.mqttTopic, this.mqttUsername, this.mqttPassword, this.mqttProtocol, this.debugEnabled);
      this.z2m.setLogDebug(this.debugEnabled);
      this.log.debug('Created ZigbeePlatform as Matterbridge extension');
      return;
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);
    this.log.info(`Loaded zigbee2mqtt parameters from ${CYAN}${path.join(matterbridge.matterbridgeDirectory, 'matterbridge-zigbee2mqtt.config.json')}${rs}`);
    // this.log.debug(`Config:')}${rs}`, config);

    this.z2m = new Zigbee2MQTT(this.mqttHost, this.mqttPort, this.mqttTopic, this.mqttUsername, this.mqttPassword, this.mqttProtocol, this.debugEnabled);
    this.z2m.setLogDebug(this.debugEnabled);
    this.z2m.setDataPath(path.join(matterbridge.matterbridgePluginDirectory, 'matterbridge-zigbee2mqtt'));

    if (isValidString(this.mqttHost) && isValidNumber(this.mqttPort, 1, 65535)) {
      this.log.info(`Connecting to MQTT broker: ${'mqtt://' + this.mqttHost + ':' + this.mqttPort.toString()}`);
      this.z2m.start();
    } else {
      this.log.error(`Invalid MQTT broker host: ${this.mqttHost} or port: ${this.mqttPort}`);
    }

    this.z2m.on('mqtt_connect', () => {
      this.log.info(`MQTT broker at ${this.z2m.mqttHost}:${this.z2m.mqttPort} connected`);
      this.z2m.subscribe(this.z2m.mqttTopic + '/#');
    });

    this.z2m.on('mqtt_subscribed', () => {
      this.log.info(`MQTT broker at ${this.z2m.mqttHost}:${this.z2m.mqttPort} subscribed to: ${this.z2m.mqttTopic + '/#'}`);
    });

    this.z2m.on('close', () => {
      this.log.warn(`MQTT broker at ${this.z2m.mqttHost}:${this.z2m.mqttPort} closed the connection`);
    });

    this.z2m.on('end', () => {
      this.log.warn(`MQTT broker at ${this.z2m.mqttHost}:${this.z2m.mqttPort} ended the connection`);
    });

    this.z2m.on('mqtt_error', (error) => {
      this.log.error(`MQTT broker at ${this.z2m.mqttHost}:${this.z2m.mqttPort} error:`, error);
    });

    this.z2m.on('online', () => {
      this.log.info('zigbee2MQTT is online');
      this.z2mBridgeOnline = true;
      // TODO check single availability
      this.updateAvailability(true);
    });

    this.z2m.on('offline', () => {
      this.log.warn('zigbee2MQTT is offline');
      this.z2mBridgeOnline = false;
      // TODO check single availability
      this.updateAvailability(false);
    });

    this.z2m.on('bridge-info', async (bridgeInfo: BridgeInfo) => {
      if (bridgeInfo === null || bridgeInfo === undefined) return;
      this.z2mBridgeInfo = bridgeInfo;
      this.log.info(`zigbee2MQTT version ${this.z2mBridgeInfo.version} zh version ${this.z2mBridgeInfo.zigbee_herdsman.version} zhc version ${this.z2mBridgeInfo.zigbee_herdsman_converters.version}`);
      if (this.z2mBridgeInfo.config.advanced.output === 'attribute') this.log.error(`zigbee2MQTT advanced.output must be 'json' or 'attribute_and_json'. Now is ${this.z2mBridgeInfo.config.advanced.output}`);
      if (this.z2mBridgeInfo.config.advanced.legacy_api === true) this.log.info(`zigbee2MQTT advanced.legacy_api is ${this.z2mBridgeInfo.config.advanced.legacy_api}`);
      if (this.z2mBridgeInfo.config.advanced.legacy_availability_payload === true) this.log.info(`zigbee2MQTT advanced.legacy_availability_payload is ${this.z2mBridgeInfo.config.advanced.legacy_availability_payload}`);
    });

    this.z2m.on('bridge-devices', async (devices: BridgeDevice[]) => {
      if (devices === null || devices === undefined) return;
      this.log.info(`zigbee2MQTT sent ${devices.length} devices ${this.z2mDevicesRegistered ? 'already registered' : ''}`);
      if (config.injectDevices) {
        this.log.warn(`***Injecting virtual devices from ${path.join(matterbridge.matterbridgeDirectory, config.injectDevices as string)}`);
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
          bridgedEntity.configure();
        }
      }
    });

    this.z2m.on('bridge-groups', async (groups: BridgeGroup[]) => {
      if (groups === null || groups === undefined) return;
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
          bridgedEntity.configure();
        }
      }
    });

    this.z2m.on('availability', (device: string, available: boolean) => {
      this.z2mDeviceAvailability.set(device, available);
      if (available) this.log.info(`zigbee2MQTT device ${device} is ${available ? 'online' : 'offline'}`);
      else this.log.warn(`zigbee2MQTT device ${device} is ${available ? 'online' : 'offline'}`);
    });

    this.z2m.on('permit_join', async (device: string, time: number, status: boolean) => {
      this.log.info(`zigbee2MQTT sent permit_join device: ${device} time: ${time} status: ${status}`);
      for (const zigbeeEntity of this.zigbeeEntities) {
        if (zigbeeEntity.isRouter && (device === undefined || device === zigbeeEntity.bridgedDevice?.deviceName)) {
          // Coordinator or dedicated routers
          this.log.info(`*- ${zigbeeEntity.bridgedDevice?.deviceName} ${zigbeeEntity.bridgedDevice?.number} (${zigbeeEntity.bridgedDevice?.name})`);
          if (zigbeeEntity.device && status) {
            zigbeeEntity.bridgedDevice?.setAttribute(DoorLock.Cluster.id, 'lockState', DoorLock.LockState.Unlocked, this.log);
            zigbeeEntity.bridgedDevice?.triggerEvent(
              DoorLock.Cluster.id,
              'lockOperation',
              { lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
              this.log,
            );
            this.log.info(`Device ${zigbeeEntity.entityName} unlocked`);
          }
          if (zigbeeEntity.device && !status) {
            zigbeeEntity.bridgedDevice?.setAttribute(DoorLock.Cluster.id, 'lockState', DoorLock.LockState.Locked, this.log);
            zigbeeEntity.bridgedDevice?.triggerEvent(
              DoorLock.Cluster.id,
              'lockOperation',
              { lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
              this.log,
            );
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
        if (!this.validateDevice(friendly_name)) return;
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
      if (!this.validateDevice(friendly_name)) return;
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

    this.log.debug('Created zigbee2mqtt dynamic platform');
  }

  override async onStart(reason?: string) {
    this.log.info(`Starting zigbee2mqtt dynamic platform v${this.version}: ` + reason);

    const hasOnline = await waiter('z2mBridgeOnline', () => this.z2mBridgeOnline !== undefined);

    const hasInfo = await waiter('z2mBridgeInfo', () => this.z2mBridgeInfo !== undefined);

    const hasDevices = await waiter('z2mBridgeDevices & z2mBridgeGroups', () => this.z2mBridgeDevices !== undefined || this.z2mBridgeGroups !== undefined);

    if (!hasOnline) this.log.error('The plugin did not receive zigbee2mqtt bridge state. Check if zigbee2mqtt is running and connected to the MQTT broker.');
    if (!hasInfo) this.log.error('The plugin did not receive zigbee2mqtt bridge info. Check if zigbee2mqtt is running and connected to the MQTT broker.');
    if (!hasDevices) this.log.error('The plugin did not receive zigbee2mqtt bridge devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.');
    if (!hasOnline || !hasInfo || !hasDevices) {
      throw new Error('The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.');
    }

    if (!this.z2mDevicesRegistered && this.z2mBridgeDevices) {
      this.log.info(`Registering ${this.z2mBridgeDevices.length} devices`);
      for (const device of this.z2mBridgeDevices) {
        await this.registerZigbeeDevice(device);
      }
      this.z2mDevicesRegistered = true;
    }

    if (!this.z2mGroupsRegistered && this.z2mBridgeGroups) {
      this.log.info(`Registering ${this.z2mBridgeGroups.length} groups`);
      for (const group of this.z2mBridgeGroups) {
        await this.registerZigbeeGroup(group);
      }
      this.z2mGroupsRegistered = true;
    }

    this.log.info(`Started zigbee2mqtt dynamic platform v${this.version}: ` + reason);
  }

  override async onConfigure() {
    await super.onConfigure();
    this.log.info(`Requesting update for ${this.zigbeeEntities.length} zigbee entities.`);
    for (const bridgedEntity of this.zigbeeEntities) {
      if (bridgedEntity.isDevice && bridgedEntity.device) await this.requestDeviceUpdate(bridgedEntity.device);
      if (bridgedEntity.isGroup && bridgedEntity.group) await this.requestGroupUpdate(bridgedEntity.group);
      await bridgedEntity.configure();
      if (bridgedEntity.isRouter && bridgedEntity.bridgedDevice) {
        this.log.info(`Configuring router ${bridgedEntity.bridgedDevice?.deviceName}.`);
        if (this.z2mBridgeInfo?.permit_join) {
          bridgedEntity.bridgedDevice?.setAttribute(DoorLock.Cluster.id, 'lockState', DoorLock.LockState.Unlocked, this.log);
          if (bridgedEntity.bridgedDevice.number)
            bridgedEntity.bridgedDevice?.triggerEvent(
              DoorLock.Cluster.id,
              'lockOperation',
              { lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
              this.log,
            );
        } else {
          bridgedEntity.bridgedDevice?.setAttribute(DoorLock.Cluster.id, 'lockState', DoorLock.LockState.Locked, this.log);
          if (bridgedEntity.bridgedDevice.number)
            bridgedEntity.bridgedDevice?.triggerEvent(
              DoorLock.Cluster.id,
              'lockOperation',
              { lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
              this.log,
            );
        }
      }
    }

    this.availabilityTimer = setTimeout(() => {
      for (const [device, available] of this.z2mDeviceAvailability) {
        if (available) this.z2m.emit('ONLINE-' + device);
        else this.z2m.emit('OFFLINE-' + device);
      }
    }, 60 * 1000);

    if (this.config.injectPayloads) {
      this.injectTimer = setInterval(() => {
        const data = this.z2m.readConfig(path.join(this.matterbridge.matterbridgeDirectory, this.config.injectPayloads as string));
        this.log.warn(`***Injecting ${data.payloads.length} payloads from ${this.config.injectPayloads}`);
        for (const payload of data.payloads) {
          this.z2m.emitPayload(payload.topic, payload.payload);
        }
      }, 60 * 1000);
    }
    this.log.info(`Configured zigbee2mqtt dynamic platform v${this.version}`);
  }

  override async onShutdown(reason?: string) {
    await super.onShutdown(reason);
    this.log.debug('Shutting down zigbee2mqtt platform: ' + reason);
    for (const entity of this.zigbeeEntities) {
      entity.destroy();
    }

    if (this.injectTimer) clearInterval(this.injectTimer);
    this.injectTimer = undefined;
    if (this.availabilityTimer) clearInterval(this.availabilityTimer);
    this.availabilityTimer = undefined;
    // this.updateAvailability(false);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
    this.z2m.stop();
    this.publishCallBack = undefined;
    this.log.info(`Shutdown zigbee2mqtt dynamic platform v${this.version}`);
  }

  /**
   * @deprecated
   */
  public setPublishCallBack(onPublish: (entityName: string, topic: string, message: string) => Promise<void>): void {
    this.publishCallBack = onPublish;
  }

  /**
   * @deprecated
   */
  public setPermitJoinCallBack(onPermitJoin: (entityName: string, permit: boolean) => Promise<void>): void {
    this.permitJoinCallBack = onPermitJoin;
  }

  public async publish(topic: string, subTopic: string, message: string) {
    if (this.config.type === 'MatterbridgeExtension') {
      if (this.publishCallBack && !topic.startsWith('bridge/request')) await this.publishCallBack(topic, subTopic, message);
      if (this.permitJoinCallBack && topic.startsWith('bridge/request')) await this.permitJoinCallBack('', message === '{"value":true}');
    } else {
      await this.z2m.publish(this.z2m.mqttTopic + '/' + topic + (subTopic === '' ? '' : '/' + subTopic), message);
      this.log.info(`MQTT publish topic: ${CYAN}${this.z2m.mqttTopic + '/' + topic + (subTopic === '' ? '' : '/' + subTopic)}${nf} payload: ${CYAN}${message}${nf}`);
    }
  }

  /**
   * @deprecated
   */
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

  private async registerZigbeeDevice(device: BridgeDevice): Promise<ZigbeeDevice | undefined> {
    this.selectDevice.set(device.ieee_address, { serial: device.ieee_address, name: device.friendly_name, icon: 'wifi', entities: [] });
    if (!this.validateDevice(device.friendly_name)) {
      return undefined;
    }
    this.log.debug(`Registering device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    let matterDevice: ZigbeeDevice | undefined;
    try {
      matterDevice = await ZigbeeDevice.create(this, device);
      if (matterDevice.bridgedDevice) {
        matterDevice.bridgedDevice.configUrl = `${this.config.zigbeeFrontend}/#/device/${device.ieee_address}/info`;
        await this.registerDevice(matterDevice.bridgedDevice);
        this.bridgedDevices.push(matterDevice.bridgedDevice);
        this.zigbeeEntities.push(matterDevice);
        this.log.debug(`Registered device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
      } else this.log.warn(`Device ${dn}${device.friendly_name}${wr} ID: ${device.ieee_address} not registered`);
    } catch (error) {
      this.log.error(`Error registering device ${dn}${device.friendly_name}${er} ID: ${device.ieee_address}: ${error}`);
    }
    return matterDevice;
  }

  public async registerZigbeeGroup(group: BridgeGroup): Promise<ZigbeeGroup | undefined> {
    this.selectDevice.set(`group-${group.id}`, { serial: `group-${group.id}`, name: group.friendly_name, icon: 'wifi' });
    if (!this.validateDevice(group.friendly_name)) {
      return undefined;
    }
    this.log.debug(`Registering group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    let matterGroup: ZigbeeGroup | undefined;
    try {
      matterGroup = await ZigbeeGroup.create(this, group);
      if (matterGroup.bridgedDevice) {
        matterGroup.bridgedDevice.configUrl = `${this.config.zigbeeFrontend}/#/group/${group.id}`;
        await this.registerDevice(matterGroup.bridgedDevice);
        this.bridgedDevices.push(matterGroup.bridgedDevice);
        this.zigbeeEntities.push(matterGroup);
        this.log.debug(`Registered group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
      } else this.log.warn(`Group ${gn}${group.friendly_name}${wr} ID: ${group.id} not registered`);
    } catch (error) {
      this.log.error(`Error registering group ${gn}${group.friendly_name}${er} ID: ${group.id}: ${error}`);
    }
    return matterGroup;
  }

  private async unregisterZigbeeEntity(friendly_name: string) {
    const entity = this.zigbeeEntities.find((entity) => entity.entityName === friendly_name);
    if (entity) {
      this.log.info(`Removing device: ${friendly_name}`);
      await this.unregisterDevice(entity.bridgedDevice as MatterbridgeEndpoint);
      entity.destroy();
      this.zigbeeEntities = this.zigbeeEntities.filter((entity) => entity.entityName !== friendly_name);
      this.bridgedDevices = this.bridgedDevices.filter((device) => device.deviceName !== friendly_name);
    }
  }

  private async updateAvailability(available: boolean) {
    if (this.bridgedDevices.length === 0) return;
    this.log.info(`Setting availability for ${this.bridgedDevices.length} devices to ${available}`);
    for (const bridgedDevice of this.bridgedDevices) {
      await bridgedDevice.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', available, this.log);
      if (bridgedDevice.maybeNumber) await bridgedDevice.triggerEvent(BridgedDeviceBasicInformation.Cluster.id, 'reachableChanged', { reachableNewValue: available }, this.log);
    }
  }
}
