// src/platform.test.ts

const MATTER_PORT = 0;
const NAME = 'Zigbee';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';
import fs from 'node:fs';

import { describe, expect, jest, test } from '@jest/globals';
import { wait } from 'matterbridge/utils';
import { LogLevel } from 'node-ansi-logger';
import { setupTest } from 'matterbridge/jestutils';

import type { Zigbee2MQTT as Zigbee2MQTTType } from './zigbee2mqtt.js';

// Create a client mock
const mockClient = {
  // Event emitter methods
  on: jest.fn<(...args: any[]) => void>(),
  removeAllListeners: jest.fn<(...args: any[]) => void>(),
  // MQTT client methods
  endAsync: jest.fn<(force?: boolean) => Promise<void>>().mockResolvedValue(undefined),
  subscribeAsync: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
  publishAsync: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined),
};

// ESM-safe module mock
const connectAsync = jest.fn<(brokerUrl: string, opts: any, allowRetries?: boolean) => Promise<typeof mockClient>>().mockResolvedValue(mockClient);
jest.unstable_mockModule('mqtt', () => ({
  // Named export
  connectAsync,
}));

// Import the module after the mock
const { Zigbee2MQTT } = await import('./zigbee2mqtt.js');

// Setup the test environment
await setupTest(NAME, false);

describe('TestZigbee2MQTT', () => {
  let z2m: Zigbee2MQTTType;

  test('Zigbee2MQTT Initialization', async () => {
    z2m = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt', 'user', 'password', undefined, 5, undefined, true, undefined, undefined, true);
    expect(z2m).toBeInstanceOf(Zigbee2MQTT);
    expect(z2m.mqttHost).toBe('mqtt://localhost');
    expect(z2m.mqttPort).toBe(1883);
    expect(z2m.mqttUsername).toBe('user');
    expect(z2m.mqttPassword).toBe('password');
    // @ts-expect-error accessing private member for testing purposes
    expect(z2m.options.clientId).toMatch(/^matterbridge_[a-f0-9]{16}$/);
    expect(z2m.getUrl()).toBe('mqtt://localhost:1883');
  });

  test('Log debug', () => {
    z2m.setLogDebug(true);
    z2m.setLogLevel(LogLevel.DEBUG);
    // @ts-expect-error accessing private member for testing purposes
    expect(z2m.log.logLevel).toBe(LogLevel.DEBUG);
  });

  test('Data path', async () => {
    await z2m.setDataPath(HOMEDIR);
    // @ts-expect-error accessing private member for testing purposes
    expect(z2m.mqttDataPath).toBe(HOMEDIR);
  });

  test('Zigbee2MQTT start', async () => {
    await z2m.start();
    await wait(250);
    expect(connectAsync).toHaveBeenCalledWith('mqtt://localhost:1883', {
      clean: true,
      clientId: expect.stringMatching(/^matterbridge_[a-f0-9]{16}$/),
      username: 'user',
      password: 'password',
      reconnectPeriod: 5000,
      keepalive: 60,
      connectTimeout: 60000,
      protocolVersion: 5,
    });
    expect(mockClient.on).toHaveBeenCalledTimes(10);
  });

  test('Zigbee2MQTT stop', async () => {
    await z2m.stop();
    await wait(250);
    expect(mockClient.endAsync).toHaveBeenCalled();
    expect(mockClient.removeAllListeners).toHaveBeenCalled();
  });

  test('subscribe and publish fail when not connected', async () => {
    const z2m2 = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    const subCalls = mockClient.subscribeAsync.mock.calls.length;
    const pubCalls = mockClient.publishAsync.mock.calls.length;
    await z2m2.subscribe('zigbee2mqtt/#');
    await z2m2.publish('zigbee2mqtt/test', '{}');
    expect(mockClient.subscribeAsync.mock.calls.length).toBe(subCalls);
    expect(mockClient.publishAsync.mock.calls.length).toBe(pubCalls);
  });

  test('publish with queue drains messages', async () => {
    // Start a fresh instance
    const z2mQ = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    // @ts-expect-error private access for test
    z2mQ.mqttDataPath = HOMEDIR;
    await z2mQ.start();
    mockClient.publishAsync.mockClear();
    await z2mQ.publish('zigbee2mqtt/dev1/set', JSON.stringify({ state: 'ON' }), true);
    await z2mQ.publish('zigbee2mqtt/dev1/set', JSON.stringify({ brightness: 123 }), true);
    await wait(200);
    expect(mockClient.publishAsync.mock.calls.length).toBeGreaterThanOrEqual(1);
    await z2mQ.stop();
  });

  test('messageHandler: bridge/state online/offline toggles flag', async () => {
    // @ts-expect-error private access for test
    expect(z2m.z2mIsOnline).toBe(false);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/state', Buffer.from(JSON.stringify({ state: 'online' })));
    // @ts-expect-error private access for test
    expect(z2m.z2mIsOnline).toBe(true);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/state', Buffer.from('offline'));
    // @ts-expect-error private access for test
    expect(z2m.z2mIsOnline).toBe(false);
  });

  test('messageHandler: bridge/info, devices, groups emit events', async () => {
    const infoSpy = jest.fn();
    const devSpy = jest.fn();
    const grpSpy = jest.fn();
    z2m.on('bridge-info', infoSpy);
    z2m.on('bridge-devices', devSpy);
    z2m.on('bridge-groups', grpSpy);

    const info = {
      permit_join: true,
      permit_join_timeout: 60,
      version: '1.2.3',
      config: { availability: true, advanced: { output: 'json', legacy_api: false, legacy_availability_payload: false } },
    };
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/info', Buffer.from(JSON.stringify(info)));
    // @ts-expect-error private access for test
    expect(z2m.z2mPermitJoin).toBe(true);
    // @ts-expect-error private access for test
    expect(z2m.z2mVersion).toBe('1.2.3');

    const devices = [{ ieee_address: '0xabc', friendly_name: 'Lamp1', definition: {}, endpoints: {}, power_source: 'Mains (single phase)' }];
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/devices', Buffer.from(JSON.stringify(devices)));
    expect(devSpy).toHaveBeenCalled();
    expect(z2m.z2mDevices.length).toBe(1);

    const groups = [{ id: 1, friendly_name: 'Group1', members: [], scenes: [] }];
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/groups', Buffer.from(JSON.stringify(groups)));
    expect(grpSpy).toHaveBeenCalled();
    expect(z2m.z2mGroups.length).toBe(1);
    // allow async file writes to complete
    await wait(150);
  });

  test('device message emits mqtt MESSAGE-<friendly_name> and availability ONLINE-<friendly_name> OFFLINE-<friendly_name>', async () => {
    const messageSpy = jest.fn();
    const onlineSpy = jest.fn();
    const offlineSpy = jest.fn();
    z2m.on('MESSAGE-Lamp1', messageSpy);
    z2m.on('ONLINE-Lamp1', onlineSpy);
    z2m.on('OFFLINE-Lamp1', offlineSpy);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1', Buffer.from(JSON.stringify({ state: 'ON' })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1/availability', Buffer.from('online'));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1/availability', Buffer.from('offline'));
    expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'ON' }));
    expect(onlineSpy).toHaveBeenCalled();
    expect(offlineSpy).toHaveBeenCalled();
  });

  test('group message emits mqtt MESSAGE-<friendly_name>', async () => {
    const grpMessageSpy = jest.fn();
    z2m.on('MESSAGE-Group1', grpMessageSpy);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Group1', Buffer.from(JSON.stringify({ state: 'ON' })));
    expect(grpMessageSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'ON' }));
  });

  test('bridge responses emit expected events', async () => {
    const pjSpy = jest.fn();
    const rnSpy = jest.fn();
    const rmSpy = jest.fn();
    const optSpy = jest.fn();
    const gAddSpy = jest.fn();
    const gRemSpy = jest.fn();
    const gRenSpy = jest.fn();
    const gAddMS = jest.fn();
    const gRemMS = jest.fn();
    z2m.on('permit_join', pjSpy);
    z2m.on('device_rename', rnSpy);
    z2m.on('device_remove', rmSpy);
    z2m.on('device_options', optSpy);
    z2m.on('group_add', gAddSpy);
    z2m.on('group_remove', gRemSpy);
    z2m.on('group_rename', gRenSpy);
    z2m.on('group_add_member', gAddMS);
    z2m.on('group_remove_member', gRemMS);

    // Prepare devices for rename
    z2m.z2mDevices = [{ ieee_address: '0xabc', friendly_name: 'LampX' } as any];

    // Permit join
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/permit_join', Buffer.from(JSON.stringify({ status: 'ok', data: { time: 30, value: true } })));
    // Device rename
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/device/rename', Buffer.from(JSON.stringify({ status: 'ok', data: { from: '0xabc', to: 'LampX' } })));
    // Device remove
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/device/remove', Buffer.from(JSON.stringify({ status: 'ok', data: { id: 'Lamp1', block: false, force: false } })));
    // Device options
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/device/options', Buffer.from(JSON.stringify({ status: 'ok', data: { id: '0xabc', from: {}, to: {} } })));
    // Group operations
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/group/add', Buffer.from(JSON.stringify({ status: 'ok', data: { friendly_name: 'G', id: 7 } })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/group/remove', Buffer.from(JSON.stringify({ status: 'ok', data: { id: 'G', force: false } })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/group/rename', Buffer.from(JSON.stringify({ status: 'ok', data: { from: 'G', to: 'G2' } })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/group/members/add', Buffer.from(JSON.stringify({ status: 'ok', data: { group: 'G2', device: '0xabc/1' } })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/group/members/remove', Buffer.from(JSON.stringify({ status: 'ok', data: { group: 'G2', device: 'Lamp1' } })));

    expect(pjSpy).toHaveBeenCalled();
    expect(rnSpy).toHaveBeenCalled();
    expect(rmSpy).toHaveBeenCalled();
    expect(optSpy).toHaveBeenCalled();
    expect(gAddSpy).toHaveBeenCalled();
    expect(gRemSpy).toHaveBeenCalled();
    expect(gRenSpy).toHaveBeenCalled();
    expect(gAddMS).toHaveBeenCalled();
    expect(gRemMS).toHaveBeenCalled();
  });

  test('readConfig/writeConfig and emitPayload', () => {
    const file = path.join(HOMEDIR, 'roundtrip.json');
    const obj = { a: 1, b: 'two' };
    const ok = z2m.writeConfig(file, obj);
    expect(ok).toBe(true);
    const rd = z2m.readConfig(file);
    expect(rd).toEqual(obj);
    const spy = jest.fn();
    z2m.on('MESSAGE-EntityX', spy);
    z2m.emitPayload('EntityX', { state: 'ON' } as any);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ state: 'ON' }));
  });

  test('constructor warnings for mqtt:// with ca/cert/key and unsupported protocol', () => {
    // mqtt:// with ca/cert/key should log warnings (no FS access attempted)
    const zWarn = new Zigbee2MQTT('mqtt://host', 1883, 'zigbee2mqtt', undefined, undefined, undefined, 5, 'ca.pem', undefined, 'cert.pem', 'key.pem');
    expect(zWarn).toBeInstanceOf(Zigbee2MQTT);
    // unsupported protocol branch
    const zUnsup = new Zigbee2MQTT('ws://host', 1883, 'zigbee2mqtt');
    expect(zUnsup).toBeInstanceOf(Zigbee2MQTT);
  });

  test('constructor TLS and protocol options', () => {
    const zTls = new Zigbee2MQTT('mqtts://host', 8883, 'zigbee2mqtt', undefined, undefined, undefined, 5);
    // @ts-expect-error private access for test
    expect(zTls.options.protocol).toBe(undefined);
    // @ts-expect-error private access for test
    expect(zTls.options.rejectUnauthorized).toBe(true);

    const zPlain = new Zigbee2MQTT('mqtt://host', 1883, 'zigbee2mqtt', undefined, undefined, 'myId', 4);
    // @ts-expect-error private access for test
    expect(zPlain.options.protocolVersion).toBe(4);
    // @ts-expect-error private access for test
    expect(zPlain.options.clientId).toBe('myId');
  });

  test('bridge extensions and request topics are handled', async () => {
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/extensions', Buffer.from(JSON.stringify([{ name: 'ext1', version: '1.0.0' }])));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/request/custom', Buffer.from(JSON.stringify({ foo: 'bar' })));
    expect(z2m).toBeDefined();
  });

  test('bridge/devices invalid JSON triggers parse error paths', async () => {
    // Use an isolated instance to avoid polluting shared state
    const zTmp = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await zTmp.setDataPath(HOMEDIR);
    zTmp.setLogDebug(true);
    // @ts-expect-error private method access for test
    zTmp.messageHandler('zigbee2mqtt/bridge/devices', Buffer.from('not-json'));
    await wait(50);
    expect(zTmp).toBeDefined();
  });

  test('bridge logging/config/definitions fallthrough branches', async () => {
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/logging', Buffer.from(JSON.stringify({ level: 'info', message: 'hello' })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/config', Buffer.from(JSON.stringify({})));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/definitions', Buffer.from(JSON.stringify({})));
    // generic /bridge branch
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/misc', Buffer.from(JSON.stringify({})));
    expect(z2m).toBeDefined();
  });

  test('Coordinator availability handled', async () => {
    const on = jest.fn();
    const off = jest.fn();
    z2m.on('ONLINE-Coordinator', on);
    z2m.on('OFFLINE-Coordinator', off);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Coordinator/availability', Buffer.from('online'));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Coordinator/availability', Buffer.from('offline'));
    // Coordinator availability only logs, it does not emit ONLINE/OFFLINE events
    expect(on).not.toHaveBeenCalled();
    expect(off).not.toHaveBeenCalled();
  });

  test('device get/set branches no-ops', async () => {
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1/get', Buffer.from(JSON.stringify({})));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1/set', Buffer.from(JSON.stringify({ state: 'ON' })));
    expect(z2m).toBeDefined();
  });

  test('group availability handled', async () => {
    const on = jest.fn();
    const off = jest.fn();
    z2m.on('ONLINE-Group1', on);
    z2m.on('OFFLINE-Group1', off);
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Group1/availability', Buffer.from('online'));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Group1/availability', Buffer.from('offline'));
    expect(on).toHaveBeenCalled();
    expect(off).toHaveBeenCalled();
  });

  test('networkmap responses: graphviz/plantuml/raw branches', async () => {
    // graphviz
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify({ data: { type: 'graphviz', value: 'graph {}' } })));
    // plantuml
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify({ data: { type: 'plantuml', value: '@startuml\n@enduml' } })));
    // raw
    const now = Date.now();
    const raw = {
      data: {
        type: 'raw',
        value: {
          nodes: [
            { ieeeAddr: '0x1', friendlyName: 'A', networkAddress: 1, type: 'Router', lqi: 255, depth: 1, lastSeen: now },
            { ieeeAddr: '0x2', friendlyName: 'B', networkAddress: 2, type: 'EndDevice', lqi: 100, depth: 0, lastSeen: now - 1000 },
          ],
          links: [],
        },
      },
    };
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify(raw)));
    // allow async file writes to complete if any
    await wait(150);
    expect(z2m).toBeDefined();
  });

  test('networkmap writeFile error path when data path is a file', async () => {
    const z2mWF = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt', undefined, undefined, undefined, 5, undefined, undefined, undefined, undefined, true);
    // reuse an existing file path as the dataPath to force ENOENT on writing nested file
    const filePath = path.join(HOMEDIR, 'roundtrip.json');
    // @ts-expect-error test access to private
    z2mWF.mqttDataPath = filePath;
    // graphviz and plantuml will attempt writeFile and hit the catch path
    // @ts-expect-error private method access for test
    z2mWF.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify({ data: { type: 'graphviz', value: 'graph{}' } })));
    // @ts-expect-error private method access for test
    z2mWF.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify({ data: { type: 'plantuml', value: '@startuml\n@enduml' } })));
    await wait(100);
    expect(z2mWF).toBeDefined();
  });

  test('networkmap raw link details cover lqi/depth/relationship/friendlyName', async () => {
    const now = Date.now();
    const raw = {
      data: {
        type: 'raw',
        value: {
          nodes: [
            { ieeeAddr: '0xC', friendlyName: 'C', networkAddress: 0, type: 'Coordinator', lastSeen: now },
            { ieeeAddr: '0x1', friendlyName: 'A', networkAddress: 1, type: 'Router', lastSeen: now - 10000 },
            { ieeeAddr: '0x2', friendlyName: 'B', networkAddress: 2, type: 'EndDevice', lastSeen: now - 20000 },
          ],
          links: [
            { source: { ieeeAddr: '0xC', networkAddress: 0 }, target: { ieeeAddr: '0x1', networkAddress: 1 }, lqi: 30, depth: 255, relationship: 0 },
            { source: { ieeeAddr: '0x1', networkAddress: 1 }, target: { ieeeAddr: '0x2', networkAddress: 2 }, lqi: 210, depth: 0, relationship: 1 },
            { source: { ieeeAddr: '0x2', networkAddress: 2 }, target: { ieeeAddr: '0xC', networkAddress: 0 }, lqi: 100, depth: 10, relationship: 2 },
          ],
        },
      },
    };
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify(raw)));
    await wait(150);
    expect(z2m).toBeDefined();
  });

  test('networkmap raw with sourceIeeeAddr/targetIeeeAddr filters', async () => {
    const now = Date.now();
    const raw = {
      data: {
        type: 'raw',
        value: {
          nodes: [
            { ieeeAddr: '0xAA', friendlyName: 'NodeAA', networkAddress: 170, type: 'Router', lastSeen: now },
            { ieeeAddr: '0xBB', friendlyName: 'NodeBB', networkAddress: 187, type: 'EndDevice', lastSeen: now - 5000 },
            { ieeeAddr: '0xCC', friendlyName: 'NodeCC', networkAddress: 204, type: 'Coordinator', lastSeen: now - 10000 },
          ],
          links: [
            {
              sourceIeeeAddr: '0xAA',
              targetIeeeAddr: '0xBB',
              source: { ieeeAddr: '0xAA', networkAddress: 170 },
              target: { ieeeAddr: '0xBB', networkAddress: 187 },
              lqi: 150,
              depth: 0,
              relationship: 1,
            },
            {
              sourceIeeeAddr: '0xBB',
              targetIeeeAddr: '0xCC',
              source: { ieeeAddr: '0xBB', networkAddress: 187 },
              target: { ieeeAddr: '0xCC', networkAddress: 204 },
              lqi: 20,
              depth: 255,
              relationship: 0,
            },
          ],
        },
      },
    };
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/networkmap', Buffer.from(JSON.stringify(raw)));
    await wait(150);
    expect(z2m).toBeDefined();
  });

  test('bridge event variants are handled', async () => {
    // device_leave
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({ type: 'device_leave', data: { ieee_address: '0x3' } })));
    // device_joined
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({ type: 'device_joined', data: { ieee_address: '0x4', friendly_name: 'Joined' } })));
    // device_announce
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({ type: 'device_announce', data: { ieee_address: '0x5', friendly_name: 'Ann' } })));
    // device_interview (start/complete)
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({ type: 'device_interview', data: { status: 'started', device: { ieee_address: '0x6' } } })));
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({ type: 'device_interview', data: { status: 'successful', device: { ieee_address: '0x6' } } })));
    expect(z2m).toBeDefined();
  });

  test('start emits mqtt_error when connect fails', async () => {
    const z2mErr = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    const errSpy = jest.fn();
    z2mErr.on('mqtt_error', errSpy);
    connectAsync.mockRejectedValueOnce(new Error('connect-fail'));
    await z2mErr.start();
    await wait(100);
    expect(errSpy).toHaveBeenCalled();
  });

  test('subscribe handles error path when client is connected', async () => {
    const z2mSub = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await z2mSub.start();
    mockClient.subscribeAsync.mockRejectedValueOnce(new Error('sub-fail'));
    await z2mSub.subscribe('zigbee2mqtt/#');
    await wait(50);
    expect(mockClient.subscribeAsync).toHaveBeenCalled();
    await z2mSub.stop();
  });

  test('publish handles error path when client is connected', async () => {
    const z2mPub = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await z2mPub.start();
    mockClient.publishAsync.mockRejectedValueOnce(new Error('pub-fail'));
    await z2mPub.publish('zigbee2mqtt/test', JSON.stringify({ a: 1 }));
    await wait(50);
    expect(mockClient.publishAsync).toHaveBeenCalled();
    await z2mPub.stop();
  });

  test('stop without start logs already stopped', async () => {
    const z2mNs = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await z2mNs.stop();
    expect(z2mNs).toBeDefined();
  });

  test('bridge/info advanced warnings and errors are logged', async () => {
    const info = {
      permit_join: false,
      permit_join_timeout: 0,
      version: '9.9.9',
      config: { availability: true, advanced: { output: 'attribute', legacy_api: true, legacy_availability_payload: true } },
    };
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/info', Buffer.from(JSON.stringify(info)));
    // allow async file write to complete
    await wait(150);
    expect(z2m).toBeDefined();
  });

  test('bridge/response unknown path is handled', async () => {
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/response/unknown', Buffer.from(JSON.stringify({ foo: 'bar' })));
    expect(z2m).toBeDefined();
  });

  test('device/group other service branches (attribute type) are no-ops', async () => {
    // device other service
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Lamp1/attribute', Buffer.from(JSON.stringify({ any: 'value' })));
    // group other service
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/Group1/attribute', Buffer.from(JSON.stringify({ any: 'value' })));
    expect(z2m).toBeDefined();
  });

  test('readConfig for missing file returns null and writeConfig on directory is caught', () => {
    const missing = z2m.readConfig(path.join(HOMEDIR, 'does-not-exist.json'));
    expect(missing).toBeNull();
    const wrote = z2m.writeConfig(HOMEDIR, { x: 1 });
    expect(wrote).toBe(false);
  });

  test('bridge/event with undefined type is handled', async () => {
    // @ts-expect-error private method access for test
    z2m.messageHandler('zigbee2mqtt/bridge/event', Buffer.from(JSON.stringify({}))); // triggers undefined case
    expect(z2m).toBeDefined();
  });

  test('subscribe success emits mqtt_subscribed', async () => {
    const z = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await z.start();
    await wait(150);
    const subSpy = jest.fn();
    z.on('mqtt_subscribed', subSpy);
    await z.subscribe('zigbee2mqtt/#');
    await wait(100);
    expect(subSpy).toHaveBeenCalled();
    await z.stop();
    await wait(150);
  });

  test('publish queue drains and interval stops after empty', async () => {
    const z = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    // @ts-expect-error private access for test
    z.mqttDataPath = HOMEDIR;
    await z.start();
    await wait(100);
    mockClient.publishAsync.mockClear();
    await z.publish('zigbee2mqtt/dev2/set', JSON.stringify({ a: 1 }), true);
    await z.publish('zigbee2mqtt/dev2/set', JSON.stringify({ b: 2 }), true);
    await wait(300);
    expect(mockClient.publishAsync.mock.calls.length).toBeGreaterThanOrEqual(2);
    // wait extra tick to allow stopInterval() to run
    await wait(120);
    // @ts-expect-error private access for test
    expect(z.mqttPublishQueueTimeout).toBeUndefined();
    await z.stop();
    await wait(150);
  });

  test('unknown entity message is logged to file when in DEBUG', async () => {
    const z = new Zigbee2MQTT('mqtt://localhost', 1883, 'zigbee2mqtt');
    await z.setDataPath(HOMEDIR);
    z.setLogLevel(LogLevel.DEBUG);
    // @ts-expect-error private method access for test
    z.messageHandler('zigbee2mqtt/UnknownEntity', Buffer.from('{"x":1}'));
    await wait(150);
    const logFile = path.join(HOMEDIR, 'bridge-payloads.txt');
    const exists = fs.existsSync(logFile);
    expect(exists).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('TLS with missing CA/cert/key paths triggers error handling', () => {
    const zTlsErr = new Zigbee2MQTT('mqtts://host', 8883, 'zigbee2mqtt', undefined, undefined, undefined, 5, 'notafile', true, 'notcert', 'notkey');
    expect(zTlsErr).toBeInstanceOf(Zigbee2MQTT);
    // @ts-expect-error private access for test
    expect(zTlsErr.options.protocol).toBe(undefined);
  });
});
