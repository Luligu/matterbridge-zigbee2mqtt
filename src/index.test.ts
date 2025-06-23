/* eslint-disable no-console */

import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { jest } from '@jest/globals';

import { ZigbeePlatform } from './platform.ts';
import { Zigbee2MQTT } from './zigbee2mqtt.ts';
import initializePlugin from './index.ts';

let loggerLogSpy: jest.SpiedFunction<typeof AnsiLogger.prototype.log>;
let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
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

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    mockMatterbridge = {
      matterbridgeDirectory: './jest/matterbridge',
      matterbridgePluginDirectory: './jest/plugins',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '3.0.4',
      getDevices: jest.fn(() => []),
      getPlugins: jest.fn(() => []),
      addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
      removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
      removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
    } as unknown as Matterbridge;
    mockLog = {
      fatal: jest.fn((message) => {}),
      error: jest.fn((message) => {}),
      warn: jest.fn((message) => {}),
      notice: jest.fn((message) => {}),
      info: jest.fn((message) => {}),
      debug: jest.fn((message) => {}),
    } as unknown as AnsiLogger;
    mockConfig = {
      name: 'matterbridge-zigbee2mqtt',
      type: 'DynamicPlatform',
      topic: 'zigbee2mqtt',
      host: 'localhost',
      port: 1883,
      protocolVersion: 5,
      username: undefined,
      password: undefined,
      blackList: [],
      whiteList: [],
      switchList: [],
      lightList: [],
      outletList: [],
      featureBlackList: ['device_temperature', 'consumption', 'update', 'update_available', 'power_outage_count', 'indicator_mode', 'do_not_disturb', 'color_temp_startup'],
      deviceFeatureBlackList: {},
      postfix: '',
      unregisterOnShutdown: false,
    } as PlatformConfig;
  });

  it('should return an instance of ZigbeePlatform', () => {
    const platform = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(platform).toBeInstanceOf(ZigbeePlatform);
    platform.onShutdown();
  });
});
