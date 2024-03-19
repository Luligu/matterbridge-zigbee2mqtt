/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// matter.js imports
import {
  Device,
  DeviceTypes,
  DeviceTypeDefinition,
  EndpointOptions,
  getClusterInitialAttributeValues,
  logEndpoint,
  AirQuality,
  AirQualityCluster,
  MatterbridgeDevice,
  airQualitySensor,
  colorTemperatureSwitch,
  dimmableSwitch,
  onOffSwitch,
  ClusterServer,
  AttributeInitialValues,
  BridgedDeviceBasicInformation,
  BridgedDeviceBasicInformationCluster,
  Identify,
  Groups,
  Scenes,
  OnOff,
  LevelControl,
  createDefaultLevelControlClusterServer,
  ColorControl,
  ColorControlCluster,
  Switch,
  SwitchCluster,
  TemperatureMeasurement,
  TemperatureMeasurementCluster,
  BooleanState,
  BooleanStateCluster,
  RelativeHumidityMeasurement,
  RelativeHumidityMeasurementCluster,
  PressureMeasurement,
  PressureMeasurementCluster,
  OccupancySensingCluster,
  OccupancySensing,
  IlluminanceMeasurementCluster,
  IlluminanceMeasurement,
  PowerSource,
  ClusterId,
  TvocMeasurement,
} from 'matterbridge';

import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, nf, wr, er, stringify } from 'node-ansi-logger';
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
    this.log = new AnsiLogger({ logName: this.accessoryName, logTimestampFormat: TimestampFormat.TIME_MILLIS });
    this.log.debug(`Created MatterEntity: ${this.accessoryName}`);

    this.platform.z2m.on('MESSAGE-' + this.accessoryName, (payload: object) => {
      if (this.bridgedDevice === undefined) return;
      this.log.debug(`MQTT message for accessory ${this.ien}${this.accessoryName}${rs}${db} payload: ${stringify(payload, true, 255, 247)}`);
      Object.entries(payload).forEach(([key, value], index) => {
        if (this.bridgedDevice === undefined) return;
        if (key === 'state') {
          this.bridgedDevice.getClusterServerById(OnOff.Cluster.id)?.setOnOffAttribute(value === 'ON' ? true : false);
          this.log.debug(`Setting accessory ${this.ien}${this.accessoryName}${rs}${db} onOffAttribute: ${value === 'ON' ? true : false}`);
        }
        if (key === 'brightness') {
          this.bridgedDevice.getClusterServerById(LevelControl.Cluster.id)?.setCurrentLevelAttribute(value);
          this.log.debug(`Setting accessory ${this.ien}${this.accessoryName}${rs}${db} currentLevelAttribute: ${value}`);
        }
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp') {
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.attributes.colorTemperatureMireds.setLocal(value);
          this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
          this.log.debug(`Setting accessory ${this.ien}${this.accessoryName}${rs}${db} colorTemperatureMireds: ${value}`);
        }
        if (key === 'temperature') {
          this.bridgedDevice.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
          if (this.bridgedDevice.hasEndpoints) {
            const endpoints = this.bridgedDevice.getChildEndpoints();
            endpoints.forEach((endpoint) => {
              endpoint.getClusterServerById(TemperatureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
            });
          }
        }
        if (key === 'humidity') {
          this.bridgedDevice.getClusterServerById(RelativeHumidityMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
          if (this.bridgedDevice.hasEndpoints) {
            const endpoints = this.bridgedDevice.getChildEndpoints();
            endpoints.forEach((endpoint) => {
              endpoint.getClusterServerById(RelativeHumidityMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value * 100));
            });
          }
        }
        if (key === 'pressure') {
          this.bridgedDevice.getClusterServerById(PressureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value));
          if (this.bridgedDevice.hasEndpoints) {
            const endpoints = this.bridgedDevice.getChildEndpoints();
            endpoints.forEach((endpoint) => {
              endpoint.getClusterServerById(PressureMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(value));
            });
          }
        }
        if (key === 'contact') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
        }
        if (key === 'water_leak') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
        }
        if (key === 'carbon_monoxide') {
          this.bridgedDevice.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(value);
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
        }
        if (key === 'voc') {
          this.bridgedDevice.getClusterServerById(TvocMeasurement.Cluster.id)?.setMeasuredValueAttribute(value);
        }
        if (key === 'occupancy') {
          this.bridgedDevice.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute({ occupied: value as boolean });
        }
        if (key === 'illuminance_lux' || (key === 'illuminance' && !('illuminance_lux' in payload))) {
          this.bridgedDevice.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(value) + 1, 0xfffe), 0)));
          if (this.bridgedDevice.hasEndpoints) {
            const endpoints = this.bridgedDevice.getChildEndpoints();
            endpoints.forEach((endpoint) => {
              endpoint.getClusterServerById(IlluminanceMeasurement.Cluster.id)?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(value) + 1, 0xfffe), 0)));
            });
          }
        }
      });
    });

    this.platform.z2m.on('ONLINE-' + this.accessoryName, () => {
      this.log.info(`ONLINE message for accessory ${this.ien}${this.accessoryName}${rs}`);
      //this.device?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(true);
    });

    this.platform.z2m.on('OFFLINE-' + this.accessoryName, () => {
      this.log.warn(`OFFLINE message for accessory ${this.ien}${this.accessoryName}${wr}`);
      //this.device?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.setReachableAttribute(false);
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

    // Attributes handlers
    /*
    this.bridgedDevice.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.subscribeReachableAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute Reachable changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(OnOff.Cluster.id)?.subscribeOnOffAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute OnOff changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(LevelControl.Cluster.id)?.subscribeCurrentLevelAttribute((newValue: number | null, oldValue: number | null) => {
      this.log.debug(`Attribute LevelControl changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    */

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
  cluster: number;
  attribute: number;
}

export class ZigbeeDevice extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, device: BridgeDevice) {
    super(platform, device);
    if (device.friendly_name === 'Coordinator') return;

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
        console.log(`Changed ${device.friendly_name} to light`);
      });
    }
    if (forceOutlet.includes(device.friendly_name)) {
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'outlet' : type;
        console.log(`Changed ${device.friendly_name} to outlet`);
      });
    }
    this.log.info(`Device ${this.ien}${device.friendly_name}${rs}${nf} endpoints: ${endpoints.length} types: ${types} properties: ${properties} names: ${names}`);

    const z2m: ZigbeeToMatter[] = [
      { type: 'switch', name: 'state', property: 'state', cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
      { type: 'outlet', name: 'state', property: 'state', cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
      { type: 'light', name: 'state', property: 'state', cluster: OnOff.Cluster.id, attribute: OnOff.Cluster.attributes.onOff.id },
      { type: 'light', name: 'brightness', property: 'brightness', cluster: LevelControl.Cluster.id, attribute: LevelControl.Cluster.attributes.currentLevel.id },
      { type: '', name: 'occupancy', property: 'occupancy', cluster: OccupancySensing.Cluster.id, attribute: OccupancySensing.Cluster.attributes.occupancy.id },
      { type: '', name: 'illuminance', property: 'illuminance', cluster: IlluminanceMeasurement.Cluster.id, attribute: IlluminanceMeasurement.Cluster.attributes.measuredValue.id },
      { type: '', name: 'contact', property: 'contact', cluster: BooleanState.Cluster.id, attribute: BooleanState.Cluster.attributes.stateValue.id },
    ];

    // Create the device with specific properties
    if (types.includes('light')) {
      if (properties.includes('color')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.COLOR_TEMPERATURE_LIGHT, [
          Identify.Cluster.id,
          Groups.Cluster.id,
          Scenes.Cluster.id,
          OnOff.Cluster.id,
          LevelControl.Cluster.id,
          ColorControl.Cluster.id,
        ]);
      } else if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.DIMMABLE_LIGHT, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id]);
      } else {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.ON_OFF_LIGHT, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id]);
      }
    } else if (types.includes('outlet')) {
      if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.DIMMABLE_PLUGIN_UNIT, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id]);
      } else {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.ON_OFF_PLUGIN_UNIT, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id]);
      }
    } else if (types.includes('switch')) {
      if (properties.includes('color')) {
        this.bridgedDevice = new BridgedBaseDevice(this, colorTemperatureSwitch, [
          Identify.Cluster.id,
          Groups.Cluster.id,
          Scenes.Cluster.id,
          OnOff.Cluster.id,
          LevelControl.Cluster.id,
          ColorControl.Cluster.id,
        ]);
      } else if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(this, dimmableSwitch, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id]);
      } else {
        this.bridgedDevice = new BridgedBaseDevice(this, onOffSwitch, [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id]);
      }
    } else if (types.includes('cover')) {
      //
    } else if (types.includes('door')) {
      //
    } else if (types.includes('lock')) {
      //
    } else {
      // Create the device with generic properties
      if (properties.includes('occupancy')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.OCCUPANCY_SENSOR, [Identify.Cluster.id, OccupancySensing.Cluster.id]);
        if (properties.includes('illuminance') || properties.includes('illuminance_lux'))
          this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.LIGHT_SENSOR, [IlluminanceMeasurement.Cluster.id]);
      } else if (properties.includes('illuminance') || properties.includes('illuminance_lux')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.LIGHT_SENSOR, [Identify.Cluster.id, IlluminanceMeasurement.Cluster.id]);
      }
      if (properties.includes('air_quality')) {
        console.log('Include air_quality');
        this.bridgedDevice = new BridgedBaseDevice(this, airQualitySensor, [Identify.Cluster.id, AirQuality.Cluster.id]);
        this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.TEMPERATURE_SENSOR, [TemperatureMeasurement.Cluster.id]);
        this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.HUMIDITY_SENSOR, [RelativeHumidityMeasurement.Cluster.id]);
      } else if (properties.includes('temperature')) {
        console.log('Include temperature');
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.TEMPERATURE_SENSOR, [Identify.Cluster.id, TemperatureMeasurement.Cluster.id]);
        this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.HUMIDITY_SENSOR, [RelativeHumidityMeasurement.Cluster.id]);
        this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.PRESSURE_SENSOR, [PressureMeasurement.Cluster.id]);
      }
      if (properties.includes('contact')) {
        if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.CONTACT_SENSOR, [Identify.Cluster.id, BooleanState.Cluster.id]);
        else this.bridgedDevice.addDeviceTypeAndClusterServer(DeviceTypes.CONTACT_SENSOR, [BooleanState.Cluster.id]);
      }
      if (properties.includes('water_leak')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.CONTACT_SENSOR, [Identify.Cluster.id, BooleanState.Cluster.id]);
      }
      if (properties.includes('vibration')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.CONTACT_SENSOR, [Identify.Cluster.id, BooleanState.Cluster.id]);
      }
      if (properties.includes('smoke')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.CONTACT_SENSOR, [Identify.Cluster.id, BooleanState.Cluster.id]);
      }
      if (properties.includes('action')) {
        this.bridgedDevice = new BridgedBaseDevice(this, DeviceTypes.GENERIC_SWITCH, [Identify.Cluster.id, Switch.Cluster.id]);
      }
    }
    if (!this.bridgedDevice) return;

    // Attributes handlers
    /*
    this.bridgedDevice.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.subscribeReachableAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute Reachable changed for ${this.ien}${device.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(OnOff.Cluster.id)?.subscribeOnOffAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute OnOff changed for ${this.ien}${device.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(LevelControl.Cluster.id)?.subscribeCurrentLevelAttribute((newValue: number | null, oldValue: number | null) => {
      this.log.debug(`Attribute CurrentLevel changed for ${this.ien}${device.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.subscribeColorTemperatureMiredsAttribute((newValue: any, oldValue: any) => {
      this.log.debug(`Attribute ColorTemperatureMireds changed for ${this.ien}${device.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(ColorControl.Cluster.id)?.subscribeColorModeAttribute((newValue: any, oldValue: any) => {
      this.log.debug(`Attribute ColorMode changed for ${this.ien}${device.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    */

    // Command handlers
    this.bridgedDevice.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called for ${this.ien}${device.friendly_name}${rs}${db} identifyTime:${identifyTime}`);
      logEndpoint(this.bridgedDevice!);
    });
    if (properties.includes('state')) {
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
    if (properties.includes('brightness')) {
      this.bridgedDevice.addCommandHandler('moveToLevel', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevel called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevel', device.friendly_name, { brightness: level });
      });
      this.bridgedDevice.addCommandHandler('moveToLevelWithOnOff', async ({ request: { level }, attributes: { currentLevel } }) => {
        this.log.debug(`Command moveToLevelWithOnOff called for ${this.ien}${device.friendly_name}${rs}${db} request: ${level} attributes: ${currentLevel}`);
        this.publishCommand('moveToLevelWithOnOff', device.friendly_name, { brightness: level });
      });
    }
    if (properties.includes('color_temp')) {
      this.bridgedDevice.addCommandHandler('moveToColorTemperature', async ({ request: request, attributes: attributes }) => {
        this.log.debug(
          `Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.colorTemperatureMireds} attributes: ${attributes.colorTemperatureMireds}`,
        );
        this.log.warn(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.ColorTemperatureMireds);
        this.publishCommand('moveToColorTemperature', device.friendly_name, { color_temp: request.colorTemperatureMireds });
      });
    }
    if (properties.includes('color')) {
      this.bridgedDevice.addCommandHandler('moveToHue', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToHue called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue} attributes: ${attributes.currentHue}`);
        this.log.warn(`Command moveToHue called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (attributes.currentSaturation!.getLocal() / 254) * 100, 50);
        this.publishCommand('moveToHue', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
      });
      this.bridgedDevice.addCommandHandler('moveToSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(`Command moveToSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.saturation} attributes: ${attributes.currentSaturation}`);
        this.log.warn(`Command moveToSaturation called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        const rgb = color.hslColorToRgbColor((attributes.currentHue!.getLocal() / 254) * 360, (request.saturation / 254) * 100, 50);
        this.publishCommand('moveToHue', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
      });
      this.bridgedDevice.addCommandHandler('moveToHueAndSaturation', async ({ request: request, attributes: attributes }) => {
        this.log.debug(
          `Command moveToHueAndSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.hue}-${request.saturation} attributes: ${attributes.currentHue}-${attributes.currentSaturation}`,
        );
        this.log.warn(`Command moveToHueAndSaturation called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
        attributes.colorMode.setLocal(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        const rgb = color.hslColorToRgbColor((request.hue / 254) * 360, (request.saturation / 254) * 100, 50);
        this.publishCommand('moveToHueAndSaturation', device.friendly_name, { color: { r: rgb.r, g: rgb.g, b: rgb.b } });
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
    if (entity.isDevice && entity.device) {
      this.addBasicInformationCluster(entity.device.friendly_name, entity.device.definition.vendor, entity.device.definition.model, entity.device.ieee_address);
    } else if (entity.isGroup && entity.group) {
      this.addBasicInformationCluster(entity.group.friendly_name, 'zigbee2MQTT', 'Group', `group-${entity.group.id}`);
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

    // Add needed endpoints in the childList for multi endpoint devices
    /*
    if (composed && childList && childList.length > 0) {
      this.hasEndpoints = composed;
      childList.forEach(childClusterID => {
        if (childClusterID === AirQuality.Cluster.id) {
          const endpoint = new Device(airQualitySensor);
          endpoint.addClusterServer(createDefaultIdentifyClusterServer(
            { identify: async data => await this.commandHandler.executeHandler('identify', data) }
          ));
          const airQualityCluster = ClusterServer(AirQualityCluster.with(AirQuality.Feature.FairAirQuality, AirQuality.Feature.ModerateAirQuality, AirQuality.Feature.VeryPoorAirQuality),
            { airQuality: AirQuality.AirQualityType.Good }, {}, {});
          endpoint.addClusterServer(airQualityCluster);
          this.addChildEndpoint(endpoint);
        }
        if (childClusterID === TemperatureMeasurement.Cluster.id) {
          const endpoint = new Device(DeviceTypes.TEMPERATURE_SENSOR);
          endpoint.addClusterServer(createDefaultIdentifyClusterServer(
            { identify: async data => await this.commandHandler.executeHandler('identify', data) }
          ));
          const temperatureMeasurementCluster = ClusterServer(TemperatureMeasurementCluster,
            { measuredValue: 0, minMeasuredValue: null, maxMeasuredValue: null, tolerance: 0 }, {}, {});
          endpoint.addClusterServer(temperatureMeasurementCluster);
          this.addChildEndpoint(endpoint);
        }
        if (childClusterID === RelativeHumidityMeasurement.Cluster.id) {
          const endpoint = new Device(DeviceTypes.HUMIDITY_SENSOR);
          endpoint.addClusterServer(createDefaultIdentifyClusterServer(
            { identify: async data => await this.commandHandler.executeHandler('identify', data) }
          ));
          const humidityMeasurementCluster = ClusterServer(RelativeHumidityMeasurementCluster,
            { measuredValue: 0, minMeasuredValue: null, maxMeasuredValue: null, tolerance: 0 }, {}, {});
          endpoint.addClusterServer(humidityMeasurementCluster);
          this.addChildEndpoint(endpoint);
        }
        if (childClusterID === PressureMeasurement.Cluster.id) {
          const endpoint = new Device(DeviceTypes.PRESSURE_SENSOR);
          endpoint.addClusterServer(createDefaultIdentifyClusterServer(
            { identify: async data => await this.commandHandler.executeHandler('identify', data) }
          ));
          const pressureMeasurementCluster = ClusterServer(PressureMeasurementCluster,
            { measuredValue: 0, minMeasuredValue: null, maxMeasuredValue: null, tolerance: 0 }, {}, {});
          endpoint.addClusterServer(pressureMeasurementCluster);
          this.addChildEndpoint(endpoint);
        }
        if (childClusterID === IlluminanceMeasurement.Cluster.id) {
          const endpoint = new Device(DeviceTypes.LIGHT_SENSOR);
          endpoint.addClusterServer(createDefaultIdentifyClusterServer(
            { identify: async data => await this.commandHandler.executeHandler('identify', data) }
          ));
          const illuminanceMeasurementCluster = ClusterServer(IlluminanceMeasurementCluster,
            { measuredValue: 0, minMeasuredValue: null, maxMeasuredValue: null, tolerance: 0 }, {}, {});
          endpoint.addClusterServer(illuminanceMeasurementCluster);
          this.addChildEndpoint(endpoint);
        }
      });
    }
    */
  }

  /**
   * Adds BridgedDeviceBasicInformationCluster
   *
   * @protected
   * @param deviceName Name of the device
   * @param deviceSerial Serial of the device
   */
  protected addBasicInformationCluster(deviceName: string, vendorName: string, productName: string, deviceSerial: string) {
    this.createDefaultBridgedDeviceBasicInformationClusterServer(deviceName, (deviceSerial + '_' + hostname).slice(0, 32), 0xfff1, vendorName, productName);
    /*
    const bridgedBasicInformationCluster = this.getClusterServer(BridgedDeviceBasicInformationCluster);
    bridgedBasicInformationCluster?.subscribeReachableAttribute((newValue) => {
      bridgedBasicInformationCluster.triggerReachableChangedEvent({ reachableNewValue: newValue });
    });
    */
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
  }

  /**
   * Adds mandatory client clusters to the device
   *
   * @protected
   * @param attributeInitialValues Optional object with initial attribute values for automatically added clusters
   * @param includeClientList List of clusters to include
   */
  // attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> },
  protected addDeviceClusterClient(includeClientList: ClusterId[] = []) {
    /* Not implemented */
  }

  public addDeviceTypeAndClusterServer(deviceType: DeviceTypeDefinition, serverList: ClusterId[]) {
    this.addDeviceType(deviceType);
    this.addDeviceClusterServer(serverList);
  }

  /**
   * Add a sub-device to the a multi endpoint device.
   * @param device Device instance to add
   */
  public addDevice(device: Device) {
    this.addChildEndpoint(device);
  }

  /**
   * Get all sub-devices of the multi endpoint device.
   *
   * @returns Array with all sub-devices
   */
  public getDevices() {
    return this.getChildEndpoints();
  }
}
