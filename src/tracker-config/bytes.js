const ASCII_BACKSLASH = 0x5c;
const ASCII_TAB = 0x09;
const ASCII_CR = 0x0d;
const ASCII_LF = 0x0a;

export function escapeBytes(value) {
  const bytes = toBytes(value);
  let output = "";
  for (const byte of bytes) {
    if (byte === ASCII_BACKSLASH) output += "\\\\";
    else if (byte === ASCII_TAB) output += "\\t";
    else if (byte === ASCII_CR) output += "\\r";
    else if (byte === ASCII_LF) output += "\\n";
    else if (byte >= 0x20 && byte <= 0x7e) output += String.fromCharCode(byte);
    else output += `\\x${byte.toString(16).padStart(2, "0")}`;
  }
  return output;
}

export function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new TypeError("expected bytes, ArrayBuffer, string, or byte array");
}

export function concatBytes(parts) {
  const totalLength = parts.reduce((length, part) => length + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export function ascii(bytes) {
  if (bytes.some((byte) => byte > 0x7f)) return null;
  return String.fromCharCode(...bytes);
}

export function latin1(bytes) {
  return String.fromCharCode(...bytes);
}

export function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    output += alphabet[bytes[index] >> 2];
    output += alphabet[((bytes[index] & 0x03) << 4) | (bytes[index + 1] >> 4)];
    output += alphabet[((bytes[index + 1] & 0x0f) << 2) | (bytes[index + 2] >> 6)];
    output += alphabet[bytes[index + 2] & 0x3f];
  }

  if (index < bytes.length) {
    output += alphabet[bytes[index] >> 2];
    if (index + 1 < bytes.length) {
      output += alphabet[((bytes[index] & 0x03) << 4) | (bytes[index + 1] >> 4)];
      output += alphabet[(bytes[index + 1] & 0x0f) << 2];
      output += "=";
    } else {
      output += alphabet[(bytes[index] & 0x03) << 4];
      output += "==";
    }
  }

  return output;
}
