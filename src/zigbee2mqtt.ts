/**
 * @description This file contains the class Zigbee2MQTT and all the interfaces to communicate with zigbee2MQTT.
 * @file zigbee2mqtt.ts
 * @author Luca Liguori
 * @created 2023-06-30
 * @version 3.0.0
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

/* eslint-disable jsdoc/reject-any-type */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

import { MqttClient, IClientOptions, connectAsync, ErrorWithReasonCode, IConnackPacket, IDisconnectPacket, IPublishPacket, Packet } from 'mqtt';
import { AnsiLogger, TimestampFormat, rs, db, dn, gn, er, zb, hk, id, idn, ign, REVERSE, REVERSEOFF, LogLevel } from 'node-ansi-logger';

import { BridgeDevice, BridgeExtension, BridgeGroup, BridgeInfo, Topology } from './zigbee2mqttTypes.js';
import { Payload } from './payloadTypes.js';

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
  public mqttUsername: string | undefined;
  public mqttPassword: string | undefined;
  private mqttClient: MqttClient | undefined;
  private mqttIsConnected = false;
  private mqttIsReconnecting = false;
  private mqttIsEnding = false;
  private mqttDataPath = '';
  private mqttPublishQueue: PublishQueue[] = [];
  private mqttPublishQueueTimeout: NodeJS.Timeout | undefined = undefined;
  private mqttPublishInflights = 0;
  private mqttKeepaliveInterval: NodeJS.Timeout | undefined = undefined;

  private z2mIsAvailabilityEnabled: boolean;
  private z2mIsOnline: boolean;
  private z2mPermitJoin: boolean;
  private z2mPermitJoinTimeout: number;
  private z2mVersion: string;
  public z2mBridge: BridgeInfo;
  public z2mDevices: BridgeDevice[];
  public z2mGroups: BridgeGroup[];
  loggedBridgePayloads = 0;
  loggedPublishPayloads = 0;

  // Define default MQTT options
  private options: IClientOptions = {
    clientId: 'matterbridge_' + crypto.randomBytes(8).toString('hex'),
    keepalive: 60,
    protocolVersion: 5,
    reconnectPeriod: 5000,
    connectTimeout: 60 * 1000,
    username: undefined,
    password: undefined,
    clean: true,
  };

  /**
   * Creates a new Zigbee2MQTT instance.
   *
   * @param {string} mqttHost - The MQTT broker URL (e.g., 'mqtt://localhost' or 'mqtts://host' or 'mqtt+unix:///path'). Use 'mqtts://' for secure (TLS) connections.
   * @param {number} mqttPort - The MQTT broker port (default: 1883 for MQTT, 8883 for MQTT over TLS).
   * @param {string} mqttTopic - The base MQTT topic to subscribe to (e.g., 'zigbee2mqtt').
   * @param {string} [mqttUsername] - Optional username for MQTT authentication.
   * @param {string} [mqttPassword] - Optional password for MQTT authentication.
   * @param {string} [mqttClientId] - Optional client identifier for MQTT connection. If not set, a random client id will be generated.
   * @param {5 | 4 | 3} [protocolVersion] - MQTT protocol version (5, 4, or 3). Default is 5.
   * @param {string} [ca] - Path to a CA certificate file for verifying the MQTT broker when using 'mqtts://'. Required for secure connections.
   * @param {boolean} [rejectUnauthorized] - If true, only accept server certificates signed by a trusted CA. Set to false to allow self-signed/untrusted certs (not recommended).
   * @param {string} [cert] - Path to a client certificate file for mutual TLS authentication (optional, only needed if the broker requires client certificates).
   * @param {string} [key] - Path to a client private key file for mutual TLS authentication (optional, only needed if the broker requires client certificates).
   * @param {boolean} [debug] - Enable debug logging.
   *
   * @throws {Error} If 'mqtts://' is used but no CA certificate is provided.
   *
   * TLS usage notes:
   * - For secure MQTT (TLS), use 'mqtts://' in mqttHost and provide the 'ca' parameter.
   * - 'cert' and 'key' are only required if your broker requires client certificate authentication (mutual TLS).
   * - 'rejectUnauthorized' should almost always be true for security; set to false only for testing with self-signed certs.
   */
  constructor(
    mqttHost: string,
    mqttPort: number,
    mqttTopic: string,
    mqttUsername?: string,
    mqttPassword?: string,
    mqttClientId?: string,
    protocolVersion: 5 | 4 | 3 = 5,
    ca?: string,
    rejectUnauthorized?: boolean,
    cert?: string,
    key?: string,
    debug: boolean = false,
  ) {
    super();

    this.log = new AnsiLogger({ logName: 'Zigbee2MQTT', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: debug ? LogLevel.DEBUG : LogLevel.INFO });

    this.mqttHost = mqttHost;
    this.mqttPort = mqttPort;
    this.mqttTopic = mqttTopic;
    this.mqttUsername = mqttUsername;
    this.mqttPassword = mqttPassword;

    this.options.username = mqttUsername !== undefined && mqttUsername !== '' ? mqttUsername : undefined;
    this.options.password = mqttPassword !== undefined && mqttPassword !== '' ? mqttPassword : undefined;
    if (mqttClientId) this.options.clientId = mqttClientId;
    this.options.protocolVersion = protocolVersion;

    // Setup TLS authentication if needed:
    if (mqttHost.startsWith('mqtts://') || mqttHost.startsWith('wss://')) {
      this.log.debug('Using mqtts:// protocol for secure MQTT connection');
      if (!ca) {
        this.log.info('When using mqtts:// protocol, you must provide the ca certificate for SSL/TLS connections with self-signed certificates.');
      } else {
        try {
          fs.accessSync(ca, fs.constants.R_OK);
          this.options.ca = fs.readFileSync(ca);
          this.log.info(`Successfully read the CA certificate from ${ca}`);
        } catch (error) {
          this.log.error(`Error reading the CA certificate from ${ca}:`, error);
        }
      }
      this.options.rejectUnauthorized = rejectUnauthorized !== undefined ? rejectUnauthorized : true; // Default to true for security
      this.log.info(`TLS rejectUnauthorized is set to ${this.options.rejectUnauthorized}`);
      // If cert and key are provided, use them for client authentication with SSL/TLS. Mandatory for mqtts:// connections when require_certificate true
      if (cert && key) {
        try {
          fs.accessSync(cert, fs.constants.R_OK);
          this.options.cert = fs.readFileSync(cert);
          this.log.info(`Successfully read the client certificate from ${cert}`);
        } catch (error) {
          this.log.error(`Error reading the client certificate from ${cert}:`, error);
        }
        try {
          fs.accessSync(key, fs.constants.R_OK);
          this.options.key = fs.readFileSync(key);
          this.log.info(`Successfully read the client key from ${key}`);
        } catch (error) {
          this.log.error(`Error reading the client key from ${key}:`, error);
        }
      }
    } else if (mqttHost.startsWith('mqtt://') || mqttHost.startsWith('ws://')) {
      this.log.debug('Using mqtt:// protocol for non-secure MQTT connection');
      if (ca) {
        this.log.warn('You are using mqtt:// protocol, but you provided a CA certificate. It will be ignored.');
      }
      if (cert) {
        this.log.warn('You are using mqtt:// protocol, but you provided a certificate. It will be ignored.');
      }
      if (key) {
        this.log.warn('You are using mqtt:// protocol, but you provided a key. It will be ignored.');
      }
    } else if (mqttHost.startsWith('mqtt+unix://')) {
      this.log.debug('Using mqtt+unix:// protocol for MQTT connection over Unix socket');
      if (ca) {
        this.log.warn('You are using mqtt+unix:// protocol, but you provided a CA certificate. It will be ignored.');
      }
      if (cert) {
        this.log.warn('You are using mqtt+unix:// protocol, but you provided a certificate. It will be ignored.');
      }
      if (key) {
        this.log.warn('You are using mqtt+unix:// protocol, but you provided a key. It will be ignored.');
      }
    } else {
      this.log.warn('You are using an unsupported MQTT protocol. Please use mqtt:// or mqtts:// or ws:// or wss:// or mqtt+unix://.');
    }

    this.z2mIsAvailabilityEnabled = false;
    this.z2mIsOnline = false;
    this.z2mPermitJoin = false;
    this.z2mPermitJoinTimeout = 0;
    this.z2mVersion = '';
    this.z2mBridge = {} as BridgeInfo;
    this.z2mDevices = [];
    this.z2mGroups = [];

    this.log.debug(
      `Created new instance with host: ${mqttHost} port: ${mqttPort} protocol ${protocolVersion} topic: ${mqttTopic} username: ${mqttUsername !== undefined && mqttUsername !== '' ? mqttUsername : 'undefined'} password: ${mqttPassword !== undefined && mqttPassword !== '' ? '*****' : 'undefined'}`,
    );
  }

  /**
   * Set the log level to DEBUG or INFO.
   *
   * @param {boolean} logDebug - If true, set log level to DEBUG; otherwise, set to INFO.
   */
  public setLogDebug(logDebug: boolean): void {
    this.log.logLevel = logDebug ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Set the log level.
   *
   * @param {LogLevel} logLevel - The desired log level.
   */
  public setLogLevel(logLevel: LogLevel): void {
    this.log.logLevel = logLevel;
  }

  /**
   * Set the data path.
   *
   * @param {string} dataPath - The desired data path.
   */
  public async setDataPath(dataPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dataPath, { recursive: true });
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
    try {
      const filePath = path.join(this.mqttDataPath, 'bridge-payloads.txt');
      fs.unlinkSync(filePath);
    } catch (error) {
      this.log.debug(`Error deleting bridge-payloads.txt: ${error}`);
    }
    try {
      const filePath = path.join(this.mqttDataPath, 'bridge-publish-payloads.txt');
      fs.unlinkSync(filePath);
    } catch (error) {
      this.log.debug(`Error deleting bridge-publish-payloads.txt: ${error}`);
    }
    try {
      const filePath = path.join(this.mqttDataPath, 'matter-commands.txt');
      fs.unlinkSync(filePath);
    } catch (error) {
      this.log.debug(`Error deleting matter-commands.txt: ${error}`);
    }
  }

  /**
   * Get the URL for the MQTT connection.
   *
   * @returns {string} The MQTT connection URL.
   */
  public getUrl(): string {
    return this.mqttHost.includes('unix://') ? this.mqttHost : this.mqttHost + ':' + this.mqttPort.toString();
  }

  /**
   * Start the MQTT connection.
   */
  public async start() {
    this.log.debug(`Starting connection to ${this.getUrl()}...`);

    connectAsync(this.getUrl(), this.options)
      .then((client) => {
        this.log.debug('Connection established');
        this.mqttClient = client;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.mqttClient.on('connect', (packet: IConnackPacket) => {
          this.log.debug(`MQTT client connect to ${this.getUrl()}${rs}` /* , connack*/);
          this.mqttIsConnected = true;
          this.mqttIsReconnecting = false;
          this.mqttIsEnding = false;
          this.emit('mqtt_connect'); // Never emitted at the start cause we connect async
        });

        this.mqttClient.on('reconnect', () => {
          this.log.debug(`MQTT client reconnect to ${this.getUrl()}${rs}`);
          this.mqttIsReconnecting = true;
          this.emit('mqtt_reconnect');
        });

        this.mqttClient.on('disconnect', (packet: IDisconnectPacket) => {
          this.log.debug('MQTT client diconnect', this.getUrl(), packet);
          this.emit('mqtt_disconnect');
        });

        this.mqttClient.on('close', () => {
          this.log.debug('MQTT client close');
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.emit('mqtt_close');
        });

        this.mqttClient.on('end', () => {
          this.log.debug('MQTT client end');
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.emit('mqtt_end');
        });

        this.mqttClient.on('offline', () => {
          this.log.debug('MQTT client offline');
          this.emit('mqtt_offline');
        });

        this.mqttClient.on('error', (error: Error | ErrorWithReasonCode) => {
          this.log.debug('MQTT client error', error);
          this.emit('mqtt_error', error);
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.mqttClient.on('packetsend', (packet: Packet) => {
          // this.log.debug('classZigbee2MQTT=>Event packetsend');
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.mqttClient.on('packetreceive', (packet: Packet) => {
          // this.log.debug('classZigbee2MQTT=>Event packetreceive');
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        this.mqttClient.on('message', (topic: string, payload: Buffer, packet: IPublishPacket) => {
          // this.log.debug(`classZigbee2MQTT=>Event message topic: ${topic} payload: ${payload.toString()} packet: ${debugStringify(packet)}`);
          this.messageHandler(topic, payload);
        });

        this.log.debug('Started');

        this.mqttIsConnected = true;
        this.mqttIsReconnecting = false;
        this.mqttIsEnding = false;
        this.emit('mqtt_connect');

        // Send a heartbeat every 60 seconds
        this.mqttKeepaliveInterval = setInterval(
          async () => {
            this.log.debug('Publishing keepalive MQTT message');
            try {
              await this.mqttClient?.publishAsync(`clients/${this.options.clientId}/heartbeat`, 'alive', { qos: 2 });
            } catch (error) {
              this.log.error('Error publishing keepalive MQTT message:', error);
            }
          },
          (this.options.keepalive ?? 60) * 1000,
        ).unref();
        return;
      })
      .catch((error) => {
        this.log.error(`Error connecting to ${this.getUrl()}: ${error.message}`);
        this.emit('mqtt_error', error);
      });
  }

  /**
   * Stop the MQTT connection.
   */
  public async stop() {
    if (this.mqttKeepaliveInterval) {
      clearInterval(this.mqttKeepaliveInterval);
      this.mqttKeepaliveInterval = undefined;
    }
    if (!this.mqttClient || this.mqttIsEnding) {
      this.log.debug('Already stopped!');
    } else {
      this.mqttIsEnding = true;
      this.log.debug('Ending connection...');
      this.mqttClient
        .endAsync(false)
        .then(() => {
          this.mqttClient?.removeAllListeners();
          this.mqttIsConnected = false;
          this.mqttIsReconnecting = false;
          this.mqttIsEnding = false;
          this.mqttClient = undefined;
          this.log.debug('Connection closed');
          return;
        })
        .catch((error) => {
          this.log.error(`Error closing connection: ${error.message}`);
        });
    }
  }

  /**
   * Subscribe to a topic.
   *
   * @param {string} topic - The MQTT topic to subscribe to.
   */
  public async subscribe(topic: string) {
    if (this.mqttClient && this.mqttIsConnected) {
      this.log.debug(`Subscribing topic: ${topic}`);
      // Use subscribeAsync for promise-based handling
      this.mqttClient
        .subscribeAsync(topic, { qos: 2 })
        .then(() => {
          this.log.debug(`Subscribe success on topic: ${topic}`);
          this.emit('mqtt_subscribed');
          return;
        })
        .catch((error) => {
          this.log.error(`Subscribe error: ${error} on topic: ${topic}`);
        });
    } else {
      this.log.error('Unable to subscribe, client not connected or unavailable');
    }
  }

  /**
   * Publish a message to a topic.
   *
   * @param {string} topic - The MQTT topic to publish to.
   * @param {string} message - The message to publish.
   * @param {boolean} queue - Whether to queue the message if the client is not connected.
   */
  public async publish(topic: string, message: string, queue: boolean = false) {
    const startInterval = () => {
      if (this.mqttPublishQueueTimeout) {
        return;
      }
      this.log.debug(`**Start publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} interval`);
      this.mqttPublishQueueTimeout = setInterval(async () => {
        if (this.mqttClient && this.mqttPublishQueue.length > 0) {
          this.log.debug(
            `**Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} topic: ${this.mqttPublishQueue[0].topic} message: ${this.mqttPublishQueue[0].message}${rs}`,
          );
          // this.publish(this.mqttPublishQueue[0].topic, this.mqttPublishQueue[0].message);

          try {
            this.mqttPublishInflights++;
            await this.mqttClient.publishAsync(this.mqttPublishQueue[0].topic, this.mqttPublishQueue[0].message, { qos: 2 });
            this.log.debug(
              `**Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} success on topic: ${topic} message: ${message} inflights: ${this.mqttPublishInflights}`,
            );
            this.emit('mqtt_published');
            this.mqttPublishInflights--;
          } catch (error) {
            this.mqttPublishInflights--;
            this.log.error(
              `****Publish ${REVERSE}[${this.mqttPublishQueue.length}-${this.mqttPublishInflights}]${REVERSEOFF} error: ${error} on topic: ${topic} message: ${message} inflights: ${this.mqttPublishInflights}`,
            );
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

      this.log.debug(`Publishing ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} topic: ${topic} message: ${message}`);
      try {
        this.mqttPublishInflights++;
        await this.mqttClient.publishAsync(topic, message, { qos: 2 });
        this.log.debug(`Publish ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} success on topic: ${topic} message: ${message}`);
        this.emit('mqtt_published');
        this.mqttPublishInflights--;
        // Log the first 10000 payloads
        if (this.log.logLevel === LogLevel.DEBUG && this.loggedPublishPayloads < 10000) {
          const filePath = path.join(this.mqttDataPath, 'bridge-publish-payloads.txt');
          fs.appendFileSync(filePath, `${new Date().toLocaleString()} - ` + JSON.stringify({ topic, message }).replaceAll('\\"', '"') + '\n');
          this.loggedPublishPayloads++;
        }
      } catch (error) {
        this.mqttPublishInflights--;
        this.log.error(`****Publish ${REVERSE}[${this.mqttPublishInflights}]${REVERSEOFF} error: ${error} on topic: ${topic} message: ${message}`);
      }
    } else {
      this.log.error('Unable to publish, client not connected or unavailable.');
    }
  }

  /**
   * Write a buffer to a JSON file.
   *
   * @param {string} file - The name of the file to write to.
   * @param {Buffer} buffer - The buffer containing the data to write.
   * @returns {Promise<void>}
   */
  private async writeBufferJSON(file: string, buffer: Buffer): Promise<void> {
    const filePath = path.join(this.mqttDataPath, file);
    let jsonData;

    // Parse the buffer to JSON
    try {
      jsonData = this.tryJsonParse(buffer.toString());
    } catch (error) {
      this.log.error('writeBufferJSON: parsing error:', error);
      return; // Stop execution if parsing fails
    }

    // Write the JSON data to a file
    fs.promises
      .writeFile(`${filePath}.json`, JSON.stringify(jsonData, null, 2))
      .then(() => {
        this.log.debug(`Successfully wrote to ${filePath}.json`);
        return;
      })
      .catch((error) => {
        this.log.error(`Error writing to ${filePath}.json:`, error);
      });
  }

  /**
   * Write data to a file.
   *
   * @param {string} file - The name of the file to write to.
   * @param {string} data - The data to write.
   * @returns {Promise<void>}
   */
  private async writeFile(file: string, data: string): Promise<void> {
    const filePath = path.join(this.mqttDataPath, file);

    // Write the data to a file
    fs.promises
      .writeFile(`${filePath}`, data)
      .then(() => {
        this.log.debug(`Successfully wrote to ${filePath}`);
        return;
      })
      .catch((error) => {
        this.log.error(`Error writing to ${filePath}:`, error);
      });
  }

  /**
   * Tries to parse a JSON string.
   *
   * @param {string} text - The JSON string to parse.
   * @returns {any} - The parsed JSON object or an empty object on error.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tryJsonParse(text: string): any {
    try {
      return JSON.parse(text);
    } catch (error) {
      this.log.debug(`tryJsonParse: parsing error from ${text}`);
      this.log.error('tryJsonParse: parsing error:', error);
      return {};
    }
  }

  /**
   * Handle incoming MQTT messages.
   *
   * @param {string} topic - The MQTT topic the message was received on.
   * @param {Buffer} payload - The message payload.
   */
  private messageHandler(topic: string, payload: Buffer) {
    if (topic.startsWith(this.mqttTopic + '/bridge/state')) {
      const payloadString = payload.toString();
      let data: Payload = {};
      if (payloadString.startsWith('{') && payloadString.endsWith('}')) {
        data = this.tryJsonParse(payload.toString());
      } else {
        data = { state: payloadString };
      }
      // this.log.debug('classZigbee2MQTT=>Message bridge/state', data);
      if (data.state === 'online') {
        this.z2mIsOnline = true;
        this.emit('online');
      } else if (data.state === 'offline') {
        this.z2mIsOnline = false;
        this.emit('offline');
      }
      this.log.debug(`Message bridge/state online => ${this.z2mIsOnline}`);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/info')) {
      this.z2mBridge = this.tryJsonParse(payload.toString()) as BridgeInfo;
      this.z2mPermitJoin = this.z2mBridge.permit_join;
      this.z2mPermitJoinTimeout = this.z2mBridge.permit_join_timeout;
      this.z2mVersion = this.z2mBridge.version;
      this.z2mIsAvailabilityEnabled = this.z2mBridge.config.availability !== undefined;
      this.log.debug(`Message bridge/info availability => ${this.z2mIsAvailabilityEnabled}`);
      this.log.debug(`Message bridge/info version => ${this.z2mVersion}`);
      this.log.debug(`Message bridge/info permit_join => ${this.z2mPermitJoin} timeout => ${this.z2mPermitJoinTimeout}`);
      this.log.debug(`Message bridge/info advanced.output => ${this.z2mBridge.config.advanced.output}`);
      this.log.debug(`Message bridge/info advanced.legacy_api => ${this.z2mBridge.config.advanced.legacy_api}`);
      this.log.debug(`Message bridge/info advanced.legacy_availability_payload => ${this.z2mBridge.config.advanced.legacy_availability_payload}`);
      if (this.z2mBridge.config.advanced.output === 'attribute')
        this.log.error(`Message bridge/info advanced.output must be 'json' or 'attribute_and_json'. Now is ${this.z2mBridge.config.advanced.output}`);
      if (this.z2mBridge.config.advanced.legacy_api === true) this.log.info(`Message bridge/info advanced.legacy_api is ${this.z2mBridge.config.advanced.legacy_api}`);
      if (this.z2mBridge.config.advanced.legacy_availability_payload === true)
        this.log.info(`Message bridge/info advanced.legacy_availability_payload is ${this.z2mBridge.config.advanced.legacy_availability_payload}`);
      this.emit('bridge-info', this.z2mBridge);
      if (this.log.logLevel === LogLevel.DEBUG) this.writeBufferJSON('bridge-info', payload);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/devices')) {
      if (this.log.logLevel === LogLevel.DEBUG) this.writeBufferJSON('bridge-devices', payload);
      this.z2mDevices = this.tryJsonParse(payload.toString());
      this.emit('bridge-devices', this.z2mDevices);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/groups')) {
      if (this.log.logLevel === LogLevel.DEBUG) this.writeBufferJSON('bridge-groups', payload);
      this.z2mGroups = this.tryJsonParse(payload.toString());
      this.emit('bridge-groups', this.z2mGroups);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/extensions')) {
      const extensions = this.tryJsonParse(payload.toString()) as BridgeExtension[];
      for (const extension of extensions) {
        this.log.debug(`Message topic: ${topic} extension: ${extension.name}`);
      }
    } else if (topic.startsWith(this.mqttTopic + '/bridge/event')) {
      this.handleEvent(payload);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/request')) {
      const data = this.tryJsonParse(payload.toString());
      this.log.info(`Message topic: ${topic} payload:${rs}`, data);
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
      if (topic.startsWith(this.mqttTopic + '/bridge/response/device/remove')) {
        this.handleResponseDeviceRemove(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/device/options')) {
        this.handleResponseDeviceOptions(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/group/add')) {
        this.handleResponseGroupAdd(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/group/remove')) {
        this.handleResponseGroupRemove(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/group/rename')) {
        this.handleResponseGroupRename(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/group/members/add')) {
        this.handleResponseGroupAddMember(payload);
        return;
      }
      if (topic.startsWith(this.mqttTopic + '/bridge/response/group/members/remove')) {
        this.handleResponseGroupRemoveMember(payload);
        return;
      }
      const data = this.tryJsonParse(payload.toString());
      this.log.debug(`Message topic: ${topic} payload:${rs}`, data);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/logging')) {
      // const data = JSON.parse(payload.toString());
      // this.log.debug('classZigbee2MQTT=>Message bridge/logging', data);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/config')) {
      this.log.debug(`Message topic: ${topic}`);
      // const data = JSON.parse(payload.toString());
      // this.log.debug('classZigbee2MQTT=>Message bridge/config', data);
    } else if (topic.startsWith(this.mqttTopic + '/bridge/definitions')) {
      this.log.debug(`Message topic: ${topic}`);
      // const data = JSON.parse(payload.toString());
      // this.log.debug('classZigbee2MQTT=>Message bridge/definitions', data);
    } else if (topic.startsWith(this.mqttTopic + '/bridge')) {
      this.log.debug(`Message topic: ${topic}`);
      // const data = JSON.parse(payload.toString());
      // this.log.debug('classZigbee2MQTT=>Message bridge/definitions', data);
    } else {
      let entity = topic.replace(this.mqttTopic + '/', '');
      let service = '';
      if (entity.search('/')) {
        // set get availability or unknown TODO
        const parts = entity.split('/');
        entity = parts[0];
        service = parts[1];
      }
      if (entity === 'Coordinator') {
        const data = this.tryJsonParse(payload.toString()); // TODO crash on device rename
        if (service === 'availability') {
          if (data.state === 'online') {
            this.log.debug(`Received ONLINE for ${id}Coordinator${rs}`, data);
          } else if (data.state === 'offline') {
            this.log.debug(`Received OFFLINE for ${id}Coordinator${rs}`, data);
          }
        }
        return;
      }

      // Log the first 10000 payloads
      if (this.log.logLevel === LogLevel.DEBUG && this.loggedBridgePayloads < 10000) {
        const logEntry = {
          entity,
          service,
          payload: payload.toString(),
        };
        const filePath = path.join(this.mqttDataPath, 'bridge-payloads.txt');
        fs.appendFileSync(filePath, `${new Date().toLocaleString()} - ` + JSON.stringify(logEntry).replaceAll('\\"', '"') + '\n');
        this.loggedBridgePayloads++;
      }

      const foundDevice = this.z2mDevices.find((device) => device.ieee_address === entity || device.friendly_name === entity);
      if (foundDevice) {
        this.handleDeviceMessage(foundDevice, entity, service, payload);
      } else {
        const foundGroup = this.z2mGroups.find((group) => group.friendly_name === entity);
        if (foundGroup) {
          this.handleGroupMessage(foundGroup, entity, service, payload);
        } else {
          this.log.debug('Message for ***unknown*** entity:', entity, 'service:', service, 'payload:', payload);
        }
      }
    }
  }

  /**
   * Handle incoming device messages.
   *
   * @param {BridgeDevice} device - The device the message is for.
   * @param {string} entity - The entity ID.
   * @param {string} service - The service type.
   * @param {Buffer} payload - The message payload.
   */
  private handleDeviceMessage(device: BridgeDevice, entity: string, service: string, payload: Buffer) {
    if (payload.length === 0 || payload === null) {
      return;
    }
    const payloadString = payload.toString();
    let data: Payload = {};
    if (payloadString.startsWith('{') && payloadString.endsWith('}')) {
      data = this.tryJsonParse(payload.toString());
    } else {
      data = { state: payloadString }; // Only state for availability
    }
    if (service === 'availability') {
      if (data.state === 'online') {
        this.emit('availability', entity, true);
        this.emit('ONLINE-' + entity);
      } else if (data.state === 'offline') {
        this.emit('availability', entity, false);
        this.emit('OFFLINE-' + entity);
      }
    } else if (service === 'get') {
      // Do nothing
    } else if (service === 'set') {
      // Do nothing
    } else if (service === undefined) {
      this.emit('message', entity, data);
      this.emit('MESSAGE-' + entity, data);
    } else {
      // MQTT output attribute type
    }
  }

  private handleGroupMessage(group: BridgeGroup, entity: string, service: string, payload: Buffer) {
    if (payload.length === 0 || payload === null) {
      return;
    }
    const payloadString = payload.toString();
    let data: Payload = {};
    if (payloadString.startsWith('{') && payloadString.endsWith('}')) {
      data = this.tryJsonParse(payload.toString());
    } else {
      data = { state: payloadString }; // Only state for availability
    }
    data['last_seen'] = new Date().toISOString();
    if (service === 'availability') {
      if (data.state === 'online') {
        this.emit('availability', entity, true);
        this.emit('ONLINE-' + entity);
      } else if (data.state === 'offline') {
        this.emit('availability', entity, false);
        this.emit('OFFLINE-' + entity);
      }
    } else if (service === 'get') {
      // Do nothing
    } else if (service === 'set') {
      // Do nothing
    } else if (service === undefined) {
      this.emit('MESSAGE-' + entity, data);
    } else {
      // MQTT output attribute type
    }
  }

  /**
   * Handle incoming network map responses.
   *
   * @param {Buffer} payload - The message payload.
   */
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
    const data = this.tryJsonParse(payload.toString());

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
      const node = topology.nodes.find((node) => node.ieeeAddr === ieeeAddr);
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
    if (this.log.logLevel === LogLevel.DEBUG) this.writeBufferJSON('networkmap_' + data.data.type, payload);

    if (data.data.type === 'graphviz') {
      if (this.log.logLevel === LogLevel.DEBUG) this.writeFile('networkmap_' + data.data.type + '.txt', data.data.value);
    }
    if (data.data.type === 'plantuml') {
      if (this.log.logLevel === LogLevel.DEBUG) this.writeFile('networkmap_' + data.data.type + '.txt', data.data.value);
    }
    if (data.data.type === 'raw') {
      // Log nodes with links
      this.log.warn('Network map nodes:');
      topology.nodes.sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
      topology.nodes.forEach((node, index) => {
        this.log.debug(
          `Node [${index.toString().padStart(3, ' ')}] ${node.type === 'EndDevice' ? ign : node.type === 'Router' ? idn : '\x1b[48;5;1m\x1b[38;5;255m'}${node.friendlyName}${rs}${db} addr: ${node.ieeeAddr}-0x${node.networkAddress.toString(16)} type: ${node.type} lastseen: ${timePassedSince(node.lastSeen)}`,
        );
        // SourceAddr
        const sourceLinks = topology.links.filter((link) => link.sourceIeeeAddr === node.ieeeAddr); // Filter
        sourceLinks.sort((a, b) => a.lqi - b.lqi); // Sort by lqi
        sourceLinks.forEach((link, index) => {
          // const targetNode = topology.nodes.find((node) => node.ieeeAddr === link.target.ieeeAddr);
          this.log.debug(
            `  link [${index.toString().padStart(4, ' ')}] lqi: ${lqi(link.lqi)} depth: ${depth(link.depth)} relation: ${relationship(link.relationship)} > > > ${friendlyName(link.target.ieeeAddr)}`,
          );
        });
        // TargetAddr
        const targetLinks = topology.links.filter((link) => link.targetIeeeAddr === node.ieeeAddr); // Filter
        targetLinks.sort((a, b) => a.lqi - b.lqi); // Sort by lqi
        targetLinks.forEach((link, index) => {
          // const sourceNode = topology.nodes.find((node) => node.ieeeAddr === link.source.ieeeAddr);
          this.log.debug(
            `  link [${index.toString().padStart(4, ' ')}] lqi: ${lqi(link.lqi)} depth: ${depth(link.depth)} relation: ${relationship(link.relationship)} < < < ${friendlyName(link.source.ieeeAddr)}`,
          );
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
        this.log.debug(`- link[${index}]: ${link.source.ieeeAddr}-${link.source.networkAddress.toString(16)} (${sourceNode?.friendlyName}) 
        Lqi: ${link.lqi} Depth: ${link.depth} Relation: ${link.relationship} => ${link.target.ieeeAddr}-${link.target.networkAddress.toString(16)} (${targetNode?.friendlyName})`);
      } );
      */
    }
  }

  /**
   * Handle incoming device rename responses.
   *
   * @param {Buffer} payload - The message payload.
   */
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
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseDeviceRename from ${json.data.from} to ${json.data.to} status ${json.status}`);
    const device = this.z2mDevices.find((device) => device.friendly_name === json.data.to);
    this.emit('device_rename', device?.ieee_address, json.data.from, json.data.to);
  }

  /**
   * Handle incoming device remove responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseDeviceRemove(payload: Buffer) {
    /*
    {
      data: { block: false, force: false, id: 'Presence sensor' },
      status: 'ok',
      transaction: 'bet01-20'
    }    
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseDeviceRemove name ${json.data.id} status ${json.status} block ${json.data.block} force ${json.data.force}`);
    this.emit('device_remove', json.data.id, json.status, json.data.block, json.data.force);
  }

  /**
   * Handle incoming device options responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseDeviceOptions(payload: Buffer) {
    /*
    {
      data: {
        from: {
          color_sync: false,
          legacy: false,
          state_action: false,
          transition: 0
        },
        id: '0xa4c1388ad0ebb0a6',
        restart_required: false,
        to: {
          color_sync: false,
          legacy: false,
          state_action: false,
          transition: 0
        }
      },
      status: 'ok',
      transaction: '8j6s7-3'
    }
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseDeviceOptions ieee_address ${json.data.id} status ${json.status} from ${json.data.from} to ${json.data.to}`);
    this.emit('device_options', json.data.id, json.status, json.data.from, json.data.to);
  }

  /**
   * Handle incoming group add responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseGroupAdd(payload: Buffer) {
    /*
    {
      data: { friendly_name: 'Test', id: 7 },
      status: 'ok',
      transaction: '8j6s7-9'
    }
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseGroupAdd() friendly_name ${json.data.friendly_name} id ${json.data.id} status ${json.status}`);
    if (json.status === 'ok') {
      this.emit('group_add', json.data.friendly_name, json.data.id, json.status);
    }
  }

  /**
   * Handle incoming group remove responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseGroupRemove(payload: Buffer) {
    /*
    {
      data: { force: false, id: 'Test' },
      status: 'ok',
      transaction: '8j6s7-10'
    }
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseGroupRemove() friendly_name ${json.data.id} status ${json.status}`);
    if (json.status === 'ok') {
      this.emit('group_remove', json.data.id, json.status);
    }
  }

  /**
   * Handle incoming group rename responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseGroupRename(payload: Buffer) {
    /*
    {
      data: { from: 'Test2', homeassistant_rename: false, to: 'Test' },
      status: 'ok',
      transaction: '0r51l-15'
    }
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseGroupRename() from ${json.data.from} to ${json.data.to} status ${json.status}`);
    if (json.status === 'ok') {
      this.emit('group_rename', json.data.from, json.data.to, json.status);
    }
  }

  /**
   * Handle incoming group add member responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseGroupAddMember(payload: Buffer) {
    /*
    {
      data: { device: '0xa4c1388ad0ebb0a6/1', group: 'Test2' },
      status: 'ok',
      transaction: '0r51l-7'
    }  
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseGroupAddMembers() add to group friendly_name ${json.data.group} device ieee_address ${json.data.device} status ${json.status}`);
    if (json.status === 'ok' && json.data.device && json.data.device.includes('/')) {
      this.emit('group_add_member', json.data.group, json.data.device.split('/')[0], json.status);
    }
  }

  /**
   * Handle incoming group remove member responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponseGroupRemoveMember(payload: Buffer) {
    /*
    {
      data: { device: 'Gledopto RGBCTT light', group: 'Test2' },
      status: 'ok',
      transaction: '0r51l-10'
    }    
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponseGroupRemoveMember() remove from group friendly_name ${json.data.group} device friendly_name ${json.data.device} status ${json.status}`);
    if (json.status === 'ok') {
      this.emit('group_remove_member', json.data.group, json.data.device, json.status);
    }
  }

  /**
   * Handle incoming permit join responses.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleResponsePermitJoin(payload: Buffer) {
    /*
    {
      data: { device?: 'Coordinator', time: 254, value: true },
      status: 'ok',
      transaction: 'adeis-5'
    }
    */
    const json = this.tryJsonParse(payload.toString());
    this.log.debug(`handleResponsePermitJoin() device: ${json.data.device ? json.data.device : 'All'} time: ${json.data.time} value: ${json.data.value} status: ${json.status}`);
    if (json.status === 'ok') {
      this.emit('permit_join', json.data.device, json.data.time, json.data.value);
    }
  }

  /**
   * Handle incoming event messages.
   *
   * @param {Buffer} payload - The message payload.
   */
  private handleEvent(payload: Buffer) {
    const json = this.tryJsonParse(payload.toString());
    switch (json.type) {
      case undefined:
        this.log.error('handleEvent() undefined type', json);
        break;
      case 'device_leave':
        /*  
        {
          data: { friendly_name: 'Light sensor', ieee_address: '0x54ef44100085c321' },
          type: 'device_leave'
        }
        */
        this.log.debug(`handleEvent() type: device_leave name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
        this.emit('device_leave', json.data.friendly_name, json.data.ieee_address);
        break;
      case 'device_joined':
        /*
        {
          data: {
            friendly_name: 'Kitchen Dishwasher water leak sensor',
            ieee_address: '0x00158d0007c2b057'
          },
          type: 'device_joined'
        }
        */
        this.log.debug(`handleEvent() type: device_joined name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
        this.emit('device_joined', json.data.friendly_name, json.data.ieee_address);
        break;
      case 'device_announce':
        /*
        {
          data: {
            friendly_name: 'Kitchen Sink water leak sensor',
            ieee_address: '0x00158d0008f1099b'
          },
          type: 'device_announce'
        }
        */
        this.log.debug(`handleEvent() type: device_announce name: ${json.data.friendly_name} address: ${json.data.ieee_address}`);
        this.emit('device_announce', json.data.friendly_name, json.data.ieee_address);
        break;
      case 'device_interview':
        /*
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
        this.log.debug(
          `handleEvent() type: device_interview name: ${json.data.friendly_name} address: ${json.data.ieee_address} status: ${json.data.status} supported: ${json.data.supported}`,
        );
        this.emit('device_interview', json.data.friendly_name, json.data.ieee_address, json.data.status, json.data.supported);
        break;
    }
  }

  /**
   * Read JSON config from a file.
   *
   * @param {string} filename - The name of the file to read from.
   * @returns {object|null} The parsed JSON object or null if an error occurred.
   */
  public readConfig(filename: string): object | null {
    this.log.debug(`Reading config from ${filename}`);
    try {
      const rawdata = fs.readFileSync(filename, 'utf-8');
      const data = this.tryJsonParse(rawdata);
      return data;
    } catch (err) {
      this.log.error('readConfig error', err);
      return null;
    }
  }

  /**
   * Write JSON config to a file.
   *
   * @param {string} filename - The name of the file to write to.
   * @param {object} data - The JSON data to write.
   * @returns {boolean} True if the write was successful, false otherwise.
   */
  public writeConfig(filename: string, data: object): boolean {
    this.log.debug(`Writing config to ${filename}`);
    try {
      const jsonString = JSON.stringify(data, null, 2);
      fs.writeFileSync(filename, jsonString);
      return true;
    } catch (err) {
      this.log.error('writeConfig error', err);
      return false;
    }
  }

  /**
   * Emit a payload event for a specific entity.
   *
   * @param {string} entity - The entity ID.
   * @param {Payload} data - The payload data.
   */
  public emitPayload(entity: string, data: Payload) {
    this.emit('MESSAGE-' + entity, data);
  }
}
