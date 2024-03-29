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
  WindowCoveringCluster,
  OnOffCluster,
  LevelControlCluster,
  DoorLock,
  DoorLockCluster,
  BridgedDeviceBasicInformation,
} from 'matterbridge';

import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, nf, wr, stringify, debugStringify, hk } from 'node-ansi-logger';
import { ZigbeePlatform } from './platform.js';
import { BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';
import * as color from './colorUtils.js';
import EventEmitter from 'events';
import { hostname } from 'os';

export class ZigbeeEntity extends EventEmitter {
  protected log: AnsiLogger;
  protected platform: ZigbeePlatform;
  public device: BridgeDevice | undefined;
  public group: BridgeGroup | undefined;
  protected accessoryName: string = '';
  public isDevice: boolean = false;
  public isGroup: boolean = false;
  protected en = '';
  protected ien = '';
  public bridgedDevice: BridgedBaseDevice | undefined;

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
      if (this.bridgedDevice === undefined) return;
      const debugEnabled = this.platform.debugEnabled;
      this.log.setLogDebug(true);
      this.log.debug(`MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} payload: ${debugStringify(payload)}`);
      Object.entries(payload).forEach(([key, value]) => {
        if (this.bridgedDevice === undefined) return;
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
        if (key === 'state') {
          this.bridgedDevice.getClusterServerById(OnOff.Cluster.id)?.setOnOffAttribute(value === 'ON' ? true : false);
          this.log.debug(`Set accessory ${hk}OnOff.onOffAttribute: ${value === 'ON' ? true : false}`);
        }
        /* LevelControl */
        if (key === 'brightness') {
          this.bridgedDevice.getClusterServerById(LevelControl.Cluster.id)?.setCurrentLevelAttribute(value);
          this.log.debug(`Set accessory ${hk}LevelControl.currentLevelAttribute: ${value}`);
        }
        /* ColorControl ColorTemperatureMired */
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp') {
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorTemperatureMiredsAttribute(value);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorModeAttribute(ColorControl.ColorMode.ColorTemperatureMireds);
          this.log.debug(`Set accessory ${hk}ColorControl.colorTemperatureMireds: ${value}`);
        }
        /* ColorControl Hue and Saturation */
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'xy') {
          const hsl = color.xyToHsl(value.x, value.y);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setCurrentHueAttribute((hsl.h / 360) * 254);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setCurrentSaturationAttribute((hsl.s / 100) * 254);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.setColorModeAttribute(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
          this.log.debug(`Set accessory ${hk}ColorControl.color: X:${value.x} Y:${value.y} => H:${(hsl.h / 360) * 254} S:${(hsl.s / 100) * 254}`);
        }
        /* Switch */
        if (key === 'action') {
          let position = undefined;
          if (value === 'single') {
            position = 0;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerInitialPressEvent({ newPosition: 0 });
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
          if (value === 'double') {
            position = 1;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerMultiPressCompleteEvent({ previousPosition: 0, totalNumberOfPressesCounted: 2 });
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
          if (value === 'hold') {
            position = 2;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerLongPressEvent({ previousPosition: 0 });
            this.log.debug(`*Set accessory ${hk}Switch.currentPosition: ${position}`);
          }
        }
        if (key === 'battery') {
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatPercentRemainingAttribute(Math.round(value * 2));
          this.log.debug(`Set accessory ${hk}PowerSource.batPercentRemaining: ${Math.round(value * 2)}`);
        }
        if (key === 'battery_low') {
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatChargeLevelAttribute(value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok);
          this.log.debug(`Set accessory ${hk}PowerSource.batChargeLevel: ${value === true ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok}`);
        }
        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') {
          this.bridgedDevice.getClusterServerById(PowerSource.Cluster.id)?.setBatVoltageAttribute(value);
          this.log.debug(`Set accessory ${hk}PowerSource.batVoltage: ${value}`);
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
        if (key === 'voc') {
          this.bridgedDevice.getClusterServerById(TvocMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.min(65535, value));
          this.log.debug(`Set accessory ${hk}TvocMeasurement.measuredValue: ${value}`);
        }
        if (key === 'occupancy') {
          this.bridgedDevice.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute({ occupied: value as boolean });
          this.log.debug(`Set accessory ${hk}OccupancySensing.occupancy: ${value}`);
        }
        if (key === 'illuminance_lux' || (key === 'illuminance' && !('illuminance_lux' in payload))) {
          this.bridgedDevice.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(value) + 1, 0xfffe), 0)));
          this.log.debug(`Set accessory ${hk}IlluminanceMeasurement.measuredValue: ${Math.round(Math.max(Math.min(10000 * Math.log10(value) + 1, 0xfffe), 0))}`);
        }
      });
      this.log.setLogDebug(debugEnabled);
    });

    this.platform.z2m.on('ONLINE-' + this.accessoryName, () => {
      this.log.info(`ONLINE message for accessory ${this.ien}${this.accessoryName}${rs}`);
      if (this.bridgedDevice?.id !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(true);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachable: true });
        this.log.info(`${db}Set accessory ${hk}BridgedDeviceBasicInformation.reachable: true`);
      }
    });

    this.platform.z2m.on('OFFLINE-' + this.accessoryName, () => {
      this.log.warn(`OFFLINE message for accessory ${this.ien}${this.accessoryName}${wr}`);
      if (this.bridgedDevice?.id !== undefined) {
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(false);
        this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachable: false });
        this.log.info(`${db}Set accessory ${hk}BridgedDeviceBasicInformation.reachable: false`);
      }
    });
  }

  protected publishCommand(command: string, entityName: string, payload: Payload) {
    this.log.debug(`executeCommand ${command} called for ${this.ien}${entityName}${rs}${db} payload: ${stringify(payload, true)}`);
    const topic = this.platform.z2m.mqttTopic + '/' + entityName + '/set';
    this.platform.z2m.publish(topic, JSON.stringify(payload));
    this.log.info(`MQTT publish topic: ${topic} payload: ${stringify(payload, true)} for ${this.en}${entityName}`);
  }
}

export class ZigbeeGroup extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);

    // TODO Add the group scanning for real groups. This cover only automations
    this.bridgedDevice = new BridgedBaseDevice(this, onOffSwitch, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id]);

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
  deviceType: DeviceTypeDefinition;
  cluster: number;
  attribute: number;
}

/* eslint-disable */
// prettier-ignore
const z2ms: ZigbeeToMatter[] = [
  { type: 'switch', name: 'state',          property: 'state',      deviceType: onOffSwitch,                cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
  { type: 'switch', name: 'brightness',     property: 'brightness', deviceType: dimmableSwitch,             cluster: LevelControl.Cluster.id, attribute: LevelControl.Cluster.attributes.currentLevel.id },
  { type: 'switch', name: 'color_xy',       property: 'color_xy',   deviceType: colorTemperatureSwitch,     cluster: ColorControl.Cluster.id, attribute: ColorControl.Cluster.attributes.colorMode.id },
  { type: 'outlet', name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_LIGHT,   cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
  { type: 'outlet', name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_PLUGIN_UNIT, cluster: LevelControl.Cluster.id, attribute: LevelControl.Cluster.attributes.currentLevel.id },
  { type: 'light',  name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_LIGHT,   cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
  { type: 'light',  name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_LIGHT, cluster: LevelControl.Cluster.id, attribute: LevelControl.Cluster.attributes.currentLevel.id },
  { type: 'light',  name: 'color_xy',       property: 'color_xy',   deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: ColorControl.Cluster.attributes.colorMode.id },
  { type: 'cover',  name: 'state',          property: 'state',      deviceType: DeviceTypes.WINDOW_COVERING, cluster: WindowCovering.Cluster.id, attribute: WindowCovering.Complete.attributes.currentPositionLiftPercent100ths.id },
  { type: '',       name: 'occupancy',      property: 'occupancy',  deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: OccupancySensing.Cluster.attributes.occupancy.id },
  { type: '',       name: 'illuminance',    property: 'illuminance', deviceType: DeviceTypes.LIGHT_SENSOR,  cluster: IlluminanceMeasurement.Cluster.id, attribute: IlluminanceMeasurement.Cluster.attributes.measuredValue.id },
  { type: '',       name: 'contact',        property: 'contact',    deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
  { type: '',       name: 'water_leak',     property: 'water_leak', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
  { type: '',       name: 'vibration',      property: 'vibration',  deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
  { type: '',       name: 'smoke',          property: 'smoke',      deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
  { type: '',       name: 'carbon_monoxide', property: 'carbon_monoxide', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
  { type: '',       name: 'temperature',    property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: TemperatureMeasurement.Cluster.attributes.measuredValue.id },
  { type: '',       name: 'humidity',       property: 'humidity',   deviceType: DeviceTypes.HUMIDITY_SENSOR, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: RelativeHumidityMeasurement.Cluster.attributes.measuredValue.id },
  { type: '',       name: 'pressure',       property: 'pressure',   deviceType: DeviceTypes.PRESSURE_SENSOR, cluster: PressureMeasurement.Cluster.id, attribute: PressureMeasurement.Cluster.attributes.measuredValue.id },
  { type: '',       name: 'air_quality',    property: 'air_quality', deviceType: airQualitySensor,          cluster: AirQuality.Cluster.id, attribute: AirQuality.Cluster.attributes.airQuality.id },
  { type: '',       name: 'voc',            property: 'voc',        deviceType: airQualitySensor,           cluster: TvocMeasurement.Cluster.id, attribute: TvocMeasurement.Cluster.attributes.measuredValue.id },
  { type: '',       name: 'action',         property: 'action',     deviceType: DeviceTypes.GENERIC_SWITCH, cluster: Switch.Cluster.id, attribute: Switch.Cluster.attributes.currentPosition.id },
  //{ type: '',       name: 'transmit_power', property: 'transmit_power', deviceType: DeviceTypes.DOOR_LOCK, cluster: DoorLock.Cluster.id, attribute: DoorLock.Cluster.attributes.lockState.id },
];
/* eslint-enable */

export class ZigbeeDevice extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, device: BridgeDevice) {
    super(platform, device);
    if (device.friendly_name === 'Coordinator') {
      this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.DOOR_LOCK, [Identify.Cluster.id, DoorLock.Cluster.id]);
    } else if (device.model_id === 'ti.router' && device.manufacturer === 'TexasInstruments') {
      this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.DOOR_LOCK, [Identify.Cluster.id, DoorLock.Cluster.id]);
    }

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
        types.push(expose.type);
        if (expose.endpoint) endpoints.push(expose.endpoint);
        expose.features?.forEach((feature) => {
          names.push(feature.name);
          properties.push(feature.property);
        });
      } else {
        //Generic features without type
        if (expose.name) names.push(expose.name);
        properties.push(expose.property);
      }
    });
    device.definition?.options.forEach((option) => {
      if (option.name) names.push(option.name);
      properties.push(option.property);
    });
    if (forceLight.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'light' : type;
        this.log.info(`Changed ${device.friendly_name} to light`);
      });
    }
    if (forceOutlet.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'outlet' : type;
        this.log.info(`Changed ${device.friendly_name} to outlet`);
      });
    }
    if (types.length === 0) types.push('');
    this.log.debug(`**Device ${this.ien}${device.friendly_name}${rs}${nf} endpoints: ${endpoints.length} \ntypes: ${types.join(' ')} \nproperties: ${properties.join(' ')} \nnames: ${names.join(' ')}`);

    [...types].forEach((type) => {
      [...names].forEach((name) => {
        const z2m = z2ms.find((z2m) => z2m.type === type && z2m.property === name);
        if (z2m) {
          this.log.debug(`***Device ${this.ien}${device.friendly_name}${rs}${nf} type: ${type} property: ${name} => deviceType: ${z2m.deviceType.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`);
          const requiredServerClusters: ClusterId[] = [];
          if (z2m.deviceType.requiredServerClusters.includes(Groups.Cluster.id)) requiredServerClusters.push(Groups.Cluster.id);
          if (z2m.deviceType.requiredServerClusters.includes(Scenes.Cluster.id)) requiredServerClusters.push(Scenes.Cluster.id);
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, z2m.deviceType, [Identify.Cluster.id, ...requiredServerClusters, ClusterId(z2m.cluster)]);
          else this.bridgedDevice.addDeviceTypeAndClusterServer(z2m.deviceType, [ClusterId(z2m.cluster)]);
          names.splice(names.indexOf(name), 1);
        }
      });
      types.splice(types.indexOf(type), 1);
    });
    this.log.debug(`****Device ${this.ien}${device.friendly_name}${rs}${nf} endpoints: ${endpoints.length} \ntypes: ${types.join(' ')} \nproperties: ${properties.join(' ')} \nnames: ${names.join(' ')}`);

    if (!this.bridgedDevice) return;

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.debug(`Command identify called for ${this.ien}${device.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
      logEndpoint(this.bridgedDevice!);
    });
    if (this.bridgedDevice.hasClusterServer(OnOffCluster)) {
      this.bridgedDevice.addCommandHandler('on', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command on called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('on', device.friendly_name, { state: 'ON' });
      });
      this.bridgedDevice.addCommandHandler('off', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command off called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('off', device.friendly_name, { state: 'OFF' });
      });
      this.bridgedDevice.addCommandHandler('toggle', async ({ attributes: { onOff } }) => {
        this.log.debug(`Command toggle called for ${this.ien}${device.friendly_name}${rs}${db} attribute: ${onOff.getLocal()}`);
        this.publishCommand('toggle', device.friendly_name, { state: 'TOGGLE' });
      });
    }
    if (this.bridgedDevice.hasClusterServer(LevelControlCluster)) {
      this.bridgedDevice.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevel called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevel', device.friendly_name, { brightness: level });
      });
      this.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevelWithOnOff', device.friendly_name, { brightness: level });
      });
    }
    if (this.bridgedDevice.hasClusterServer(ColorControlCluster) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('colorTemperatureMireds')) {
      this.bridgedDevice.addCommandHandler('moveToColorTemperature', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds?.getLocal()} colorMode ${attributes.colorMode.getLocal()}`);
        this.log.warn(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
        this.publishCommand('moveToColorTemperature', device.friendly_name, { color_temp: request.colorTemperatureMireds });
      });
    }
    if (this.bridgedDevice.hasClusterServer(ColorControlCluster) && this.bridgedDevice.getClusterServer(ColorControlCluster)?.isAttributeSupportedByName('currentHue')) {
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
    if (this.bridgedDevice.hasClusterServer(WindowCoveringCluster)) {
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
    if (this.bridgedDevice.hasClusterServer(DoorLockCluster)) {
      this.bridgedDevice.addCommandHandler('lockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.info(`Command lockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Locked);
        //this.publishCommand('lockDoor', device.friendly_name, { state: 'LOCK' });
      });
      this.bridgedDevice.addCommandHandler('unlockDoor', async ({ request: request, attributes: attributes }) => {
        this.log.info(`Command unlockDoor called for ${this.ien}${device.friendly_name}${rs}${db}`, request);
        attributes.lockState?.setLocal(DoorLock.LockState.Unlocked);
        //this.publishCommand('unlockDoor', device.friendly_name, { state: 'UNLOCK' });
      });
    }
  }
}

export class BridgedBaseDevice extends MatterbridgeDevice {
  //public deviceName: string;
  public hasEndpoints = false;

  constructor(entity: ZigbeeEntity, definition: DeviceTypeDefinition, includeServerList: ClusterId[] = [], includeClientList?: ClusterId[]) {
    super(definition);

    // Add all other server clusters in the includelist
    this.addDeviceClusterServer(includeServerList);

    // Add BridgedDeviceBasicInformationCluster
    if (entity.isDevice && entity.device && entity.device.friendly_name === 'Coordinator') {
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, 'zigbee2MQTT', 'Coordinator', entity.device.ieee_address);
    } else if (entity.isDevice && entity.device) {
      //this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, entity.device.definition.vendor, entity.device.definition.model, entity.device.ieee_address);
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, entity.device.manufacturer, entity.device.model_id, entity.device.ieee_address);
    } else if (entity.isGroup && entity.group) {
      this.addBridgedDeviceBasicInformationCluster(entity.group.friendly_name, 'zigbee2MQTT', 'Group', `group-${entity.group.id}`);
    }

    // Add PowerSource cluster
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
    if (includeServerList.includes(OnOff.Cluster.id)) {
      this.createDefaultOnOffClusterServer();
    }
    if (includeServerList.includes(LevelControl.Cluster.id)) {
      this.createDefaultLevelControlClusterServer();
    }
    if (includeServerList.includes(ColorControl.Cluster.id)) {
      this.createDefaultColorControlClusterServer();
    }
    if (includeServerList.includes(WindowCovering.Cluster.id)) {
      this.createDefaultWindowCoveringClusterServer();
    }
    if (includeServerList.includes(Switch.Cluster.id)) {
      this.createDefaultSwitchClusterServer();
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id)) {
      this.createDefaultTemperatureMeasurementClusterServer();
    }
    if (includeServerList.includes(RelativeHumidityMeasurement.Cluster.id)) {
      this.createDefaultRelativeHumidityMeasurementClusterServer();
    }
    if (includeServerList.includes(PressureMeasurement.Cluster.id)) {
      this.createDefaultPressureMeasurementClusterServer();
    }
    if (includeServerList.includes(BooleanState.Cluster.id)) {
      this.createDefaultBooleanStateClusterServer(true);
    }
    if (includeServerList.includes(OccupancySensing.Cluster.id)) {
      this.createDefaultOccupancySensingClusterServer(false);
    }
    if (includeServerList.includes(IlluminanceMeasurement.Cluster.id)) {
      this.createDefaultIlluminanceMeasurementClusterServer();
    }
    if (includeServerList.includes(AirQuality.Cluster.id)) {
      this.createDefaultAirQualityClusterServer();
    }
    if (includeServerList.includes(TvocMeasurement.Cluster.id)) {
      this.createDefaultTvocMeasurementClusterServer();
    }
    if (includeServerList.includes(DoorLock.Cluster.id)) {
      this.createDefaultDoorLockClusterServer();
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
    /* Not implemented */
  }

  public addDeviceTypeAndClusterServer(deviceType: DeviceTypeDefinition, serverList: ClusterId[]) {
    this.addDeviceType(deviceType);
    this.addDeviceClusterServer(serverList);
  }

  configure() {
    if (this.getClusterServerById(WindowCovering.Cluster.id)) {
      // eslint-disable-next-line no-console
      console.log(`Configuring ${this.deviceName}`);
      this.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.getClusterServerById(DoorLock.Cluster.id)) {
      // eslint-disable-next-line no-console
      console.log(`Configuring ${this.deviceName}`);
      this.getClusterServerById(DoorLock.Cluster.id)?.setLockStateAttribute(DoorLock.LockState.Locked);
    }
  }
}
