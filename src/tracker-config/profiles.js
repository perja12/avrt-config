import { ascii, escapeBytes, latin1 } from "./bytes.js";

function decodeAscii(value) {
  return ascii(value);
}

function decodeFirmware(value) {
  return latin1(value).trim();
}

function decodeLatin1(value) {
  return latin1(value);
}

function enumDecoder(values) {
  return (value) => {
    const text = ascii(value);
    if (text === null) return null;
    return values[text] ?? { raw: text };
  };
}

function decodeFixedDecimal(value, widths, names) {
  const text = ascii(value);
  if (text === null || text.length !== widths.reduce((sum, width) => sum + width, 0) || !/^\d+$/.test(text)) {
    return null;
  }

  const decoded = {};
  let offset = 0;
  for (let index = 0; index < widths.length; index += 1) {
    decoded[names[index]] = Number.parseInt(text.slice(offset, offset + widths[index]), 10);
    offset += widths[index];
  }
  return decoded;
}

function decodeOptionalDecimal(value) {
  if (value.length > 0 && value.every((byte) => byte === 0xff)) return null;
  const text = ascii(value);
  return text !== null && /^\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

function isDecimalOrFf(value) {
  if (value.length === 0) return false;
  if (value.every((byte) => byte === 0xff)) return true;
  const text = ascii(value);
  return text !== null && /^\d+$/.test(text);
}

function decodeOptionalDecimalBytes(value, widths, names) {
  if (value.length !== widths.reduce((sum, width) => sum + width, 0)) return null;

  const decoded = {};
  let offset = 0;
  for (let index = 0; index < widths.length; index += 1) {
    const chunk = value.slice(offset, offset + widths[index]);
    if (!isDecimalOrFf(chunk)) return null;
    decoded[names[index]] = decodeOptionalDecimal(chunk);
    offset += widths[index];
  }
  return decoded;
}

function decodeSmartBeaconing(value) {
  return decodeFixedDecimal(
    value,
    [3, 4, 3, 3, 3, 3, 3],
    [
      "low_speed_kmh",
      "slow_rate_seconds",
      "high_speed_kmh",
      "fast_rate_seconds",
      "turn_slope",
      "turn_angle",
      "turn_time_seconds",
    ],
  );
}

function decodeVirtualGps(value) {
  if (value.length === 0) return null;
  const enabled = decodeOptionalDecimal(value.slice(0, 1));
  const packetBytes = value.slice(1);
  const packet = packetBytes.length > 0 && packetBytes.every((byte) => byte === 0xff) ? null : latin1(packetBytes);
  return { enabled: enabled === null ? null : Boolean(enabled), packet };
}

function decodeField28(value) {
  return decodeOptionalDecimalBytes(
    value,
    [1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1],
    [
      "mice_message",
      "voltage",
      "temperature",
      "tf_error_marker",
      "squelch",
      "blue_led",
      "telemetry",
      "telemetry_every",
      "timeslot_enabled",
      "timeslot_second",
      "dcd",
      "tf_format",
      "low_led",
    ],
  );
}

function decodeField29(value) {
  if (value.length !== 15) return null;
  return {
    auto_power_enabled: decodeOptionalDecimal(value.slice(0, 1)),
    auto_off_delay_seconds: decodeOptionalDecimal(value.slice(1, 6)),
    auto_off_delay_raw: escapeBytes(value.slice(1, 6)),
    emergency_symbol_table: latin1(value.slice(6, 8)),
    above_high_speed_symbol_table: latin1(value.slice(8, 10)),
    moving_symbol_table: latin1(value.slice(10, 12)),
    parked_symbol_table: latin1(value.slice(12, 14)),
    mice_emergency_message: decodeOptionalDecimal(value.slice(14, 15)),
  };
}

function decodeField31(value) {
  if (value.length !== 9) return null;
  const chunks = [value.slice(0, 4), value.slice(4, 8), value.slice(8, 9)];
  if (!chunks.every(isDecimalOrFf)) return null;

  const unit = decodeOptionalDecimal(value.slice(8, 9));
  return {
    tf_interval_seconds: decodeOptionalDecimal(value.slice(0, 4)),
    digipeater_delay_ms: decodeOptionalDecimal(value.slice(4, 8)),
    temperature_unit: unit === null ? null : { 0: "C", 1: "F" }[unit],
  };
}

function field(name, decoder = decodeAscii, options = {}) {
  return { name, decoder, ...options };
}

const PTT_DELAY = {
  1: "60 ms",
  2: "120 ms",
  3: "180 ms",
  4: "300 ms",
  5: "480 ms",
  6: "600 ms",
  7: "1000 ms",
};
const DECODE_OUTPUT = { 1: "KISS", 2: "waypoint", 3: "UI" };
const ON_OFF = { 0: "off", 1: "on" };
const PATH_PRESET = {
  0: "none",
  1: "WIDE1-1",
  2: "WIDE1-1,WIDE2-1",
  3: "WIDE1-1,WIDE2-2",
  4: "TEMP1-1",
  5: "TEMP1-1,WIDE2-1",
  6: "WIDE2-1",
};
const TRANSMIT_MODE = {
  1: "manual",
  2: "auto",
  3: "manual+auto",
  4: "smart",
  5: "smart+manual",
};

const lateFields = new Map([
  ["00", field("firmware", decodeFirmware, { readonly: true })],
  ["01", field("callsign_ssid")],
  ["02", field("ptt_delay", enumDecoder(PTT_DELAY))],
  ["03", field("decode_output", enumDecoder(DECODE_OUTPUT))],
  ["04", field("mice_enabled", enumDecoder(ON_OFF), { boolean: true })],
  ["05", field("legacy_path_preset", enumDecoder(PATH_PRESET))],
  ["06", field("fixed_symbol_table")],
  ["07", field("transmit_mode", enumDecoder(TRANSMIT_MODE))],
  ["08", field("beacon_interval_seconds")],
  ["09", field("status_text", decodeLatin1, { textLimit: 48 })],
  ["10", field("comment_text", decodeLatin1, { textLimit: 48 })],
  ["12", field("digipeater")],
  ["13", field("automatic_power_off", enumDecoder(ON_OFF), { boolean: true })],
  ["14", field("china_map_offset")],
  ["15", field("virtual_gps", decodeVirtualGps)],
  ["16", field("frequency_mhz")],
  ["17", field("beep", enumDecoder(ON_OFF), { boolean: true })],
  ["18", field("smart_beaconing", decodeSmartBeaconing)],
  ["19", field("high_altitude", enumDecoder(ON_OFF), { boolean: true })],
  ["20", field("busy_wait_free", enumDecoder(ON_OFF), { boolean: true })],
  ["21", field("tx_volume")],
  ["22", field("rx_volume")],
  ["23", field("tx_power", enumDecoder({ 0: "0.5 W", 1: "1 W" }))],
  ["24", field("tx_serial_ui_out", enumDecoder(ON_OFF), { boolean: true })],
  ["25", field("path_1")],
  ["26", field("path_2")],
  ["27", field("path_3")],
  ["28", field("feature_flags", decodeField28)],
  ["29", field("auto_power_and_symbols", decodeField29)],
  ["30", field("emergency_text", decodeLatin1, { textLimit: 31 })],
  ["31", field("tf_digipeater_temperature", decodeField31)],
]);

const profiles = [
  {
    identifier: "avrt5-20210404",
    description: "AVRT5 final firmware (hardware verified)",
    firmwarePattern: /^AVRT5\s+20210404$/i,
    hardwareTested: true,
    fields: lateFields,
    requiredCaptureKeys: new Set([...lateFields.keys()].filter((key) => key !== "05")),
    terminalCaptureKeys: new Set(["31"]),
  },
  {
    identifier: "avrt5-20200605",
    description: "AVRT5 firmware (hardware verified)",
    firmwarePattern: /^AVRT5\s+20200605$/i,
    hardwareTested: true,
    fields: lateFields,
    requiredCaptureKeys: new Set([...lateFields.keys()].filter((key) => key !== "05")),
    terminalCaptureKeys: new Set(["31"]),
  },
  {
    identifier: "avrt5-2014",
    description: "early AVRT5 layout (protocol implemented, hardware unverified)",
    firmwarePattern: /^AVRT5\s+2014\d{4}$/i,
    hardwareTested: false,
    fields: lateFields,
    requiredCaptureKeys: new Set(),
    terminalCaptureKeys: new Set(["29"]),
  },
];

const documentedNumberedProfile = {
  identifier: "documented-numbered",
  description: "documented numbered-record layout (not hardware verified for this firmware)",
  hardwareTested: false,
  fields: lateFields,
  requiredCaptureKeys: new Set(),
  terminalCaptureKeys: new Set(["31"]),
};

export function selectProfile(firmware) {
  return profiles.find((profile) => firmware !== null && profile.firmwarePattern.test(firmware)) ?? documentedNumberedProfile;
}
