import { NativeModules } from 'react-native';
import { NEW_KDF, constantTimeEqual, generateSalt } from '@nexus/core';

interface NexusPinModule {
  derive(pin: string, saltHex: string, iterations: number, keyLength: number): Promise<string>;
}

const native = NativeModules.NexusPin as NexusPinModule | undefined;

async function derive(pin: string, saltHex: string): Promise<string> {
  if (!native) throw new Error('NexusPin native module unavailable');
  return native.derive(pin, saltHex, NEW_KDF.iterations, NEW_KDF.keyLength);
}

export async function createPinHash(pin: string): Promise<string> {
  const salt = generateSalt();
  const hash = await derive(pin, salt);
  return `nexus:pin:v2:${salt}:${hash}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'nexus' || parts[1] !== 'pin' || parts[2] !== 'v2') {
    return false;
  }
  const expected = parts[4]!;
  const hash = await derive(pin, parts[3]!);
  return constantTimeEqual(hash, expected);
}
