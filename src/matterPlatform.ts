/* eslint-disable @typescript-eslint/no-unused-vars */
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { MatterPlatformDevice, MatterPlatformEntity, MatterPlatformGroup, BridgedBaseDevice } from './matterEntity.js';
import { AnsiLogger, dn, gn, db, wr, zb } from 'node-ansi-logger';
import EventEmitter from 'events';

import { Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform } from '../../matterbridge/dist/index.js';

export class ZigbeePlatform extends MatterbridgeDynamicPlatform {
  // platform
  private bridgedDevices: BridgedBaseDevice[] = [];
  private bridgedEntities: MatterPlatformEntity[] = [];
  private whiteList: string[] = [];
  private blackList: string[] = [];

  // zigbee2Mqtt
  public z2m: Zigbee2MQTT;
  public z2mStarted = false;
  public z2mDevicesRegistered = false;
  public z2mGroupsRegistered = false;
  private z2mBridgeInfo: BridgeInfo | undefined;
  private z2mBridgeDevices: BridgeDevice[] | undefined;
  private z2mBridgeGroups: BridgeGroup[] | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger) {
    super(matterbridge, log);

    //this.z2m = new Zigbee2MQTT('raspberrypi.local', 1883, 'zigbee2mqtt');
    this.z2m = new Zigbee2MQTT('localhost', 1883, 'zigbee2mqtt');
    this.log.debug('Created MatterPlatform');
  }

  override onStartDynamicPlatform() {
    this.z2m.start();
    this.z2mStarted = true;

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
      this.updateAvailability(false);
    });

    this.z2m.on('bridge-info', (bridgeInfo: BridgeInfo) => {
      this.z2mBridgeInfo = bridgeInfo;
      this.log.debug(`zigbee2MQTT sent bridge-info version: ${bridgeInfo.version}`);
    });

    this.z2m.on('bridge-devices', (devices: BridgeDevice[]) => {
      //Logger.defaultLogLevel = Level.INFO;
      this.z2mBridgeDevices = devices;
      this.log.debug(`zigbee2MQTT sent ${devices.length} devices ${this.z2mDevicesRegistered ? 'already registered' : ''}`);
      if (this.z2mDevicesRegistered) return;
      Object.entries(devices).forEach(([key, device], index) => {
        this.registerZigbeeDevice(device);
      });
      this.z2mDevicesRegistered = true;
      //Logger.defaultLogLevel = Level.DEBUG;
    });

    this.z2m.on('bridge-groups', (groups: BridgeGroup[]) => {
      //Logger.defaultLogLevel = Level.INFO;
      this.z2mBridgeGroups = groups;
      this.log.debug(`zigbee2MQTT sent ${groups.length} groups ${this.z2mGroupsRegistered ? 'already registered' : ''}`);
      if (this.z2mGroupsRegistered) return;
      Object.entries(groups).forEach(([key, group], index) => {
        this.registerZigbeeGroup(group);
      });
      this.z2mGroupsRegistered = true;
      //Logger.defaultLogLevel = Level.DEBUG;
    });
  }

  override onShutdown() {
    //this.updateAvailability(false);
    this.z2m.stop();
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

  private registerZigbeeDevice(device: BridgeDevice) {
    if (!this.validateWhiteBlackList(device.friendly_name)) {
      return;
    }
    this.log.debug(`Registering device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    const matterDevice = new MatterPlatformDevice(this, device);
    if (matterDevice.bridgedDevice) {
      this.registerDevice(matterDevice.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterDevice.bridgedDevice);
      this.bridgedEntities.push(matterDevice);
      this.log.debug(`Registered device ${dn}${device.friendly_name}${db} ID: ${zb}${device.ieee_address}${db}`);
    } else this.log.warn(`Device ${dn}${device.friendly_name}${wr} ID: ${device.ieee_address} not registered`);
  }

  public registerZigbeeGroup(group: BridgeGroup) {
    if (!this.validateWhiteBlackList(group.friendly_name)) {
      return;
    }
    this.log.debug(`Registering group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    const matterGroup = new MatterPlatformGroup(this, group);
    if (matterGroup.bridgedDevice) {
      this.registerDevice(matterGroup.bridgedDevice as unknown as MatterbridgeDevice);
      this.bridgedDevices.push(matterGroup.bridgedDevice);
      this.bridgedEntities.push(matterGroup);
      this.log.debug(`Registered group ${gn}${group.friendly_name}${db} ID: ${zb}${group.id}${db}`);
    } else this.log.warn(`Group ${gn}${group.friendly_name}${wr} ID: ${group.id} not registered`);
  }

  public unregisterAll() {
    this.log.warn(`Unregistering ${this.bridgedDevices.length} accessories`);
    for (const bridgedDevice of this.bridgedDevices) {
      //this.log.warn(`- ${bridgedDevice.deviceName} ${bridgedDevice.id} (${bridgedDevice.name})`);
      //this.matterAggregator?.removeBridgedDevice(bridgedDevice);
    }
    for (const bridgedEntity of this.bridgedEntities) {
      //this.log.warn(`- ${bridgedEntity.bridgedDevice?.deviceName} ${bridgedEntity.bridgedDevice?.id} (${bridgedEntity.bridgedDevice?.name})`);
      //this.matterAggregator?.removeBridgedDevice(bridgedEntity.bridgedDevice!);
    }
    this.bridgedDevices.splice(0);
    this.bridgedEntities.splice(0);
  }

  public updateAvailability(available: boolean) {
    this.log.debug(`Setting availability for ${this.bridgedDevices.length} accessories`);
    for (const bridgedDevice of this.bridgedDevices) {
      bridgedDevice.setBridgedDeviceReachability(available);
    }
  }
}
