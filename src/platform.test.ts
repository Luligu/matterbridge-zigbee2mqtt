/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable prefer-const */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest } from '@jest/globals';
import { bridgedNode, colorTemperatureLight, coverDevice, dimmableLight, doorLockDevice, extendedColorLight, Matterbridge, MatterbridgeEndpoint, onOffLight, PlatformConfig, powerSource, thermostatDevice } from 'matterbridge';
import { AnsiLogger, db, idn, ign, LogLevel, rs, TimestampFormat, wr, debugStringify, or, hk, zb, YELLOW, gn } from 'matterbridge/logger';
import { wait } from 'matterbridge/utils';
import { Thermostat } from 'matterbridge/matter/clusters';
import path from 'node:path';
import fs from 'node:fs';

import { ZigbeePlatform } from './platform';
import { Zigbee2MQTT } from './zigbee2mqtt';
import { BridgeDevice, BridgeGroup, BridgeInfo } from './zigbee2mqttTypes';

let loggerLogSpy: jest.SpiedFunction<typeof AnsiLogger.prototype.log>;
let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
let consoleDebugSpy: jest.SpiedFunction<typeof console.log>;
let consoleInfoSpy: jest.SpiedFunction<typeof console.log>;
let consoleWarnSpy: jest.SpiedFunction<typeof console.log>;
let consoleErrorSpy: jest.SpiedFunction<typeof console.log>;
const debug = false; // Set to true to enable debug logs

if (!debug) {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {});
  consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: any[]) => {});
  consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation((...args: any[]) => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => {});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {});
} else {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
  consoleLogSpy = jest.spyOn(console, 'log');
  consoleDebugSpy = jest.spyOn(console, 'debug');
  consoleInfoSpy = jest.spyOn(console, 'info');
  consoleWarnSpy = jest.spyOn(console, 'warn');
  consoleErrorSpy = jest.spyOn(console, 'error');
}

let z2mStartSpy: jest.SpiedFunction<() => Promise<void>>;
let z2mStopSpy: jest.SpiedFunction<() => Promise<void>>;
let z2mSubscribeSpy: jest.SpiedFunction<(topic: string) => Promise<void>>;
let z2mPublishSpy: jest.SpiedFunction<(topic: string, message: string, queue: boolean) => Promise<void>>;
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

describe('TestPlatform', () => {
  let mockMatterbridge: Matterbridge;
  let mockConfig: PlatformConfig;
  let platform: ZigbeePlatform;

  const log = new AnsiLogger({ logName: 'ZigbeeTest', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });

  beforeAll(() => {
    mockMatterbridge = {
      matterbridgeDirectory: './jest/matterbridge',
      matterbridgePluginDirectory: './jest/plugins',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '3.0.3',
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
      'scenesType': 'outlet',
      'postfix': '',
      'debug': true,
      'unregisterOnShutdown': false,
    } as PlatformConfig;
  });

  beforeEach(() => {
    // Clears the call history before each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore the original implementation of the AnsiLogger.log method
    jest.restoreAllMocks();
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
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-onoffswitch:undefined${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}undefined${db} to ${YELLOW}true${db}`));
    await wait(200);
  });

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
      const entity = platform.zigbeeEntities.find((entity) => entity.entityName === entry.entity);
      // expect(entity).toBeDefined();
      if (!entity) console.error('entry', entry.entity, entry.service, entry.payload);
      if (!entity) return;
      expect(entity.entityName).toBeDefined();
      expect(entity.entityName.length).toBeGreaterThan(0);
      if (entity) {
        platform.z2m.emit('MESSAGE-' + entity.entityName, payloadJson);
      }
    });
  }, 60000);

  it('should update /Lights/set', async () => {
    const entity = 'Lights';

    const oldxy = { state: 'OFF', brightness: 100, color: { x: 0.2927, y: 0.6349 }, color_mode: 'xy', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldxy)));

    const oldct = { state: 'OFF', brightness: 100, color_temp: 500, color_mode: 'color_temp', changed: 0 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(oldct)));

    const payload = { state: 'ON', brightness: 250, color: { x: 0.7006, y: 0.2993 }, color_mode: 'xy', changed: 1 };
    (platform.z2m as any).messageHandler('zigbee2mqtt/' + entity, Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}MQTT message for device ${ign}${entity}${rs}${db} payload:`));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:undefined${db} attribute ${hk}OnOff${db}.${hk}onOff${db} from ${YELLOW}undefined${db} to ${YELLOW}true${db}`));
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:undefined${db} attribute ${hk}LevelControl${db}.${hk}currentLevel${db} from ${YELLOW}undefined${db} to ${YELLOW}250${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:undefined${db} attribute ${hk}ColorControl${db}.${hk}colorMode${db} from ${YELLOW}undefined${db} to ${YELLOW}0${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:undefined${db} attribute ${hk}ColorControl${db}.${hk}currentHue${db} from ${YELLOW}undefined${db} to ${YELLOW}0${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Update endpoint ${or}MA-extendedcolorlight:undefined${db} attribute ${hk}ColorControl${db}.${hk}currentSaturation${db} from ${YELLOW}undefined${db} to ${YELLOW}254${db}`),
    );
  });

  it('should add NewGroup', async () => {
    const entity = 'NewGroup';
    const payload = { data: { friendly_name: entity, id: 15 }, status: 'ok', transaction: '8j6s7-10' };
    (platform.z2m as any).messageHandler('zigbee2mqtt/bridge/response/group/add', Buffer.from(JSON.stringify(payload)));
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_add friendly_name: ${entity} id ${payload.data.id} status ${payload.status}`));
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
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`zigbee2MQTT sent group_rename from: ${payload.data.from} to ${payload.data.to} status ${payload.status}`));
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
    /*
    loggerLogSpy.mockRestore();
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
    consoleLogSpy.mockRestore();
    consoleLogSpy = jest.spyOn(console, 'log');
    */

    const friendlyName = 'Gledopto RGBCTT light I';
    const entity = platform.zigbeeEntities.find((device) => device.entityName === friendlyName);
    expect(entity).toBeDefined();
    if (!entity) return;
    const device = entity?.bridgedDevice;
    expect(device).toBeDefined();
    if (!device) return;
    await device.executeCommandHandler('identify', { identifyTime: 10 });
    await device.executeCommandHandler('on');
    await device.executeCommandHandler('off');
    await device.executeCommandHandler('toggle');
    await device.executeCommandHandler('moveToLevel', { level: 100 });
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 0 });
    await device.executeCommandHandler('moveToColorTemperature', { colorTemperatureMireds: 400 });
    await device.executeCommandHandler('moveToColor', { colorX: 0.2927, colorY: 0.6349 });
    await device.executeCommandHandler('moveToHue', { hue: 200 });
    await device.executeCommandHandler('moveToSaturation', { saturation: 90 });
    await device.executeCommandHandler('moveToHueAndSaturation', { hue: 200, saturation: 90 });

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
    /*
    loggerLogSpy.mockRestore();
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
    consoleLogSpy.mockRestore();
    consoleLogSpy = jest.spyOn(console, 'log');
    */

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
    await device.executeCommandHandler('on');
    await device.executeCommandHandler('off');
    await device.executeCommandHandler('toggle');
    await device.executeCommandHandler('moveToLevel', { level: 100 });
    await device.executeCommandHandler('moveToLevelWithOnOff', { level: 0 });
    await device.executeCommandHandler('moveToColorTemperature', { colorTemperatureMireds: 400 });
    await device.executeCommandHandler('moveToColor', { colorX: 0.2927, colorY: 0.6349 });
    await device.executeCommandHandler('moveToHue', { hue: 200 });
    await device.executeCommandHandler('moveToSaturation', { saturation: 90 });
    await device.executeCommandHandler('moveToHueAndSaturation', { hue: 200, saturation: 90 });

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

  it('should call onConfigure', async () => {
    await platform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Configured zigbee2mqtt dynamic platform/));
  });

  it('should call onShutdown with reason', async () => {
    await platform.onShutdown('Jest Test');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringMatching(/^Shutdown zigbee2mqtt dynamic platform/));
  });

  it('should pause for a while', async () => {
    expect(platform).toBeDefined();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1000);
    });
  });
});
