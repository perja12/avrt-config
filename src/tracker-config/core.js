import { ascii, bytesEqual, bytesToBase64, concatBytes, escapeBytes, latin1, toBytes } from "./bytes.js";
import { selectProfile } from "./profiles.js";

const ASCII_ZERO = 0x30;
const ASCII_NINE = 0x39;
const ASCII_EQUALS = 0x3d;
const ASCII_CR = 0x0d;
const ASCII_LF = 0x0a;

export class ConfigFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigFormatError";
  }
}

export class ConfigRecord {
  constructor({ key, value, keyStart, valueStart, valueEnd, lineStart, lineEnd, definition = null }) {
    this.key = key;
    this.value = value;
    this.keyStart = keyStart;
    this.valueStart = valueStart;
    this.valueEnd = valueEnd;
    this.lineStart = lineStart;
    this.lineEnd = lineEnd;
    this.definition = definition;
  }

  get name() {
    return this.definition?.name ?? "unknown";
  }

  get displayValue() {
    return escapeBytes(this.value);
  }

  decoded() {
    if (this.definition) return this.definition.decoder(this.value);
    return ascii(this.value);
  }

  toJSON() {
    return {
      key: this.key,
      name: this.name,
      display: this.displayValue,
      base64: bytesToBase64(this.value),
      decoded: this.decoded(),
    };
  }
}

export class AP510Config {
  constructor(raw, records, profile) {
    this.raw = raw;
    this.records = records;
    this.profile = profile;
  }

  byKey() {
    return new Map(this.records.map((record) => [record.key, record]));
  }

  firmware() {
    const record = this.byKey().get("00");
    if (!record) return null;
    return latin1(record.value).trim();
  }

  sameRecordsAs(other) {
    if (this.records.length !== other.records.length) return false;
    return this.records.every((record, index) => {
      const otherRecord = other.records[index];
      return record.key === otherRecord.key && bytesEqual(record.value, otherRecord.value);
    });
  }

  validateSerialCapture() {
    if (!endsWithCompleteNumberedRecord(this.raw)) {
      throw new ConfigFormatError("response does not end with a complete numbered record");
    }
    if (this.raw.at(-1) !== ASCII_LF) {
      throw new ConfigFormatError("response does not end with a complete CR/LF-delimited record");
    }

    const keys = this.records.map((record) => record.key);
    if (keys[0] !== "00" || !this.firmware()) {
      throw new ConfigFormatError("response must start with a nonempty firmware record 00");
    }
    const terminalCaptureKeys = this.profile.terminalCaptureKeys ?? new Set();
    if (terminalCaptureKeys.size > 0 && !terminalCaptureKeys.has(keys.at(-1))) {
      throw new ConfigFormatError(
        `response ends at key ${keys.at(-1) ?? "none"}, expected terminal key ${[...terminalCaptureKeys].sort().join(", ")}`,
      );
    }

    const terminal = this.records.at(-1);
    const terminalLength = this.profile.terminalCaptureLengths?.get(terminal?.key);
    if (terminalLength !== undefined && terminal.value.length !== terminalLength) {
      throw new ConfigFormatError(`terminal record ${terminal.key} has ${terminal.value.length} bytes, expected ${terminalLength}`);
    }

    const requiredCaptureKeys = new Set(["00", "01", ...(this.profile.requiredCaptureKeys ?? [])]);
    const missing = [...requiredCaptureKeys].filter((key) => !keys.includes(key)).sort();
    if (missing.length > 0) {
      throw new ConfigFormatError(`response is missing required keys: ${missing.join(", ")}`);
    }
  }

  withUpdates(updates) {
    const updatesMap = updates instanceof Map ? updates : new Map(Object.entries(updates));
    const recordsByKey = this.byKey();
    const missing = [...updatesMap.keys()].filter((key) => !recordsByKey.has(key)).sort();
    if (missing.length > 0) {
      throw new ConfigFormatError(`cannot update missing keys: ${missing.join(", ")}`);
    }

    const parts = [];
    let cursor = 0;
    for (const record of [...this.records].sort((left, right) => left.valueStart - right.valueStart)) {
      if (!updatesMap.has(record.key)) continue;
      parts.push(this.raw.slice(cursor, record.valueStart));
      parts.push(toBytes(updatesMap.get(record.key)));
      cursor = record.valueEnd;
    }
    parts.push(this.raw.slice(cursor));

    return parseAP510Config(concatBytes(parts), { profile: this.profile });
  }

  toJSON() {
    return {
      firmware: this.firmware(),
      profile: this.profile.identifier,
      profile_hardware_tested: this.profile.hardwareTested,
      raw_size: this.raw.length,
      records: this.records.map((record) => record.toJSON()),
    };
  }
}

export function parseAP510Config(input, { profile = null } = {}) {
  const raw = toBytes(input);
  const scannedRecords = findRecords(raw);
  if (scannedRecords.length === 0) {
    throw new ConfigFormatError("input contains no AP510 NN=value records");
  }

  const seen = new Set();
  const duplicates = new Set();
  for (const record of scannedRecords) {
    if (seen.has(record.key)) duplicates.add(record.key);
    seen.add(record.key);
  }
  if (duplicates.size > 0) {
    throw new ConfigFormatError(`input contains duplicate keys: ${[...duplicates].sort().join(", ")}`);
  }

  const firmwareRecord = scannedRecords.find((record) => record.key === "00");
  const firmware = firmwareRecord ? latin1(firmwareRecord.value).trim() : null;
  const selectedProfile = profile ?? selectProfile(firmware);
  const records = scannedRecords.map(
    (record) =>
      new ConfigRecord({
        key: record.key,
        value: record.value,
        keyStart: record.keyStart,
        valueStart: record.valueStart,
        valueEnd: record.valueEnd,
        lineStart: record.lineStart,
        lineEnd: record.lineEnd,
        definition: selectedProfile.fields.get(record.key) ?? null,
      }),
  );

  return new AP510Config(raw, records, selectedProfile);
}

export function diffConfigs(before, after) {
  const oldRecords = before.byKey();
  const newRecords = after.byKey();
  const keys = [...new Set([...oldRecords.keys(), ...newRecords.keys()])].sort();
  const lines = [];

  for (const key of keys) {
    const oldRecord = oldRecords.get(key);
    const newRecord = newRecords.get(key);
    if (oldRecord && newRecord && bytesEqual(oldRecord.value, newRecord.value)) continue;
    if (oldRecord) lines.push(`- ${key}=${oldRecord.displayValue}`);
    if (newRecord) lines.push(`+ ${key}=${newRecord.displayValue}`);
  }

  return lines;
}

function findRecords(raw) {
  const records = [];
  let cursor = 0;

  while (cursor <= raw.length - 3) {
    const atLineStart = cursor === 0 || raw[cursor - 1] === ASCII_LF;
    if (!atLineStart || !isDigit(raw[cursor]) || !isDigit(raw[cursor + 1]) || raw[cursor + 2] !== ASCII_EQUALS) {
      cursor += 1;
      continue;
    }

    const valueStart = cursor + 3;
    let lineFeed = valueStart;
    while (lineFeed < raw.length && raw[lineFeed] !== ASCII_LF) {
      lineFeed += 1;
    }

    const valueEnd = lineFeed > valueStart && raw[lineFeed - 1] === ASCII_CR ? lineFeed - 1 : lineFeed;
    const lineEnd = lineFeed < raw.length ? lineFeed + 1 : lineFeed;

    const key = String.fromCharCode(raw[cursor], raw[cursor + 1]);
    records.push({ key, value: raw.slice(valueStart, valueEnd), keyStart: cursor, valueStart, valueEnd, lineStart: cursor, lineEnd });
    cursor = lineEnd;
  }

  return records;
}

function isDigit(byte) {
  return byte >= ASCII_ZERO && byte <= ASCII_NINE;
}

function endsWithCompleteNumberedRecord(raw) {
  if (raw.length < 4) return false;

  let lineStart = raw.length - 1;
  if (raw[lineStart] === ASCII_LF) lineStart -= 1;
  if (lineStart >= 0 && raw[lineStart] === ASCII_CR) lineStart -= 1;
  while (lineStart >= 0 && raw[lineStart] !== ASCII_LF) lineStart -= 1;
  lineStart += 1;

  return (
    lineStart <= raw.length - 4 &&
    isDigit(raw[lineStart]) &&
    isDigit(raw[lineStart + 1]) &&
    raw[lineStart + 2] === ASCII_EQUALS &&
    raw.at(-1) === ASCII_LF
  );
}
