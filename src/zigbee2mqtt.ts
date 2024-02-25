/**
 * This file contains the class Zigbee2MQTT and all the interfaces to communicate with zigbee2MQTT.
 *
 * @file zigbee2mqtt.ts
 * @author Luca Liguori
 * @date 2023-06-30
 * @version 2.2.7
 *
 * All rights reserved.
 *
 */

/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'fs';
import path from 'path';
import * as util from 'util';
import * as crypto from 'crypto';
import {
  connect, MqttClient, IClientOptions, connectAsync, MqttClientEventCallbacks, OnErrorCallback, ErrorWithReasonCode,
  IConnackPacket, IDisconnectPacket, IPublishPacket, Packet,
} from 'mqtt';
import { EventEmitter } from 'events';
import { Logger, AnsiLogger, TimestampFormat, rs, db, dn, gn, wr, er, zb, hk, pl, nf, id, idn, ign, REVERSE, REVERSEOFF } from 'node-ansi-logger';
import { BridgeExtension, KeyValue, Topology } from './zigbee2mqttTypes.js';
import { mkdir } from 'fs/promises';

const writeFile = util.promisify(fs.writeFile);

interface Group {
  friendly_name: string;
  id: number;
  members: Member[];
  scenes: Scene[];
}

interface Member {
  endpoint: number;
  ieee_address: string;
}

interface Scene {
  id: number;
  name: string;
}

interface Preset {
  description: string;
  name: string;
  value: number;
}

interface Features {
  category: string;
  access: number;
  description: string;
  name: string;
  property: string;
  label: string;
  type: string;
  endpoint: string;
  value_off: string;
  value_on: string;
  value_toggle: string;
  unit: string;
  value_max: number;
  value_min: number;
  value_step: number;
  values: string[];
  presets: Preset[];
}

interface Exposes {
  category: string;
  type: string;
  endpoint: string;
  name: string;
  property: string;
  label: string;
  description: string;
  access: number;
  value_off: string;
  value_on: string;
  value_toggle: string;
  unit: string;
  value_max: number;
  value_min: number;
  value_step: number;
  values: string[];
  presets: Preset[];
  features: Features[];
}

interface Definition {
  model: string;
  vendor: string;
  description: string;
  exposes: Exposes[];
  options: Exposes[];
  supports_ota: boolean;
}

interface Target {
  endpoint: number;
  ieee_address: string;
  type: string;
}

interface Binding {
  cluster: string;
  target: Target;
}

interface Reporting {
  attribute: string;
  cluster: string;
  maximum_report_interval: number;
  minimum_report_interval: number;
  reportable_change: number;
}

interface Scenes {
  id: number;
  name: string;
}

interface Endpoint {
  bindings: Binding[];
  clusters: {
    input: string[];
    output: string[];
  };
  configured_reportings: Reporting[];
  scenes: Scenes[];
}

interface z2mEndpoints {
  endpoint?: string;
  bindings: Binding[];
  clusters: {
    input: string[];
    output: string[];
  };
  configured_reportings: Reporting[];
  scenes: Scenes[];
}

interface Device {
  date_code: string;
  definition: Definition;
  disabled: boolean;
  endpoints: {
    [key: number]: Endpoint;
  };
  friendly_name: string;
  ieee_address: string;
  interview_completed: boolean;
  interviewing: boolean;
  manufacturer: string;
  model_id: string;
  network_address: number;
  power_source: string;
  software_build_id: string;
  supported: boolean;
  type: string;
}

export interface z2mFeature {
  category: string;
  access: number;
  description: string;
  name: string;
  property: string;
  label: string;
  type: string;
  endpoint: string;
  value_off: string; // TODO boolean or string
  value_on: string; // TODO boolean or string
  value_toggle: string;
  unit: string;
  value_max: number;
  value_min: number;
  value_step: number;
  values: string[];
  presets: Preset[];
}

export interface z2mDevice {
  index: number;
  logName: string;
  ieee_address: string;
  friendly_name: string;
  getPayload: KeyValue | undefined;
  description: string;
  manufacturer: string;
  model_id: string;
  vendor: string;
  model: string;
  date_code: string;
  software_build_id: string;
  power_source: string;
  isAvailabilityEnabled: boolean;
  isOnline: boolean;
  category: string; // light or switch
  hasEndpoints: boolean;
  exposes: z2mFeature[]; // Exposes specific and generic
  options: z2mFeature[]; // Exposes options like state_action
  endpoints: z2mEndpoints[];
}

export interface z2mGroup {
  index: number;
  logName: string;
  id: number;
  friendly_name: string;
  getPayload: KeyValue | undefined;
  isAvailabilityEnabled: boolean;
  isOnline: boolean;
  members: Member[];
  scenes: Scene[];
}

interface PublishQueue {
  topic: string;
  message: string;
}

export class Zigbee2MQTT extends EventEmitter {
  // Logger
  private log: AnsiLogger;

  // Instance properties
  public mqttHost: string;
  public mqttPort: number;
  public mqttTopic: string;
  private mqttClient: MqttClient | undefined;
  private mqttIsConnected = false;
  private mqttIsReconnecting = false;
  private mqttIsEnding = false;
  private mqttDataPath = '';
  private mqttPublishQueue: PublishQueue[] = [];
  private mqttPublishQueueTimeout: NodeJS.Timeout | undefined = undefined;
  private mqttPublishInflights: number = 0;

  private z2mIsAvailabilityEnabled: boolean;
  private z2mIsOnline: boolean;
  private z2mPermitJoin: boolean;
  private z2mPermitJoinTimeout: number;
  private z2mVersion: string;
  public z2mDevices: z2mDevice[];
  public z2mGroups: z2mGroup[];

  // Define our MQTT options
  private options: IClientOptions = {
    clientId: 'classZigbee2MQTT_' + crypto.randomBytes(8).toString('hex'),
    keepalive: 60,
    protocolId: 'MQTT',
    protocolVersion: 5,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    username: '',
    password: '',
    clean: true,
  };

  // Constructor
  constructor(mqttHost: string, mqttPort: number, mqttTopic: string, hb_log?: Logger) {
    super();

    this.mqttHost = mqttHost;
    this.mqttPort = mqttPort;
    this.mqttTopic = mqttTopic;

    this.z2mIsAvailabilityEnabled = false;
    this.z2mIsOnline = false;
    this.z2mPermitJoin = false;
    this.z2mPermitJoinTimeout = 0;
    this.z2mVersion = '';
    this.z2mDevices = [];
    this.z2mGroups = [];

    this.log = new AnsiLogger({ logName: 'Zigbee2MQTT', logTimestampFormat: TimestampFormat.TIME_MILLIS });
    this.log.debug(`Created new instance with ${mqttHost} ${mqttPort} ${mqttTopic}`);
  }

  public async setDataPath(dataPath: string): Promise<void> {
    try {
      await mkdir(dataPath, { recursive: true });
      this.mqttDataPath = dataPath;
      this.log.debug(`Data directory ${this.mqttDataPath} created successfully.`);
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'EEXIST') {
        this.log.debug('Data directory already exists');
      } else {
        this.log.error('Error creating data directory:', error);
      }
    }
  }

  // Get the URL for connect
  private getUrl(): string {
    return 'mqtt://' + this.mqttHost + ':' + this.mqttPort.toString();
  }

  public async start() {
    this.log.debug('Starting...');

    connectAsync(this.getUrl(), this.options)
      .then(client => {
        this.log.debug('Connection established');
        this.mqttClient = client;

        this.mqttClient.on('connect', (packet: IConnackPacket) => {
          this.log.debug(`Event connect to ${this.getUrl()}${rs}`/*, connack*/);
          this.mqttIsConnected = true;
          this.mqttIsReconnecting = false;
          this.mqttIsEnding = false;
          this.emit('mqtt_connect'); // Never emitted at the start cause we connect async
        });

        this.mqttClient.on('reconnect', () => {
          this.log.debug(`Event reconnect to ${this.getUrl()}${rs}`);
          this.mqttIsReconnecting = true;
          this.emit('mqtt_reconnect');
        });

        this.mqttClient.on('disconnect', (packet: IDisconnectPacket) => {
          this.log.debug('Event diconnect', this.getUrl(), packet);
          this.emit('mqtt_disconnect');
        });

        this.mqttClient.on('close', () => {
          this.log.debug('Event close');
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.emit('mqtt_close');
        });

        this.mqttClient.on('end', () => {
          this.log.debug('Event end');
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.emit('mqtt_end');
        });

        this.mqttClient.on('offline', () => {
          this.log.error('Event offline');
          this.emit('mqtt_offline');
        });

        this.mqttClient.on('error', (error: Error | ErrorWithReasonCode) => {
          this.log.error('Event error', error);
          this.emit('mqtt_error', error);
        });

        this.mqttClient.on('packetsend', (packet: Packet) => {
          //this.log.debug('classZigbee2MQTT=>Event packetsend');
        });

        this.mqttClient.on('packetreceive', (packet: Packet) => {
          //this.log.debug('classZigbee2MQTT=>Event packetreceive');
        });

        this.mqttClient.on('message', (topic: string, payload: Buffer, packet: IPublishPacket) => {
          //this.log.debug(`classZigbee2MQTT=>Event message topic: ${topic} payload: ${payload.toString()} packet: ${stringify(packet, true)}`);
          this.messageHandler(topic, payload);
        });

        this.log.debug('Started');

        this.mqttIsConnected = true;
        this.mqttIsReconnecting = false;
        this.mqttIsEnding = false;
        this.emit('mqtt_connect');
      })
      .catch(error => {
        this.log.error(`Error connecting to ${this.getUrl()}: ${error.message}`);
      });
  }

  public async stop() {
    if (!this.mqttClient || this.mqttIsEnding) {
      this.log.debug('Already stopped!');
    } else {
      this.mqttIsEnding = true;
      this.log.debug('Ending connection...');
      this.mqttClient.endAsync(false)
        .then(() => {
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.mqttIsEnding = false;
          this.mqttClient = undefined;
          this.log.debug('Connection closed');
        })
        .catch(error => {
          this.log.error(`Error closing connection: ${error.message}`);
        });
    }
  }

  public async subscribe(topic: string) {
    if (this.mqttClient && this.mqttIsConnected) {
      this.log.debug(`Subscribing topic: ${topic}`);
      // Use subscribeAsync for promise-based handling
      this.mqttClient.subscribeAsync(topic, { qos: 2 })
        .then(() => {
          this.log.debug(`Subscribe success on topic: ${topic}`);
          this.emit('mqtt_subscribed');
        })
        .catch(error => {
          this.log.error(`Subscribe error: ${error} on topic: ${topic}`);
        });
    } else {
      this.log.error('Unable to subscribe, client not connected or unavailable');
    }
  }

  public async publish(topic: string, message: string, queue: boolean = false) {

    const startInterval = () => {
      if (this.mqttPublishQueueTimeout) {
        return;
      }
      this.log.debug(`**Start publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} interval`);
      this.mqttPublishQueueTimeout = setInterval(async () => {
        if (this.mqttClient && this.mqttPublishQueue.length > 0) {
          this.log.debug(`**Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} topic: ${this.mqttPublishQueue[0].topic} message: ${this.mqttPublishQueue[0].message}${rs}`);
          //this.publish(this.mqttPublishQueue[0].topic, this.mqttPublishQueue[0].message);

          try {
            this.mqttPublishInflights++;
            await this.mqttClient.publishAsync(this.mqttPublishQueue[0].topic, this.mqttPublishQueue[0].message, { qos: 2 });
            this.log.debug(`***Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} success on topic: ${topic} message: ${message} inflights: ${this.mqttPublishInflights}`);
            this.emit('mqtt_published');
            this.mqttPublishInflights--;
          } catch (error) {
            this.mqttPublishInflights--;
            this.log.error(`****Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} error: ${error} on topic: ${topic} message: ${message} inflights: ${this.mqttPublishInflights}`);
          }

          this.mqttPublishQueue.splice(0, 1);
        } else {
          stopInterval();
        }
      }, 50);
    };

    const stopInterval = () => {
      if (this.mqttPublishQueueTimeout) {
        this.log.debug(`**Stop publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} interval`);
        clearInterval(this.mqttPublishQueueTimeout);
        this.mqttPublishQueueTimeout = undefined;
      }
    };

    if (this.mqttClient && this.mqttIsConnected) {

      if (queue) {
        startInterval();
        this.mqttPublishQueue.push({ topic: topic, message: message });
        this.log.debug(`**Add to publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} topic: ${topic} message: ${message}${rs}`);
        return;
      }

      this.log.debug(`**Publishing ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} topic: ${topic} message: ${message}`);
      try {
        this.mqttPublishInflights++;
        await this.mqttClient.publishAsync(topic, message, { qos: 2 });
        this.log.debug(`***Publish ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} success on topic: ${topic} message: ${message}`);
        this.emit('mqtt_published');
        this.mqttPublishInflights--;
      } catch (error) {
        this.mqttPublishInflights--;
        this.log.error(`****Publish ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} error: ${error} on topic: ${topic} message: ${message}`);
      }
    } else {
      this.log.error('Unable to publish, client not connected or unavailable.');
    }
  }

  private async writeBufferJSON(file: string, buffer: Buffer) {
    const filePath = path.join(this.mqttDataPath, file);
    let jsonData;

    // Parse the buffer to JSON
    try {
      jsonData = JSON.parse(buffer.toString());
    } catch (error) {
      this.log.error('writeBufferJSON: parsing error:', error);
      return; // Stop execution if parsing fails
    }

    // Write the JSON data to a file
    writeFile(`${filePath}.json`, JSON.stringify(jsonData, null, 2))
      .then(() => {
        this.log.debug(`Successfully wrote to ${filePath}.json`);
      })
      .catch(error => {
        this.log.error(`Error writing to ${filePath}.json:`, error);
      });
  }

  private async writeFile(file: string, data: string) {
    const filePath = path.join(this.mqttDataPath, file);

    // Write the data to a file
    writeFile(`${filePath}`, data)
      .then(() => {
        this.log.debug(`Successfully wrote to ${filePath}`);
      })
      .catch(error => {
        this.log.error(`Error writing to ${filePath}:`, error);
      });
  }

  private messageHandler(topic: string, payload: Buffer) {
    if (topic.startsWith(this.mqttTopic + '/bridge/state')) {
      const data = JSON.parse(payload.toString());
      //this.log.debug('classZigbee2MQTT=>Message bridge/state', data);
      if (data.state === 'online') {
        this.z2mIsOnline = true;
        this.emit('online');
      } else if (data.state === 'offline') {
        this.z2mIsOnline = false;
        this.emit('offline');
      }
      this.log.debug(`Message bridge/state online => ${this.z2mIsOnline}`);

    } else if (topic.startsWith(this.mqttTopic + '/bridge/info')) {
      const data = JSON.parse(payload.toString());
      //this.log.debug('classZigbee2MQTT=>Message bridge/info', data);
      this.z2mPermitJoin = data.permit_join ? data.permit_join : false;
      this.z2mPermitJoinTimeout = data.permit_join_timeout ? data.permit_join_timeout : 0;
      this.z2mVersion = data.version ? data.version : '';
      this.z2mIsAvailabilityEnabled = data.config.availability ? true : false;
      this.log.debug(`Message bridge/info availability => ${this.z2mIsAvailabilityEnabled}`);
      this.log.debug(`Message bridge/info version => ${this.z2mVersion}`);
      this.log.debug(`Message bridge/info permit_join => ${this.z2mPermitJoin} timeout => ${this.z2mPermitJoinTimeout}`);
      this.emit('info', this.z2mVersion, this.z2mIsAvailabilityEnabled, this.z2mPermitJoin, this.z2mPermitJoinTimeout);
      this.writeBufferJSON('bridge-info', payload);
      this.emit('bridge-info', data);

    } else if (topic.startsWith(this.mqttTopic + '/bridge/devices')) {
      this.z2mDevices.splice(0, this.z2mDevices.length);
      const devices: Device[] = JSON.parse(payload.toString());
      const data = JSON.parse(payload.toString());
      this.writeBufferJSON('bridge-devices', payload);
      this.emit('bridge-devices', data);
      let index = 1;
      for (const device of devices) {
        if (device.type === 'Coordinator' && device.supported === true && device.disabled === false && device.interview_completed === true && device.interviewing === false) {
          const z2m: z2mDevice = {
            logName: 'Coordinator',
            index: 0,
            ieee_address: device.ieee_address,
            friendly_name: device.friendly_name,
            getPayload: undefined,
            description: '',
            manufacturer: '',
            model_id: '',
            vendor: 'zigbee2MQTT',
            model: 'coordinator',
            date_code: '',
            software_build_id: '',
            power_source: 'Mains (single phase)',
            isAvailabilityEnabled: false,
            isOnline: false,
            category: '',
            hasEndpoints: false,
            exposes: [],
            options: [],
            endpoints: [],
          };
          this.z2mDevices.push(z2m);
        }
        if (device.type !== 'Coordinator' && device.supported === true && device.disabled === false && device.interview_completed === true && device.interviewing === false) {
          const z2m: z2mDevice = {
            logName: 'Dev#' + index.toString().padStart(2, '0'),
            index: index++,
            ieee_address: device.ieee_address,
            friendly_name: device.friendly_name,
            getPayload: undefined,
            description: device.definition.description || '',
            manufacturer: device.manufacturer || '',
            model_id: device.model_id || '',
            vendor: device.definition.vendor || '',
            model: device.definition.model || '',
            date_code: device.date_code || '',
            software_build_id: device.software_build_id || '',
            power_source: device.power_source,
            isAvailabilityEnabled: false,
            isOnline: false,
            category: '',
            hasEndpoints: false,
            exposes: [],
            options: [],
            endpoints: [],
          };
          for (const expose of device.definition.exposes) {
            if (!expose.property && !expose.name && expose.features && expose.type) {
              // Specific expose https://www.zigbee2mqtt.io/guide/usage/exposes.html
              if (z2m.category === '') { // Only the first type: light, switch ...
                z2m.category = expose.type;
              }
              for (const feature of expose.features) { // Exposes nested inside features
                feature.category = expose.type;
                z2m.exposes.push(feature);
                if (feature.endpoint) {
                  z2m.hasEndpoints = true;
                }
              }
            } else {
              // Generic expose https://www.zigbee2mqtt.io/guide/usage/exposes.html
              expose.category = '';
              z2m.exposes.push(expose);
            }
          }
          for (const option of device.definition.options) {
            const feature = option as z2mFeature;
            z2m.options.push(feature);
          }
          for (const key in device.endpoints) {
            interface EndpointWithKey extends Endpoint {
              endpoint: string;
            }
            const endpoint: Endpoint = device.endpoints[key];
            const endpointWithKey: EndpointWithKey = {
              ...endpoint,
              endpoint: key,
            };
            z2m.endpoints.push(endpointWithKey);
            //this.log.debug('classZigbee2MQTT=>Message bridge/devices endpoints=>', device.friendly_name, key, endpoint);
          }
          this.z2mDevices.push(z2m);
        }
      }
      this.log.debug(`Received ${this.z2mDevices.length} devices`);
      this.emit('devices');
      //this.printDevices();

    } else if (topic.startsWith(this.mqttTopic + '/bridge/groups')) {
      this.z2mGroups.splice(0, this.z2mGroups.length);
      const groups: Group[] = JSON.parse(payload.toString());
      const data = JSON.parse(payload.toString());
      this.writeBufferJSON('bridge-groups', payload);
      this.emit('bridge-groups', data);
      let index = 1;
      for (const group of groups) {
        const z2m: z2mGroup = {
          logName: 'Grp#' + index.toString().padStart(2, '0'),
          index: index++,
          id: group.id,
          friendly_name: group.friendly_name,
          getPayload: undefined,
          isAvailabilityEnabled: false,
          isOnline: false,
          members: [],
          scenes: [],
        };
        for (const member of group.members) {
          z2m.members.push(member);
        }
        for (const scene of group.scenes) {
          z2m.scenes.push(scene);
        }
        this.z2mGroups.push(z2m);
      }
      this.log.debug(`Received ${this.z2mGroups.length} groups`);
      this.emit('groups');
      //this.printGroups();

    } else if (topic.startsWith(this.mqttTopic + '/bridge/extensions')) {
      const extensions = JSON.parse(payload.toString()) as BridgeExtension[];
      for (const extension of extensions) {
        this.log.warn(`Message topic: ${topic} extension: ${extension.name}`);
      }

    } else if (topic.startsWith(this.mqttTopic + '/bridge/event')) {
      this.handleEvent(payload);

    } else if (topic.startsWith(this.mqttTopic + '/bridge/request')) {
      const data = JSON.parse(payload.toString());
      this.log.warn(`Message topic: ${topic} payload:${rs}`, data);

    } else if (topic.startsWith(this.mqttTopic + '/bridge/response')) {
      if (topic.startsWith(this.mqttTopic + '/bridge/response/networkmap')) {
        this.handleResponseNetworkmap(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/permit_join')) {
        this.handleResponsePermitJoin(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/device/rename')) {
        this.handleResponseDeviceRename(payload);
        return;
      }
      const data = JSON.parse(payload.toString());
      this.log.warn(`Message topic: ${topic} payload:${rs}`, data);
      /*
      [05/09/2023, 20:35:26] [z2m] classZigbee2MQTT=>Message bridge/response zigbee2mqtt/bridge/response/group/add {
        data: { friendly_name: 'Guest', id: 1 },
        status: 'ok',
        transaction: '1nqux-2'
      }
      [11/09/2023, 15:13:54] [z2m] classZigbee2MQTT=>Message bridge/response zigbee2mqtt/bridge/response/group/members/add {
        data: { device: '0x84fd27fffe83066f/1', group: 'Master Guest room' },
        status: 'ok',
        transaction: '2ww7l-5'
      }
      */

    } else if (topic.startsWith(this.mqttTopic + '/bridge/logging')) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      //const data = JSON.parse(payload.toString());
      //this.log.debug('classZigbee2MQTT=>Message bridge/logging', data);

    } else {
      let entity = topic.replace(this.mqttTopic + '/', '');
      let service = '';
      if (entity.search('/')) { // set get availability or unknown TODO
        const parts = entity.split('/');
        entity = parts[0];
        service = parts[1];
      }
      if (entity === 'Coordinator') {
        const data = JSON.parse(payload.toString()); // TODO crash on device rename
        if (service === 'availability') {
          if (data.state === 'online') {
            this.log.debug(`Received ONLINE for ${id}Coordinator${rs}`, data);
          } else if (data.state === 'offline') {
            this.log.debug(`Received OFFLINE for ${id}Coordinator${rs}`, data);
          }
        }
        return;
      }
      if (entity.includes('_-_')) { // Eve app test mode!
        const foundDevice = this.z2mDevices.find(device => device.friendly_name.includes(entity));
        entity = foundDevice ? foundDevice.friendly_name : entity;
      }
      const foundDevice = this.z2mDevices.findIndex(device => device.ieee_address === entity || device.friendly_name === entity);
      if (foundDevice !== -1) {
        this.handleDeviceMessage(foundDevice, entity, service, payload);
      } else {
        const foundGroup = this.z2mGroups.findIndex(group => group.friendly_name === entity);
        if (foundGroup !== -1) {
          this.handleGroupMessage(foundGroup, entity, service, payload);
        } else {
          try {
            const data = JSON.parse(payload.toString());
            this.log.warn('Message for ***unknown*** entity:', entity, 'service:', service, 'payload:', data);
          } catch {
            this.log.error('Message for ***unknown*** entity:', entity, 'service:', service, 'payload: error');
          }
        }
      }

    }
  }

  public getDevice(name: string): z2mDevice | undefined {
    return this.z2mDevices.find(device => device.ieee_address === name || device.friendly_name === name);
  }

  public getGroup(name: string): z2mGroup | undefined {
    return this.z2mGroups.find(group => group.friendly_name === name);
  }

  private handleDeviceMessage(deviceIndex: number, entity: string, service: string, payload: Buffer) {
    //this.log.debug(`classZigbee2MQTT=>handleDeviceMessage ${id}#${deviceIndex + 1}${rs} entity ${dn}${entity}${rs} service ${zb}${service}${rs} payload ${pl}${payload}${rs}`);
    if (payload.length === 0 || payload === null) {
      this.log.warn(`handleDeviceMessage ${id}#${deviceIndex + 1}${rs} entity ${dn}${entity}${rs} service ${zb}${service}${rs} payload null`);
      return;
    }
    const data = JSON.parse(payload.toString()); // TODO crash on device rename
    if (service === 'availability') {
      if (data.state === 'online') {
        this.z2mDevices[deviceIndex].isAvailabilityEnabled = true;
        this.z2mDevices[deviceIndex].isOnline = true;
        this.emit('ONLINE-' + entity);
      } else if (data.state === 'offline') {
        this.z2mDevices[deviceIndex].isOnline = false;
        this.emit('OFFLINE-' + entity);
      }
    } else if (service === 'get') {
      // Do nothing
      //this.log.warn(`handleDeviceMessage entity ${dn}${entity}${wr} service ${service} payload ${pl}${payload}${rs}`);
    } else if (service === 'set') {
      // Do nothing
      //this.log.warn(`handleDeviceMessage entity ${dn}${entity}${wr} service ${service} payload ${pl}${payload}${rs}`);
    } else {
      //this.log.debug(`classZigbee2MQTT=>emitting message for device ${dn}${entity}${rs} payload ${pl}${payload}${rs}`);
      this.emit('MESSAGE-' + entity, data);
    }
  }

  private handleGroupMessage(groupIndex: number, entity: string, service: string, payload: Buffer) {
    //this.log.debug(`classZigbee2MQTT=>handleGroupMessage ${id}#${groupIndex+1}${rs} entity ${gn}${entity}${rs} service ${zb}${service}${rs} payload ${pl}${payload}${rs}`);
    if (payload.length === 0 || payload === null) {
      this.log.warn(`handleGroupMessage ${id}#${groupIndex + 1}${rs} entity ${gn}${entity}${rs} service ${zb}${service}${rs} payload null`);
      return;
    }
    const data = JSON.parse(payload.toString());
    data['last_seen'] = new Date().toISOString();
    if (service === 'availability') {
      if (data.state === 'online') {
        this.z2mGroups[groupIndex].isAvailabilityEnabled = true;
        this.z2mGroups[groupIndex].isOnline = true;
        this.emit('ONLINE-' + entity);
      } else if (data.state === 'offline') {
        this.z2mGroups[groupIndex].isOnline = false;
        this.emit('OFFLINE-' + entity);
      }
    } else if (service === 'get') {
      // Do nothing
    } else if (service === 'set') {
      // Do nothing
    } else {
      //this.log.debug(`classZigbee2MQTT=>emitting message for group ${gn}${entity}${rs} payload ${pl}${payload}${rs}`);
      this.emit('MESSAGE-' + entity, data);
    }
  }

  private handleResponseNetworkmap(payload: Buffer) {
    /*
        "routes": [
            {
              "destinationAddress": 31833,
              "nextHop": 31833,
              "status": "ACTIVE"
            }
          ],
        */
    const data = JSON.parse(payload.toString());

    const topology: Topology = data.data.value;
    const lqi = (lqi: number) => {
      if (lqi < 50) {
        return `\x1b[31m${lqi.toString().padStart(3, ' ')}${db}`;
      } else if (lqi > 200) {
        return `\x1b[32m${lqi.toString().padStart(3, ' ')}${db}`;
      } else {
        return `\x1b[38;5;251m${lqi.toString().padStart(3, ' ')}${db}`;
      }
    };
    const depth = (depth: number) => {
      if (depth === 255) {
        return `\x1b[32m${depth.toString().padStart(3, ' ')}${db}`;
      } else {
        return `\x1b[38;5;251m${depth.toString().padStart(3, ' ')}${db}`;
      }
    };
    const relationship = (relationship: number): string => {
      if (relationship === 0) {
        return `${zb}${relationship}-IsParent  ${db}`;
      } else if (relationship === 1) {
        return `${hk}${relationship}-IsAChild  ${db}`;
      } else {
        return `${relationship}-IsASibling`;
      }
    };
    const friendlyName = (ieeeAddr: string): string => {
      const node = topology.nodes.find(node => node.ieeeAddr === ieeeAddr);
      if (node) {
        if (node.type === 'Coordinator') {
          return `\x1b[48;5;1m\x1b[38;5;255m${node.friendlyName} [C]${rs}${db}`;
        } else if (node.type === 'Router') {
          return `${dn}${node.friendlyName} [R]${db}`;
        } else if (node.type === 'EndDevice') {
          return `${gn}${node.friendlyName} [E]${db}`;
        }
      }
      return `${er}${ieeeAddr}${db}`;
    };
    const timePassedSince = (lastSeen: number): string => {
      const now = Date.now();
      const difference = now - lastSeen; // difference in milliseconds

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      if (days > 0) {
        return `${days} days ago`;
      }

      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      if (hours > 0) {
        return `${hours} hours ago`;
      }

      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      if (minutes > 0) {
        return `${minutes} minutes ago`;
      }

      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      return `${seconds} seconds ago`;
    };
    this.writeBufferJSON('networkmap_' + data.data.type, payload);

    if (data.data.type === 'graphviz') {
      this.writeFile('networkmap_' + data.data.type + '.txt', data.data.value);
    }
    if (data.data.type === 'plantuml') {
      this.writeFile('networkmap_' + data.data.type + '.txt', data.data.value);
    }
    if (data.data.type === 'raw') {
      // Log nodes with links
      this.log.warn('Network map nodes:');
      topology.nodes.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
      topology.nodes.forEach((node, index) => {
        this.log.debug(`Node [${index.toString().padStart(3, ' ')}] ${node.type === 'EndDevice' ? ign : node.type === 'Router' ? idn : '\x1b[48;5;1m\x1b[38;5;255m'}${node.friendlyName}${rs}${db} addr: ${node.ieeeAddr}-0x${node.networkAddress.toString(16)} type: ${node.type} lastseen: ${timePassedSince(node.lastSeen)}`);
        // SourceAddr
        const sourceLinks = topology.links.filter(link => link.sourceIeeeAddr === node.ieeeAddr); // Filter
        sourceLinks.sort((a, b) => a.lqi - b.lqi); // Sort by lqi
        sourceLinks.forEach((link, index) => {
          const targetNode = topology.nodes.find(node => node.ieeeAddr === link.target.ieeeAddr);
          this.log.debug(`  link [${index.toString().padStart(4, ' ')}] lqi: ${lqi(link.lqi)} depth: ${depth(link.depth)} relation: ${relationship(link.relationship)} > > > ${friendlyName(link.target.ieeeAddr)}`);
        });
        // TargetAddr
        const targetLinks = topology.links.filter(link => link.targetIeeeAddr === node.ieeeAddr); // Filter
        targetLinks.sort((a, b) => a.lqi - b.lqi); // Sort by lqi
        targetLinks.forEach((link, index) => {
          const sourceNode = topology.nodes.find(node => node.ieeeAddr === link.source.ieeeAddr);
          this.log.debug(`  link [${index.toString().padStart(4, ' ')}] lqi: ${lqi(link.lqi)} depth: ${depth(link.depth)} relation: ${relationship(link.relationship)} < < < ${friendlyName(link.source.ieeeAddr)}`);
        });
      });
      // Log links
      /*
      this.log.warn('Network map links:');
      map.links.sort((a, b) => a.sourceIeeeAddr.localeCompare(b.sourceIeeeAddr));
      map.links.forEach( (link, index) => {
        const sourceNode = map.nodes.find(node => node.ieeeAddr === link.source.ieeeAddr);
        assert(sourceNode, `${wr}NwkAddr error node ${link.sourceIeeeAddr} not found${db}`);
        const targetNode = map.nodes.find(node => node.ieeeAddr === link.target.ieeeAddr);
        assert(targetNode, `${wr}NwkAddr error node ${link.targetIeeeAddr} not found${db}`);
        this.log.debug(`- link[${index}]: ${link.source.ieeeAddr}-${link.source.networkAddress.toString(16)} (${sourceNode?.friendlyName}) Lqi: ${link.lqi} Depth: ${link.depth} Relation: ${link.relationship} => ${link.target.ieeeAddr}-${link.target.networkAddress.toString(16)} (${targetNode?.friendlyName})`);
      } );
      */
    }

  }

  private handleResponseDeviceRename(payload: Buffer) {
    /*
    {
      data: {
        from: '0xcc86ecfffe4e9d25',
        homeassistant_rename: false,
        to: 'Double switch'
      },
      status: 'ok',
      transaction: 'smeo0-8'
    }
    */
    const json = JSON.parse(payload.toString());
    this.log.warn(`handleResponseDeviceRename from ${json.data.from} to ${json.data.to} status ${json.status}`);
    const device = this.z2mDevices.find(device => device.friendly_name === json.data.to);
    if (device && json.status === 'ok') {
      this.emit('rename', device.ieee_address, json.data.from, json.data.to);
    }
  }

  private handleResponsePermitJoin(payload: Buffer) {
    /*
    {
      data: { device?: 'Coordinator', time: 254, value: true },
      status: 'ok',
      transaction: 'adeis-5'
    }
    */
    const json = JSON.parse(payload.toString());
    this.log.warn(`handleResponsePermitJoin() device: ${json.data.device ? json.data.device : 'All'} time: ${json.data.time} value: ${json.data.value} status: ${json.status}`);
    if (json.status === 'ok') {
      this.emit('permit_join', json.data.device, json.data.time, json.data.value);
    }
  }

  private handleEvent(payload: Buffer) {
    /*
    {
      data: { friendly_name: 'Light sensor', ieee_address: '0x54ef44100085c321' },
      type: 'device_leave'
    }
    {
      data: {
        friendly_name: 'Kitchen Dishwasher water leak sensor',
        ieee_address: '0x00158d0007c2b057'
      },
      type: 'device_joined'
    }
    {
      data: {
        friendly_name: 'Kitchen Sink water leak sensor',
        ieee_address: '0x00158d0008f1099b',
        status: 'started'
      },
      type: 'device_interview'
    }
    {
      data: {
        friendly_name: 'Kitchen Sink water leak sensor',
        ieee_address: '0x00158d0008f1099b'
      },
      type: 'device_announce'
    }
    {
      data: {
        definition: {
          description: 'Aqara water leak sensor',
          exposes: [Array],
          model: 'SJCGQ11LM',
          options: [Array],
          supports_ota: false,
          vendor: 'Xiaomi'
        },
        friendly_name: 'Kitchen Sink water leak sensor',
        ieee_address: '0x00158d0008f1099b',
        status: 'successful',
        supported: true
      },
      type: 'device_interview'
    }
    */
    const json = JSON.parse(payload.toString());
    switch (json.type) {
    case undefined:
      this.log.error('handleEvent() undefined type', json);
      break;
    case 'device_leave':
      this.log.warn(`handleEvent() type: device_leave name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
      break;
    case 'device_joined':
      this.log.warn(`handleEvent() type: device_joined name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
      break;
    case 'device_interview':
      this.log.warn(`handleEvent() type: device_interview name: ${json.data.friendly_name} address: ${json.data.ieee_address} status: ${json.data.status} supported: ${json.data.supported}`);
      break;
    case 'device_announce':
      this.log.warn(`handleEvent() type: device_announce name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
      break;
    }
  }

  // Function to read JSON config from a file
  private readConfig(filename: string) {
    try {
      const rawdata = fs.readFileSync(filename, 'utf-8');
      const data = JSON.parse(rawdata);
      return data;
    } catch (err) {
      this.log.error('readConfig error', err);
      return null;
    }
  }

  // Function to write JSON config to a file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private writeConfig(filename: string, data: any): boolean {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      fs.writeFileSync(filename, jsonString);
      return true;
    } catch (err) {
      this.log.error('writeConfig error', err);
      return true;
    }
  }

  private printDevice(device: z2mDevice) {
    this.log.debug(`Device - ${dn}${device.friendly_name}${rs}`);
    this.log.debug(`IEEE Address: ${device.ieee_address}`);
    this.log.debug(`Description: ${device.description}`);
    this.log.debug(`Manufacturer: ${device.manufacturer}`);
    this.log.debug(`Model ID: ${device.model_id}`);
    this.log.debug(`Date Code: ${device.date_code}`);
    this.log.debug(`Software Build ID: ${device.software_build_id}`);
    this.log.debug(`Power Source: ${device.power_source}`);
    this.log.debug(`Availability Enabled: ${device.isAvailabilityEnabled}`);
    this.log.debug(`Online: ${device.isOnline}`);
    this.log.debug(`Type: ${device.category}`);

    const printFeatures = (features: z2mFeature[], featureType: string) => {
      this.log.debug(`${featureType}:`);
      features.forEach((feature) => {
        this.log.debug(`  Name: ${zb}${feature.name}${rs}`);
        this.log.debug(`  Description: ${feature.description}`);
        this.log.debug(`  Property: ${zb}${feature.property}${rs}`);
        this.log.debug(`  Type: ${feature.type}`);
        this.log.debug(`  Access: ${feature.access}`);
        if (feature.endpoint) {
          this.log.debug(`  Endpoint: ${feature.endpoint}`);
        }
        if (feature.unit) {
          this.log.debug(`  Unit: ${feature.unit}`);
        }
        if (feature.value_max) {
          this.log.debug(`  Value Max: ${feature.value_max}`);
        }
        if (feature.value_min) {
          this.log.debug(`  Value Min: ${feature.value_min}`);
        }
        if (feature.value_step) {
          this.log.debug(`  Value Step: ${feature.value_step}`);
        }
        if (feature.value_on) {
          this.log.debug(`  Value On: ${feature.value_on}`);
        }
        if (feature.value_off) {
          this.log.debug(`  Value Off: ${feature.value_off}`);
        }
        if (feature.value_toggle) {
          this.log.debug(`  Value Toggle: ${feature.value_toggle}`);
        }
        if (feature.values) {
          this.log.debug(`  Values: ${feature.values.join(', ')}`);
        }
        if (feature.presets) {
          this.log.debug(`  Presets: ${feature.presets.join(', ')}`);
        }
        this.log.debug('');
      });
    };

    const printEndpoints = (endpoints: z2mEndpoints[]) => {
      endpoints.forEach((endpoint) => {
        this.log.debug(`--Endpoint ${endpoint.endpoint}`);
        endpoint.bindings.forEach((binding) => {
          this.log.debug(`----Bindings: ${binding.cluster}`, binding.target);
        });
        endpoint.clusters.input.forEach((input) => {
          this.log.debug(`----Clusters input: ${input}`);
        });
        endpoint.clusters.output.forEach((output) => {
          this.log.debug(`----Clusters output: ${output}`);
        });
        endpoint.configured_reportings.forEach((reporting) => {
          // eslint-disable-next-line max-len
          this.log.debug(`----Reportings: ${reporting.attribute} ${reporting.cluster} ${reporting.minimum_report_interval} ${reporting.maximum_report_interval}  ${reporting.reportable_change}`);
        });
        endpoint.scenes.forEach((scene) => {
          this.log.debug(`----Scenes: ID ${scene.id} Name ${scene.name}`);
        });
        this.log.debug('');
      });
    };

    printFeatures(device.exposes, 'Exposes');
    printFeatures(device.options, 'Options');
    printEndpoints(device.endpoints);

    this.log.debug('');
  }

  private printDevices() {
    this.z2mDevices.forEach((device) => {
      this.printDevice(device);
    });
  }

  private printGroup(group: z2mGroup) {
    this.log.debug(`Group - ${dn}${group.friendly_name}${rs}`);
    this.log.debug(`ID: ${group.id}`);
    const printMembers = (members: Member[]) => {
      this.log.debug('Members:');
      members.forEach((member) => {
        this.log.debug(`--Endpoint ${member.endpoint}`);
        this.log.debug(`--IEEE Address ${member.ieee_address}`);
      });
    };
    printMembers(group.members);
    const printScenes = (scenes: Scene[]) => {
      this.log.debug('Scenes:');
      scenes.forEach((scene) => {
        this.log.debug(`--ID ${scene.id}`);
        this.log.debug(`--Name ${scene.name}`);
      });
    };
    printScenes(group.scenes);
    this.log.debug(`Availability Enabled: ${group.isAvailabilityEnabled}`);
    this.log.debug(`Online: ${group.isOnline}`);
  }

  private printGroups() {
    this.z2mGroups.forEach((group) => {
      this.printGroup(group);
    });
  }
}

