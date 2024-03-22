import { Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform } from 'matterbridge';
import { AnsiLogger, dn, gn, db, wr, zb, payloadStringify } from 'node-ansi-logger';

import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup, BridgedBaseDevice } from './entity.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import path from 'path';
import { Payload } from './payloadTypes.js';

export class ZigbeePlatform extends MatterbridgeDynamicPlatform {
  // platform
  private bridgedDevices: BridgedBaseDevice[] = [];
  private bridgedEntities: ZigbeeEntity[] = [];
  private whiteList: string[] = []; //['At home', 'Climate sensor', 'Light sensor', 'Contact sensor', 'Motion sensor', 'Mini luminance motion sensor', 'Vibration sensor', 'Leak sensor'];
  private blackList: string[] = [];

  // zigbee2Mqtt
  public debugEnabled: boolean;
  public z2m: Zigbee2MQTT;
  public z2mStarted = false;
  public z2mDevicesRegistered = false;
  public z2mGroupsRegistered = false;
  private z2mBridgeInfo: BridgeInfo | undefined;
  private z2mBridgeDevices: BridgeDevice[] | undefined;
  private z2mBridgeGroups: BridgeGroup[] | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger) {
    super(matterbridge, log);

    this.debugEnabled = matterbridge.debugEnabled;

    this.log.info('Loaded config.json:\n', this.config);
    //this.z2m = new Zigbee2MQTT('raspberrypi.local', 1883, 'zigbee2mqtt');
    this.z2m = new Zigbee2MQTT('localhost', 1883, 'zigbee2mqtt');
    this.z2m.setDataPath(path.join(matterbridge.matterbridgePluginDirectory, 'matterbridge-zigbee2mqtt'));

    this.log.debug('Created zigbee2mqtt dynamic platform');
  }

  override async onStart(reason?: string) {
    this.log.debug('Starting zigbee2mqtt dynamic platform: ' + reason);

    //if (this.config.host) this.z2m.mqttHost = this.config.host as string;
    if (this.config.port) this.z2m.mqttPort = this.config.host as number;
    if (this.config.topic) this.z2m.mqttTopic = this.config.topic as string;
    this.log.info('Loaded config.json:\n', this.config);

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
      //this.updateAvailability(false);
    });

    this.z2m.on('bridge-info', (bridgeInfo: BridgeInfo) => {
      this.z2mBridgeInfo = bridgeInfo;
      this.log.debug(`zigbee2MQTT sent bridge-info version: ${this.z2mBridgeInfo.version}`);
    });

    this.z2m.on('bridge-devices', (devices: BridgeDevice[]) => {
      //Logger.defaultLogLevel = Level.INFO;
      this.z2mBridgeDevices = devices;
      this.log.debug(`zigbee2MQTT sent ${devices.length} devices ${this.z2mDevicesRegistered ? 'already registered' : ''}`);
      if (this.z2mDevicesRegistered) return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(this.z2mBridgeDevices).forEach(async ([key, device], index) => {
        await this.registerZigbeeDevice(device);
      });
      this.z2mDevicesRegistered = true;
      //Logger.defaultLogLevel = Level.DEBUG;
    });

    this.z2m.on('bridge-groups', (groups: BridgeGroup[]) => {
      //Logger.defaultLogLevel = Level.INFO;
      this.z2mBridgeGroups = groups;
      this.log.debug(`zigbee2MQTT sent ${groups.length} groups ${this.z2mGroupsRegistered ? 'already registered' : ''}`);
      if (this.z2mGroupsRegistered) return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(this.z2mBridgeGroups).forEach(async ([key, group], index) => {
        await this.registerZigbeeGroup(group);
      });
      this.z2mGroupsRegistered = true;
      //Logger.defaultLogLevel = Level.DEBUG;
    });
  }

  override async onConfigure() {
    this.log.debug('Configuring platform');
    if (this.z2mBridgeDevices) {
      for (const device of this.z2mBridgeDevices) {
        await this.requestDeviceUpdate(device);
      }
    }
    if (this.z2mBridgeGroups) {
      for (const group of this.z2mBridgeGroups) {
        await this.requestGroupUpdate(group);
      }
    }
  }

  override async onShutdown(reason?: string) {
    this.log.debug('Shutting down zigbee2mqtt platform: ' + reason);
    //this.updateAvailability(false);
    await this.unregisterAllDevices();
    this.z2m.stop();
  }

  private async requestDeviceUpdate(device: BridgeDevice) {
    const payload: Payload = {};
    if (!device.definition || !device.definition.exposes) return;
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

  public async unregisterAll() {
    this.log.warn(`Unregistering ${this.bridgedEntities.length} accessories`);
    /*
    for (const bridgedDevice of this.bridgedDevices) {
      this.log.warn(`- ${bridgedDevice.deviceName} ${bridgedDevice.id} (${bridgedDevice.name})`);
      this.matterAggregator?.removeBridgedDevice(bridgedDevice);
    }
    */
    this.bridgedDevices.splice(0);
    for (const bridgedEntity of this.bridgedEntities) {
      this.log.warn(`- ${bridgedEntity.bridgedDevice?.deviceName} ${bridgedEntity.bridgedDevice?.id} (${bridgedEntity.bridgedDevice?.name})`);
      await this.unregisterDevice(bridgedEntity.bridgedDevice as unknown as MatterbridgeDevice);
    }
    this.bridgedEntities.splice(0);
  }

  public updateAvailability(available: boolean) {
    this.log.debug(`Setting availability for ${this.bridgedDevices.length} accessories`);
    for (const bridgedDevice of this.bridgedDevices) {
      bridgedDevice.setBridgedDeviceReachability(available);
    }
  }
}
