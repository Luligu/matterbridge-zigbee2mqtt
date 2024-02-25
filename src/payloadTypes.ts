/**
 * This file contains the types for MQTT Accessories.
 *
 * @file payloadTypes.ts
 * @author Luca Liguori
 * @date 2023-12-12
 * @version 1.0.0
 *
 * All rights reserved.
 *
 */

export type PayloadValue = string | number | boolean | bigint | object | undefined | null;

export type Payload = {
  [key: string]: PayloadValue; // This allows any string as a key, and the value can be PayloadValue.
};
