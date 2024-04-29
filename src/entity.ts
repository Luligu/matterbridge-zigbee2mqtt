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

import {
  DeviceTypes,
  DeviceTypeDefinition,
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
  FlowMeasurement,
  DoorLockCluster,
} from 'matterbridge';

import { AnsiLogger, TimestampFormat, gn, dn, ign, idn, rs, db, wr, debugStringify, hk, zb, or, nf } from 'node-ansi-logger';
import { ZigbeePlatform } from './platform.js';
import { BridgeDevice, BridgeGroup } from './zigbee2mqttTypes.js';
import { Payload, PayloadValue } from './payloadTypes.js';
import * as color from './colorUtils.js';
import EventEmitter from 'events';
import { hostname } from 'os';
import { deepCopy, deepEqual } from './utils.js';

export class ZigbeeEntity extends EventEmitter {
  public log: AnsiLogger;
  protected platform: ZigbeePlatform;
  public device: BridgeDevice | undefined;
  public group: BridgeGroup | undefined;
  public entityName: string = '';
  public isDevice: boolean = false;
  public isGroup: boolean = false;
  public actions: string[] = [];
  protected en = '';
  protected ien = '';
  public bridgedDevice: BridgedBaseDevice | undefined;
  public eidn = `${or}`;
  private lastPayload: Payload = {};
  private lastSeen: number = 0;
  protected ignoreFeatures: string[] = [];

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
    this.log = new AnsiLogger({ logName: this.entityName, logTimestampFormat: TimestampFormat.TIME_MILLIS, logDebug: platform.debugEnabled });
    this.log.debug(`Created MatterEntity: ${this.entityName}`);

    this.platform.z2m.on('MESSAGE-' + this.entityName, (payload: Payload) => {
      // this.log.debug(`Message for device ${this.ien}${this.accessoryName}${rs}${db} ignoreFeatures: ${debugStringify(this.ignoreFeatures)}`);

      // Check if the message is a duplicate that can be ingored cause only linkquality and last_seen have changed (action is always passed)
      const now = Date.now();
      if (now - this.lastSeen < 1000 * 60 && deepEqual(this.lastPayload, payload, ['linkquality', 'last_seen', ...this.ignoreFeatures]) && !Object.prototype.hasOwnProperty.call(this.lastPayload, 'action')) {
        // this.log.debug(`Skipping linkquality MQTT message for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      this.lastSeen = Date.now();

      // Check and deep copy the payload
      if (deepEqual(this.lastPayload, payload, this.ignoreFeatures)) return;
      this.lastPayload = deepCopy(payload);
      if (Object.prototype.hasOwnProperty.call(this.lastPayload, 'action')) delete this.lastPayload['action'];
      // Remove each key in ignoreFeatures from the payload copy
      for (const key of this.ignoreFeatures) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          // this.log.debug(`Removing key ${nf}${key}${db} from payload`);
          delete payload[key];
        }
      }

      const debugEnabled = this.platform.debugEnabled;
      this.log.setLogDebug(true);
      if (this.bridgedDevice === undefined) {
        this.log.debug(`*Skipping (no device) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      if (this.bridgedDevice.noUpdate) {
        this.log.debug(`*Skipping (no update) ${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for accessory ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);
        return;
      }
      this.log.debug(`${platform.z2mDevicesRegistered ? 'MQTT message' : 'State update'} for device ${this.ien}${this.entityName}${rs}${db} payload: ${debugStringify(payload)}`);

      /* Multi endpoint section */
      if (this.bridgedDevice.hasEndpoints && !this.bridgedDevice.noUpdate) {
        const childs = this.bridgedDevice.getChildEndpoints();
        childs.forEach((child) => {
          // Find the endpoint name (l1...)
          const labelList = child.getClusterServer(FixedLabelCluster)?.getLabelListAttribute();
          if (!labelList) return;
          const endpointName = labelList.find((entry) => entry.label === 'endpointName');
          if (!endpointName) return;
          const endpointType = labelList.find((entry) => entry.label === 'type');
          // this.log.warn(`***Multi endpoint section labelList:${rs}`, labelList);

          Object.entries(payload).forEach(([key, value]) => {
            if (value === undefined || value === null) return; // Skip null and undefined values
            if (this.bridgedDevice === undefined || this.bridgedDevice.noUpdate) return;
            // Modify voltage to battery_voltage
            if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';

            // Handle action on the endpoints
            if (key === 'action') {
              const index = this.actions.indexOf(value as string);
              if (index === -1) {
                this.log.warn(`Action "${value}" not found on actions ${debugStringify(this.actions)}`);
                return;
              }
              const switchNumber = Math.floor(index / 3) + 1;
              const switchAction = index - (switchNumber - 1) * 3;
              const switchMap = ['Single', 'Double', 'Long'];
              if (endpointName.value === 'switch_' + switchNumber) {
                this.log.debug(`Action "${value}" found on switch ${switchNumber} endpoint ${this.eidn}${child.number}${db} action ${switchMap[switchAction]}`);
                this.triggerSwitchEvent(child, switchMap[switchAction]);
              }
            }

            let z2m: ZigbeeToMatter | undefined;
            z2m = z2ms.find((z2m) => z2m.type === endpointType?.value && z2m.property + '_' + endpointName.value === key);
            if (z2m) {
              // this.log.debug(`*Endpoint ${this.eidn}${child.number}${db} type ${zb}${endpointType?.value}${db} found converter for type ${z2m.type} property ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${hk}${getClusterNameById(ClusterId(z2m.cluster))}${db}.${hk}${z2m.attribute}${db}`);
            } else {
              z2m = z2ms.find((z2m) => z2m.property + '_' + endpointName.value === key);
            }
            if (z2m) {
              if (z2m.converter || z2m.valueLookup) {
                // this.log.debug(`*Endpoint ${this.eidn}${child.number}${db} type ${zb}${endpointType?.value}${db} found converter for ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${hk}${getClusterNameById(ClusterId(z2m.cluster))}${db}.${hk}${z2m.attribute}${db}`);
                this.updateAttributeIfChanged(child, endpointName.value, z2m.cluster, z2m.attribute, z2m.converter ? z2m.converter(value) : value, z2m.valueLookup);
                return;
              }
            }
          });
        });
      }

      /* Normal z2m features section */
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return; // Skip null and undefined values
        if (this.bridgedDevice === undefined || this.bridgedDevice.noUpdate) return;
        // Modify voltage to battery_voltage
        if (key === 'voltage' && this.isDevice && this.device?.power_source === 'Battery') key = 'battery_voltage';
        // Modify illuminance and illuminance_lux
        //if (key === 'illuminance') console.log('illuminance', this.device?.definition?.model);
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'ZG-204ZL') {
          key = 'illuminance_lux';
          value = Math.pow(10, typeof value === 'number' ? value / 10000 : 0);
        }
        if (key === 'illuminance' && this.isDevice && this.device?.definition?.model === 'RTCGQ14LM') {
          key = 'illuminance_lux';
        }

        // Find the endpoint type (switch...)
        const labelList = this.bridgedDevice.getClusterServer(FixedLabelCluster)?.getLabelListAttribute();
        //this.log.debug('*getChildStatePayload labelList:', labelList);
        const endpointType = labelList?.find((entry) => entry.label === 'type');

        let z2m: ZigbeeToMatter | undefined;
        z2m = z2ms.find((z2m) => z2m.type === endpointType?.value && z2m.property === key);
        if (z2m) {
          //this.log.debug(
          //`***Endpoint ${this.eidn}${this.bridgedDevice.number}${db} type ${zb}${endpointType?.value}${db} found converter for type ${z2m.type} property ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${hk}${getClusterNameById(ClusterId(z2m.cluster))}${db}.${hk}${z2m.attribute}${db}`,
          //);
        } else {
          z2m = z2ms.find((z2m) => z2m.property === key);
          //if (z2m) this.log.debug(`***Endpoint ${this.eidn}${this.bridgedDevice.number}${db} type ${zb}${endpointType?.value}${db} found converter for ${key} => ${z2m.type}-${z2m.name}-${z2m.property} ${hk}${getClusterNameById(ClusterId(z2m.cluster))}${db}.${hk}${z2m.attribute}${db}`);
        }
        if (z2m) {
          if (z2m.converter || z2m.valueLookup) {
            // if (z2m.converter) this.log.debug(`***converter for ${key} ${value} => ${z2m.converter(value)}`);
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, z2m.cluster, z2m.attribute, z2m.converter ? z2m.converter(value) : value, z2m.valueLookup);
            return;
          }
        }

        /* WindowCovering */
        if (key === 'position') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', typeof value === 'number' ? 10000 - value * 100 : 0);
        }
        if (key === 'moving') {
          const status = value === 'UP' ? WindowCovering.MovementStatus.Opening : value === 'DOWN' ? WindowCovering.MovementStatus.Closing : WindowCovering.MovementStatus.Stopped;
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'operationalStatus', { global: status, lift: status, tilt: status });
          if (value === 'STOP') {
            const position = this.bridgedDevice.getClusterServerById(WindowCovering.Cluster.id)?.getCurrentPositionLiftPercent100thsAttribute();
            this.updateAttributeIfChanged(this.bridgedDevice, undefined, WindowCovering.Cluster.id, 'currentPositionLiftPercent100ths', position);
          }
        }
        /* ColorControl ColorTemperatureMired */
        if (key === 'color_temp' && 'color_mode' in payload && payload['color_mode'] === 'color_temp') {
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorTemperatureMireds', Math.max(147, Math.min(500, typeof value === 'number' ? value : 0)));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds);
        }
        /* ColorControl CurrenHue and CurrenSaturation */
        if (key === 'color' && 'color_mode' in payload && payload['color_mode'] === 'xy') {
          const { x, y } = value as { x: number; y: number };
          const hsl = color.xyToHsl(x, y);
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentHue', Math.round((hsl.h / 360) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'currentSaturation', Math.round((hsl.s / 100) * 254));
          this.updateAttributeIfChanged(this.bridgedDevice, undefined, ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        }
        /* Switch */
        /*
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
            this.log.info(`Trigger 'single' event for ${this.ien}${this.entityName}${rs}`);
          }
          if (value === 'double') {
            position = 2;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerMultiPressCompleteEvent({ previousPosition: 1, totalNumberOfPressesCounted: 2 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
            this.log.info(`Trigger 'double' event for ${this.ien}${this.entityName}${rs}`);
          }
          if (value === 'hold') {
            position = 1;
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerInitialPressEvent({ newPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerLongPressEvent({ newPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.triggerLongReleaseEvent({ previousPosition: 1 });
            this.bridgedDevice.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
            this.log.info(`Trigger 'hold' event for ${this.ien}${this.entityName}${rs}`);
          }
          if (value === 'release') {
            // this.bridgedDevice?.getClusterServerById(BridgedDeviceBasicInformation.Cluster.id)?.triggerReachableChangedEvent({ reachableNewValue: true });
          }
          
        }
        */
      });
      this.log.setLogDebug(debugEnabled);
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

  protected updateAttributeIfChanged(endpoint: Endpoint, endpointName: string | undefined, clusterId: number, attributeName: string, value: PayloadValue, lookup?: string[]): void {
    const cluster = endpoint.getClusterServerById(ClusterId(clusterId));
    if (cluster === undefined) {
      this.log.debug(`Update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} cluster ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db} not found: is z2m converter exposing all features?`);
      return;
    }
    if (!cluster.isAttributeSupportedByName(attributeName)) {
      this.log.debug(`***Update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} error attribute ${hk}${clusterId}${db}-${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} not found`);
      return;
    }
    if (lookup !== undefined) {
      if (typeof value === 'string' && lookup.indexOf(value) !== -1) value = lookup.indexOf(value);
      else {
        this.log.debug(
          `Update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` +
            `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} value ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db} not found in lookup ${debugStringify(lookup)}`,
        );
        return;
      }
    }
    const localValue = cluster.attributes[attributeName].getLocal();
    if (typeof value === 'object' ? deepEqual(value, localValue) : value === localValue) {
      //this.log.debug(
      //`Skip update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` + `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} already ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
      //);
      return;
    }
    this.log.debug(
      `Update endpoint ${this.eidn}${endpoint.number}${db}${endpointName ? ' (' + zb + endpointName + db + ')' : ''} ` +
        `attribute ${hk}${getClusterNameById(ClusterId(clusterId))}${db}-${hk}${attributeName}${db} from ${zb}${typeof localValue === 'object' ? debugStringify(localValue) : localValue}${db} to ${zb}${typeof value === 'object' ? debugStringify(value) : value}${db}`,
    );
    try {
      cluster.attributes[attributeName].setLocal(value);
    } catch (error) {
      this.log.error(`Error setting attribute ${attributeName} to ${value}: ${error}`);
    }
  }

  // this.publishCommand('permit_join: false', 'bridge/request/permit_join', { value: false });
  protected publishCommand(command: string, entityName: string, payload: Payload) {
    this.log.debug(`executeCommand ${command} called for ${this.ien}${entityName}${rs}${db} payload: ${debugStringify(payload)}`);
    if (entityName.startsWith('bridge/request')) {
      this.platform.publish(entityName, '', JSON.stringify(payload));
    } else {
      this.platform.publish(entityName, 'set', JSON.stringify(payload));
    }
  }

  protected triggerSwitchEvent(endpoint: Endpoint, event: string) {
    let position = undefined;
    if (event === 'Single') {
      position = 1;
      const cluster = endpoint.getClusterServer(SwitchCluster.with(Switch.Feature.MomentarySwitch, Switch.Feature.MomentarySwitchRelease, Switch.Feature.MomentarySwitchLongPress, Switch.Feature.MomentarySwitchMultiPress));
      cluster?.setCurrentPositionAttribute(1);
      cluster?.triggerInitialPressEvent({ newPosition: 1 });
      cluster?.setCurrentPositionAttribute(0);
      cluster?.triggerShortReleaseEvent({ previousPosition: 1 });
      cluster?.setCurrentPositionAttribute(0);
      cluster?.triggerMultiPressCompleteEvent({ previousPosition: 1, totalNumberOfPressesCounted: 1 });
      this.log.debug(`Trigger 'Single press' event for ${this.entityName}`);
    }
    if (event === 'Double') {
      position = 2;
      endpoint.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
      endpoint.getClusterServerById(Switch.Cluster.id)?.triggerMultiPressCompleteEvent({ previousPosition: 1, totalNumberOfPressesCounted: 2 });
      endpoint.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
      this.log.debug(`Trigger 'Double press' event for ${this.entityName}`);
    }
    if (event === 'Long') {
      position = 1;
      endpoint.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(position);
      endpoint.getClusterServerById(Switch.Cluster.id)?.triggerInitialPressEvent({ newPosition: 1 });
      endpoint.getClusterServerById(Switch.Cluster.id)?.triggerLongPressEvent({ newPosition: 1 });
      endpoint.getClusterServerById(Switch.Cluster.id)?.triggerLongReleaseEvent({ previousPosition: 1 });
      endpoint.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
      this.log.debug(`Trigger 'Long press' event for ${this.entityName}`);
    }
  }
}

export class ZigbeeGroup extends ZigbeeEntity {
  constructor(platform: ZigbeePlatform, group: BridgeGroup) {
    super(platform, group);

    // TODO Add the group scanning for real groups. This cover only automations
    let useState = false;
    let useBrightness = false;
    let useColor = false;
    let useColorTemperature = false;
    let minColorTemperature = 140;
    let maxColorTemperature = 500;
    if (group.members.length === 0) {
      this.bridgedDevice = new BridgedBaseDevice(this, [onOffSwitch], [...onOffSwitch.requiredServerClusters]);
    } else {
      group.members.forEach((member) => {
        const device = this.platform.z2m.getDevice(member.ieee_address)!;
        useState = useState === true || device.exposes.find((feature) => feature.name === 'state') !== undefined ? true : false;
        useBrightness = useBrightness === true || device.exposes.find((feature) => feature.name === 'brightness') !== undefined ? true : false;
        useColor = useColor === true || device.exposes.find((feature) => feature.property === 'color') !== undefined ? true : false;
        useColorTemperature = useColorTemperature === true || device.exposes.find((feature) => feature.name === 'color_temp') !== undefined ? true : false;
        const feature = device.exposes.find((feature) => feature.name === 'color_temp');
        if (feature) {
          minColorTemperature = Math.min(minColorTemperature, feature.value_min);
          maxColorTemperature = Math.max(maxColorTemperature, feature.value_max);
        }
      });
      this.log.info(`Group: ${gn}${group.friendly_name}${rs} state: ${useState} brightness: ${useBrightness} color: ${useColor} color_temp: ${useColorTemperature}-${minColorTemperature}-${maxColorTemperature}`);
      let deviceType = DeviceTypes.ON_OFF_LIGHT;
      if (useBrightness) deviceType = DeviceTypes.ON_OFF_LIGHT;
      if (useColorTemperature || useColor) deviceType = DeviceTypes.COLOR_TEMPERATURE_LIGHT;
      this.bridgedDevice = new BridgedBaseDevice(this, [deviceType], [...deviceType.requiredServerClusters]);
    }

    // Command handlers
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
  }
}

export interface ZigbeeToMatter {
  type: string;
  name: string;
  property: string;
  deviceType: DeviceTypeDefinition | undefined;
  cluster: number;
  attribute: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  converter?: (value: any) => any;
  valueLookup?: string[];
}

/* eslint-disable */
// prettier-ignore
export const z2ms: ZigbeeToMatter[] = [
  { type: 'switch', name: 'state',          property: 'state',      deviceType: onOffSwitch,                cluster: OnOff.Cluster.id,        attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'switch', name: 'brightness',     property: 'brightness', deviceType: dimmableSwitch,             cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'switch', name: 'color_xy',       property: 'color_xy',   deviceType: colorTemperatureSwitch,     cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'outlet', name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_PLUGIN_UNIT, cluster: OnOff.Cluster.id,    attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'outlet', name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_PLUGIN_UNIT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light',  name: 'state',          property: 'state',      deviceType: DeviceTypes.ON_OFF_LIGHT,   cluster: OnOff.Cluster.id,        attribute: 'onOff', converter: (value) => { return value === 'ON' ? true : false } },
  { type: 'light',  name: 'brightness',     property: 'brightness', deviceType: DeviceTypes.DIMMABLE_LIGHT, cluster: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value) => { return Math.max(0, Math.min(254, value)) } },
  { type: 'light',  name: 'color_xy',       property: 'color_xy',   deviceType: DeviceTypes.COLOR_TEMPERATURE_LIGHT, cluster: ColorControl.Cluster.id, attribute: 'colorMode' },
  { type: 'cover',  name: 'state',          property: 'state',      deviceType: DeviceTypes.WINDOW_COVERING, cluster: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths' },
  { type: 'lock',   name: 'state',          property: 'state',      deviceType: DeviceTypes.DOOR_LOCK,      cluster: DoorLock.Cluster.id,     attribute: 'lockState', converter: (value) => { return value === 'LOCK' ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked } },

  { type: 'climate', name: 'local_temperature', property: 'local_temperature', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'current_heating_setpoint', property: 'current_heating_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'current_cooling_setpoint', property: 'current_cooling_setpoint', deviceType: DeviceTypes.THERMOSTAT, cluster: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value) => { return Math.max(-5000, Math.min(5000, value * 100)) } },
  { type: 'climate', name: 'running_state', property: 'running_state', deviceType: DeviceTypes.THERMOSTAT,  cluster: Thermostat.Cluster.id,   attribute: 'thermostatRunningMode', valueLookup: ['idle', '', '', 'cool', 'heat']},
  { type: 'climate', name: 'system_mode',   property: 'system_mode', deviceType: DeviceTypes.THERMOSTAT,    cluster: Thermostat.Cluster.id,   attribute: 'systemMode', valueLookup: ['off', 'auto', '', 'cool', 'heat']},

  { type: '',       name: 'presence',       property: 'presence',  deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '',       name: 'occupancy',      property: 'occupancy',  deviceType: DeviceTypes.OCCUPANCY_SENSOR, cluster: OccupancySensing.Cluster.id, attribute: 'occupancy', converter: (value) => { return { occupied: value as boolean } } },
  { type: '',       name: 'illuminance',    property: 'illuminance', deviceType: DeviceTypes.LIGHT_SENSOR,  cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue' },
  { type: '',       name: 'illuminance_lux', property: 'illuminance_lux', deviceType: DeviceTypes.LIGHT_SENSOR, cluster: IlluminanceMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) } },
  { type: '',       name: 'contact',        property: 'contact',    deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return value } },
  { type: '',       name: 'water_leak',     property: 'water_leak', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value }  },
  { type: '',       name: 'vibration',      property: 'vibration',  deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value }  },
  { type: '',       name: 'smoke',          property: 'smoke',      deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '',       name: 'carbon_monoxide', property: 'carbon_monoxide', deviceType: DeviceTypes.CONTACT_SENSOR, cluster: BooleanState.Cluster.id, attribute: 'stateValue', converter: (value) => { return !value } },
  { type: '',       name: 'temperature',    property: 'temperature', deviceType: DeviceTypes.TEMPERATURE_SENSOR, cluster: TemperatureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '',       name: 'humidity',       property: 'humidity',   deviceType: DeviceTypes.HUMIDITY_SENSOR, cluster: RelativeHumidityMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.round(value * 100) } },
  { type: '',       name: 'pressure',       property: 'pressure',   deviceType: DeviceTypes.PRESSURE_SENSOR, cluster: PressureMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return value } },
  { type: '',       name: 'air_quality',    property: 'air_quality', deviceType: airQualitySensor,          cluster: AirQuality.Cluster.id,   attribute: 'airQuality', valueLookup: ['unknown', 'excellent', 'good', 'moderate', 'poor', 'unhealthy', 'out_of_range'] },
  { type: '',       name: 'voc',            property: 'voc',        deviceType: airQualitySensor,           cluster: TvocMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value) => { return Math.min(65535, value) } },
  //{ type: '',       name: 'action',         property: 'action',     deviceType: DeviceTypes.GENERIC_SWITCH, cluster: Switch.Cluster.id,       attribute: 'currentPosition' },
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
    if (device.friendly_name === 'Coordinator' || (device.model_id === 'ti.router' && device.manufacturer === 'TexasInstruments') || (device.model_id.startsWith('SLZB-') && device.manufacturer === 'SMLIGHT')) {
      this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.DOOR_LOCK], [Identify.Cluster.id, DoorLock.Cluster.id]);
      this.bridgedDevice.addFixedLabel('type', 'lock');
      this.bridgedDevice.isRouter = true;
    }

    const debugEnabled = this.platform.debugEnabled;
    // this.log.setLogDebug(true);

    // Get types and properties
    const types: string[] = [];
    const endpoints: string[] = [];
    const names: string[] = [];
    const properties: string[] = [];
    device.definition?.exposes.forEach((expose) => {
      if (expose.features) {
        //Specific features with type
        expose.features?.forEach((feature) => {
          if (expose.type === 'lock' && feature.name === 'state' && feature.property === 'child_lock') feature.name = 'child_lock';
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
        if (expose.name === 'action' && expose.values) {
          this.actions.push(...expose.values);
        }
      }
    });
    device.definition?.options.forEach((option) => {
      // this.log.debug(option);
      if (option.name) names.push(option.name);
      properties.push(option.property);
      types.push('');
      if (option.endpoint) endpoints.push(option.endpoint);
      else endpoints.push('');
    });
    if (platform.switchList.includes(device.friendly_name)) {
      // this.log.debug(`Changed ${device.friendly_name} to switch`);
      types.forEach((type, index) => {
        types[index] = type === 'light' ? 'switch' : type;
      });
    }
    if (platform.lightList.includes(device.friendly_name)) {
      // this.log.debug(`Changed ${device.friendly_name} to light`);
      types.forEach((type, index) => {
        types[index] = type === 'switch' ? 'light' : type;
      });
    }
    if (platform.outletList.includes(device.friendly_name)) {
      // this.log.debug(`Changed ${device.friendly_name} to outlet`);
      types.forEach((type, index) => {
        types[index] = type === 'switch' || type === 'light' ? 'outlet' : type;
      });
    }

    if (platform.featureBlackList) this.ignoreFeatures = [...this.ignoreFeatures, ...platform.featureBlackList];
    if (platform.deviceFeatureBlackList[device.friendly_name]) this.ignoreFeatures = [...this.ignoreFeatures, ...platform.deviceFeatureBlackList[device.friendly_name]];

    // this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - types[${types.length}]: ${debugStringify(types)}`);
    // this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - endpoints[${endpoints.length}]: ${debugStringify(endpoints)}`);
    // this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - names[${names.length}]: ${debugStringify(names)}`);
    // this.log.debug(`*Device ${this.ien}${device.friendly_name}${rs}${db} - properties[${properties.length}]: ${debugStringify(properties)}`);
    names.forEach((name, index) => {
      if (platform.featureBlackList.includes(name)) {
        this.log.debug(`Device ${this.en}${device.friendly_name}${db} feature ${name} is globally blacklisted`);
        return;
      }
      if (platform.deviceFeatureBlackList[device.friendly_name]?.includes(name)) {
        this.log.debug(`Device ${this.en}${device.friendly_name}${db} feature ${name} is blacklisted`);
        return;
      }
      const type = types[index];
      const endpoint = endpoints[index];
      const z2m = z2ms.find((z2m) => z2m.type === type && z2m.name === name);
      if (z2m) {
        this.log.debug(`Device ${this.ien}${device.friendly_name}${rs}${db} endpoint: ${zb}${endpoint}${db} type: ${zb}${type}${db} property: ${zb}${name}${db} => deviceType: ${z2m.deviceType?.name} cluster: ${z2m.cluster} attribute: ${z2m.attribute}`);
        if (endpoint === '') {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [z2m.deviceType ?? DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO], z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          else this.bridgedDevice.addDeviceTypeAndClusterServer(z2m.deviceType, z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          if (type !== '') this.bridgedDevice.addFixedLabel('type', type);
        } else {
          if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO]);
          const childEndpoint = this.bridgedDevice.addChildDeviceTypeAndClusterServer(endpoint, z2m.deviceType, z2m.deviceType ? [...z2m.deviceType.requiredServerClusters, ClusterId(z2m.cluster)] : [ClusterId(z2m.cluster)]);
          if (type !== '') childEndpoint.addFixedLabel('type', type);
          this.bridgedDevice.addFixedLabel('composed', type);
        }
      }
      if (name === 'action' && this.actions.length) {
        this.log.info(`Device ${this.ien}${device.friendly_name}${rs}${nf} has actions mapped to these switches on sub endpoints:`);
        this.log.info('   controller events      <=> zigbee2mqtt actions');
        if (!this.bridgedDevice) this.bridgedDevice = new BridgedBaseDevice(this, [DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO], []);
        // Mapping actions
        const switchMap = ['Single Press', 'Double Press', 'Long Press  '];
        let count = 1;
        if (this.actions.length <= 3) {
          const actionsMap: string[] = [];
          for (let a = 0; a < this.actions.length; a++) {
            actionsMap.push(this.actions[a]);
            this.log.info(`-- Button ${count}: ${hk}${switchMap[a]}${nf} <=> ${zb}${actionsMap[a]}${nf}`);
          }
          this.bridgedDevice.addChildDeviceTypeAndClusterServer('switch_' + count, DeviceTypes.GENERIC_SWITCH, [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters]);
        } else {
          for (let i = 0; i < this.actions.length; i += 3) {
            const actionsMap: string[] = [];
            for (let a = i; a < i + 3 && a < this.actions.length; a++) {
              actionsMap.push(this.actions[a]);
              this.log.info(`-- Button ${count}: ${hk}${switchMap[a - i]}${nf} <=> ${zb}${actionsMap[a - i]}${nf}`);
            }
            this.bridgedDevice.addChildDeviceTypeAndClusterServer('switch_' + count, DeviceTypes.GENERIC_SWITCH, [...DeviceTypes.GENERIC_SWITCH.requiredServerClusters]);
            count++;
          }
        }
        this.bridgedDevice.addFixedLabel('composed', 'button');
      }
    });
    this.log.setLogDebug(debugEnabled);

    /* Verify that all required server clusters are present */
    // TODO: check also endpoints
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
        this.log.debug(`Command moveToColorTemperature called for ${this.ien}${device.friendly_name}${rs}${db} colorMode`, attributes.colorMode.getLocal());
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
        //attributes.currentPositionLiftPercent100ths?.setLocal(liftPercent100thsValue);
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
        if (request.mode === Thermostat.SetpointAdjustMode.Heat && attributes.occupiedHeatingSetpoint) {
          const setpoint = Math.round(attributes.occupiedHeatingSetpoint.getLocal() / 100 + request.amount / 10);
          this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: setpoint });
          this.log.debug('Command setpointRaiseLower sent:', debugStringify({ current_heating_setpoint: setpoint }));
        }
        if (request.mode === Thermostat.SetpointAdjustMode.Cool && attributes.occupiedCoolingSetpoint) {
          const setpoint = Math.round(attributes.occupiedCoolingSetpoint.getLocal() / 100 + request.amount / 10);
          this.publishCommand('OccupiedCoolingSetpoint', device.friendly_name, { current_cooling_setpoint: setpoint });
          this.log.debug('Command setpointRaiseLower sent:', debugStringify({ current_cooling_setpoint: setpoint }));
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
          this.publishCommand('OccupiedHeatingSetpoint', device.friendly_name, { current_heating_setpoint: Math.round(value / 100) });
          if (this.bridgedDevice) this.bridgedDevice.noUpdate = true;
          setTimeout(() => {
            if (this.bridgedDevice) this.bridgedDevice.noUpdate = false;
          }, 10 * 1000);
        });
        thermostat.subscribeOccupiedCoolingSetpointAttribute(async (value) => {
          this.log.debug(`Subscribe occupiedCoolingSetpoint called for ${this.ien}${device.friendly_name}${rs}${db} with:`, value);
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
  //public log: AnsiLogger;
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

    // Log all server clusters in the includelist
    includeServerList.forEach((clusterId) => {
      this.log.debug(`- with cluster: ${hk}${clusterId}${db}-${hk}${getClusterNameById(clusterId)}${db}`);
    });
    // Add all server clusters in the includelist
    this.addDeviceClusterServer(includeServerList);

    // Add BridgedDevice with PowerSourceInformation device type
    this.addDeviceType(DeviceTypes.BRIDGED_DEVICE_WITH_POWERSOURCE_INFO);

    // Add BridgedDeviceBasicInformation cluster
    if (entity.isDevice && entity.device && entity.device.friendly_name === 'Coordinator') {
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, 'zigbee2MQTT', 'Coordinator', entity.device.ieee_address);
    } else if (entity.isDevice && entity.device) {
      this.addBridgedDeviceBasicInformationCluster(entity.device.friendly_name, entity.device.definition ? entity.device.definition.vendor : entity.device.manufacturer, entity.device.definition ? entity.device.definition.model : entity.device.model_id, entity.device.ieee_address);
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
    if (includeServerList.includes(Identify.Cluster.id) && !this.hasClusterServer(Identify.Complete)) {
      this.createDefaultIdentifyClusterServer();
    }
    if (includeServerList.includes(Groups.Cluster.id) && !this.hasClusterServer(Groups.Complete)) {
      this.createDefaultGroupsClusterServer();
    }
    if (includeServerList.includes(Scenes.Cluster.id) && !this.hasClusterServer(Scenes.Complete)) {
      this.createDefaultScenesClusterServer();
    }
    if (includeServerList.includes(OnOff.Cluster.id) && !this.hasClusterServer(OnOff.Complete)) {
      this.createDefaultOnOffClusterServer();
    }
    if (includeServerList.includes(LevelControl.Cluster.id) && !this.hasClusterServer(LevelControl.Complete)) {
      this.createDefaultLevelControlClusterServer();
    }
    if (includeServerList.includes(ColorControl.Cluster.id) && !this.hasClusterServer(ColorControl.Complete)) {
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
    if (includeServerList.includes(ElectricalMeasurement.Cluster.id) && !this.hasClusterServer(ElectricalMeasurement.Complete)) {
      this.createDefaultElectricalMeasurementClusterServer();
    }
    if (includeServerList.includes(EveHistory.Cluster.id) && !this.hasClusterServer(EveHistory.Complete)) {
      this.addClusterServer(this.getDefaultStaticEveHistoryClusterServer());
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id) && !this.hasClusterServer(TemperatureMeasurement.Complete)) {
      this.createDefaultTemperatureMeasurementClusterServer();
    }
    if (includeServerList.includes(RelativeHumidityMeasurement.Cluster.id) && !this.hasClusterServer(RelativeHumidityMeasurement.Complete)) {
      this.createDefaultRelativeHumidityMeasurementClusterServer();
    }
    if (includeServerList.includes(PressureMeasurement.Cluster.id) && !this.hasClusterServer(PressureMeasurement.Complete)) {
      this.createDefaultPressureMeasurementClusterServer();
    }
    if (includeServerList.includes(FlowMeasurement.Cluster.id) && !this.hasClusterServer(FlowMeasurement.Complete)) {
      this.createDefaultFlowMeasurementClusterServer();
    }
    if (includeServerList.includes(BooleanState.Cluster.id) && !this.hasClusterServer(BooleanState.Complete)) {
      this.createDefaultBooleanStateClusterServer(true);
    }
    if (includeServerList.includes(OccupancySensing.Cluster.id) && !this.hasClusterServer(OccupancySensing.Complete)) {
      this.createDefaultOccupancySensingClusterServer(false);
    }
    if (includeServerList.includes(IlluminanceMeasurement.Cluster.id) && !this.hasClusterServer(IlluminanceMeasurement.Complete)) {
      this.createDefaultIlluminanceMeasurementClusterServer();
    }
    if (includeServerList.includes(AirQuality.Cluster.id) && !this.hasClusterServer(AirQuality.Complete)) {
      this.createDefaultAirQualityClusterServer();
    }
    if (includeServerList.includes(TvocMeasurement.Cluster.id) && !this.hasClusterServer(TvocMeasurement.Complete)) {
      this.createDefaultTvocMeasurementClusterServer();
    }
    if (includeServerList.includes(DoorLock.Cluster.id) && !this.hasClusterServer(DoorLock.Complete)) {
      this.createDefaultDoorLockClusterServer();
    }
    if (includeServerList.includes(Thermostat.Cluster.id) && !this.hasClusterServer(Thermostat.Complete)) {
      this.createDefaultThermostatClusterServer();
    }
    if (includeServerList.includes(TimeSync.Cluster.id) && !this.hasClusterServer(TimeSync.Complete)) {
      this.createDefaultTimeSyncClusterServer();
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
    this.log.debug(`addDeviceTypeAndClusterServer ${deviceType ? 'deviceType: ' + hk + deviceType.name + db : ''}`);
    if (deviceType) this.addDeviceType(deviceType);
    // Log all server clusters in the serverList
    serverList.forEach((clusterId) => {
      this.log.debug(`- with cluster: ${hk}${clusterId}${db}-${hk}${getClusterNameById(clusterId)}${db}`);
    });
    this.addDeviceClusterServer(serverList);
  }

  public addChildDeviceTypeAndClusterServer(endpointName: string, deviceType: DeviceTypeDefinition | undefined, includeServerList: ClusterId[]) {
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
    /* Not found? Create a new one */
    if (!child) {
      this.log.debug(`addChildDeviceTypeAndClusterServer: Child endpoint created: ${zb}${endpointName}${db}`);
      child = new Endpoint([deviceType ?? DeviceTypes.ON_OFF_PLUGIN_UNIT]);
      if (!deviceType) includeServerList.push(Identify.Cluster.id);
      if (!deviceType) includeServerList.push(Scenes.Cluster.id);
      if (!deviceType) includeServerList.push(Groups.Cluster.id);
      if (!deviceType) includeServerList.push(OnOff.Cluster.id);
      child.addFixedLabel('endpointName', endpointName);
      /*
      child.addFixedLabel('label', endpointName);
      child.addUserLabel('label', endpointName);
      child.addFixedLabel('name', endpointName);
      child.addUserLabel('name', endpointName);
      */
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
    if (includeServerList.includes(Switch.Cluster.id)) {
      child.addClusterServer(this.getDefaultSwitchClusterServer());
    }
    if (includeServerList.includes(TemperatureMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultTemperatureMeasurementClusterServer());
    }
    if (includeServerList.includes(RelativeHumidityMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultRelativeHumidityMeasurementClusterServer());
    }
    if (includeServerList.includes(PressureMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultPressureMeasurementClusterServer());
    }
    if (includeServerList.includes(FlowMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultFlowMeasurementClusterServer());
    }
    if (includeServerList.includes(BooleanState.Cluster.id)) {
      child.addClusterServer(this.getDefaultBooleanStateClusterServer());
    }
    if (includeServerList.includes(OccupancySensing.Cluster.id)) {
      child.addClusterServer(this.getDefaultOccupancySensingClusterServer());
    }
    if (includeServerList.includes(IlluminanceMeasurement.Cluster.id)) {
      child.addClusterServer(this.getDefaultIlluminanceMeasurementClusterServer());
    }
    if (includeServerList.includes(EveHistory.Cluster.id) && !this.hasClusterServer(EveHistory.Complete)) {
      child.addClusterServer(this.getDefaultStaticEveHistoryClusterServer());
    }
    if (includeServerList.includes(ElectricalMeasurement.Cluster.id) && !this.hasClusterServer(ElectricalMeasurement.Complete)) {
      child.addClusterServer(this.getDefaultElectricalMeasurementClusterServer());
    }
    return child;
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
      this.log.debug(`Configuring ${this.deviceName} WindowCovering`);
      this.setWindowCoveringTargetAsCurrentAndStopped();
    }
    if (this.getClusterServerById(DoorLock.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName} DoorLock`);
      const state = this.getClusterServerById(DoorLock.Cluster.id)?.getLockStateAttribute();
      if (state === DoorLock.LockState.Locked) this.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Lock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
      if (state === DoorLock.LockState.Unlocked) this.getClusterServer(DoorLockCluster)?.triggerLockOperationEvent({ lockOperationType: DoorLock.LockOperationType.Unlock, operationSource: DoorLock.OperationSource.Manual, userIndex: null, fabricIndex: null, sourceNode: null });
    }
    /*
    if (this.getClusterServerById(DoorLock.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName}`);
      this.getClusterServerById(DoorLock.Cluster.id)?.setLockStateAttribute(DoorLock.LockState.Locked);
    }
    if (this.getClusterServerById(Switch.Cluster.id)) {
      this.log.debug(`Configuring ${this.deviceName}`);
      this.getClusterServerById(Switch.Cluster.id)?.setCurrentPositionAttribute(0);
    }
    */
  }
}
