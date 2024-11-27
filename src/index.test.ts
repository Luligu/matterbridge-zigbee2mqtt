/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { ZigbeePlatform } from './platform.js';
import initializePlugin from './index';
import { jest } from '@jest/globals';
import { Zigbee2MQTT } from './zigbee2mqtt.js';

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  let loggerLogSpy: jest.SpiedFunction<(level: LogLevel, message: string, ...parameters: any[]) => void>;
  let consoleLogSpy: jest.SpiedFunction<(...args: any[]) => void>;

  let z2mStartSpy: jest.SpiedFunction<() => Promise<void>>;
  let z2mStopSpy: jest.SpiedFunction<() => Promise<void>>;
  let z2mSubscribeSpy: jest.SpiedFunction<(topic: string) => Promise<void>>;
  let z2mPublishSpy: jest.SpiedFunction<(topic: string, message: string, queue: boolean) => Promise<void>>;

  beforeEach(() => {
    mockMatterbridge = {
      addBridgedDevice: jest.fn(),
      matterbridgeDirectory: '',
      matterbridgePluginDirectory: 'temp',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '1.6.3',
      removeAllBridgedDevices: jest.fn(),
    } as unknown as Matterbridge;
    mockLog = {
      fatal: jest.fn((message) => {
        // console.log(`Fatal: ${message}`);
      }),
      error: jest.fn((message) => {
        // console.log(`Error: ${message}`);
      }),
      warn: jest.fn((message) => {
        // console.log(`Warn: ${message}`);
      }),
      notice: jest.fn((message) => {
        // console.log(`Notice: ${message}`);
      }),
      info: jest.fn((message) => {
        // console.log(`Info: ${message}`);
      }),
      debug: jest.fn((message) => {
        // console.log(`Debug: ${message}`);
      }),
    } as unknown as AnsiLogger;
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
      'featureBlackList': ['device_temperature', 'consumption', 'update', 'update_available', 'power_outage_count', 'indicator_mode', 'do_not_disturb', 'color_temp_startup'],
      'deviceFeatureBlackList': {},
      'postfixHostname': true,
      'unregisterOnShutdown': false,
      'delayStart': false,
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

  it('should return an instance of TestPlatform', () => {
    const result = initializePlugin(mockMatterbridge, mockLog, mockConfig);

    expect(result).toBeInstanceOf(ZigbeePlatform);
  });
});
