const FIXED_POSITION_PATTERN = /^!(\d{2})(\d{2}\.\d{2})([NS])([/\\0-9A-Za-z])(\d{3})(\d{2}\.\d{2})([EW])([!-~])(?:PHG(\d)(\d)(\d)(\d))?$/;

export const PHG_POWER_WATTS = Array.from({ length: 10 }, (_, code) => code ** 2);
export const PHG_HEIGHT_FEET = Array.from({ length: 10 }, (_, code) => 10 * (2 ** code));
export const PHG_GAIN_DB = Array.from({ length: 10 }, (_, code) => code);
export const PHG_DIRECTIVITY_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315, 360];

export function expandVirtualGps(value) {
  if (!value) return null;
  const parsed = parseFixedPositionPacket(value.packet);
  return {
    enabled: value.enabled,
    packet: value.packet,
    position: parsed?.position ?? null,
    symbol: parsed?.symbol ?? null,
    phg: parsed?.phg ?? null,
    advancedRawPacket: parsed || value.packet === null ? null : value.packet,
  };
}

export function parseFixedPositionPacket(packet) {
  if (typeof packet !== "string") return null;
  const match = packet.match(FIXED_POSITION_PATTERN);
  if (!match) return null;

  const latitude = decodeCoordinate(Number(match[1]), Number(match[2]), match[3], 90);
  const longitude = decodeCoordinate(Number(match[5]), Number(match[6]), match[7], 180);
  if (latitude === null || longitude === null || match[12] === "9") return null;

  return {
    position: { latitude, longitude },
    symbol: { table: match[4], code: match[8] },
    phg: match[9] === undefined ? null : {
      powerWatts: Number(match[9]) ** 2,
      heightFeet: 10 * (2 ** Number(match[10])),
      gainDb: Number(match[11]),
      directivityDegrees: Number(match[12]) * 45,
    },
  };
}

export function formatFixedPositionPacket(virtual) {
  const hasStructuredValues = virtual?.position !== null && virtual?.position !== undefined
    || virtual?.symbol !== null && virtual?.symbol !== undefined
    || virtual?.phg !== null && virtual?.phg !== undefined;
  if (!hasStructuredValues && typeof virtual?.advancedRawPacket === "string" && virtual.advancedRawPacket !== "") return virtual.advancedRawPacket;

  const latitude = formatCoordinate(virtual?.position?.latitude, 2, "N", "S", 90);
  const longitude = formatCoordinate(virtual?.position?.longitude, 3, "E", "W", 180);
  const table = virtual?.symbol?.table;
  const code = virtual?.symbol?.code;
  if (latitude === null || longitude === null || typeof table !== "string" || [...table].length !== 1 || typeof code !== "string" || [...code].length !== 1) return null;

  const phg = formatPhg(virtual?.phg);
  if (phg === undefined) return null;
  return `!${latitude}${table}${longitude}${code}${phg}`;
}

// An unrecognized packet is kept as an advanced/raw value until the user edits
// one of the structured fields. At that point the raw value must no longer
// take precedence over the structured representation.
export function clearAdvancedRawPacket(virtual) {
  if (!virtual || typeof virtual !== "object" || virtual.advancedRawPacket === null || virtual.advancedRawPacket === undefined) return virtual;
  return { ...virtual, advancedRawPacket: null };
}

function decodeCoordinate(degrees, minutes, hemisphere, maximumDegrees) {
  if (degrees > maximumDegrees || minutes >= 60 || (degrees === maximumDegrees && minutes !== 0)) return null;
  const value = degrees + minutes / 60;
  return hemisphere === "S" || hemisphere === "W" ? -value : value;
}

function formatCoordinate(value, degreeWidth, positiveHemisphere, negativeHemisphere, maximumDegrees) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -maximumDegrees || value > maximumDegrees) return null;
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = Math.round((absolute - degrees) * 6000) / 100;
  if (minutes === 60) {
    degrees += 1;
    minutes = 0;
  }
  if (degrees > maximumDegrees || (degrees === maximumDegrees && minutes !== 0)) return null;
  const hemisphere = value < 0 ? negativeHemisphere : positiveHemisphere;
  return `${String(degrees).padStart(degreeWidth, "0")}${minutes.toFixed(2).padStart(5, "0")}${hemisphere}`;
}

function formatPhg(phg) {
  const values = [phg?.powerWatts, phg?.heightFeet, phg?.gainDb, phg?.directivityDegrees];
  if (values.every((value) => value === null || value === undefined)) return "";
  if (values.some((value) => value === null || value === undefined)) return undefined;
  const power = PHG_POWER_WATTS.indexOf(phg.powerWatts);
  const height = PHG_HEIGHT_FEET.indexOf(phg.heightFeet);
  const gain = PHG_GAIN_DB.indexOf(phg.gainDb);
  const directivity = PHG_DIRECTIVITY_DEGREES.indexOf(phg.directivityDegrees);
  if ([power, height, gain, directivity].some((value) => value < 0)) return undefined;
  return `PHG${power}${height}${gain}${directivity}`;
}
