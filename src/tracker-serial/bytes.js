export function asciiBytes(text) {
  return Uint8Array.from([...text].map((character) => character.charCodeAt(0)));
}

export function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
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

export function containsBytes(bytes, needle, from = 0) {
  return findBytes(bytes, needle, from) >= 0;
}

export function findBytes(bytes, needle, from = 0) {
  if (needle.length === 0) return from;
  outer: for (let start = from; start <= bytes.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[start + index] !== needle[index]) continue outer;
    }
    return start;
  }
  return -1;
}

export function trimAsciiWhitespace(bytes) {
  let start = 0;
  let end = bytes.length;
  while (start < end && isAsciiWhitespace(bytes[start])) start += 1;
  while (end > start && isAsciiWhitespace(bytes[end - 1])) end -= 1;
  return bytes.slice(start, end);
}

function isAsciiWhitespace(byte) {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20;
}
