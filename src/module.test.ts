// src/module.test.ts

const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);

/* eslint-disable no-console */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { jest } from '@jest/globals';
import {
  bridgedNode,
  colorTemperatureLight,
  coverDevice,
  dimmableLight,
  doorLockDevice,
  extendedColorLight,
  Matterbridge,
  MatterbridgeEndpoint,
  onOffLight,
  PlatformConfig,
  powerSource,
  thermostatDevice,
} from 'matterbridge';
import { AnsiLogger, db, idn, ign, LogLevel, rs, TimestampFormat, or, hk, YELLOW } from 'matterbridge/logger';
import { getMacAddress, wait } from 'matterbridge/utils';
import { AggregatorEndpoint } from 'matterbridge/matter/endpoints';
import { Thermostat } from 'matterbridge/matter/clusters';
import { Endpoint, ServerNode } from 'matterbridge/matter';

import initializePlugin, { ZigbeePlatform, ZigbeePlatformConfig } from './module.js';
import { Zigbee2MQTT } from './zigbee2mqtt.js';
import { BridgeDevice, BridgeGroup, BridgeInfo } from './zigbee2mqttTypes.js';
import { createTestEnvironment, flushAsync, loggerLogSpy, setDebug, setupTest, startServerNode, stopServerNode } from './utils/jestHelpers.js';

// Spy on ZigbeePlatform
const publishSpy = jest.spyOn(ZigbeePlatform.prototype, 'publish').mockImplementation(async (topic: string, subTopic: string, message: string) => {
  console.log(`Mocked publish called with topic: ${topic}, subTopic: ${subTopic}, message: ${message}`);
  return Promise.resolve();
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
setupTest(NAME, false);

// Setup the matter and test environment
const environment = createTestEnvironment(HOMEDIR);

describe('TestPlatform', () => {
  let server: ServerNode<ServerNode.RootEndpoint>;
  let aggregator: Endpoint<AggregatorEndpoint>;
  let device: MatterbridgeEndpoint;
  let platform: ZigbeePlatform;

  const commandTimeout = getMacAddress() === 'c4:cb:76:b3:cd:1f' ? 10 : 100;
  const updateTimeout = getMacAddress() === 'c4:cb:76:b3:cd:1f' ? 10 : 100;

  const log = new AnsiLogger({ logName: 'ZigbeeTest', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  const mockMatterbridge = {
    matterbridgeDirectory: HOMEDIR + '/.matterbridge',
    matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
    systemInformation: {
      ipv4Address: undefined,
      ipv6Address: undefined,
      osRelease: 'xx.xx.xx.xx.xx.xx',
      nodeVersion: '22.1.10',
    },
    matterbridgeVersion: '3.3.0',
    getDevices: jest.fn(() => []),
    getPlugins: jest.fn(() => []),
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await aggregator.add(device);
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
  } as unknown as Matterbridge;

  const mockConfig: ZigbeePlatformConfig = {
    name: 'matterbridge-zigbee2mqtt',
    type: 'DynamicPlatform',
    version: '1.0.0',
    host: 'mqtt://localhost',
    port: 1883,
    protocolVersion: 5,
    username: '',
    password: '',
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

    // Old properties to delete
    postfixHostname: true,
    deviceScenes: true,
    groupScenes: true,
  };

  beforeAll(() => {});

  beforeEach(() => {
    // Clears the call history before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await flushAsync();
  });

  afterAll(() => {
    // Restore the original implementation of the AnsiLogger.log method
    jest.restoreAllMocks();
  });

  test('create and start the server node', async () => {
    [server, aggregator] = await startServerNode(NAME, MATTER_PORT);
    expect(server).toBeDefined();
    expect(aggregator).toBeDefined();
  });

  it('should return an instance of ZigbeePlatform', () => {
    const platform = initializePlugin(mockMatterbridge, log, mockConfig);
    expect(platform).toBeInstanceOf(ZigbeePlatform);
    platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    const saveVersion = mockMatterbridge.matterbridgeVersion;
    mockMatterbridge.matterbridgeVersion = '1.0.0';
    expect(() => new ZigbeePlatform(mockMatterbridge, log, mockConfig)).toThrow();
    mockMatterbridge.matterbridgeVersion = saveVersion;
  });

  it('should initialize platform with default values', async () => {
    const config = Object.assign({}, mockConfig);
    config.host = 'localhost';
    config.port = -1883;
    config.username = 'user';
    config.password = 'password';
    config.protocolVersion = 10;
    config.postfixHostname = undefined;
    config.deviceScenes = undefined;
    config.groupScenes = undefined;
    config.scenesType = 'outlet';
    config.scenesPrefix = true;
    const platform = new ZigbeePlatform(mockMatterbridge, log, config);
    expect(platform).toBeDefined();

    platform.z2m.emit('mqtt_connect');
    platform.z2m.emit('mqtt_subscribed');
    platform.z2m.emit('close');
    platform.z2m.emit('end');
    platform.z2m.emit('mqtt_error');
    platform.z2m.emit('online');
    platform.z2m.emit('offline');
    // prettier-ignore
    platform.z2m.emit('bridge-info', { version: '1', zigbee_herdsman: { version: '1' }, zigbee_herdsman_converters: { version: '1' }, config: { advanced: { output: 'attribute', legacy_api: true, legacy_availability_payload: true } } });
    platform.shouldStart = true;
    platform.shouldConfigure = true;
    jest.spyOn(platform as any, 'registerZigbeeDevice').mockImplementation(async () => Promise.resolve());
    jest.spyOn(platform as any, 'registerZigbeeGroup').mockImplementation(async () => Promise.resolve());
    jest.spyOn(platform as any, 'requestDeviceUpdate').mockImplementation(async () => Promise.resolve());
    jest.spyOn(platform as any, 'requestGroupUpdate').mockImplementation(async () => Promise.resolve());
    jest.spyOn(platform as any, 'unregisterZigbeeEntity').mockImplementation(async () => Promise.resolve());
    jest.spyOn(platform as any, 'validateDevice').mockImplementation(() => true);
    platform.zigbeeEntities = [{ entityName: 'TestEntity', isDevice: true, device: {}, isGroup: true, group: {}, configure: jest.fn(), destroy: jest.fn() }] as any;
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
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = undefined;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).rejects.toThrow(
      'The plugin did not receive zigbee2mqtt bridge state or info or devices/groups. Check if zigbee2mqtt is running and connected to the MQTT broker.',
    );

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = [] as BridgeDevice[];
    platform.z2mBridgeGroups = undefined;
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = undefined;
    platform.z2mBridgeGroups = [] as BridgeGroup[];
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    platform.z2mBridgeOnline = true;
    platform.z2mBridgeInfo = {} as BridgeInfo;
    platform.z2mBridgeDevices = [] as BridgeDevice[];
    platform.z2mBridgeGroups = [] as BridgeGroup[];
    (platform as any).connectTimeout = 50; // 50 ms for testing
    await expect(platform.onStart()).resolves.toBeUndefined();

    await platform.onShutdown();
    expect((platform as any).mqttHost).toBe('mqtt://localhost');
    expect((platform as any).mqttPort).toBe(-1883);
    expect((platform as any).mqttProtocol).toBe(5);
    expect((platform as any).mqttTopic).toBe('zigbee2mqtt');
    expect((platform as any).mqttUsername).toBe('user');
    expect((platform as any).mqttPassword).toBe('password');
  });

  it('should initialize platform with config name', () => {
    platform = new ZigbeePlatform(mockMatterbridge, log, mockConfig);
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

  it('should update entity OFFLINE', async () => {
    for (const entity of platform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      platform.z2m.emit('OFFLINE-' + entity.entityName);
      await wait(50);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
  }, 60000);

  it('should update entity ONLINE', async () => {
    for (const entity of platform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      platform.z2m.emit('ONLINE-' + entity.entityName);
      await wait(50);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
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
    await wait(500);
  });

  it('should update /bridge/devices', async () => {
    const devices = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-devices.json'));
    expect(devices).toBeDefined();

    platform.z2mBridgeDevices = undefined;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));
    expect(platform.z2mBridgeDevices).toBeDefined();
    if (!platform.z2mBridgeDevices) return;
    expect((platform.z2mBridgeDevices as BridgeDevice[]).length).toBe(35);
    await wait(500);
  });

  it('should update /bridge/groups', async () => {
    const groups = platform.z2m.readConfig(path.join('src', 'mock', 'bridge-groups.json'));
    expect(groups).toBeDefined();

    platform.z2mBridgeGroups = undefined;
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/groups', Buffer.from(JSON.stringify(groups)));
    expect(platform.z2mBridgeGroups).toBeDefined();
    if (!platform.z2mBridgeGroups) return;
    expect((platform.z2mBridgeGroups as BridgeGroup[]).length).toBe(10);
    await wait(500);
  });

  it('should update /Moes thermo/availability online', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT entity Moes thermo is online`);
    await wait(200);
  });

  it('should update /Moes thermo/availability offline', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT entity Moes thermo is offline`);
    await wait(200);
  });

  it('should update /At home/availability online', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT entity At home is online`);
    await wait(200);
  });

  it('should update /At home/availability offline', async () => {
    (platform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT entity At home is offline`);
    await wait(200);
  });

  it('should update /At home/set', async () => {
    const entity = 'At home';
    const payload = { state: 'ON', changed: 1 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-onoffswitch:50${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}false${db} to ${YELLOW}true${db}`),
    );
    await wait(200);
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
      if (!entity) console.warn('entry', entry.entity, entry.service, entry.payload);
      if (!entity) return;
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      if (entity) {
        platform.z2m.emit('MESSAGE-' + entity.entityName, payloadJson);
      }
    });
  }, 60000);

  it('should update /Lights/set', async () => {
    // setDebug(true);

    const entity = 'Lights';

    jest.clearAllMocks();
    const oldxy = { state: 'OFF', brightness: 100, color: { x: 0.2927, y: 0.6349 }, color_mode: 'xy', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldxy)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:56${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}true${db} to ${YELLOW}false${db}`),
    );

    jest.clearAllMocks();
    const oldct = { state: 'OFF', brightness: 100, color_temp: 500, color_mode: 'color_temp', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldct)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));

    jest.clearAllMocks();
    const payload = { state: 'ON', brightness: 250, color: { x: 0.5006, y: 0.2993 }, color_mode: 'xy', changed: 1 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    await flushAsync(undefined, undefined, updateTimeout);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}MA-extendedcolorlight:56${db} attribute ${hk}LevelControl${db}.${hk}currentLevel${db}`, //  from ${YELLOW}1${db} to ${YELLOW}250${db}
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}MA-extendedcolorlight:56${db} attribute ${hk}ColorControl${db}.${hk}colorMode${db} from ${YELLOW}2${db} to ${YELLOW}0${db}`,
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}MA-extendedcolorlight:56${db} attribute ${hk}ColorControl${db}.${hk}currentHue${db} from ${YELLOW}0${db} to ${YELLOW}248${db}`,
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Update endpoint ${or}MA-extendedcolorlight:56${db} attribute ${hk}ColorControl${db}.${hk}currentSaturation${db} from ${YELLOW}0${db} to ${YELLOW}254${db}`,
      ),
    );
    // setDebug(false);
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
    expect(device.deviceTypes.get(doorLockDevice.code)).toBeDefined();
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
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.executeCommandHandler('lockDoor');
    await device.executeCommandHandler('unlockDoor');

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
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.setAttribute('onOff', 'onOff', false);
    await device.executeCommandHandler('on', {}, 'onOff', {}, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('off', {}, 'onOff', {}, device);
    await device.executeCommandHandler('on', {}, 'onOff', {}, device);
    await device.executeCommandHandler('toggle', {}, 'onOff', {}, device);
    await device.executeCommandHandler('on', {}, 'onOff', {}, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('moveToLevel', { level: 100 }, 'levelControl', {}, device);
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 50 }, 'levelControl', {}, device);
    await device.executeCommandHandler('moveToColorTemperature', { colorTemperatureMireds: 400 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToColor', { colorX: 0.2927, colorY: 0.6349 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToHue', { hue: 200 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToSaturation', { saturation: 90 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToHueAndSaturation', { hue: 200, saturation: 90 }, 'colorControl', {}, device);

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
    expect(device.deviceTypes.get(coverDevice.code)).toBeDefined();
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
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.executeCommandHandler('upOrOpen');
    await device.executeCommandHandler('downOrClose');
    await device.executeCommandHandler('stopMotion');
    await device.executeCommandHandler('goToLiftPercentage', { liftPercent100thsValue: 5000 });

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
    expect(device.deviceTypes.get(thermostatDevice.code)).toBeDefined();
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
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.executeCommandHandler('setpointRaiseLower', { mode: Thermostat.SetpointRaiseLowerMode.Both, amount: 10 });

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
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.setAttribute('onOff', 'onOff', false);
    await device.executeCommandHandler('on', {}, 'onOff', {}, device);
    await device.setAttribute('onOff', 'onOff', true);
    await device.executeCommandHandler('off', {}, 'onOff', {}, device);
    await device.executeCommandHandler('on', {}, 'onOff', {}, device);
    await device.executeCommandHandler('off', {}, 'onOff', {}, device);
    await device.executeCommandHandler('toggle', {}, 'onOff', {}, device);
    await device.executeCommandHandler('moveToLevel', { level: 100 }, 'levelControl', {}, device);
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 0 }, 'levelControl', {}, device);
    await device.executeCommandHandler('moveToColorTemperature', { colorTemperatureMireds: 400 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToColor', { colorX: 0.2927, colorY: 0.6349 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToHue', { hue: 200 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToSaturation', { saturation: 90 }, 'colorControl', {}, device);
    await device.executeCommandHandler('moveToHueAndSaturation', { hue: 200, saturation: 90 }, 'colorControl', {}, device);

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

  it('should call onConfigure permit_join = false', async () => {
    (platform as any).z2mBridgeInfo.permit_join = false;
    (platform as any).availabilityTimeout = 50;
    await platform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it('should call onConfigure permit_join = true', async () => {
    (platform as any).z2mBridgeInfo.permit_join = true;
    await platform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it('should call onChangeLoggerLevel', async () => {
    await platform.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringMatching(/^Changed logger level to/));
  });

  it('should call onShutdown with reason', async () => {
    await platform.onShutdown('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Shutdown zigbee2mqtt dynamic platform/));
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for async operations to complete
  });

  test('close the server node', async () => {
    expect(server).toBeDefined();
    await stopServerNode(server);
    await flushAsync(1, 1, 500);
  });
});
