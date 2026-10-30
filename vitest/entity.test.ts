/**
 * @file vitest/entity.test.ts
 * @description This file contains the tests for the ZigbeeEntity, ZigbeeDevice and ZigbeeGroup classes.
 * @author Luca Liguori
 */

/* oxlint-disable no-console */
/* oxlint-disable no-use-before-define -- device fixtures are declared at the bottom of the file and referenced by the tests above */

const NAME = 'Entity';
const MATTER_PORT = 6001;
const MATTER_CREATE_ONLY = true;

import path from 'node:path';

import {
  colorDimmerSwitch,
  dimmableLight,
  dimmablePlugInUnit,
  dimmerSwitch,
  extendedColorLight,
  featuresFor,
  invokeBehaviorCommand,
  invokeSubscribeHandler,
  MatterbridgeEndpoint,
  onOffLight,
  onOffLightSwitch,
  onOffPlugInUnit,
  type PlatformMatterbridge,
  waterValve,
} from 'matterbridge';
import { CYAN, db, debugStringify, LogLevel, rs } from 'matterbridge/logger';
import { AirQuality, ColorControl, DoorLock, OnOff, PowerSource, SmokeCoAlarm, Thermostat, ValveConfigurationAndControl, WindowCovering } from 'matterbridge/matter/clusters';
import {
  addDevice,
  addMatterbridge,
  aggregator,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  flushServerNode,
  getMatterbridge,
  log,
  loggerDebugSpy,
  loggerInfoSpy,
  loggerLogSpy,
  setDebug,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/test-utils/vitest';
import { kelvinToRGB, miredToKelvin } from 'matterbridge/utils';

import { ZigbeeDevice, ZigbeeEntity, ZigbeeGroup } from '../src/entity.js';
import { ZigbeePlatform, type ZigbeePlatformConfig } from '../src/module.js';
import type { Payload } from '../src/payloadTypes.js';
import { Zigbee2MQTT } from '../src/zigbee2mqtt.js';
import type { BridgeDevice, BridgeGroup, BridgeInfo } from '../src/zigbee2mqttTypes.js';

// Spy on ZigbeePlatform
const publishSpy = vi.spyOn(ZigbeePlatform.prototype, 'publish').mockImplementation((topic: string, subTopic: string, message: string) => {
  console.log(`Mocked publish called with topic: ${topic}, subTopic: ${subTopic}, message: ${message}`);
});

// Spy on ZigbeePlatform
// @ts-expect-error accessing private method for test
const publishCommandSpy = vi.spyOn(ZigbeeEntity.prototype as any, 'publishCommand').mockImplementation((command: string, entityName: string, payload: Payload) => {
  console.log(`Mocked ZigbeeEntity publish called: command: ${command}, entityName: ${entityName}, payload: ${debugStringify(payload)}`);
});

// Mock the Zigbee2MQTT methods
const z2mStartSpy = vi.spyOn(Zigbee2MQTT.prototype, 'start').mockImplementation(() => {
  console.log('Mocked start');
});
const z2mStopSpy = vi.spyOn(Zigbee2MQTT.prototype, 'stop').mockImplementation(() => {
  console.log('Mocked stop');
});
const z2mSubscribeSpy = vi.spyOn(Zigbee2MQTT.prototype, 'subscribe').mockImplementation((topic: string) => {
  console.log('Mocked subscribe', topic);
});
const z2mPublishSpy = vi.spyOn(Zigbee2MQTT.prototype, 'publish').mockImplementation((topic: string, message: string, queue?: boolean) => {
  console.log(`Mocked publish: ${topic} - ${message} queue ${queue}`);
});

// Setup the test environment
await setupTest(NAME, false);

describe('Test Entity', () => {
  let matterbridge: PlatformMatterbridge;
  let platform: ZigbeePlatform;
  const executeTrue = { executeIfOff: true };

  const waitOptions = { interval: 5, timeout: 2000 };

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
    valveList: [],
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
    await createTestEnvironment();
    await createServerNode(MATTER_PORT);
    if (!MATTER_CREATE_ONLY) await startServerNode();
    matterbridge = getMatterbridge();
  });

  beforeEach(async () => {
    // Clears the call history before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset debug state
    await setDebug(false);
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    if (MATTER_CREATE_ONLY) await flushServerNode();
    else await stopServerNode();
    await destroyTestEnvironment();

    // Restore the original implementation of the AnsiLogger.log method
    vi.restoreAllMocks();

    // logKeepAlives();
  });

  test('create the ZigbeePlatform', async () => {
    platform = new ZigbeePlatform(matterbridge, log, mockConfig);
    expect(platform).toBeDefined();
    // Add the platform to the Matterbridge environment
    addMatterbridge(platform);
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

  test('MESSAGE update skips when bridged device is missing', () => {
    const entity = new ZigbeeEntity(platform, { id: 9001, friendly_name: 'No bridged device', description: '', members: [], scenes: [] });

    platform.z2m.emit('MESSAGE-No bridged device', { state: 'ON' });

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping (no device) MQTT message for accessory No bridged device'));
    entity.destroy();
  });

  test('MESSAGE update skips when noUpdate is set', () => {
    const entity = new ZigbeeEntity(platform, { id: 9002, friendly_name: 'No update entity', description: '', members: [], scenes: [] });
    entity.bridgedDevice = {} as MatterbridgeEndpoint;
    (entity as any).noUpdate = true;

    platform.z2m.emit('MESSAGE-No update entity', { state: 'ON' });

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping (no update) MQTT message for accessory No update entity'));
    entity.destroy();
  });

  test('MESSAGE update skips only the published keys when noUpdateKeys is set', () => {
    const entity = new ZigbeeEntity(platform, { id: 9005, friendly_name: 'No update keys entity', description: '', members: [], scenes: [] });
    entity.bridgedDevice = {} as MatterbridgeEndpoint;
    (entity as any).noUpdate = true;
    (entity as any).noUpdateKeys = ['state'];

    platform.z2m.emit('MESSAGE-No update keys entity', { state: 'OFF', power: 0 });

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Skipping (no update) keys ${CYAN}state${db} for accessory No update keys entity`));
    expect(loggerDebugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping (no update) MQTT message for accessory No update keys entity'));
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining(`payload: ${debugStringify({ power: 0 })}`));

    vi.clearAllMocks();
    platform.z2m.emit('MESSAGE-No update keys entity', { state: 'ON' });

    expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping (no update) MQTT message for accessory No update keys entity'));
    entity.destroy();
  });

  test('cachePublish sets and resets noUpdateKeys', async () => {
    const entity = new ZigbeeEntity(platform, { id: 9006, friendly_name: 'Cache publish keys', description: '', members: [], scenes: [] });
    (entity as any).cachePublishTimeoutTime = 1;
    (entity as any).noUpdateTimeoutTime = 50;

    (entity as any).cachePublish('on', { state: 'ON' });
    await vi.waitFor(() => expect((entity as any).noUpdateKeys).toEqual(['state']), waitOptions);
    expect((entity as any).noUpdate).toBe(true);

    (entity as any).cachePublish('moveToLevel', { brightness: 100 });
    await vi.waitFor(() => expect((entity as any).noUpdateKeys).toEqual(['state', 'brightness']), waitOptions);

    await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions);
    expect((entity as any).noUpdateKeys).toBeUndefined();
    entity.destroy();
  });

  test('add cluster helpers throw when bridged device is missing', () => {
    const entity = new ZigbeeEntity(platform, { id: 9003, friendly_name: 'No helper endpoint', description: '', members: [], scenes: [] });

    expect(() => (entity as any).addBridgedDeviceBasicInformation()).toThrow('No bridged device');
    expect(() => (entity as any).addPowerSource()).toThrow('No bridged device');

    entity.destroy();
  });

  test('verifyMutableDevice repairs missing required clusters on main and child endpoints', () => {
    const entity = new ZigbeeEntity(platform, { id: 9004, friendly_name: 'Mutable verifier', description: '', members: [], scenes: [] });
    const mainClusters = new Set<number>();
    const childClusters = new Set<number>();
    const childEndpoint = {
      addClusterServers: vi.fn((clusters: number[]) => clusters.forEach((cluster) => childClusters.add(cluster))),
      getDeviceTypes: vi.fn(() => [{ name: 'ChildType', code: 0xc001, requiredServerClusters: [Thermostat.id] }]),
      hasClusterServer: vi.fn((cluster: number) => childClusters.has(cluster)),
    };
    const endpoint = {
      addClusterServers: vi.fn((clusters: number[]) => clusters.forEach((cluster) => mainClusters.add(cluster))),
      getChildEndpoints: vi.fn(() => [childEndpoint]),
      getDeviceTypes: vi.fn(() => [{ name: 'MainType', code: 0xc000, requiredServerClusters: [PowerSource.id] }]),
      hasClusterServer: vi.fn((cluster: number) => mainClusters.has(cluster)),
    };

    expect((entity as any).verifyMutableDevice(null)).toBe(false);
    expect((entity as any).verifyMutableDevice(endpoint as unknown as MatterbridgeEndpoint)).toBe(true);
    expect(endpoint.addClusterServers).toHaveBeenCalledWith([PowerSource.id]);
    expect(childEndpoint.addClusterServers).toHaveBeenCalledWith([Thermostat.id]);

    endpoint.addClusterServers.mockClear();
    childEndpoint.addClusterServers.mockClear();
    expect((entity as any).verifyMutableDevice(endpoint as unknown as MatterbridgeEndpoint)).toBe(true);
    expect(endpoint.addClusterServers).not.toHaveBeenCalled();
    expect(childEndpoint.addClusterServers).not.toHaveBeenCalled();

    entity.destroy();
  });

  test('updateAttributeIfChanged handles guards, lookup, equality, child endpoints, and updates', () => {
    const entity = new ZigbeeEntity(platform, { id: 9005, friendly_name: 'Attribute updater', description: '', members: [], scenes: [] });
    const makeEndpoint = (name: string, clusterPresent = true, attributePresent = true, initialValue: unknown = 0): any => {
      let localValue = initialValue;
      return {
        maybeNumber: 1,
        name,
        number: 1,
        getAttribute: vi.fn(() => localValue),
        hasAttributeServer: vi.fn(() => attributePresent),
        hasClusterServer: vi.fn(() => clusterPresent),
        setAttribute: vi.fn(async (_clusterId: number, _attributeName: string, value: unknown) => {
          localValue = value;
        }),
      };
    };

    const missingCluster = makeEndpoint('MissingCluster', false);
    const missingAttribute = makeEndpoint('MissingAttribute', true, false);
    const mainEndpoint = makeEndpoint('MainEndpoint', true, true, 0);
    const childEndpoint = makeEndpoint('ChildEndpoint', true, true, 0);
    entity.bridgedDevice = { getChildEndpointById: vi.fn(() => childEndpoint) } as unknown as MatterbridgeEndpoint;
    const missingValue = new Map<string, unknown>().get('missing');

    (entity as any).updateAttributeIfChanged(mainEndpoint, '', Thermostat.id, 'systemMode', missingValue);
    expect(mainEndpoint.setAttribute).not.toHaveBeenCalled();

    (entity as any).updateAttributeIfChanged(missingCluster, '', Thermostat.id, 'systemMode', 1);
    expect(missingCluster.setAttribute).not.toHaveBeenCalled();

    (entity as any).updateAttributeIfChanged(missingAttribute, '', Thermostat.id, 'systemMode', 1);
    expect(missingAttribute.setAttribute).not.toHaveBeenCalled();

    (entity as any).updateAttributeIfChanged(mainEndpoint, '', Thermostat.id, 'systemMode', 'missing', ['off', 'heat']);
    expect(mainEndpoint.setAttribute).not.toHaveBeenCalled();

    (entity as any).updateAttributeIfChanged(mainEndpoint, '', Thermostat.id, 'systemMode', 0);
    expect(mainEndpoint.setAttribute).not.toHaveBeenCalled();

    (entity as any).updateAttributeIfChanged(mainEndpoint, '', Thermostat.id, 'systemMode', 'heat', ['off', 'heat']);
    expect(mainEndpoint.setAttribute).toHaveBeenLastCalledWith(Thermostat.id, 'systemMode', 1);

    (entity as any).updateAttributeIfChanged(mainEndpoint, '', Thermostat.id, 'systemMode', 2);
    expect(mainEndpoint.setAttribute).toHaveBeenLastCalledWith(Thermostat.id, 'systemMode', 2);

    const objectEndpoint = makeEndpoint('ObjectEndpoint', true, true, { occupied: true });
    (entity as any).updateAttributeIfChanged(objectEndpoint, '', Thermostat.id, 'occupancy', { occupied: true });
    expect(objectEndpoint.setAttribute).not.toHaveBeenCalled();
    (entity as any).updateAttributeIfChanged(objectEndpoint, '', Thermostat.id, 'occupancy', { occupied: false });
    expect(objectEndpoint.setAttribute).toHaveBeenLastCalledWith(Thermostat.id, 'occupancy', { occupied: false });

    (entity as any).updateAttributeIfChanged(mainEndpoint, 'child_1', Thermostat.id, 'systemMode', 3);
    expect((entity.bridgedDevice as any).getChildEndpointById).toHaveBeenCalledWith('child_1');
    expect(childEndpoint.setAttribute).toHaveBeenLastCalledWith(Thermostat.id, 'systemMode', 3);

    (entity.bridgedDevice as any).getChildEndpointById.mockImplementationOnce(() => {});
    (entity as any).updateAttributeIfChanged(mainEndpoint, 'missing_child', Thermostat.id, 'systemMode', 4);
    expect(mainEndpoint.setAttribute).toHaveBeenLastCalledWith(Thermostat.id, 'systemMode', 4);

    entity.destroy();
  });

  describe('Test ZigbeeGroup', () => {
    test('create a switch group', async () => {
      const friendlyName = 'Switches';
      const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
      expect(z2mGroup).toBeDefined();
      if (!z2mGroup) throw new Error('Z2M Group not found');
      // await setDebug(true);
      const entity = await ZigbeeGroup.create(platform, z2mGroup);
      (entity as any).cachePublishTimeoutTime = 1;
      // await setDebug(false);
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "scenesManagement", "onOff", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));

      vi.clearAllMocks();
      (entity as any).noUpdateTimeoutTime = 1;
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => expect((entity as any).cachePublishTimeout).toBeUndefined(), waitOptions); // Wait for the cachePublish timeout
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions); // Wait for the noUpdate reset timeout
      expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update is now reset for the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect((entity as any).noUpdate).toBe(false);
      expect((entity as any).noUpdateTimeout).toBeUndefined();
      await invokeBehaviorCommand(device, 'OnOff', 'on');

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );
      await invokeBehaviorCommand(device, 'OnOff', 'off');

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');

      // Test scenes command
      vi.clearAllMocks();
      const sceneEndpoint = aggregator.parts.get('SwitchesOff:outlet');
      expect(sceneEndpoint).toBeDefined();
      if (!sceneEndpoint) throw new Error('Scene endpoint not found');
      await invokeBehaviorCommand(sceneEndpoint as MatterbridgeEndpoint, 'OnOff', 'on');
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining(`Triggered scene "Switches Off" id 0 from group ${z2mGroup.friendly_name}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('scene_recall', friendlyName, { scene_recall: 0 });

      // Test updates from Z2M
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON' };
      platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mGroup.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mGroup.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test('create a light group', async () => {
      const friendlyName = 'Lights';
      const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
      expect(z2mGroup).toBeDefined();
      if (!z2mGroup) throw new Error('Z2M Group not found');
      const entity = await ZigbeeGroup.create(platform, z2mGroup);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      // @ts-expect-error accessing private property for test
      expect(entity.transition).toBe(true);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "scenesManagement", "onOff", "levelControl", "colorControl", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(254);
      expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: 255, color: { h: 0, s: 0 } });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: 255, color: { h: 0, s: 0 } });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 128, transitionTime: 5, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(128);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command moveToLevel called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevel', friendlyName, { brightness: 128, transition: 0.5 });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 200, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { brightness: 200, transition: 1 });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command moveToLevelWithOnOff called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevelWithOnOff', friendlyName, { state: 'OFF', transition: 1 });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} to update its state`),
      );
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });

      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 100, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
      expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(100);

      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);

      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', { colorX: 25000, colorY: 25000, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command moveToColorTemperature ignored`));
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColor', { colorTemperatureMireds: 250, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command moveToColor ignored`));
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToHue', { hue: 125, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command moveToHue ignored`));
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToSaturation', { saturation: 100, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command moveToSaturation ignored`));
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToHueAndSaturation', { hue: 125, saturation: 100, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command moveToHueAndSaturation ignored`));

      // Test updates from Z2M
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON' };
      platform.z2m.emit(`MESSAGE-${z2mGroup.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mGroup.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mGroup.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mGroup.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test('create a cover group', async () => {
      const friendlyName = 'Covers';
      const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
      expect(z2mGroup).toBeDefined();
      if (!z2mGroup) throw new Error('Z2M Group not found');
      const entity = await ZigbeeGroup.create(platform, z2mGroup);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "windowCovering", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'upOrOpen');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(0);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command upOrOpen called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('upOrOpen', friendlyName, { state: 'OPEN' });

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'downOrClose');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(10000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command downOrClose called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('downOrClose', friendlyName, { state: 'CLOSE' });

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'stopMotion');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(10000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command stopMotion called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('stopMotion', friendlyName, { state: 'STOP' });

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 5000 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(5000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command goToLiftPercentage called for ${(entity as any).ien}${z2mGroup.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('goToLiftPercentage', friendlyName, { position: 50 });

      entity.destroy();
    });

    test('create a thermostat group', async () => {
      platform.config.postfix = '';
      const friendlyName = 'Thermostats';
      const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
      expect(z2mGroup).toBeDefined();
      if (!z2mGroup) throw new Error('Z2M Group not found');
      const entity = await ZigbeeGroup.create(platform, z2mGroup);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      // expect(entity.platform.config.postfix).toBe('');
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "thermostat", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test writes from the controller
      vi.clearAllMocks();
      (entity as any).thermostatTimeoutTime = 1;
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Off);
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Cool);
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Heat);
      await device.setAttribute('Thermostat', 'occupiedHeatingSetpoint', 2200);
      await device.setAttribute('Thermostat', 'occupiedCoolingSetpoint', 2200);
      expect(publishCommandSpy).toHaveBeenCalledTimes(0);

      // @ts-expect-error accessing private property for test
      entity.thermostatTimeoutTime = 1;
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Off, Thermostat.SystemMode.Heat);
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Heat, Thermostat.SystemMode.Cool);
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Cool, Thermostat.SystemMode.Off);
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedHeatingSetpoint', 2000, 2200);
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedCoolingSetpoint', 2000, 2200);
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions); // Wait for the thermostat noUpdate reset timeouts

      entity.destroy();
    });

    test('create an empty group', async () => {
      const friendlyName = 'At home';
      const z2mGroup = platform.z2mBridgeGroups?.find((group) => group.friendly_name === friendlyName);
      expect(z2mGroup).toBeDefined();
      if (!z2mGroup) throw new Error('Z2M Group not found');
      const entity = await ZigbeeGroup.create(platform, z2mGroup);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      // expect(entity.platform.config.postfix).toBe('');
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "onOff", "bridgedDeviceBasicInformation", "powerSource", "identify", "binding", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      entity.destroy();
    });
  });

  describe('Test ZigbeeDevice', () => {
    test('create a switch device', async () => {
      const friendlyName = 'Aqara switch T1';
      const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === friendlyName);
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "onOff", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement", "binding"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.DEBUG,
          expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
        );
      }, waitOptions);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      // Test updates from Z2M
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test('should expose a switch on valveList as a water valve when listed', async () => {
      const z2mDevice = waterValveDevice;
      const friendlyName = z2mDevice.friendly_name;
      platform.config.valveList = [friendlyName];
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice as unknown as BridgeDevice);
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(device.deviceTypes.get(waterValve.code)).toBeDefined();
      expect(device.hasClusterServer(ValveConfigurationAndControl.id)).toBe(true);
      expect(device.hasClusterServer(OnOff.id)).toBe(false);
      expect(device.getChildEndpoints()).toHaveLength(1);
      expect(device.getChildEndpointById('l1')?.hasClusterServer(ValveConfigurationAndControl.id)).toBe(true);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
      expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      expect(device.hasAttributeServer(ValveConfigurationAndControl.id, 'currentLevel')).toBe(false);
      expect(device.hasAttributeServer(ValveConfigurationAndControl.id, 'targetLevel')).toBe(false);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      vi.clearAllMocks();
      await device.invokeBehaviorCommand('valveConfigurationAndControl', 'open', {});
      await vi.waitFor(() => {
        expect(publishCommandSpy).toHaveBeenCalledWith('open', friendlyName, { state: 'ON' });
      }, waitOptions);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command open called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));

      vi.clearAllMocks();
      await device.invokeBehaviorCommand('valveConfigurationAndControl', 'close', {});
      await vi.waitFor(() => {
        expect(publishCommandSpy).toHaveBeenCalledWith('close', friendlyName, { state: 'OFF' });
      }, waitOptions);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command close called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));

      let payload: Payload;

      vi.clearAllMocks();
      payload = { state: 'ON' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Open);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      }, waitOptions);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.INFO,
        `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
      );

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      }, waitOptions);

      vi.clearAllMocks();
      await expect(device.invokeBehaviorCommand('valveConfigurationAndControl', 'open', { targetLevel: 50 })).rejects.toThrow(/targetLevel 50/);
      expect(publishCommandSpy).not.toHaveBeenCalled();
      expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);

      vi.clearAllMocks();
      await device.invokeBehaviorCommand('valveConfigurationAndControl', 'close', {});
      await vi.waitFor(() => {
        expect(publishCommandSpy).toHaveBeenCalledWith('close', friendlyName, { state: 'OFF' });
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Open);
      }, waitOptions);

      vi.clearAllMocks();
      await device.invokeBehaviorCommand('valveConfigurationAndControl', 'open', {});
      await vi.waitFor(() => {
        expect(publishCommandSpy).toHaveBeenCalledWith('open', friendlyName, { state: 'ON' });
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Open);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      }, waitOptions);

      vi.useFakeTimers();
      try {
        vi.clearAllMocks();
        await device.invokeBehaviorCommand('valveConfigurationAndControl', 'open', { openDuration: 1 });
        await vi.advanceTimersByTimeAsync(0);
        expect(publishCommandSpy).toHaveBeenCalledWith('open', friendlyName, { state: 'ON' });
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'remainingDuration')).toBe(1);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Open);
        await vi.advanceTimersByTimeAsync(1000);
        expect(publishCommandSpy).toHaveBeenCalledWith('close', friendlyName, { state: 'OFF' });
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'remainingDuration')).toBeNull();
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Transitioning);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
      } finally {
        vi.useRealTimers();
      }

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
        expect(device.getAttribute(ValveConfigurationAndControl.id, 'targetState')).toBeNull();
      }, waitOptions);

      platform.config.valveList = [];
      entity.destroy();
    });

    test('create a 2ch switch device', async () => {
      const friendlyName = 'Aqara Dual relay module T2';
      const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === friendlyName);
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement", "fixedLabel"]);
      expect(device.getChildEndpoints()).toHaveLength(3); // 2 channels + root
      const ch1 = device.getChildEndpointById('l1');
      expect(ch1).toBeInstanceOf(MatterbridgeEndpoint);
      const ch2 = device.getChildEndpointById('l2');
      expect(ch2).toBeInstanceOf(MatterbridgeEndpoint);
      if (!ch1 || !ch2) throw new Error('Child endpoints not found');
      // oxfmt-ignore
      for (const child of device.getChildEndpoints()) {
        // expect(['l1', 'l2'].includes(child.id)).toBe(true);
        if (child.id === 'l1') {
          // oxlint-disable-next-line vitest/no-conditional-expect
          expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "onOff"]);
        }
        if (child.id === 'l2') {
          // oxlint-disable-next-line vitest/no-conditional-expect
          expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "onOff"]);
        }
        if (child.id !== 'l1' && child.id !== 'l2') {
          // oxlint-disable-next-line vitest/no-conditional-expect
          expect(child.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "identify", "switch"]);
        }
      }
      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands for ch1 from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch1, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch1.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l1: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch1, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch1.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state_l1: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch1, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch1.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l1: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      // Test commands for ch2 from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch2, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch2.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l2: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch2, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch2.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state_l2: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(ch2, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(ch2.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state_l2: 'ON' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      // Test updates from Z2M for ch1 ch2
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state_l1: 'OFF', state_l2: 'OFF', energy: 123.4, voltage: 230, power: 0, current: 0 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
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
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state_l1: 'ON', state_l2: 'ON', energy: 124, voltage: 220, power: 56, current: 0.789 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
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
      }, waitOptions);

      entity.destroy();
    });

    test('create a cover device', async () => {
      const friendlyName = 'Window shutter';
      const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === friendlyName);
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "windowCovering"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(0);
      expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(0);
      expect(device.getAttribute('WindowCovering', 'operationalStatus')).toEqual({
        global: WindowCovering.MovementStatus.Stopped,
        lift: WindowCovering.MovementStatus.Stopped,
      });
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.DEBUG,
          expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
        );
      }, waitOptions);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'upOrOpen');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(0);
        expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(0);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command upOrOpen called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('upOrOpen', friendlyName, { state: 'OPEN' });
      // await device.setAttribute('WindowCovering', 'currentPositionLiftPercent100ths', 0);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'downOrClose');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(10000);
        expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(10000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command downOrClose called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('downOrClose', friendlyName, { state: 'CLOSE' });
      // await device.setAttribute('WindowCovering', 'currentPositionLiftPercent100ths', 10000);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 5000 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(5000);
        expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(5000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command goToLiftPercentage called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('goToLiftPercentage', friendlyName, { position: 50 });
      // await device.setAttribute('WindowCovering', 'currentPositionLiftPercent100ths', 5000);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'WindowCovering', 'stopMotion');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('WindowCovering', 'operationalStatus')).toEqual({
          global: WindowCovering.MovementStatus.Stopped,
          lift: WindowCovering.MovementStatus.Stopped,
        });
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(5000);
        expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(5000);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command stopMotion called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('stopMotion', friendlyName, { state: 'STOP' });

      // Test updates from Z2M
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { position: 0 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(0);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { position: 100 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(10000);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { moving: 'UP' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('WindowCovering', 'operationalStatus')).toEqual({
          global: WindowCovering.MovementStatus.Opening,
          lift: WindowCovering.MovementStatus.Opening,
        });
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { motor_state: 'opening' });

      vi.clearAllMocks();
      payload = { moving: 'DOWN' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('WindowCovering', 'operationalStatus')).toEqual({
          global: WindowCovering.MovementStatus.Closing,
          lift: WindowCovering.MovementStatus.Closing,
        });
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { motor_state: 'closing' });

      vi.clearAllMocks();
      payload = { moving: 'STOP' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('WindowCovering', 'operationalStatus')).toEqual({
          global: WindowCovering.MovementStatus.Stopped,
          lift: WindowCovering.MovementStatus.Stopped,
        });
        expect(device.getAttribute('WindowCovering', 'currentPositionLiftPercent100ths')).toBe(10000);
        expect(device.getAttribute('WindowCovering', 'targetPositionLiftPercent100ths')).toBe(10000);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { motor_state: 'stopped' });

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test('create a lock device', async () => {
      // await setDebug(true);
      const z2mDevice = lock;
      const friendlyName = z2mDevice.friendly_name;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice as unknown as BridgeDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "doorLock"]);
      expect(device.getChildEndpoints()).toHaveLength(0);
      expect(featuresFor(device, 'doorLock')).toEqual({
        aliroBleuwb: false,
        aliroProvisioning: false,
        credentialOverTheAirAccess: false,
        doorPositionSensor: false,
        faceCredentials: false,
        fingerCredentials: false,
        holidaySchedules: false,
        pinCredential: false,
        rfidCredential: false,
        unbolting: false,
        user: false,
        weekDayAccessSchedules: false,
        yearDayAccessSchedules: false,
      });
      // await setDebug(false);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('doorLock', 'lockState')).toBe(DoorLock.LockState.Locked);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller
      vi.clearAllMocks();
      await device.invokeBehaviorCommand('doorLock', 'lockDoor', {});
      await vi.waitFor(() => expect((entity as any).cachePublishTimeout).toBeUndefined(), waitOptions); // Wait for the cachePublish timeout
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command lockDoor called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('lockDoor', friendlyName, { state: 'LOCK' });

      vi.clearAllMocks();
      await device.invokeBehaviorCommand('doorLock', 'unlockDoor', {});
      await vi.waitFor(() => expect((entity as any).cachePublishTimeout).toBeUndefined(), waitOptions); // Wait for the cachePublish timeout
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`Command unlockDoor called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('unlockDoor', friendlyName, { state: 'UNLOCK' });

      // Test updates from Z2M
      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { state: 'LOCK' });
      await vi.waitFor(() => {
        expect(device.getAttribute('doorLock', 'lockState')).toBe(DoorLock.LockState.Locked);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { state: 'UNLOCK' });
      await vi.waitFor(() => {
        expect(device.getAttribute('doorLock', 'lockState')).toBe(DoorLock.LockState.Unlocked);
      }, waitOptions);

      // Configure triggers the lockOperation event for the unlocked state
      vi.clearAllMocks();
      await entity.configure();
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining('DoorLock cluster'));

      entity.destroy();
    });

    test('create a thermostat device', async () => {
      // await setDebug(true);
      const z2mDevice = thermo;
      const friendlyName = z2mDevice.friendly_name;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice as unknown as BridgeDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "thermostat", "identify"]);
      expect(device.getChildEndpoints()).toHaveLength(0);
      expect(featuresFor(device, 'Thermostat')).toEqual({
        autoMode: true,
        cooling: true,
        events: false,
        heating: true,
        localTemperatureNotExposed: false,
        matterScheduleConfiguration: false,
        occupancy: false,
        presets: false,
        setback: false,
        thermostatSuggestions: false,
      });
      // await setDebug(false);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('Thermostat', 'systemMode')).toBe(Thermostat.SystemMode.Auto);
      expect(device.getAttribute('Thermostat', 'occupiedCoolingSetpoint')).toBe(2500);
      expect(device.getAttribute('Thermostat', 'occupiedHeatingSetpoint')).toBe(2100);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test updates from Z2M
      vi.clearAllMocks();
      let payload: Payload = { system_mode: 'heat', current_heating_setpoint: 23 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('Thermostat', 'systemMode')).toBe(Thermostat.SystemMode.Heat);
        expect(device.getAttribute('Thermostat', 'occupiedHeatingSetpoint')).toBe(2300);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { system_mode: 'cool', current_heating_setpoint: 24 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('Thermostat', 'systemMode')).toBe(Thermostat.SystemMode.Cool);
        expect(device.getAttribute('Thermostat', 'occupiedCoolingSetpoint')).toBe(2400);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);
      await device.setAttribute('Thermostat', 'occupiedHeatingSetpoint', 2100);
      await device.setAttribute('Thermostat', 'occupiedCoolingSetpoint', 2500);

      // Test commands from the controller
      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Thermostat', 'setpointRaiseLower', { mode: Thermostat.SetpointRaiseLowerMode.Both, amount: 100 });
      await vi.waitFor(() => expect((entity as any).cachePublishTimeout).toBeUndefined(), waitOptions); // Wait for the cachePublish timeout
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Command setpointRaiseLower called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
        expect.anything(),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedHeatingSetpoint', friendlyName, { occupied_heating_setpoint: 31 });
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedCoolingSetpoint', friendlyName, { occupied_cooling_setpoint: 35 });

      // Test writes from the controller
      vi.clearAllMocks();
      (entity as any).thermostatTimeoutTime = 1;
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Off);
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Cool);
      await device.setAttribute('Thermostat', 'systemMode', Thermostat.SystemMode.Heat);
      await device.setAttribute('Thermostat', 'occupiedCoolingSetpoint', 2200);
      await device.setAttribute('Thermostat', 'occupiedHeatingSetpoint', 2200);
      expect(publishCommandSpy).toHaveBeenCalledTimes(0);

      // @ts-expect-error accessing private property for test
      entity.thermostatTimeoutTime = 1;
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Off, Thermostat.SystemMode.Heat);
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Heat, Thermostat.SystemMode.Cool);
      await invokeSubscribeHandler(device, 'Thermostat', 'systemMode', Thermostat.SystemMode.Cool, Thermostat.SystemMode.Off);
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedHeatingSetpoint', 2000, 2200);
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedCoolingSetpoint', 2000, 2200);
      expect(publishCommandSpy).toHaveBeenCalledTimes(5);
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions); // Wait for the thermostat noUpdate reset timeouts

      entity.destroy();
    });

    test('create a dimmer device', async () => {
      const z2mDevice = singleDimmer;
      const friendlyName = z2mDevice.friendly_name;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "scenesManagement", "onOff", "levelControl", "powerTopology", "electricalPowerMeasurement", "electricalEnergyMeasurement"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.DEBUG,
          expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
        );
      }, waitOptions);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 128, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(128);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command moveToLevel called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevel', friendlyName, { brightness: 128, transition: 1 });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 200, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);
      }, waitOptions);
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
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON', brightness: 200 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      entity.destroy();
    });

    test('create a rgb device', async () => {
      const z2mDevice = rgbCctController;
      const friendlyName = z2mDevice.friendly_name;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice as BridgeDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "colorControl", "identify", "groups", "scenesManagement", "onOff", "levelControl"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test commands from the controller

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'Identify', 'identify', { identifyTime: 3 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.DEBUG,
          expect.stringContaining(`Command identify called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
        );
      }, waitOptions);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`));
      expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'toggle');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 128, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(128);
      }, waitOptions);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`Command moveToLevel called for ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db}`),
      );
      expect(publishCommandSpy).toHaveBeenCalledWith('moveToLevel', friendlyName, { brightness: 128, transition: 1 });
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        expect.stringContaining(`No update for 2 seconds to allow the device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} to update its state`),
      );

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 200, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 1, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(1);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevelWithOnOff', { level: 100, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(100);
      }, waitOptions);
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

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', { colorTemperatureMireds: 200, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(200);
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToColorTemperature', friendlyName, { color_temp: 200 });
      }, waitOptions);

      vi.clearAllMocks();
      const colorTempMap = (entity as any).propertyMap.get('color_temp');
      (entity as any).propertyMap.delete('color_temp');
      const fallbackMireds = 250;
      const fallbackRgb = kelvinToRGB(miredToKelvin(fallbackMireds));
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', {
        colorTemperatureMireds: fallbackMireds,
        transitionTime: null,
        optionsMask: 1,
        optionsOverride: 1,
      });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToColorTemperature', friendlyName, { color: { r: fallbackRgb.r, g: fallbackRgb.g, b: fallbackRgb.b } });
        expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining(`but color_temp property is not available. Converting ${fallbackMireds} to RGB`));
      }, waitOptions);
      if (colorTempMap) (entity as any).propertyMap.set('color_temp', colorTempMap);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToHue', {
        hue: 150,
        transitionTime: null,
        direction: ColorControl.Direction.Up,
        optionsMask: 1,
        optionsOverride: 1,
      });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(150);
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToHue', friendlyName, { color: { h: 213, s: 0 } });
      }, waitOptions);

      vi.clearAllMocks();
      // oxfmt-ignore
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToSaturation', { saturation: 80, transitionTime: null, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(80);
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToSaturation', friendlyName, { color: { h: 213, s: 31 } });
      }, waitOptions);

      vi.clearAllMocks();
      // oxfmt-ignore
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToHueAndSaturation', { hue: 130, saturation: 70, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(130);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(70);
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToHueAndSaturation', friendlyName, { color: { h: 184, s: 28 }, transition: 1 });
      }, waitOptions);

      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColor', { colorX: 32000, colorY: 30000, transitionTime: 10, optionsMask: 1, optionsOverride: 1 });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
        expect(device.getAttribute('ColorControl', 'currentX')).toBe(32000);
        expect(device.getAttribute('ColorControl', 'currentY')).toBe(30000);
        expect(publishCommandSpy).toHaveBeenCalledWith('moveToColor', friendlyName, { color: { x: 0.4883, y: 0.4578 }, transition: 1 });
      }, waitOptions);

      // Turn the light off and test that moveToLevel and moveToColorTemperature commands remember their state
      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      }, waitOptions);
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 160, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      // oxfmt-ignore
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColorTemperature', { colorTemperatureMireds: 350, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(160);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
      }, waitOptions);
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(160);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
        expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: 161, color_temp: 350 });
      }, waitOptions);

      // Turn the light off and test that moveToLevel and moveToHueAndSaturation commands remember their state
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      }, waitOptions);
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 135, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      // oxfmt-ignore
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToHueAndSaturation', { hue: 125, saturation: 40, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(135);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
      }, waitOptions);
      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(135);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
      }, waitOptions);
      // oxfmt-ignore
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: Math.round((135 / 254) * 255), color: { h: Math.round(125 / 254 * 360), s: Math.round(40 / 254 * 100) } });

      // Turn the light off and test that moveToLevel and moveToColor commands remember their state
      await invokeBehaviorCommand(device, 'OnOff', 'off');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(publishCommandSpy).toHaveBeenCalledWith('off', friendlyName, { state: 'OFF' });
      }, waitOptions);
      await invokeBehaviorCommand(device, 'LevelControl', 'moveToLevel', { level: 115, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      // oxfmt-ignore
      await invokeBehaviorCommand(device, 'ColorControl', 'moveToColor', { colorX: 25000, colorY: 28000, transitionTime: null, optionsMask: executeTrue, optionsOverride: executeTrue });
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(115);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
        expect(device.getAttribute('ColorControl', 'currentX')).toBe(25000);
        expect(device.getAttribute('ColorControl', 'currentY')).toBe(28000);
      }, waitOptions);
      vi.clearAllMocks();
      await invokeBehaviorCommand(device, 'OnOff', 'on');
      await vi.waitFor(() => {
        expect((entity as any).cachePublishTimeout).toBeUndefined();
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(115);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentXAndCurrentY);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(350);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(125);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(40);
        expect(device.getAttribute('ColorControl', 'currentX')).toBe(25000);
        expect(device.getAttribute('ColorControl', 'currentY')).toBe(28000);
      }, waitOptions);
      // oxfmt-ignore
      expect(publishCommandSpy).toHaveBeenCalledWith('on', friendlyName, { state: 'ON', brightness: Math.round((115 / 254) * 255), color: { x: 25000 / 65535, y: 28000 / 65535 } });

      // Test updates from Z2M
      let payload: Payload;
      clearTimeout((entity as any).cachePublishTimeout);
      clearTimeout((entity as any).noUpdateTimeout);
      (entity as any).noUpdate = false;

      vi.clearAllMocks();
      payload = { state: 'OFF' };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON', brightness: 200 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(200);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON', brightness: 150, color_mode: 'color_temp', color_temp: 260 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(150);
        expect(device.getAttribute('ColorControl', 'colorTemperatureMireds')).toBe(260);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.ColorTemperatureMireds);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON', brightness: 130, color_mode: 'hs', color: { hue: 150, saturation: 90 } };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(130);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(Math.round((150 / 360) * 254));
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(Math.round((90 / 100) * 254));
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      payload = { state: 'ON', brightness: 130, color_mode: 'xy', color: { x: 0.56, y: 0.92 } };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
        expect(device.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(device.getAttribute('LevelControl', 'currentLevel')).toBe(130);
        expect(device.getAttribute('ColorControl', 'currentHue')).toBe(49);
        expect(device.getAttribute('ColorControl', 'currentSaturation')).toBe(254);
        expect(device.getAttribute('ColorControl', 'colorMode')).toBe(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(payload)}`,
        );
      }, waitOptions);

      entity.destroy();
    }, 30000);

    test('create a temperature, humidity and pressure sensor device', async () => {
      const friendlyName = climateSensor.friendly_name;
      const z2mDevice = climateSensor;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "temperatureMeasurement", "relativeHumidityMeasurement", "pressureMeasurement"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(null);
      expect(device.getAttribute('RelativeHumidityMeasurement', 'measuredValue')).toBe(null);
      expect(device.getAttribute('PressureMeasurement', 'measuredValue')).toBe(null);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test updates from Z2M
      vi.clearAllMocks();
      const payload: Payload = { temperature: 22.5, humidity: 55.3, pressure: 1013.2, linkquality: 120, battery: 95, voltage: 2900 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
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
      }, waitOptions);

      vi.clearAllMocks();
      const lowBatteryPayload: Payload = { battery: 19 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, lowBatteryPayload);
      await vi.waitFor(() => {
        expect(device.getAttribute('PowerSource', 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Critical);
        expect(device.getAttribute('PowerSource', 'batPercentRemaining')).toBe((lowBatteryPayload.battery as number) * 2);
        expect(loggerLogSpy).toHaveBeenCalledWith(
          LogLevel.INFO,
          `${db}MQTT message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}${db} payload: ${debugStringify(lowBatteryPayload)}`,
        );
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test('create a motion, illuminance sensor device', async () => {
      const friendlyName = motionSensor.friendly_name;
      const z2mDevice = motionSensor;
      expect(z2mDevice).toBeDefined();
      if (!z2mDevice) throw new Error('Z2M Device not found');
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).cachePublishTimeoutTime = 1;
      expect(entity).toBeDefined();
      expect(entity.entityName).toBe(friendlyName);
      const device = entity.bridgedDevice;
      expect(device).toBeDefined();
      expect(device).toBeInstanceOf(MatterbridgeEndpoint);
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      // oxfmt-ignore
      expect(device.getAllClusterServerNames()).toEqual(["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "identify", "illuminanceMeasurement", "occupancySensing"]);
      expect(device.getChildEndpoints()).toHaveLength(0);

      vi.clearAllMocks();
      expect(await addDevice(aggregator, device)).toBe(true);
      expect(device.getAttribute('OccupancySensing', 'occupancy')).toEqual({ occupied: false });
      expect(device.getAttribute('IlluminanceMeasurement', 'measuredValue')).toBe(null);
      expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);

      // Test updates from Z2M
      vi.clearAllMocks();
      const payload: Payload = { illuminance: 539, occupancy: true, linkquality: 120, battery: 95, voltage: 2900 };
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
      await vi.waitFor(() => {
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
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`OFFLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(false);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`ONLINE-${z2mDevice.friendly_name}`);
      await vi.waitFor(() => {
        expect(device.getAttribute('BridgedDeviceBasicInformation', 'reachable')).toBe(true);
        expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${z2mDevice.friendly_name}${rs}`);
      }, waitOptions);

      entity.destroy();
    });

    test.each([
      {
        title: 'water leak sensor',
        device: makeDevice('Test leak sensor', '0x00000000000000a1', [generic('water_leak', 'binary'), generic('battery_low', 'binary'), generic('battery')], 'Battery'),
        clusters: ['booleanState'],
        payload: { water_leak: true, battery_low: true },
        expected: [
          ['BooleanState', 'stateValue', true],
          ['PowerSource', 'batChargeLevel', PowerSource.BatChargeLevel.Critical],
        ],
      },
      {
        title: 'rain sensor',
        device: makeDevice('Test rain sensor', '0x00000000000000a2', [generic('rain', 'binary')]),
        clusters: ['booleanState'],
        payload: { rain: true },
        expected: [['BooleanState', 'stateValue', true]],
      },
      {
        title: 'smoke sensor',
        device: makeDevice('Test smoke sensor', '0x00000000000000a3', [generic('smoke', 'binary')]),
        clusters: ['smokeCoAlarm'],
        payload: { smoke: true },
        expected: [['SmokeCoAlarm', 'smokeState', SmokeCoAlarm.AlarmState.Critical]],
      },
      {
        title: 'carbon monoxide sensor',
        device: makeDevice('Test co sensor', '0x00000000000000a4', [generic('carbon_monoxide', 'binary'), generic('co')]),
        clusters: ['booleanState', 'carbonMonoxideConcentrationMeasurement'],
        payload: { carbon_monoxide: true, co: 12.4 },
        expected: [
          ['BooleanState', 'stateValue', false],
          ['CarbonMonoxideConcentrationMeasurement', 'measuredValue', 12],
        ],
      },
      {
        title: 'air quality sensor',
        device: makeDevice('Test air quality sensor', '0x00000000000000a5', [
          generic('air_quality', 'enum', { values: ['unknown', 'excellent', 'good', 'moderate', 'poor', 'unhealthy', 'out_of_range'] }),
          generic('voc'),
          generic('co2'),
          generic('formaldehyd'),
          generic('pm1'),
          generic('pm25'),
          generic('pm10'),
        ]),
        clusters: ['airQuality', 'totalVolatileOrganicCompoundsConcentrationMeasurement', 'pm25ConcentrationMeasurement'],
        payload: { air_quality: 'good', voc: 300, co2: 812.6, formaldehyd: 0.4, pm1: 5.4, pm25: 9.6, pm10: 20 },
        expected: [
          ['AirQuality', 'airQuality', AirQuality.AirQualityEnum.Fair],
          ['TotalVolatileOrganicCompoundsConcentrationMeasurement', 'measuredValue', 300],
          ['CarbonDioxideConcentrationMeasurement', 'measuredValue', 813],
          ['FormaldehydeConcentrationMeasurement', 'measuredValue', 0],
          ['Pm1ConcentrationMeasurement', 'measuredValue', 5],
          ['Pm25ConcentrationMeasurement', 'measuredValue', 10],
          ['Pm10ConcentrationMeasurement', 'measuredValue', 20],
        ],
      },
      {
        title: 'cpu temperature sensor',
        device: makeDevice('Test cpu sensor', '0x00000000000000a7', [generic('cpu_temperature')]),
        clusters: ['temperatureMeasurement'],
        payload: { cpu_temperature: 45.678 },
        expected: [['TemperatureMeasurement', 'measuredValue', 4568]],
      },
      {
        title: 'soil moisture sensor',
        device: makeDevice('Test soil sensor', '0x00000000000000a6', [generic('soil_moisture')]),
        clusters: ['relativeHumidityMeasurement'],
        payload: { soil_moisture: 41.25 },
        expected: [['RelativeHumidityMeasurement', 'measuredValue', 4125]],
      },
    ] as { title: string; device: BridgeDevice; clusters: string[]; payload: Payload; expected: [string, string, unknown][] }[])(
      'create a $title device',
      async ({ device: z2mDevice, clusters, payload, expected }) => {
        const entity = await ZigbeeDevice.create(platform, z2mDevice);
        (entity as any).cachePublishTimeoutTime = 1;
        const device = entity.bridgedDevice;
        if (!device) throw new Error('MatterbridgeEndpoint is undefined');
        expect(device.getAllClusterServerNames()).toEqual(expect.arrayContaining(clusters));
        expect(await addDevice(aggregator, device)).toBe(true);

        vi.clearAllMocks();
        platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, payload);
        await vi.waitFor(() => {
          for (const [cluster, attribute, value] of expected) expect(device.getAttribute(cluster, attribute)).toBe(value);
        }, waitOptions);

        entity.destroy();
      },
    );

    test('create a cpu temperature sensor device on an endpoint', async () => {
      // Some devices expose cpu_temperature with property temperature on an endpoint (e.g. msh, xyzroe)
      const z2mDevice = makeDevice('Test cpu endpoint sensor', '0x00000000000000aa', [{ ...generic('cpu_temperature'), property: 'temperature_l3', endpoint: 'l3' }]);
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      const child = device.getChildEndpointById('l3');
      if (!child) throw new Error('Child endpoint l3 is undefined');
      expect(child.getAllClusterServerNames()).toEqual(expect.arrayContaining(['temperatureMeasurement']));
      expect(await addDevice(aggregator, device)).toBe(true);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { temperature_l3: 45.678 });
      await vi.waitFor(() => expect(child.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(4568), waitOptions);

      entity.destroy();
    });

    test('handle duplicate, null, out of lookup and unknown action payloads', async () => {
      const z2mDevice = makeDevice('Test guard sensor', '0x00000000000000a8', [
        generic('air_quality', 'enum', { values: ['unknown', 'excellent', 'good', 'moderate', 'poor', 'unhealthy', 'out_of_range'] }),
        generic('action', 'enum', { values: ['single'] }),
      ]);
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(await addDevice(aggregator, device)).toBe(true);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { air_quality: 'good' });
      await vi.waitFor(() => expect(device.getAttribute('AirQuality', 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair), waitOptions);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { air_quality: 'good' });
      expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining('MQTT message for device'));

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { air_quality: null, linkquality: 100 });
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { air_quality: 'bogus' });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('not found in propertyMap values'));
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { action: 'double' });
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('not found in propertyMap'));
      expect(device.getAttribute('AirQuality', 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair);

      entity.destroy();
    });

    test('create a device with device_temperature and a device feature blacklist', async () => {
      const z2mDevice = makeDevice('Test device temperature', '0x00000000000000a9', [generic('device_temperature'), generic('battery')], 'Battery');
      const featureBlackList = platform.config.featureBlackList;
      platform.config.featureBlackList = [];
      platform.config.deviceFeatureBlackList = { [z2mDevice.friendly_name]: ['battery'] };
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      platform.config.featureBlackList = featureBlackList;
      platform.config.deviceFeatureBlackList = {};
      expect(loggerDebugSpy).toHaveBeenCalledWith(expect.stringContaining('feature battery property battery is blacklisted'));
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(await addDevice(aggregator, device)).toBe(true);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { device_temperature: 31.5 });
      await vi.waitFor(() => expect(device.getAttribute('TemperatureMeasurement', 'measuredValue')).toBe(3150), waitOptions);

      entity.destroy();
    });

    test('create devices with switchList, lightList and outletList overrides', async () => {
      const findDevice = (name: string): BridgeDevice => {
        const z2mDevice = platform.z2mBridgeDevices?.find((device) => device.friendly_name === name);
        if (!z2mDevice) throw new Error(`Z2M Device ${name} not found`);
        return structuredClone(z2mDevice);
      };

      // Dimmable light as outlet
      platform.config.outletList = ['Gledopto GL-SD-001'];
      const outlet = await ZigbeeDevice.create(platform, findDevice('Gledopto GL-SD-001'));
      platform.config.outletList = [];
      (outlet as any).cachePublishTimeoutTime = 1;
      const outletDevice = outlet.bridgedDevice;
      if (!outletDevice) throw new Error('MatterbridgeEndpoint is undefined');
      expect(outletDevice.deviceTypes.has(dimmablePlugInUnit.code)).toBe(true);
      expect(outletDevice.deviceTypes.has(onOffPlugInUnit.code)).toBe(false);
      expect(await addDevice(aggregator, outletDevice)).toBe(true);
      platform.z2m.emit(`MESSAGE-${outlet.entityName}`, { state: 'ON', brightness: 100 });
      await vi.waitFor(() => {
        expect(outletDevice.getAttribute('OnOff', 'onOff')).toBe(true);
        expect(outletDevice.getAttribute('LevelControl', 'currentLevel')).toBe(100);
      }, waitOptions);
      // Destroy with a pending cache publish
      (outlet as any).cachePublishTimeoutTime = 1000;
      await invokeBehaviorCommand(outletDevice, 'OnOff', 'off');
      expect((outlet as any).cachePublishTimeout).toBeDefined();
      outlet.destroy();
      expect((outlet as any).cachePublishTimeout).toBeUndefined();

      // Color light as switch
      platform.config.switchList = ['Moes RGBCCT light bulb'];
      const colorSwitch = await ZigbeeDevice.create(platform, findDevice('Moes RGBCCT light bulb'));
      platform.config.switchList = [];
      const colorSwitchDevice = colorSwitch.bridgedDevice;
      if (!colorSwitchDevice) throw new Error('MatterbridgeEndpoint is undefined');
      expect(colorSwitchDevice.deviceTypes.has(colorDimmerSwitch.code)).toBe(true);
      expect(colorSwitchDevice.deviceTypes.has(dimmerSwitch.code)).toBe(false);
      expect(colorSwitchDevice.deviceTypes.has(onOffLightSwitch.code)).toBe(false);
      expect(await addDevice(aggregator, colorSwitchDevice)).toBe(true);
      platform.z2m.emit(`MESSAGE-${colorSwitch.entityName}`, { brightness: 300 });
      await vi.waitFor(() => expect(colorSwitchDevice.getAttribute('LevelControl', 'currentLevel')).toBe(254), waitOptions);
      colorSwitch.destroy();

      // Switch as light
      platform.config.lightList = ['Aqara switch no neutral'];
      const light = await ZigbeeDevice.create(platform, findDevice('Aqara switch no neutral'));
      platform.config.lightList = [];
      expect(light.bridgedDevice?.deviceTypes.has(onOffLight.code)).toBe(true);
      light.destroy();
    });

    test('create groups with switchList, lightList and outletList overrides', async () => {
      const switches = platform.z2mBridgeGroups?.find((group) => group.friendly_name === 'Switches');
      if (!switches) throw new Error('Z2M Group not found');
      const z2mGroup = { ...switches, scenes: [] }; // The group scenes are already registered as virtual devices
      for (const [list, deviceType] of [
        ['switchList', onOffLightSwitch],
        ['lightList', onOffLight],
        ['outletList', onOffPlugInUnit],
      ] as const) {
        platform.config[list] = [z2mGroup.friendly_name];
        const entity = await ZigbeeGroup.create(platform, z2mGroup);
        platform.config[list] = [];
        expect(entity.bridgedDevice?.deviceTypes.has(deviceType.code)).toBe(true);
        entity.destroy();
      }
    });

    test('create a group with an unknown member', async () => {
      const entity = await ZigbeeGroup.create(platform, {
        id: 9002,
        friendly_name: 'Unknown members',
        description: '',
        members: [{ ieee_address: '0xffffffffffffffff', endpoint: 1 }],
        scenes: [],
      });
      expect(entity.bridgedDevice).toBeUndefined();
      entity.destroy();
    });

    test('create a heating only thermostat device', async () => {
      const z2mDevice = makeDevice('Test heating thermostat', '0x00000000000000b1', [
        {
          type: 'climate',
          features: [
            generic('local_temperature'),
            generic('occupied_heating_setpoint', 'numeric', { value_min: 5, value_max: 30 }),
            generic('unoccupied_heating_setpoint', 'numeric', { value_min: 5, value_max: 30 }),
            generic('system_mode', 'enum', { values: ['off', 'heat'] }),
          ],
        },
        generic('min_heat_setpoint_limit'),
        generic('max_heat_setpoint_limit'),
      ]);
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).thermostatTimeoutTime = 1;
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(featuresFor(device, 'thermostat')).toEqual(expect.objectContaining({ heating: true, cooling: false }));
      expect(await addDevice(aggregator, device)).toBe(true);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { occupied_heating_setpoint: 21, min_heat_setpoint_limit: 6, max_heat_setpoint_limit: 29 });
      await vi.waitFor(() => expect(device.getAttribute('Thermostat', 'occupiedHeatingSetpoint')).toBe(2100), waitOptions);
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { unoccupied_heating_setpoint: 17 });
      await vi.waitFor(() => expect(device.getAttribute('Thermostat', 'occupiedHeatingSetpoint')).toBe(1700), waitOptions);

      vi.clearAllMocks();
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedHeatingSetpoint', 2200, 1700);
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedHeatingSetpoint', z2mDevice.friendly_name, { occupied_heating_setpoint: 22 });
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions);

      entity.destroy();
    });

    test('create a cooling only thermostat device', async () => {
      const z2mDevice = makeDevice('Test cooling thermostat', '0x00000000000000b2', [
        {
          type: 'climate',
          features: [
            generic('local_temperature'),
            generic('occupied_cooling_setpoint', 'numeric', { value_min: 16, value_max: 32 }),
            generic('unoccupied_cooling_setpoint', 'numeric', { value_min: 16, value_max: 32 }),
            generic('system_mode', 'enum', { values: ['off', 'cool'] }),
          ],
        },
      ]);
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).thermostatTimeoutTime = 1;
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(featuresFor(device, 'thermostat')).toEqual(expect.objectContaining({ heating: false, cooling: true }));
      expect(await addDevice(aggregator, device)).toBe(true);

      vi.clearAllMocks();
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { occupied_cooling_setpoint: 25 });
      await vi.waitFor(() => expect(device.getAttribute('Thermostat', 'occupiedCoolingSetpoint')).toBe(2500), waitOptions);
      platform.z2m.emit(`MESSAGE-${z2mDevice.friendly_name}`, { unoccupied_cooling_setpoint: 28 });
      await vi.waitFor(() => expect(device.getAttribute('Thermostat', 'occupiedCoolingSetpoint')).toBe(2800), waitOptions);

      vi.clearAllMocks();
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedCoolingSetpoint', 2400, 2800);
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedCoolingSetpoint', z2mDevice.friendly_name, { occupied_cooling_setpoint: 24 });
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions);

      entity.destroy();
    });

    test('create an auto thermostat device with current_heating_setpoint', async () => {
      const z2mDevice = makeDevice('Test current setpoint thermostat', '0x00000000000000b3', [
        {
          type: 'climate',
          features: [
            generic('local_temperature'),
            generic('current_heating_setpoint', 'numeric', { value_min: 5, value_max: 35 }),
            generic('occupied_heating_setpoint', 'numeric', { value_min: 5, value_max: 35 }),
            generic('occupied_cooling_setpoint', 'numeric', { value_min: 5, value_max: 35 }),
            generic('system_mode', 'enum', { values: ['off', 'auto', 'heat', 'cool'] }),
          ],
        },
      ]);
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      (entity as any).thermostatTimeoutTime = 1;
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(featuresFor(device, 'thermostat')).toEqual(expect.objectContaining({ heating: true, cooling: true }));
      expect(await addDevice(aggregator, device)).toBe(true);

      // The device uses current_heating_setpoint for both heating and cooling (see issue #89)
      vi.clearAllMocks();
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedHeatingSetpoint', 2100, 2000);
      await invokeSubscribeHandler(device, 'Thermostat', 'occupiedCoolingSetpoint', 2600, 2500);
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedHeatingSetpoint', z2mDevice.friendly_name, { current_heating_setpoint: 21 });
      expect(publishCommandSpy).toHaveBeenCalledWith('OccupiedCoolingSetpoint', z2mDevice.friendly_name, { current_heating_setpoint: 26 });
      await vi.waitFor(() => expect((entity as any).noUpdate).toBe(false), waitOptions);

      entity.destroy();
    });

    test('create a six channel device with color child endpoints and scenes', async () => {
      const lightFeatures = (endpoint: string, colors: string[]): object => ({
        type: 'light',
        endpoint,
        features: [
          { ...generic('state', 'binary'), property: `state_${endpoint}` },
          { ...generic('brightness'), property: `brightness_${endpoint}` },
          ...colors.map((color) => ({
            ...generic(color, color === 'color_temp' ? 'numeric' : 'composite'),
            property: color === 'color_temp' ? `color_temp_${endpoint}` : `color_${endpoint}`,
          })),
        ],
      });
      const switchFeatures = (endpoint: string): object => ({ type: 'switch', endpoint, features: [{ ...generic('state', 'binary'), property: `state_${endpoint}` }] });
      const z2mDevice = makeDevice('Test six channel', '0x00000000000000c1', [
        lightFeatures('l1', ['color_temp', 'color_xy', 'color_hs']),
        lightFeatures('l2', ['color_xy']),
        switchFeatures('l3'),
        switchFeatures('l4'),
        switchFeatures('l5'),
        switchFeatures('l6'),
      ]);
      if (z2mDevice.endpoints['1']) z2mDevice.endpoints['1'].scenes = [{ id: 1, name: 'Movie' }];
      const registerVirtualDeviceSpy = vi.spyOn(platform, 'registerVirtualDevice').mockImplementation(async (_name, _type, callback) => {
        await callback();
        return true;
      });
      const entity = await ZigbeeDevice.create(platform, z2mDevice);
      registerVirtualDeviceSpy.mockRestore();
      expect(publishCommandSpy).toHaveBeenCalledWith('scene_recall', z2mDevice.friendly_name, { scene_recall: 1 });
      const device = entity.bridgedDevice;
      if (!device) throw new Error('MatterbridgeEndpoint is undefined');
      expect(device.getChildEndpoints()).toHaveLength(6);
      const l2 = device.getChildEndpointById('l2');
      expect(l2?.deviceTypes.has(extendedColorLight.code)).toBe(true);
      expect(l2?.deviceTypes.has(dimmableLight.code)).toBe(false);

      entity.destroy();
    });
  });

  test('shutdown the platform', async () => {
    expect(platform.onShutdown).toBeDefined();
    await platform.onShutdown();
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

const cover = {
  date_code: '',
  definition: {
    description: 'Zigbee + RF curtain switch module',
    exposes: [
      {
        features: [
          {
            access: 3,
            label: 'State',
            name: 'state',
            property: 'state',
            type: 'enum',
            values: ['OPEN', 'CLOSE', 'STOP'],
          },
          {
            access: 7,
            description: 'Position of this cover',
            label: 'Position',
            name: 'position',
            property: 'position',
            type: 'numeric',
            unit: '%',
            value_max: 100,
            value_min: 0,
          },
        ],
        type: 'cover',
      },
      {
        access: 7,
        label: 'Calibration time',
        name: 'calibration_time',
        property: 'calibration_time',
        type: 'numeric',
        value_max: 100,
        value_min: 0,
      },
      {
        access: 1,
        label: 'Moving',
        name: 'moving',
        property: 'moving',
        type: 'enum',
        values: ['UP', 'STOP', 'DOWN'],
      },
      {
        access: 7,
        label: 'Motor reversal',
        name: 'motor_reversal',
        property: 'motor_reversal',
        type: 'binary',
        value_off: 'OFF',
        value_on: 'ON',
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
    model: 'MS-108ZR',
    options: [
      {
        access: 2,
        description: 'Inverts the cover position, false: open=100,close=0, true: open=0,close=100 (default false).',
        label: 'Invert cover',
        name: 'invert_cover',
        property: 'invert_cover',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
      {
        access: 2,
        description: "Do not publish set cover target position as a normal 'position' value (default false).",
        label: 'Cover position tilt disable report',
        name: 'cover_position_tilt_disable_report',
        property: 'cover_position_tilt_disable_report',
        type: 'binary',
        value_off: false,
        value_on: true,
      },
    ],
    supports_ota: true,
    vendor: 'Moes',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [
        {
          cluster: 'closuresWindowCovering',
          target: {
            endpoint: 1,
            ieee_address: '0x00124b0025e1f196',
            type: 'endpoint',
          },
        },
      ],
      clusters: {
        input: ['genBasic', 'genGroups', 'genScenes', 'closuresWindowCovering', 'genOnOff'],
        output: ['genOta', 'genTime'],
      },
      configured_reportings: [
        {
          attribute: 'currentPositionLiftPercentage',
          cluster: 'closuresWindowCovering',
          maximum_report_interval: 3600,
          minimum_report_interval: 60,
          reportable_change: 0,
        },
      ],
      scenes: [],
    },
  },
  friendly_name: 'Window shutter',
  ieee_address: '0x70ac08fffee6dd5e',
  interview_completed: true,
  interviewing: false,
  manufacturer: '_TZ3000_1dd0d5yi',
  model_id: 'TS130F',
  network_address: 63434,
  power_source: 'Mains (single phase)',
  supported: true,
  type: 'Router',
};

const thermo = {
  date_code: '',
  definition: {
    description: 'Smart heating thermostat',
    exposes: [
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
      {
        features: [
          {
            access: 3,
            description: 'Enables/disables physical input on the device',
            label: 'State',
            name: 'state',
            property: 'child_lock',
            type: 'binary',
            value_off: 'UNLOCK',
            value_on: 'LOCK',
          },
        ],
        label: 'Child lock',
        type: 'lock',
      },
      {
        access: 3,
        description: 'The delta between local_temperature and current_heating_setpoint to trigger Heat',
        label: 'Deadzone temperature',
        name: 'deadzone_temperature',
        property: 'deadzone_temperature',
        type: 'numeric',
        unit: '°C',
        value_max: 5,
        value_min: 0,
        value_step: 1,
      },
      {
        access: 3,
        description:
          'Maximum temperature limit. Cuts the thermostat out regardless of air temperature if the external floor sensor exceeds this temperature. Only used by the thermostat when in AL sensor mode.',
        label: 'Max temperature limit',
        name: 'max_temperature_limit',
        property: 'max_temperature_limit',
        type: 'numeric',
        unit: '°C',
        value_max: 45,
        value_min: 0,
      },
      {
        access: 3,
        description: 'Minimum temperature limit for frost protection. Turns the thermostat on regardless of setpoint if the temperature drops below this.',
        label: 'Min temperature limit',
        name: 'min_temperature_limit',
        property: 'min_temperature_limit',
        type: 'numeric',
        unit: '°C',
        value_max: 5,
        value_min: 1,
      },
      {
        features: [
          {
            access: 3,
            description: 'Temperature heating setpoint',
            label: 'Current heating setpoint',
            name: 'occupied_heating_setpoint',
            property: 'occupied_heating_setpoint',
            type: 'numeric',
            unit: '°C',
            value_max: 45,
            value_min: 5,
            value_step: 0.5,
          },
          {
            access: 3,
            description: 'Temperature cooling setpoint',
            label: 'Current cooling setpoint',
            name: 'occupied_cooling_setpoint',
            property: 'occupied_cooling_setpoint',
            type: 'numeric',
            unit: '°C',
            value_max: 45,
            value_min: 5,
            value_step: 0.5,
          },
          {
            access: 1,
            description: 'Current temperature measured on the device',
            label: 'Local temperature',
            name: 'local_temperature',
            property: 'local_temperature',
            type: 'numeric',
            unit: '°C',
          },
          {
            access: 3,
            description: 'Offset to add/subtract to the local temperature',
            label: 'Local temperature calibration',
            name: 'local_temperature_calibration',
            property: 'local_temperature_calibration',
            type: 'numeric',
            unit: '°C',
            value_max: 30,
            value_min: -30,
            value_step: 0.1,
          },
          {
            access: 3,
            description: 'Mode of this device',
            label: 'System mode',
            name: 'system_mode',
            property: 'system_mode',
            type: 'enum',
            values: ['off', 'auto', 'heat', 'cool'],
          },
          {
            access: 1,
            description: 'The current running state',
            label: 'Running state',
            name: 'running_state',
            property: 'running_state',
            type: 'enum',
            values: ['idle', 'heat', 'cool'],
          },
        ],
        type: 'climate',
      },
      {
        access: 3,
        category: 'config',
        description: 'Select temperature sensor to use',
        label: 'Sensor',
        name: 'sensor',
        property: 'sensor',
        type: 'enum',
        values: ['IN', 'AL', 'OU'],
      },
    ],
    model: 'BHT-002/BHT-006',
    options: [],
    supports_ota: false,
    vendor: 'Moes',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genGroups', 'genScenes', 'manuSpecificTuya', 'genBasic'],
        output: ['genOta', 'genTime'],
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
  friendly_name: 'Moes thermo',
  ieee_address: '0xa4c138f402dfba8a',
  interview_completed: true,
  interviewing: false,
  manufacturer: '_TZE204_aoclfnxz',
  model_id: 'TS0601',
  network_address: 47713,
  power_source: 'Mains (single phase)',
  supported: true,
  type: 'Router',
};

const lock = {
  date_code: '',
  definition: {
    description: 'Smart lock',
    exposes: [
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
      {
        features: [
          {
            access: 3,
            description: 'Enables/disables physical input on the device',
            label: 'State',
            name: 'state',
            property: 'state',
            type: 'binary',
            value_off: 'UNLOCK',
            value_on: 'LOCK',
          },
        ],
        label: 'Lock state',
        type: 'lock',
      },
    ],
    model: 'LOCK-006',
    options: [],
    supports_ota: false,
    vendor: 'Local',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genGroups', 'genScenes', 'manuSpecificTuya', 'genBasic'],
        output: ['genOta', 'genTime'],
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
  friendly_name: 'Door lock',
  ieee_address: '0xa4c138f402dfba1a',
  interview_completed: true,
  interviewing: false,
  manufacturer: '_TZE204_xxxxxx',
  model_id: 'TS0601',
  network_address: 47711,
  power_source: 'Mains (single phase)',
  supported: true,
  type: 'Router',
};

const waterValveDevice = {
  date_code: '',
  definition: {
    description: 'Zigbee smart water valve',
    exposes: [
      {
        features: [
          {
            access: 7,
            description: 'On/off state of the valve',
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
        endpoint: 'l1',
        features: [
          {
            access: 7,
            description: 'On/off state of the second valve',
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
        access: 1,
        category: 'diagnostic',
        description: 'Remaining battery in %',
        label: 'Battery',
        name: 'battery',
        property: 'battery',
        type: 'numeric',
        unit: '%',
        value_max: 100,
        value_min: 0,
      },
    ],
    model: 'SWV',
    options: [],
    supports_ota: false,
    vendor: 'SONOFF',
  },
  disabled: false,
  endpoints: {
    '1': {
      bindings: [],
      clusters: {
        input: ['genBasic', 'genIdentify', 'genOnOff'],
        output: ['genOta', 'genTime'],
      },
      configured_reportings: [],
      scenes: [],
    },
  },
  friendly_name: 'Garden water valve',
  ieee_address: '0x00124b002a1b2c3d',
  interview_completed: true,
  interviewing: false,
  manufacturer: 'SONOFF',
  model_id: 'SWV',
  network_address: 21450,
  power_source: 'Battery',
  supported: true,
  type: 'EndDevice',
};

/**
 * Create a generic expose for the synthetic test devices.
 *
 * @param {string} name The expose name and property
 * @param {string} type The expose type
 * @param {object} extra Additional expose fields
 * @returns {object} The expose
 */
function generic(name: string, type = 'numeric', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { access: 1, name, property: name, type, label: name, description: name, ...extra };
}

/**
 * Create a synthetic test device from the lock fixture with the given exposes.
 *
 * @param {string} friendly_name The device friendly name
 * @param {string} ieee_address The device ieee address
 * @param {object[]} exposes The device exposes
 * @param {string} power_source The device power source
 * @returns {BridgeDevice} The device
 */
function makeDevice(friendly_name: string, ieee_address: string, exposes: object[], power_source = 'Mains (single phase)'): BridgeDevice {
  const device = structuredClone(lock) as unknown as BridgeDevice;
  device.friendly_name = friendly_name;
  device.ieee_address = ieee_address;
  device.power_source = power_source;
  if (device.definition) device.definition.exposes = exposes as NonNullable<BridgeDevice['definition']>['exposes'];
  return device;
}
