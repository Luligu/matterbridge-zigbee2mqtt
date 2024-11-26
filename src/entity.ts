/**
 * This file contains the classes ZigbeeEntity, ZigbeeDevice and ZigbeeGroup.
 *
 * @file entity.ts
 * @author Luca Liguori
 * @date 2023-12-29
 * @version 3.1.0
 *
 * Copyright 2023, 2024, 2025 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. *
 */

import {
  DeviceTypes,
  DeviceTypeDefinition,
  MatterbridgeDevice,
  airQualitySensor,
  colorTemperatureSwitch,
  dimmableSwitch,
  onOffSwitch,
  Identify,
  OnOff,
  LevelControl,
  ColorControl,
  ColorControlCluster,
  TemperatureMeasurement,
  BooleanState,
  RelativeHumidityMeasurement,
  PressureMeasurement,
  OccupancySensing,
  IlluminanceMeasurement,
  PowerSource,
  ClusterId,
  WindowCovering,
  DoorLock,
  BridgedDeviceBasicInformation,
  ThermostatCluster,
  Thermostat,
  Endpoint,
  AtLeastOne,
  getClusterNameById,
  powerSource,
  bridgedNode,
  AirQuality,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  FormaldehydeConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  electricalSensor,
  ElectricalEnergyMeasurement,
  ElectricalPowerMeasurement,
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  onOffOutlet,
  EndpointOptions,
  SwitchesTag,
  NumberTag,
  MatterbridgeEndpoint,
} from 'matterbridge';
import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, debugStringify, hk, zb, or, nf, LogLevel, CYAN, er } from 'matterbridge/logger';
import { deepCopy, deepEqual } from 'matterbridge/utils';
import * as color from 'matterbridge/utils';

import EventEmitter from 'events';
import { hostname } from 'os';

import { ZigbeePlatform } from './platform.js';
import { BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload, PayloadValue } from './payloadTypes.js';

export class ZigbeeEntity extends EventEmitter {
  public log: AnsiLogger;
  public serial = '';
  protected platform: ZigbeePlatform;
  public device: BridgeDevice | undefined;
  public group: BridgeGroup | undefined;
  public entityName = '';
  public isDevice = false;
  public isGroup = false;
  public actions: string[] = [];
  protected en = '';
  protected ien = '';
  public bridgedDevice: MatterbridgeDevice | undefined;
  public eidn = `${or}`;
  private lastPayload: Payload = {};
  private lastSeen = 0;
  protected ignoreFeatures: string[] = [];
  protected transition = false;
  protected propertyMap = new Map<string, { name: string; type: string; endpoint: string; values?: string; value_min?: number; value_max?: number; unit?: string; action?: string }>();

  colorTimeout: NodeJS.Timeout | undefined = undefined;
  thermostatTimeout: NodeJS.Timeout | undefined = undefined;

  protected hasEndpoints = false;
  public isRouter = false;
  protected noUpdate = false;

  /**
   * Creates a mutable device with the specified definition and includes the specified server list.
   *
   * @param {DeviceTypeDefinition | AtLeastOne<DeviceTypeDefinition>} definition - The device type definition.
   * @param {ClusterId[]} [includeServerList=[]] - The list of server clusters to include.
   * @param {EndpointOptions} [options] - Optional endpoint options.
   * @param {boolean} [debug] - Optional debug flag.
   * @returns {MatterbridgeDevice} The created mutable device.
   *
   * @remarks
   * This method creates a mutable device based on the provided definition. It adds the specified server clusters
   * to the device and configures the device with basic information and power source clusters. If the device is a
   * coordinator, it sets up the basic information cluster with coordinator-specific details. If the device is a
   * group, it sets up the basic information cluster with group-specific details. The method also configures the
   * power source cluster based on the device's power source.
   */
  createMutableDevice(definition: DeviceTypeDefinition | AtLeastOne<DeviceTypeDefinition>, includeServerList: ClusterId[] = [], options?: EndpointOptions, debug?: boolean): MatterbridgeDevice {
    if (this.platform.matterbridge.edge === true) {
      this.bridgedDevice = new MatterbridgeEndpoint(definition, options, debug) as unknown as MatterbridgeDevice;
    } else {
      this.bridgedDevice = new MatterbridgeDevice(definition, undefined, debug);
    }
    this.bridgedDevice.addClusterServerFromList(this.bridgedDevice, includeServerList);

    // Add bridgedNode device type and BridgedDeviceBasicInformation cluster
    this.bridgedDevice.addDeviceType(bridgedNode);
    if (this.isDevice && this.device && this.device.friendly_name === 'Coordinator') {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(this.device.friendly_name, this.serial, 0xfff1, 'zigbee2MQTT', 'Coordinator');
    } else if (this.isDevice && this.device) {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(this.device.friendly_name, this.serial, 0xfff1, this.device.definition ? this.device.definition.vendor : this.device.manufacturer, this.device.definition ? this.device.definition.model : this.device.model_id);
    } else if (this.isGroup && this.group) {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(this.group.friendly_name, this.serial, 0xfff1, 'zigbee2MQTT', 'Group');
    }

    // Add powerSource device type and PowerSource cluster
    this.bridgedDevice.addDeviceType(powerSource);
    if (this.isDevice) {
      if (this.device?.power_source === 'Battery') this.bridgedDevice.createDefaultPowerSourceReplaceableBatteryClusterServer(100, PowerSource.BatChargeLevel.Ok);
      else this.bridgedDevice.createDefaultPowerSourceWiredClusterServer();
    } else if (this.isGroup) {
      this.bridgedDevice.createDefaultPowerSourceWiredClusterServer();
    }
    return this.bridgedDevice;
  }

  /**
   * Configures the device by setting up the WindowCovering and DoorLock clusters if they are present.
   *
   * @returns {Promise<void>} A promise that resolves when the configuration is complete.
   *
   * @remarks
   * This method configures the device by checking for the presence of the WindowCovering and DoorLock clusters.
   * If the WindowCovering cluster is present, it sets the target as the current position and stops any ongoing
   * movement. If the DoorLock cluster is present, it retrieves the lock state and triggers the appropriate lock
   * operation event based on the current state.
   */
  async configure(): Promise<void> {
    if (this.bridgedDevice?.getClusterServerById(WindowCovering.Cluster.id)) {
      this.log.info(`Configuring ${this.bridgedDevice?.deviceName} WindowCovering cluster`);
      await this.bridgedDevice?.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.bridgedDevice?.getClusterServerById(DoorLock.Cluster.id)) {
      this.log.info(`Configuring ${this.bridgedDevice?.deviceName} DoorLock cluster`);
      // const state = this.bridgedDevice?.getClusterServerById(DoorLock.Cluster.id)?.getLockStateAttribute();
      const state = this.bridgedDevice?.getAttribute(DoorLock.Cluster.id, 'lockState', this.log);
      if (this.bridgedDevice.number) {
        if (state === DoorLock.LockState.Locked) this.bridgedDevice?.triggerEvent(DoorLock.Cluster.id, 'lockOperation', { lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null }, this.log);
        if (state === DoorLock.LockState.Unlocked) this.bridgedDevice?.triggerEvent(DoorLock.Cluster.id, 'lockOperation', { lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null }, this.log);
      }
    }
  }

  constructor(platform: ZigbeePlatform, entity: BridgeDevice | BridgeGroup) {
    super();
    this.platform = platform;
    if ((entity as BridgeDevice).ieee_address !== undefined) {
      this.device = entity as BridgeDevice;
      this.entityName = entity.friendly_name;
      this.isDevice = true;
      this.en = dn;
      this.ien = idn;
    }
    if ((entity as BridgeGroup).id !== undefined) {
      this.group = entity as BridgeGroup;
      this.entityName = entity.friendly_name;
      this.isGroup = true;
      this.en = gn;
      this.ien = ign;
    }
    this.log = new AnsiLogger({ logName: this.entityName, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: platform.debugEnabled ? LogLevel.DEBUG : LogLevel.INFO });
    this.log.debug(`Created MatterEntity: ${this.entityName}`);

    this.platform.z2m.on('MESSAGE-' + this.entityName, (payload: Payload) => {
      // Check if the message is a duplicate that can be ingored cause only linkquality and last_seen have changed (action is always passed)
      const now = Date.now();
      if (now - this.lastSeen < 1000 * 60 && deepEqual(this.lastPayload, payload, ['linkquality', 'last_seen', ...this.ignoreFeatures]) && !Object.prototype.hasOwnProperty.call(this.lastPayload, 'action')) {
        this.log.debug(`Skipping not changed ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.entityName}`);
        return;
      }
      this.lastSeen = Date.now();

      // Check and deep copy the payload
      if (deepEqual(this.lastPayload, payload, this.ignoreFeatures)) return;
      this.lastPayload = deepCopy(payload);
      if (Object.prototype.hasOwnProperty.call(this.lastPayload, 'action')) delete this.lastPayload.action;

      // Remove each key in ignoreFeatures from the payload copy
      for (const key of this.ignoreFeatures) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete payload[key];
          this.log.debug(`Removed key ${CYAN}${key}${db} from payload`);
        }
      }

      if (this.bridgedDevice === undefined) {
        this.log.debug(`Skipping (no device) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.entityName}`);
        return;
      }
      if (this.noUpdate) {
        this.log.debug(`Skipping (no update) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.entityName}`);
        return;
      }
      this.log.info(`${db}${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);

      // Parse the payload and update the accessory
      Object.entries(payload).forEach(([key, value]) => {
        // Skip null and undefined values
        if (value === undefined || value === null) return;
        if (this.bridgedDevice === undefined || this.noUpdate) return;

        // Modify voltage to battery_voltage
        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';

        // Modify illuminance and illuminance_lux
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'ZG-204ZL') {
          key = 'illuminance_lux';
          value = Math.pow(10, typeof value === 'number' ? value / 10000 : 0);
        }
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'RTCGQ14LM') {
          key = 'illuminance_lux';
        }
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'USM-300ZB') {
          key = 'illuminance_lux';
        }
        if (key === 'illuminance' && !('illuminance_lux' in payload)) {
          key = 'illuminance_lux';
        }

        // Lookup the property in the propertyMap and ZigbeeToMatter table
        const propertyMap = this.propertyMap.get(key);
        if (propertyMap) this.log.debug(`Payload entry ${CYAN}${key}${db} => name: ${CYAN}${propertyMap.name}${db} type: ${CYAN}${propertyMap.type === '' ? 'generic' : propertyMap.type}${db} ` + `endpoint: ${CYAN}${propertyMap.endpoint === '' ? 'main' : propertyMap.endpoint}${db}`);
        else this.log.debug(`*Payload entry ${CYAN}${key}${db} not found in propertyMap`);
        let z2m: ZigbeeToMatter | undefined;
        z2m = z2ms.find((z2m) => z2m.type === propertyMap?.type && z2m.property === propertyMap?.name);
        if (!z2m) z2m = z2ms.find((z2m) => z2m.property === propertyMap?.name);
        if (z2m) {
          if (z2m.converter || z2m.valueLookup) {
            this.updateAttributeIfChanged(this.bridgedDevice, propertyMap === undefined || propertyMap.endpoint === '' ? undefined : propertyMap.endpoint, z2m.cluster, z2m.attribute, z2m.converter ? z2m.converter(value) : value, z2m.valueLookup);
            return;
          }
        } else this.log.debug(`*Payload entry ${CYAN}${key}${db} not found in zigbeeToMatter converter table`);

        // Switch actions on the endpoints
        if (key === 'action' && value !== '') {
          const propertyMap = this.propertyMap.get(('action_' + value) as string);
          if (propertyMap) {
            // this.log.debug(`Payload entry ${CYAN}${value}${db} => name: ${CYAN}${propertyMap.name}${db} endpoint: ${CYAN}${propertyMap.endpoint}${db} action: ${CYAN}${propertyMap.action}${db}`);
            const child = this.bridgedDevice.getChildEndpointByName(propertyMap.endpoint);
            if (child && child.number) this.bridgedDevice.triggerSwitchEvent(propertyMap.action as 'Single' | 'Double' | 'Long', this.log, child);
          } else this.log.debug(`*Payload entry ${CYAN}${('action_' + value) as string}${db} not found in propertyMap`);
        }

        // WindowCovering
        if (key === 'state' && this.isGroup && this.bridgedDevice.hasClusterServer(WindowCovering.Complete)) {
          if (value === 'OPEN') {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', 0);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'targetPositionLiftPercent100ths', 0);
          }
          if (value === 'CLOSE') {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', 10000);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'targetPositionLiftPercent100ths', 10000);
          }
        }
        if (key === 'position') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', typeof value === 'number' ? 10000 - value * 100 : 0);
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'targetPositionLiftPercent100ths', typeof value === 'number' ? 10000 - value * 100 : 0);
        }
        if (key === 'moving') {
          const status = value === 'UP' ? WindowCovering.MovementStatus.Opening : value === 'DOWN' ? WindowCovering.MovementStatus.Closing : WindowCovering.MovementStatus.Stopped;
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'operationalStatus', { global: status, lift: status, tilt: status });
          if (value === 'STOP') {
            const position = this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.getCurrentPositionLiftPercent100thsAttribute();
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', position);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'targetPositionLiftPercent100ths', position);
          }
        }

        // ColorControl colorTemperatureMired and colorMode
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorTemperatureMireds', Math.max(147, Math.min(500, typeof value === 'number' ? value : 0)));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds);
        }

        // ColorControl currentHue, currentSaturation and colorMode
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'xy') {
          const { x, y } = value as { x: number; y: number };
          const hsl = color.xyToHsl(x, y);
          const rgb = color.xyColorToRgbColor(x, y);
          this.log.debug(`ColorControl xyToHsl ${CYAN}${x}${db} ${CYAN}${y}${db} => h ${CYAN}${hsl.h}${db} s ${CYAN}${hsl.s}${db} l ${CYAN}${hsl.l}${db}`);
          this.log.debug(`ColorControl xyToRgb ${CYAN}${x}${db} ${CYAN}${y}${db} => r ${CYAN}${rgb.r}${db} g ${CYAN}${rgb.g}${db} b ${CYAN}${rgb.b}${db}`);
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentHue', Math.round((hsl.h / 360) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentSaturation', Math.round((hsl.s / 100) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        }
      });
    });

    this.platform.z2m.on('ONLINE-' + this.entityName, () => {
      this.log.info(`ONLINE message for device ${this.ien}${this.entityName}${rs}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', true, this.log);
        this.bridgedDevice?.triggerEvent(BridgedDeviceBasicInformation.Cluster.id, 'reachableChanged', { reachableNewValue: true }, this.log);
      }
    });

    this.platform.z2m.on('OFFLINE-' + this.entityName, () => {
      this.log.warn(`OFFLINE message for device ${this.ien}${this.entityName}${rs}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', false, this.log);
        this.bridgedDevice?.triggerEvent(BridgedDeviceBasicInformation.Cluster.id, 'reachableChanged', { reachableNewValue: false }, this.log);
      }
    });
  }

  destroy() {
    if (this.colorTimeout) clearTimeout(this.colorTimeout);
    this.colorTimeout = undefined;
    if (this.thermostatTimeout) clearTimeout(this.thermostatTimeout);
    this.thermostatTimeout = undefined;
  }

  protected updateAttributeIfChanged(deviceEndpoint: Endpoint, childEndpointName: string | undefined, clusterId: number, attributeName: string, value: PayloadValue, lookup?: string[]): void {
    if (childEndpointName && childEndpointName !== '') {
      deviceEndpoint = this.bridgedDevice?.getChildEndpointByName(childEndpointName) ?? deviceEndpoint;
    }
    const cluster = deviceEndpoint.getClusterServerById(ClusterId(clusterId));
    if (cluster === undefined) {
      this.log.debug(
        `*Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} cluster ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db} not found: is z2m converter exposing all features?`,
      );
      return;
    }
    if (!cluster.isAttributeSupportedByName(attributeName)) {
      this.log.debug(
        `***Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} error attribute ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} not found`,
      );
      return;
    }
    if (lookup !== undefined) {
      if (typeof value === 'string' && lookup.indexOf(value) !== -1) {
        value = lookup.indexOf(value);
      } else {
        this.log.debug(
          `***Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} ` +
            `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} value ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db} not found in lookup ${debugStringify(lookup)}`,
        );
        return;
      }
    }
    // const localValue = cluster.attributes[attributeName].getLocal();
    const localValue = this.bridgedDevice?.getAttribute(ClusterId(clusterId), attributeName, undefined, deviceEndpoint);
    if (typeof value === 'object' ? deepEqual(value, localValue) : value === localValue) {
      this.log.debug(
        `*Skip update endpoint ${this.eidn}${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} ` +
          `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} already ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
      );
      return;
    }
    this.log.info(
      `${db}Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} ` +
        `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} from ${zb}${typeof localValue === 'object' ? debugStringify(localValue) : localValue}${db} to ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
    );
    try {
      // cluster.attributes[attributeName].setLocal(value);
      this.bridgedDevice?.setAttribute(ClusterId(clusterId), attributeName, value, undefined, deviceEndpoint);
    } catch (error) {
      this.log.error(`Error setting attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${er}.${hk}${attributeName}${er} to ${value}: ${error}`);
    }
  }

  protected publishCommand(command: string, entityName: string, payload: Payload) {
    this.log.debug(`executeCommand ${command} called for ${this.ien}${entityName}${rs}${db} payload: ${debugStringify(payload)}`);
    if (entityName.startsWith('bridge/request')) {
      this.platform.publish(entityName, '', JSON.stringify(payload));
    } else {
      this.platform.publish(entityName, 'set', JSON.stringify(payload));
    }
  }
}

export class ZigbeeGroup extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);

    if (this.platform.postfixHostname) {
      this.serial = `group-${group.id}_${hostname}`.slice(0, 32);
    } else {
      this.serial = `group-${group.id}`.slice(0, 32);
    }

    let useState = false;
    let useBrightness = false;
    let useColor = false;
    let useColorTemperature = false;
    let minColorTemperature = 140;
    let maxColorTemperature = 500;
    let isSwitch = false;
    let isLight = false;
    let isCover = false;
    let isThermostat = false;
    if (group.members.length === 0) {
      // Create a virtual device for the empty group to use in automations
      this.log.debug(`Group: ${gn}${group.friendly_name}${rs}${db} is a ${CYAN}virtual${db} group`);
      this.bridgedDevice = this.createMutableDevice([onOffSwitch], [...onOffSwitch.requiredServerClusters], { uniqueStorageKey: group.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
      isSwitch = true;
      this.propertyMap.set('state', { name: 'state', type: 'switch', endpoint: '' });
    } else {
      // Create a switch or light or outlet device for the group
      group.members.forEach((member) => {
        // const device = this.platform.z2m.getDevice(member.ieee_address);
        const device = this.platform.z2mBridgeDevices?.find((device) => device.ieee_address === member.ieee_address);
        if (!device) return;
        this.log.debug(`Group ${gn}${group.friendly_name}${db}: member device ${dn}${device.friendly_name}${db}`);
        device.definition?.exposes.forEach((expose) => {
          if (expose.features) {
            // Specific features with type
            expose.features?.forEach((feature) => {
              if (expose.type === 'lock' && feature.name === 'state' && feature.property === 'child_lock') {
                expose.type = 'child_lock';
                feature.name = 'child_lock';
              }
              this.log.debug(
                `- specific type ${CYAN}${expose.type}${db}${feature.endpoint ? ' endpoint ' + CYAN + feature.endpoint + db : ''}${db} feature name ${CYAN}${feature.name}${db} property ${CYAN}${feature.property}${db} min ${CYAN}${feature.value_min}${db} max ${CYAN}${feature.value_max}${db}`,
              );
              if (expose.type === 'switch' || expose.type === 'light') {
                if (expose.type === 'switch') isSwitch = true;
                if (expose.type === 'light') isLight = true;
                useState = useState === true || feature.name === 'state' ? true : false;
                useBrightness = useBrightness === true || feature.name === 'brightness' ? true : false;
                useColor = useColor === true || feature.property === 'color' ? true : false;
                useColorTemperature = useColorTemperature === true || feature.name === 'color_temp' ? true : false;
                if (feature.value_min) minColorTemperature = Math.min(minColorTemperature, feature.value_min);
                if (feature.value_max) maxColorTemperature = Math.max(maxColorTemperature, feature.value_max);
              } else if (expose.type === 'cover') {
                isCover = true;
              } else if (expose.type === 'climate') {
                isThermostat = true;
              }
            });
          } else {
            // Generic features without type
            this.log.debug(`- generic type ${CYAN}${expose.type}${db} expose name ${CYAN}${expose.name}${db} property ${CYAN}${expose.property}${db}`);
          }
        });
      });
      this.log.debug(`Group ${gn}${group.friendly_name}${rs}${db} switch: ${CYAN}${isSwitch}${db} light: ${CYAN}${isLight}${db} cover: ${CYAN}${isCover}${db} thermostat: ${CYAN}${isThermostat}${db}`);
      this.log.debug(`Group ${gn}${group.friendly_name}${rs}${db} state: ${CYAN}${useState}${db} brightness: ${CYAN}${useBrightness}${db} color: ${CYAN}${useColor}${db} color_temp: ${CYAN}${useColorTemperature}${db} min: ${CYAN}${minColorTemperature}${db} max: ${CYAN}${maxColorTemperature}${db}`);
      let deviceType: DeviceTypeDefinition | undefined;
      if (useState) {
        deviceType = onOffLight;
        if (platform.switchList.includes(group.friendly_name)) deviceType = onOffSwitch;
        else if (platform.lightList.includes(group.friendly_name)) deviceType = onOffLight;
        else if (platform.outletList.includes(group.friendly_name)) deviceType = onOffOutlet;
        this.propertyMap.set('state', { name: 'state', type: isLight ? 'light' : 'switch', endpoint: '' });
      }
      if (useBrightness) {
        deviceType = dimmableLight;
        this.propertyMap.set('brightness', { name: 'brightness', type: 'light', endpoint: '' });
      }
      if (useColorTemperature) {
        deviceType = colorTemperatureLight;
        this.propertyMap.set('color_temp', { name: 'color_temp', type: 'light', endpoint: '' });
      }
      if (useColor) {
        deviceType = colorTemperatureLight;
        this.propertyMap.set('color', { name: 'color', type: 'light', endpoint: '' });
      }
      if (isCover) {
        deviceType = DeviceTypes.WINDOW_COVERING;
        this.propertyMap.set('state', { name: 'state', type: 'cover', endpoint: '' });
        this.propertyMap.set('position', { name: 'position', type: 'cover', endpoint: '' });
        this.propertyMap.set('moving', { name: 'moving', type: 'cover', endpoint: '' });
      }
      if (isThermostat) {
        deviceType = DeviceTypes.THERMOSTAT;
        this.propertyMap.set('local_temperature', { name: 'local_temperature', type: 'climate', endpoint: '' });
        this.propertyMap.set('current_heating_setpoint', { name: 'current_heating_setpoint', type: 'climate', endpoint: '' });
        this.propertyMap.set('current_cooling_setpoint', { name: 'current_cooling_setpoint', type: 'climate', endpoint: '' });
        this.propertyMap.set('running_state', { name: 'running_state', type: 'climate', endpoint: '' });
        this.propertyMap.set('system_mode', { name: 'system_mode', type: 'climate', endpoint: '' });
      }
      if (!deviceType) return;
      this.bridgedDevice = this.createMutableDevice([deviceType], [...deviceType.requiredServerClusters], { uniqueStorageKey: group.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
    }
    if (!this.bridgedDevice) return;

    // Properties
    this.propertyMap.forEach((value, key) => {
      this.log.debug(`Property ${CYAN}${key}${db} name ${CYAN}${value.name}${db} type ${CYAN}${value.type}${db} endpoint ${CYAN}${value.endpoint === '' ? 'main' : value.endpoint}${db}`);
    });

    // Command handlers
    if (isSwitch || isLight) {
      this.bridgedDevice.addFixedLabel('type', 'switch');
      this.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
        this.log.warn(`Command identify called for ${this.ien}${group.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
        // logEndpoint(this.bridgedDevice!);
      });
      this.bridgedDevice.addCommandHandler('on', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command on called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('on', group.friendly_name, { state: 'ON' });
      });
      this.bridgedDevice.addCommandHandler('off', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command off called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('off', group.friendly_name, { state: 'OFF' });
      });
      this.bridgedDevice.addCommandHandler('toggle', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command toggle called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('toggle', group.friendly_name, { state: 'TOGGLE' });
      });
    }
    if (isLight) {
      this.bridgedDevice.addFixedLabel('type', 'light');
      if (this.bridgedDevice.hasClusterServer(LevelControl.Complete)) {
        this.bridgedDevice.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
          this.log.debug(`Command moveToLevel called for ${this.ien}${group.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
          this.publishCommand('moveToLevel', group.friendly_name, { brightness: level });
        });
        this.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
          this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${group.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
          this.publishCommand('moveToLevelWithOnOff', group.friendly_name, { brightness: level });
        });
      }
      if (this.bridgedDevice.hasClusterServer(ColorControl.Complete) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('colorTemperatureMireds')) {
        this.bridgedDevice.addCommandHandler('moveToColorTemperature', async ({ request: request, attributes: attributes }) => {
          this.log.debug(`Command moveToColorTemperature called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
          this.log.debug(`Command moveToColorTemperature called for ${this.ien}${group.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
          attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
          this.publishCommand('moveToColorTemperature', group.friendly_name, { color_temp: request.colorTemperatureMireds });
        });
      }
      if (this.bridgedDevice.hasClusterServer(ColorControl.Complete) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('currentHue')) {
        let lastRequestedHue = 0;
        let lastRequestedSaturation = 0;
        this.bridgedDevice.addCommandHandler('moveToHue', async ({ request: request, attributes: attributes }) => {
          this.log.debug(`Command moveToHue called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.hue} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
          attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          lastRequestedHue = request.hue;
          this.colorTimeout = setTimeout(() => {
            clearTimeout(this.colorTimeout);
            const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (lastRequestedSaturation / 254) * 100, 50);
            this.publishCommand('moveToHue', group.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
          }, 500);
        });
        this.bridgedDevice.addCommandHandler('moveToSaturation', async ({ request: request, attributes: attributes }) => {
          this.log.debug(`Command moveToSaturation called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
          attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          lastRequestedSaturation = request.saturation;
          this.colorTimeout = setTimeout(() => {
            clearTimeout(this.colorTimeout);
            const rgb = color.hslColorToRgbColor((lastRequestedHue / 254) * 360, (request.saturation / 254) * 100, 50);
            this.publishCommand('moveToSaturation', group.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
          }, 500);
        });
        this.bridgedDevice.addCommandHandler('moveToHueAndSaturation', async ({ request: request, attributes: attributes }) => {
          this.log.debug(
            `Command moveToHueAndSaturation called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.hue}-${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`,
          );
          attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (request.saturation / 254) * 100, 50);
          this.publishCommand('moveToHueAndSaturation', group.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
        });
      }
    }
    if (isCover) {
      this.bridgedDevice.addFixedLabel('type', 'cover');
      this.bridgedDevice.addCommandHandler('upOrOpen', async (data) => {
        this.log.debug(`Command upOrOpen called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(0);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(0);
        this.publishCommand('upOrOpen', group.friendly_name, { state: 'OPEN' });
      });
      this.bridgedDevice.addCommandHandler('downOrClose', async (data) => {
        this.log.debug(`Command downOrClose called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(10000);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(10000);
        this.publishCommand('downOrClose', group.friendly_name, { state: 'CLOSE' });
      });
      this.bridgedDevice.addCommandHandler('stopMotion', async (data) => {
        this.log.debug(`Command stopMotion called for ${this.ien}${group.friendly_name}${rs}${db} attribute: ${data.attributes.operationalStatus?.getLocal()}`);
        const liftPercent100thsValue = data.attributes.currentPositionLiftPercent100ths?.getLocal();
        if (liftPercent100thsValue) {
          data.attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
          data.attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        }
        data.attributes.operationalStatus?.setLocal({ global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: WindowCovering.MovementStatus.Stopped });
        this.publishCommand('stopMotion', group.friendly_name, { state: 'STOP' });
      });
      this.bridgedDevice.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue }, attributes }) => {
        this.log.debug(`Command goToLiftPercentage called for ${this.ien}${group.friendly_name}${rs}${db} liftPercent100thsValue: ${liftPercent100thsValue}`);
        this.log.debug(`Command goToLiftPercentage current: ${attributes.currentPositionLiftPercent100ths?.getLocal()} target: ${attributes.targetPositionLiftPercent100ths?.getLocal()}`);
        attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        this.publishCommand('goToLiftPercentage', group.friendly_name, { position: 100 - liftPercent100thsValue / 100 });
      });
    }
    if (isThermostat) {
      this.bridgedDevice.addFixedLabel('type', 'climate');
      this.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'systemMode',
        (newValue, oldValue) => {
          this.bridgedDevice?.log.info(`Thermostat systemMode changed from ${oldValue} to ${newValue}`);
          if (oldValue !== newValue) {
            // Thermostat.SystemMode.Heat && newValue === Thermostat.SystemMode.Off
            this.bridgedDevice?.log.info(`Setting thermostat systemMode to ${newValue}`);
            if (newValue === Thermostat.SystemMode.Off) {
              this.publishCommand('SystemMode', group.friendly_name, { system_mode: 'off' });
            } else if (newValue === Thermostat.SystemMode.Heat) {
              this.publishCommand('SystemMode', group.friendly_name, { system_mode: 'heat' });
            } else if (newValue === Thermostat.SystemMode.Cool) {
              this.publishCommand('SystemMode', group.friendly_name, { system_mode: 'cool' });
            }
            this.noUpdate = true;
            this.thermostatTimeout = setTimeout(() => {
              this.noUpdate = false;
            }, 2 * 1000);
          }
        },
        this.bridgedDevice.log,
        this.bridgedDevice,
      );
      this.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'occupiedHeatingSetpoint',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newValue: any, oldValue: any) => {
          this.bridgedDevice?.log.info(`Thermostat occupiedHeatingSetpoint changed from ${oldValue / 100} to ${newValue / 100}`);
          this.bridgedDevice?.log.info(`Setting thermostat occupiedHeatingSetpoint to ${newValue / 100}`);
          this.publishCommand('OccupiedHeatingSetpoint', group.friendly_name, { current_heating_setpoint: Math.round(newValue / 100) });
          this.noUpdate = true;
          this.thermostatTimeout = setTimeout(() => {
            this.noUpdate = false;
          }, 2 * 1000);
        },
        this.bridgedDevice.log,
        this.bridgedDevice,
      );
      this.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'occupiedCoolingSetpoint',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newValue: any, oldValue: any) => {
          this.bridgedDevice?.log.info(`Thermostat occupiedCoolingSetpoint changed from ${oldValue / 100} to ${newValue / 100}`);
          this.bridgedDevice?.log.info(`Setting thermostat occupiedCoolingSetpoint to ${newValue / 100}`);
          this.publishCommand('OccupiedCoolingSetpoint', group.friendly_name, { current_cooling_setpoint: Math.round(newValue / 100) });
          this.noUpdate = true;
          this.thermostatTimeout = setTimeout(() => {
            this.noUpdate = false;
          }, 2 * 1000);
        },
        this.bridgedDevice.log,
        this.bridgedDevice,
      );
    }
  }
}

export interface ZigbeeToMatter {
  type: string;
  name: string;
  property: string;
  deviceType: DeviceTypeDefinition;
  cluster: number;
  attribute: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  converter?: (value: any) => any;
  valueLookup?: string[];
}

// prettier-ignore
export const z2ms: ZigbeeToMatter[] = [
  { type: 'switch', name: 'state', property: 'state', deviceType: onOffSwitch, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'switch', name: 'brightness', property: 'brightness', deviceType: dimmableSwitch, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'switch', name: 'color_hs', property: 'color_hs', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'switch', name: 'color_xy', property: 'color_xy', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'switch', name: 'color_temp', property: 'color_temp', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'outlet', name: 'state', property: 'state', deviceType: DeviceTypes.ON_OFF_PLUGIN_UNIT, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'outlet', name: 'brightness', property: 'brightness', deviceType: DeviceTypes.DIMMABLE_PLUGIN_UNIT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light', name: 'state', property: 'state', deviceType: DeviceTypes.ON_OFF_LIGHT, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'light', name: 'brightness', property: 'brightness', deviceType: DeviceTypes.DIMMABLE_LIGHT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light', name: 'color_hs', property: 'color_hs', deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'light', name: 'color_xy', property: 'color_xy', deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'light', name: 'color_temp', property: 'color_temp', deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'cover', name: 'state', property: 'state', deviceType: DeviceTypes.WINDOW_COVERING, cluster: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths' },
  { type: 'lock', name: 'state', property: 'state', deviceType: DeviceTypes.DOOR_LOCK, cluster: DoorLock.Cluster.id, attribute: 'lockState', converter: (value) => { return value === 'LOCK' ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked } },
  { type: 'climate', name: 'local_temperature', property: 'local_temperature', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'current_heating_setpoint', property: 'current_heating_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'current_cooling_setpoint', property: 'current_cooling_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'occupied_heating_setpoint', property: 'occupied_heating_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'occupied_cooling_setpoint', property: 'occupied_cooling_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'running_state', property: 'running_state', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'thermostatRunningMode', valueLookup: ['idle', '', '', 'cool', 'heat'] },
  { type: 'climate', name: 'system_mode', property: 'system_mode', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'systemMode', valueLookup: ['off', 'auto', '', 'cool', 'heat'] },
  { type: '', name: 'min_temperature_limit', property: 'min_temperature_limit', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'minHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'max_temperature_limit', property: 'max_temperature_limit', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'maxHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'min_heat_setpoint_limit', property: 'min_heat_setpoint_limit', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'minHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'max_heat_setpoint_limit', property: 'max_heat_setpoint_limit', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'maxHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },

  { type: '', name: 'presence', property: 'presence', deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '', name: 'occupancy', property: 'occupancy', deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '', name: 'illuminance', property: 'illuminance', deviceType: DeviceTypes.LIGHT_SENSOR, cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue' },
  { type: '', name: 'illuminance_lux', property: 'illuminance_lux', deviceType: DeviceTypes.LIGHT_SENSOR, cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) } },
  { type: '', name: 'contact', property: 'contact', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '', name: 'water_leak', property: 'water_leak', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'vibration', property: 'vibration', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'smoke', property: 'smoke', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'carbon_monoxide', property: 'carbon_monoxide', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'temperature', property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'humidity', property: 'humidity', deviceType: DeviceTypes.HUMIDITY_SENSOR, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'soil_moisture', property: 'soil_moisture', deviceType: DeviceTypes.HUMIDITY_SENSOR, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'pressure', property: 'pressure', deviceType: DeviceTypes.PRESSURE_SENSOR, cluster: PressureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return value } },
  { type: '', name: 'air_quality', property: 'air_quality', deviceType: airQualitySensor, cluster: AirQuality.Cluster.id, attribute: 'airQuality', valueLookup: ['unknown', 'excellent', 'good', 'moderate', 'poor', 'unhealthy', 'out_of_range'] },
  { type: '', name: 'voc', property: 'voc', deviceType: airQualitySensor, cluster: TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.min(65535, value) } },
  { type: '', name: 'co', property: 'co', deviceType: airQualitySensor, cluster: CarbonMonoxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'co2', property: 'co2', deviceType: airQualitySensor, cluster: CarbonDioxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'formaldehyd', property: 'formaldehyd', deviceType: airQualitySensor, cluster: FormaldehydeConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm1', property: 'pm1', deviceType: airQualitySensor, cluster: Pm1ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm25', property: 'pm25', deviceType: airQualitySensor, cluster: Pm25ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm10', property: 'pm10', deviceType: airQualitySensor, cluster: Pm10ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'cpu_temperature', property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'device_temperature', property: 'device_temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: '', property: 'battery', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batPercentRemaining', converter: (value) => { return Math.round(value * 2) } },
  { type: '', name: '', property: 'battery_low', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batChargeLevel', converter: (value) => { return value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok } },
  { type: '', name: '', property: 'battery_voltage', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batVoltage', converter: (value) => { return value } },
  { type: '', name: 'energy', property: 'energy', deviceType: electricalSensor, cluster: ElectricalEnergyMeasurement.Cluster.id, attribute: 'cumulativeEnergyImported', converter: (value) => { return { energy: value * 1000000 } } },
  { type: '', name: 'power', property: 'power', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'activePower', converter: (value) => { return value * 1000 } },
  { type: '', name: 'voltage', property: 'voltage', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'voltage', converter: (value) => { return value * 1000 } },
  { type: '', name: 'current', property: 'current', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'activeCurrent', converter: (value) => { return value * 1000 } },
];

export class ZigbeeDevice extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, device: BridgeDevice) {
    super(platform, device);

    this.serial = `${device.ieee_address}`;
    if (this.platform.postfixHostname) {
      this.serial = `${this.serial}_${hostname}`.slice(0, 32);
    }

    if (device.friendly_name === 'Coordinator' || (device.model_id === 'ti.router' && device.manufacturer === 'TexasInstruments') || (device.model_id.startsWith('SLZB-') && device.manufacturer === 'SMLIGHT')) {
      this.bridgedDevice = this.createMutableDevice([DeviceTypes.DOOR_LOCK], [Identify.Cluster.id, DoorLock.Cluster.id], { uniqueStorageKey: device.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
      this.bridgedDevice.addFixedLabel('type', 'lock');
      this.isRouter = true;
    }

    // Get types and properties
    const types: string[] = [];
    const endpoints: string[] = [];
    const names: string[] = [];
    const properties: string[] = [];
    const units: string[] = [];
    const value_mins: number[] = [];
    const value_maxs: number[] = [];
    const values: string[] = [];
    device.definition?.exposes.forEach((expose) => {
      if (expose.features) {
        // Specific features with type
        expose.features?.forEach((feature) => {
          if (expose.type === 'lock' && feature.name === 'state' && feature.property === 'child_lock') feature.name = 'child_lock';
          types.push(expose.type);
          endpoints.push(expose.endpoint || '');
          names.push(feature.name);
          properties.push(feature.property);
          units.push(feature.unit ?? '');
          value_mins.push(feature.value_min ?? NaN);
          value_maxs.push(feature.value_max ?? NaN);
          values.push(feature.values ? feature.values.join('|') : '');
        });
      } else {
        // Generic features without type
        types.push('');
        endpoints.push(expose.endpoint || '');
        if (device.power_source === 'Battery' && expose.name === 'voltage') expose.name = 'battery_voltage';
        if (device.power_source === 'Battery' && expose.property === 'voltage') expose.property = 'battery_voltage';
        names.push(expose.name || '');
        properties.push(expose.property);
        units.push(expose.unit ?? '');
        value_mins.push(expose.value_min ?? NaN);
        value_maxs.push(expose.value_max ?? NaN);
        values.push(expose.values ? expose.values.join('|') : '');
        if (expose.name === 'action' && expose.values) {
          this.actions.push(...expose.values);
        }
      }
    });
    device.definition?.options.forEach((option) => {
      types.push('');
      names.push(option.name || '');
      properties.push(option.property);
      units.push(option.unit ?? '');
      value_mins.push(option.value_min ?? NaN);
      value_maxs.push(option.value_max ?? NaN);
      values.push(option.values ? option.values.join('|') : '');
      endpoints.push(option.endpoint || '');
    });
    if (platform.switchList.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'light' ? 'switch' : type;
      });
    }
    if (platform.lightList.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'light' : type;
      });
    }
    if (platform.outletList.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'switch' || type === 'light' ? 'outlet' : type;
      });
    }

    if (platform.featureBlackList) this.ignoreFeatures = [...this.ignoreFeatures, ...platform.featureBlackList];
    if (platform.deviceFeatureBlackList[device.friendly_name]) this.ignoreFeatures = [...this.ignoreFeatures, ...platform.deviceFeatureBlackList[device.friendly_name]];

    /*
    this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} - types[${types.length}]: ${debugStringify(types)}`);
    this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} - endpoints[${endpoints.length}]: ${debugStringify(endpoints)}`);
    this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} - names[${names.length}]: ${debugStringify(names)}`);
    this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} - properties[${properties.length}]: ${debugStringify(properties)}`);
    this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} - units[${units.length}]: ${debugStringify(units)}`);
    */

    names.forEach((name, index) => {
      if (platform.featureBlackList.includes(name)) {
        this.log.debug(`Device ${this.en}${device.friendly_name}${db} feature ${name} is globally blacklisted`);
        return;
      }
      if (platform.deviceFeatureBlackList[device.friendly_name]?.includes(name)) {
        this.log.debug(`Device ${this.en}${device.friendly_name}${db} feature ${name} is blacklisted`);
        return;
      }
      if (name === 'transition') {
        this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} transition is supported`);
        this.transition = true;
      }
      const type = types[index];
      const endpoint = endpoints[index];
      const property = properties[index];
      const unit = units[index];
      const value_min = value_mins[index];
      const value_max = value_maxs[index];
      const value = values[index];
      const z2m = z2ms.find((z2m) => z2m.type === type && z2m.name === name);
      if (z2m) {
        this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => deviceType: ${z2m.deviceType?.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`);
        this.propertyMap.set(property, { name, type, endpoint, value_min, value_max, values: value, unit });
        if (endpoint === '') {
          if (!this.bridgedDevice) this.bridgedDevice = this.createMutableDevice([z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)], { uniqueStorageKey: device.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
          else this.bridgedDevice.addDeviceTypeWithClusterServer([z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)]);
        } else {
          if (!this.bridgedDevice) this.bridgedDevice = this.createMutableDevice([bridgedNode], undefined, { uniqueStorageKey: device.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
          const child = this.bridgedDevice.addChildDeviceTypeWithClusterServer(endpoint, [z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)], undefined, this.log.logLevel === LogLevel.DEBUG);
          if (endpoint === 'l1') this.bridgedDevice.addTagList(child, null, NumberTag.One.namespaceId, NumberTag.One.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l2') this.bridgedDevice.addTagList(child, null, NumberTag.Two.namespaceId, NumberTag.Two.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l3') this.bridgedDevice.addTagList(child, null, NumberTag.Three.namespaceId, NumberTag.Three.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l4') this.bridgedDevice.addTagList(child, null, NumberTag.Four.namespaceId, NumberTag.Four.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l5') this.bridgedDevice.addTagList(child, null, NumberTag.Five.namespaceId, NumberTag.Five.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l6') this.bridgedDevice.addTagList(child, null, NumberTag.Six.namespaceId, NumberTag.Six.tag, 'endpoint ' + endpoint);
          /* 
          if (endpoint === 'l1') this.addTagList(child, null, NumberTag.One.namespaceId, NumberTag.One.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l1') this.addTagList(child, null, SwitchesTag.Custom.namespaceId, SwitchesTag.Custom.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l2') this.addTagList(child, null, NumberTag.Two.namespaceId, NumberTag.Two.tag, 'endpoint ' + endpoint);
          if (endpoint === 'l2') this.addTagList(child, null, SwitchesTag.Custom.namespaceId, SwitchesTag.Custom.tag, 'endpoint ' + endpoint);
          */
          this.bridgedDevice.addFixedLabel('composed', type);
          this.hasEndpoints = true;
        }
      } else {
        // this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => no mapping found`);
      }

      // Map actions to switches
      if (name === 'action' && this.actions.length) {
        this.log.info(`Device ${this.ien}${device.friendly_name}${rs}${nf} has actions mapped to these switches on sub endpoints:`);
        this.log.info('   controller events      <=> zigbee2mqtt actions');
        if (!this.bridgedDevice) this.bridgedDevice = this.createMutableDevice([bridgedNode], undefined, { uniqueStorageKey: device.friendly_name }, this.log.logLevel === LogLevel.DEBUG);
        this.hasEndpoints = true;
        // Mapping actions
        const switchMap = ['Single Press', 'Double Press', 'Long Press  '];
        const triggerMap = ['Single', 'Double', 'Long'];
        let count = 1;
        if (this.actions.length <= 3) {
          const actionsMap: string[] = [];
          for (let a = 0; a < this.actions.length; a++) {
            actionsMap.push(this.actions[a]);
            this.propertyMap.set('action_' + actionsMap[a], { name, type: '', endpoint: 'switch_' + count, action: triggerMap[a] });
            this.log.info(`-- Button ${count}: ${hk}${switchMap[a]}${nf} <=> ${zb}${actionsMap[a]}${nf}`);
          }
          const button = this.bridgedDevice.addChildDeviceTypeWithClusterServer('switch_' + count, [DeviceTypes.GENERIC_SWITCH], [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters], undefined, this.log.logLevel === LogLevel.DEBUG);
          this.bridgedDevice.addTagList(button, null, SwitchesTag.Custom.namespaceId, SwitchesTag.Custom.tag, 'switch_' + count);
        } else {
          for (let i = 0; i < this.actions.length; i += 3) {
            const actionsMap: string[] = [];
            for (let a = i; a < i + 3 && a < this.actions.length; a++) {
              actionsMap.push(this.actions[a]);
              this.propertyMap.set('action_' + actionsMap[a - i], { name, type: '', endpoint: 'switch_' + count, action: triggerMap[a - i] });
              this.log.info(`-- Button ${count}: ${hk}${switchMap[a - i]}${nf} <=> ${zb}${actionsMap[a - i]}${nf}`);
            }
            const button = this.bridgedDevice.addChildDeviceTypeWithClusterServer('switch_' + count, [DeviceTypes.GENERIC_SWITCH], [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters], undefined, this.log.logLevel === LogLevel.DEBUG);
            this.bridgedDevice.addTagList(button, null, SwitchesTag.Custom.namespaceId, SwitchesTag.Custom.tag, 'switch_' + count);
            count++;
          }
        }
        this.bridgedDevice.addFixedLabel('composed', 'button');
      }
    });

    // Add battery properties
    if (device.power_source === 'Battery') {
      this.propertyMap.set('battery', { name: 'battery', type: '', endpoint: '' });
      this.propertyMap.set('battery_low', { name: 'battery_low', type: '', endpoint: '' });
      this.propertyMap.set('battery_voltage', { name: 'battery_voltage', type: '', endpoint: '' });
    }

    // Add illuminance_lux
    if (this.propertyMap.has('illuminance') && !this.propertyMap.has('illuminance_lux')) {
      this.propertyMap.set('illuminance_lux', { name: 'illuminance_lux', type: '', endpoint: '' });
    }

    // Remove superset device Types
    if (this.bridgedDevice) {
      const deviceTypes = this.bridgedDevice.getDeviceTypes();
      const deviceTypesMap = new Map<number, DeviceTypeDefinition>();
      deviceTypes.forEach((deviceType) => {
        deviceTypesMap.set(deviceType.code, deviceType);
      });
      if (deviceTypesMap.has(DeviceTypes.ON_OFF_LIGHT.code) && deviceTypesMap.has(DeviceTypes.DIMMABLE_LIGHT.code)) {
        deviceTypesMap.delete(DeviceTypes.ON_OFF_LIGHT.code);
        this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} removing ON_OFF_LIGHT`);
      }
      if (deviceTypesMap.has(DeviceTypes.DIMMABLE_LIGHT.code) && deviceTypesMap.has(DeviceTypes.COLOR_TEMPERATURE_LIGHT.code)) {
        deviceTypesMap.delete(DeviceTypes.DIMMABLE_LIGHT.code);
        this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} removing DIMMABLE_LIGHT`);
      }
      this.bridgedDevice.setDeviceTypes(Array.from(deviceTypesMap.values()).sort((a, b) => b.code - a.code) as AtLeastOne<DeviceTypeDefinition>);

      const childEndpoints = this.bridgedDevice.getChildEndpoints();
      childEndpoints.forEach((childEndpoint) => {
        const deviceTypes = childEndpoint.getDeviceTypes();
        const deviceTypesMap = new Map<number, DeviceTypeDefinition>();
        deviceTypes.forEach((deviceType) => {
          deviceTypesMap.set(deviceType.code, deviceType);
        });
        if (deviceTypesMap.has(DeviceTypes.ON_OFF_LIGHT.code) && deviceTypesMap.has(DeviceTypes.DIMMABLE_LIGHT.code)) {
          deviceTypesMap.delete(DeviceTypes.ON_OFF_LIGHT.code);
          this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} removing ON_OFF_LIGHT`);
        }
        if (deviceTypesMap.has(DeviceTypes.DIMMABLE_LIGHT.code) && deviceTypesMap.has(DeviceTypes.COLOR_TEMPERATURE_LIGHT.code)) {
          deviceTypesMap.delete(DeviceTypes.DIMMABLE_LIGHT.code);
          this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} removing DIMMABLE_LIGHT`);
        }
        childEndpoint.setDeviceTypes(Array.from(deviceTypesMap.values()).sort((a, b) => b.code - a.code) as AtLeastOne<DeviceTypeDefinition>);
      });
    }

    // Configure ColorControlCluster
    if (this.bridgedDevice && this.bridgedDevice.hasClusterServer(ColorControl.Complete)) {
      this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} ColorControlCluster cluster with HS: ${names.includes('color_hs')} XY: ${names.includes('color_xy')} CT: ${names.includes('color_temp')}`);
      this.bridgedDevice.configureColorControlCluster(names.includes('color_hs') || names.includes('color_xy'), false, names.includes('color_temp'));
    }

    // Configure ThermostatCluster
    if (this.bridgedDevice && this.bridgedDevice.hasClusterServer(Thermostat.Complete)) {
      const heat = this.propertyMap.get('occupied_heating_setpoint') || this.propertyMap.get('current_heating_setpoint');
      const cool = this.propertyMap.get('occupied_cooling_setpoint') || this.propertyMap.get('current_cooling_setpoint');
      const minHeating = heat && heat.value_min !== undefined && !isNaN(heat.value_min) ? heat.value_min : 0;
      const maxHeating = heat && heat.value_max !== undefined && !isNaN(heat.value_max) ? heat.value_max : 50;
      const minCooling = cool && cool.value_min !== undefined && !isNaN(cool.value_min) ? cool.value_min : 0;
      const maxCooling = cool && cool.value_max !== undefined && !isNaN(cool.value_max) ? cool.value_max : 50;
      this.log.debug(
        `Configuring device ${this.ien}${device.friendly_name}${rs}${db} Thermostat cluster with heating ${CYAN}${heat ? 'supported' : 'not supported'}${db} cooling ${CYAN}${cool ? 'supported' : 'not supported'}${db} ` +
          `minHeating ${CYAN}${minHeating}${db} maxHeating ${CYAN}${maxHeating}${db} minCooling ${CYAN}${minCooling}${db} maxCooling ${CYAN}${maxCooling}${db}`,
      );
      if (heat && !cool) {
        this.propertyMap.delete('running_state'); // Remove running_state if only heating is supported cause it's not supported by the cluster without AutoMode
        this.bridgedDevice.addClusterServer(this.bridgedDevice.getDefaultHeatingThermostatClusterServer(undefined, undefined, minHeating, maxHeating));
      } else if (!heat && cool) {
        this.propertyMap.delete('running_state'); // Remove running_state if only cooling is supported cause it's not supported by the cluster without AutoMode
        this.bridgedDevice.addClusterServer(this.bridgedDevice.getDefaultCoolingThermostatClusterServer(undefined, undefined, minCooling, maxCooling));
      } else if (heat && cool) {
        this.bridgedDevice.addClusterServer(this.bridgedDevice.getDefaultThermostatClusterServer(undefined, undefined, undefined, undefined, minHeating, maxHeating, minCooling, maxCooling));
      }
    }

    /* Verify that all required server clusters are present in the main endpoint and in the child endpoints */
    if (this.bridgedDevice) {
      this.bridgedDevice.getDeviceTypes().forEach((deviceType) => {
        deviceType.requiredServerClusters.forEach((clusterId) => {
          if (!this.bridgedDevice) return;
          if (!this.bridgedDevice.getClusterServerById(clusterId)) {
            this.log.error(`Device type ${deviceType.name} (0x${deviceType.code.toString(16)}) requires cluster server ${getClusterNameById(clusterId)}(0x${clusterId.toString(16)}) but it is not present on endpoint`);
            this.bridgedDevice = undefined;
          }
        });
      });
    }
    if (this.bridgedDevice) {
      this.bridgedDevice.getChildEndpoints().forEach((childEndpoint) => {
        childEndpoint.getDeviceTypes().forEach((deviceType) => {
          deviceType.requiredServerClusters.forEach((clusterId) => {
            if (!this.bridgedDevice) return;
            if (!childEndpoint.getClusterServerById(clusterId)) {
              this.log.error(`Device type ${deviceType.name} (0x${deviceType.code.toString(16)}) requires cluster server ${getClusterNameById(clusterId)}(0x${clusterId.toString(16)}) but it is not present on child endpoint`);
              this.bridgedDevice = undefined;
            }
          });
        });
      });
    }
    if (!this.bridgedDevice) return;

    // Log properties
    this.propertyMap.forEach((value, key) => {
      this.log.debug(
        `Property ${CYAN}${key}${db} name ${CYAN}${value.name}${db} type ${CYAN}${value.type === '' ? 'generic' : value.type}${db} values ${CYAN}${value.values}${db} ` +
          `value_min ${CYAN}${value.value_min}${db} value_max ${CYAN}${value.value_max}${db} unit ${CYAN}${value.unit}${db} endpoint ${CYAN}${value.endpoint === '' ? 'main' : value.endpoint}${db}`,
      );
    });

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async (data) => {
      this.log.debug(`Command identify called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} request identifyTime:${data.request.identifyTime}  identifyTime:${data.attributes.identifyTime.getLocal()} identifyType:${data.attributes.identifyType.getLocal()} `);
      // logEndpoint(this.bridgedDevice!);
    });
    if (this.bridgedDevice.hasClusterServer(OnOff.Complete) || this.hasEndpoints) {
      this.bridgedDevice.addCommandHandler('on', async (data) => {
        if (!data.endpoint.number) return;
        this.log.debug(`Command on called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload: Payload = {};
        const label = data.endpoint.uniqueStorageKey;
        if (label === undefined) payload['state'] = 'ON';
        else payload['state_' + label] = 'ON';
        this.publishCommand('on', device.friendly_name, payload);
      });
      this.bridgedDevice.addCommandHandler('off', async (data) => {
        if (!data.endpoint.number) return;
        this.log.debug(`Command off called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload: Payload = {};
        const label = data.endpoint.uniqueStorageKey;
        if (label === undefined) payload['state'] = 'OFF';
        else payload['state_' + label] = 'OFF';
        this.publishCommand('off', device.friendly_name, payload);
      });
      this.bridgedDevice.addCommandHandler('toggle', async (data) => {
        if (!data.endpoint.number) return;
        this.log.debug(`Command toggle called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload: Payload = {};
        const label = data.endpoint.uniqueStorageKey;
        if (label === undefined) payload['state'] = 'TOGGLE';
        else payload['state_' + label] = 'TOGGLE';
        this.publishCommand('toggle', device.friendly_name, payload);
      });
    }
    if (this.bridgedDevice.hasClusterServer(LevelControl.Complete) || this.hasEndpoints) {
      this.bridgedDevice.addCommandHandler('moveToLevel', async (data) => {
        if (!data.endpoint.number) return;
        this.log.debug(`Command moveToLevel called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} request: ${data.request.level} transition: ${data.request.transitionTime} attributes: ${data.attributes.currentLevel.getLocal()}`);
        const payload: Payload = {};
        const label = data.endpoint.uniqueStorageKey;
        if (label === undefined) payload['brightness'] = data.request.level;
        else payload['brightness_' + label] = data.request.level;
        if (this.transition && data.request.transitionTime && data.request.transitionTime / 10 >= 1) payload['transition'] = Math.round(data.request.transitionTime / 10);
        this.publishCommand('moveToLevel', device.friendly_name, payload);
      });
      this.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', async (data) => {
        if (!data.endpoint.number) return;
        this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} request: ${data.request.level} transition: ${data.request.transitionTime} attributes: ${data.attributes.currentLevel.getLocal()}`);
        const payload: Payload = {};
        const label = data.endpoint.uniqueStorageKey;
        if (label === undefined) payload['brightness'] = data.request.level;
        else payload['brightness_' + label] = data.request.level;
        if (this.transition && data.request.transitionTime && data.request.transitionTime / 10 >= 1) payload['transition'] = Math.round(data.request.transitionTime / 10);
        this.publishCommand('moveToLevelWithOnOff', device.friendly_name, payload);
      });
    }
    if (this.bridgedDevice.hasClusterServer(ColorControl.Complete) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('colorTemperatureMireds')) {
      this.bridgedDevice.addCommandHandler('moveToColorTemperature', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
        const payload: Payload = { color_temp: request.colorTemperatureMireds };
        if (this.transition && request.transitionTime && request.transitionTime / 10 >= 1) payload['transition'] = Math.round(request.transitionTime / 10);
        this.publishCommand('moveToColorTemperature', device.friendly_name, payload);
      });
    }
    if (this.bridgedDevice.hasClusterServer(ColorControl.Complete) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('currentHue')) {
      let lastRequestedHue = 0;
      let lastRequestedSaturation = 0;
      this.bridgedDevice.addCommandHandler('moveToHue', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToHue called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        lastRequestedHue = request.hue;
        this.colorTimeout = setTimeout(() => {
          clearTimeout(this.colorTimeout);
          const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (lastRequestedSaturation / 254) * 100, 50);
          const payload: Payload = { color: { r: rgb.r, g: rgb.g, b: rgb.b } };
          if (this.transition && request.transitionTime && request.transitionTime / 10 >= 1) payload['transition'] = Math.round(request.transitionTime / 10);
          this.publishCommand('moveToHue', device.friendly_name, payload);
        }, 500);
      });
      this.bridgedDevice.addCommandHandler('moveToSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        lastRequestedSaturation = request.saturation;
        this.colorTimeout = setTimeout(() => {
          clearTimeout(this.colorTimeout);
          const rgb = color.hslColorToRgbColor((lastRequestedHue / 254) * 360, (request.saturation / 254) * 100, 50);
          const payload: Payload = { color: { r: rgb.r, g: rgb.g, b: rgb.b } };
          if (this.transition && request.transitionTime && request.transitionTime / 10 >= 1) payload['transition'] = Math.round(request.transitionTime / 10);
          this.publishCommand('moveToSaturation', device.friendly_name, payload);
        }, 500);
      });
      this.bridgedDevice.addCommandHandler('moveToHueAndSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(
          `Command moveToHueAndSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue}-${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`,
        );
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (request.saturation / 254) * 100, 50);
        const payload: Payload = { color: { r: rgb.r, g: rgb.g, b: rgb.b } };
        if (this.transition && request.transitionTime && request.transitionTime / 10 >= 1) payload['transition'] = Math.round(request.transitionTime / 10);
        this.publishCommand('moveToHueAndSaturation', device.friendly_name, payload);
      });
    }
    if (this.bridgedDevice.hasClusterServer(WindowCovering.Complete)) {
      this.bridgedDevice.addCommandHandler('upOrOpen', async (data) => {
        this.log.debug(`Command upOrOpen called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(0);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(0);
        this.publishCommand('upOrOpen', device.friendly_name, { state: 'OPEN' });
      });
      this.bridgedDevice.addCommandHandler('downOrClose', async (data) => {
        this.log.debug(`Command downOrClose called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(10000);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(10000);
        this.publishCommand('downOrClose', device.friendly_name, { state: 'CLOSE' });
      });
      this.bridgedDevice.addCommandHandler('stopMotion', async (data) => {
        this.log.debug(`Command stopMotion called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.operationalStatus?.getLocal()}`);
        const liftPercent100thsValue = data.attributes.currentPositionLiftPercent100ths?.getLocal();
        if (liftPercent100thsValue) {
          data.attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
          data.attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        }
        data.attributes.operationalStatus?.setLocal({ global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: WindowCovering.MovementStatus.Stopped });
        this.publishCommand('stopMotion', device.friendly_name, { state: 'STOP' });
      });
      this.bridgedDevice.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue }, attributes }) => {
        this.log.debug(`Command goToLiftPercentage called for ${this.ien}${device.friendly_name}${rs}${db} liftPercent100thsValue: ${liftPercent100thsValue}`);
        this.log.debug(`Command goToLiftPercentage current: ${attributes.currentPositionLiftPercent100ths?.getLocal()} target: ${attributes.targetPositionLiftPercent100ths?.getLocal()}`);
        // attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        this.publishCommand('goToLiftPercentage', device.friendly_name, { position: 100 - liftPercent100thsValue / 100 });
      });
    }
    if (this.bridgedDevice.hasClusterServer(DoorLock.Complete)) {
      this.bridgedDevice.addCommandHandler('lockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command lockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Locked);
        if (!this.isRouter) this.publishCommand('lockDoor', device.friendly_name, { state: 'LOCK' });
        else this.publishCommand('permit_join: false', 'bridge/request/permit_join', { value: false });
      });
      this.bridgedDevice.addCommandHandler('unlockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command unlockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Unlocked);
        if (!this.isRouter) this.publishCommand('unlockDoor', device.friendly_name, { state: 'UNLOCK' });
        else this.publishCommand('permit_join: true', 'bridge/request/permit_join', { value: true });
      });
    }
    if (this.bridgedDevice.hasClusterServer(Thermostat.Complete)) {
      this.bridgedDevice.addCommandHandler('setpointRaiseLower', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command setpointRaiseLower called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        if (request.mode === Thermostat.SetpointRaiseLowerMode.Heat && attributes.occupiedHeatingSetpoint) {
          const setpoint = Math.round(attributes.occupiedHeatingSetpoint.getLocal() / 100 + request.amount / 10);
          if (this.propertyMap.has('current_heating_setpoint')) {
            this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: setpoint });
            this.log.debug('Command setpointRaiseLower sent:', debugStringify({ current_heating_setpoint: setpoint }));
          } else if (this.propertyMap.has('occupied_heating_setpoint')) {
            this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { occupied_heating_setpoint: setpoint });
            this.log.debug('Command setpointRaiseLower sent:', debugStringify({ occupied_heating_setpoint: setpoint }));
          }
        }
        if (request.mode === Thermostat.SetpointRaiseLowerMode.Cool && attributes.occupiedCoolingSetpoint) {
          const setpoint = Math.round(attributes.occupiedCoolingSetpoint.getLocal() / 100 + request.amount / 10);
          if (this.propertyMap.has('current_cooling_setpoint')) {
            this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: setpoint });
            this.log.debug('Command setpointRaiseLower sent:', debugStringify({ current_cooling_setpoint: setpoint }));
          } else if (this.propertyMap.has('occupied_cooling_setpoint')) {
            this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { occupied_cooling_setpoint: setpoint });
            this.log.debug('Command setpointRaiseLower sent:', debugStringify({ occupied_cooling_setpoint: setpoint }));
          }
        }
      });
      const thermostat = this.bridgedDevice.getClusterServer(ThermostatCluster.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling, Thermostat.Feature.AutoMode));
      if (thermostat) {
        thermostat.subscribeSystemModeAttribute(async (value) => {
          this.log.debug(`Subscribe systemMode called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          const system_mode = value === Thermostat.SystemMode.Off ? 'off' : value === Thermostat.SystemMode.Heat ? 'heat' : 'cool';
          this.publishCommand('SystemMode', device.friendly_name, { system_mode });
          this.noUpdate = true;
          this.thermostatTimeout = setTimeout(() => {
            this.noUpdate = false;
          }, 10 * 1000);
        });
        if (thermostat.subscribeOccupiedHeatingSetpointAttribute)
          thermostat.subscribeOccupiedHeatingSetpointAttribute(async (value) => {
            this.log.debug(`Subscribe occupiedHeatingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
            if (this.propertyMap.has('current_heating_setpoint')) this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
            else if (this.propertyMap.has('occupied_heating_setpoint')) this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { occupied_heating_setpoint: Math.round(value / 100) });
            if (this.bridgedDevice) this.noUpdate = true;
            this.thermostatTimeout = setTimeout(() => {
              if (this.bridgedDevice) this.noUpdate = false;
            }, 10 * 1000);
          });
        if (thermostat.subscribeOccupiedCoolingSetpointAttribute)
          thermostat.subscribeOccupiedCoolingSetpointAttribute(async (value) => {
            this.log.debug(`Subscribe occupiedCoolingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
            if (this.propertyMap.has('current_cooling_setpoint')) this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: Math.round(value / 100) });
            else if (this.propertyMap.has('occupied_cooling_setpoint')) this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { occupied_cooling_setpoint: Math.round(value / 100) });
            if (this.bridgedDevice) this.noUpdate = true;
            this.thermostatTimeout = setTimeout(() => {
              if (this.bridgedDevice) this.noUpdate = false;
            }, 10 * 1000);
          });
      }
    }
  }
}
