/* eslint-disable @typescript-eslint/no-unused-vars */
import { CommissioningController, CommissioningServer, MatterServer, NodeCommissioningOptions } from '@project-chip/matter-node.js';
import { EndpointNumber, NodeId, VendorId } from '@project-chip/matter-node.js/datatype';
import {
  Aggregator,
  ComposedDevice,
  Device,
  DeviceClasses,
  DeviceTypeDefinition,
  DeviceTypes,
  Endpoint,
  NodeStateInformation,
  OnOffPluginUnitDevice,
  PairedNode,
  getDeviceTypeDefinitionByCode,
} from '@project-chip/matter-node.js/device';
import { Format, Level, Logger } from '@project-chip/matter-node.js/log';
import { ManualPairingCodeCodec, QrCodeSchema } from '@project-chip/matter-node.js/schema';
import { StorageBackendDisk, StorageBackendJsonFile, StorageContext, StorageManager } from '@project-chip/matter-node.js/storage';
import { requireMinNodeVersion, getParameter, getIntParameter, hasParameter, singleton, ByteArray } from '@project-chip/matter-node.js/util';
import { logEndpoint } from '@project-chip/matter-node.js/device';
import { Crypto, CryptoNode } from '@project-chip/matter-node.js/crypto';
import { CommissioningOptions } from '@project-chip/matter.js/protocol';
import {
  AllClustersMap,
  AttributeInitialValues,
  BasicInformationCluster,
  BooleanState,
  ClusterServer,
  GeneralCommissioning,
  Identify,
  IdentifyCluster,
  IlluminanceMeasurement,
  IlluminanceMeasurementCluster,
  OccupancySensing,
  OccupancySensingCluster,
  OnOff,
  PowerSource,
  PowerSourceCluster,
  PressureMeasurement,
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
  getClusterNameById,
  EventPriority,
  ActionsCluster,
  Actions,
  WindowCovering,
  WindowCoveringCluster,
  createDefaultGroupsClusterServer,
  createDefaultScenesClusterServer,
} from '@project-chip/matter-node.js/cluster';

import { Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform } from '../../matterbridge/dist/index.js';
import { AnsiLogger, REVERSE, REVERSEOFF } from 'node-ansi-logger';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param matterbridge - An instance of MatterBridge
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger) {
  // Do nothing just load @project-chip/matter-node.js
  const storageJson = new StorageBackendJsonFile('matterbridge-example');
  const storageManager = new StorageManager(storageJson);
  const matterServer = new MatterServer(storageManager);

  log.info('Matterbridge dynamic platform plugin example is loading...');

  const platform = new ExampleMatterbridgeDynamicPlatform(matterbridge, log);

  log.info('Matterbridge dynamic platform plugin example initialized successfully!');
  return platform;
}

class ExampleMatterbridgeDynamicPlatform extends MatterbridgeDynamicPlatform {
  constructor(matterbridge: Matterbridge, log: AnsiLogger) {
    super(matterbridge, log);
    log.debug(`ExampleMatterbridgeDynamicPlatform loaded (matterbridge is running on node v${matterbridge.nodeVersion})`);
  }

  override onStartDynamicPlatform(): void {
    this.log.info(`onStartDynamicPlatform called (matterbridge is running on node v${this.matterbridge.nodeVersion})`);

    const matterDevice1 = new MatterbridgeDevice(DeviceTypes.WINDOW_COVERING);
    matterDevice1.createDefaultIdentifyClusterServer();
    matterDevice1.createDefaultGroupsClusterServer();
    matterDevice1.createDefaultScenesClusterServer();
    matterDevice1.createDefaultBridgedDeviceBasicInformationClusterServer('BridgedDevice1', 'BridgedDevice1 0x01020564', 0xfff1, 'Luligu', 'BridgedDevice1');
    matterDevice1.createDefaultPowerSourceRechargableBatteryClusterServer(86);
    matterDevice1.createDefaultWindowCoveringClusterServer();
    this.registerDevice(matterDevice1);

    matterDevice1.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
    });
    matterDevice1.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue } }) => {
      this.log.warn(`Command goToLiftPercentage called liftPercent100thsValue:${liftPercent100thsValue}`);
    });

    const matterDevice2 = new MatterbridgeDevice(DeviceTypes.ON_OFF_LIGHT);
    matterDevice2.createDefaultIdentifyClusterServer();
    matterDevice2.createDefaultGroupsClusterServer();
    matterDevice2.createDefaultScenesClusterServer();
    matterDevice2.createDefaultBridgedDeviceBasicInformationClusterServer('BridgedDevice2', 'BridgedDevice2 0x23023304', 0xfff1, 'Luligu', 'BridgedDevice2');
    matterDevice2.createDefaultPowerSourceReplaceableBatteryClusterServer(70);
    matterDevice2.createDefaultOnOffClusterServer();
    this.registerDevice(matterDevice2);

    matterDevice2.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
    });
    matterDevice2.addCommandHandler('on', async () => {
      this.log.warn('Command on called');
    });
    matterDevice2.addCommandHandler('off', async () => {
      this.log.warn('Command off called');
    });
  }

  override onShutdown(): void {
    this.log.info(`onShutdown called (matterbridge is running on node v${this.matterbridge.nodeVersion})`);
  }
}
