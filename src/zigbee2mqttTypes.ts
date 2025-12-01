/**
 * @description This file contains the types for zigbee2mqtt.
 * @file zigbee2mqttTypes.ts
 * @author Luca Liguori
 * @created 2023-11-02
 * @version 1.1.6
 * @license Apache-2.0
 *
 * Copyright 2023, 2024, 2025 Luca Liguori.
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

export type KeyValue = Record<string, unknown>;

interface DeviceOptions {
  ID?: string;
  disabled?: boolean;
  retention?: number;
  availability?: boolean | { timeout: number };
  optimistic?: boolean;
  retrieve_state?: boolean;
  debounce?: number;
  debounce_ignore?: string[];
  filtered_attributes?: string[];
  filtered_cache?: string[];
  filtered_optimistic?: string[];
  icon?: string;
  homeassistant?: KeyValue;
  legacy?: boolean;
  friendly_name: string;
  description?: string;
  qos?: 0 | 1 | 2;
}

interface GroupOptions {
  devices?: string[];
  ID?: number;
  optimistic?: boolean;
  off_state?: 'all_members_off' | 'last_member_state';
  filtered_attributes?: string[];
  filtered_cache?: string[];
  filtered_optimistic?: string[];
  retrieve_state?: boolean;
  homeassistant?: KeyValue;
  friendly_name: string;
  description?: string;
  qos?: 0 | 1 | 2;
}

interface ConfigSettings {
  homeassistant?: {
    discovery_topic: string;
    status_topic: string;
    legacy_entity_attributes: boolean;
    legacy_triggers: boolean;
  };
  permit_join?: boolean;
  availability?: {
    active: { timeout: number };
    passive: { timeout: number };
  };
  external_converters: string[];
  mqtt: {
    base_topic: string;
    include_device_information: boolean;
    force_disable_retain: boolean;
    version?: 3 | 4 | 5;
    user?: string;
    password?: string;
    server: string;
    ca?: string;
    keepalive?: number;
    key?: string;
    cert?: string;
    client_id?: string;
    reject_unauthorized?: boolean;
  };
  serial: {
    disable_led: boolean;
    port?: string;
    adapter?: 'deconz' | 'zstack' | 'ezsp' | 'zigate';
    baudrate?: number;
    rtscts?: boolean;
  };
  passlist: string[];
  blocklist: string[];
  map_options: {
    graphviz: {
      colors: {
        fill: {
          enddevice: string;
          coordinator: string;
          router: string;
        };
        font: {
          coordinator: string;
          router: string;
          enddevice: string;
        };
        line: {
          active: string;
          inactive: string;
        };
      };
    };
  };
  ota: {
    update_check_interval: number;
    disable_automatic_update_check: boolean;
    zigbee_ota_override_index_location?: string;
    ikea_ota_use_test_url?: boolean;
  };
  frontend?: {
    auth_token?: string;
    host?: string;
    port?: number;
    url?: string;
    ssl_cert?: string;
    ssl_key?: string;
    package?: 'zigbee2mqtt-windfront' | 'zigbee2mqtt-frontend';
  };
  devices?: Record<string, DeviceOptions>;
  groups?: Record<string, GroupOptions>;
  device_options: KeyValue;
  advanced: {
    legacy_api: boolean;
    legacy_availability_payload: boolean;
    log_rotation: boolean;
    log_symlink_current: boolean;
    log_output: ('console' | 'file' | 'syslog')[];
    log_directory: string;
    log_file: string;
    log_level: 'debug' | 'info' | 'error' | 'warn';
    log_syslog: KeyValue;
    pan_id: number | 'GENERATE';
    ext_pan_id: number[] | 'GENERATE';
    channel: number;
    adapter_concurrent: number | null;
    adapter_delay: number | null;
    cache_state: boolean;
    cache_state_persistent: boolean;
    cache_state_send_on_startup: boolean;
    last_seen: 'disable' | 'ISO_8601' | 'ISO_8601_local' | 'epoch';
    elapsed: boolean;
    network_key: number[] | 'GENERATE';
    timestamp_format: string;
    output: 'json' | 'attribute' | 'attribute_and_json';
    transmit_power?: number;
    // Everything below is deprecated
    availability_timeout?: number;
    availability_blocklist?: string[];
    availability_passlist?: string[];
    availability_blacklist?: string[];
    availability_whitelist?: string[];
    soft_reset_timeout: number;
    report: boolean;
  };
}

export interface BridgeInfo {
  version: string;
  zigbee_herdsman: { version: string };
  zigbee_herdsman_converters: { version: string };
  commit: string;
  coordinator: {
    ieee_address: string;
    meta: {
      maintrel: number;
      majorrel: number;
      minorrel: number;
      product: number;
      revision: number;
      transportrev: number;
    };
    type: string;
  };
  network: {
    channel: number;
    extended_pan_id: string;
    pan_id: number;
  };
  log_level: 'debug' | 'info' | 'error' | 'warn';
  permit_join: boolean;
  permit_join_timeout: number;
  restart_required: boolean;
  config: ConfigSettings;
  config_schema: unknown;
}

interface DeviceEndpoint {
  bindings: { cluster: string; target: { type: string; endpoint?: number; ieee_address?: string; id?: number } }[];
  configured_reportings: {
    cluster: string;
    attribute: string | number;
    minimum_report_interval: number;
    maximum_report_interval: number;
    reportable_change: number;
  }[];
  clusters: { input: string[]; output: string[] };
  scenes: { id: number; name: string }[];
}

interface DeviceDefinition {
  model: string;
  vendor: string;
  description: string;
  exposes: DefinitionExpose[];
  source?: string;
  supports_ota: boolean;
  options: DefinitionExpose[];
}

interface DefinitionExposeFeature {
  name: string;
  description?: string;
  category?: string;
  label: string;
  endpoint?: string;
  property: string;
  value_max?: number;
  value_min?: number;
  unit?: string;
  value_off?: string;
  value_on?: string;
  value_toggle?: string;
  value_step?: number;
  values?: string[];
  access: number;
  type?: string;
  presets?: { description: string; name: string; value: number }[];
  // features?: { access?: number; label?: string; name?: string; property?: string; type?: string }[];
}

interface DefinitionExpose {
  type: string;
  name?: string;
  description?: string;
  category?: string;
  label?: string;
  features?: DefinitionExposeFeature[];
  endpoint?: string;
  values?: string[];
  value_off?: string | boolean;
  value_on?: string | boolean;
  value_step?: number;
  access: number;
  property: string;
  unit?: string;
  value_min?: number;
  value_max?: number;
  item_type?: {
    access: number;
    label: string;
    name: string;
    type: string;
  };
}

export interface BridgeDevice {
  ieee_address: string;
  type: 'Coordinator' | 'Router' | 'EndDevice' | 'Unknown' | 'GreenPower';
  network_address: number;
  supported: boolean;
  friendly_name: string;
  disabled: boolean;
  description?: string;
  definition: DeviceDefinition;
  power_source: string;
  software_build_id: string;
  date_code: string;
  model_id: string;
  interviewing: boolean;
  interview_completed: boolean;
  interview_state: string;
  manufacturer: string;
  endpoints: Record<number, DeviceEndpoint>;
}

export interface BridgeGroup {
  id: number;
  friendly_name: string;
  description: string;
  scenes: { id: number; name: string }[];
  members: { ieee_address: string; endpoint: number }[];
}

interface RoutingTableEntry {
  destinationAddress: number;
  status: string;
  nextHop: number;
}

interface Link {
  source: { ieeeAddr: string; networkAddress: number };
  target: { ieeeAddr: string; networkAddress: number };
  linkquality: number;
  depth: number;
  routes: RoutingTableEntry[];
  sourceIeeeAddr: string;
  targetIeeeAddr: string;
  sourceNwkAddr: number;
  lqi: number;
  relationship: number;
}

interface Node {
  ieeeAddr: string;
  friendlyName: string;
  type: string;
  networkAddress: number;
  manufacturerName: string;
  modelID: string;
  failed: string[];
  lastSeen: number;
  definition: { model: string; vendor: string; supports: string; description: string };
}

export interface Topology {
  nodes: Node[];
  links: Link[];
}

export interface BridgeExtension {
  name: string;
  code: string;
}
