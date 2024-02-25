import { StorageBackendJsonFile, StorageManager } from '@project-chip/matter-node.js/storage';
import { MatterServer } from '@project-chip/matter-node.js';
import { Matterbridge } from '../../matterbridge/dist/index.js';
import { ZigbeePlatform } from './matterPlatform.js';
import { AnsiLogger } from 'node-ansi-logger';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 * Each plugin should return the platform.
 * 
 * @param matterbridge - An instance of MatterBridge
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger) {
  // Do nothing just load @project-chip/matter-node.js
  const storageJson = new StorageBackendJsonFile('matterbridge-example');
  const storageManager = new StorageManager(storageJson);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const matterServer = new MatterServer(storageManager);

  log.info('Matterbridge zigbee2mqtt is loading...');

  const platform = new ZigbeePlatform(matterbridge, log);

  log.info('Matterbridge zigbee2mqtt initialized successfully!');
  return platform;
}
