/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ZigbeePlatform } from './matterPlatform.js';
import { BridgeInfo, BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, nf, wr, er, stringify } from 'node-ansi-logger';
import EventEmitter from 'events';
import { Payload, PayloadValue } from './payloadTypes.js';
import * as color from './colorUtils.js';

// matter.js imports
import {
  Device,
  DeviceTypes,
  DeviceTypeDefinition,
  Endpoint,
  EndpointOptions,
  ComposedDevice,
  getClusterInitialAttributeValues,
  logEndpoint,
  WrapCommandHandler,
  DeviceClasses,
} from '@project-chip/matter-node.js/device';
import {
  Cluster,
  ClusterServer,
  Attributes,
  Commands,
  Events,
  AttributeInitialValues,
  ClusterServerHandlers,
  BridgedDeviceBasicInformation,
  BridgedDeviceBasicInformationCluster,
  Identify,
  createDefaultIdentifyClusterServer,
  Groups,
  createDefaultGroupsClusterServer,
  Scenes,
  createDefaultScenesClusterServer,
  OnOff,
  createDefaultOnOffClusterServer,
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
  ClusterClient,
  IdentifyCluster,
  PowerSource,
} from '@project-chip/matter-node.js/cluster';
import { ClusterId, VendorId } from '@project-chip/matter-node.js/datatype';
import { NamedHandler, extendPublicHandlerMethods } from '@project-chip/matter-node.js/util';
import { NotImplementedError } from '@project-chip/matter.js/common';
import { createDefaultColorControlClusterServer } from './ColorControlServer.js';
import { hostname, platform } from 'os';
import { AirQuality, AirQualityCluster } from './AirQualityCluster.js';
import {
  createDefaultPowerSourceRechargableBatteryClusterServer,
  createDefaultPowerSourceReplaceableBatteryClusterServer,
  createDefaultPowerSourceWiredClusterServer,
} from './defaultClusterServer.js';

export class MatterPlatformEntity extends EventEmitter {
  protected log: AnsiLogger;
  protected platform: ZigbeePlatform;
  protected device: BridgeDevice | undefined;
  protected group: BridgeGroup | undefined;
  protected accessoryName: string = '';
  protected isDevice: boolean = false;
  protected isGroup: boolean = false;
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
        if (key === 'occupancy') {
          this.bridgedDevice.getClusterServerById(OccupancySensing.Cluster.id)?.setOccupancyAttribute({ occupied: value as boolean });
        }
        if (key === 'illuminance_lux' || (key === 'illuminance' && !('illuminance_lux' in payload))) {
          this.bridgedDevice
            .getClusterServerById(IlluminanceMeasurement.Cluster.id)
            ?.setMeasuredValueAttribute(Math.round(Math.max(Math.min(10000 * Math.log10(value) + 1, 0xfffe), 0)));
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

export class MatterPlatformGroup extends MatterPlatformEntity {
  constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);

    this.bridgedDevice = new BridgedBaseDevice(platform, group.friendly_name, 'zigbee2MQTT', 'Group', `group-${group.id}`, false, onOffSwitch, undefined, undefined, [
      Identify.Cluster.id,
      Groups.Cluster.id,
      Scenes.Cluster.id,
      OnOff.Cluster.id,
    ]);

    // Attributes handlers
    this.bridgedDevice.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.subscribeReachableAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute Reachable changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(OnOff.Cluster.id)?.subscribeOnOffAttribute((newValue: boolean, oldValue: boolean) => {
      this.log.debug(`Attribute OnOff changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });
    this.bridgedDevice.getClusterServerById(LevelControl.Cluster.id)?.subscribeCurrentLevelAttribute((newValue: number | null, oldValue: number | null) => {
      this.log.debug(`Attribute LevelControl changed for ${this.ien}${group.friendly_name}${rs}${db} oldValue: ${oldValue} newValue: ${newValue}`);
    });

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

export class MatterPlatformDevice extends MatterPlatformEntity {
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

    // Create the device with specific properties
    if (types.includes('light')) {
      if (properties.includes('color')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.COLOR_TEMPERATURE_LIGHT,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id, ColorControl.Cluster.id],
        );
      } else if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.DIMMABLE_LIGHT,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id],
        );
      } else {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.ON_OFF_LIGHT,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id],
        );
      }
    } else if (types.includes('outlet')) {
      if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.DIMMABLE_PLUGIN_UNIT,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id],
        );
      } else {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.ON_OFF_PLUGIN_UNIT,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id],
        );
      }
    } else if (types.includes('switch')) {
      if (properties.includes('color')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          colorTemperatureSwitch,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id, ColorControl.Cluster.id],
        );
      } else if (properties.includes('brightness')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          dimmableSwitch,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id],
        );
      } else {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          onOffSwitch,
          undefined,
          undefined,
          [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id],
        );
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
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          true,
          DeviceTypes.OCCUPANCY_SENSOR,
          undefined,
          undefined,
          [Identify.Cluster.id, OccupancySensing.Cluster.id],
        );
        if (properties.includes('illuminance') || properties.includes('illuminance_lux'))
          this.bridgedDevice.addDeviceType(DeviceTypes.LIGHT_SENSOR, [IlluminanceMeasurement.Cluster.id]);
      } else if (properties.includes('illuminance') || properties.includes('illuminance_lux')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.LIGHT_SENSOR,
          undefined,
          undefined,
          [Identify.Cluster.id, IlluminanceMeasurement.Cluster.id],
        );
      }
      if (properties.includes('air_quality')) {
        console.log('Include air_quality');
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          airQualitySensor,
          undefined,
          undefined,
          [Identify.Cluster.id, AirQuality.Cluster.id],
        );
        this.bridgedDevice.addDeviceType(DeviceTypes.TEMPERATURE_SENSOR, [TemperatureMeasurement.Cluster.id]);
        this.bridgedDevice.addDeviceType(DeviceTypes.HUMIDITY_SENSOR, [RelativeHumidityMeasurement.Cluster.id]);
      } else if (properties.includes('temperature')) {
        console.log('Include temperature');
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.TEMPERATURE_SENSOR,
          undefined,
          undefined,
          [Identify.Cluster.id, TemperatureMeasurement.Cluster.id /*, RelativeHumidityMeasurement.Cluster.id, PressureMeasurement.Cluster.id*/],
        );
        this.bridgedDevice.addDeviceType(DeviceTypes.HUMIDITY_SENSOR, [RelativeHumidityMeasurement.Cluster.id]);
        this.bridgedDevice.addDeviceType(DeviceTypes.PRESSURE_SENSOR, [PressureMeasurement.Cluster.id]);
      }
      if (properties.includes('contact')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.CONTACT_SENSOR,
          { stateValue: false } as AttributeInitialValues<typeof BooleanState.Cluster.attributes>,
          undefined,
          [Identify.Cluster.id, BooleanState.Cluster.id],
        );
      }
      if (properties.includes('water_leak')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.CONTACT_SENSOR,
          { stateValue: false } as AttributeInitialValues<typeof BooleanState.Cluster.attributes>,
          undefined,
          [Identify.Cluster.id, BooleanState.Cluster.id],
        );
      }
      if (properties.includes('smoke')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.CONTACT_SENSOR,
          { stateValue: false } as AttributeInitialValues<typeof BooleanState.Cluster.attributes>,
          undefined,
          [Identify.Cluster.id, BooleanState.Cluster.id],
        );
      }
      if (properties.includes('action')) {
        this.bridgedDevice = new BridgedBaseDevice(
          platform,
          device.friendly_name,
          device.definition.vendor,
          device.definition.model,
          device.ieee_address,
          false,
          DeviceTypes.GENERIC_SWITCH,
          undefined,
          undefined,
          [Identify.Cluster.id, Switch.Cluster.id],
        );
      }
    }
    if (!this.bridgedDevice) return;

    // Attributes handlers
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
        this.log.debug(
          `Command moveToSaturation called for ${this.ien}${device.friendly_name}${rs}${db} request: ${request.saturation} attributes: ${attributes.currentSaturation}`,
        );
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

export class BridgedBaseDevice extends extendPublicHandlerMethods<typeof Device, LightBaseDeviceCommands>(Device) {
  public deviceName: string;
  public hasEndpoints = false;

  constructor(
    platform: ZigbeePlatform,
    deviceName: string,
    vendorName: string,
    productName: string,
    deviceSerial: string,
    composed: boolean,
    definition: DeviceTypeDefinition,
    attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> },
    options: EndpointOptions = {},
    includeServerList: ClusterId[] = [],
    includeClientList?: ClusterId[],
    childList?: ClusterId[],
  ) {
    super(definition, options);

    this.deviceName = deviceName;

    // Add BridgedDeviceBasicInformationCluster
    this.addInfoCluster(deviceName, vendorName, productName, deviceSerial);

    // Add BridgedDeviceBasicInformationCluster
    this.addPowerSourceCluster(PowerSource.Feature.Replaceable, 75, PowerSource.BatChargeLevel.Ok);

    // Add all other server clusters in the includelist
    this.addDeviceServerClusters(attributeInitialValues, includeServerList);

    // Add all other client clusters in the includelist
    this.addDeviceClientClusters(attributeInitialValues, includeClientList);

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
  protected addInfoCluster(deviceName: string, vendorName: string, productName: string, deviceSerial: string) {
    const version = process.env.npm_package_version || '1.0';

    const bridgedBasicInformationCluster = ClusterServer(
      BridgedDeviceBasicInformationCluster,
      {
        vendorName,
        productName,
        productLabel: deviceName.slice(0, 32),
        nodeLabel: deviceName.slice(0, 32),
        serialNumber: (deviceSerial + '_' + version + '_' + hostname).slice(0, 32),
        uniqueId: (deviceSerial + '_' + version + '_' + hostname).slice(0, 32),
        softwareVersion: 1.0,
        softwareVersionString: '1.0', // Home app = Firmware Revision
        hardwareVersion: 1.1,
        hardwareVersionString: '1.1',
        reachable: true,
      },
      {},
      {
        reachableChanged: true,
      },
    );
    this.addClusterServer(bridgedBasicInformationCluster);

    bridgedBasicInformationCluster.subscribeReachableAttribute((newValue) => {
      bridgedBasicInformationCluster.triggerReachableChangedEvent({ reachableNewValue: newValue });
    });
  }

  protected addPowerSourceCluster(powerType: string, batPercentRemaining: number = 100, batChargeLevel: PowerSource.BatChargeLevel = PowerSource.BatChargeLevel.Ok) {
    if (powerType === PowerSource.Feature.Replaceable) this.addClusterServer(createDefaultPowerSourceReplaceableBatteryClusterServer(batPercentRemaining, batChargeLevel));
    else if (powerType === PowerSource.Feature.Rechargeable) this.addClusterServer(createDefaultPowerSourceRechargableBatteryClusterServer(batPercentRemaining, batChargeLevel));
    else this.addClusterServer(createDefaultPowerSourceWiredClusterServer());
  }

  /**
   * Adds mandatory clusters to the device
   *
   * @protected
   * @param attributeInitialValues Optional object with initial attribute values for automatically added clusters
   * @param includeServerList List of clusters to include
   */
  protected addDeviceServerClusters(attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> }, includeServerList: ClusterId[] = []) {
    if (includeServerList.includes(Identify.Cluster.id)) {
      this.addClusterServer(createDefaultIdentifyClusterServer({ identify: async (data) => await this.commandHandler.executeHandler('identify', data) }));
    }
    if (includeServerList.includes(Groups.Cluster.id)) {
      this.addClusterServer(createDefaultGroupsClusterServer());
    }
    if (includeServerList.includes(Scenes.Cluster.id)) {
      this.addClusterServer(createDefaultScenesClusterServer());
    }
    if (includeServerList.includes(OnOff.Cluster.id)) {
      this.addClusterServer(createDefaultOnOffClusterServer(this.commandHandler, getClusterInitialAttributeValues(attributeInitialValues, OnOff.Cluster)));
    }
    if (includeServerList.includes(LevelControl.Cluster.id)) {
      this.addClusterServer(
        createDefaultLevelControlClusterServer(
          this.commandHandler,
          getClusterInitialAttributeValues(attributeInitialValues, LevelControl.Cluster.with(LevelControl.Feature.OnOff)),
        ),
      );
    }
    if (includeServerList.includes(ColorControl.Cluster.id)) {
      const colorCluster = ClusterServer(
        ColorControlCluster.with(ColorControl.Feature.HueSaturation, ColorControl.Feature.ColorTemperature),
        {
          colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
          options: {
            executeIfOff: false,
          },
          numberOfPrimaries: null,
          enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
          colorCapabilities: { xy: false, hs: true, cl: false, ehue: false, ct: true },
          currentHue: 0,
          currentSaturation: 0,
          colorTemperatureMireds: 500,
          colorTempPhysicalMinMireds: 147,
          colorTempPhysicalMaxMireds: 500,
        },
        {
          moveToHue: async ({ request: request, attributes: attributes }) => {
            console.log('Command moveToHue request:', request /*, 'attributes:', attributes*/);
            attributes.currentHue.setLocal(request.hue);
            this.commandHandler.executeHandler('moveToHue', { request: request, attributes: attributes });
          },
          moveHue: async () => {
            throw new NotImplementedError('Not implemented');
          },
          stepHue: async () => {
            throw new NotImplementedError('Not implemented');
          },
          moveToSaturation: async ({ request: request, attributes: attributes }) => {
            console.log('Command moveToSaturation request:', request /*, 'attributes:', attributes*/);
            attributes.currentSaturation.setLocal(request.saturation);
            this.commandHandler.executeHandler('moveToSaturation', { request: request, attributes: attributes });
          },
          moveSaturation: async () => {
            throw new NotImplementedError('Not implemented');
          },
          stepSaturation: async () => {
            throw new NotImplementedError('Not implemented');
          },
          moveToHueAndSaturation: async ({ request: request, attributes: attributes }) => {
            console.log('Command moveToHueAndSaturation request:', request /*, 'attributes:', attributes*/);
            attributes.currentHue.setLocal(request.hue);
            attributes.currentSaturation.setLocal(request.saturation);
            this.commandHandler.executeHandler('moveToHueAndSaturation', { request: request, attributes: attributes });
          },
          stopMoveStep: async () => {
            throw new NotImplementedError('Not implemented');
          },
          moveToColorTemperature: async ({ request: request, attributes: attributes }) => {
            console.log('Command moveToColorTemperature request:', request /*, 'attributes:', attributes*/);
            attributes.colorTemperatureMireds.setLocal(request.colorTemperatureMireds);
            this.commandHandler.executeHandler('moveToColorTemperature', { request: request, attributes: attributes });
          },
          moveColorTemperature: async () => {
            throw new NotImplementedError('Not implemented');
          },
          stepColorTemperature: async () => {
            throw new NotImplementedError('Not implemented');
          },
        },
        {},
      );
      this.addClusterServer(colorCluster);
    }
    if (includeServerList.includes(Switch.Cluster.id)) {
      const switchCluster = ClusterServer(
        SwitchCluster.with(
          Switch.Feature.MomentarySwitch,
          Switch.Feature.MomentarySwitchRelease,
          Switch.Feature.MomentarySwitchLongPress,
          Switch.Feature.MomentarySwitchMultiPress,
        ),
        {
          numberOfPositions: 2,
          currentPosition: 0,
          multiPressMax: 2,
        },
        {},
        {
          initialPress: true,
          longPress: true,
          shortRelease: true,
          longRelease: true,
          multiPressOngoing: true,
          multiPressComplete: true,
        },
      );
      this.addClusterServer(switchCluster);
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id)) {
      const temperatureMeasurementCluster = ClusterServer(
        TemperatureMeasurementCluster,
        {
          measuredValue: 0,
          minMeasuredValue: null,
          maxMeasuredValue: null,
          tolerance: 0,
        },
        {},
        {},
      );
      this.addClusterServer(temperatureMeasurementCluster);
    }
    if (includeServerList.includes(RelativeHumidityMeasurement.Cluster.id)) {
      const humidityMeasurementCluster = ClusterServer(
        RelativeHumidityMeasurementCluster,
        {
          measuredValue: 0,
          minMeasuredValue: null,
          maxMeasuredValue: null,
          tolerance: 0,
        },
        {},
        {},
      );
      this.addClusterServer(humidityMeasurementCluster);
    }
    if (includeServerList.includes(PressureMeasurement.Cluster.id)) {
      const humidityMeasurementCluster = ClusterServer(
        PressureMeasurementCluster,
        {
          measuredValue: 0,
          minMeasuredValue: null,
          maxMeasuredValue: null,
          tolerance: 0,
        },
        {},
        {},
      );
      this.addClusterServer(humidityMeasurementCluster);
    }
    if (includeServerList.includes(BooleanState.Cluster.id)) {
      const booleanStateCluster = ClusterServer(
        BooleanStateCluster,
        (attributeInitialValues as AttributeInitialValues<typeof BooleanState.Cluster.attributes>) ?? {
          stateValue: true, // true=contact false=no_contact
        },
        {},
        {
          stateChange: true,
        },
      );
      this.addClusterServer(booleanStateCluster);
      booleanStateCluster.subscribeStateValueAttribute((newValue: boolean, oldValue: boolean) => {
        console.log(`booleanStateCluster changed from ${oldValue} to ${newValue}`);
      });
    }

    if (includeServerList.includes(OccupancySensing.Cluster.id)) {
      const occupancySensingCluster = ClusterServer(
        OccupancySensingCluster,
        {
          occupancy: { occupied: false },
          occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
          occupancySensorTypeBitmap: { pir: true, ultrasonic: false, physicalContact: false },
        },
        {},
        {},
      );
      this.addClusterServer(occupancySensingCluster);
    }

    if (includeServerList.includes(IlluminanceMeasurement.Cluster.id)) {
      const illuminanceMeasurementCluster = ClusterServer(
        IlluminanceMeasurementCluster,
        {
          measuredValue: 0,
          minMeasuredValue: null,
          maxMeasuredValue: null,
          tolerance: 0,
        },
        {},
        {},
      );
      this.addClusterServer(illuminanceMeasurementCluster);
    }

    if (includeServerList.includes(AirQuality.Cluster.id)) {
      const airQualityCluster = ClusterServer(
        AirQualityCluster.with(AirQuality.Feature.FairAirQuality, AirQuality.Feature.ModerateAirQuality, AirQuality.Feature.VeryPoorAirQuality),
        {
          airQuality: AirQuality.AirQualityType.Good,
        },
        {},
        {},
      );
      this.addClusterServer(airQualityCluster);
    }
    /*
    if (includeServerList.includes(EveHistory.Cluster.id) && this.history) {
      this.addClusterServer(this.history.createDefaultEveHistoryClusterServer());
    }
    */
  }

  /**
   * Adds mandatory client clusters to the device
   *
   * @protected
   * @param attributeInitialValues Optional object with initial attribute values for automatically added clusters
   * @param includeClientList List of clusters to include
   */
  protected addDeviceClientClusters(attributeInitialValues?: { [key: ClusterId]: AttributeInitialValues<any> }, includeClientList: ClusterId[] = []) {
    /*
    const interactionClient: InteractionClient = new InteractionClient();
    if (includeClientList.includes(Identify.Cluster.id)) {
      const identifyCluster = ClusterClient(
        IdentifyCluster,
        this.getId(),
        interactionClient,
      );
      this.addClusterClient(identifyCluster);
    }
    */
  }

  public addDeviceType(deviceType: DeviceTypeDefinition, serverList: ClusterId[]) {
    const deviceTypes = this.getDeviceTypes();
    deviceTypes.push(deviceType);
    this.setDeviceTypes(deviceTypes);
    this.addDeviceServerClusters(undefined, serverList);
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

// Custom device types

const onOffSwitch = DeviceTypeDefinition({
  name: 'MA-onoffswitch',
  code: 0x0103,
  deviceClass: DeviceClasses.Simple,
  revision: 2,
  requiredServerClusters: [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id],
  optionalServerClusters: [LevelControl.Cluster.id],
});
const dimmableSwitch = DeviceTypeDefinition({
  name: 'MA-dimmableswitch',
  code: 0x0104,
  deviceClass: DeviceClasses.Simple,
  revision: 2,
  requiredServerClusters: [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id],
  optionalServerClusters: [],
});
const colorTemperatureSwitch = DeviceTypeDefinition({
  name: 'MA-colortemperatureswitch',
  code: 0x0105,
  deviceClass: DeviceClasses.Simple,
  revision: 2,
  requiredServerClusters: [Identify.Cluster.id, Groups.Cluster.id, Scenes.Cluster.id, OnOff.Cluster.id, LevelControl.Cluster.id, ColorControl.Cluster.id],
  optionalServerClusters: [],
});
const airQualitySensor = DeviceTypeDefinition({
  name: 'MA-airqualitysensor',
  code: 0x002c,
  deviceClass: DeviceClasses.Simple,
  revision: 1,
  requiredServerClusters: [Identify.Cluster.id, AirQuality.Cluster.id],
  optionalServerClusters: [TemperatureMeasurement.Cluster.id, RelativeHumidityMeasurement.Cluster.id],
});

// Internal types not exported !!!

type MakeMandatory<T> = Exclude<T, undefined>;

type LightBaseDeviceCommands = {
  identify: MakeMandatory<ClusterServerHandlers<typeof Identify.Cluster>['identify']>;

  on: MakeMandatory<ClusterServerHandlers<typeof OnOff.Complete>['on']>;
  off: MakeMandatory<ClusterServerHandlers<typeof OnOff.Complete>['off']>;
  toggle: MakeMandatory<ClusterServerHandlers<typeof OnOff.Complete>['toggle']>;
  offWithEffect: MakeMandatory<ClusterServerHandlers<typeof OnOff.Complete>['offWithEffect']>;

  moveToLevel: MakeMandatory<ClusterServerHandlers<typeof LevelControl.Complete>['moveToLevel']>;
  moveToLevelWithOnOff: MakeMandatory<ClusterServerHandlers<typeof LevelControl.Complete>['moveToLevelWithOnOff']>;

  moveToHue: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveToHue']>;
  moveHue: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveHue']>;
  stepHue: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['stepHue']>;
  moveToSaturation: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveToSaturation']>;
  moveSaturation: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveSaturation']>;
  stepSaturation: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['stepSaturation']>;
  moveToHueAndSaturation: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveToHueAndSaturation']>;
  moveToColorTemperature: MakeMandatory<ClusterServerHandlers<typeof ColorControl.Complete>['moveToColorTemperature']>;
};
