/* eslint-disable @typescript-eslint/no-unused-vars */
import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { ZigbeePlatform } from './platform.js';
import initializePlugin from './index';
import { jest } from '@jest/globals';

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    mockMatterbridge = {
      addBridgedDevice: jest.fn(),
      matterbridgeDirectory: '',
      matterbridgePluginDirectory: 'temp',
      systemInformation: { ipv4Address: undefined },
      matterbridgeVersion: '1.6.2',
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
  });

  it('should return an instance of TestPlatform', () => {
    const result = initializePlugin(mockMatterbridge, mockLog, mockConfig);

    expect(result).toBeInstanceOf(ZigbeePlatform);
  });
});
