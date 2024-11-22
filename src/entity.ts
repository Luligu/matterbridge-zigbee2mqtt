/**
 * This file contains the classes ZigbeeEntity, ZigbeeDevice and ZigbeeGroup.
 *
 * @file entity.ts
 * @author Luca Liguori
 * @date 2023-12-29
 * @version 3.0.1
 *
 * Copyright 2023, 2024 Luca Liguori.
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
  DoorLockCluster,
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
  DescriptorCluster,
  Descriptor,
  ClusterServer,
  VendorId,
} from 'matterbridge';
import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, wr, debugStringify, hk, zb, or, nf, LogLevel, CYAN } from 'matterbridge/logger';
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
  public bridgedDevice: BridgedBaseDevice | undefined;
  public eidn = `${or}`;
  private lastPayload: Payload = {};
  private lastSeen = 0;
  protected ignoreFeatures: string[] = [];
  protected transition = false;
  protected propertyMap = new Map<string, { name: string; type: string; endpoint: string; unit?: string; action?: string }>();

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
        this.log.debug(`*Skipping not changed MQTT message for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
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
        }
      }

      if (this.bridgedDevice === undefined) {
        this.log.debug(`*Skipping (no device) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      if (this.bridgedDevice.noUpdate) {
        this.log.debug(`*Skipping (no update) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      this.log.info(`${db}${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);

      // Parse the payload and update the accessory
      Object.entries(payload).forEach(([key, value]) => {
        // Skip null and undefined values
        if (value === undefined || value === null) return;
        if (this.bridgedDevice === undefined || this.bridgedDevice.noUpdate) return;

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
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentHue', Math.round((hsl.h / 360) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentSaturation', Math.round((hsl.s / 100) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        }
      });
    });

    this.platform.z2m.on('ONLINE-' + this.entityName, () => {
      this.log.info(`ONLINE message for device ${this.ien}${this.entityName}${rs}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(true);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: true });
        this.log.info(`${db}Set accessory attribute ${hk}BridgedDeviceBasicInformation.reachable: true`);
        this.log.info(`${db}Trigger accessory event ${hk}ReachableChangedEvent: true`);
      }
    });

    this.platform.z2m.on('OFFLINE-' + this.entityName, () => {
      this.log.warn(`OFFLINE message for device ${this.ien}${this.entityName}${wr}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(false);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: false });
        this.log.info(`${db}Set accessory attribute ${hk}BridgedDeviceBasicInformation.reachable: false`);
        this.log.info(`${db}Trigger accessory event ${hk}ReachableChangedEvent: false`);
      }
    });
  }

  protected updateAttributeIfChanged(rootEndpoint: Endpoint, endpointName: string | undefined, clusterId: number, attributeName: string, value: PayloadValue, lookup?: string[]): void {
    if (endpointName && endpointName !== '') {
      rootEndpoint = this.bridgedDevice?.getChildEndpointByName(endpointName) ?? rootEndpoint;
    }
    const cluster = rootEndpoint.getClusterServerById(ClusterId(clusterId));
    if (cluster === undefined) {
      this.log.debug(`*Update endpoint ${this.eidn}${rootEndpoint.name}:${rootEndpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} cluster ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db} not found: is z2m converter exposing all features?`);
      return;
    }
    if (!cluster.isAttributeSupportedByName(attributeName)) {
      this.log.debug(`***Update endpoint ${this.eidn}${rootEndpoint.name}:${rootEndpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} error attribute ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} not found`);
      return;
    }
    if (lookup !== undefined) {
      if (typeof value === 'string' && lookup.indexOf(value) !== -1) {
        value = lookup.indexOf(value);
      } else {
        this.log.debug(
          `***Update endpoint ${this.eidn}${rootEndpoint.name}:${rootEndpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` +
            `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} value ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db} not found in lookup ${debugStringify(lookup)}`,
        );
        return;
      }
    }
    const localValue = cluster.attributes[attributeName].getLocal();
    if (typeof value === 'object' ? deepEqual(value, localValue) : value === localValue) {
      this.log.debug(
        `*Skip update endpoint ${this.eidn}${rootEndpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` +
          `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} already ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
      );
      return;
    }
    this.log.info(
      `${db}Update endpoint ${this.eidn}${rootEndpoint.name}:${rootEndpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` +
        `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} from ${zb}${typeof localValue === 'object' ? debugStringify(localValue) : localValue}${db} to ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
    );
    try {
      cluster.attributes[attributeName].setLocal(value);
    } catch (error) {
      this.log.error(`Error setting attribute ${attributeName} to ${value}: ${error}`);
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
      this.bridgedDevice = new BridgedBaseDevice(this, [onOffSwitch], [...onOffSwitch.requiredServerClusters]);
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
      this.bridgedDevice = new BridgedBaseDevice(this, [deviceType], [...deviceType.requiredServerClusters]);
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
        let lastRequestTimeout: NodeJS.Timeout;
        this.bridgedDevice.addCommandHandler('moveToHue', async ({ request: request, attributes: attributes }) => {
          this.log.debug(`Command moveToHue called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.hue} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
          attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          lastRequestedHue = request.hue;
          lastRequestTimeout = setTimeout(() => {
            clearTimeout(lastRequestTimeout);
            const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (lastRequestedSaturation / 254) * 100, 50);
            this.publishCommand('moveToHue', group.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
          }, 500);
        });
        this.bridgedDevice.addCommandHandler('moveToSaturation', async ({ request: request, attributes: attributes }) => {
          this.log.debug(`Command moveToSaturation called for ${this.ien}${group.friendly_name}${rs}${db} request: ${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
          attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          lastRequestedSaturation = request.saturation;
          lastRequestTimeout = setTimeout(() => {
            clearTimeout(lastRequestTimeout);
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
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
            setTimeout(() => {
              if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
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
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
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
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
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
      this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.DOOR_LOCK], [Identify.Cluster.id, DoorLock.Cluster.id]);
      this.bridgedDevice.addFixedLabel('type', 'lock');
      this.bridgedDevice.isRouter = true;
    }

    // Get types and properties
    const types: string[] = [];
    const endpoints: string[] = [];
    const names: string[] = [];
    const properties: string[] = [];
    const units: string[] = [];
    device.definition?.exposes.forEach((expose) => {
      if (expose.features) {
        // Specific features with type
        expose.features?.forEach((feature) => {
          if (expose.type === 'lock' && feature.name === 'state' && feature.property === 'child_lock') feature.name = 'child_lock';
          types.push(expose.type);
          endpoints.push(expose.endpoint || '');
          names.push(feature.name);
          properties.push(feature.property);
          units.push(feature.unit || '');
        });
      } else {
        // Generic features without type
        types.push('');
        endpoints.push(expose.endpoint || '');
        if (device.power_source === 'Battery' && expose.name === 'voltage') expose.name = 'battery_voltage';
        if (device.power_source === 'Battery' && expose.property === 'voltage') expose.property = 'battery_voltage';
        names.push(expose.name || '');
        properties.push(expose.property);
        units.push(expose.unit || '');
        if (expose.name === 'action' && expose.values) {
          this.actions.push(...expose.values);
        }
      }
    });
    device.definition?.options.forEach((option) => {
      types.push('');
      names.push(option.name || '');
      properties.push(option.property);
      units.push(option.unit || '');
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
      const z2m = z2ms.find((z2m) => z2m.type === type && z2m.name === name);
      if (z2m) {
        this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => deviceType: ${z2m.deviceType?.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`);
        this.propertyMap.set(property, { name, type, endpoint, unit });
        if (endpoint === '') {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)]);
          else this.bridgedDevice.addDeviceTypeWithClusterServer([z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)]);
        } else {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [bridgedNode]);
          /* const child = */ this.bridgedDevice.addChildDeviceTypeWithClusterServer(endpoint, [z2m.deviceType], [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)], undefined, this.log.logLevel === LogLevel.DEBUG);
          // if (endpoint === 'l1') addTagList(child, 0x07, 1, 'endpoint ' + endpoint);
          // if (endpoint === 'l2') addTagList(child, 0x07, 2, 'endpoint ' + endpoint);
          // if (endpoint === 'l1') addTagList(child, null, 0x43, 0x08, 'endpoint ' + endpoint);
          // if (endpoint === 'l2') addTagList(child, null, 0x43, 0x08, 'endpoint ' + endpoint);
          this.bridgedDevice.addFixedLabel('composed', type);
          this.bridgedDevice.hasEndpoints = true;
        }
      } else {
        // this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => no mapping found`);
      }

      // Map actions to switches
      if (name === 'action' && this.actions.length) {
        this.log.info(`Device ${this.ien}${device.friendly_name}${rs}${nf} has actions mapped to these switches on sub endpoints:`);
        this.log.info('   controller events      <=> zigbee2mqtt actions');
        if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [bridgedNode]);
        this.bridgedDevice.hasEndpoints = true;
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
          this.bridgedDevice.addChildDeviceTypeWithClusterServer('switch_' + count, [DeviceTypes.GENERIC_SWITCH], [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters], undefined, this.log.logLevel === LogLevel.DEBUG);
        } else {
          for (let i = 0; i < this.actions.length; i += 3) {
            const actionsMap: string[] = [];
            for (let a = i; a < i + 3 && a < this.actions.length; a++) {
              actionsMap.push(this.actions[a]);
              this.propertyMap.set('action_' + actionsMap[a - i], { name, type: '', endpoint: 'switch_' + count, action: triggerMap[a - i] });
              this.log.info(`-- Button ${count}: ${hk}${switchMap[a - i]}${nf} <=> ${zb}${actionsMap[a - i]}${nf}`);
            }
            this.bridgedDevice.addChildDeviceTypeWithClusterServer('switch_' + count, [DeviceTypes.GENERIC_SWITCH], [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters], undefined, this.log.logLevel === LogLevel.DEBUG);
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
      this.log.debug(`Configuring device ${this.ien}${device.friendly_name}${rs}${db} ColorControlCluster with HS: ${names.includes('color_hs')} XY: ${names.includes('color_xy')} CT: ${names.includes('color_temp')}`);
      this.bridgedDevice.configureColorControlCluster(names.includes('color_hs') || names.includes('color_xy'), false, names.includes('color_temp'));
    }

    /* Verify that all required server clusters are present in the main endpoint and in the child endpoints */
    if (this.bridgedDevice) {
      const deviceTypes = this.bridgedDevice.getDeviceTypes();
      deviceTypes.forEach((deviceType) => {
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
      const childEndpoints = this.bridgedDevice.getChildEndpoints();
      childEndpoints.forEach((childEndpoint) => {
        const deviceTypes = childEndpoint.getDeviceTypes();
        deviceTypes.forEach((deviceType) => {
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

    // Properties
    this.propertyMap.forEach((value, key) => {
      this.log.debug(`Property ${CYAN}${key}${db} name ${CYAN}${value.name}${db} type ${CYAN}${value.type === '' ? 'generic' : value.type}${db} endpoint ${CYAN}${value.endpoint === '' ? 'main' : value.endpoint}${db}`);
    });

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async (data) => {
      this.log.debug(`Command identify called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} request identifyTime:${data.request.identifyTime}  identifyTime:${data.attributes.identifyTime.getLocal()} identifyType:${data.attributes.identifyType.getLocal()} `);
      // logEndpoint(this.bridgedDevice!);
    });
    if (this.bridgedDevice.hasClusterServer(OnOff.Complete) || this.bridgedDevice.hasEndpoints) {
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
    if (this.bridgedDevice.hasClusterServer(LevelControl.Complete) || this.bridgedDevice.hasEndpoints) {
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
      let lastRequestTimeout: NodeJS.Timeout;
      this.bridgedDevice.addCommandHandler('moveToHue', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToHue called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        lastRequestedHue = request.hue;
        lastRequestTimeout = setTimeout(() => {
          clearTimeout(lastRequestTimeout);
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
        lastRequestTimeout = setTimeout(() => {
          clearTimeout(lastRequestTimeout);
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
        if (!this.bridgedDevice?.isRouter) this.publishCommand('lockDoor', device.friendly_name, { state: 'LOCK' });
        else this.publishCommand('permit_join: false', 'bridge/request/permit_join', { value: false });
      });
      this.bridgedDevice.addCommandHandler('unlockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command unlockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Unlocked);
        if (!this.bridgedDevice?.isRouter) this.publishCommand('unlockDoor', device.friendly_name, { state: 'UNLOCK' });
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
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
        thermostat.subscribeOccupiedHeatingSetpointAttribute(async (value) => {
          this.log.debug(`Subscribe occupiedHeatingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          if (this.propertyMap.has('current_heating_setpoint')) this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
          else if (this.propertyMap.has('occupied_heating_setpoint')) this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { occupied_heating_setpoint: Math.round(value / 100) });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
        thermostat.subscribeOccupiedCoolingSetpointAttribute(async (value) => {
          this.log.debug(`Subscribe occupiedCoolingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          if (this.propertyMap.has('current_cooling_setpoint')) this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: Math.round(value / 100) });
          else if (this.propertyMap.has('occupied_cooling_setpoint')) this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { occupied_cooling_setpoint: Math.round(value / 100) });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
      }
    }
  }
}

export function addTagList(endpoint: Endpoint, mfgCode: VendorId | null, namespaceId: number, tag: number, label: string | null = null) {
  const descriptor = endpoint.getClusterServerById(DescriptorCluster.id);
  if (!descriptor) return;
  // console.log('addTagList', namespaceId, tag, label);
  // console.log('original descriptor', descriptor);

  endpoint.addClusterServer(
    ClusterServer(
      DescriptorCluster.with(Descriptor.Feature.TagList),
      {
        tagList: [{ mfgCode, namespaceId, tag, label }],
        deviceTypeList: [...descriptor.attributes.deviceTypeList.getLocal()],
        serverList: [...descriptor.attributes.serverList.getLocal()],
        clientList: [...descriptor.attributes.clientList.getLocal()],
        partsList: [...descriptor.attributes.partsList.getLocal()],
      },
      {},
      {},
    ),
  );

  // descriptor = endpoint.getClusterServerById(DescriptorCluster.id);
  // console.log('new descriptor', descriptor);
}

export class BridgedBaseDevice extends MatterbridgeDevice {
  public hasEndpoints = false;
  public isRouter = false;
  public noUpdate = false;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(entity: ZigbeeEntity, definition: AtLeastOne<DeviceTypeDefinition>, includeServerList: ClusterId[] = [], includeClientList?: ClusterId[]) {
    super(definition, undefined, entity.log.logLevel === LogLevel.DEBUG);
    this.addClusterServerFromList(this, includeServerList);

    // Add bridgedNode device type and BridgedDeviceBasicInformation cluster
    this.addDeviceType(bridgedNode);
    if (entity.isDevice && entity.device && entity.device.friendly_name === 'Coordinator') {
      this.createDefaultBridgedDeviceBasicInformationClusterServer(entity.device.friendly_name, entity.serial, 0xfff1, 'zigbee2MQTT', 'Coordinator');
    } else if (entity.isDevice && entity.device) {
      this.createDefaultBridgedDeviceBasicInformationClusterServer(entity.device.friendly_name, entity.serial, 0xfff1, entity.device.definition ? entity.device.definition.vendor : entity.device.manufacturer, entity.device.definition ? entity.device.definition.model : entity.device.model_id);
    } else if (entity.isGroup && entity.group) {
      this.createDefaultBridgedDeviceBasicInformationClusterServer(entity.group.friendly_name, entity.serial, 0xfff1, 'zigbee2MQTT', 'Group');
    }

    // Add powerSource device type and PowerSource cluster
    this.addDeviceType(powerSource);
    if (entity.isDevice) {
      if (entity.device?.power_source === 'Battery') this.createDefaultPowerSourceReplaceableBatteryClusterServer(100, PowerSource.BatChargeLevel.Ok);
      else this.createDefaultPowerSourceWiredClusterServer();
    } else if (entity.isGroup) {
      this.createDefaultPowerSourceWiredClusterServer();
    }
  }

  configure() {
    if (this.getClusterServerById(WindowCovering.Cluster.id)) {
      this.log.info(`Configuring ${this.deviceName} WindowCovering cluster`);
      this.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.getClusterServerById(DoorLock.Cluster.id)) {
      this.log.info(`Configuring ${this.deviceName} DoorLock cluster`);
      const state = this.getClusterServerById(DoorLock.Cluster.id)?.getLockStateAttribute();
      if (state === DoorLock.LockState.Locked) this.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
      if (state === DoorLock.LockState.Unlocked) this.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
    }
  }
}
