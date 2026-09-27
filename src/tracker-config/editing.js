import { assertValidTrackerConfigDTO } from "./schema.js";
import { latin1 } from "./bytes.js";
import { formatFixedPositionPacket } from "./virtual-gps.js";

export function applyDigipeaterSelector(dto, selector, schema) {
  const result = structuredClone(dto);
  result.digipeater ??= {};
  result.digipeater.selector = selector;
  result.digipeater.enabled = selector !== "01";
  result.digipeater.alias = selector === "01" ? null : selector;
  if (result.digipeater.enabled) {
    result.digipeater.forwardDelayMs ??= schema?.fields?.["digipeater.forwardDelayMs"]?.defaultWhenEnabled ?? 800;
  }
  return result;
}

export function encodeTrackerConfigDTO(baseConfig, dto) {
  assertValidTrackerConfigDTO(dto);

  const records = baseConfig.byKey();
  const updates = new Map([
    ["01", encodeCallsign(dto.identity?.callsign, dto.identity?.ssid)],
    ["03", encodeEnum(dto.decodeOutput, { KISS: "1", waypoint: "2", UI: "3" })],
    ["04", encodeBoolean(dto.micE?.enabled, "MIC-E")],
    ["06", encodeSymbolPair(dto.transmission?.fixedSymbol, "fixed APRS symbol")],
    ["09", encodeLatin1(dto.text?.status ?? "", "status")],
    ["10", encodeLatin1(dto.text?.comment ?? "", "comment")],
    ["25", encodePath(dto.paths?.digipeaterPaths?.[0])],
    ["26", encodePath(dto.paths?.digipeaterPaths?.[1])],
    ["27", encodePath(dto.paths?.digipeaterPaths?.[2])],
    ["12", encodeDigipeater(dto.digipeater)],
    ["13", encodeBoolean(dto.power?.automaticPowerOff, "90-minute power off")],
    ["14", encodeChinaMapOffset(records.get("14")?.value, dto.chinaMapOffset)],
    ["02", encodeEnum(dto.transmission?.pttDelayMs, { 60: "1", 120: "2", 180: "3", 300: "4", 480: "5", 600: "6", 1000: "7" })],
    ["07", encodeEnum(dto.transmission?.mode, { manual: "1", auto: "2", "manual+auto": "3", smart: "4", "smart+manual": "5" })],
    ["08", encodePaddedNumber(dto.transmission?.beaconIntervalSeconds, 4, "beacon interval")],
    ["16", encodeFrequency(dto.transmission?.frequencyMHz)],
    ["17", encodeBoolean(dto.features?.beep, "beep")],
    ["19", encodeBoolean(dto.features?.highAltitude, "high altitude")],
    ["20", encodeBoolean(dto.features?.busyWaitFree, "busy wait free")],
    ["21", encodeNumber(dto.transmission?.txVolume, 1, 6, "TX volume")],
    ["22", encodeNumber(dto.transmission?.rxVolume, 1, 9, "RX volume")],
    ["23", encodeEnum(dto.transmission?.txPowerWatts, { 0.5: "0", 1: "1" })],
    ["24", encodeBoolean(dto.features?.txSerialUiOutput, "TX serial UI output")],
    ["18", encodeSmartBeaconing(records.get("18")?.value, dto.smartBeaconing)],
    ["28", encodeFeatureFlags(records.get("28")?.value, dto)],
    ["15", encodeVirtualGps(records.get("15")?.value, dto.gps?.virtual)],
    ["30", encodeLatin1(dto.text?.emergency ?? "", "emergency")],
    ["29", encodeField29(records.get("29")?.value, dto)],
  ]);

  updates.set("31", encodeField31(records.get("31")?.value, dto));

  return baseConfig.withUpdates(updates);
}

function encodeCallsign(callsign, ssid) {
  if (typeof callsign !== "string" || !/^[A-Z0-9]{1,6}$/.test(callsign)) throw new TypeError("callsign must contain 1-6 uppercase letters or digits");
  const normalizedSsid = ssid === null || ssid === undefined ? 0 : ssid;
  if (!Number.isInteger(normalizedSsid) || normalizedSsid < 0 || normalizedSsid > 15) throw new RangeError("SSID must be between 0 and 15");
  const call = normalizedSsid < 10 ? callsign.padEnd(6, " ") : callsign;
  return ascii(`${call}${normalizedSsid}`);
}

function encodeDigipeater(digipeater = {}) {
  if (/^(?:01|1[1-5])$/.test(digipeater.selector ?? "")) return ascii(digipeater.selector);
  if (!digipeater.enabled) return ascii("01");
  if (!/^1[1-5]$/.test(digipeater.alias ?? "")) throw new RangeError("digipeater alias must be one of 11 through 15 when enabled");
  return ascii(digipeater.alias);
}

function encodePath(path) {
  if (path === null || path === undefined || path === "") return ascii("0      ");
  if (typeof path !== "string") throw new TypeError("APRS path must be text");
  const match = path.match(/^([A-Z0-9]{1,6})-([0-9])$/);
  if (!match) throw new TypeError("APRS path components must look like WIDE1-1");
  return ascii(`${match[1].padEnd(6, " ")}${match[2]}`);
}

function encodeSymbolPair(symbol, label) {
  const table = symbol?.table;
  const code = symbol?.code;
  if (typeof table !== "string" || [...table].length !== 1 || typeof code !== "string" || [...code].length !== 1) {
    throw new TypeError(`${label} must contain one table character and one symbol character`);
  }
  return encodeLatin1(`${code}${table}`, label);
}

function encodeChinaMapOffset(original, mapOffset = {}) {
  const complete = typeof mapOffset.enabled === "boolean"
    && Number.isInteger(mapOffset.longitudeOffset)
    && Number.isInteger(mapOffset.latitudeOffset);
  if (!complete) {
    if (!(original instanceof Uint8Array)) throw new TypeError("record 14 is required to update the China map offset");
    return original.slice();
  }
  const encodeOffset = (value, label) => {
    if (!Number.isInteger(value) || value < -45 || value > 45) throw new RangeError(`${label} must be between -45 and 45`);
    return String.fromCharCode(0x50 + value);
  };
  return encodeLatin1(
    `${mapOffset.enabled ? "1" : "0"}${encodeOffset(mapOffset.longitudeOffset, "longitude offset")}${encodeOffset(mapOffset.latitudeOffset, "latitude offset")}`,
    "China map offset",
  );
}

function encodeField31(original, dto) {
  if (!(original instanceof Uint8Array) || original.length !== 9) throw new TypeError("record 31 is required to update digipeater delay");
  const result = original.slice();
  if (dto.tfCard?.writeIntervalSeconds !== null && dto.tfCard?.writeIntervalSeconds !== undefined) {
    result.set(ascii(String(dto.tfCard.writeIntervalSeconds).padStart(4, "0")), 0);
  }
  if (dto.digipeater?.forwardDelayMs !== null && dto.digipeater?.forwardDelayMs !== undefined) {
    result.set(ascii(String(dto.digipeater.forwardDelayMs).padStart(4, "0")), 4);
  }
  if (dto.temperatureUnit !== null && dto.temperatureUnit !== undefined) result[8] = dto.temperatureUnit === "C" ? 0x30 : 0x31;
  return result;
}

function encodeEnum(value, values) {
  const encoded = values[value];
  if (encoded === undefined) throw new RangeError(`unsupported configuration value: ${value}`);
  return ascii(encoded);
}

function encodeBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be enabled or disabled`);
  return ascii(value ? "1" : "0");
}

function encodePaddedNumber(value, width, label) {
  if (!Number.isInteger(value) || value < 0 || value >= 10 ** width) throw new RangeError(`${label} must fit in ${width} digits`);
  return ascii(String(value).padStart(width, "0"));
}

function encodeNumber(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${label} must be between ${min} and ${max}`);
  return ascii(String(value));
}

function encodeFrequency(value) {
  if (typeof value !== "number" || value < 136 || value > 174) throw new RangeError("frequency must be between 136 and 174 MHz");
  return ascii(value.toFixed(4).padStart(8, "0"));
}

function encodeSmartBeaconing(original, smart) {
  if (!(original instanceof Uint8Array) || original.length !== 22) throw new TypeError("record 18 is required to update Smart Beaconing");
  const result = latin1(original);
  const values = [smart?.lowSpeedKmh, smart?.slowRateSeconds, smart?.highSpeedKmh, smart?.fastRateSeconds, smart?.turnSlope, smart?.turnAngleDegrees, smart?.turnTimeSeconds];
  const widths = [3, 4, 3, 3, 3, 3, 3];
  let offset = 0;
  const output = [...result];
  for (let index = 0; index < widths.length; index += 1) {
    const value = values[index];
    if (value !== null && value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value >= 10 ** widths[index]) throw new RangeError("Smart Beaconing values do not fit their wire fields");
      output.splice(offset, widths[index], ...String(value).padStart(widths[index], "0"));
    }
    offset += widths[index];
  }
  return ascii(output.join(""));
}

function encodeFeatureFlags(original, dto) {
  if (!(original instanceof Uint8Array) || original.length !== 15) throw new TypeError("record 28 is required to update feature settings");
  const output = latin1(original).split("");
  const set = (offset, width, value) => {
    if (value !== null && value !== undefined) output.splice(offset, width, ...String(value).padStart(width, "0"));
  };
  set(0, 1, dto.micE?.messageType);
  set(1, 1, booleanDigit(dto.audioAndRadio?.voltageInComment));
  set(2, 1, booleanDigit(dto.audioAndRadio?.temperatureInComment));
  set(3, 1, booleanDigit(dto.audioAndRadio?.tfStateInComment));
  set(4, 1, dto.audioAndRadio?.squelch);
  set(5, 1, booleanDigit(dto.audioAndRadio?.blueLed));
  set(6, 1, booleanDigit(dto.telemetry?.enabled));
  set(7, 2, dto.telemetry?.everyPositionPackets);
  set(9, 1, booleanDigit(dto.timeslot?.enabled));
  set(10, 2, dto.timeslot?.second);
  set(12, 1, booleanDigit(dto.audioAndRadio?.dcd));
  set(13, 1, dto.tfCard?.format === "gpx" ? 0 : dto.tfCard?.format === "kml" ? 1 : null);
  set(14, 1, booleanDigit(dto.audioAndRadio?.lowLed));
  return ascii(output.join(""));
}

function encodeField29(original, dto) {
  if (!(original instanceof Uint8Array) || original.length !== 15) throw new TypeError("record 29 is required to update automatic power and APRS symbols");
  const output = original.slice();
  const set = (offset, value) => {
    if (value !== null && value !== undefined) output.set(value, offset);
  };
  if (dto.power?.autoOnOffEnabled !== null && dto.power?.autoOnOffEnabled !== undefined) {
    output[0] = dto.power.autoOnOffEnabled ? 0x31 : 0x30;
  }
  if (dto.power?.autoOffDelaySeconds !== null && dto.power?.autoOffDelaySeconds !== undefined) {
    set(1, encodePaddedNumber(dto.power.autoOffDelaySeconds, 5, "auto-off delay"));
  }
  set(6, encodeSymbolPair(dto.symbols?.emergency, "emergency APRS symbol"));
  set(8, encodeSymbolPair(dto.symbols?.aboveHighSpeed, "high-speed APRS symbol"));
  set(10, encodeSymbolPair(dto.symbols?.moving, "moving APRS symbol"));
  set(12, encodeSymbolPair(dto.symbols?.parked, "parked APRS symbol"));
  if (dto.micE?.emergencyMessage !== null && dto.micE?.emergencyMessage !== undefined) {
    output[14] = encodeNumber(dto.micE.emergencyMessage, 0, 7, "MIC-E emergency type")[0];
  }
  return output;
}

function booleanDigit(value) {
  return value === null || value === undefined ? null : value ? 1 : 0;
}

function encodeVirtualGps(original, virtual) {
  if (!(original instanceof Uint8Array) || original.length === 0) throw new TypeError("record 15 is required to update Virtual GPS");
  const enabled = virtual?.enabled === null || virtual?.enabled === undefined ? original.slice(0, 1) : ascii(virtual.enabled ? "1" : "0");
  const generatedPacket = formatFixedPositionPacket(virtual);
  const hasStructuredValues = virtual?.position !== null && virtual?.position !== undefined
    || virtual?.symbol !== null && virtual?.symbol !== undefined
    || virtual?.phg !== null && virtual?.phg !== undefined;
  if (hasStructuredValues && generatedPacket === null) throw new TypeError("structured Virtual GPS fields are incomplete or invalid");
  const packetValue = generatedPacket ?? virtual?.packet;
  const packet = packetValue === null || packetValue === undefined ? original.slice(1) : encodeLatin1(packetValue, "Virtual GPS packet");
  const result = new Uint8Array(enabled.length + packet.length);
  result.set(enabled, 0);
  result.set(packet, enabled.length);
  return result;
}

function encodeLatin1(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be text`);
  if (value.includes("\r") || value.includes("\n") || value.includes("\0")) throw new TypeError(`${label} may not contain CR, LF, or NUL`);
  return Uint8Array.from([...value], (character) => {
    const code = character.codePointAt(0);
    if (code > 0xff) throw new TypeError(`${label} contains a character outside Latin-1`);
    return code;
  });
}

function ascii(value) {
  return encodeLatin1(value, "configuration value");
}
