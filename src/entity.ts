/**
 * This file contains the classes ZigbeeEntity, ZigbeeDevice and ZigbeeGroup.
 *
 * @file entity.ts
 * @author Luca Liguori
 * @date 2023-12-29
 * @version 2.0.3
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

// matter.js imports
import {
  DeviceTypes,
  DeviceTypeDefinition,
  logEndpoint,
  AirQuality,
  MatterbridgeDevice,
  airQualitySensor,
  colorTemperatureSwitch,
  dimmableSwitch,
  onOffSwitch,
  Identify,
  Groups,
  Scenes,
  OnOff,
  LevelControl,
  ColorControl,
  ColorControlCluster,
  Switch,
  TemperatureMeasurement,
  BooleanState,
  RelativeHumidityMeasurement,
  PressureMeasurement,
  OccupancySensing,
  IlluminanceMeasurement,
  PowerSource,
  ClusterId,
  TvocMeasurement,
  WindowCovering,
  DoorLock,
  BridgedDeviceBasicInformation,
  ThermostatCluster,
  Thermostat,
  TimeSync,
  Endpoint,
  AtLeastOne,
  FixedLabelCluster,
  EndpointNumber,
  SwitchCluster,
  ElectricalMeasurement,
  EveHistory,
  getClusterNameById,
} from 'matterbridge';

import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, wr, debugStringify, hk, zb } from 'node-ansi-logger';
import { ZigbeePlatform } from './platform.js';
import { BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';
import * as color from './colorUtils.js';
import EventEmitter from 'events';
import { hostname } from 'os';

export class ZigbeeEntity extends EventEmitter {
  public log: AnsiLogger;
  protected platform: ZigbeePlatform;
  public device: BridgeDevice | undefined;
  public group: BridgeGroup | undefined;
  protected accessoryName: string = '';
  public isDevice: boolean = false;
  public isGroup: boolean = false;
  protected en = '';
  protected ien = '';
  public bridgedDevice: BridgedBaseDevice | undefined;
  public eidn = '\u001B[38;5;21m';

  constructor(platform: ZigbeePlatform, entity: BridgeDevice | BridgeGroup) {
    super();
    this.platform = platform;
    if ((entity as BridgeDevice).ieee_address !== undefined) {
      this.device = entity as BridgeDevice;
      this.accessoryName = entity.friendly_name;
      this.isDevice = true;
      this.en = dn;
      this.ien = idn;
    }
    if ((entity as BridgeGroup).id !== undefined) {
      this.group = entity as BridgeGroup;
      this.accessoryName = entity.friendly_name;
      this.isGroup = true;
      this.en = gn;
      this.ien = ign;
    }
    this.log = new AnsiLogger({ logName: this.accessoryName, logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: platform.debugEnabled });
    this.log.debug(`Created MatterEntity: ${this.accessoryName}`);

    this.platform.z2m.on('MESSAGE-' + this.accessoryName, (payload: object) => {
      if (this.bridgedDevice === undefined) {
        this.log.warn(`Skipping (no device) MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      if (this.bridgedDevice.noUpdate) {
        this.log.warn(`Skipping (no update) MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      const debugEnabled = this.platform.debugEnabled;
      this.log.setLogDebug(true);
      this.log.debug(`MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} payload: ${debugStringify(payload)}`);
      //this.log.debug(`MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} device: ${this.isDevice} group: ${this.isGroup} power_source: ${this.device?.power_source}`);

      /* Multi endpoint section */
      if (this.bridgedDevice.hasEndpoints && !this.bridgedDevice.noUpdate) {
        const childs = this.bridgedDevice.getChildEndpoints();
        childs.forEach((child) => {
          // Find the endpoint name (l1...)
          const labelList = child.getClusterServer(FixedLabelCluster)?.getLabelListAttribute();
          if (!labelList) return;
          //this.log.debug('*getChildStatePayload labelList:', labelList);
          const endpointName = labelList.find((entry) => entry.label === 'endpointName');
          if (!endpointName) return;

          Object.entries(payload).forEach(([key, value]) => {
            if (this.bridgedDevice === undefined || this.bridgedDevice.noUpdate) return;

            if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';

            const z2m = z2ms.find((z2m) => z2m.property + '_' + endpointName.value === key);
            if (z2m) {
              if (z2m.converter) {
                this.log.debug(`*Found z2m entry with converter for ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${getClusterNameById(ClusterId(z2m.cluster))}.${z2m.attribute}`);
                this.updateAttributeIfChanged(child, endpointName.value, z2m.cluster, z2m.attribute, z2m.converter(value));
                return;
              }
            }
          });
        });
      }
      /* Normal z2m features section */
      Object.entries(payload).forEach(([key, value]) => {
        if (this.bridgedDevice === undefined || this.bridgedDevice.noUpdate) return;

        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';
        if (key === 'illuminance') console.log('illuminance', this.device?.definition?.model);
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'ZG-204ZL') {
          key = 'illuminance_lux';
          value = Math.pow(10, value / 10000);
        }
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'RTCGQ14LM') {
          key = 'illuminance_lux';
        }

        const z2m = z2ms.find((z2m) => z2m.property === key);
        if (z2m) {
          if (z2m.converter) {
            this.log.debug(`*Found z2m entry with converter for ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${getClusterNameById(ClusterId(z2m.cluster))}.${z2m.attribute}`);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, z2m.cluster, z2m.attribute, z2m.converter(value));
            return;
          }
        }

        /* WindowCovering */
        if (key === 'position') {
          this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.setCurrentPositionLiftPercent100thsAttribute(10000 - value * 100);
          this.log.debug(`Set accessory ${hk}WindowCovering.currentPositionLiftPercent100ths: ${10000 - value * 100}`);
        }
        if (key === 'moving') {
          const status = value === 'UP' ? WindowCovering.MovementStatus.Opening : value === 'DOWN' ? WindowCovering.MovementStatus.Closing : WindowCovering.MovementStatus.Stopped;
          this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.setOperationalStatusAttribute({ global: status, lift: status, tilt: status });
          this.log.debug(`Set accessory ${hk}WindowCovering.operationalStatus: ${status}`);
          if (value === 'STOP') {
            const position = this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.getCurrentPositionLiftPercent100thsAttribute();
            this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.setCurrentPositionLiftPercent100thsAttribute(position);
            this.log.debug(`Set accessory ${hk}WindowCovering.currentPositionLiftPercent100ths: ${position}`);
          }
        }
        /* OnOff */
        /*
        if (key === 'state') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, OnOff.Cluster.id, 'onOff', value === 'ON' ? true : false);
        }
        */
        /* LevelControl */
        /*
        if (key === 'brightness') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, LevelControl.Cluster.id, 'currentLevel', Math.max(0, Math.min(254, value)));
        }
        */
        /* ColorControl ColorTemperatureMired */
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp') {
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorTemperatureMiredsAttribute(Math.max(147, Math.min(500, value)));
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorModeAttribute(ColorControl.ColorMode.ColorTemperatureMireds);
          this.log.debug(`Set accessory ${hk}ColorControl.colorTemperatureMireds: ${value}`);
        }
        /* ColorControl Hue and Saturation */
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'xy') {
          const hsl = color.xyToHsl(value.x, value.y);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setCurrentHueAttribute(Math.round((hsl.h / 360) * 254));
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setCurrentSaturationAttribute(Math.round((hsl.s / 100) * 254));
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorModeAttribute(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          this.log.debug(`Set accessory ${hk}ColorControl: X:${value.x} Y:${value.y} => currentHue: ${Math.round((hsl.h / 360) * 254)} currentSaturation: ${Math.round((hsl.s / 100) * 254)}`);
        }
        /* Switch */
        if (key === 'action') {
          let position = undefined;
          if (value === 'single') {
            position = 1;
            const cluster = this.bridgedDevice.getClusterServer(SwitchCluster.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease, Switch.Feature.MomentarySwitchLongPress, Switch.Feature.MomentarySwitchMultiPress));
            cluster?.setCurrentPositionAttribute(1);
            cluster?.triggerInitialPressEvent({ newPosition: 1 });
            cluster?.setCurrentPositionAttribute(0);
            cluster?.triggerShortReleaseEvent({ previousPosition: 1 });
            cluster?.setCurrentPositionAttribute(0);
            cluster?.triggerMultiPressCompleteEvent({ previousPosition: 1, totalNumberOfPressesCounted: 1 });
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
          if (value === 'double') {
            position = 2;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerMultiPressCompleteEvent({ previousPosition: 1, totalNumberOfPressesCounted: 2 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
          if (value === 'hold') {
            position = 1;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerInitialPressEvent({ newPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerLongPressEvent({ newPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerLongReleaseEvent({ previousPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
          if (value === 'release') {
            this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: true });
          }
        }
        /* Thermostat */
        if (key === 'local_temperature') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'localTemperature', Math.max(-5000, Math.min(5000, value * 100)));
        }
        if (key === 'current_heating_setpoint') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'occupiedHeatingSetpoint', Math.max(-5000, Math.min(5000, value * 100)));
        }
        if (key === 'current_cooling_setpoint') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'occupiedCoolingSetpoint', Math.max(-5000, Math.min(5000, value * 100)));
        }
        if (key === 'running_state') {
          //const state = value === 'idle' ? Thermostat.ThermostatRunningMode.Off : value === 'heat' ? Thermostat.ThermostatRunningMode.Heat : Thermostat.ThermostatRunningMode.Cool;
          //this.bridgedDevice.getClusterServerById(Thermostat.Cluster.id)?.setThermostatRunningModeAttribute(state);
          //this.log.debug(`Get accessory ${hk}Thermostat.thermostatRunningMode: ${state} (${value})`);
        }
        if (key === 'system_mode') {
          const state = value === 'off' ? Thermostat.SystemMode.Off : value === 'heat' ? Thermostat.SystemMode.Heat : Thermostat.SystemMode.Cool;
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, Thermostat.Cluster.id, 'systemMode', state);
        }
        /* Generic features */
        /*
        if (key === 'battery') {
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatPercentRemainingAttribute(Math.round(value * 2));
          this.log.debug(`Set accessory ${hk}PowerSource.batPercentRemaining: ${Math.round(value * 2)}`);
        }
        if (key === 'battery_low') {
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatChargeLevelAttribute(value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok);
          this.log.debug(`Set accessory ${hk}PowerSource.batChargeLevel: ${value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok}`);
        }
        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') {
          // Voltage for battery powered devices
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatVoltageAttribute(value);
          this.log.debug(`Set accessory ${hk}PowerSource.batVoltage: ${value}`);
        }
        if (key === 'battery_voltage') {
          // Voltage for battery powered devices
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatVoltageAttribute(value);
          this.log.debug(`Set accessory ${hk}PowerSource.batVoltage: ${value}`);
        }
        if (key === 'cpu_temperature' || key === 'device_temperature') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, TemperatureMeasurement.Cluster.id, 'measuredValue', Math.round(value * 100));
        }
        if (key === 'temperature') {
          this.bridgedDevice.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
          this.log.debug(`Set accessory ${hk}TemperatureMeasurement.measuredValue: ${Math.round(value * 100)}`);
        }
        if (key === 'humidity') {
          this.bridgedDevice.getClusterServerById(RelativeHumidityMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
          this.log.debug(`Set accessory ${hk}RelativeHumidityMeasurement.measuredValue: ${Math.round(value * 100)}`);
        }
        if (key === 'pressure') {
          this.bridgedDevice.getClusterServerById(PressureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value));
          this.log.debug(`Set accessory ${hk}PressureMeasurement.measuredValue: ${Math.round(value)}`);
        }
        if (key === 'contact') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
          this.log.debug(`Set accessory ${hk}BooleanState.stateValue: ${Math.round(value)}`);
        }
        if (key === 'water_leak') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
          this.log.debug(`Set accessory ${hk}BooleanState.stateValue: ${Math.round(value)}`);
        }
        if (key === 'carbon_monoxide') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
          this.log.debug(`Set accessory ${hk}BooleanState.stateValue: ${Math.round(value)}`);
        }
        */
        if (key === 'air_quality') {
          // excellent, good, moderate, poor, unhealthy, out_of_range unknown
          const airQuality =
            value === 'unhealthy'
              ? AirQuality.AirQualityType.VeryPoor
              : value === 'poor'
                ? AirQuality.AirQualityType.Poor
                : value === 'moderate'
                  ? AirQuality.AirQualityType.Moderate
                  : value === 'good'
                    ? AirQuality.AirQualityType.Fair
                    : value === 'excellent'
                      ? AirQuality.AirQualityType.Good
                      : AirQuality.AirQualityType.Unknown;
          this.bridgedDevice.getClusterServerById(AirQuality.Cluster.id)?.setAirQualityAttribute(airQuality);
          this.log.debug(`Set accessory ${hk}AirQuality.airQuality: ${airQuality}`);
        }
        /*
        if (key === 'voc') {
          this.bridgedDevice.getClusterServerById(TvocMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.min(65535, value));
          this.log.debug(`Set accessory ${hk}TvocMeasurement.measuredValue: ${value}`);
        }
        if (key === 'occupancy') {
          this.bridgedDevice.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute({ occupied: value as boolean });
          this.log.debug(`Set accessory ${hk}OccupancySensing.occupancy: ${value}`);
        }
        if (key === 'illuminance_lux' || (key === 'illuminance' && !('illuminance_lux' in payload))) {
          this.bridgedDevice.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)));
          this.log.debug(`Set accessory ${hk}IlluminanceMeasurement.measuredValue: ${Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0))}`);
        }
        // ElectricalMeasurement
        if (key === 'voltage' && this.isDevice && this.device?.power_source !== 'Battery') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, EveHistory.Cluster.id, 'Voltage', value);
        }
        if (key === 'current' && this.isDevice && this.device?.power_source !== 'Battery') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, EveHistory.Cluster.id, 'Current', value);
        }
        if (key === 'power' && this.isDevice && this.device?.power_source !== 'Battery') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, EveHistory.Cluster.id, 'Consumption', value);
        }
        if (key === 'energy' && this.isDevice && this.device?.power_source !== 'Battery') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, EveHistory.Cluster.id, 'TotalConsumption', value);
        }
        */
      });
      this.log.setLogDebug(debugEnabled);
    });

    this.platform.z2m.on('ONLINE-' + this.accessoryName, () => {
      this.log.info(`ONLINE message for accessory ${this.ien}${this.accessoryName}${rs}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(true);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: true });
        this.log.info(`${db}Set accessory ${hk}BridgedDeviceBasicInformation.reachable: true`);
      }
    });

    this.platform.z2m.on('OFFLINE-' + this.accessoryName, () => {
      this.log.warn(`OFFLINE message for accessory ${this.ien}${this.accessoryName}${wr}`);
      if (this.bridgedDevice?.number !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(false);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: false });
        this.log.info(`${db}Set accessory ${hk}BridgedDeviceBasicInformation.reachable: false`);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected updateAttributeIfChanged(endpoint: Endpoint, endpointName: string | undefined, clusterId: number, attributeName: string, value: any) {
    const cluster = endpoint.getClusterServerById(ClusterId(clusterId));
    if (cluster === undefined) {
      this.log.debug(`Update attribute endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? '(' + zb + endpointName + db + ')' : ''} error cluster ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db} not found: is z2m converter correct?`);
      return;
    }
    if (!cluster.isAttributeSupportedByName(attributeName)) {
      this.log.debug(`***Update attribute endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? '(' + zb + endpointName + db + ')' : ''} error attribute ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} not found`);
      return;
    }
    const localValue = cluster.attributes[attributeName].getLocal();
    if (localValue === value) {
      this.log.debug(`Skip update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? '(' + zb + endpointName + db + ')' : ''} attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} already ${zb}${value}${db}`);
      return;
    }
    cluster.attributes[attributeName].setLocal(value);
    this.log.debug(`*Update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? '(' + zb + endpointName + db + ')' : ''} attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} from ${zb}${localValue}${db} to ${zb}${value}${db}`);
  }

  protected publishCommand(command: string, entityName: string, payload: Payload) {
    this.log.debug(`executeCommand ${command} called for ${this.ien}${entityName}${rs}${db} payload: ${debugStringify(payload)}`);
    const topic = entityName.includes('bridge/request') ? entityName : this.platform.z2m.mqttTopic + '/' + entityName + '/set';
    this.platform.z2m.publish(topic, JSON.stringify(payload));
    this.log.info(`MQTT publish topic: ${topic} payload: ${debugStringify(payload)} for ${this.en}${entityName}`);
  }
}

export class ZigbeeGroup extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);

    // TODO Add the group scanning for real groups. This cover only automations
    this.bridgedDevice = new BridgedBaseDevice(this, [onOffSwitch], [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id]);

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called for ${this.ien}${group.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
      logEndpoint(this.bridgedDevice!);
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
}

interface ZigbeeToMatter {
  //[key: string]: string;
  type: string;
  name: string;
  property: string;
  deviceType: DeviceTypeDefinition | undefined;
  cluster: number;
  attribute: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  converter?: (value: any) => any;
}

/* eslint-disable */
// prettier-ignore
const z2ms: ZigbeeToMatter[] = [
  { type: 'switch', name: 'state',          property: 'state',      deviceType: onOffSwitch,                cluster: OnOff.Cluster.id,        attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'switch', name: 'brightness',     property: 'brightness', deviceType: dimmableSwitch,             cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'switch', name: 'color_xy',       property: 'color_xy',   deviceType: colorTemperatureSwitch,     cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'outlet', name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_PLUGIN_UNIT, cluster: OnOff.Cluster.id,    attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'outlet', name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_PLUGIN_UNIT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light',  name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_LIGHT,   cluster: OnOff.Cluster.id,        attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'light',  name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_LIGHT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light',  name: 'color_xy',       property: 'color_xy',   deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'cover',  name: 'state',          property: 'state',      deviceType: DeviceTypes.WINDOW_COVERING, cluster: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths' },
  { type: 'climate', name: 'current_heating_setpoint', property: 'current_heating_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint' },
  { type: '',       name: 'occupancy',      property: 'occupancy',  deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '',       name: 'illuminance',    property: 'illuminance', deviceType: DeviceTypes.LIGHT_SENSOR,  cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue' },
  { type: '',       name: 'illuminance_lux', property: 'illuminance_lux', deviceType: DeviceTypes.LIGHT_SENSOR, cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) } },
  { type: '',       name: 'contact',        property: 'contact',    deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '',       name: 'water_leak',     property: 'water_leak', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value }  },
  { type: '',       name: 'vibration',      property: 'vibration',  deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value }  },
  { type: '',       name: 'smoke',          property: 'smoke',      deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '',       name: 'carbon_monoxide', property: 'carbon_monoxide', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '',       name: 'temperature',    property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '',       name: 'humidity',       property: 'humidity',   deviceType: DeviceTypes.HUMIDITY_SENSOR, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '',       name: 'pressure',       property: 'pressure',   deviceType: DeviceTypes.PRESSURE_SENSOR, cluster: PressureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return value } },
  { type: '',       name: 'air_quality',    property: 'air_quality', deviceType: airQualitySensor,          cluster: AirQuality.Cluster.id,   attribute: 'airQuality' },
  { type: '',       name: 'voc',            property: 'voc',        deviceType: airQualitySensor,           cluster: TvocMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.min(65535, value) } },
  { type: '',       name: 'action',         property: 'action',     deviceType: DeviceTypes.GENERIC_SWITCH, cluster: Switch.Cluster.id,       attribute: 'currentPosition' },
  { type: '',       name: 'cpu_temperature', property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) }},
  { type: '',       name: 'device_temperature', property: 'device_temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '',       name: '',               property: 'battery',    deviceType: undefined,                  cluster: PowerSource.Cluster.id,  attribute: 'batPercentRemaining', converter: (value) => { return Math.round(value * 2) } },
  { type: '',       name: '',               property: 'battery_low', deviceType: undefined,                 cluster: PowerSource.Cluster.id,  attribute: 'batChargeLevel', converter: (value) => { return value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok } },
  { type: '',       name: '',               property: 'battery_voltage', deviceType: undefined,             cluster: PowerSource.Cluster.id,  attribute: 'batVoltage', converter: (value) => { return value } },
  { type: '',       name: 'energy',         property: 'energy',     deviceType: undefined,                  cluster: EveHistory.Cluster.id,   attribute: 'TotalConsumption', converter: (value) => { return value } },
  { type: '',       name: 'power',          property: 'power',      deviceType: undefined,                  cluster: EveHistory.Cluster.id,   attribute: 'Consumption', converter: (value) => { return value } },
  { type: '',       name: 'voltage',        property: 'voltage',    deviceType: undefined,                  cluster: EveHistory.Cluster.id,   attribute: 'Voltage', converter: (value) => { return value } },
  { type: '',       name: 'current',        property: 'current',    deviceType: undefined,                  cluster: EveHistory.Cluster.id,   attribute: 'Current', converter: (value) => { return value } },
  //{ type: '',       name: 'transmit_power', property: 'transmit_power', deviceType: DeviceTypes.DOOR_LOCK, cluster: DoorLock.Cluster.id, attribute: 'lockState' },
];
/* eslint-enable */

export class ZigbeeDevice extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, device: BridgeDevice) {
    super(platform, device);
    if (device.friendly_name === 'Coordinator') {
      this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.DOOR_LOCK], [Identify.Cluster.id, DoorLock.Cluster.id]);
      this.bridgedDevice.isRouter = true;
    } else if (device.model_id === 'ti.router' && device.manufacturer === 'TexasInstruments') {
      this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.DOOR_LOCK], [Identify.Cluster.id, DoorLock.Cluster.id]);
      this.bridgedDevice.isRouter = true;
    }

    const debugEnabled = this.platform.debugEnabled;
    this.log.setLogDebug(true);

    // Get types and properties
    const types: string[] = [];
    const endpoints: string[] = [];
    const names: string[] = [];
    const properties: string[] = [];
    const forceLight = ['Aqara switch T1'];
    const forceOutlet = ['Aqara switch no neutral'];
    device.definition?.exposes.forEach((expose) => {
      if (expose.features) {
        //Specific features with type
        expose.features?.forEach((feature) => {
          types.push(expose.type);
          if (expose.endpoint) endpoints.push(expose.endpoint);
          else endpoints.push('');
          names.push(feature.name);
          properties.push(feature.property);
        });
      } else {
        //Generic features without type
        types.push('');
        if (expose.endpoint) endpoints.push(expose.endpoint);
        else endpoints.push('');
        if (device.power_source === 'Battery' && expose.name === 'voltage') expose.name = 'battery_voltage';
        if (device.power_source === 'Battery' && expose.property === 'voltage') expose.property = 'battery_voltage';
        if (expose.name) names.push(expose.name);
        properties.push(expose.property);
      }
    });
    device.definition?.options.forEach((option) => {
      //this.log.debug(option);
      if (option.name) names.push(option.name);
      properties.push(option.property);
      types.push('');
      if (option.endpoint) endpoints.push(option.endpoint);
      else endpoints.push('');
    });
    if (forceLight.includes(device.friendly_name)) {
      this.log.debug(`Changed ${device.friendly_name} to light`);
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'light' : type;
      });
    }
    if (forceOutlet.includes(device.friendly_name)) {
      this.log.debug(`Changed ${device.friendly_name} to outlet`);
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'outlet' : type;
      });
    }

    this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - types[${types.length}]: ${debugStringify(types)}`);
    this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - endpoints[${endpoints.length}]: ${debugStringify(endpoints)}`);
    this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - names[${names.length}]: ${debugStringify(names)}`);
    this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - properties[${properties.length}]: ${debugStringify(properties)}`);
    names.forEach((name, index) => {
      const type = types[index];
      const endpoint = endpoints[index];
      const z2m = z2ms.find((z2m) => z2m.type === type && z2m.name === name);
      if (z2m) {
        this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => deviceType: ${z2m.deviceType?.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`);
        if (endpoint === '') {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [z2m.deviceType ?? DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO], z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          else this.bridgedDevice.addDeviceTypeAndClusterServer(z2m.deviceType, z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          if (type !== '') this.bridgedDevice.addFixedLabel('type', type);
        } else {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO]);
          this.bridgedDevice.addChildDeviceTypeAndClusterServer(endpoint, z2m.property, z2m.deviceType, z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          if (type !== '') this.bridgedDevice.addFixedLabel('type', type);
          this.bridgedDevice.addFixedLabel('composed', type);
        }
      }
    });
    this.log.setLogDebug(debugEnabled);

    /* Verify that all required server clusters are present */
    if (this.bridgedDevice) {
      const deviceTypes = this.bridgedDevice.getDeviceTypes();
      deviceTypes.forEach((deviceType) => {
        deviceType.requiredServerClusters.forEach((clusterId) => {
          if (!this.bridgedDevice?.getClusterServerById(clusterId)) {
            this.log.error(`Device type ${deviceType.name} (0x${deviceType.code.toString(16)}) requires cluster server ${getClusterNameById(clusterId)}(0x${clusterId.toString(16)}) but it is not present on endpoint`);
            this.bridgedDevice = undefined;
          }
        });
      });
    }
    if (!this.bridgedDevice) return;
    //if (device.friendly_name === 'power-meter') logEndpoint(this.bridgedDevice);

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async (data) => {
      this.log.warn(`Command identify called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} request identifyTime:${data.request.identifyTime}  identifyTime:${data.attributes.identifyTime.getLocal()} identifyType:${data.attributes.identifyType.getLocal()} `);
      //logEndpoint(this.bridgedDevice!);
    });
    if (this.bridgedDevice.hasClusterServer(OnOff.Complete) || this.bridgedDevice.hasEndpoints) {
      this.bridgedDevice.addCommandHandler('on', async (data) => {
        this.log.debug(`Command on called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload = this.bridgedDevice?.getChildPayload(data.endpoint.number, 'state', 'ON');
        if (payload) this.publishCommand('on', device.friendly_name, payload);
      });
      this.bridgedDevice.addCommandHandler('off', async (data) => {
        this.log.debug(`Command off called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload = this.bridgedDevice?.getChildPayload(data.endpoint.number, 'state', 'OFF');
        if (payload) this.publishCommand('off', device.friendly_name, payload);
      });
      this.bridgedDevice.addCommandHandler('toggle', async (data) => {
        this.log.debug(`Command toggle called for ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${data.endpoint.number} onOff: ${data.attributes.onOff.getLocal()}`);
        const payload = this.bridgedDevice?.getChildPayload(data.endpoint.number, 'state', 'TOGGLE');
        if (payload) this.publishCommand('toggle', device.friendly_name, payload);
      });
    }
    if (this.bridgedDevice.hasClusterServer(LevelControl.Complete)) {
      this.bridgedDevice.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevel called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevel', device.friendly_name, { brightness: level });
      });
      this.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevelWithOnOff', device.friendly_name, { brightness: level });
      });
    }
    if (this.bridgedDevice.hasClusterServer(ColorControl.Complete) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('colorTemperatureMireds')) {
      this.bridgedDevice.addCommandHandler('moveToColorTemperature', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        this.log.warn(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
        this.publishCommand('moveToColorTemperature', device.friendly_name, { color_temp: request.colorTemperatureMireds });
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
          this.publishCommand('moveToHue', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
        }, 500);
      });
      this.bridgedDevice.addCommandHandler('moveToSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        lastRequestedSaturation = request.saturation;
        lastRequestTimeout = setTimeout(() => {
          clearTimeout(lastRequestTimeout);
          const rgb = color.hslColorToRgbColor((lastRequestedHue / 254) * 360, (request.saturation / 254) * 100, 50);
          this.publishCommand('moveToSaturation', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
        }, 500);
      });
      this.bridgedDevice.addCommandHandler('moveToHueAndSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(
          `Command moveToHueAndSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue}-${request.saturation} attributes: hue ${attributes.currentHue?.getLocal()} saturation ${attributes.currentSaturation?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`,
        );
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (request.saturation / 254) * 100, 50);
        this.publishCommand('moveToHueAndSaturation', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
      });
    }
    if (this.bridgedDevice.hasClusterServer(WindowCovering.Complete)) {
      this.bridgedDevice.addCommandHandler('upOrOpen', async (data) => {
        this.log.info(`Command upOrOpen called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(0);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(0);
        this.publishCommand('upOrOpen', device.friendly_name, { state: 'OPEN' });
      });
      this.bridgedDevice.addCommandHandler('downOrClose', async (data) => {
        this.log.info(`Command downOrClose called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.currentPositionLiftPercent100ths?.getLocal()}`);
        data.attributes.currentPositionLiftPercent100ths?.setLocal(10000);
        data.attributes.targetPositionLiftPercent100ths?.setLocal(10000);
        this.publishCommand('downOrClose', device.friendly_name, { state: 'CLOSE' });
      });
      this.bridgedDevice.addCommandHandler('stopMotion', async (data) => {
        this.log.info(`Command stopMotion called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${data.attributes.operationalStatus?.getLocal()}`);
        const liftPercent100thsValue = data.attributes.currentPositionLiftPercent100ths?.getLocal();
        if (liftPercent100thsValue) {
          data.attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
          data.attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        }
        data.attributes.operationalStatus?.setLocal({ global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: WindowCovering.MovementStatus.Stopped });
        this.publishCommand('stopMotion', device.friendly_name, { state: 'STOP' });
      });
      this.bridgedDevice.addCommandHandler('goToLiftPercentage', async ({ request: { liftPercent100thsValue }, attributes }) => {
        this.log.info(`Command goToLiftPercentage called  for ${this.ien}${device.friendly_name}${rs}${db} liftPercent100thsValue: ${liftPercent100thsValue}`);
        this.log.info(`Command goToLiftPercentage current: ${attributes.currentPositionLiftPercent100ths?.getLocal()} target: ${attributes.targetPositionLiftPercent100ths?.getLocal()}`);
        //attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        attributes.targetPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
        this.publishCommand('goToLiftPercentage', device.friendly_name, { position: 100 - liftPercent100thsValue / 100 });
      });
    }
    if (this.bridgedDevice.hasClusterServer(DoorLock.Complete)) {
      this.bridgedDevice.addCommandHandler('lockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.info(`Command lockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Locked);
        if (!this.bridgedDevice?.isRouter) this.publishCommand('lockDoor', device.friendly_name, { state: 'LOCK' });
        else this.publishCommand('permit_join: false', 'zigbee2mqtt/bridge/request/permit_join', { value: false });
      });
      this.bridgedDevice.addCommandHandler('unlockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.info(`Command unlockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Unlocked);
        if (!this.bridgedDevice?.isRouter) this.publishCommand('unlockDoor', device.friendly_name, { state: 'UNLOCK' });
        else this.publishCommand('permit_join: true', 'zigbee2mqtt/bridge/request/permit_join', { value: true });
      });
    }
    if (this.bridgedDevice.hasClusterServer(Thermostat.Complete)) {
      this.bridgedDevice.addCommandHandler('setpointRaiseLower', async ({ request: request, attributes: attributes }) => {
        this.log.info(`Command setpointRaiseLower called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        if (request.mode === Thermostat.SetpointAdjustMode.Heat && attributes.occupiedHeatingSetpoint) {
          const setpoint = Math.round(attributes.occupiedHeatingSetpoint.getLocal() / 100 + request.amount / 10);
          this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: setpoint });
          this.log.info('Command setpointRaiseLower sent:', debugStringify({ current_heating_setpoint: setpoint }));
        }
        if (request.mode === Thermostat.SetpointAdjustMode.Cool && attributes.occupiedCoolingSetpoint) {
          const setpoint = Math.round(attributes.occupiedCoolingSetpoint.getLocal() / 100 + request.amount / 10);
          this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: setpoint });
          this.log.info('Command setpointRaiseLower sent:', debugStringify({ current_cooling_setpoint: setpoint }));
        }
      });
      const thermostat = this.bridgedDevice.getClusterServer(ThermostatCluster.with(Thermostat.Feature.Heating, Thermostat.Feature.Cooling, Thermostat.Feature.AutoMode));
      if (thermostat) {
        thermostat.subscribeSystemModeAttribute(async (value) => {
          this.log.info(`Subscribe systemMode called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          const system_mode = value === Thermostat.SystemMode.Off ? 'off' : value === Thermostat.SystemMode.Heat ? 'heat' : 'cool';
          this.publishCommand('SystemMode', device.friendly_name, { system_mode });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
        thermostat.subscribeOccupiedHeatingSetpointAttribute(async (value) => {
          this.log.info(`Subscribe occupiedHeatingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
        thermostat.subscribeOccupiedCoolingSetpointAttribute(async (value) => {
          this.log.info(`Subscribe occupiedCoolingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
          this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: Math.round(value / 100) });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
      }
    }
    if (this.bridgedDevice.hasClusterServer(Switch.Complete)) {
      this.bridgedDevice.verifyRequiredClusters;
    }
  }
}

export class BridgedBaseDevice extends MatterbridgeDevice {
  public log: AnsiLogger;
  public hasEndpoints = false;
  public isRouter = false;
  public noUpdate = false;

  constructor(entity: ZigbeeEntity, definition: AtLeastOne<DeviceTypeDefinition>, includeServerList: ClusterId[] = [], includeClientList?: ClusterId[]) {
    super(definition[0]);
    this.log = entity.log;
    definition.forEach((deviceType) => {
      this.addDeviceType(deviceType);
      this.log.debug(`new BridgedBaseDevice ${entity.isDevice ? entity.device?.friendly_name : entity.group?.friendly_name} deviceType: ${hk}${deviceType.name}${db}`);
    });
    this.addDeviceType(DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO);

    includeServerList.forEach((clusterId) => {
      this.log.debug(`- with cluster: ${hk}${clusterId}${db}-${hk}${getClusterNameById(clusterId)}${db}`);
    });
    // Add all other server clusters in the includelist
    this.addDeviceClusterServer(includeServerList);

    // Add BridgedDeviceBasicInformationCluster
    if (entity.isDevice && entity.device && entity.device.friendly_name === 'Coordinator') {
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, 'zigbee2MQTT', 'Coordinator', entity.device.ieee_address);
    } else if (entity.isDevice && entity.device) {
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, entity.device.manufacturer, entity.device.model_id, entity.device.ieee_address);
    } else if (entity.isGroup && entity.group) {
      this.addBridgedDeviceBasicInformationCluster(entity.group.friendly_name, 'zigbee2MQTT', 'Group', `group-${entity.group.id}`);
    }

    // Add PowerSource cluster
    this.createDefaultPowerSourceConfigurationClusterServer();
    if (entity.isDevice) {
      if (entity.device?.power_source === 'Battery') this.createDefaultPowerSourceReplaceableBatteryClusterServer(100, PowerSource.BatChargeLevel.Ok);
      else this.createDefaultPowerSourceWiredClusterServer();
    } else if (entity.isGroup) {
      this.createDefaultPowerSourceWiredClusterServer();
    }

    // Add all other client clusters in the includelist
    this.addDeviceClusterClient(includeClientList);
  }

  /**
   * Adds BridgedDeviceBasicInformationCluster
   *
   * @protected
   * @param deviceName Name of the device
   * @param deviceSerial Serial of the device
   */
  protected addBridgedDeviceBasicInformationCluster(deviceName: string, vendorName: string, productName: string, deviceSerial: string) {
    this.createDefaultBridgedDeviceBasicInformationClusterServer(deviceName.slice(0, 32), (deviceSerial + '_' + hostname).slice(0, 32), 0xfff1, vendorName.slice(0, 32), productName.slice(0, 32));
  }

  /**
   * Adds mandatory clusters to the device
   *
   * @protected
   * @param attributeInitialValues Optional object with initial attribute values for automatically added clusters
   * @param includeServerList List of clusters to include
   */
  // attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> }
  protected addDeviceClusterServer(includeServerList: ClusterId[] = []) {
    if (includeServerList.includes(Identify.Cluster.id) && !this.hasClusterServer(Identify.Cluster)) {
      this.createDefaultIdentifyClusterServer();
    }
    if (includeServerList.includes(Groups.Cluster.id) && !this.hasClusterServer(Groups.Cluster)) {
      this.createDefaultGroupsClusterServer();
    }
    if (includeServerList.includes(Scenes.Cluster.id) && !this.hasClusterServer(Scenes.Cluster)) {
      this.createDefaultScenesClusterServer();
    }
    if (includeServerList.includes(OnOff.Cluster.id) && !this.hasClusterServer(OnOff.Cluster)) {
      this.createDefaultOnOffClusterServer();
    }
    if (includeServerList.includes(LevelControl.Cluster.id) && !this.hasClusterServer(LevelControl.Cluster)) {
      this.createDefaultLevelControlClusterServer();
    }
    if (includeServerList.includes(ColorControl.Cluster.id) && !this.hasClusterServer(ColorControl.Cluster)) {
      this.createDefaultColorControlClusterServer();
    }
    if (includeServerList.includes(WindowCovering.Cluster.id) && !this.hasClusterServer(WindowCovering.Complete)) {
      this.createDefaultWindowCoveringClusterServer();
    }
    if (includeServerList.includes(Switch.Cluster.id) && !this.hasClusterServer(Switch.Complete)) {
      this.createDefaultSwitchClusterServer();
      this.addFixedLabel('room', 'Bedroom');
      this.addFixedLabel('floor', '2');
      this.addFixedLabel('orientation', 'North');
      this.addFixedLabel('direction', 'up');
    }
    if (includeServerList.includes(ElectricalMeasurement.Cluster.id) && !this.hasClusterServer(ElectricalMeasurement.Cluster)) {
      this.createDefaultElectricalMeasurementClusterServer();
    }
    if (includeServerList.includes(EveHistory.Cluster.id) && !this.hasClusterServer(EveHistory.Cluster)) {
      this.addClusterServer(this.getDefaultStaticEveHistoryClusterServer());
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id) && !this.hasClusterServer(TemperatureMeasurement.Cluster)) {
      this.createDefaultTemperatureMeasurementClusterServer();
    }
    if (includeServerList.includes(RelativeHumidityMeasurement.Cluster.id) && !this.hasClusterServer(RelativeHumidityMeasurement.Cluster)) {
      this.createDefaultRelativeHumidityMeasurementClusterServer();
    }
    if (includeServerList.includes(PressureMeasurement.Cluster.id) && !this.hasClusterServer(PressureMeasurement.Cluster)) {
      this.createDefaultPressureMeasurementClusterServer();
    }
    if (includeServerList.includes(BooleanState.Cluster.id) && !this.hasClusterServer(BooleanState.Cluster)) {
      this.createDefaultBooleanStateClusterServer(true);
    }
    if (includeServerList.includes(OccupancySensing.Cluster.id) && !this.hasClusterServer(OccupancySensing.Cluster)) {
      this.createDefaultOccupancySensingClusterServer(false);
    }
    if (includeServerList.includes(IlluminanceMeasurement.Cluster.id) && !this.hasClusterServer(IlluminanceMeasurement.Cluster)) {
      this.createDefaultIlluminanceMeasurementClusterServer();
    }
    if (includeServerList.includes(AirQuality.Cluster.id) && !this.hasClusterServer(AirQuality.Cluster)) {
      this.createDefaultAirQualityClusterServer();
    }
    if (includeServerList.includes(TvocMeasurement.Cluster.id) && !this.hasClusterServer(TvocMeasurement.Cluster)) {
      this.createDefaultTvocMeasurementClusterServer();
    }
    if (includeServerList.includes(DoorLock.Cluster.id) && !this.hasClusterServer(DoorLock.Cluster)) {
      this.createDefaultDoorLockClusterServer();
    }
    if (includeServerList.includes(Thermostat.Cluster.id) && !this.hasClusterServer(Thermostat.Complete)) {
      this.createDefaultThermostatClusterServer();
    }
    if (includeServerList.includes(TimeSync.Cluster.id) && !this.hasClusterServer(TimeSync.Cluster)) {
      this.createDefaultDummyTimeSyncClusterServer();
    }
  }

  /**
   * Adds mandatory client clusters to the device
   *
   * @protected
   * @param attributeInitialValues Optional object with initial attribute values for automatically added clusters
   * @param includeClientList List of clusters to include
   */
  // attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected addDeviceClusterClient(includeClientList: ClusterId[] = []) {
    /* Not implemented since not supported by matter.js */
  }

  public addDeviceTypeAndClusterServer(deviceType: DeviceTypeDefinition | undefined, serverList: ClusterId[]) {
    this.log.debug(`addDeviceTypeAndClusterServer deviceType: ${deviceType?.name} serverList: ${serverList}`);
    if (deviceType) this.addDeviceType(deviceType);
    this.addDeviceClusterServer(serverList);
  }

  public addChildDeviceTypeAndClusterServer(endpointName: string, state: string, deviceType: DeviceTypeDefinition | undefined, includeServerList: ClusterId[]) {
    this.hasEndpoints = true;

    /* Look for existing child endpoint */
    let child: Endpoint | undefined = undefined;
    const childEndpoints = this.getChildEndpoints();
    childEndpoints.forEach((childEndpoint) => {
      if (child) return;
      const labelList = childEndpoint.getClusterServer(FixedLabelCluster)?.getLabelListAttribute();
      if (labelList) {
        for (const entry of labelList) {
          if (entry.label === 'endpointName' && entry.value === endpointName) {
            this.log.debug(`addChildDeviceTypeAndClusterServer: Child endpoint found: ${zb}${endpointName}${db}`);
            child = childEndpoint;
            return;
          }
        }
      }
    });

    if (!child) {
      this.log.debug(`addChildDeviceTypeAndClusterServer: Child endpoint created: ${zb}${endpointName}${db}`);
      child = new Endpoint([deviceType ?? DeviceTypes.ON_OFF_PLUGIN_UNIT]);
      if (!deviceType) includeServerList.push(Identify.Cluster.id);
      if (!deviceType) includeServerList.push(Scenes.Cluster.id);
      if (!deviceType) includeServerList.push(Groups.Cluster.id);
      if (!deviceType) includeServerList.push(OnOff.Cluster.id);
      child.addFixedLabel('endpointName', endpointName);
      this.addChildEndpoint(child);
    }

    includeServerList.forEach((clusterId) => {
      this.log.debug(`- with cluster: ${hk}${clusterId}${db}-${hk}${getClusterNameById(clusterId)}${db}`);
    });

    if (includeServerList.includes(Identify.Cluster.id)) {
      child.addClusterServer(this.getDefaultIdentifyClusterServer());
    }
    if (includeServerList.includes(Groups.Cluster.id)) {
      child.addClusterServer(this.getDefaultGroupsClusterServer());
    }
    if (includeServerList.includes(Scenes.Cluster.id)) {
      child.addClusterServer(this.getDefaultScenesClusterServer());
    }
    if (includeServerList.includes(OnOff.Cluster.id)) {
      child.addClusterServer(this.getDefaultOnOffClusterServer());
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultTemperatureMeasurementClusterServer());
    }
    if (includeServerList.includes(BooleanState.Cluster.id)) {
      child.addClusterServer(this.getDefaultBooleanStateClusterServer());
    }
    if (includeServerList.includes(EveHistory.Cluster.id) && !this.hasClusterServer(EveHistory.Cluster)) {
      child.addClusterServer(this.getDefaultStaticEveHistoryClusterServer());
    }
    if (includeServerList.includes(ElectricalMeasurement.Cluster.id) && !this.hasClusterServer(ElectricalMeasurement.Cluster)) {
      child.addClusterServer(this.getDefaultElectricalMeasurementClusterServer());
    }
  }

  getChildPayload(endpointNumber: EndpointNumber | undefined, key: string, value: string): Payload {
    const payload: Payload = {};
    if (!endpointNumber) {
      payload[key] = value;
      this.log.debug('getChildStatePayload payload:', payload);
      return payload;
    }
    const endpoint = this.getChildEndpoint(endpointNumber);
    //this.log.debug('getChildStatePayload endpoint:', endpoint);
    if (!endpoint) {
      payload[key] = value;
      this.log.debug('getChildStatePayload payload:', payload);
      return payload;
    }
    const labelList = endpoint.getClusterServer(FixedLabelCluster)?.getLabelListAttribute();
    this.log.debug('getChildStatePayload labelList:', labelList);
    if (!labelList) {
      payload[key] = value;
      this.log.debug('getChildStatePayload payload:', payload);
      return payload;
    }
    for (const entry of labelList) {
      if (entry.label === 'endpointName') {
        payload['state_' + entry.value] = value;
        this.log.debug('getChildStatePayload payload:', payload);
        return payload;
      }
    }
    return { unknown: value };
  }

  configure() {
    if (this.getClusterServerById(WindowCovering.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName}`);
      this.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.getClusterServerById(DoorLock.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName}`);
      this.getClusterServerById(DoorLock.Cluster.id)?.setLockStateAttribute(DoorLock.LockState.Locked);
    }
    if (this.getClusterServerById(Switch.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName}`);
      this.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
    }
  }
}
