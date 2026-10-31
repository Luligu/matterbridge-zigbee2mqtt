/**
 * @file vitest/module.test.ts
 * @description This file contains the tests for the ZigbeePlatform.
 * @author Luca Liguori
 */

/* oxlint-disable no-console */

const NAME = 'Platform';
const MATTER_PORT = 6000;
const MATTER_CREATE_ONLY = true;

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  bridgedNode,
  colorTemperatureLight,
  dimmableLight,
  doorLock,
  extendedColorLight,
  onOffLight,
  type PlatformMatterbridge,
  powerSource,
  thermostat,
  windowCovering,
} from 'matterbridge';
import { db, hk, idn, ign, LogLevel, or, rs, YELLOW } from 'matterbridge/logger';
import { ColorControl, Thermostat } from 'matterbridge/matter/clusters';
import { flushAsync } from 'matterbridge/test-utils';
import {
  addMatterbridge,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  flushServerNode,
  getMatterbridge,
  log,
  loggerLogSpy,
  setDebug,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/test-utils/vitest';
import { getMacAddress, wait } from 'matterbridge/utils';

import { ZigbeeDevice, ZigbeeGroup } from '../src/entity.js';
import initializePlugin, { ZigbeePlatform, type ZigbeePlatformConfig } from '../src/module.js';
import { Zigbee2MQTT } from '../src/zigbee2mqtt.js';
import type { BridgeDevice, BridgeGroup, BridgeInfo } from '../src/zigbee2mqttTypes.js';

// Spy on ZigbeePlatform
const publishSpy = vi.spyOn(ZigbeePlatform.prototype, 'publish').mockImplementation((topic: string, subTopic: string, message: string) => {
  console.log(`Mocked publish called with topic: ${topic}, subTopic: ${subTopic}, message: ${message}`);
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

describe('TestPlatform', () => {
  let matterbridge: PlatformMatterbridge;
  let platform: ZigbeePlatform;

  const updateTimeout = getMacAddress() === 'c4:cb:76:b3:cd:1f' ? 100 : 250;

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

  it('should return an instance of ZigbeePlatform', async () => {
    const platform = initializePlugin(matterbridge, log, mockConfig);
    expect(platform).toBeInstanceOf(ZigbeePlatform);
    await platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    expect(() => new ZigbeePlatform({ ...matterbridge, matterbridgeVersion: '1.0.0' }, log, mockConfig)).toThrow();
  });

  it.each([
    { host: '', port: 0, topic: '', username: '', password: '', expectedHost: 'mqtt://localhost', expectedPort: 1883, expectedTopic: 'zigbee2mqtt' },
    { host: 42 as unknown as string, port: 1883, topic: 'custom', username: '', password: '', expectedHost: 'mqtt://localhost', expectedPort: 1883, expectedTopic: 'custom' },
    { host: 'broker', port: 1884, topic: 'custom', username: 'user', password: 'pass', expectedHost: 'mqtt://broker', expectedPort: 1884, expectedTopic: 'custom' },
    { host: 'wss://broker', port: 8883, topic: 'custom', username: 'user', password: 'pass', expectedHost: 'wss://broker', expectedPort: 8883, expectedTopic: 'custom' },
  ])('should preserve MQTT config sanitization for host $host and port $port', async ({ host, port, topic, username, password, expectedHost, expectedPort, expectedTopic }) => {
    const config = { ...mockConfig, host, port, topic, username, password };
    const platform = new ZigbeePlatform(matterbridge, log, config);

    try {
      expect(config.host).toBe(expectedHost);
      expect(config.port).toBe(expectedPort);
      expect(config.topic).toBe(expectedTopic);
      expect(config.username).toBe(username);
      expect(config.password).toBe(password);
      expect(platform.z2m.mqttHost).toBe(expectedHost);
      expect(platform.z2m.mqttPort).toBe(expectedPort);
      expect(platform.z2m.mqttTopic).toBe(expectedTopic);
      expect(platform.z2m.mqttUsername).toBe(username || undefined);
      expect(platform.z2m.mqttPassword).toBe(password || undefined);
    } finally {
      await platform.onShutdown();
    }
  });

  it('should initialize platform with default values', async () => {
    const config = Object.assign({}, mockConfig);
    config.host = 'localhost';
    config.port = -1883;
    config.username = 'user';
    config.password = 'password';
    // @ts-expect-error - testing invalid protocol version
    config.protocolVersion = 10;
    config.scenesType = 'outlet';
    config.scenesPrefix = true;
    const platform = new ZigbeePlatform(matterbridge, log, config);
    expect(platform).toBeDefined();

    platform.z2m.emit('mqtt_connect');
    platform.z2m.emit('mqtt_subscribed');
    platform.z2m.emit('close');
    platform.z2m.emit('end');
    platform.z2m.emit('mqtt_error');
    platform.z2m.emit('online');
    platform.z2m.emit('offline');
    // oxfmt-ignore
    platform.z2m.emit('bridge-info', { version: '1', zigbee_herdsman: { version: '1' }, zigbee_herdsman_converters: { version: '1' }, config: { advanced: { output: 'attribute', legacy_api: true, legacy_availability_payload: true } } });
    platform.shouldStart = true;
    platform.shouldConfigure = true;
    vi.spyOn(platform as any, 'registerZigbeeDevice').mockImplementation(() => {});
    vi.spyOn(platform as any, 'registerZigbeeGroup').mockImplementation(() => {});
    vi.spyOn(platform as any, 'requestDeviceUpdate').mockImplementation(() => {});
    vi.spyOn(platform as any, 'requestGroupUpdate').mockImplementation(() => {});
    vi.spyOn(platform as any, 'unregisterZigbeeEntity').mockImplementation(() => {});
    vi.spyOn(platform as any, 'validateDevice').mockImplementation(() => true);
    platform.zigbeeEntities = [{ entityName: 'TestEntity', isDevice: true, device: {}, isGroup: true, group: {}, configure: vi.fn(), destroy: vi.fn() }] as any;
    platform.z2m.emit('bridge-devices', [{}] as BridgeDevice[]);
    platform.z2m.emit('bridge-groups', [{}] as BridgeGroup[]);
    platform.z2m.emit('availability', 'zigbee2mqtt/TestEntity', false);
    platform.z2m.emit('availability', 'zigbee2mqtt/TestEntity', true);
    platform.z2m.emit('message', 'zigbee2mqtt/TestEntity', Buffer.from('{"state":"ON"}'));
    platform.z2m.emit('permit_join', 'zigbee2mqtt/TestEntity', 30, true);
    platform.z2m.emit('device_joined', 'zigbee2mqtt/TestEntity', '0x01234567890abcdef');
    platform.z2m.emit('device_announce', 'zigbee2mqtt/TestEntity', '0x01234567890abcdef');
    platform.z2m.emit('device_leave', 'zigbee2mqtt/TestEntity', '0x01234567890abcdef');
    platform.z2m.emit('device_remove', 'zigbee2mqtt/TestEntity', 'ok', true, true);
    platform.z2m.emit('device_interview', 'zigbee2mqtt/TestEntity', '0x01234567890abcdef', 'successful', true);
    platform.z2m.emit('device_rename', '0x01234567890abcdef', 'zigbee2mqtt/TestEntity', 'zigbee2mqtt/TestEntity2');
    platform.z2m.emit('device_options', '0x01234567890abcdef', 'ok', {}, {});
    platform.z2m.emit('group_add', 'Group 1', 'zigbee2mqtt/TestEntity', 'ok');
    platform.z2m.emit('group_remove', 'Group 1', 'zigbee2mqtt/TestEntity', 'ok');
    platform.z2m.emit('group_rename', 'Group 1', 'Group 2', 'ok');
    platform.z2m.emit('group_add_member', 'Group 1', '0x01234567890abcdef', 'ok');
    platform.z2m.emit('group_remove_member', 'Group 1', 'zigbee2mqtt/TestEntity', 'ok');

    platform.z2mBridgeOnline = undefined;
    platform.z2mBridgeInfo = undefined;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = undefined;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = [] as BridgeDevice[];
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = [] as BridgeGroup[];
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = [] as BridgeDevice[];
    platform.z2mBridgeGroups = [] as BridgeGroup[];
    (platform as any).connectTimeoutMs = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    await platform.onShutdown();
    expect(platform.config.host).toBe('mqtt://localhost');
    expect(platform.config.port).toBe(-1883);
    expect(platform.config.protocolVersion).toBe(5);
    expect(platform.config.clientId).toBe('');
    expect(platform.config.topic).toBe('zigbee2mqtt');
    expect(platform.config.username).toBe('user');
    expect(platform.config.password).toBe('password');
  });

  it('should initialize platform with config name', () => {
    platform = new ZigbeePlatform(matterbridge, log, mockConfig);
    expect(platform).toBeDefined();
    // Add the platform to the Matterbridge environment
    addMatterbridge(platform);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Initializing platform:/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Loaded zigbee2mqtt parameters/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Connecting to MQTT broker/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringMatching(/^Created zigbee2mqtt dynamic platform/));
  });

  it('should call onStart with reason', async () => {
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

    await platform.onStart('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Started zigbee2mqtt dynamic platform/));
    await flushAsync();
  }, 60000);

  it('should have registered devices', async () => {
    expect(platform.z2mBridgeDevices).toBeDefined();
    if (!platform.z2mBridgeDevices) return;
    expect(platform.z2mBridgeDevices.length).toBe(35);
  });

  it('should have registered groups', async () => {
    expect(platform.z2mBridgeGroups).toBeDefined();
    if (!platform.z2mBridgeGroups) return;
    expect(platform.z2mBridgeGroups.length).toBe(10);
  });

  it('should have configured', async () => {
    expect(platform).toBeDefined();
    (platform as any).availabilityTimeoutMs = 1;
    await platform.onConfigure();
    await flushAsync();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Setting availability for/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Setting retained values for/));
  });

  it('should update entity OFFLINE', async () => {
    for (const entity of platform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      platform.z2m.emit('OFFLINE-' + entity.entityName);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
    await flushAsync();
  }, 60000);

  it('should update entity ONLINE', async () => {
    for (const entity of platform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      platform.z2m.emit('ONLINE-' + entity.entityName);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
    await flushAsync();
  }, 60000);

  it('should update with permit_join', async () => {
    platform.z2m.emit('permit_join', 'Coordinator', 30, true);
    platform.z2m.emit('permit_join', 'Coordinator', 30, false);
    await wait(50);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Device Coordinator unlocked`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Device Coordinator locked`);
  }, 60000);

  it('should update /bridge/state online', async () => {
    platform.z2mBridgeOnline = false;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('{"state":"online"}'));
    expect(platform.z2mBridgeOnline).toBe(true);
    platform.z2mBridgeOnline = false;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('online'));
    expect(platform.z2mBridgeOnline).toBe(true);
  });

  it('should update /bridge/state offline', async () => {
    platform.z2mBridgeOnline = true;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('{"state":"offline"}'));
    expect(platform.z2mBridgeOnline).toBe(false);
    platform.z2mBridgeOnline = true;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('offline'));
    expect(platform.z2mBridgeOnline).toBe(false);
  });

  it('should update /bridge/info', async () => {
    const info = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-info.json'));
    expect(info).toBeDefined();

    platform.z2mBridgeInfo = undefined;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/info', Buffer.from(JSON.stringify(info)));
    expect(platform.z2mBridgeInfo).toBeDefined();
    // await wait(500);
  });

  it('should update /bridge/devices', async () => {
    const devices = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-devices.json'));
    expect(devices).toBeDefined();

    platform.z2mBridgeDevices = undefined;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));
    expect(platform.z2mBridgeDevices).toBeDefined();
    if (!platform.z2mBridgeDevices) return;
    expect((platform.z2mBridgeDevices as BridgeDevice[]).length).toBe(35);
    // await wait(500);
  });

  it('should update /bridge/groups', async () => {
    const groups = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-groups.json'));
    expect(groups).toBeDefined();

    platform.z2mBridgeGroups = undefined;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/groups', Buffer.from(JSON.stringify(groups)));
    expect(platform.z2mBridgeGroups).toBeDefined();
    if (!platform.z2mBridgeGroups) return;
    expect((platform.z2mBridgeGroups as BridgeGroup[]).length).toBe(10);
    // await wait(500);
  });

  it('should update /Moes thermo/availability online', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT entity Moes thermo is online`);
    // await wait(200);
  });

  it('should update /Moes thermo/availability offline', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT entity Moes thermo is offline`);
    // await wait(200);
  });

  it('should update /At home/availability online', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT entity At home is online`);
    // await wait(200);
  });

  it('should update /At home/availability offline', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT entity At home is offline`);
    // await wait(200);
  });

  it('should update /At home/set', async () => {
    const entity = 'At home';
    const payload = { state: 'ON', changed: 1 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}OnOffLightSwitch:52${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}false${db} to ${YELLOW}true${db}`),
    );
    // await wait(200);
  });

  it('should update entity MESSAGE', async () => {
    const filePath = path.join('src', 'mock', 'bridge-payloads.txt');
    const fileContent = readFileSync(filePath, 'utf-8');
    const logEntries = fileContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    expect(logEntries).toBeDefined();
    expect(logEntries.length).toBe(702);

    logEntries.forEach((entry: { entity: string; service: string; payload: string }) => {
      const payloadJson: Record<string, boolean | number | string | undefined | null | object> = JSON.parse(entry.payload);
      const entity = platform.zigbeeEntities.find((entity) => entity.entityName === entry.entity);
      expect(entity).toBeDefined();
      if (!entity) return;
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      if (entity) {
        platform.z2m.emit('MESSAGE-' + entity.entityName, payloadJson);
      }
    });
    await flushAsync();
  }, 60000);

  it('should update /Lights/set', async () => {
    const entity = 'Lights';

    vi.clearAllMocks();
    const oldxy = { state: 'OFF', brightness: 100, color: { x: 0.2927, y: 0.6349 }, color_mode: 'xy', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldxy)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}ExtendedColorLight:60${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}true${db} to ${YELLOW}false${db}`),
    );

    vi.clearAllMocks();
    const oldct = { state: 'OFF', brightness: 100, color_temp: 500, color_mode: 'color_temp', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldct)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));

    vi.clearAllMocks();
    const payload = { state: 'ON', brightness: 250, color: { x: 0.5006, y: 0.2993 }, color_mode: 'xy', changed: 1 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}ExtendedColorLight:60${db} attribute ${hk}LevelControl${db}.${hk}currentLevel${db}`, //  from ${YELLOW}1${db} to ${YELLOW}250${db}
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}ExtendedColorLight:60${db} attribute ${hk}ColorControl${db}.${hk}colorMode${db} from ${YELLOW}2${db} to ${YELLOW}0${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}ExtendedColorLight:60${db} attribute ${hk}ColorControl${db}.${hk}currentHue${db} from ${YELLOW}0${db} to ${YELLOW}248${db}`,
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}ExtendedColorLight:60${db} attribute ${hk}ColorControl${db}.${hk}currentSaturation${db} from ${YELLOW}0${db} to ${YELLOW}254${db}`,
      ),
    );
  });

  it('should add NewGroup', async () => {
    const entity = 'NewGroup';
    const payload = { data: { friendly_name: entity, id: 15 }, status: 'ok', transaction: '8j6s7-10' };
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/add', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`zigbee2MQTT sent group_add friendly_name: ${entity} id ${payload.data.id} status ${payload.status}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Registering group: ${entity}`));
  });

  it('should unregister At home', async () => {
    const entity = 'At home';
    const payload = { data: { force: false, id: entity }, status: 'ok', transaction: '8j6s7-10' };
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/remove', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_remove friendly_name: ${payload.data.id} status ${payload.status}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Removing device: ${entity}`));
  });

  it.each([false, true])('should skip unregistering when the entity has no bridged device (entity exists: %s)', async (entityExists) => {
    const friendlyName = 'Unregistered entity';
    const entity = { entityName: friendlyName, bridgedDevice: undefined, destroy: vi.fn() } as unknown as ZigbeeDevice;
    const originalEntities = platform.zigbeeEntities;
    const originalDevices = [...platform.bridgedDevices];
    const unregisterSpy = vi.spyOn(platform, 'unregisterDevice');
    platform.zigbeeEntities = entityExists ? [...originalEntities, entity] : [...originalEntities];
    const expectedEntities = [...platform.zigbeeEntities];

    try {
      // @ts-expect-error accessing private method for testing
      await platform.unregisterZigbeeEntity(friendlyName);

      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `Entity with friendly name ${friendlyName} not found`);
      expect(unregisterSpy).not.toHaveBeenCalled();
      expect(entity.destroy).not.toHaveBeenCalled();
      expect(platform.zigbeeEntities).toEqual(expectedEntities);
      expect(platform.bridgedDevices).toEqual(originalDevices);
    } finally {
      platform.zigbeeEntities = originalEntities;
      unregisterSpy.mockRestore();
    }
  });

  it('should log an error and preserve the entity when unregistering fails', async () => {
    const entity = platform.zigbeeEntities.find((entity) => entity.bridgedDevice);
    expect(entity).toBeDefined();
    if (!entity) throw new Error('Expected a registered entity');
    const originalEntities = [...platform.zigbeeEntities];
    const originalDevices = [...platform.bridgedDevices];
    const unregisterSpy = vi.spyOn(platform, 'unregisterDevice').mockRejectedValueOnce(new Error('unregister failed'));
    const destroySpy = vi.spyOn(entity, 'destroy');

    try {
      // @ts-expect-error accessing private method for testing
      await expect(platform.unregisterZigbeeEntity(entity.entityName)).resolves.toBeUndefined();

      expect(unregisterSpy).toHaveBeenCalledWith(entity.bridgedDevice);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, `Error removing device ${entity.entityName}: unregister failed`);
      expect(destroySpy).not.toHaveBeenCalled();
      expect(platform.zigbeeEntities).toEqual(originalEntities);
      expect(platform.bridgedDevices).toEqual(originalDevices);
    } finally {
      unregisterSpy.mockRestore();
      destroySpy.mockRestore();
    }
  });

  it('should rename Sleeping', async () => {
    const entity = 'Sleeping';
    const payload = { data: { from: entity, to: 'Is dark' }, status: 'ok', transaction: '8j6s7-10' };
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/rename', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`zigbee2MQTT sent group_rename from: ${payload.data.from} to ${payload.data.to} status ${payload.status}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Removing device: ${payload.data.from}`));
    // expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Registering group: ${gn}${payload.data.to}${db}`));
  });

  it('should expose Coordinator as doorLock', async () => {
    const friendlyName = 'Coordinator';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(doorLock.code)).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should invoke commands on Coordinator', async () => {
    const friendlyName = 'Coordinator';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    await device.executeCommandHandler('identify', { identifyTime: 10 }, 'identify', {} as any, device);
    await device.executeCommandHandler('lockDoor', {}, 'doorLock', {} as any, device);
    await device.executeCommandHandler('unlockDoor', {}, 'doorLock', {} as any, device);

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command permit_join false called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command permit_join true called for ${idn}${friendlyName}${rs}${db}`));
  });

  it('should expose Gledopto RGBCTT light I as extendedColorLight', async () => {
    const friendlyName = 'Gledopto RGBCTT light I';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(onOffLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(dimmableLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(colorTemperatureLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(extendedColorLight.code)).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should invoke commands on Gledopto RGBCTT light I', async () => {
    const friendlyName = 'Gledopto RGBCTT light I';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    await device.executeCommandHandler('identify', { identifyTime: 10 }, 'identify', {} as any, device);
    await device.setAttribute('onOff', 'onOff', false);
    await device.executeCommandHandler('on', {}, 'onOff', {} as any, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('off', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('on', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('toggle', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('on', {}, 'onOff', {} as any, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('moveToLevel', { level: 100, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'levelControl', {} as any, device);
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 50, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'levelControl', {} as any, device);
    await device.executeCommandHandler(
      'moveToColorTemperature',
      { colorTemperatureMireds: 400, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler(
      'moveToColor',
      { colorX: 0.2927, colorY: 0.6349, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler(
      'moveToHue',
      { hue: 200, direction: ColorControl.Direction.Shortest, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler('moveToSaturation', { saturation: 90, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'colorControl', {} as any, device);
    await device.executeCommandHandler(
      'moveToHueAndSaturation',
      { hue: 200, saturation: 90, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevel called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevelWithOnOff called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToColorTemperature called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToColor called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToHue called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToSaturation called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToHueAndSaturation called for ${idn}${friendlyName}${rs}${db}`));
  });

  it('should expose Window shutter as coverDevice', async () => {
    const friendlyName = 'Window shutter';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(windowCovering.code)).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should invoke commands on Window shutter', async () => {
    const friendlyName = 'Window shutter';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    await device.executeCommandHandler('identify', { identifyTime: 10 }, 'identify', {} as any, device);
    await device.executeCommandHandler('upOrOpen', {}, 'windowCovering', {} as any, device);
    await device.executeCommandHandler('downOrClose', {}, 'windowCovering', {} as any, device);
    await device.executeCommandHandler('stopMotion', {}, 'windowCovering', {} as any, device);
    await device.executeCommandHandler('goToLiftPercentage', { liftPercent100thsValue: 5000 }, 'windowCovering', {} as any, device);

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command upOrOpen called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command downOrClose called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command stopMotion called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command goToLiftPercentage called for ${idn}${friendlyName}${rs}${db}`));
  });

  it('should expose Moes thermo as thermostatDevice', async () => {
    const friendlyName = 'Moes thermo';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(thermostat.code)).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should invoke commands on Moes thermo', async () => {
    const friendlyName = 'Moes thermo';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    await device.executeCommandHandler('identify', { identifyTime: 10 }, 'identify', {} as any, device);
    await device.executeCommandHandler('setpointRaiseLower', { mode: Thermostat.SetpointRaiseLowerMode.Both, amount: 10 }, 'thermostat', {} as any, device);

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${idn}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command setpointRaiseLower called for ${idn}${friendlyName}${rs}${db}`), expect.anything());
  });

  it('should expose Eglo CTT light as colorTemperatureLight', async () => {
    const friendlyName = 'Eglo CTT light';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(onOffLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(dimmableLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(colorTemperatureLight.code)).toBeDefined();
    expect(device.deviceTypes.get(extendedColorLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should expose the group Lights as extendedColorLight', async () => {
    const friendlyName = 'Lights';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    expect(device.deviceTypes.get(onOffLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(dimmableLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(colorTemperatureLight.code)).toBeUndefined();
    expect(device.deviceTypes.get(extendedColorLight.code)).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
  });

  it('should invoke commands on Lights', async () => {
    const friendlyName = 'Lights';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.construction.ready;
    await device.executeCommandHandler('identify', { identifyTime: 10 }, 'identify', {} as any, device);
    await device.setAttribute('onOff', 'onOff', false);
    await device.executeCommandHandler('on', {}, 'onOff', {} as any, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('off', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('on', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('off', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('toggle', {}, 'onOff', {} as any, device);
    await device.executeCommandHandler('moveToLevel', { level: 100, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'levelControl', {} as any, device);
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 0, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'levelControl', {} as any, device);
    await device.executeCommandHandler(
      'moveToColorTemperature',
      { colorTemperatureMireds: 400, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler(
      'moveToColor',
      { colorX: 0.2927, colorY: 0.6349, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler(
      'moveToHue',
      { hue: 200, direction: ColorControl.Direction.Shortest, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );
    await device.executeCommandHandler('moveToSaturation', { saturation: 90, transitionTime: 0, optionsMask: {}, optionsOverride: {} }, 'colorControl', {} as any, device);
    await device.executeCommandHandler(
      'moveToHueAndSaturation',
      { hue: 200, saturation: 90, transitionTime: 0, optionsMask: {}, optionsOverride: {} },
      'colorControl',
      {} as any,
      device,
    );

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command identify called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command on called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command off called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command toggle called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevel called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToLevelWithOnOff called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToColorTemperature called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToColor called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToHue called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToSaturation called for ${ign}${friendlyName}${rs}${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Command moveToHueAndSaturation called for ${ign}${friendlyName}${rs}${db}`));
  });

  it('should call updateAvailability', async () => {
    await (platform as any).updateAvailability(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Setting availability for/));
  });

  it('should replay online and offline availability and retained payloads during onConfigure', async () => {
    const onlineSpy = vi.fn();
    const offlineSpy = vi.fn();
    const retainedSpy = vi.fn();
    // @ts-expect-error accessing private property for testing
    const availability = platform.z2mEntityAvailability;
    // @ts-expect-error accessing private property for testing
    const payloads = platform.z2mEntityPayload;
    // @ts-expect-error accessing private property for testing
    const originalTimeoutMs = platform.availabilityTimeoutMs;
    platform.z2m.on('ONLINE-OnlineReplayDevice', onlineSpy);
    platform.z2m.on('OFFLINE-OfflineReplayDevice', offlineSpy);
    platform.z2m.on('MESSAGE-RetainedDevice', retainedSpy);
    availability.set('OnlineReplayDevice', true);
    availability.set('OfflineReplayDevice', false);
    payloads.set('RetainedDevice', { state: 'ON' });
    // @ts-expect-error accessing private property for testing
    platform.availabilityTimeoutMs = 1;

    try {
      await platform.onConfigure();
      await vi.waitFor(() => {
        expect(onlineSpy).toHaveBeenCalledExactlyOnceWith();
        expect(offlineSpy).toHaveBeenCalledExactlyOnceWith();
        expect(retainedSpy).toHaveBeenCalledExactlyOnceWith({ state: 'ON' });
      });
    } finally {
      platform.z2m.off('ONLINE-OnlineReplayDevice', onlineSpy);
      platform.z2m.off('OFFLINE-OfflineReplayDevice', offlineSpy);
      platform.z2m.off('MESSAGE-RetainedDevice', retainedSpy);
      availability.delete('OnlineReplayDevice');
      availability.delete('OfflineReplayDevice');
      payloads.delete('RetainedDevice');
      // @ts-expect-error accessing private property for testing
      platform.availabilityTimeoutMs = originalTimeoutMs;
    }
  });

  it('should call onConfigure permit_join = false', async () => {
    (platform as any).z2mBridgeInfo.permit_join = false;
    (platform as any).availabilityTimeoutMs = 1;
    await platform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it('should call onConfigure permit_join = true', async () => {
    (platform as any).z2mBridgeInfo.permit_join = true;
    await platform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it.each([
    ['zigbee2mqtt-frontend', 'http://localhost:8080/#/device/0x1234/info', 'http://localhost:8080/#/group/42'],
    ['zigbee2mqtt-windfront', 'http://localhost:8080/#/device/0/0x1234/info', 'http://localhost:8080/#/group/0/42'],
  ] as const)('should set device and group config URLs when using %s', async (frontend, deviceUrl, groupUrl) => {
    const originalInfo = platform.z2mBridgeInfo;
    if (!originalInfo) throw new Error('Expected bridge info');
    const originalEntities = [...platform.zigbeeEntities];
    const originalDevices = [...platform.bridgedDevices];
    const device = { bridgedDevice: { configUrl: undefined } } as unknown as ZigbeeDevice;
    const group = { bridgedDevice: { configUrl: undefined } } as unknown as ZigbeeGroup;
    const deviceCreateSpy = vi.spyOn(ZigbeeDevice, 'create').mockResolvedValueOnce(device);
    const groupCreateSpy = vi.spyOn(ZigbeeGroup, 'create').mockResolvedValueOnce(group);
    const registerSpy = vi.spyOn(platform, 'registerDevice').mockImplementation(async () => {});
    platform.z2mBridgeInfo = { ...originalInfo, config: { ...originalInfo.config, frontend: { package: frontend } } };

    try {
      // @ts-expect-error accessing private method for testing
      const registeredDevice = await platform.registerZigbeeDevice({ ieee_address: '0x1234', friendly_name: 'Frontend device' } as BridgeDevice);
      const registeredGroup = await platform.registerZigbeeGroup({ id: 42, friendly_name: 'Frontend group', description: '', members: [], scenes: [] });

      expect(registeredDevice).toBe(device);
      expect(registeredGroup).toBe(group);
      expect(device.bridgedDevice?.configUrl).toBe(deviceUrl);
      expect(group.bridgedDevice?.configUrl).toBe(groupUrl);
      expect(registerSpy).toHaveBeenCalledWith(device.bridgedDevice);
      expect(registerSpy).toHaveBeenCalledWith(group.bridgedDevice);
    } finally {
      platform.z2mBridgeInfo = originalInfo;
      platform.zigbeeEntities = originalEntities;
      platform.bridgedDevices = originalDevices;
      deviceCreateSpy.mockRestore();
      groupCreateSpy.mockRestore();
      registerSpy.mockRestore();
    }
  });

  describe('bridge event coverage', () => {
    let eventPlatform: ZigbeePlatform;
    const device = { ieee_address: '0x1234', friendly_name: 'Event device' } as BridgeDevice;
    const group: BridgeGroup = { id: 42, friendly_name: 'Event group', description: '', members: [], scenes: [] };
    const registerDevice = vi.fn<() => Promise<undefined>>();
    const registerGroup = vi.fn<() => Promise<undefined>>();
    const unregister = vi.fn<() => Promise<void>>();

    beforeEach(() => {
      eventPlatform = new ZigbeePlatform(matterbridge, log, { ...mockConfig });
      eventPlatform.z2mBridgeDevices = [device];
      eventPlatform.z2mBridgeGroups = [group];
      vi.spyOn(eventPlatform, 'registerZigbeeDevice').mockImplementation(registerDevice);
      vi.spyOn(eventPlatform, 'registerZigbeeGroup').mockImplementation(registerGroup);
      vi.spyOn(eventPlatform, 'unregisterZigbeeEntity').mockImplementation(unregister);
      vi.spyOn(eventPlatform, 'validateDevice').mockReturnValue(true);
    });

    afterEach(async () => {
      await eventPlatform.onShutdown();
    });

    it.each([
      ['device_interview', [device.friendly_name, device.ieee_address, 'successful', true], true, false],
      ['device_rename', [device.ieee_address, 'Old device', device.friendly_name], true, true],
      ['group_add', [group.friendly_name, group.id, 'ok'], false, false],
      ['group_rename', ['Old group', group.friendly_name, 'ok'], false, true],
      ['group_add_member', [group.friendly_name, device.ieee_address, 'ok'], false, true],
      ['group_remove_member', [group.friendly_name, device.friendly_name, 'ok'], false, true],
    ] as const)('should register the matching entity on %s', async (event, args, isDevice, removesPrevious) => {
      eventPlatform.z2m.emit(event, ...args);
      await flushAsync(undefined, undefined, 0);

      expect(isDevice ? registerDevice : registerGroup).toHaveBeenCalledExactlyOnceWith(isDevice ? device : group);
      expect(isDevice ? registerGroup : registerDevice).not.toHaveBeenCalled();
      expect(unregister).toHaveBeenCalledTimes(removesPrevious ? 1 : 0);
    });

    it.each([
      ['device_remove', [device.friendly_name, 'error', false, false]],
      ['device_interview', [device.friendly_name, device.ieee_address, 'failed', true]],
      ['device_interview', [device.friendly_name, device.ieee_address, 'successful', false]],
      ['group_rename', [group.friendly_name, 'New group', 'error']],
      ['group_add_member', [group.friendly_name, device.ieee_address, 'error']],
      ['group_remove_member', [group.friendly_name, device.friendly_name, 'error']],
    ] as const)('should leave entities unchanged on unsuccessful %s', async (event, args) => {
      eventPlatform.z2m.emit(event, ...args);
      await flushAsync(undefined, undefined, 0);

      expect(registerDevice).not.toHaveBeenCalled();
      expect(registerGroup).not.toHaveBeenCalled();
      expect(unregister).not.toHaveBeenCalled();
    });

    it.each(['device_interview', 'group_add'])('should skip registration when validation rejects %s', async (event) => {
      vi.spyOn(eventPlatform, 'validateDevice').mockReturnValue(false);
      if (event === 'device_interview') eventPlatform.z2m.emit(event, device.friendly_name, device.ieee_address, 'successful', true);
      else eventPlatform.z2m.emit(event, group.friendly_name, group.id, 'ok');
      await flushAsync(undefined, undefined, 0);

      expect(registerDevice).not.toHaveBeenCalled();
      expect(registerGroup).not.toHaveBeenCalled();
    });

    it('should configure mixed entities and skip duplicate registration on repeated bridge lists', async () => {
      const configureDevice = vi.fn();
      const configureGroup = vi.fn();
      eventPlatform.zigbeeEntities = [
        { isDevice: true, device, configure: configureDevice, destroy: vi.fn() },
        { isGroup: true, group, configure: configureGroup, destroy: vi.fn() },
      ] as unknown as ZigbeeDevice[];
      const deviceUpdate = vi.spyOn(eventPlatform, 'requestDeviceUpdate').mockImplementation(() => {});
      const groupUpdate = vi.spyOn(eventPlatform, 'requestGroupUpdate').mockImplementation(() => {});
      eventPlatform.shouldStart = true;
      eventPlatform.shouldConfigure = true;

      for (let i = 0; i < 2; i++) {
        eventPlatform.z2m.emit('bridge-devices', [device]);
        eventPlatform.z2m.emit('bridge-groups', [group]);
        await flushAsync(undefined, undefined, 0);
      }

      expect(registerDevice).toHaveBeenCalledExactlyOnceWith(device);
      expect(registerGroup).toHaveBeenCalledExactlyOnceWith(group);
      expect(eventPlatform.z2mDevicesRegistered).toBe(true);
      expect(eventPlatform.z2mGroupsRegistered).toBe(true);
      expect(deviceUpdate).toHaveBeenCalledTimes(2);
      expect(deviceUpdate).toHaveBeenCalledWith(device);
      expect(groupUpdate).toHaveBeenCalledTimes(2);
      expect(groupUpdate).toHaveBeenCalledWith(group);
      expect(configureDevice).toHaveBeenCalledTimes(4);
      expect(configureGroup).toHaveBeenCalledTimes(4);
    });

    it('should reject startup when bridge info arrives without bridge state', async () => {
      eventPlatform.z2mBridgeInfo = {} as BridgeInfo;
      eventPlatform.z2mBridgeOnline = undefined;

      await expect(eventPlatform.onStart()).rejects.toThrow('The plugin did not receive zigbee2mqtt bridge state or info or devices/groups.');
      expect(loggerLogSpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'The plugin did not receive zigbee2mqtt bridge state. Check if zigbee2mqtt is running and connected to the MQTT broker.',
      );
      expect(registerDevice).not.toHaveBeenCalled();
      expect(registerGroup).not.toHaveBeenCalled();
    });
  });

  it('should return undefined when device registration is not valid', async () => {
    vi.spyOn(platform as any, 'validateDevice').mockReturnValueOnce(false);

    const result = await (platform as any).registerZigbeeDevice({ ieee_address: '0xinvalid', friendly_name: 'Invalid device' });

    expect(result).toBeUndefined();
  });

  it('should handle device registration without bridged device and create errors', async () => {
    vi.spyOn(platform as any, 'validateDevice').mockReturnValue(true);
    vi.spyOn(ZigbeeDevice, 'create').mockResolvedValueOnce({ bridgedDevice: undefined } as ZigbeeDevice);

    const noBridge = await (platform as any).registerZigbeeDevice({ ieee_address: '0xnobridge', friendly_name: 'No bridge device' });

    expect(noBridge).toBeDefined();

    vi.spyOn(ZigbeeDevice, 'create').mockRejectedValueOnce(new Error('device create failed'));
    const failed = await (platform as any).registerZigbeeDevice({ ieee_address: '0xfailed', friendly_name: 'Failed device' });

    expect(failed).toBeUndefined();
  });

  it('should return undefined when group registration is not valid', async () => {
    vi.spyOn(platform as any, 'validateDevice').mockReturnValueOnce(false);

    const result = await platform.registerZigbeeGroup({ id: 9991, friendly_name: 'Invalid group', description: '', members: [], scenes: [] });

    expect(result).toBeUndefined();
  });

  it('should handle group registration without bridged device and create errors', async () => {
    vi.spyOn(platform as any, 'validateDevice').mockReturnValue(true);
    vi.spyOn(ZigbeeGroup, 'create').mockResolvedValueOnce({ bridgedDevice: undefined } as ZigbeeGroup);

    const noBridge = await platform.registerZigbeeGroup({ id: 9992, friendly_name: 'No bridge group', description: '', members: [], scenes: [] });

    expect(noBridge).toBeDefined();

    vi.spyOn(ZigbeeGroup, 'create').mockRejectedValueOnce(new Error('group create failed'));
    const failed = await platform.registerZigbeeGroup({ id: 9993, friendly_name: 'Failed group', description: '', members: [], scenes: [] });

    expect(failed).toBeUndefined();
  });

  it('should call onChangeLoggerLevel', async () => {
    await platform.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringMatching(/^Changed logger level to/));
  });

  it('should call publish', async () => {
    publishSpy.mockRestore();
    platform.publish('zigbee2mqtt', 'test', 'message');
    platform.publish('zigbee2mqtt', '', 'message');
    expect(z2mPublishSpy).toHaveBeenCalledTimes(2);
  });

  it('should call onShutdown with reason', async () => {
    platform.config.unregisterOnShutdown = true;
    await platform.onShutdown('Jest Test');
    platform.config.unregisterOnShutdown = false;
    await platform.onShutdown('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Shutdown zigbee2mqtt dynamic platform/));
  });
});
