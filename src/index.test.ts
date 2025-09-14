// src/index.test.ts

const MATTER_PORT = 0;
const NAME = 'Index';
const HOMEDIR = path.join('jest', NAME);

/* eslint-disable no-console */

import path from 'node:path';

import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { jest } from '@jest/globals';

import { ZigbeePlatform } from './platform.ts';
import { Zigbee2MQTT } from './zigbee2mqtt.ts';
import initializePlugin from './index.ts';
import { createTestEnvironment, setupTest } from './jestHelpers.js';

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
createTestEnvironment(HOMEDIR);

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    mockMatterbridge = {
      matterbridgeDirectory: HOMEDIR + '/.matterbridge',
      matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
      systemInformation: {
        ipv4Address: undefined,
        ipv6Address: undefined,
        osRelease: 'xx.xx.xx.xx.xx.xx',
        nodeVersion: '22.1.10',
      },
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
      version: '1.0.0',
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
      debug: false,
      unregisterOnShutdown: false,
    } as PlatformConfig;
  });

  it('should return an instance of ZigbeePlatform', () => {
    const platform = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(platform).toBeInstanceOf(ZigbeePlatform);
    platform.onShutdown();
  });
});
