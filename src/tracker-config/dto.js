import { parseAP510Config } from "./core.js";
import { encodeTrackerConfigDTO } from "./editing.js";
import { assertValidTrackerConfigDTO, getTrackerConfigSchema, validateTrackerConfigDTO } from "./schema.js";
import { expandVirtualGps } from "./virtual-gps.js";

export class TrackerConfig {
  constructor(rawConfig) {
    this.rawConfig = rawConfig;
    this.dto = buildTrackerConfigDto(rawConfig);
  }

  get metadata() {
    return this.dto.metadata;
  }

  get firmware() {
    return this.dto.firmware;
  }

  get identity() {
    return this.dto.identity;
  }

  get decodeOutput() {
    return this.dto.decodeOutput;
  }

  get transmission() {
    return this.dto.transmission;
  }

  get features() {
    return this.dto.features;
  }

  get text() {
    return this.dto.text;
  }

  get paths() {
    return this.dto.paths;
  }

  get smartBeaconing() {
    return this.dto.smartBeaconing;
  }

  get audioAndRadio() {
    return this.dto.audioAndRadio;
  }

  get timeslot() {
    return this.dto.timeslot;
  }

  get telemetry() {
    return this.dto.telemetry;
  }

  get tfCard() {
    return this.dto.tfCard;
  }

  get power() {
    return this.dto.power;
  }

  get gps() {
    return this.dto.gps;
  }

  get symbols() {
    return this.dto.symbols;
  }

  get digipeater() {
    return this.dto.digipeater;
  }

  get micE() {
    return this.dto.micE;
  }

  get temperatureUnit() {
    return this.dto.temperatureUnit;
  }

  get chinaMapOffset() {
    return this.dto.chinaMapOffset;
  }

  toDTO() {
    return structuredClone(this.dto);
  }

  toDebugJSON() {
    return this.rawConfig.toJSON();
  }

  schema() {
    return getTrackerConfigSchema();
  }

  validateDTO(dto = this.dto) {
    return validateTrackerConfigDTO(dto);
  }

  assertValidDTO(dto = this.dto) {
    return assertValidTrackerConfigDTO(dto);
  }

  withDTO(dto) {
    return new TrackerConfig(encodeTrackerConfigDTO(this.rawConfig, dto));
  }

  validateSerialCapture() {
    this.rawConfig.validateSerialCapture();
  }
}

export function parseTrackerConfig(input, options = {}) {
  return new TrackerConfig(parseAP510Config(input, options));
}

function buildTrackerConfigDto(rawConfig) {
  const records = rawConfig.byKey();
  const featureFlags = decoded(records, "28") ?? {};
  const autoPowerAndSymbols = decoded(records, "29") ?? {};
  const tfDigiTemp = decoded(records, "31") ?? {};

  return {
    metadata: {
      profile: rawConfig.profile.identifier,
      hardwareTested: rawConfig.profile.hardwareTested,
      rawSize: rawConfig.raw.length,
      recordCount: rawConfig.records.length,
    },
    firmware: parseFirmware(rawConfig.firmware()),
    identity: parseCallsignSsid(display(records, "01")),
    decodeOutput: decoded(records, "03"),
    transmission: {
      mode: decoded(records, "07"),
      pttDelayMs: parseMilliseconds(decoded(records, "02")),
      beaconIntervalSeconds: parsePaddedInteger(display(records, "08")),
      frequencyMHz: parseDecimal(display(records, "16")),
      txPowerWatts: parseWatts(decoded(records, "23")),
      txVolume: parseInteger(display(records, "21")),
      rxVolume: parseInteger(display(records, "22")),
      fixedSymbol: parseSymbolPair(decoded(records, "06")),
    },
    micE: {
      enabled: onOffToBoolean(decoded(records, "04")),
      messageType: featureFlags.mice_message ?? null,
      emergencyMessage: autoPowerAndSymbols.mice_emergency_message ?? null,
    },
    text: {
      status: decoded(records, "09"),
      comment: decoded(records, "10"),
      emergency: decoded(records, "30"),
    },
    paths: {
      legacyPreset: decoded(records, "05"),
      digipeaterPaths: [parsePath(display(records, "25")), parsePath(display(records, "26")), parsePath(display(records, "27"))],
    },
    digipeater: {
      selector: display(records, "12"),
      enabled: parseDigipeaterEnabled(display(records, "12")),
      alias: parseDigipeaterAlias(display(records, "12")),
      forwardDelayMs: tfDigiTemp.digipeater_delay_ms ?? null,
    },
    smartBeaconing: camelizeSmartBeaconing(decoded(records, "18")),
    power: {
      automaticPowerOff: onOffToBoolean(decoded(records, "13")),
      autoOnOffEnabled: numberToBoolean(autoPowerAndSymbols.auto_power_enabled),
      autoOffDelaySeconds: autoPowerAndSymbols.auto_off_delay_seconds ?? null,
    },
    gps: {
      virtual: expandVirtualGps(decoded(records, "15")),
    },
    features: {
      highAltitude: onOffToBoolean(decoded(records, "19")),
      busyWaitFree: onOffToBoolean(decoded(records, "20")),
      beep: onOffToBoolean(decoded(records, "17")),
      txSerialUiOutput: onOffToBoolean(decoded(records, "24")),
    },
    audioAndRadio: {
      squelch: featureFlags.squelch ?? null,
      dcd: numberToBoolean(featureFlags.dcd),
      voltageInComment: numberToBoolean(featureFlags.voltage),
      temperatureInComment: numberToBoolean(featureFlags.temperature),
      tfStateInComment: numberToBoolean(featureFlags.tf_error_marker),
      blueLed: numberToBoolean(featureFlags.blue_led),
      lowLed: numberToBoolean(featureFlags.low_led),
    },
    telemetry: {
      enabled: numberToBoolean(featureFlags.telemetry),
      everyPositionPackets: featureFlags.telemetry_every ?? null,
    },
    timeslot: {
      enabled: numberToBoolean(featureFlags.timeslot_enabled),
      second: featureFlags.timeslot_second ?? null,
    },
    tfCard: {
      format: featureFlags.tf_format === null || featureFlags.tf_format === undefined ? null : { 0: "gpx", 1: "kml" }[featureFlags.tf_format] ?? String(featureFlags.tf_format),
      writeIntervalSeconds: tfDigiTemp.tf_interval_seconds ?? null,
    },
    temperatureUnit: tfDigiTemp.temperature_unit ?? null,
    symbols: {
      emergency: parseSymbolPair(autoPowerAndSymbols.emergency_symbol_table),
      aboveHighSpeed: parseSymbolPair(autoPowerAndSymbols.above_high_speed_symbol_table),
      moving: parseSymbolPair(autoPowerAndSymbols.moving_symbol_table),
      parked: parseSymbolPair(autoPowerAndSymbols.parked_symbol_table),
    },
    chinaMapOffset: parseChinaMapOffset(decoded(records, "14")),
  };
}

function decoded(records, key) {
  return records.get(key)?.decoded() ?? null;
}

function display(records, key) {
  return records.get(key)?.displayValue ?? null;
}

function parseFirmware(value) {
  if (value === null) return { model: null, version: null, raw: null };
  const match = value.match(/^(\S+)\s+(.+)$/);
  return {
    model: match ? match[1] : value,
    version: match ? match[2] : null,
    raw: value,
  };
}

function parseCallsignSsid(value) {
  if (value === null) return { callsign: null, ssid: null, raw: null };
  const normalized = value.trim().toUpperCase();
  const paddedMatch = normalized.match(/^([A-Z0-9]{1,6}) +([0-9])$/);
  const compactTwoDigitMatch = normalized.match(/^([A-Z0-9]{1,6})(1[0-5])$/);
  const compactOneDigitMatch = normalized.match(/^([A-Z0-9]{1,6})([0-9])$/);
  const bareCallsignMatch = normalized.match(/^([A-Z0-9]{1,6})$/);
  const match = paddedMatch ?? compactTwoDigitMatch ?? compactOneDigitMatch ?? bareCallsignMatch;
  const callsign = match?.[1] ?? null;
  const ssid = match?.[2] === undefined ? null : Number.parseInt(match[2], 10);
  return {
    callsign,
    ssid,
    display: callsign === null ? null : ssid === null || ssid === 0 ? callsign : `${callsign}-${ssid}`,
    raw: value,
  };
}

function parseMilliseconds(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+)\s+ms$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseWatts(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d+(?:\.\d+)?)\s+W$/);
  return match ? Number.parseFloat(match[1]) : null;
}

function parsePaddedInteger(value) {
  return value !== null && /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

function parseInteger(value) {
  return value !== null && /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

function parseDecimal(value) {
  return value !== null && /^\d+(?:\.\d+)?$/.test(value) ? Number.parseFloat(value) : null;
}

function parseSymbolPair(value) {
  return typeof value === "string" && value.length === 2 ? { table: value[1], code: value[0] } : null;
}

function parseChinaMapOffset(value) {
  if (typeof value !== "string" || !/^[01]..$/s.test(value)) {
    return { enabled: null, longitudeOffset: null, latitudeOffset: null, raw: value };
  }
  const decodeOffset = (character) => {
    const offset = character.charCodeAt(0) - 0x50;
    return offset >= -45 && offset <= 45 ? offset : null;
  };
  return {
    enabled: value[0] === "1",
    longitudeOffset: decodeOffset(value[1]),
    latitudeOffset: decodeOffset(value[2]),
    raw: value,
  };
}

function parsePath(value) {
  if (value === null || value === "0" || value.trim() === "0") return null;
  const alias = value.slice(0, 6).trim();
  const hop = value.slice(6).trim();
  return alias && hop ? `${alias}-${hop}` : value;
}

function parseDigipeaterAlias(value) {
  if (value === null || value === "01") return null;
  return value;
}

function parseDigipeaterEnabled(value) {
  if (value === null) return null;
  return value !== "01";
}

function camelizeSmartBeaconing(value) {
  if (value === null) return null;
  return {
    lowSpeedKmh: value.low_speed_kmh,
    slowRateSeconds: value.slow_rate_seconds,
    highSpeedKmh: value.high_speed_kmh,
    fastRateSeconds: value.fast_rate_seconds,
    turnSlope: value.turn_slope,
    turnAngleDegrees: value.turn_angle,
    turnTimeSeconds: value.turn_time_seconds,
  };
}

function numberToBoolean(value) {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function onOffToBoolean(value) {
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}
