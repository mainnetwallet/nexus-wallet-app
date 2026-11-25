export const NATIVE_ZERO = '0x0000000000000000000000000000000000000000';
export const NATIVE_EEEE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_LOWER_EEEE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

export function isNativeAddress(address: string | null | undefined): boolean {
  if (!address) return true;
  const a = address.trim().toLowerCase();
  return a === NATIVE_ZERO || a === NATIVE_ZERO.slice(2) || a === NATIVE_EEEE.toLowerCase() || a === NATIVE_LOWER_EEEE;
}

/** Resolve the token address a provider expects for a native asset. */
export function nativeOr(address: string | null | undefined, sentinel: string): string {
  return isNativeAddress(address) ? sentinel : (address as string);
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
