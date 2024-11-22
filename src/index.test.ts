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
      matterbridgeVersion: '1.6.0',
      removeAllBridgedDevices: jest.fn(),
    } as unknown as Matterbridge;
    mockLog = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as AnsiLogger;
    mockConfig = {
      'name': 'matterbridge-test',
      'type': 'DynamicPlatform',
      'noDevices': false,
      'throwLoad': false,
      'throwStart': false,
      'throwConfigure': false,
      'throwShutdown': false,
      'unregisterOnShutdown': false,
      'delayStart': false,
    } as PlatformConfig;
  });

  it('should return an instance of TestPlatform', () => {
    const result = initializePlugin(mockMatterbridge, mockLog, mockConfig);

    expect(result).toBeInstanceOf(ZigbeePlatform);
  });
});
