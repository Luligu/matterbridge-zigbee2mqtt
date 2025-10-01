/**
 * @description This file contains the classes ZigbeeEntity, ZigbeeDevice and ZigbeeGroup.
 * @file entity.ts
 * @author Luca Liguori
 * @created 2023-12-29
 * @version 3.3.0
 * @license Apache-2.0
 *
 * Copyright 2023, 2024, 2025, 2026, 2027 Luca Liguori.
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
 * limitations under the License.
 */

import EventEmitter from 'node:events';

import {
  DeviceTypeDefinition,
  airQualitySensor,
  colorTemperatureSwitch,
  dimmableSwitch,
  onOffSwitch,
  powerSource,
  bridgedNode,
  electricalSensor,
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  onOffOutlet,
  coverDevice,
  thermostatDevice,
  MatterbridgeEndpoint,
  dimmableOutlet,
  doorLockDevice,
  occupancySensor,
  lightSensor,
  contactSensor,
  temperatureSensor,
  humiditySensor,
  pressureSensor,
  genericSwitch,
  waterLeakDetector,
  rainSensor,
  smokeCoAlarm,
  extendedColorLight,
  CommandHandlerData,
} from 'matterbridge';
import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, debugStringify, hk, zb, or, nf, LogLevel, CYAN, er, YELLOW } from 'matterbridge/logger';
import { deepCopy, deepEqual, isValidArray, isValidNumber, isValidObject, kelvinToRGB, miredToKelvin } from 'matterbridge/utils';
import * as color from 'matterbridge/utils';
import { AtLeastOne, SwitchesTag, NumberTag } from 'matterbridge/matter';
import { getClusterNameById, ClusterId, VendorId, Semtag } from 'matterbridge/matter/types';
import {
  ElectricalEnergyMeasurement,
  ElectricalPowerMeasurement,
  WindowCoveringCluster,
  DoorLockCluster,
  BridgedDeviceBasicInformation,
  OnOff,
  Identify,
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
  WindowCovering,
  DoorLock,
  ThermostatCluster,
  Thermostat,
  AirQuality,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  FormaldehydeConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  SmokeCoAlarm,
} from 'matterbridge/matter/clusters';

import { ZigbeePlatform } from './platform.js';
import { BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload, PayloadValue } from './payloadTypes.js';

interface BehaviorOptions {
  clusterId: ClusterId;
  options: Record<string, boolean | number | bigint | string | object | null>;
}

/**
 * Represents a Zigbee entity: a group or a device.
 *
 * @class
 * @augments {EventEmitter}
 */
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
  public bridgedDevice: MatterbridgeEndpoint | undefined;
  public eidn = `${or}`;
  protected lastPayload: Payload = {};
  private lastSeen = 0;
  protected ignoreFeatures: string[] = [];
  protected transition = false;
  protected propertyMap = new Map<
    string,
    {
      name: string;
      type: string;
      endpoint: string;
      values?: string;
      value_min?: number;
      value_max?: number;
      unit?: string;
      category?: string;
      description?: string;
      label?: string;
      action?: string;
    }
  >();

  // We save the tag list and device types and cluster servers and clients to avoid multiple lookups
  protected readonly mutableDevice = new Map<
    string,
    {
      tagList: Semtag[];
      deviceTypes: DeviceTypeDefinition[];
      clusterServersIds: ClusterId[];
      clusterServersOptions: BehaviorOptions[];
      clusterClientsIds: ClusterId[];
      clusterClientsOptions: BehaviorOptions[];
    }
  >();

  // Cache the commands
  protected cachePayload: Payload = {};
  protected cachePublishTimeout: NodeJS.Timeout | undefined = undefined;
  protected cachePublishTimeoutTime = 100;
  protected noUpdateTimeout: NodeJS.Timeout | undefined = undefined;
  protected noUpdateTimeoutTime = 2000;
  protected thermostatTimeout: NodeJS.Timeout | undefined = undefined;
  protected thermostatTimeoutTime = 5000;

  protected composedType = '';
  protected hasEndpoints = false;
  public isRouter = false;
  protected noUpdate = false;

  protected readonly thermostatSystemModeLookup = ['off', 'auto', '', 'cool', 'heat', '', '', 'fan_only'];

  /**
   * Creates an instance of ZigbeeEntity.
   *
   * @param {ZigbeePlatform} platform - The Zigbee platform instance.
   * @param {BridgeDevice | BridgeGroup} entity - The bridge device or group instance received from zigbee2mqtt.
   */
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
    this.log = new AnsiLogger({
      logName: this.entityName,
      logTimestampFormat: TimestampFormat.TIME_MILLIS,
      logLevel: platform.debugEnabled ? LogLevel.DEBUG : platform.log.logLevel,
    });
    this.log.debug(`Created MatterEntity: ${this.entityName}`);

    this.platform.z2m.on('MESSAGE-' + this.entityName, (payload: Payload) => {
      // Check if the message is a duplicate that can be ingored cause only linkquality and last_seen have changed (action is always passed)
      const now = Date.now();
      if (
        now - this.lastSeen < 1000 * 60 &&
        deepEqual(this.lastPayload, payload, ['linkquality', 'last_seen', ...this.ignoreFeatures]) &&
        !Object.prototype.hasOwnProperty.call(this.lastPayload, 'action')
      ) {
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
      // Skip updates of all color attributes if state === OFF
      if ('state' in payload && payload.state === 'OFF') {
        this.log.debug(`*Skipping color attributes update (state is OFF) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.entityName}`);
        for (const key of Object.keys(payload)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          if (['brightness', 'color_temp', 'color', 'color_mode'].includes(key)) delete payload[key];
        }
      }

      this.log.info(
        `${db}${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`,
      );

      // Parse the payload and update the accessory
      Object.entries(payload).forEach(([key, value]) => {
        // Skip null and undefined values
        if (value === undefined || value === null) return;
        if (this.bridgedDevice === undefined || this.noUpdate) return;

        // Modify voltage to battery_voltage
        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';

        // Set batChargeLevel to critical if batter is less than 20%
        if (key === 'battery' && !('battery_low' in payload) && isValidNumber(value, 0, 100) && this.isDevice && this.device?.power_source === 'Battery') {
          if (value < 20) {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Critical);
          } else if (value < 40) {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Warning);
          } else {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok);
          }
        }

        // Lookup the property in the propertyMap and ZigbeeToMatter table
        const propertyMap = this.propertyMap.get(key);
        if (propertyMap) {
          this.log.debug(
            `Payload entry ${CYAN}${key}${db} => name: ${CYAN}${propertyMap.name}${db} type: ${CYAN}${propertyMap.type === '' ? 'generic' : propertyMap.type}${db} ` +
              `endpoint: ${CYAN}${propertyMap.endpoint === '' ? 'main' : propertyMap.endpoint}${db}`,
          );
          let z2m: ZigbeeToMatter | undefined;
          z2m = z2ms.find((z2m) => z2m.type === propertyMap?.type && z2m.property === propertyMap?.name);
          if (!z2m) z2m = z2ms.find((z2m) => z2m.property === propertyMap?.name);
          if (z2m) {
            if (z2m.valueLookup && propertyMap.values && propertyMap.values !== '' && typeof value === 'string' && !propertyMap.values.includes(value)) {
              this.log.debug(`*Payload entry ${CYAN}${key}${db} value ${CYAN}${value}${db} not found in propertyMap values ${CYAN}${propertyMap.values}${db}`);
              return;
            }
            if (z2m.converter || z2m.valueLookup) {
              this.updateAttributeIfChanged(
                this.bridgedDevice,
                propertyMap === undefined || propertyMap.endpoint === '' ? undefined : propertyMap.endpoint,
                z2m.cluster,
                z2m.attribute,
                z2m.converter ? z2m.converter(value) : value,
                z2m.valueLookup,
              );
              return;
            }
          } else this.log.debug(`*Payload entry ${CYAN}${key}${db} not found in zigbeeToMatter converter`);
        } else this.log.debug(`*Payload entry ${CYAN}${key}${db} not found in propertyMap`);

        // Switch actions on the endpoints
        if (key === 'action' && value !== '') {
          const propertyMap = this.propertyMap.get(('action_' + value) as string);
          if (propertyMap) {
            // this.log.debug(`Payload entry ${CYAN}${value}${db} => name: ${CYAN}${propertyMap.name}${db} endpoint: ${CYAN}${propertyMap.endpoint}${db} action: ${CYAN}${propertyMap.action}${db}`);
            const child = this.bridgedDevice.getChildEndpointByName(propertyMap.endpoint);
            if (child && child.maybeNumber) child.triggerSwitchEvent(propertyMap.action as 'Single' | 'Double' | 'Long', this.log);
          } else this.log.debug(`*Payload entry ${CYAN}${('action_' + value) as string}${db} not found in propertyMap`);
        }

        // WindowCovering
        // Zigbee2MQTT cover: 0 = open, 100 = closed
        // Matter WindowCovering: 0 = open 10000 = closed
        if (key === 'position' && this.isDevice && isValidNumber(value, 0, 100)) {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', value * 100);
        }
        if (key === 'moving' && this.isDevice) {
          const reversed = this.lastPayload.motor_direction === 'reversed';
          if (reversed && (value === 'UP' || value === 'DOWN')) {
            value = reversed ? (value === 'UP' ? 'DOWN' : 'UP') : value;
          }
          if (value === 'UP') {
            const status = WindowCovering.MovementStatus.Opening;
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'operationalStatus', { global: status, lift: status, tilt: status });
          } else if (value === 'DOWN') {
            const status = WindowCovering.MovementStatus.Closing;
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'operationalStatus', { global: status, lift: status, tilt: status });
          } else if (value === 'STOP') {
            const status = WindowCovering.MovementStatus.Stopped;
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'operationalStatus', { global: status, lift: status, tilt: status });
            const position = this.bridgedDevice.getAttribute(WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', this.log);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', position);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'targetPositionLiftPercent100ths', position);
          }
        }

        // Thermostat current_heating_setpoint is published and exposed like it is current_heating_setpoint and current_cooling_setpoint
        if (key === 'current_heating_setpoint' && 'system_mode' in payload && payload['system_mode'] === 'heat' && isValidNumber(value)) {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'occupiedHeatingSetpoint', value * 100);
        }
        if (key === 'current_heating_setpoint' && 'system_mode' in payload && payload['system_mode'] === 'cool' && isValidNumber(value)) {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'occupiedCoolingSetpoint', value * 100);
        }

        // ColorControl colorTemperatureMired (clamped to value_min and value_max) and colorMode
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp' && isValidNumber(value)) {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds);
          const colorTemp = this.propertyMap.get('color_temp');
          this.updateAttributeIfChanged(
            this.bridgedDevice,
            undefined,
            ColorControl.Cluster.id,
            'colorTemperatureMireds',
            Math.max(colorTemp?.value_min ?? 147, Math.min(colorTemp?.value_max ?? 500, value)),
          );
        }
        // ColorControl currentHue, currentSaturation and colorMode
        // prettier-ignore
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'hs') {
          const { hue, saturation } = value as { hue: number; saturation: number };
          if(isValidNumber(hue, 0, 360) && isValidNumber(saturation, 0, 100)) {
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentHue', Math.round(hue / 360 * 254));
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentSaturation', Math.round(saturation / 100 * 254));
          }
        }
        // ColorControl currentX, currentY and colorMode
        // prettier-ignore
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'xy') {
          /* not supported by Apple Home so we convert xy to hue and saturation
          const { x, y } = value as { x: number; y: number };
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentXAndCurrentY);
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentX', Math.max(Math.min(Math.round(x * 65536), 65279), 0));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentY', Math.max(Math.min(Math.round(y * 65536), 65279), 0));
          */
          const { x, y } = value as { x: number; y: number };
          if (isValidNumber(x, 0, 1) && isValidNumber(y, 0, 1)) {
            const hsl = color.xyToHsl(x, y);
            const rgb = color.xyColorToRgbColor(x, y);
            this.log.debug(`ColorControl xyToHsl ${CYAN}${x}${db} ${CYAN}${y}${db} => h ${CYAN}${hsl.h}${db} s ${CYAN}${hsl.s}${db} l ${CYAN}${hsl.l}${db}`);
            this.log.debug(`ColorControl xyToRgb ${CYAN}${x}${db} ${CYAN}${y}${db} => r ${CYAN}${rgb.r}${db} g ${CYAN}${rgb.g}${db} b ${CYAN}${rgb.b}${db}`);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentHue', Math.round(hsl.h / 360 * 254));
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentSaturation', Math.round(hsl.s / 100 * 254));
          }
        }
      });
    });

    this.platform.z2m.on('ONLINE-' + this.entityName, () => {
      this.log.info(`ONLINE message for device ${this.ien}${this.entityName}${rs}`);
      if (this.bridgedDevice?.maybeNumber !== undefined) {
        this.bridgedDevice?.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', true, this.log);
        this.bridgedDevice?.triggerEvent(BridgedDeviceBasicInformation.Cluster.id, 'reachableChanged', { reachableNewValue: true }, this.log);
      }
    });

    this.platform.z2m.on('OFFLINE-' + this.entityName, () => {
      this.log.warn(`OFFLINE message for device ${this.ien}${this.entityName}${rs}`);
      if (this.bridgedDevice?.maybeNumber !== undefined) {
        this.bridgedDevice?.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', false, this.log);
        this.bridgedDevice?.triggerEvent(BridgedDeviceBasicInformation.Cluster.id, 'reachableChanged', { reachableNewValue: false }, this.log);
      }
    });
  }

  /**
   * Destroys the ZigbeeEntity instance by clearing any active timeouts.
   *
   * @remarks
   * This method is used to clean up the ZigbeeEntity instance by clearing any active timeouts for color and thermostat operations.
   * It ensures that no further actions are taken on these timeouts after the entity is destroyed.
   */
  destroy() {
    this.removeAllListeners();
    if (this.cachePublishTimeout) clearTimeout(this.cachePublishTimeout);
    this.cachePublishTimeout = undefined;
    if (this.thermostatTimeout) clearTimeout(this.thermostatTimeout);
    this.thermostatTimeout = undefined;
    if (this.noUpdateTimeout) clearTimeout(this.noUpdateTimeout);
    this.noUpdateTimeout = undefined;
    this.device = undefined;
    this.group = undefined;
    this.bridgedDevice = undefined;
    this.mutableDevice.clear();
    this.propertyMap.clear();
  }

  /**
   * Publish the cached commands with a delay of 100ms to group multiple commands into one.
   * It optimizes the number of messages sent to the MQTT broker for huge scenes on the controller.
   *
   * @param {string} command - The command to publish, defaults to 'cachedPublishLight'
   * @param {Payload} payload - The optional payload to add to the cached publish payload
   * @param {number} transitionTime - The optional transition time to add to the cached publish payload
   */
  protected cachePublish(command: string = 'unknown', payload?: Payload, transitionTime?: number) {
    if (command === 'moveToColorTemperature') {
      delete this.cachePayload['color'];
    } else if (command === 'moveToColor' || command === 'moveToHueSaturation' || command === 'moveToHue' || command === 'moveToSaturation') {
      delete this.cachePayload['color_temp'];
    }

    if (payload) this.cachePayload = { ...this.cachePayload, ...payload };
    if (this.transition && transitionTime && transitionTime / 10 >= 1) this.cachePayload['transition'] = Math.round(transitionTime / 10);
    clearTimeout(this.cachePublishTimeout);
    this.cachePublishTimeout = setTimeout(() => {
      clearTimeout(this.cachePublishTimeout);
      this.cachePublishTimeout = undefined;
      if (isValidObject(this.cachePayload, 1)) this.publishCommand(command, (this.isGroup ? this.group?.friendly_name : this.device?.friendly_name) as string, this.cachePayload);
      this.cachePayload = {};
      this.noUpdate = true;
      this.log.debug(
        `****No update for 2 seconds to allow the device ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} to update its state`,
      );
      clearTimeout(this.noUpdateTimeout);
      this.noUpdateTimeout = setTimeout(() => {
        clearTimeout(this.noUpdateTimeout);
        this.noUpdateTimeout = undefined;
        this.log.debug(`****No update is now reset for the device ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db}`);
        this.noUpdate = false;
      }, this.noUpdateTimeoutTime).unref();
    }, this.cachePublishTimeoutTime).unref();
  }

  /**
   * Set the light attributes in the cache payload reading the clusters attributes.
   * It is used when turning on the light to send the current stored attributes in one message.
   *
   * @param {MatterbridgeEndpoint} endpoint - The endpoint to get the attributes from
   * @param {string} postfix - The postfix to add to the attribute names in the payload (e.g. '', '_1', '_2', etc.)
   */
  protected setCachePublishAttributes(endpoint: MatterbridgeEndpoint, postfix: string | undefined = undefined) {
    // We need to add the cluster attributes if we are turning on the light and it was off
    const brightness = endpoint.hasAttributeServer(LevelControl.Cluster.id, 'currentLevel')
      ? Math.round((endpoint.getAttribute(LevelControl.Cluster.id, 'currentLevel') / 254) * 255)
      : undefined;
    if (isValidNumber(brightness, 1, 255)) this.cachePayload['brightness' + (postfix || '')] = brightness;
    const color_temp =
      endpoint.hasClusterServer(ColorControl.Cluster.id) &&
      endpoint.hasAttributeServer(ColorControl.Cluster.id, 'colorTemperatureMireds') &&
      endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.ColorTemperatureMireds
        ? endpoint.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')
        : undefined;
    if (isValidNumber(color_temp)) this.cachePayload['color_temp' + (postfix || '')] = color_temp;
    const hs_color =
      endpoint.hasClusterServer(ColorControl.Cluster.id) &&
      endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentHue') &&
      endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentSaturation') &&
      endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentHueAndCurrentSaturation
        ? [
            Math.round((endpoint.getAttribute(ColorControl.Cluster.id, 'currentHue') / 254) * 360),
            Math.round((endpoint.getAttribute(ColorControl.Cluster.id, 'currentSaturation') / 254) * 100),
          ]
        : undefined;
    if (isValidArray(hs_color, 2)) {
      this.cachePayload['color' + (postfix || '')] = { h: hs_color[0], s: hs_color[1] };
    }
    const xy_color =
      endpoint.hasClusterServer(ColorControl.Cluster.id) &&
      endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentX') &&
      endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentY') &&
      endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentXAndCurrentY
        ? [endpoint.getAttribute(ColorControl.Cluster.id, 'currentX') / 65535, endpoint.getAttribute(ColorControl.Cluster.id, 'currentY') / 65535]
        : undefined;
    if (isValidArray(xy_color, 2)) this.cachePayload['color' + (postfix || '')] = { x: xy_color[0], y: xy_color[1] };
    const lookupColorMode = [
      'CurrentHueAndCurrentSaturation',
      'CurrentXAndCurrentY',
      'ColorTemperatureMireds',
      'EnhancedCurrentHueAndCurrentSaturation',
      'Brightness',
      'OnOff',
      'Unknown',
    ];
    let colorMode = 6;
    if (endpoint.hasClusterServer(ColorControl.Cluster.id)) {
      colorMode = endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode');
    } else if (endpoint.hasClusterServer(LevelControl.Cluster.id)) {
      colorMode = 4;
    } else if (endpoint.hasClusterServer(OnOff.Cluster.id)) {
      colorMode = 5;
    }
    this.log.debug(
      `***Set attributes called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} colorMode ${CYAN}${lookupColorMode[colorMode]}${db} payload ${debugStringify(this.cachePayload)}`,
    );
  }

  // prettier-ignore
  protected async onCommandHandler(data: CommandHandlerData) {
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === true) {
      this.log.debug(`*Command on ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} already ON`);
      return;
    }
    this.log.debug(`Command on called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber}`);
    this.setCachePublishAttributes(data.endpoint, this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : undefined);
    this.cachePublish('on', { ['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: 'ON' });
  }

  // prettier-ignore
  protected async offCommandHandler(data: CommandHandlerData) {
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false) {
      this.log.debug(`*Command off ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} already OFF`);
      return;
    }
    this.log.debug(`Command off called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber}`);
    this.cachePublish('off', { ['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: 'OFF' });
  }

  // prettier-ignore
  protected async toggleCommandHandler(data: CommandHandlerData) {
    this.log.debug(`Command toggle called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber}`);
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false) {
      this.setCachePublishAttributes(data.endpoint, this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : undefined);
      this.cachePublish('toggle', { ['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: 'ON' });
    } else {
      this.cachePublish('toggle', { ['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: 'OFF' });
    }
  }

  // prettier-ignore
  protected async moveToLevelCommandHandler(data: CommandHandlerData): Promise<void> {
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || data.endpoint.getAttribute(LevelControl.Cluster.id, 'currentLevel') === data.request.level) {
      this.log.debug(`*Command moveToLevel ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or level unchanged`);
      return;
    }
    this.log.debug(`Command moveToLevel called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.level} transition: ${data.request.transitionTime}`);
    this.cachePublish('moveToLevel', { ['brightness' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: data.request.level }, data.request.transitionTime);
  }

  // prettier-ignore
  protected async moveToLevelWithOnOffCommandHandler(data: CommandHandlerData): Promise<void> {
    this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.level} transition: ${data.request.transitionTime}`);
    if (data.request['level'] <= (data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel') ?? 1)) {
      if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false) {
        this.log.debug(`*Command moveToLevelWithOnOff ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF`);
        return;
      }
      data.endpoint.log.debug(`***Command moveToLevelWithOnOff received with level <= minLevel(${data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel')}) => turn off the light`);
      this.cachePublish('moveToLevelWithOnOff', { ['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: 'OFF' }, data.request.transitionTime);
    } else {
      if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false) {
        data.endpoint.log.debug(`***Command moveToLevelWithOnOff received with level > minLevel(${data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel')}) and light is off => turn on the light with attributes`);
        this.cachePayload['state' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')] = 'ON';
        this.setCachePublishAttributes(data.endpoint, this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '');
      }
      this.cachePublish('moveToLevelWithOnOff', { ['brightness' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: data.request.level }, data.request.transitionTime); // Override the stored one
    }
  }

  // prettier-ignore
  protected async moveToColorTemperatureCommandHandler(data: CommandHandlerData): Promise<void> {
    delete this.cachePayload['color'];
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || (data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.ColorTemperatureMireds && data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds') === data.request.colorTemperatureMireds)) {
      this.log.debug(`*Command moveToColorTemperature ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or colorTemperatureMireds unchanged`);
      return;
    }
    this.log.debug(`Command moveToColorTemperature called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.colorTemperatureMireds} transition: ${data.request.transitionTime}`);
    if (this.propertyMap.get('color_temp')) {
      this.cachePublish('moveToColorTemperature', { ['color_temp' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: data.request.colorTemperatureMireds }, data.request.transitionTime);
    } else {
      const rgb = kelvinToRGB(miredToKelvin(data.request.colorTemperatureMireds)); // Convert mireds to RGB
      this.cachePublish('moveToColorTemperature', { ['color' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: { r: rgb.r, g: rgb.g, b: rgb.b } }, data.request.transitionTime);
      this.log.debug(`***Command moveToColorTemperature called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} but color_temp property is not available. Converting ${data.request.colorTemperatureMireds} to RGB ${debugStringify(rgb)}.`);
    }
  }

  // prettier-ignore
  protected async moveToColorCommandHandler(data: CommandHandlerData): Promise<void> {
    delete this.cachePayload['color_temp'];
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || (data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentXAndCurrentY && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentX') === data.request.colorX && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentY') === data.request.colorY)) {
      this.log.debug(`*Command moveToColor ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or color unchanged`);
      return;
    }
    this.log.debug(`Command moveToColor called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: X: ${data.request.colorX} Y: ${data.request.colorY} transition: ${data.request.transitionTime}`);
    this.cachePublish('moveToColor', { ['color' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: { x: Math.round(data.request.colorX / 65536 * 10000) / 10000, y: Math.round(data.request.colorY / 65536 * 10000) / 10000 } }, data.request.transitionTime);
  }

  // prettier-ignore
  protected async moveToHueCommandHandler(data: CommandHandlerData): Promise<void> {
    delete this.cachePayload['color_temp'];
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || (data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentHueAndCurrentSaturation && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentHue') === data.request.hue)) {
      this.log.debug(`*Command moveToHue ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or hue unchanged`);
      return;
    }
    this.log.debug(`Command moveToHue called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.hue} transition: ${data.request.transitionTime}`);
    this.cachePublish('moveToHue', { ['color' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: { h: Math.round(data.request.hue / 254 * 360), s: Math.round(data.endpoint.getAttribute(ColorControlCluster.id, 'currentSaturation') / 254 * 100) }}, data.request.transitionTime);
  }

  // prettier-ignore
  protected async moveToSaturationCommandHandler(data: CommandHandlerData): Promise<void> {
    delete this.cachePayload['color_temp'];
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || (data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentHueAndCurrentSaturation && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentSaturation') === data.request.saturation)) {
      this.log.debug(`*Command moveToSaturation ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or saturation unchanged`);
      return;
    }
    this.log.debug(`Command moveToSaturation called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.saturation} transition: ${data.request.transitionTime}`);
    this.cachePublish('moveToSaturation', { ['color' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: { h: Math.round(data.endpoint.getAttribute(ColorControlCluster.id, 'currentHue') / 254 * 360), s: Math.round(data.request.saturation / 254 * 100) } }, data.request.transitionTime);
  }

  // prettier-ignore
  protected async moveToHueAndSaturationCommandHandler(data: CommandHandlerData): Promise<void> {
    delete this.cachePayload['color_temp'];
    if (data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff') === false || (data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentHueAndCurrentSaturation && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentHue') === data.request.hue && data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentSaturation') === data.request.saturation)) {
      this.log.debug(`*Command moveToHueAndSaturation ignored for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} light OFF or hue/saturation unchanged`);
      return;
    }
    this.log.debug(`Command moveToHueAndSaturation called for ${this.ien}${this.isGroup ? this.group?.friendly_name : this.device?.friendly_name}${rs}${db} endpoint: ${data.endpoint?.maybeId}:${data.endpoint?.maybeNumber} request: ${data.request.hue} - ${data.request.saturation} transition: ${data.request.transitionTime}`);
    this.cachePublish('moveToHueAndSaturation', { ['color' + (this.hasEndpoints ? '_' + data.endpoint.uniqueStorageKey : '')]: { h: Math.round(data.request.hue / 254 * 360), s: Math.round(data.request.saturation / 254 * 100) } }, data.request.transitionTime);
  }

  protected addBridgedDeviceBasicInformation(): MatterbridgeEndpoint {
    if (!this.bridgedDevice) throw new Error('No bridged device');
    // Add BridgedDeviceBasicInformation cluster
    const softwareVersion = parseInt(this.platform.z2mBridgeInfo?.version || '1');
    const softwareVersionString = `${this.platform.z2mBridgeInfo?.version} (commit ${this.platform.z2mBridgeInfo?.commit})`;
    const hardwareVersion = parseInt(this.platform.matterbridge.matterbridgeVersion || '1');
    const hardwareVersionString = this.platform.matterbridge.matterbridgeVersion || 'unknown';
    if (this.isDevice && this.device && this.device.friendly_name === 'Coordinator') {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
        this.device.friendly_name,
        this.serial,
        0xfff1,
        'zigbee2MQTT',
        'Coordinator',
        softwareVersion,
        softwareVersionString,
        hardwareVersion,
        hardwareVersionString,
      );
    } else if (this.isDevice && this.device) {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
        this.device.friendly_name,
        this.serial,
        0xfff1,
        this.device.definition ? this.device.definition.vendor : this.device.manufacturer,
        this.device.definition ? this.device.definition.model : this.device.model_id,
        softwareVersion,
        softwareVersionString,
        hardwareVersion,
        hardwareVersionString,
      );
    } else if (this.isGroup && this.group) {
      this.bridgedDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
        this.group.friendly_name,
        this.serial,
        0xfff1,
        'zigbee2MQTT',
        'Group',
        softwareVersion,
        softwareVersionString,
        hardwareVersion,
        hardwareVersionString,
      );
    }
    return this.bridgedDevice;
  }

  protected addPowerSource(): MatterbridgeEndpoint {
    if (!this.bridgedDevice) throw new Error('No bridged device');
    // Add PowerSource device type and cluster
    if (this.isDevice) {
      if (this.device?.power_source === 'Battery') {
        this.bridgedDevice.createDefaultPowerSourceReplaceableBatteryClusterServer(100, PowerSource.BatChargeLevel.Ok);
      } else {
        this.bridgedDevice.createDefaultPowerSourceWiredClusterServer();
      }
    }
    if (this.isGroup) {
      this.bridgedDevice.createDefaultPowerSourceWiredClusterServer();
    }
    return this.bridgedDevice;
  }

  /**
   * Verifies that all required server clusters are present on the main endpoint and child endpoints.
   *
   * @param {MatterbridgeEndpoint} endpoint - The device endpoint to verify.
   * @returns {boolean} True if all required server clusters are present, false otherwise.
   *
   * @remarks
   * This method checks if all required server clusters are present on the main endpoint and its child endpoints.
   * It logs an error message if any required server cluster is missing and returns false. If all required server
   * clusters are present, it returns true.
   */
  protected verifyMutableDevice(endpoint: MatterbridgeEndpoint): boolean {
    if (!endpoint) return false;

    // Verify that all required server clusters are present in the main endpoint and in the child endpoints
    for (const deviceType of endpoint.getDeviceTypes()) {
      for (const clusterId of deviceType.requiredServerClusters) {
        if (!endpoint.hasClusterServer(clusterId)) {
          endpoint.addClusterServers([clusterId]);
          this.log.warn(
            `Endpoint with device type ${deviceType.name} (0x${deviceType.code.toString(16)}) requires cluster server ${getClusterNameById(clusterId)} (0x${clusterId.toString(16)}) but it is not present on endpoint`,
          );
        }
      }
    }

    // Verify that all required server clusters are present in the child endpoints
    for (const childEndpoint of endpoint.getChildEndpoints()) {
      for (const deviceType of childEndpoint.getDeviceTypes()) {
        for (const clusterId of deviceType.requiredServerClusters) {
          if (!childEndpoint.hasClusterServer(clusterId)) {
            childEndpoint.addClusterServers([clusterId]);
            this.log.warn(
              `Child endpoint with device type ${deviceType.name} (0x${deviceType.code.toString(16)}) requires cluster server ${getClusterNameById(clusterId)} (0x${clusterId.toString(16)}) but it is not present on child endpoint`,
            );
          }
        }
      }
    }
    return true;
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
    if (this.bridgedDevice?.hasClusterServer(WindowCovering.Cluster.id)) {
      this.log.info(`Configuring ${this.bridgedDevice?.deviceName} WindowCovering cluster`);
      await this.bridgedDevice?.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.bridgedDevice?.hasClusterServer(DoorLock.Cluster.id)) {
      this.log.info(`Configuring ${this.bridgedDevice?.deviceName} DoorLock cluster`);
      const state = this.bridgedDevice?.getAttribute(DoorLock.Cluster.id, 'lockState', this.log);
      if (this.bridgedDevice.maybeNumber) {
        if (state === DoorLock.LockState.Locked)
          this.bridgedDevice?.triggerEvent(
            DoorLock.Cluster.id,
            'lockOperation',
            { lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
            this.log,
          );
        if (state === DoorLock.LockState.Unlocked)
          this.bridgedDevice?.triggerEvent(
            DoorLock.Cluster.id,
            'lockOperation',
            { lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null },
            this.log,
          );
      }
    }
    if (this.bridgedDevice?.hasClusterServer(ColorControl.Cluster.id)) {
      this.log.info(`Configuring ${this.bridgedDevice?.deviceName} ColorControl cluster`);
      const colorTemp = this.propertyMap.get('color_temp');
      this.bridgedDevice?.setAttribute(ColorControl.Cluster.id, 'colorTempPhysicalMinMireds', colorTemp?.value_min ?? 147, this.log);
      this.bridgedDevice?.setAttribute(ColorControl.Cluster.id, 'colorTempPhysicalMaxMireds', colorTemp?.value_max ?? 500, this.log);
    }
  }

  /**
   * Updates the attribute of a cluster on a device endpoint if the value has changed.
   *
   * @param {Endpoint} deviceEndpoint - The device endpoint to update.
   * @param {string | undefined} childEndpointName - The name of the child endpoint, if any.
   * @param {number} clusterId - The ID of the cluster to update.
   * @param {string} attributeName - The name of the attribute to update.
   * @param {PayloadValue} value - The new value of the attribute.
   * @param {string[]} [lookup] - Optional lookup array for converting string values to indices.
   *
   * @remarks
   * This method checks if the specified attribute of a cluster on a device endpoint has changed. If the attribute
   * has changed, it updates the attribute with the new value. If a lookup array is provided, it converts string
   * values to their corresponding indices in the lookup array. The method logs the update process and handles any
   * errors that occur during the update.
   */
  protected updateAttributeIfChanged(
    deviceEndpoint: MatterbridgeEndpoint,
    childEndpointName: string | undefined,
    clusterId: number,
    attributeName: string,
    value: PayloadValue,
    lookup?: string[],
  ): void {
    if (value === undefined) return;
    if (childEndpointName && childEndpointName !== '') {
      deviceEndpoint = this.bridgedDevice?.getChildEndpointByName(childEndpointName) ?? deviceEndpoint;
    }
    // const cluster = deviceEndpoint.getClusterServerById(ClusterId(clusterId));
    if (!deviceEndpoint.hasClusterServer(ClusterId(clusterId))) {
      this.log.debug(
        `Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} cluster ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db} not found: is z2m converter exposing all features?`,
      );
      return;
    }
    if (!deviceEndpoint.hasAttributeServer(ClusterId(clusterId), attributeName)) {
      this.log.debug(
        `Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} error attribute ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} not found`,
      );
      return;
    }
    if (lookup !== undefined) {
      if (typeof value === 'string' && lookup.indexOf(value) !== -1) {
        value = lookup.indexOf(value);
      } else {
        this.log.debug(
          `Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.name}:${deviceEndpoint.number}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} ` +
            `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} value ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db} not found in lookup ${debugStringify(lookup)}`,
        );
        return;
      }
    }
    const localValue = deviceEndpoint.getAttribute(ClusterId(clusterId), attributeName, undefined);
    if (typeof value === 'object' ? deepEqual(value, localValue) : value === localValue) {
      this.log.debug(
        `Skip update endpoint ${deviceEndpoint.name}:${deviceEndpoint.maybeNumber}${childEndpointName ? ' (' + childEndpointName + ')' : ''} ` +
          `attribute ${getClusterNameById(ClusterId(clusterId))}.${attributeName} already ${typeof value === 'object' ? debugStringify(value) : value}`,
      );
      return;
    }
    this.log.info(
      `${db}Update endpoint ${this.eidn}${deviceEndpoint.name}:${deviceEndpoint.maybeNumber}${db}${childEndpointName ? ' (' + zb + childEndpointName + db + ')' : ''} ` +
        `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}.${hk}${attributeName}${db} from ${YELLOW}${typeof localValue === 'object' ? debugStringify(localValue) : localValue}${db} to ${YELLOW}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
    );
    try {
      deviceEndpoint.setAttribute(ClusterId(clusterId), attributeName, value);
    } catch (error) {
      this.log.error(`Error setting attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${er}.${hk}${attributeName}${er} to ${value}: ${error}`);
    }
  }

  /**
   * Publishes a command to the specified entity with the given payload.
   *
   * @param {string} command - The command to execute.
   * @param {string} entityName - The name of the entity to publish the command to.
   * @param {Payload} payload - The payload of the command.
   *
   * @remarks
   * This method logs the execution of the command and publishes the command to the specified entity.
   * If the entity name starts with 'bridge/request', it publishes the payload without a 'set' suffix.
   * Otherwise, it publishes the payload with a 'set' suffix.
   */
  protected publishCommand(command: string, entityName: string, payload: Payload) {
    this.log.debug(`PublishCommand ${command} called for ${this.ien}${entityName}${rs}${db} payload: ${debugStringify(payload)}`);
    if (entityName.startsWith('bridge/request')) {
      this.platform.publish(entityName, '', JSON.stringify(payload));
    } else {
      this.platform.publish(entityName, 'set', JSON.stringify(payload));
    }
  }

  /**
   * Logs the property map of the Zigbee entity.
   *
   * @remarks
   * This method iterates over the property map of the Zigbee entity and logs each property's details,
   * including its name, type, values, minimum and maximum values, unit, and endpoint.
   */
  protected logPropertyMap() {
    // Log properties
    this.propertyMap.forEach((value, key) => {
      this.log.debug(
        `Property ${CYAN}${key}${db} name ${CYAN}${value.name}${db} type ${CYAN}${value.type === '' ? 'generic' : value.type}${db} endpoint ${CYAN}${value.endpoint === '' ? 'main' : value.endpoint}${db} ` +
          `category ${CYAN}${value.category}${db} description ${CYAN}${value.description}${db} label ${CYAN}${value.label}${db} unit ${CYAN}${value.unit}${db} ` +
          `values ${CYAN}${value.values}${db} value_min ${CYAN}${value.value_min}${db} value_max ${CYAN}${value.value_max}${db}`,
      );
    });
  }
}

/**
 * Represents a Zigbee group entity.
 *
 * @class
 * @augments {ZigbeeEntity}
 */
export class ZigbeeGroup extends ZigbeeEntity {
  /**
   * Creates an instance of ZigbeeGroup.
   *
   * @param {ZigbeePlatform} platform - The Zigbee platform instance.
   * @param {BridgeGroup} group - The bridge group instance.
   */
  private constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);
  }

  /**
   * Creates a new ZigbeeGroup instance.
   *
   * @param {ZigbeePlatform} platform - The Zigbee platform instance.
   * @param {BridgeGroup} group - The bridge group instance.
   * @returns {Promise<ZigbeeGroup>} A promise that resolves to the created ZigbeeGroup instance.
   *
   * @remarks
   * This method initializes a new ZigbeeGroup instance, sets up its properties, and configures the device
   * based on the group members. It also adds command handlers for the group.
   */
  static async create(platform: ZigbeePlatform, group: BridgeGroup): Promise<ZigbeeGroup> {
    const zigbeeGroup = new ZigbeeGroup(platform, group);

    if (zigbeeGroup.platform.postfix !== '') {
      zigbeeGroup.serial = `group-${group.id}-${zigbeeGroup.platform.postfix}`.slice(0, 32);
    } else {
      zigbeeGroup.serial = `group-${group.id}`.slice(0, 32);
    }

    // Set the device entity select
    platform.setSelectDevice(`group-${group.id}`, group.friendly_name, 'wifi');

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
      zigbeeGroup.log.debug(`Group: ${gn}${group.friendly_name}${rs}${db} is a ${CYAN}virtual${db} group`);
      zigbeeGroup.bridgedDevice = new MatterbridgeEndpoint(
        [onOffSwitch, bridgedNode, powerSource],
        { uniqueStorageKey: group.friendly_name },
        zigbeeGroup.log.logLevel === LogLevel.DEBUG,
      );
      isSwitch = true;
      zigbeeGroup.propertyMap.set('state', { name: 'state', type: 'switch', endpoint: '' });
    } else {
      // Create a switch or light or outlet device for the group
      group.members.forEach((member) => {
        const device = zigbeeGroup.platform.z2mBridgeDevices?.find((device) => device.ieee_address === member.ieee_address);
        if (!device) return;
        zigbeeGroup.log.debug(`Group ${gn}${group.friendly_name}${db}: member device ${dn}${device.friendly_name}${db}`);
        device.definition?.exposes.forEach((expose) => {
          if (expose.features) {
            // Specific features with type
            expose.features?.forEach((feature) => {
              if (expose.type === 'lock' && feature.name === 'state' && feature.property === 'child_lock') {
                expose.type = 'child_lock';
                feature.name = 'child_lock';
              }
              zigbeeGroup.log.debug(
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
            zigbeeGroup.log.debug(`- generic type ${CYAN}${expose.type}${db} expose name ${CYAN}${expose.name}${db} property ${CYAN}${expose.property}${db}`);
          }
        });
      });
      zigbeeGroup.log.debug(
        `Group ${gn}${group.friendly_name}${rs}${db} switch: ${CYAN}${isSwitch}${db} light: ${CYAN}${isLight}${db} cover: ${CYAN}${isCover}${db} thermostat: ${CYAN}${isThermostat}${db}`,
      );
      zigbeeGroup.log.debug(
        `Group ${gn}${group.friendly_name}${rs}${db} state: ${CYAN}${useState}${db} brightness: ${CYAN}${useBrightness}${db} color: ${CYAN}${useColor}${db} color_temp: ${CYAN}${useColorTemperature}${db} min: ${CYAN}${minColorTemperature}${db} max: ${CYAN}${maxColorTemperature}${db}`,
      );
      let deviceType: DeviceTypeDefinition | undefined;
      if (useState) {
        deviceType = onOffLight;
        if (platform.switchList.includes(group.friendly_name)) deviceType = onOffSwitch;
        else if (platform.lightList.includes(group.friendly_name)) deviceType = onOffLight;
        else if (platform.outletList.includes(group.friendly_name)) deviceType = onOffOutlet;
        zigbeeGroup.propertyMap.set('state', { name: 'state', type: isLight ? 'light' : 'switch', endpoint: '' });
      }
      if (useBrightness) {
        deviceType = dimmableLight;
        zigbeeGroup.propertyMap.set('brightness', { name: 'brightness', type: 'light', endpoint: '' });
      }
      if (useColorTemperature) {
        deviceType = colorTemperatureLight;
        zigbeeGroup.propertyMap.set('color_temp', { name: 'color_temp', type: 'light', endpoint: '' });
      }
      if (useColor) {
        deviceType = extendedColorLight;
        zigbeeGroup.propertyMap.set('color', { name: 'color', type: 'light', endpoint: '' });
      }
      if (isCover) {
        deviceType = coverDevice;
        zigbeeGroup.propertyMap.set('state', { name: 'state', type: 'cover', endpoint: '' });
        zigbeeGroup.propertyMap.set('position', { name: 'position', type: 'cover', endpoint: '' });
        zigbeeGroup.propertyMap.set('moving', { name: 'moving', type: 'cover', endpoint: '' });
      }
      if (isThermostat) {
        deviceType = thermostatDevice;
        zigbeeGroup.propertyMap.set('local_temperature', { name: 'local_temperature', type: 'climate', endpoint: '' });
        zigbeeGroup.propertyMap.set('current_heating_setpoint', { name: 'current_heating_setpoint', type: 'climate', endpoint: '' });
        zigbeeGroup.propertyMap.set('current_cooling_setpoint', { name: 'current_cooling_setpoint', type: 'climate', endpoint: '' });
        zigbeeGroup.propertyMap.set('running_state', { name: 'running_state', type: 'climate', endpoint: '' });
        zigbeeGroup.propertyMap.set('system_mode', { name: 'system_mode', type: 'climate', endpoint: '' });
      }
      if (!deviceType) return zigbeeGroup;
      zigbeeGroup.bridgedDevice = new MatterbridgeEndpoint(
        [deviceType, bridgedNode, powerSource],
        { uniqueStorageKey: group.friendly_name },
        zigbeeGroup.log.logLevel === LogLevel.DEBUG,
      );
    }

    if (!platform.featureBlackList?.includes('scenes') && !platform.deviceFeatureBlackList[group.friendly_name]?.includes('scenes')) {
      group.scenes.forEach((scene) => {
        zigbeeGroup.log.debug(`***Group ${gn}${group.friendly_name}${rs}${db} scene ${CYAN}${scene.name}${db} id ${CYAN}${scene.id}${db}`);
        platform.setSelectDeviceEntity(`group-${group.id}`, 'scenes', 'Scenes', 'component');
        platform._registerVirtualDevice(`${platform.config.scenesPrefix ? group.friendly_name + ' ' : ''}${scene.name}`, async () => {
          zigbeeGroup.log.info(`Triggered scene "${scene.name}" id ${scene.id} from group ${group.friendly_name}`);
          zigbeeGroup.publishCommand('scene_recall', group.friendly_name, { scene_recall: scene.id });
        });
      });
    }

    zigbeeGroup.addBridgedDeviceBasicInformation();
    zigbeeGroup.addPowerSource();
    zigbeeGroup.bridgedDevice.addRequiredClusterServers();

    // Verify the device
    if (!zigbeeGroup.bridgedDevice || !zigbeeGroup.verifyMutableDevice(zigbeeGroup.bridgedDevice)) return zigbeeGroup;

    // Clear the mutable device from memory
    zigbeeGroup.mutableDevice.clear();

    // Log properties
    zigbeeGroup.logPropertyMap();

    // Add command handlers
    if (isSwitch || isLight) {
      if (isSwitch && !isLight) await zigbeeGroup.bridgedDevice.addFixedLabel('type', 'switch');
      if (isLight) await zigbeeGroup.bridgedDevice.addFixedLabel('type', 'light');
      zigbeeGroup.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
        zigbeeGroup.log.debug(`Command identify called for ${zigbeeGroup.ien}${group.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
        // logEndpoint(zigbeeGroup.bridgedDevice!);
      });
      if (zigbeeGroup.bridgedDevice.hasClusterServer(OnOff.Cluster.id)) {
        zigbeeGroup.bridgedDevice.addCommandHandler('on', zigbeeGroup.onCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('off', zigbeeGroup.offCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('toggle', zigbeeGroup.toggleCommandHandler.bind(zigbeeGroup));
      }
      for (const child of zigbeeGroup.bridgedDevice.getChildEndpoints()) {
        if (child.hasClusterServer(OnOff.Cluster.id)) {
          child.addCommandHandler('on', zigbeeGroup.onCommandHandler.bind(zigbeeGroup));
          child.addCommandHandler('off', zigbeeGroup.offCommandHandler.bind(zigbeeGroup));
          child.addCommandHandler('toggle', zigbeeGroup.toggleCommandHandler.bind(zigbeeGroup));
        }
      }
    }
    if (isLight) {
      if (useBrightness) {
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToLevel', zigbeeGroup.moveToLevelCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', zigbeeGroup.moveToLevelWithOnOffCommandHandler.bind(zigbeeGroup));
      }
      if (useColorTemperature) {
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToColorTemperature', zigbeeGroup.moveToColorTemperatureCommandHandler.bind(zigbeeGroup));
      }
      if (useColor) {
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToHue', zigbeeGroup.moveToHueCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToSaturation', zigbeeGroup.moveToSaturationCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToHueAndSaturation', zigbeeGroup.moveToHueAndSaturationCommandHandler.bind(zigbeeGroup));
        zigbeeGroup.bridgedDevice.addCommandHandler('moveToColor', zigbeeGroup.moveToColorCommandHandler.bind(zigbeeGroup));
      }
    }
    if (isCover) {
      await zigbeeGroup.bridgedDevice.addFixedLabel('type', 'cover');
      zigbeeGroup.bridgedDevice.addCommandHandler('upOrOpen', async () => {
        zigbeeGroup.log.debug(`Command upOrOpen called for ${zigbeeGroup.ien}${group.friendly_name}${rs}${db}`);
        await zigbeeGroup.bridgedDevice?.setWindowCoveringCurrentTargetStatus(0, 0, WindowCovering.MovementStatus.Stopped);
        zigbeeGroup.publishCommand('upOrOpen', group.friendly_name, { state: 'OPEN' });
      });
      zigbeeGroup.bridgedDevice.addCommandHandler('downOrClose', async () => {
        zigbeeGroup.log.debug(`Command downOrClose called for ${zigbeeGroup.ien}${group.friendly_name}${rs}${db}`);
        await zigbeeGroup.bridgedDevice?.setWindowCoveringCurrentTargetStatus(10000, 10000, WindowCovering.MovementStatus.Stopped);
        zigbeeGroup.publishCommand('downOrClose', group.friendly_name, { state: 'CLOSE' });
      });
      zigbeeGroup.bridgedDevice.addCommandHandler('stopMotion', async () => {
        zigbeeGroup.log.debug(`Command stopMotion called for ${zigbeeGroup.ien}${group.friendly_name}${rs}${db}`);
        await zigbeeGroup.bridgedDevice?.setWindowCoveringTargetAsCurrentAndStopped();
        zigbeeGroup.publishCommand('stopMotion', group.friendly_name, { state: 'STOP' });
      });
      zigbeeGroup.bridgedDevice.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue } }) => {
        zigbeeGroup.log.debug(`Command goToLiftPercentage called for ${zigbeeGroup.ien}${group.friendly_name}${rs}${db} liftPercent100thsValue: ${liftPercent100thsValue}`);
        await zigbeeGroup.bridgedDevice?.setWindowCoveringCurrentTargetStatus(liftPercent100thsValue, liftPercent100thsValue, WindowCovering.MovementStatus.Stopped);
        zigbeeGroup.publishCommand('goToLiftPercentage', group.friendly_name, { position: 100 - liftPercent100thsValue / 100 });
      });
    }
    if (isThermostat) {
      await zigbeeGroup.bridgedDevice.addFixedLabel('type', 'climate');
      zigbeeGroup.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'systemMode',
        (newValue: number, oldValue: number) => {
          zigbeeGroup.bridgedDevice?.log.info(`Thermostat systemMode changed from ${oldValue} to ${newValue}`);
          if (oldValue !== newValue) {
            // Thermostat.SystemMode.Heat && newValue === Thermostat.SystemMode.Off
            zigbeeGroup.bridgedDevice?.log.info(`Setting thermostat systemMode to ${newValue}`);
            if (newValue === Thermostat.SystemMode.Off) {
              zigbeeGroup.publishCommand('SystemMode', group.friendly_name, { system_mode: 'off' });
            } else if (newValue === Thermostat.SystemMode.Heat) {
              zigbeeGroup.publishCommand('SystemMode', group.friendly_name, { system_mode: 'heat' });
            } else if (newValue === Thermostat.SystemMode.Cool) {
              zigbeeGroup.publishCommand('SystemMode', group.friendly_name, { system_mode: 'cool' });
            }
            zigbeeGroup.noUpdate = true;
            zigbeeGroup.thermostatTimeout = setTimeout(() => {
              zigbeeGroup.noUpdate = false;
            }, zigbeeGroup.thermostatTimeoutTime);
          }
        },
        zigbeeGroup.log,
      );
      zigbeeGroup.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'occupiedHeatingSetpoint',
        (newValue: number, oldValue: number) => {
          zigbeeGroup.bridgedDevice?.log.info(`Thermostat occupiedHeatingSetpoint changed from ${oldValue / 100} to ${newValue / 100}`);
          zigbeeGroup.bridgedDevice?.log.info(`Setting thermostat occupiedHeatingSetpoint to ${newValue / 100}`);
          zigbeeGroup.publishCommand('CurrentHeatingSetpoint', group.friendly_name, { current_heating_setpoint: Math.round(newValue / 100) });
          zigbeeGroup.publishCommand('OccupiedHeatingSetpoint', group.friendly_name, { occupied_heating_setpoint: Math.round(newValue / 100) });
          zigbeeGroup.noUpdate = true;
          zigbeeGroup.thermostatTimeout = setTimeout(() => {
            zigbeeGroup.noUpdate = false;
          }, zigbeeGroup.thermostatTimeoutTime);
        },
        zigbeeGroup.log,
      );
      zigbeeGroup.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'occupiedCoolingSetpoint',
        (newValue: number, oldValue: number) => {
          zigbeeGroup.bridgedDevice?.log.info(`Thermostat occupiedCoolingSetpoint changed from ${oldValue / 100} to ${newValue / 100}`);
          zigbeeGroup.bridgedDevice?.log.info(`Setting thermostat occupiedCoolingSetpoint to ${newValue / 100}`);
          zigbeeGroup.publishCommand('CurrentCoolingSetpoint', group.friendly_name, { current_heating_setpoint: Math.round(newValue / 100) });
          zigbeeGroup.publishCommand('OccupiedCoolingSetpoint', group.friendly_name, { occupied_cooling_setpoint: Math.round(newValue / 100) });
          zigbeeGroup.noUpdate = true;
          zigbeeGroup.thermostatTimeout = setTimeout(() => {
            zigbeeGroup.noUpdate = false;
          }, zigbeeGroup.thermostatTimeoutTime);
        },
        zigbeeGroup.log,
      );
    }
    return zigbeeGroup;
  }
}

interface ZigbeeToMatter {
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
const z2ms: ZigbeeToMatter[] = [
  { type: 'switch', name: 'state', property: 'state', deviceType: onOffSwitch, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'switch', name: 'brightness', property: 'brightness', deviceType: dimmableSwitch, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(1, Math.min(254, value)) } },
  { type: 'switch', name: 'color_hs', property: 'color_hs', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'switch', name: 'color_xy', property: 'color_xy', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'switch', name: 'color_temp', property: 'color_temp', deviceType: colorTemperatureSwitch, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'outlet', name: 'state', property: 'state', deviceType: onOffOutlet, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'outlet', name: 'brightness', property: 'brightness', deviceType: dimmableOutlet, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(1, Math.min(254, value)) } },
  { type: 'light', name: 'state', property: 'state', deviceType: onOffLight, cluster: OnOff.Cluster.id, attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'light', name: 'brightness', property: 'brightness', deviceType: dimmableLight, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(1, Math.min(254, value)) } },
  { type: 'light', name: 'color_hs', property: 'color_hs', deviceType: extendedColorLight, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'light', name: 'color_xy', property: 'color_xy', deviceType: extendedColorLight, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'light', name: 'color_temp', property: 'color_temp', deviceType: colorTemperatureLight, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'cover', name: 'state', property: 'state', deviceType: coverDevice, cluster: WindowCovering.Cluster.id, attribute: 'targetPositionLiftPercent100ths' },
  { type: 'cover', name: 'moving', property: 'moving', deviceType: coverDevice, cluster: WindowCovering.Cluster.id, attribute: 'operationalStatus' },
  { type: 'cover', name: 'position', property: 'position', deviceType: coverDevice, cluster: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths' },
  { type: 'lock', name: 'state', property: 'state', deviceType: doorLockDevice, cluster: DoorLock.Cluster.id, attribute: 'lockState', converter: (value) => { return value === 'LOCK' ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked } },
  { type: 'climate', name: 'local_temperature', property: 'local_temperature', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'current_heating_setpoint', property: 'current_heating_setpoint', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint' },
  { type: 'climate', name: 'occupied_heating_setpoint', property: 'occupied_heating_setpoint', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'occupied_cooling_setpoint', property: 'occupied_cooling_setpoint', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'unoccupied_heating_setpoint', property: 'unoccupied_heating_setpoint', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'unoccupied_cooling_setpoint', property: 'unoccupied_cooling_setpoint', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'running_state', property: 'running_state', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'thermostatRunningMode', valueLookup: ['idle', '', '', 'cool', 'heat'] },
  { type: 'climate', name: 'system_mode', property: 'system_mode', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'systemMode', valueLookup: ['off', 'auto', '', 'cool', 'heat', '', '', 'fan_only'] },
  { type: '', name: 'min_temperature_limit', property: 'min_temperature_limit', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'minHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'max_temperature_limit', property: 'max_temperature_limit', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'maxHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'min_heat_setpoint_limit', property: 'min_heat_setpoint_limit', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'minHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: '', name: 'max_heat_setpoint_limit', property: 'max_heat_setpoint_limit', deviceType: thermostatDevice, cluster: Thermostat.Cluster.id, attribute: 'maxHeatSetpointLimit', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },

  { type: '', name: 'presence', property: 'presence', deviceType: occupancySensor, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '', name: 'occupancy', property: 'occupancy', deviceType: occupancySensor, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '', name: 'illuminance', property: 'illuminance', deviceType: lightSensor, cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) } },
  { type: '', name: 'contact', property: 'contact', deviceType: contactSensor, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '', name: 'water_leak', property: 'water_leak', deviceType: waterLeakDetector, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '', name: 'rain', property: 'rain', deviceType: rainSensor, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '', name: 'vibration', property: 'vibration', deviceType: contactSensor, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'smoke', property: 'smoke', deviceType: smokeCoAlarm, cluster: SmokeCoAlarm.Cluster.id, attribute: 'smokeState', converter: (value) => { return value ? SmokeCoAlarm.AlarmState.Critical : SmokeCoAlarm.AlarmState.Normal } },
  { type: '', name: 'carbon_monoxide', property: 'carbon_monoxide', deviceType: contactSensor, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '', name: 'temperature', property: 'temperature', deviceType: temperatureSensor, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'humidity', property: 'humidity', deviceType: humiditySensor, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'soil_moisture', property: 'soil_moisture', deviceType: humiditySensor, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'pressure', property: 'pressure', deviceType: pressureSensor, cluster: PressureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return value } },
  { type: '', name: 'air_quality', property: 'air_quality', deviceType: airQualitySensor, cluster: AirQuality.Cluster.id, attribute: 'airQuality', valueLookup: ['unknown', 'excellent', 'good', 'moderate', 'poor', 'unhealthy', 'out_of_range'] },
  { type: '', name: 'voc', property: 'voc', deviceType: airQualitySensor, cluster: TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.min(65535, value) } },
  { type: '', name: 'co', property: 'co', deviceType: airQualitySensor, cluster: CarbonMonoxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'co2', property: 'co2', deviceType: airQualitySensor, cluster: CarbonDioxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'formaldehyd', property: 'formaldehyd', deviceType: airQualitySensor, cluster: FormaldehydeConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm1', property: 'pm1', deviceType: airQualitySensor, cluster: Pm1ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm25', property: 'pm25', deviceType: airQualitySensor, cluster: Pm25ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'pm10', property: 'pm10', deviceType: airQualitySensor, cluster: Pm10ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value) } },
  { type: '', name: 'cpu_temperature', property: 'temperature', deviceType: temperatureSensor, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: 'device_temperature', property: 'device_temperature', deviceType: temperatureSensor, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '', name: '', property: 'battery', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batPercentRemaining', converter: (value) => { return Math.round(value * 2) } },
  { type: '', name: '', property: 'battery_low', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batChargeLevel', converter: (value) => { return value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok } },
  { type: '', name: '', property: 'battery_voltage', deviceType: powerSource, cluster: PowerSource.Cluster.id, attribute: 'batVoltage', converter: (value) => { return value } },
  { type: '', name: 'energy', property: 'energy', deviceType: electricalSensor, cluster: ElectricalEnergyMeasurement.Cluster.id, attribute: 'cumulativeEnergyImported', converter: (value) => { return { energy: Math.round(value * 1000000) } } },
  { type: '', name: 'power', property: 'power', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'activePower', converter: (value) => { return Math.round(value * 1000) } },
  { type: '', name: 'voltage', property: 'voltage', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'voltage', converter: (value) => { return Math.round(value * 1000) } },
  { type: '', name: 'current', property: 'current', deviceType: electricalSensor, cluster: ElectricalPowerMeasurement.Cluster.id, attribute: 'activeCurrent', converter: (value) => { return Math.round(value * 1000) } },
];

/**
 * Represents a Zigbee device entity.
 *
 * @class
 * @augments {ZigbeeEntity}
 */
export class ZigbeeDevice extends ZigbeeEntity {
  /**
   * Represents a Zigbee device entity.
   *
   * @param {ZigbeePlatform} platform - The Zigbee platform instance.
   * @param {BridgeDevice} device - The bridge device instance.
   * @class
   * @augments {ZigbeeEntity}
   */
  private constructor(platform: ZigbeePlatform, device: BridgeDevice) {
    super(platform, device);
  }

  /**
   * Creates a new ZigbeeDevice instance.
   *
   * @param {ZigbeePlatform} platform - The Zigbee platform instance.
   * @param {BridgeDevice} device - The bridge device instance.
   * @returns {Promise<ZigbeeDevice>} A promise that resolves to the created ZigbeeDevice instance.
   *
   * @remarks
   * This method initializes a new ZigbeeDevice instance, sets up its properties, and configures the device
   * based on the device definition and options. It also adds command handlers for the device.
   */
  static async create(platform: ZigbeePlatform, device: BridgeDevice): Promise<ZigbeeDevice> {
    const zigbeeDevice = new ZigbeeDevice(platform, device);

    zigbeeDevice.serial = `${device.ieee_address}`;
    if (zigbeeDevice.platform.postfix !== '') {
      zigbeeDevice.serial = `${zigbeeDevice.serial}-${zigbeeDevice.platform.postfix}`.slice(0, 32);
    }

    // Set Coordinator and dedicated routers
    if (
      device.friendly_name === 'Coordinator' ||
      (device.model_id === 'ti.router' && device.manufacturer === 'TexasInstruments') ||
      (device.model_id.startsWith('SLZB-') && device.manufacturer === 'SMLIGHT')
    ) {
      zigbeeDevice.isRouter = true;

      // zigbeeDevice.log.debug(`***Device ${zigbeeDevice.en}${device.friendly_name}${db} adds select device ${device.ieee_address} (${device.friendly_name})`);
      platform.setSelectDevice(device.ieee_address, device.friendly_name, 'wifi');

      zigbeeDevice.bridgedDevice = new MatterbridgeEndpoint(
        [doorLockDevice, bridgedNode, powerSource],
        { uniqueStorageKey: device.friendly_name },
        zigbeeDevice.log.logLevel === LogLevel.DEBUG,
      );
      zigbeeDevice.addBridgedDeviceBasicInformation();
      zigbeeDevice.addPowerSource();
      zigbeeDevice.bridgedDevice.addRequiredClusterServers();
      await zigbeeDevice.bridgedDevice.addFixedLabel('type', 'lock');
      zigbeeDevice.verifyMutableDevice(zigbeeDevice.bridgedDevice);

      zigbeeDevice.bridgedDevice.addCommandHandler('identify', async (data) => {
        zigbeeDevice.log.debug(`Command identify called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} request identifyTime:${data.request.identifyTime} `);
        // logEndpoint(zigbeeDevice.bridgedDevice);
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('lockDoor', async () => {
        zigbeeDevice.log.debug(`Command permit_join false called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`);
        await zigbeeDevice.bridgedDevice?.setAttribute(DoorLockCluster.id, 'lockState', DoorLock.LockState.Locked, zigbeeDevice.log);
        zigbeeDevice.publishCommand('permit_join false', 'bridge/request/permit_join', { value: false });
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('unlockDoor', async () => {
        zigbeeDevice.log.debug(`Command permit_join true called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`);
        await zigbeeDevice.bridgedDevice?.setAttribute(DoorLockCluster.id, 'lockState', DoorLock.LockState.Unlocked, zigbeeDevice.log);
        zigbeeDevice.publishCommand('permit_join true', 'bridge/request/permit_join', { value: true });
      });

      return zigbeeDevice;
    }

    if (!platform.featureBlackList?.includes('scenes') && !platform.deviceFeatureBlackList[device.friendly_name]?.includes('scenes')) {
      Object.entries(device.endpoints).forEach(([key, endpoint]) => {
        Object.values(endpoint.scenes).forEach((scene) => {
          zigbeeDevice.log.debug(`***Device ${dn}${device.friendly_name}${rs}${db} endpoint ${CYAN}${key}${db} scene ${CYAN}${scene.name}${db} id ${CYAN}${scene.id}${db}`);
          platform.setSelectDeviceEntity(device.ieee_address, 'scenes', 'Scenes', 'component');
          platform._registerVirtualDevice(`${platform.config.scenesPrefix ? device.friendly_name + ' ' : ''}${scene.name}`, async () => {
            zigbeeDevice.log.info(`Triggered scene "${scene.name}" id ${scene.id} from device ${device.friendly_name}`);
            zigbeeDevice.publishCommand('scene_recall', device.friendly_name, { scene_recall: scene.id });
          });
        });
      });
    }

    // Get types and properties
    const types: string[] = [];
    const endpoints: string[] = [];
    const names: string[] = [];
    const properties: string[] = [];
    const categories: string[] = [];
    const descriptions: string[] = [];
    const labels: string[] = [];
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
          categories.push(feature.category ?? '');
          descriptions.push(feature.description ?? '');
          labels.push(feature.label ?? '');
          units.push(feature.unit ?? '');
          value_mins.push(feature.value_min ?? NaN);
          value_maxs.push(feature.value_max ?? NaN);
          values.push(feature.values ? feature.values.join('|') : '');
        });
      } else {
        // Generic features without type

        // Change voltage to battery_voltage for battery powered devices
        if (device.power_source === 'Battery' && expose.name === 'voltage') expose.name = 'battery_voltage';
        if (device.power_source === 'Battery' && expose.property === 'voltage') expose.property = 'battery_voltage';

        types.push('');
        endpoints.push(expose.endpoint || '');
        names.push(expose.name || '');
        properties.push(expose.property);
        categories.push(expose.category ?? '');
        descriptions.push(expose.description ?? '');
        labels.push(expose.label ?? '');
        units.push(expose.unit ?? '');
        value_mins.push(expose.value_min ?? NaN);
        value_maxs.push(expose.value_max ?? NaN);
        values.push(expose.values ? expose.values.join('|') : '');
        if (expose.name === 'action' && expose.values) {
          zigbeeDevice.actions.push(...expose.values);
        }
      }
    });
    device.definition?.options.forEach((option) => {
      types.push('');
      endpoints.push(option.endpoint || '');
      names.push(option.name || '');
      properties.push(option.property);
      categories.push(option.category ?? '');
      descriptions.push(option.description ?? '');
      labels.push(option.label ?? '');
      units.push(option.unit ?? '');
      value_mins.push(option.value_min ?? NaN);
      value_maxs.push(option.value_max ?? NaN);
      values.push(option.values ? option.values.join('|') : '');
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

    // Set the device entity select
    platform.setSelectEntity('last_seen', 'Last seen', 'hub');
    for (const [index, property] of properties.entries()) {
      // zigbeeDevice.log.debug(`***Device ${zigbeeDevice.en}${device.friendly_name}${db} adds select device ${device.ieee_address} (${device.friendly_name})`);
      platform.setSelectDevice(device.ieee_address, device.friendly_name, 'wifi');

      // zigbeeDevice.log.debug(`***Device ${zigbeeDevice.en}${device.friendly_name}${db} adds select entity ${property} (${descriptions[index]})`);
      if (endpoints[index] === '') platform.setSelectEntity(property, descriptions[index], 'hub');
      platform.setSelectDeviceEntity(device.ieee_address, property, descriptions[index], 'hub');
    }

    // Set the global and device based feature blacklist
    if (platform.featureBlackList) zigbeeDevice.ignoreFeatures = [...zigbeeDevice.ignoreFeatures, ...platform.featureBlackList];
    if (platform.deviceFeatureBlackList[device.friendly_name])
      zigbeeDevice.ignoreFeatures = [...zigbeeDevice.ignoreFeatures, ...platform.deviceFeatureBlackList[device.friendly_name]];

    /*
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - types[${types.length}]: ${debugStringify(types)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - endpoints[${endpoints.length}]: ${debugStringify(endpoints)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - names[${names.length}]: ${debugStringify(names)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - properties[${properties.length}]: ${debugStringify(properties)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - categories[${categories.length}]: ${debugStringify(categories)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - descriptions[${descriptions.length}]: ${debugStringify(descriptions)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - labels[${labels.length}]: ${debugStringify(labels)}`);
    zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} - units[${units.length}]: ${debugStringify(units)}`);
    */

    for (const [index, name] of names.entries()) {
      if (platform.featureBlackList.includes(name) || platform.featureBlackList.includes(properties[index])) {
        zigbeeDevice.log.debug(`Device ${zigbeeDevice.en}${device.friendly_name}${db} feature ${name} property ${properties[index]} is globally blacklisted`);
        continue;
      }
      if (platform.deviceFeatureBlackList[device.friendly_name]?.includes(name) || platform.deviceFeatureBlackList[device.friendly_name]?.includes(properties[index])) {
        zigbeeDevice.log.debug(`Device ${zigbeeDevice.en}${device.friendly_name}${db} feature ${name} property ${properties[index]} is blacklisted`);
        continue;
      }
      if (name === 'transition') {
        zigbeeDevice.log.debug(`*Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} transition is supported`);
        zigbeeDevice.transition = true;
      }
      const type = types[index];
      const endpoint = endpoints[index];
      const property = properties[index];
      const unit = units[index];
      const category = categories[index];
      const description = descriptions[index];
      const label = labels[index];
      const value_min = value_mins[index];
      const value_max = value_maxs[index];
      const value = values[index];
      const z2m = z2ms.find((z2m) => z2m.type === type && z2m.name === name);
      if (z2m) {
        zigbeeDevice.log.debug(
          `Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => deviceType: ${z2m.deviceType?.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`,
        );
        zigbeeDevice.propertyMap.set(property, { name, type, endpoint, category, description, label, unit, value_min, value_max, values: value });
        if (endpoint === '') {
          /* prettier-ignore */
          if (!zigbeeDevice.mutableDevice.has(endpoint)) { zigbeeDevice.mutableDevice.set(endpoint, { tagList: [], deviceTypes: [z2m.deviceType], clusterServersIds: [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)], clusterServersOptions: [], clusterClientsIds: [], clusterClientsOptions: [] });
          } else {
            zigbeeDevice.mutableDevice.get(endpoint)?.deviceTypes.push(z2m.deviceType);
            zigbeeDevice.mutableDevice.get(endpoint)?.clusterServersIds.push(...z2m.deviceType.requiredServerClusters);
            zigbeeDevice.mutableDevice.get(endpoint)?.clusterServersIds.push(ClusterId(z2m.cluster));
          }
        } else {
          const tagList: { mfgCode: VendorId | null; namespaceId: number; tag: number; label?: string | null }[] = [];
          if (endpoint === 'l1') tagList.push({ mfgCode: null, namespaceId: NumberTag.One.namespaceId, tag: NumberTag.One.tag, label: 'endpoint ' + endpoint });
          if (endpoint === 'l2') tagList.push({ mfgCode: null, namespaceId: NumberTag.Two.namespaceId, tag: NumberTag.Two.tag, label: 'endpoint ' + endpoint });
          if (endpoint === 'l3') tagList.push({ mfgCode: null, namespaceId: NumberTag.Three.namespaceId, tag: NumberTag.Three.tag, label: 'endpoint ' + endpoint });
          if (endpoint === 'l4') tagList.push({ mfgCode: null, namespaceId: NumberTag.Four.namespaceId, tag: NumberTag.Four.tag, label: 'endpoint ' + endpoint });
          if (endpoint === 'l5') tagList.push({ mfgCode: null, namespaceId: NumberTag.Five.namespaceId, tag: NumberTag.Five.tag, label: 'endpoint ' + endpoint });
          if (endpoint === 'l6') tagList.push({ mfgCode: null, namespaceId: NumberTag.Six.namespaceId, tag: NumberTag.Six.tag, label: 'endpoint ' + endpoint });
          tagList.push({ mfgCode: null, namespaceId: SwitchesTag.Custom.namespaceId, tag: SwitchesTag.Custom.tag, label: 'endpoint ' + endpoint });
          /* prettier-ignore */
          if (!zigbeeDevice.mutableDevice.has(endpoint)) { zigbeeDevice.mutableDevice.set(endpoint, { tagList, deviceTypes: [z2m.deviceType], clusterServersIds: [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)], clusterServersOptions: [], clusterClientsIds: [], clusterClientsOptions: [] });
          } else {
            zigbeeDevice.mutableDevice.get(endpoint)?.deviceTypes.push(z2m.deviceType);
            zigbeeDevice.mutableDevice.get(endpoint)?.clusterServersIds.push(...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster));
          }
          if (zigbeeDevice.composedType === '') zigbeeDevice.composedType = type;
          zigbeeDevice.hasEndpoints = true;
        }
      } else {
        // zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => no mapping found`);
      }

      // Map actions to switches
      if (name === 'action' && zigbeeDevice.actions.length) {
        zigbeeDevice.log.info(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${nf} has actions mapped to these switches on sub endpoints:`);
        zigbeeDevice.log.info('   controller events      <=> zigbee2mqtt actions');
        if (!zigbeeDevice.bridgedDevice)
          zigbeeDevice.bridgedDevice = new MatterbridgeEndpoint([bridgedNode], { uniqueStorageKey: device.friendly_name }, zigbeeDevice.log.logLevel === LogLevel.DEBUG);
        zigbeeDevice.hasEndpoints = true;
        // Mapping actions
        const switchMap = ['Single Press', 'Double Press', 'Long Press  '];
        const triggerMap = ['Single', 'Double', 'Long'];
        let count = 1;
        if (zigbeeDevice.actions.length <= 3) {
          const actionsMap: string[] = [];
          for (let a = 0; a < zigbeeDevice.actions.length; a++) {
            actionsMap.push(zigbeeDevice.actions[a]);
            zigbeeDevice.propertyMap.set('action_' + actionsMap[a], { name, type: '', endpoint: 'switch_' + count, action: triggerMap[a] });
            zigbeeDevice.log.info(`-- Button ${count}: ${hk}${switchMap[a]}${nf} <=> ${zb}${actionsMap[a]}${nf}`);
          }
          const tagList: { mfgCode: VendorId | null; namespaceId: number; tag: number; label?: string | null }[] = [];
          tagList.push({ mfgCode: null, namespaceId: SwitchesTag.Custom.namespaceId, tag: SwitchesTag.Custom.tag, label: 'switch_' + count });
          zigbeeDevice.mutableDevice.set('switch_' + count, {
            tagList,
            deviceTypes: [genericSwitch],
            clusterServersIds: [...genericSwitch.requiredServerClusters],
            clusterServersOptions: [],
            clusterClientsIds: [],
            clusterClientsOptions: [],
          });
        } else {
          for (let i = 0; i < zigbeeDevice.actions.length; i += 3) {
            const actionsMap: string[] = [];
            for (let a = i; a < i + 3 && a < zigbeeDevice.actions.length; a++) {
              actionsMap.push(zigbeeDevice.actions[a]);
              zigbeeDevice.propertyMap.set('action_' + actionsMap[a - i], { name, type: '', endpoint: 'switch_' + count, action: triggerMap[a - i] });
              zigbeeDevice.log.info(`-- Button ${count}: ${hk}${switchMap[a - i]}${nf} <=> ${zb}${actionsMap[a - i]}${nf}`);
            }
            const tagList: { mfgCode: VendorId | null; namespaceId: number; tag: number; label?: string | null }[] = [];
            tagList.push({ mfgCode: null, namespaceId: SwitchesTag.Custom.namespaceId, tag: SwitchesTag.Custom.tag, label: 'switch_' + count });
            zigbeeDevice.mutableDevice.set('switch_' + count, {
              tagList,
              deviceTypes: [genericSwitch],
              clusterServersIds: [...genericSwitch.requiredServerClusters],
              clusterServersOptions: [],
              clusterClientsIds: [],
              clusterClientsOptions: [],
            });
            count++;
          }
        }
        if (zigbeeDevice.composedType === '') zigbeeDevice.composedType = 'button';
      }
    }

    // Add battery properties
    if (device.power_source === 'Battery') {
      zigbeeDevice.propertyMap.set('battery', { name: 'battery', type: '', endpoint: '' });
      zigbeeDevice.propertyMap.set('battery_low', { name: 'battery_low', type: '', endpoint: '' });
      zigbeeDevice.propertyMap.set('battery_voltage', { name: 'battery_voltage', type: '', endpoint: '' });
    }

    // Handle when the device has only child endpoints
    if (!zigbeeDevice.mutableDevice.has(''))
      zigbeeDevice.mutableDevice.set('', {
        tagList: [],
        deviceTypes: [bridgedNode, powerSource],
        clusterServersIds: [],
        clusterServersOptions: [],
        clusterClientsIds: [],
        clusterClientsOptions: [],
      });
    const mainEndpoint = zigbeeDevice.mutableDevice.get('');
    if (!mainEndpoint) return zigbeeDevice;

    // Remove duplicates and superset device Types on all endpoints
    for (const device of zigbeeDevice.mutableDevice.values()) {
      const deviceTypesMap = new Map<number, DeviceTypeDefinition>();
      device.deviceTypes.forEach((deviceType) => {
        deviceTypesMap.set(deviceType.code, deviceType);
      });
      if (deviceTypesMap.has(onOffSwitch.code) && deviceTypesMap.has(dimmableSwitch.code)) deviceTypesMap.delete(onOffSwitch.code);
      if (deviceTypesMap.has(dimmableSwitch.code) && deviceTypesMap.has(colorTemperatureSwitch.code)) deviceTypesMap.delete(dimmableSwitch.code);
      if (deviceTypesMap.has(onOffOutlet.code) && deviceTypesMap.has(dimmableOutlet.code)) deviceTypesMap.delete(onOffOutlet.code);
      if (deviceTypesMap.has(onOffLight.code) && deviceTypesMap.has(dimmableLight.code)) deviceTypesMap.delete(onOffLight.code);
      if (deviceTypesMap.has(dimmableLight.code) && deviceTypesMap.has(colorTemperatureLight.code)) deviceTypesMap.delete(dimmableLight.code);
      if (deviceTypesMap.has(dimmableLight.code) && deviceTypesMap.has(extendedColorLight.code)) deviceTypesMap.delete(dimmableLight.code);
      if (deviceTypesMap.has(colorTemperatureLight.code) && deviceTypesMap.has(extendedColorLight.code)) deviceTypesMap.delete(colorTemperatureLight.code);
      deviceTypesMap.delete(bridgedNode.code);
      deviceTypesMap.delete(powerSource.code);
      device.deviceTypes = Array.from(deviceTypesMap.values()); /* .sort((a, b) => b.code - a.code);*/
    }

    // Create the mutable device for the main endpoint
    zigbeeDevice.bridgedDevice = new MatterbridgeEndpoint(
      [...(mainEndpoint.deviceTypes as AtLeastOne<DeviceTypeDefinition>), bridgedNode, powerSource],
      { uniqueStorageKey: device.friendly_name },
      zigbeeDevice.log.logLevel === LogLevel.DEBUG,
    );

    // Add BridgedDeviceBasicInformation cluster directly to the main endpoint
    zigbeeDevice.addBridgedDeviceBasicInformation();

    // Add PowerSource cluster
    zigbeeDevice.addPowerSource();
    if (mainEndpoint.clusterServersIds.includes(PowerSource.Cluster.id)) {
      mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(PowerSource.Cluster.id), 1);
    }

    // Filter out duplicate clusters and clusters objects
    for (const [endpoint, device] of zigbeeDevice.mutableDevice) {
      // Filter out duplicate server clusters and server clusters objects. Remove the cluster server id when a cluster server object is present.
      const deviceClusterServersIdMap = new Map<ClusterId, ClusterId>();
      device.clusterServersIds.forEach((clusterServer) => {
        deviceClusterServersIdMap.set(clusterServer, clusterServer);
      });
      const deviceClusterServersObjMap = new Map<ClusterId, BehaviorOptions>();
      device.clusterServersOptions.forEach((clusterServer) => {
        deviceClusterServersIdMap.delete(clusterServer.clusterId);
        deviceClusterServersObjMap.set(clusterServer.clusterId, clusterServer);
      });
      device.clusterServersIds = Array.from(deviceClusterServersIdMap.values());
      device.clusterServersOptions = Array.from(deviceClusterServersObjMap.values());

      // Filter out duplicate client clusters and client clusters objects. Remove the cluster client id when a cluster client object is present.
      const deviceClusterClientsIdMap = new Map<ClusterId, ClusterId>();
      device.clusterClientsIds.forEach((clusterClient) => {
        deviceClusterClientsIdMap.set(clusterClient, clusterClient);
      });
      const deviceClusterClientsObjMap = new Map<ClusterId, BehaviorOptions>();
      device.clusterClientsOptions.forEach((clusterClient) => {
        deviceClusterClientsIdMap.delete(clusterClient.clusterId);
        deviceClusterClientsObjMap.set(clusterClient.clusterId, clusterClient);
      });
      device.clusterClientsIds = Array.from(deviceClusterClientsIdMap.values());
      device.clusterClientsOptions = Array.from(deviceClusterClientsObjMap.values());

      zigbeeDevice.log.debug(
        `Device ${zigbeeDevice.ien}${zigbeeDevice.device?.friendly_name}${rs}${db} endpoint: ${ign}${endpoint === '' ? 'main' : endpoint}${rs}${db} => ` +
          `${nf}tagList: ${debugStringify(device.tagList)} deviceTypes: ${debugStringify(device.deviceTypes)} clusterServersIds: ${debugStringify(device.clusterServersIds)}`,
      );
    }

    // Configure BooleanStateCluster for water leak detector and rain sensor
    if (
      (mainEndpoint.deviceTypes.find((dt) => dt.code === waterLeakDetector.code) || mainEndpoint.deviceTypes.find((dt) => dt.code === rainSensor.code)) &&
      mainEndpoint.clusterServersIds.includes(BooleanState.Cluster.id)
    ) {
      zigbeeDevice.log.debug(`Configuring device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} BooleanStateCluster cluster with`);
      zigbeeDevice.bridgedDevice.createDefaultBooleanStateClusterServer(false);
      mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(BooleanState.Cluster.id), 1);
    }

    // Configure SmokeCoAlarmCluster for smoke only sensors
    if (mainEndpoint.deviceTypes.find((dt) => dt.code === smokeCoAlarm.code) && mainEndpoint.clusterServersIds.includes(SmokeCoAlarm.Cluster.id)) {
      zigbeeDevice.log.debug(`Configuring device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} SmokeCoAlarmCluster cluster with`);
      zigbeeDevice.bridgedDevice.createSmokeOnlySmokeCOAlarmClusterServer(SmokeCoAlarm.AlarmState.Normal);
      mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(SmokeCoAlarm.Cluster.id), 1);
    }

    // Configure ColorControlCluster
    if (mainEndpoint.clusterServersIds.includes(ColorControl.Cluster.id)) {
      if (!names.includes('color_hs') && !names.includes('color_xy')) {
        zigbeeDevice.log.debug(
          `Configuring device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} ColorControlCluster cluster with CT: ${names.includes('color_temp')} min: ${zigbeeDevice.propertyMap.get('color_temp')?.value_min} max: ${zigbeeDevice.propertyMap.get('color_temp')?.value_max}`,
        );
        zigbeeDevice.bridgedDevice.createCtColorControlClusterServer();
      } else {
        zigbeeDevice.log.debug(
          `Configuring device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} ColorControlCluster cluster with HS: ${names.includes('color_hs')} XY: ${names.includes('color_xy')} CT: ${names.includes('color_temp')} min: ${zigbeeDevice.propertyMap.get('color_temp')?.value_min} max: ${zigbeeDevice.propertyMap.get('color_temp')?.value_max}`,
        );
        zigbeeDevice.bridgedDevice.createDefaultColorControlClusterServer();
      }
      mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(ColorControl.Cluster.id), 1);
    }

    // Configure ThermostatCluster: Auto or Heating only or Cooling only. Set also min and max if available
    if (mainEndpoint.clusterServersIds.includes(Thermostat.Cluster.id)) {
      const system_mode = zigbeeDevice.propertyMap.get('system_mode');
      const system_mode_values = system_mode?.values;
      const heat = zigbeeDevice.propertyMap.get('occupied_heating_setpoint') || zigbeeDevice.propertyMap.get('unoccupied_heating_setpoint');
      const cool = zigbeeDevice.propertyMap.get('occupied_cooling_setpoint') || zigbeeDevice.propertyMap.get('unoccupied_cooling_setpoint');
      const minHeating = heat && heat.value_min !== undefined && !isNaN(heat.value_min) ? heat.value_min : 0;
      const maxHeating = heat && heat.value_max !== undefined && !isNaN(heat.value_max) ? heat.value_max : 50;
      const minCooling = cool && cool.value_min !== undefined && !isNaN(cool.value_min) ? cool.value_min : 0;
      const maxCooling = cool && cool.value_max !== undefined && !isNaN(cool.value_max) ? cool.value_max : 50;
      zigbeeDevice.log.debug(
        `Configuring device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} Thermostat cluster with heating ${CYAN}${heat ? 'supported' : '(un)occupied not supported'}${db} cooling ${CYAN}${cool ? 'supported' : '(un)occupied not supported'}${db} ` +
          `system_mode ${CYAN}${system_mode_values ?? 'not supported'}${db} ` +
          `minHeating ${CYAN}${minHeating}${db} maxHeating ${CYAN}${maxHeating}${db} minCooling ${CYAN}${minCooling}${db} maxCooling ${CYAN}${maxCooling}${db}`,
      );
      if ((heat && !cool) || (!system_mode_values?.includes('auto') && system_mode_values?.includes('heat'))) {
        zigbeeDevice.propertyMap.delete('running_state'); // Remove running_state if only heating is supported cause it's not supported by the cluster without AutoMode
        zigbeeDevice.bridgedDevice.createDefaultHeatingThermostatClusterServer(undefined, undefined, minHeating, maxHeating);
        mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(Thermostat.Cluster.id), 1);
        const sMode = zigbeeDevice.propertyMap.get('system_mode');
        if (sMode) sMode.values = 'off|heat'; // Set system_mode to off|heat if only heating is supported cause it's not supported by the cluster without AutoMode
      } else if ((!heat && cool) || (!system_mode_values?.includes('auto') && system_mode_values?.includes('cool'))) {
        zigbeeDevice.propertyMap.delete('running_state'); // Remove running_state if only cooling is supported cause it's not supported by the cluster without AutoMode
        zigbeeDevice.bridgedDevice.createDefaultCoolingThermostatClusterServer(undefined, undefined, minCooling, maxCooling);
        mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(Thermostat.Cluster.id), 1);
        const sMode = zigbeeDevice.propertyMap.get('system_mode');
        if (sMode) sMode.values = 'off|cool'; // Set system_mode to off|cool if only cooling is supported cause it's not supported by the cluster without AutoMode
      } else {
        zigbeeDevice.bridgedDevice.createDefaultThermostatClusterServer(undefined, undefined, undefined, undefined, minHeating, maxHeating, minCooling, maxCooling);
        mainEndpoint.clusterServersIds.splice(mainEndpoint.clusterServersIds.indexOf(Thermostat.Cluster.id), 1);
      }
    }

    // Add the cluster ids to the main endpoint
    zigbeeDevice.bridgedDevice.addClusterServers(mainEndpoint.clusterServersIds);
    zigbeeDevice.bridgedDevice.addRequiredClusterServers();

    // Add the Fixed Label cluster to the main endpoint
    if (zigbeeDevice.composedType !== '') await zigbeeDevice.bridgedDevice.addFixedLabel('composed', zigbeeDevice.composedType);

    // Create the child endpoints
    for (const [endpoint, device] of zigbeeDevice.mutableDevice) {
      if (endpoint === '') continue;
      zigbeeDevice.bridgedDevice?.addChildDeviceTypeWithClusterServer(
        endpoint,
        device.deviceTypes as AtLeastOne<DeviceTypeDefinition>,
        device.clusterServersIds,
        { tagList: device.tagList },
        zigbeeDevice.log.logLevel === LogLevel.DEBUG,
      );
    }

    // Verify the device
    if (!zigbeeDevice.verifyMutableDevice(zigbeeDevice.bridgedDevice)) return zigbeeDevice;

    // Clear the mutable device from memory
    zigbeeDevice.mutableDevice.clear();

    // Log properties
    zigbeeDevice.logPropertyMap();

    // Add command handlers

    if (zigbeeDevice.bridgedDevice.hasClusterServer(Identify.Cluster.id)) {
      zigbeeDevice.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
        zigbeeDevice.log.debug(`Command identify called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
        // logEndpoint(zigbeeDevice.bridgedDevice!);
      });
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(OnOff.Cluster.id)) {
      zigbeeDevice.bridgedDevice.addCommandHandler('on', zigbeeDevice.onCommandHandler.bind(zigbeeDevice));
      zigbeeDevice.bridgedDevice.addCommandHandler('off', zigbeeDevice.offCommandHandler.bind(zigbeeDevice));
      zigbeeDevice.bridgedDevice.addCommandHandler('toggle', zigbeeDevice.toggleCommandHandler.bind(zigbeeDevice));
    }
    for (const child of zigbeeDevice.bridgedDevice.getChildEndpoints()) {
      if (child.hasClusterServer(OnOff.Cluster.id)) {
        child.addCommandHandler('on', zigbeeDevice.onCommandHandler.bind(zigbeeDevice));
        child.addCommandHandler('off', zigbeeDevice.offCommandHandler.bind(zigbeeDevice));
        child.addCommandHandler('toggle', zigbeeDevice.toggleCommandHandler.bind(zigbeeDevice));
      }
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(LevelControl.Cluster.id)) {
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToLevel', zigbeeDevice.moveToLevelCommandHandler.bind(zigbeeDevice));
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', zigbeeDevice.moveToLevelWithOnOffCommandHandler.bind(zigbeeDevice));
    }
    for (const child of zigbeeDevice.bridgedDevice.getChildEndpoints()) {
      if (child.hasClusterServer(LevelControl.Cluster.id)) {
        child.addCommandHandler('moveToLevel', zigbeeDevice.moveToLevelCommandHandler.bind(zigbeeDevice));
        child.addCommandHandler('moveToLevelWithOnOff', zigbeeDevice.moveToLevelWithOnOffCommandHandler.bind(zigbeeDevice));
      }
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(ColorControl.Cluster.id) && zigbeeDevice.bridgedDevice.hasAttributeServer(ColorControl.Cluster.id, 'colorTemperatureMireds')) {
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToColorTemperature', zigbeeDevice.moveToColorTemperatureCommandHandler.bind(zigbeeDevice));
    }
    for (const child of zigbeeDevice.bridgedDevice.getChildEndpoints()) {
      if (child.hasClusterServer(ColorControl.Cluster.id) && child.hasAttributeServer(ColorControl.Cluster.id, 'colorTemperatureMireds')) {
        child.addCommandHandler('moveToColorTemperature', zigbeeDevice.moveToColorTemperatureCommandHandler.bind(zigbeeDevice));
      }
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(ColorControl.Cluster.id) && zigbeeDevice.bridgedDevice.hasAttributeServer(ColorControl.Cluster.id, 'currentX')) {
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToColor', zigbeeDevice.moveToColorCommandHandler.bind(zigbeeDevice));
    }
    for (const child of zigbeeDevice.bridgedDevice.getChildEndpoints()) {
      if (child.hasClusterServer(ColorControl.Cluster.id) && child.hasAttributeServer(ColorControl.Cluster.id, 'currentX')) {
        child.addCommandHandler('moveToColor', zigbeeDevice.moveToColorCommandHandler.bind(zigbeeDevice));
      }
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(ColorControl.Cluster.id) && zigbeeDevice.bridgedDevice.hasAttributeServer(ColorControl.Cluster.id, 'currentHue')) {
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToHue', zigbeeDevice.moveToHueCommandHandler.bind(zigbeeDevice));
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToSaturation', zigbeeDevice.moveToSaturationCommandHandler.bind(zigbeeDevice));
      zigbeeDevice.bridgedDevice.addCommandHandler('moveToHueAndSaturation', zigbeeDevice.moveToHueAndSaturationCommandHandler.bind(zigbeeDevice));
    }
    for (const child of zigbeeDevice.bridgedDevice.getChildEndpoints()) {
      if (child.hasClusterServer(ColorControl.Cluster.id) && child.hasAttributeServer(ColorControl.Cluster.id, 'currentHue')) {
        child.addCommandHandler('moveToHue', zigbeeDevice.moveToHueCommandHandler.bind(zigbeeDevice));
        child.addCommandHandler('moveToSaturation', zigbeeDevice.moveToSaturationCommandHandler.bind(zigbeeDevice));
        child.addCommandHandler('moveToHueAndSaturation', zigbeeDevice.moveToHueAndSaturationCommandHandler.bind(zigbeeDevice));
      }
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(WindowCoveringCluster.id)) {
      // Zigbee2MQTT cover: 0 = open, 100 = closed
      // Matter WindowCovering: 0 = open 10000 = closed

      zigbeeDevice.bridgedDevice.addCommandHandler('upOrOpen', async () => {
        const reversed = zigbeeDevice.lastPayload.motor_direction === 'reversed';
        if (reversed) zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} has reversed motor direction. Commands will be reversed.`);
        zigbeeDevice.log.debug(`Command upOrOpen called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`);
        if (zigbeeDevice.propertyMap.has('position'))
          await zigbeeDevice.bridgedDevice?.setAttribute(WindowCoveringCluster.id, 'targetPositionLiftPercent100ths', reversed ? 10000 : 0, zigbeeDevice.log);
        else await zigbeeDevice.bridgedDevice?.setWindowCoveringTargetAndCurrentPosition(reversed ? 10000 : 0);
        zigbeeDevice.publishCommand('upOrOpen', device.friendly_name, { state: reversed ? 'CLOSE' : 'OPEN' });
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('downOrClose', async () => {
        const reversed = zigbeeDevice.lastPayload.motor_direction === 'reversed';
        if (reversed) zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} has reversed motor direction. Commands will be reversed.`);
        zigbeeDevice.log.debug(`Command downOrClose called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`);
        if (zigbeeDevice.propertyMap.has('position'))
          await zigbeeDevice.bridgedDevice?.setAttribute(WindowCoveringCluster.id, 'targetPositionLiftPercent100ths', reversed ? 0 : 10000, zigbeeDevice.log);
        else await zigbeeDevice.bridgedDevice?.setWindowCoveringTargetAndCurrentPosition(reversed ? 0 : 10000);
        zigbeeDevice.publishCommand('downOrClose', device.friendly_name, { state: reversed ? 'OPEN' : 'CLOSE' });
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('stopMotion', async () => {
        zigbeeDevice.log.debug(`Command stopMotion called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`);
        await zigbeeDevice.bridgedDevice?.setWindowCoveringTargetAsCurrentAndStopped();
        zigbeeDevice.publishCommand('stopMotion', device.friendly_name, { state: 'STOP' });
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue } }) => {
        const reversed = zigbeeDevice.lastPayload.motor_direction === 'reversed';
        if (reversed) zigbeeDevice.log.debug(`Device ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} has reversed motor direction. Commands will be reversed.`);
        if (reversed) liftPercent100thsValue = 10000 - liftPercent100thsValue; // Reverse the percentage if the motor direction is reversed
        zigbeeDevice.log.debug(
          `Command goToLiftPercentage called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} request liftPercent100thsValue: ${liftPercent100thsValue}`,
        );
        if (zigbeeDevice.propertyMap.has('position'))
          await zigbeeDevice.bridgedDevice?.setAttribute(WindowCoveringCluster.id, 'targetPositionLiftPercent100ths', liftPercent100thsValue, zigbeeDevice.log);
        else await zigbeeDevice.bridgedDevice?.setWindowCoveringTargetAndCurrentPosition(liftPercent100thsValue);
        zigbeeDevice.publishCommand('goToLiftPercentage', device.friendly_name, { position: liftPercent100thsValue / 100 });
      });
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(DoorLockCluster.id)) {
      zigbeeDevice.bridgedDevice.addCommandHandler('lockDoor', async ({ request: request }) => {
        zigbeeDevice.log.debug(`Command lockDoor called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`, request);
        await zigbeeDevice.bridgedDevice?.setAttribute(DoorLockCluster.id, 'lockState', DoorLock.LockState.Locked, zigbeeDevice.log);
        zigbeeDevice.publishCommand('lockDoor', device.friendly_name, { state: 'LOCK' });
      });
      zigbeeDevice.bridgedDevice.addCommandHandler('unlockDoor', async ({ request: request }) => {
        zigbeeDevice.log.debug(`Command unlockDoor called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db}`, request);
        await zigbeeDevice.bridgedDevice?.setAttribute(DoorLockCluster.id, 'lockState', DoorLock.LockState.Unlocked, zigbeeDevice.log);
        zigbeeDevice.publishCommand('unlockDoor', device.friendly_name, { state: 'UNLOCK' });
      });
    }

    if (zigbeeDevice.bridgedDevice.hasClusterServer(ThermostatCluster.id)) {
      zigbeeDevice.bridgedDevice.addCommandHandler('setpointRaiseLower', async ({ request: request }) => {
        zigbeeDevice.log.debug(`Command setpointRaiseLower called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} request:`, request);
        if (request.mode === Thermostat.SetpointRaiseLowerMode.Heat || request.mode === Thermostat.SetpointRaiseLowerMode.Both) {
          const t = zigbeeDevice.bridgedDevice?.getAttribute(ThermostatCluster.id, 'occupiedHeatingSetpoint', zigbeeDevice.log);
          const setpoint = Math.round(t / 100 + request.amount / 10);
          if (zigbeeDevice.propertyMap.has('current_heating_setpoint')) {
            zigbeeDevice.publishCommand('CurrentHeatingSetpoint', device.friendly_name, { current_heating_setpoint: setpoint });
          } else if (zigbeeDevice.propertyMap.has('occupied_heating_setpoint')) {
            zigbeeDevice.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { occupied_heating_setpoint: setpoint });
          }
        }
        if (request.mode === Thermostat.SetpointRaiseLowerMode.Cool || request.mode === Thermostat.SetpointRaiseLowerMode.Both) {
          const t = zigbeeDevice.bridgedDevice?.getAttribute(ThermostatCluster.id, 'occupiedCoolingSetpoint', zigbeeDevice.log);
          const setpoint = Math.round(t / 100 + request.amount / 10);
          if (zigbeeDevice.propertyMap.has('current_heating_setpoint')) {
            zigbeeDevice.publishCommand('CurrentCoolingSetpoint', device.friendly_name, { current_heating_setpoint: setpoint });
          } else if (zigbeeDevice.propertyMap.has('occupied_cooling_setpoint')) {
            zigbeeDevice.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { occupied_cooling_setpoint: setpoint });
          }
        }
      });
      zigbeeDevice.bridgedDevice.subscribeAttribute(
        ThermostatCluster.id,
        'systemMode',
        (value) => {
          if (isValidNumber(value, Thermostat.SystemMode.Off, Thermostat.SystemMode.FanOnly) && zigbeeDevice.thermostatSystemModeLookup[value] !== '') {
            const system_mode = zigbeeDevice.thermostatSystemModeLookup[value];
            zigbeeDevice.log.debug(`Subscribe systemMode called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} with ${value} => ${system_mode}`);
            zigbeeDevice.publishCommand('SystemMode', device.friendly_name, { system_mode });
            zigbeeDevice.noUpdate = true;
            zigbeeDevice.thermostatTimeout = setTimeout(() => {
              zigbeeDevice.noUpdate = false;
            }, zigbeeDevice.thermostatTimeoutTime);
          }
        },
        zigbeeDevice.log,
      );
      if (zigbeeDevice.bridgedDevice.hasAttributeServer(ThermostatCluster.id, 'occupiedHeatingSetpoint'))
        zigbeeDevice.bridgedDevice.subscribeAttribute(
          ThermostatCluster.id,
          'occupiedHeatingSetpoint',
          (value) => {
            zigbeeDevice.log.debug(`Subscribe occupiedHeatingSetpoint called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} with:`, value);
            if (zigbeeDevice.propertyMap.has('current_heating_setpoint'))
              zigbeeDevice.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
            else if (zigbeeDevice.propertyMap.has('occupied_heating_setpoint'))
              zigbeeDevice.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { occupied_heating_setpoint: Math.round(value / 100) });
            zigbeeDevice.noUpdate = true;
            zigbeeDevice.thermostatTimeout = setTimeout(() => {
              zigbeeDevice.noUpdate = false;
            }, zigbeeDevice.thermostatTimeoutTime);
          },
          zigbeeDevice.log,
        );
      if (zigbeeDevice.bridgedDevice.hasAttributeServer(ThermostatCluster.id, 'occupiedCoolingSetpoint'))
        zigbeeDevice.bridgedDevice.subscribeAttribute(
          ThermostatCluster.id,
          'occupiedCoolingSetpoint',
          (value) => {
            zigbeeDevice.log.debug(`Subscribe occupiedCoolingSetpoint called for ${zigbeeDevice.ien}${device.friendly_name}${rs}${db} with:`, value);
            if (zigbeeDevice.propertyMap.has('current_heating_setpoint'))
              zigbeeDevice.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
            else if (zigbeeDevice.propertyMap.has('occupied_cooling_setpoint'))
              zigbeeDevice.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { occupied_cooling_setpoint: Math.round(value / 100) });
            zigbeeDevice.noUpdate = true;
            zigbeeDevice.thermostatTimeout = setTimeout(() => {
              zigbeeDevice.noUpdate = false;
            }, zigbeeDevice.thermostatTimeoutTime);
          },
          zigbeeDevice.log,
        );
    }
    return zigbeeDevice;
  }
}
