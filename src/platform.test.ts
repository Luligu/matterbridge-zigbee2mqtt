/* eslint-disable jest/no-commented-out-tests */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest } from '@jest/globals';

import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, db, idn, ign, LogLevel, rs, TimestampFormat, wr, debugStringify, or, hk, zb, YELLOW } from 'matterbridge/logger';
import { wait } from 'matterbridge/utils';

import { ZigbeePlatform } from './platform';
import { Zigbee2MQTT } from './zigbee2mqtt';
import { BridgeDevice, BridgeGroup, BridgeInfo } from './zigbee2mqttTypes';
import path from 'path';
import fs from 'fs';

describe('TestPlatform', () => {
  let mockMatterbridge: Matterbridge;
  let mockConfig: PlatformConfig;
  let z2mPlatform: ZigbeePlatform;

  let loggerLogSpy: jest.SpiedFunction<(level: LogLevel, message: string, ...parameters: any[]) => void>;
  let consoleLogSpy: jest.SpiedFunction<(...args: any[]) => void>;

  let z2mStartSpy: jest.SpiedFunction<() => Promise<void>>;
  let z2mStopSpy: jest.SpiedFunction<() => Promise<void>>;
  let z2mSubscribeSpy: jest.SpiedFunction<(topic: string) => Promise<void>>;
  let z2mPublishSpy: jest.SpiedFunction<(topic: string, message: string, queue: boolean) => Promise<void>>;

  const log = new AnsiLogger({ logName: 'ZigbeeTest', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });

  beforeAll(() => {
    mockMatterbridge = {
      matterbridgeDirectory: './jest/matterbridge',
      matterbridgePluginDirectory: './jest/plugins',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '2.1.0',
      getDevices: jest.fn(() => {
        // console.log('getDevices called');
        return [];
      }),
      getPlugins: jest.fn(() => {
        // console.log('getDevices called');
        return [];
      }),
      addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
        // console.log('addBridgedEndpoint called');
        // await aggregator.add(device);
      }),
      removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
        // console.log('removeBridgedEndpoint called');
      }),
      removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
        // console.log('removeAllBridgedEndpoints called');
      }),
    } as unknown as Matterbridge;
    mockConfig = {
      'name': 'matterbridge-zigbee2mqtt',
      'type': 'DynamicPlatform',
      'topic': 'zigbee2mqtt',
      'host': 'localhost',
      'port': 1883,
      'protocolVersion': 5,
      'username': undefined,
      'password': undefined,
      'blackList': [],
      'whiteList': [],
      'switchList': [],
      'lightList': [],
      'outletList': [],
      'featureBlackList': ['device_temperature', 'update', 'update_available', 'power_outage_count', 'indicator_mode', 'do_not_disturb', 'color_temp_startup'],
      'deviceFeatureBlackList': {},
      'postfixHostname': true,
      'debug': true,
      'unregisterOnShutdown': false,
    } as PlatformConfig;

    // Spy on and mock the AnsiLogger.log method
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {
      // console.log(`Mocked log: ${level} - ${message}`, ...parameters);
    });
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      // Mock implementation or empty function
    });

    z2mStartSpy = jest.spyOn(Zigbee2MQTT.prototype, 'start').mockImplementation(() => {
      console.log('Mocked start');
      return Promise.resolve();
    });
    z2mStopSpy = jest.spyOn(Zigbee2MQTT.prototype, 'stop').mockImplementation(() => {
      console.log('Mocked stop');
      return Promise.resolve();
    });
    z2mSubscribeSpy = jest.spyOn(Zigbee2MQTT.prototype, 'subscribe').mockImplementation((topic: string) => {
      console.log('Mocked subscribe', topic);
      return Promise.resolve();
    });
    z2mPublishSpy = jest.spyOn(Zigbee2MQTT.prototype, 'publish').mockImplementation((topic: string, message: string, queue?: boolean) => {
      console.log(`Mocked publish: ${topic} - ${message} queue ${queue}`);
      return Promise.resolve();
    });
  });

  beforeEach(() => {
    // Clears the call history before each test
    loggerLogSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  afterAll(() => {
    // Restore the original implementation of the AnsiLogger.log method
    loggerLogSpy.mockRestore();
    consoleLogSpy.mockRestore();
    z2mStartSpy.mockRestore();
    z2mStopSpy.mockRestore();
    z2mSubscribeSpy.mockRestore();
    z2mPublishSpy.mockRestore();
  });

  it('should initialize platform with config name', () => {
    z2mPlatform = new ZigbeePlatform(mockMatterbridge, log, mockConfig);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Initializing platform:/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Loaded zigbee2mqtt parameters/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Connecting to MQTT broker/));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringMatching(/^Created zigbee2mqtt dynamic platform/));
  });

  it('should call onStart with reason', async () => {
    const info = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-info.json'));
    expect(info).toBeDefined();
    const devices = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-devices.json'));
    expect(devices).toBeDefined();
    const groups = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-groups.json'));
    expect(groups).toBeDefined();

    z2mPlatform.z2mBridgeOnline = true;
    z2mPlatform.z2mBridgeInfo = info as BridgeInfo;
    z2mPlatform.z2mBridgeDevices = devices as BridgeDevice[];
    z2mPlatform.z2mBridgeGroups = groups as BridgeGroup[];

    await z2mPlatform.onStart('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Started zigbee2mqtt dynamic platform/));
  }, 60000);

  it('should have registered devices', async () => {
    expect(z2mPlatform.z2mBridgeDevices).toBeDefined();
    if (!z2mPlatform.z2mBridgeDevices) return;
    expect(z2mPlatform.z2mBridgeDevices.length).toBe(34);
  });

  it('should have registered groups', async () => {
    expect(z2mPlatform.z2mBridgeGroups).toBeDefined();
    if (!z2mPlatform.z2mBridgeGroups) return;
    expect(z2mPlatform.z2mBridgeGroups.length).toBe(10);
  });

  /*
  it('should update entity OFFLINE', async () => {
    for (const entity of z2mPlatform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      z2mPlatform.z2m.emit('OFFLINE-' + entity.entityName);
      await wait(200);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
  }, 60000);

  it('should update entity ONLINE', async () => {
    for (const entity of z2mPlatform.zigbeeEntities) {
      expect(entity).toBeDefined();
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      z2mPlatform.z2m.emit('ONLINE-' + entity.entityName);
      await wait(200);
      expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${(entity as any).ien}${entity.entityName}${rs}`);
    }
  }, 60000);

  it('should update entity MESSAGE', async () => {
    const filePath = path.join('src', 'mock', 'bridge-payloads.txt');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const logEntries = fileContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    expect(logEntries).toBeDefined();
    expect(logEntries.length).toBe(702);

    logEntries.forEach((entry: { entity: string; service: string; payload: string }) => {
      const payloadJson: Record<string, boolean | number | string | undefined | null | object> = JSON.parse(entry.payload);
      const entity = z2mPlatform.zigbeeEntities.find((entity) => entity.entityName === entry.entity);
      // expect(entity).toBeDefined();
      if (!entity) console.error('entry', entry.entity, entry.service, entry.payload);
      if (!entity) return;
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      if (entity) {
        z2mPlatform.z2m.emit('MESSAGE-' + entity.entityName, payloadJson);
      }
    });
  }, 60000);

  it('should update /bridge/state online', async () => {
    z2mPlatform.z2mBridgeOnline = false;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('{"state":"online"}'));
    expect(z2mPlatform.z2mBridgeOnline).toBe(true);
    z2mPlatform.z2mBridgeOnline = false;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('online'));
    expect(z2mPlatform.z2mBridgeOnline).toBe(true);
  });

  it('should update /bridge/state offline', async () => {
    z2mPlatform.z2mBridgeOnline = true;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('{"state":"offline"}'));
    expect(z2mPlatform.z2mBridgeOnline).toBe(false);
    z2mPlatform.z2mBridgeOnline = true;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/state', Buffer.from('offline'));
    expect(z2mPlatform.z2mBridgeOnline).toBe(false);
  });

  it('should update /bridge/info', async () => {
    const info = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-info.json'));
    expect(info).toBeDefined();

    z2mPlatform.z2mBridgeInfo = undefined;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/info', Buffer.from(JSON.stringify(info)));
    expect(z2mPlatform.z2mBridgeInfo).toBeDefined();
    await wait(500);
  });
  */

  /*
  it('should update /bridge/devices', async () => {
    const devices = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-devices.json'));
    expect(devices).toBeDefined();

    z2mPlatform.z2mBridgeDevices = undefined;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));
    expect(z2mPlatform.z2mBridgeDevices).toBeDefined();
    if (!z2mPlatform.z2mBridgeDevices) return;
    expect((z2mPlatform.z2mBridgeDevices as BridgeDevice[]).length).toBe(34);
    await wait(500);
  });

  it('should update /bridge/groups', async () => {
    const groups = z2mPlatform.z2m.readConfig(path.join('src', 'mock', 'bridge-groups.json'));
    expect(groups).toBeDefined();

    z2mPlatform.z2mBridgeGroups = undefined;
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/groups', Buffer.from(JSON.stringify(groups)));
    expect(z2mPlatform.z2mBridgeGroups).toBeDefined();
    if (!z2mPlatform.z2mBridgeGroups) return;
    expect((z2mPlatform.z2mBridgeGroups as BridgeGroup[]).length).toBe(10);
    await wait(500);
  });

  it('should update /Moes thermo/availability online', async () => {
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT device Moes thermo is online`);
    await wait(200);
  });

  it('should update /Moes thermo/availability offline', async () => {
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/Moes thermo/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${idn}Moes thermo${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT device Moes thermo is offline`);
    await wait(200);
  });

  it('should update /At home/availability online', async () => {
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"online"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `ONLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `zigbee2MQTT device At home is online`);
    await wait(200);
  });

  it('should update /At home/availability offline', async () => {
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/At home/availability', Buffer.from('{"state":"offline"}'));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `OFFLINE message for device ${ign}At home${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `zigbee2MQTT device At home is offline`);
    await wait(200);
  });
  */

  /*
  it('should update /At home/set', async () => {
    const entity = 'At home';
    const payload = { state: 'ON', changed: 1 };
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-onoffswitch:undefined${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}false${db} to ${YELLOW}true${db}`));

    await wait(200);
  });
  */

  /*
  it('should update /Lights/set', async () => {
    // loggerLogSpy.mockRestore();
    // consoleLogSpy.mockRestore();

    // {"entity":"Lights","payload":"{\"brightness\":254,\"color\":{\"hue\":22,\"saturation\":97,\"x\":0.5492,\"y\":0.4082},\"color_mode\":\"color_temp\",\"color_temp\":555,\"state\":\"OFF\"}"}
    const entity = 'Lights';

    const oldxy = { state: 'OFF', brightness: 100, color: { x: 0.2927, y: 0.6349 }, color_mode: 'xy', changed: 0 }; // { name: 'Pure Green 50% 120', hsl: { h: 120, s: 50, l: 50 }, rgb: { r: 64, g: 192, b: 64 }, xy: { x: 0.2127, y: 0.6349 } },
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldxy)));

    const oldct = { state: 'OFF', brightness: 100, color_temp: 500, color_mode: 'color_temp', changed: 0 };
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldct)));

    const payload = { state: 'ON', brightness: 250, color: { x: 0.7006, y: 0.2993 }, color_mode: 'xy', changed: 1 }; // { name: 'Pure Red 0', hsl: { h: 0, s: 100, l: 50 }, rgb: { r: 255, g: 0, b: 0 }, xy: { x: 0.7006, y: 0.2993 } },
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-colortemperaturelight:undefined${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}false${db} to ${YELLOW}true${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-colortemperaturelight:undefined${db} attribute ${hk}LevelControl${db}.${hk}currentLevel${db} from ${YELLOW}100${db} to ${YELLOW}250${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-colortemperaturelight:undefined${db} attribute ${hk}ColorControl${db}.${hk}colorMode${db} from ${YELLOW}2${db} to ${YELLOW}0${db}`));
    // expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-colortemperaturelight:undefined${db} attribute ${hk}ColorControl${db}.${hk}currentHue${db} from ${zb}85${db} to ${zb}0${db}`));
    // expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-colortemperaturelight:undefined${db} attribute ${hk}ColorControl${db}.${hk}currentSaturation${db} from ${zb}100${db} to ${zb}100${db}`));

    await wait(200);
  });

  it('should add NewGroup', async () => {
    const entity = 'NewGroup';
    const payload = { data: { friendly_name: entity, id: 15 }, status: 'ok', transaction: '8j6s7-10' };
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/add', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_add friendly_name: ${entity} id ${payload.data.id} status ${payload.status}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Registering group: ${entity}`));
  });

  it('should unregister At home', async () => {
    const entity = 'At home';
    const payload = { data: { force: false, id: entity }, status: 'ok', transaction: '8j6s7-10' };
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/remove', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_remove friendly_name: ${payload.data.id} status ${payload.status}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Removing device: ${entity}`));
  });

  it('should rename Sleeping', async () => {
    const entity = 'Sleeping';
    const payload = { data: { from: entity, to: 'Is dark' }, status: 'ok', transaction: '8j6s7-10' };
    (z2mPlatform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/rename', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_rename from: ${payload.data.from} to ${payload.data.to} status ${payload.status}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Removing device: ${payload.data.from}`));
    // expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Registering group: ${payload.data.to}`));
  });
  */

  /*
  it('should call onConfigure', async () => {
    await z2mPlatform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it('should call onShutdown with reason', async () => {
    await z2mPlatform.onShutdown('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Shutdown zigbee2mqtt dynamic platform/));
  });
  */
});
