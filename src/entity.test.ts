// src/platform.test.ts

const MATTER_PORT = 6001;
const NAME = 'Entity';
const HOMEDIR = path.join('jest', NAME);

/* eslint-disable no-console */

import path from 'node:path';

import { jest } from '@jest/globals';
import { invokeBehaviorCommand, Matterbridge, MatterbridgeEndpoint } from 'matterbridge';
import { AnsiLogger, CYAN, db, debugStringify, LogLevel, rs, TimestampFormat } from 'matterbridge/logger';
import { ColorControl, LevelControl, PowerSource } from 'matterbridge/matter/clusters';
import { getMacAddress } from 'matterbridge/utils';
import { TypeFromPartialBitSchema } from 'matterbridge/matter/types';
import {
  addDevice,
  createTestEnvironment,
  flushAsync,
  loggerLogSpy,
  server,
  aggregator,
  setDebug,
  setupTest,
  startServerNode,
  stopServerNode,
  startMatterbridgeEnvironment,
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
  logKeepAlives,
  matterbridge,
  log,
  addMatterbridgePlatform,
} from 'matterbridge/jestutils';

import { ZigbeePlatform, ZigbeePlatformConfig } from './module.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeDevice, BridgeGroup, BridgeInfo } from './zigbee2mqttTypes.js';
import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup } from './entity.js';
import { Payload } from './payloadTypes.js';

// Spy on ZigbeePlatform
const publishSpy = jest.spyOn(ZigbeePlatform.prototype, 'publish').mockImplementation(async (topic: string, subTopic: string, message: string) => {
  console.log(`Mocked publish called with topic: ${topic}, subTopic: ${subTopic}, message: ${message}`);
  return Promise.resolve();
});

// Spy on ZigbeePlatform
const publishCommandSpy = jest.spyOn(ZigbeeEntity.prototype as any, 'publishCommand').mockImplementation(() => {
  console.log(`Mocked ZigbeeEntity publish called`);
});

// Mock the Zigbee2MQTT methods
const z2mStartSpy = jest.spyOn(Zigbee2MQTT.prototype, 'start').mockImplementation(() => {
  console.log('Mocked start');
  return Promise.resolve();
});
const z2mStopSpy = jest.spyOn(Zigbee2MQTT.prototype, 'stop').mockImplementation(() => {
  console.log('Mocked stop');
  return Promise.resolve();
});
const z2mSubscribeSpy = jest.spyOn(Zigbee2MQTT.prototype, 'subscribe').mockImplementation((topic: string) => {
  console.log('Mocked subscribe', topic);
  return Promise.resolve();
});
const z2mPublishSpy = jest.spyOn(Zigbee2MQTT.prototype, 'publish').mockImplementation((topic: string, message: string, queue?: boolean) => {
  console.log(`Mocked publish: ${topic} - ${message} queue ${queue}`);
  return Promise.resolve();
});

// Setup the test environment
await setupTest(NAME, false);

// Setup the matter and test environment
createTestEnvironment(NAME);

describe('TestEntity', () => {
  let platform: ZigbeePlatform;

  const executeTrue: TypeFromPartialBitSchema<typeof LevelControl.Options> = { executeIfOff: true };

  const commandTimeout = getMacAddress() === 'c4:cb:76:b3:cd:1f' ? 100 : 100;
  const updateTimeout = getMacAddress() === 'c4:cb:76:b3:cd:1f' ? 50 : 50;

  const mockConfig: ZigbeePlatformConfig = {
    name: 'matterbridge-zigbee2mqtt',
    type: 'DynamicPlatform',
    version: '1.0.0',
    host: 'mqtt://localhost',
    port: 1883,
    protocolVersion: 5,
    username: '',
    password: '',
    clientId: '',
    ca: '',
    rejectUnauthorized: true,
    cert: '',
    key: '',
    topic: 'zigbee2mqtt',
    zigbeeFrontend: 'http://localhost:8080',
    blackList: [],
    whiteList: [],
    switchList: [],
    lightList: [],
    outletList: [],
    featureBlackList: ['device_temperature', 'update', 'update_available', 'power_outage_count', 'indicator_mode', 'do_not_disturb', 'color_temp_startup'],
    deviceFeatureBlackList: {},
    scenesType: 'outlet',
    scenesPrefix: false,
    postfix: 'JEST',
    debug: true,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createMatterbridgeEnvironment(NAME);
    await startMatterbridgeEnvironment(MATTER_PORT);
  });

  beforeEach(async () => {
    // Clears the call history before each test
    jest.clearAllMocks();

    // Reset debug state
    await setDebug(false);
  });

  afterEach(async () => {
    // await flushAsync();
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopMatterbridgeEnvironment();
    await destroyMatterbridgeEnvironment();

    // Restore the original implementation of the AnsiLogger.log method
    jest.restoreAllMocks();

    // logKeepAlives();
  });

  test('create the ZigbeePlatform', async () => {
    platform = new ZigbeePlatform(matterbridge, log, mockConfig);
    expect(platform).toBeDefined();
    // Add the platform to the Matterbridge environment
    addMatterbridgePlatform(platform);
    expect(z2mStartSpy).toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Initializing platform:/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Loaded zigbee2mqtt parameters/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Connecting to MQTT broker/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringMatching(/^Created zigbee2mqtt dynamic platform/));

    const info = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-info.json'));
    expect(info).toBeDefined();
    const devices = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-devices.json'));
    expect(devices).toBeDefined();
    const groups = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-groups.json'));
    expect(groups).toBeDefined();

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = info as BridgeInfo;
    platform.z2mBridgeDevices = devices as BridgeDevice[];
    platform.z2mBridgeGroups = groups as BridgeGroup[];
    platform.z2mDevicesRegistered = true;
  });

  test('create a switch group', async () => {
    const friendlyName = 'Switches';
    const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
    expect(z2mGroup).toBeDefined();
    if (!z2mGroup) throw new Error('Z2M Group not found');
    const entity = await ZigbeeGroup.create(platform, z2mGroup);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "scenesManagement", "onOff", "fixedLabel"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test commands from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
    );

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { state: 'OFF' };
    platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON' };
    platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    platform.z2m.emit(`OFFLINE-${z2mGroup.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);

    jest.clearAllMocks();
    platform.z2m.emit(`ONLINE-${z2mGroup.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);

    entity.destroy();
  });

  test('create a switch device', async () => {
    const friendlyName = 'Aqara switch T1';
    const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === friendlyName);
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "onOff", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test commands from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { state: 'OFF' };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON' };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    jest.clearAllMocks();
    platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    entity.destroy();
  });

  test('create a 2ch switch device', async () => {
    const friendlyName = 'Aqara Dual relay module T2';
    const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === friendlyName);
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement", "fixedLabel"]);
    expect(device.getChildEndpoints()).toHaveLength(3); // 2 channels + root
    const ch1 = device.getChildEndpointByName('l1');
    expect(ch1).toBeInstanceOf(MatterbridgeEndpoint);
    const ch2 = device.getChildEndpointByName('l2');
    expect(ch2).toBeInstanceOf(MatterbridgeEndpoint);
    if (!ch1 || !ch2) throw new Error('Child endpoints not found');
    // prettier-ignore
    for (const child of device.getChildEndpoints()) {
      // expect(['l1', 'l2'].includes(child.id)).toBe(true);
      if (child.id === 'l1') {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "onOff"]);
      }
      if (child.id === 'l2') {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "onOff"]);
      }
      if (child.id !== 'l1' && child.id !== 'l2') {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "switch"]);
      }
    }
    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test commands for ch1 from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch1, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch1.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l1: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch1, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch1.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state_l1: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch1, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch1.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l1: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    // Test commands for ch2 from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch2, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch2.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l2: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch2, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch2.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state_l2: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(ch2, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(ch2.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l2: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    // Test updates from Z2M for ch1 ch2
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { state_l1: 'OFF', state_l2: 'OFF', energy: 123.4, voltage: 230, power: 0, current: 0 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(ch1.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(ch2.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('ElectricalEnergyMeasurement', 'cumulativeEnergyImported')).toEqual({ energy: 123400000 });
    expect(device.getAttribute('ElectricalPowerMeasurement', 'voltage')).toBe(230000);
    expect(device.getAttribute('ElectricalPowerMeasurement', 'activePower')).toBe(0);
    expect(device.getAttribute('ElectricalPowerMeasurement', 'activeCurrent')).toBe(0);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state_l1: 'ON', state_l2: 'ON', energy: 124, voltage: 220, power: 56, current: 0.789 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(ch1.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(ch2.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('ElectricalEnergyMeasurement', 'cumulativeEnergyImported')).toEqual({ energy: 124000000 });
    expect(device.getAttribute('ElectricalPowerMeasurement', 'voltage')).toBe(220000);
    expect(device.getAttribute('ElectricalPowerMeasurement', 'activePower')).toBe(56000);
    expect(device.getAttribute('ElectricalPowerMeasurement', 'activeCurrent')).toBe(789);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    entity.destroy();
  });

  test('create a dimmer device', async () => {
    const z2mDevice = singleDimmer;
    const friendlyName = z2mDevice.friendly_name;
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "scenesManagement", "onOff", "levelControl", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test commands from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `Set attributes called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} colorMode ${CYAN}Brightness${db} payload ${debugStringify({ brightness: 255 })}`,
      ),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { brightness: 255, state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `Set attributes called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} colorMode ${CYAN}Brightness${db} payload ${debugStringify({ brightness: 255 })}`,
      ),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { brightness: 255, state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 128, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(128);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevel called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevel', friendlyName, { brightness: 128, transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 200, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { brightness: 200, transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { state: 'OFF', transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 100, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(100);

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { state: 'OFF' };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON', brightness: 200 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    entity.destroy();
  });

  test('create a rgb device', async () => {
    const z2mDevice = rgbCctController;
    const friendlyName = z2mDevice.friendly_name;
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "colorControl", "identify", "groups", "scenesManagement", "onOff", "levelControl"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test commands from the controller

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `Set attributes called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} colorMode ${CYAN}CurrentHueAndCurrentSaturation${db} payload ${debugStringify({ brightness: 255, color: { h: 0, s: 0 } })}`,
      ),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { brightness: 255, color: { h: 0, s: 0 }, state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'toggle');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `Set attributes called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} colorMode ${CYAN}CurrentHueAndCurrentSaturation${db} payload ${debugStringify({ brightness: 255, color: { h: 0, s: 0 } })}`,
      ),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { brightness: 255, color: { h: 0, s: 0 }, state: 'ON' });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 128, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(128);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevel called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevel', friendlyName, { brightness: 128, transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 200, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { brightness: 200, transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { state: 'OFF', transition: 1 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 100, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(100);
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
    );
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { state: 'ON', brightness: 100, color: { h: 0, s: 0 } });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
    );

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', { colorTemperatureMireds: 200, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(200);
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToColorTemperature', friendlyName, { color_temp: 200 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToHue', { hue: 150, transitionTime: null, direction: ColorControl.Direction.Up, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(150);
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToHue', friendlyName, { color: { h: 213, s: 0 } });

    jest.clearAllMocks();
    // prettier-ignore
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToSaturation', { saturation: 80, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(80);
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToSaturation', friendlyName, { color: { h: 213, s: 31 } });

    jest.clearAllMocks();
    // prettier-ignore
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToHueAndSaturation', { hue: 130, saturation: 70, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(130);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(70);
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToHueAndSaturation', friendlyName, { color: { h: 184, s: 28 }, transition: 1 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToColor', { colorX: 32000, colorY: 30000, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
    expect(device.getAttribute('ColorControl', 'currentX')).toBe(32000);
    expect(device.getAttribute('ColorControl', 'currentY')).toBe(30000);
    expect(publishCommandSpy).toHaveBeenCalledWith('moveToColor', friendlyName, { color: { x: 0.4883, y: 0.4578 }, transition: 1 });

    // Turn the light off and test that moveToLevel and moveToColorTemperature commands remember their state
    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 160, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    // prettier-ignore
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', { colorTemperatureMireds: 350, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(160);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(160);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: 161, color_temp: 350 });

    // Turn the light off and test that moveToLevel and moveToHueAndSaturation commands remember their state
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 135, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    // prettier-ignore
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToHueAndSaturation', { hue: 125, saturation: 40, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(135);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(135);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
    // prettier-ignore
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: Math.round((135 / 254) * 255), color: { h: Math.round(125 / 254 * 360), s: Math.round(40 / 254 * 100) } });

    // Turn the light off and test that moveToLevel and moveToColor commands remember their state
    await invokeBehaviorCommand(device, 'OnOff', 'off');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
    await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 115, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    // prettier-ignore
    await invokeBehaviorCommand(device, 'ColorControl', 'moveToColor', { colorX: 25000, colorY: 28000, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(115);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
    expect(device.getAttribute('ColorControl', 'currentX')).toBe(25000);
    expect(device.getAttribute('ColorControl', 'currentY')).toBe(28000);
    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'OnOff', 'on');
    await flushAsync(undefined, undefined, commandTimeout); // Wait for the cachePublish timeout
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(115);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
    expect(device.getAttribute('ColorControl', 'currentX')).toBe(25000);
    expect(device.getAttribute('ColorControl', 'currentY')).toBe(28000);
    // prettier-ignore
    expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: Math.round((115 / 254) * 255), color: { x: 25000 / 65535, y: 28000 / 65535 } });

    // Clear the noUpdate flag to allow updates from Z2M
    clearTimeout((entity as any).noUpdateTimeout);
    (entity as any).noUpdate = false;

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { state: 'OFF' };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON', brightness: 200 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON', brightness: 150, color_mode: 'color_temp', color_temp: 260 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(150);
    expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(260);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON', brightness: 130, color_mode: 'hs', color: { hue: 150, saturation: 90 } };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(130);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(Math.round((150 / 360) * 254));
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(Math.round((90 / 100) * 254));
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    payload = { state: 'ON', brightness: 130, color_mode: 'xy', color: { x: 0.56, y: 0.92 } };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
    expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(130);
    expect(device.getAttribute('ColorControl', 'currentHue')).toBe(49);
    expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(254);
    expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    entity.destroy();
  }, 10000);

  test('create a temperature, humidity and pressure sensor device', async () => {
    const friendlyName = climateSensor.friendly_name;
    const z2mDevice = climateSensor;
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "temperatureMeasurement", "relativeHumidityMeasurement", "pressureMeasurement"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(null);
    expect(device.getAttribute('RelativeHumidityMeasurement', 'measuredValue')).toBe(null);
    expect(device.getAttribute('PressureMeasurement', 'measuredValue')).toBe(null);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { temperature: 22.5, humidity: 55.3, pressure: 1013.2, linkquality: 120, battery: 95, voltage: 2900 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(2250);
    expect(device.getAttribute('RelativeHumidityMeasurement', 'measuredValue')).toBe(5530);
    expect(device.getAttribute('PressureMeasurement', 'measuredValue')).toBe(1013.2);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(device.getAttribute('PowerSource', 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Ok);
    expect(device.getAttribute('PowerSource', 'batVoltage')).toBe(payload.voltage);
    expect(device.getAttribute('PowerSource', 'batPercentRemaining')).toBe((payload.battery as number) * 2);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    jest.clearAllMocks();
    platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    entity.destroy();
  });
  test('create a motion, illuminance sensor device', async () => {
    const friendlyName = motionSensor.friendly_name;
    const z2mDevice = motionSensor;
    expect(z2mDevice).toBeDefined();
    if (!z2mDevice) throw new Error('Z2M Device not found');
    const entity = await ZigbeeDevice.create(platform, z2mDevice);
    expect(entity).toBeDefined();
    expect(entity.entityName).toBe(friendlyName);
    const device = entity.bridgedDevice;
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    if (!device) throw new Error('MatterbridgeEndpoint is undefined');
    // prettier-ignore
    expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "illuminanceMeasurement", "occupancySensing"]);
    expect(device.getChildEndpoints()).toHaveLength(0);

    jest.clearAllMocks();
    expect(await addDevice(aggregator, device)).toBe(true);
    expect(device.getAttribute('OccupancySensing', 'occupancy')).toEqual({ occupied: false });
    expect(device.getAttribute('IlluminanceMeasurement', 'measuredValue')).toBe(null);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

    // Test updates from Z2M
    let payload: Payload = {};

    jest.clearAllMocks();
    payload = { illuminance: 539, occupancy: true, linkquality: 120, battery: 95, voltage: 2900 };
    platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('OccupancySensing', 'occupancy')).toEqual({ occupied: true });
    expect(device.getAttribute('IlluminanceMeasurement', 'measuredValue')).toBe(27316); // 10 * log10(illuminance) * 1000
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(device.getAttribute('PowerSource', 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Ok);
    expect(device.getAttribute('PowerSource', 'batVoltage')).toBe(payload.voltage);
    expect(device.getAttribute('PowerSource', 'batPercentRemaining')).toBe((payload.battery as number) * 2);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
    );

    jest.clearAllMocks();
    platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    jest.clearAllMocks();
    platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
    await flushAsync(undefined, undefined, updateTimeout);
    expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);

    entity.destroy();
  });
});

const climateSensor: BridgeDevice = {
  date_code: '20191205',
  definition: {
    description: 'Temperature and humidity sensor',
    exposes: [
      {
        access: 1,
        category: 'diagnostic',
        description: 'Remaining battery in %, can take up to 24 hours before reported',
        label: 'Battery',
        name: 'battery',
        property: 'battery',
        type: 'numeric',
        unit: '%',
        value_max: 100,
        value_min: 0,
      },
      {
        access: 1,
        description: 'Measured temperature value',
        label: 'Temperature',
        name: 'temperature',
        property: 'temperature',
        type: 'numeric',
        unit: '°C',
      },
      {
        access: 1,
        description: 'Measured relative humidity',
        label: 'Humidity',
        name: 'humidity',
        property: 'humidity',
        type: 'numeric',
        unit: '%',
      },
      {
        access: 1,
        description: 'The measured atmospheric pressure',
        label: 'Pressure',
        name: 'pressure',
        property: 'pressure',
        type: 'numeric',
        unit: 'hPa',
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Voltage of the battery in millivolts',
        label: 'Voltage',
        name: 'voltage',
        property: 'voltage',
        type: 'numeric',
        unit: 'mV',
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'WSDCGQ11LM',
    options: [
      {
        access: 2,
        description: 'Calibrates the temperature value (absolute offset), takes into effect on next report of device.',
        label: 'Temperature calibration',
        name: 'temperature_calibration',
        property: 'temperature_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description:
          'Number of digits after decimal point for temperature, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Temperature precision',
        name: 'temperature_precision',
        property: 'temperature_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the humidity value (absolute offset), takes into effect on next report of device.',
        label: 'Humidity calibration',
        name: 'humidity_calibration',
        property: 'humidity_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for humidity, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Humidity precision',
        name: 'humidity_precision',
        property: 'humidity_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the pressure value (absolute offset), takes into effect on next report of device.',
        label: 'Pressure calibration',
        name: 'pressure_calibration',
        property: 'pressure_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for pressure, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Pressure precision',
        name: 'pressure_precision',
        property: 'pressure_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
    ],
    source: 'native',
    supports_ota: false,
    vendor: 'Aqara',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genBasic', 'genIdentify', '65535', 'msTemperatureMeasurement', 'msPressureMeasurement', 'msRelativeHumidity'],
        output: ['genBasic', 'genGroups', '65535'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Bedroom Climate',
  ieee_address: '0x00158d0007b6f079',
  interview_completed: true,
  interview_state: 'SUCCESSFUL',
  interviewing: false,
  manufacturer: 'LUMI',
  model_id: 'lumi.weather',
  network_address: 14313,
  power_source: 'Battery',
  software_build_id: '3000-0001',
  supported: true,
  type: 'EndDevice',
};

const motionSensor: BridgeDevice = {
  date_code: 'Jan  4 2023',
  definition: {
    description: 'Motion sensor P1',
    exposes: [
      {
        access: 1,
        description: 'Indicates whether the device detected occupancy',
        label: 'Occupancy',
        name: 'occupancy',
        property: 'occupancy',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 1,
        description: 'Measured illuminance',
        label: 'Illuminance',
        name: 'illuminance',
        property: 'illuminance',
        type: 'numeric',
        unit: 'lx',
      },
      {
        access: 7,
        category: 'config',
        description: 'Select motion sensitivity to use. Press pairing button right before changing this otherwise it will fail.',
        label: 'Motion sensitivity',
        name: 'motion_sensitivity',
        property: 'motion_sensitivity',
        type: 'enum',
        values: ['low', 'medium', 'high'],
      },
      {
        access: 7,
        category: 'config',
        description: 'Time interval between action detection. Press pairing button right before changing this otherwise it will fail.',
        label: 'Detection interval',
        name: 'detection_interval',
        property: 'detection_interval',
        type: 'numeric',
        unit: 's',
        value_max: 65535,
        value_min: 2,
      },
      {
        access: 7,
        category: 'config',
        description: 'When this option is enabled then blue LED will blink once when motion is detected. Press pairing button right before changing this otherwise it will fail.',
        label: 'Trigger indicator',
        name: 'trigger_indicator',
        property: 'trigger_indicator',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Temperature of the device',
        label: 'Device temperature',
        name: 'device_temperature',
        property: 'device_temperature',
        type: 'numeric',
        unit: '°C',
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Remaining battery in %, can take up to 24 hours before reported',
        label: 'Battery',
        name: 'battery',
        property: 'battery',
        type: 'numeric',
        unit: '%',
        value_max: 100,
        value_min: 0,
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Voltage of the battery in millivolts',
        label: 'Voltage',
        name: 'voltage',
        property: 'voltage',
        type: 'numeric',
        unit: 'mV',
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'RTCGQ14LM',
    options: [
      {
        access: 2,
        description: 'Calibrates the illuminance value (percentual offset), takes into effect on next report of device.',
        label: 'Illuminance calibration',
        name: 'illuminance_calibration',
        property: 'illuminance_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Calibrates the device_temperature value (absolute offset), takes into effect on next report of device.',
        label: 'Device temperature calibration',
        name: 'device_temperature_calibration',
        property: 'device_temperature_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description:
          'Time in seconds after which occupancy is cleared after detecting it (default is "detection_interval" + 2 seconds). The value must be equal to or greater than "detection_interval", and it can also be a fraction.',
        label: 'Occupancy timeout',
        name: 'occupancy_timeout',
        property: 'occupancy_timeout',
        type: 'numeric',
        unit: 's',
        value_min: 0,
        value_step: 0.1,
      },
      {
        access: 2,
        description:
          'Sends a message the last time occupancy (occupancy: true) was detected. When setting this for example to [10, 60] a `{"no_occupancy_since": 10}` will be send after 10 seconds and a `{"no_occupancy_since": 60}` after 60 seconds.',
        item_type: {
          access: 3,
          label: 'Time',
          name: 'time',
          type: 'numeric',
        },
        label: 'No occupancy since',
        name: 'no_occupancy_since',
        property: 'no_occupancy_since',
        type: 'list',
      },
    ],
    source: 'native',
    supports_ota: true,
    vendor: 'Aqara',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genBasic', 'genPowerCfg', 'genIdentify', 'manuSpecificLumi'],
        output: ['genIdentify', 'genOta', 'manuSpecificLumi'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Guest room Occupancy',
  ieee_address: '0x54ef441000777289',
  interview_completed: true,
  interview_state: 'SUCCESSFUL',
  interviewing: false,
  manufacturer: 'LUMI',
  model_id: 'lumi.motion.ac02',
  network_address: 8770,
  power_source: 'Battery',
  software_build_id: '0.0.0_0010',
  supported: true,
  type: 'EndDevice',
};

const singleSwitch = {
  date_code: 'Dec 29 2021',
  definition: {
    description: 'Single switch module T1 (with neutral), CN',
    exposes: [
      {
        features: [
          {
            access: 7,
            description: 'On/off state of the switch',
            label: 'State',
            name: 'state',
            property: 'state',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
        ],
        type: 'switch',
      },
      {
        access: 5,
        description: 'Instantaneous measured power',
        label: 'Power',
        name: 'power',
        property: 'power',
        type: 'numeric',
        unit: 'W',
      },
      {
        access: 1,
        description: 'Sum of consumed energy',
        label: 'Energy',
        name: 'energy',
        property: 'energy',
        type: 'numeric',
        unit: 'kWh',
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Temperature of the device',
        label: 'Device temperature',
        name: 'device_temperature',
        property: 'device_temperature',
        type: 'numeric',
        unit: '°C',
      },
      {
        access: 1,
        description: 'Measured electrical potential value',
        label: 'Voltage',
        name: 'voltage',
        property: 'voltage',
        type: 'numeric',
        unit: 'V',
      },
      {
        access: 1,
        description: 'Instantaneous measured electrical current',
        label: 'Current',
        name: 'current',
        property: 'current',
        type: 'numeric',
        unit: 'A',
      },
      {
        access: 7,
        category: 'config',
        description: 'Enable/disable the power outage memory, this recovers the on/off mode after power failure',
        label: 'Power outage memory',
        name: 'power_outage_memory',
        property: 'power_outage_memory',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 7,
        category: 'config',
        description: 'Enable/disable the LED at night',
        label: 'LED disabled night',
        name: 'led_disabled_night',
        property: 'led_disabled_night',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 7,
        description: 'Wall switch type',
        label: 'Switch type',
        name: 'switch_type',
        property: 'switch_type',
        type: 'enum',
        values: ['toggle', 'momentary'],
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'DLKZMK11LM',
    options: [
      {
        access: 2,
        description: 'Calibrates the power value (percentual offset), takes into effect on next report of device.',
        label: 'Power calibration',
        name: 'power_calibration',
        property: 'power_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for power, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Power precision',
        name: 'power_precision',
        property: 'power_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the energy value (percentual offset), takes into effect on next report of device.',
        label: 'Energy calibration',
        name: 'energy_calibration',
        property: 'energy_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for energy, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Energy precision',
        name: 'energy_precision',
        property: 'energy_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the device_temperature value (absolute offset), takes into effect on next report of device.',
        label: 'Device temperature calibration',
        name: 'device_temperature_calibration',
        property: 'device_temperature_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Calibrates the voltage value (percentual offset), takes into effect on next report of device.',
        label: 'Voltage calibration',
        name: 'voltage_calibration',
        property: 'voltage_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for voltage, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Voltage precision',
        name: 'voltage_precision',
        property: 'voltage_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the current value (percentual offset), takes into effect on next report of device.',
        label: 'Current calibration',
        name: 'current_calibration',
        property: 'current_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for current, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Current precision',
        name: 'current_precision',
        property: 'current_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: "State actions will also be published as 'action' when true (default false).",
        label: 'State action',
        name: 'state_action',
        property: 'state_action',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
    ],
    source: 'native',
    supports_ota: true,
    vendor: 'Aqara',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genBasic', 'genDeviceTempCfg', 'genIdentify', 'genGroups', 'genScenes', 'genAlarms', 'genTime', 'manuSpecificLumi'],
        output: ['genTime', 'genOta', '65535'],
      },
      configured_reportings: [],
      scenes: [],
    },
    '21': {
      bindings: [],
      clusters: {
        input: ['genAnalogInput'],
        output: [],
      },
      configured_reportings: [],
      scenes: [],
    },
    '31': {
      bindings: [],
      clusters: {
        input: ['genAnalogInput'],
        output: [],
      },
      configured_reportings: [],
      scenes: [],
    },
    '41': {
      bindings: [],
      clusters: {
        input: ['genMultistateInput'],
        output: [],
      },
      configured_reportings: [],
      scenes: [],
    },
    '242': {
      bindings: [],
      clusters: {
        input: [],
        output: ['greenPower'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Toilet Light',
  ieee_address: '0x54ef4410007db760',
  interview_completed: true,
  interview_state: 'SUCCESSFUL',
  interviewing: false,
  manufacturer: 'LUMI',
  model_id: 'lumi.switch.n0acn2',
  network_address: 42738,
  power_source: 'Mains (single phase)',
  software_build_id: '',
  supported: true,
  type: 'Router',
};

const singleDimmer = {
  date_code: 'NULL',
  definition: {
    description: 'Zigbee dimmer 400W with power and energy metering',
    exposes: [
      {
        features: [
          {
            access: 7,
            description: 'On/off state of this light',
            label: 'State',
            name: 'state',
            property: 'state',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
          {
            access: 7,
            description: 'Brightness of this light',
            label: 'Brightness',
            name: 'brightness',
            property: 'brightness',
            type: 'numeric',
            value_max: 254,
            value_min: 0,
          },
        ],
        type: 'light',
      },
      {
        access: 2,
        description: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
        label: 'Effect',
        name: 'effect',
        property: 'effect',
        type: 'enum',
        values: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect'],
      },
      {
        access: 7,
        category: 'config',
        description: 'Controls the behavior when the device is powered on after power loss',
        label: 'Power-on behavior',
        name: 'power_on_behavior',
        property: 'power_on_behavior',
        type: 'enum',
        values: ['off', 'on', 'toggle', 'previous'],
      },
      {
        access: 5,
        description: 'Instantaneous measured power',
        label: 'Power',
        name: 'power',
        property: 'power',
        type: 'numeric',
        unit: 'W',
      },
      {
        access: 5,
        description: 'Measured electrical potential value',
        label: 'Voltage',
        name: 'voltage',
        property: 'voltage',
        type: 'numeric',
        unit: 'V',
      },
      {
        access: 5,
        description: 'Instantaneous measured electrical current',
        label: 'Current',
        name: 'current',
        property: 'current',
        type: 'numeric',
        unit: 'A',
      },
      {
        access: 5,
        description: 'Sum of consumed energy',
        label: 'Energy',
        name: 'energy',
        property: 'energy',
        type: 'numeric',
        unit: 'kWh',
      },
      {
        access: 7,
        label: 'External switch type',
        name: 'external_switch_type',
        property: 'external_switch_type',
        type: 'enum',
        values: ['push_button', 'normal_on_off', 'three_way'],
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'SM309-S',
    options: [
      {
        access: 2,
        description: 'Calibrates the power value (percentual offset), takes into effect on next report of device.',
        label: 'Power calibration',
        name: 'power_calibration',
        property: 'power_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for power, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Power precision',
        name: 'power_precision',
        property: 'power_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the voltage value (percentual offset), takes into effect on next report of device.',
        label: 'Voltage calibration',
        name: 'voltage_calibration',
        property: 'voltage_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for voltage, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Voltage precision',
        name: 'voltage_precision',
        property: 'voltage_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the current value (percentual offset), takes into effect on next report of device.',
        label: 'Current calibration',
        name: 'current_calibration',
        property: 'current_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for current, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Current precision',
        name: 'current_precision',
        property: 'current_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description: 'Calibrates the energy value (percentual offset), takes into effect on next report of device.',
        label: 'Energy calibration',
        name: 'energy_calibration',
        property: 'energy_calibration',
        type: 'numeric',
        value_step: 0.1,
      },
      {
        access: 2,
        description: 'Number of digits after decimal point for energy, takes into effect on next report of device. This option can only decrease the precision, not increase it.',
        label: 'Energy precision',
        name: 'energy_precision',
        property: 'energy_precision',
        type: 'numeric',
        value_max: 3,
        value_min: 0,
      },
      {
        access: 2,
        description:
          'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
        label: 'Transition',
        name: 'transition',
        property: 'transition',
        type: 'numeric',
        value_min: 0,
      },
      {
        access: 2,
        description: "State actions will also be published as 'action' when true (default false).",
        label: 'State action',
        name: 'state_action',
        property: 'state_action',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
    ],
    source: 'native',
    supports_ota: false,
    vendor: 'Samotech',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [
        {
          cluster: 'genOnOff',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
        {
          cluster: 'genLevelCtrl',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
        {
          cluster: 'haElectricalMeasurement',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
        {
          cluster: 'seMetering',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
      ],
      clusters: {
        input: ['genBasic', 'genIdentify', 'genGroups', 'genScenes', 'genOnOff', 'genLevelCtrl', 'seMetering', 'haElectricalMeasurement', 'haDiagnostic', 'touchlink'],
        output: ['genOta'],
      },
      configured_reportings: [
        {
          attribute: 'activePower',
          cluster: 'haElectricalMeasurement',
          maximum_report_interval: 65000,
          minimum_report_interval: 10,
          reportable_change: 50,
        },
        {
          attribute: 'rmsCurrent',
          cluster: 'haElectricalMeasurement',
          maximum_report_interval: 65000,
          minimum_report_interval: 10,
          reportable_change: 50,
        },
        {
          attribute: 'rmsVoltage',
          cluster: 'haElectricalMeasurement',
          maximum_report_interval: 65000,
          minimum_report_interval: 10,
          reportable_change: 50,
        },
        {
          attribute: 'currentSummDelivered',
          cluster: 'seMetering',
          maximum_report_interval: 65000,
          minimum_report_interval: 10,
          reportable_change: 360000,
        },
        {
          attribute: 'currentLevel',
          cluster: 'genLevelCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 1,
          reportable_change: 0,
        },
        {
          attribute: 'onOff',
          cluster: 'genOnOff',
          maximum_report_interval: 3600,
          minimum_report_interval: 1,
          reportable_change: 0,
        },
      ],
      scenes: [],
    },
    '242': {
      bindings: [],
      clusters: {
        input: ['greenPower'],
        output: ['greenPower'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Dressing room Lights',
  ieee_address: '0x943469fffeee28f6',
  interview_completed: true,
  interview_state: 'SUCCESSFUL',
  interviewing: false,
  manufacturer: 'Samotech',
  model_id: 'SM309-S',
  network_address: 21691,
  power_source: 'Mains (single phase)',
  software_build_id: '2.9.2_r54',
  supported: true,
  type: 'Router',
};

const rgbCctController = {
  date_code: '',
  definition: {
    description: 'RGB+CCT Zigbee LED controller',
    exposes: [
      {
        features: [
          {
            access: 7,
            description: 'On/off state of this light',
            label: 'State',
            name: 'state',
            property: 'state',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
          {
            access: 7,
            description: 'Brightness of this light',
            label: 'Brightness',
            name: 'brightness',
            property: 'brightness',
            type: 'numeric',
            value_max: 254,
            value_min: 0,
          },
          {
            access: 7,
            description: 'Color temperature of this light',
            label: 'Color temp',
            name: 'color_temp',
            presets: [
              {
                description: 'Coolest temperature supported',
                name: 'coolest',
                value: 153,
              },
              {
                description: 'Cool temperature (250 mireds / 4000 Kelvin)',
                name: 'cool',
                value: 250,
              },
              {
                description: 'Neutral temperature (370 mireds / 2700 Kelvin)',
                name: 'neutral',
                value: 370,
              },
              {
                description: 'Warm temperature (454 mireds / 2200 Kelvin)',
                name: 'warm',
                value: 454,
              },
              {
                description: 'Warmest temperature supported',
                name: 'warmest',
                value: 500,
              },
            ],
            property: 'color_temp',
            type: 'numeric',
            unit: 'mired',
            value_max: 500,
            value_min: 153,
          },
          {
            access: 7,
            description: 'Color of this light in the CIE 1931 color space (x/y)',
            features: [
              {
                access: 7,
                label: 'X',
                name: 'x',
                property: 'x',
                type: 'numeric',
              },
              {
                access: 7,
                label: 'Y',
                name: 'y',
                property: 'y',
                type: 'numeric',
              },
            ],
            label: 'Color (X/Y)',
            name: 'color_xy',
            property: 'color',
            type: 'composite',
          },
        ],
        type: 'light',
      },
      {
        access: 2,
        description: 'Triggers an effect on the light (e.g. make light blink for a few seconds)',
        label: 'Effect',
        name: 'effect',
        property: 'effect',
        type: 'enum',
        values: ['blink', 'breathe', 'okay', 'channel_change', 'finish_effect', 'stop_effect', 'colorloop', 'stop_colorloop'],
      },
      {
        access: 3,
        description: 'Do not disturb mode, when enabled this function will keep the light OFF after a power outage',
        label: 'Do not disturb',
        name: 'do_not_disturb',
        property: 'do_not_disturb',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 3,
        description: 'Power on behavior state',
        label: 'Color power on behavior',
        name: 'color_power_on_behavior',
        property: 'color_power_on_behavior',
        type: 'enum',
        values: ['initial', 'previous', 'customized'],
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'ZLD-RCW_1',
    options: [
      {
        access: 2,
        description:
          'Controls the transition time (in seconds) of on/off, brightness, color temperature (if applicable) and color (if applicable) changes. Defaults to `0` (no transition).',
        label: 'Transition',
        name: 'transition',
        property: 'transition',
        type: 'numeric',
        value_min: 0,
      },
      {
        access: 2,
        description:
          'When enabled colors will be synced, e.g. if the light supports both color x/y and color temperature a conversion from color x/y to color temperature will be done when setting the x/y color (default true).',
        label: 'Color sync',
        name: 'color_sync',
        property: 'color_sync',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 2,
        description: "State actions will also be published as 'action' when true (default false).",
        label: 'State action',
        name: 'state_action',
        property: 'state_action',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
    ],
    source: 'native',
    supports_ota: false,
    vendor: 'Moes',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [
        {
          cluster: 'genOnOff',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
        {
          cluster: 'genLevelCtrl',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
        {
          cluster: 'lightingColorCtrl',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b00257c8fee',
            type: 'endpoint',
          },
        },
      ],
      clusters: {
        input: ['genBasic', 'genIdentify', 'genGroups', 'genScenes', 'genOnOff', 'touchlink', 'genLevelCtrl', 'lightingColorCtrl'],
        output: ['genOta', 'genTime'],
      },
      configured_reportings: [
        {
          attribute: 'onOff',
          cluster: 'genOnOff',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'currentLevel',
          cluster: 'genLevelCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'colorTemperature',
          cluster: 'lightingColorCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'currentHue',
          cluster: 'lightingColorCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'currentX',
          cluster: 'lightingColorCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'currentSaturation',
          cluster: 'lightingColorCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
        {
          attribute: 'currentY',
          cluster: 'lightingColorCtrl',
          maximum_report_interval: 3600,
          minimum_report_interval: 10,
          reportable_change: 0,
        },
      ],
      scenes: [],
    },
    '242': {
      bindings: [],
      clusters: {
        input: [],
        output: ['greenPower'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Guest room Desk light strip',
  ieee_address: '0x84fd27fffe83066f',
  interview_completed: true,
  interview_state: 'SUCCESSFUL',
  interviewing: false,
  manufacturer: '_TZ3000_7hcgjxpc',
  model_id: 'TS0505B',
  network_address: 47517,
  power_source: 'Mains (single phase)',
  software_build_id: '2.9.2_r54',
  supported: true,
  type: 'Router',
};

const doubleSwitch = {
  date_code: '',
  definition: {
    description: 'Smart light switch module (2 gang)',
    exposes: [
      {
        endpoint: 'l1',
        features: [
          {
            access: 7,
            description: 'On/off state of the switch',
            endpoint: 'l1',
            label: 'State',
            name: 'state',
            property: 'state_l1',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
        ],
        type: 'switch',
      },
      {
        endpoint: 'l2',
        features: [
          {
            access: 7,
            description: 'On/off state of the switch',
            endpoint: 'l2',
            label: 'State',
            name: 'state',
            property: 'state_l2',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
        ],
        type: 'switch',
      },
      {
        access: 7,
        category: 'config',
        description: 'Controls the behavior when the device is powered on after power loss',
        label: 'Power-on behavior',
        name: 'power_on_behavior',
        property: 'power_on_behavior',
        type: 'enum',
        values: ['off', 'previous', 'on'],
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'MS-104BZ',
    options: [
      {
        access: 2,
        description: "State actions will also be published as 'action' when true (default false).",
        label: 'State action',
        name: 'state_action',
        property: 'state_action',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
    ],
    supports_ota: false,
    vendor: 'Moes',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [
        {
          cluster: 'genOnOff',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b0025e1f196',
            type: 'endpoint',
          },
        },
      ],
      clusters: {
        input: ['genBasic', 'genIdentify', 'genGroups', 'genScenes', 'genOnOff', '57344', 'manuSpecificTuya_3'],
        output: ['genOta', 'genTime'],
      },
      configured_reportings: [
        {
          attribute: 'onOff',
          cluster: 'genOnOff',
          maximum_report_interval: 3600,
          minimum_report_interval: 0,
          reportable_change: 0,
        },
      ],
      scenes: [],
    },
    '2': {
      bindings: [
        {
          cluster: 'genOnOff',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b0025e1f196',
            type: 'endpoint',
          },
        },
      ],
      clusters: {
        input: ['genIdentify', 'genGroups', 'genScenes', 'genOnOff', '57344', 'manuSpecificTuya_3'],
        output: [],
      },
      configured_reportings: [
        {
          attribute: 'onOff',
          cluster: 'genOnOff',
          maximum_report_interval: 3600,
          minimum_report_interval: 0,
          reportable_change: 0,
        },
      ],
      scenes: [],
    },
    '242': {
      bindings: [],
      clusters: {
        input: [],
        output: ['greenPower'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Moes switch double',
  ieee_address: '0xcc86ecfffe4e9d25',
  interview_completed: true,
  interviewing: false,
  manufacturer: '_TZ3000_pmz6mjyu',
  model_id: 'TS011F',
  network_address: 49638,
  power_source: 'Mains (single phase)',
  supported: true,
  type: 'Router',
};

const doubleDimmer = {
  date_code: '',
  definition: {
    description: '2 gang smart dimmer',
    exposes: [
      {
        endpoint: 'l1',
        features: [
          {
            access: 3,
            description: 'On/off state of this light',
            endpoint: 'l1',
            label: 'State',
            name: 'state',
            property: 'state_l1',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
          {
            access: 3,
            description: 'Brightness of this light',
            endpoint: 'l1',
            label: 'Brightness',
            name: 'brightness',
            property: 'brightness_l1',
            type: 'numeric',
            value_max: 254,
            value_min: 0,
          },
          {
            access: 3,
            description: 'Minimum light brightness',
            endpoint: 'l1',
            label: 'Min brightness',
            name: 'min_brightness',
            property: 'min_brightness_l1',
            type: 'numeric',
            value_max: 255,
            value_min: 1,
          },
          {
            access: 3,
            description: 'Maximum light brightness',
            endpoint: 'l1',
            label: 'Max brightness',
            name: 'max_brightness',
            property: 'max_brightness_l1',
            type: 'numeric',
            value_max: 255,
            value_min: 1,
          },
        ],
        type: 'light',
      },
      {
        access: 3,
        description: 'Countdown to turn device off after a certain time',
        endpoint: 'l1',
        label: 'Countdown',
        name: 'countdown',
        property: 'countdown_l1',
        type: 'numeric',
        unit: 's',
        value_max: 43200,
        value_min: 0,
        value_step: 1,
      },
      {
        endpoint: 'l2',
        features: [
          {
            access: 3,
            description: 'On/off state of this light',
            endpoint: 'l2',
            label: 'State',
            name: 'state',
            property: 'state_l2',
            type: 'binary',
            value_off: 'OFF',
            value_on: 'ON',
            value_toggle: 'TOGGLE',
          },
          {
            access: 3,
            description: 'Brightness of this light',
            endpoint: 'l2',
            label: 'Brightness',
            name: 'brightness',
            property: 'brightness_l2',
            type: 'numeric',
            value_max: 254,
            value_min: 0,
          },
          {
            access: 3,
            description: 'Minimum light brightness',
            endpoint: 'l2',
            label: 'Min brightness',
            name: 'min_brightness',
            property: 'min_brightness_l2',
            type: 'numeric',
            value_max: 255,
            value_min: 1,
          },
          {
            access: 3,
            description: 'Maximum light brightness',
            endpoint: 'l2',
            label: 'Max brightness',
            name: 'max_brightness',
            property: 'max_brightness_l2',
            type: 'numeric',
            value_max: 255,
            value_min: 1,
          },
        ],
        type: 'light',
      },
      {
        access: 3,
        description: 'Countdown to turn device off after a certain time',
        endpoint: 'l2',
        label: 'Countdown',
        name: 'countdown',
        property: 'countdown_l2',
        type: 'numeric',
        unit: 's',
        value_max: 43200,
        value_min: 0,
        value_step: 1,
      },
      {
        access: 3,
        category: 'config',
        description: 'Controls the behavior when the device is powered on after power loss',
        label: 'Power-on behavior',
        name: 'power_on_behavior',
        property: 'power_on_behavior',
        type: 'enum',
        values: ['off', 'on', 'previous'],
      },
      {
        access: 3,
        description: 'Mode of the backlight',
        label: 'Backlight mode',
        name: 'backlight_mode',
        property: 'backlight_mode',
        type: 'enum',
        values: ['off', 'normal', 'inverted'],
      },
      {
        access: 1,
        category: 'diagnostic',
        description: 'Link quality (signal strength)',
        label: 'Linkquality',
        name: 'linkquality',
        property: 'linkquality',
        type: 'numeric',
        unit: 'lqi',
        value_max: 255,
        value_min: 0,
      },
    ],
    model: 'TS0601_dimmer_2',
    options: [],
    supports_ota: false,
    vendor: 'Tuya',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genBasic', 'genGroups', 'genScenes', 'manuSpecificTuya'],
        output: ['genOta', 'genTime'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Moes dimmer double',
  ieee_address: '0x847127fffeaff50a',
  interview_completed: true,
  interviewing: false,
  manufacturer: '_TZE200_e3oitdyu',
  model_id: 'TS0601',
  network_address: 63077,
  power_source: 'Mains (single phase)',
  supported: true,
  type: 'Router',
};
