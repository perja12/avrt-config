import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { ConfigFormatError, parseAP510Config } from "../src/tracker-config/index.js";

const fixturePath = new URL("./fixtures/late_config.ini", import.meta.url);

describe("AP510 parser fuzzing", () => {
  it("handles random byte input without unexpected exceptions", () => {
    const random = mulberry32(0x41503531);

    for (let caseIndex = 0; caseIndex < 2_000; caseIndex += 1) {
      const raw = randomBytes(random, randomInt(random, 0, 512));
      expect(() => parseOrReject(raw), `fuzz case ${caseIndex}`).not.toThrow();
    }
  });

  it("handles valid captures mixed with random noise and mutations", async () => {
    const fixture = new Uint8Array(await readFile(fixturePath));
    const random = mulberry32(0x54524143);

    for (let caseIndex = 0; caseIndex < 1_000; caseIndex += 1) {
      const mutated = mutateCapture(fixture, random);
      expect(() => parseOrReject(mutated), `mutated case ${caseIndex}`).not.toThrow();
    }
  });
});

function parseOrReject(raw) {
  try {
    const config = parseAP510Config(raw);
    expect(config.raw).toEqual(raw);
    expect(config.records.length).toBeGreaterThan(0);
    for (const record of config.records) {
      expect(record.key).toMatch(/^\d{2}$/);
      expect(record.value).toBeInstanceOf(Uint8Array);
      expect(record.valueStart).toBeLessThanOrEqual(record.valueEnd);
    }
  } catch (error) {
    if (!(error instanceof ConfigFormatError)) throw error;
  }
}

function mutateCapture(fixture, random) {
  const prefix = randomBytes(random, randomInt(random, 0, 64));
  const suffix = randomBytes(random, randomInt(random, 0, 64));
  let body = fixture.slice();

  const operations = randomInt(random, 1, 20);
  for (let index = 0; index < operations; index += 1) {
    const operation = randomInt(random, 0, 5);
    if (operation === 0 && body.length > 0) {
      body[randomInt(random, 0, body.length - 1)] = randomInt(random, 0, 255);
    } else if (operation === 1 && body.length > 0) {
      const offset = randomInt(random, 0, body.length - 1);
      body = concat(body.slice(0, offset), body.slice(offset + 1));
    } else if (operation === 2) {
      const offset = randomInt(random, 0, body.length);
      body = concat(body.slice(0, offset), randomBytes(random, randomInt(random, 1, 12)), body.slice(offset));
    } else if (operation === 3) {
      body = concat(body, encodeAscii(`${randomTwoDigits(random)}=${randomAsciiValue(random)}\r\n`));
    } else if (operation === 4) {
      body = concat(body, encodeAscii(`${randomTwoDigits(random)}=${randomAsciiValue(random)}\r\r\n`));
    }
  }

  return concat(prefix, body, suffix);
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomBytes(random, length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = randomInt(random, 0, 255);
  }
  return bytes;
}

function randomTwoDigits(random) {
  return String(randomInt(random, 0, 99)).padStart(2, "0");
}

function randomAsciiValue(random) {
  const length = randomInt(random, 0, 24);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(randomInt(random, 32, 126));
  }
  return value;
}

function encodeAscii(value) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
