import { describe, expect, it } from "vitest";

import {
  assertValidTrackerConfigDTO,
  ConfigValidationError,
  getTrackerConfigSchema,
  validateTrackerConfigDTO,
} from "../src/tracker-config/index.js";

describe("Tracker configuration schema", () => {
  it("publishes serializable field rules for UI consumers", () => {
    const schema = getTrackerConfigSchema();

    expect(schema.version).toBe(1);
    expect(schema.fields["tfCard.format"]).toMatchObject({
      type: "select",
      options: [
        { value: "gpx", label: "GPX" },
        { value: "kml", label: "KML" },
      ],
    });
    expect(schema.fields["transmission.beaconIntervalSeconds"]).toMatchObject({
      type: "number",
      min: 1,
      max: 9999,
    });
    expect(schema.fields["transmission.frequencyMHz"]).toMatchObject({
      type: "number",
      min: 136,
      max: 174,
      step: 0.0001,
    });
    expect(schema.fields["transmission.txPowerWatts"].step).toBe(0.5);
    expect(schema.fields["identity.ssid"].valueType).toBe("number");
    expect(schema.fields["audioAndRadio.dcd"]).toMatchObject({
      type: "select",
      label: "Blue LED indicates",
      nullable: true,
      valueType: "boolean",
      options: [
        { value: "false", label: "Squelch" },
        { value: "true", label: "Software DCD (Data Carrier Detect)" },
      ],
    });
    expect(schema.fields["audioAndRadio.lowLed"]).toMatchObject({
      type: "select",
      label: "LED brightness",
      nullable: true,
      valueType: "boolean",
      options: [
        { value: "false", label: "Normal brightness" },
        { value: "true", label: "Low intensity" },
      ],
    });
    expect(schema.fields["decodeOutput"].options).toEqual([
      { value: "KISS", label: "KISS" },
      { value: "waypoint", label: "Waypoint" },
      { value: "UI", label: "AX.25 UI (Unnumbered Information)" },
    ]);
    expect(schema.fields["features.txSerialUiOutput"].label).toBe("Include own packets in AX.25 UI output");
    expect(schema.fields["micE.messageType"]).toMatchObject({
      type: "select",
      valueType: "number",
      options: expect.arrayContaining([
        { value: "0", label: "Emergency" },
        { value: "7", label: "Off duty" },
      ]),
    });
    expect(schema.fields["power.autoOffDelaySeconds"]).toMatchObject({ min: 0, max: 99999 });
    expect(schema.fields["features.highAltitude"].label).toBe("High altitude");
    expect(schema.fields["power.autoOnOffEnabled"].label).toBe("Auto on/off");
    expect(schema.fields["text.emergency"].label).toBe("Emergency text");
    expect(schema.fields["telemetry.everyPositionPackets"]).toMatchObject({
      label: "Send telemetry every N position packets",
      min: 1,
      max: 99,
    });
    expect(schema.fields["smartBeaconing.turnTimeSeconds"]).toMatchObject({ min: 1, max: 999 });
    expect(schema.fields["smartBeaconing.turnSlope"].unit).toBe("degree * km/h");
    expect(schema.fields["chinaMapOffset.longitudeOffset"]).toMatchObject({ min: -45, max: 45 });
    expect(schema.fields["chinaMapOffset.enabled"].label).toBe("Enabled");
    expect(schema.fields["gps.virtual.enabled"].label).toBe("Use fixed position");
    expect(schema.fields["gps.virtual.position.latitude"]).toMatchObject({ min: -90, max: 90, step: 0.000001 });
    expect(schema.fields["gps.virtual.phg.powerWatts"].options).toEqual([
      0, 1, 4, 9, 16, 25, 36, 49, 64, 81,
    ].map((value) => ({ value: String(value), label: `${value} W` })));
    expect(schema.fields["symbols.moving.code"]).toMatchObject({ minLength: 1, maxLength: 1, latin1: true });
    expect(schema.fields["digipeater.selector"].options).toEqual([
      { value: "01", label: "Disabled" },
      { value: "11", label: "WIDE1" },
      { value: "12", label: "WIDE2" },
      { value: "13", label: "WIDE3" },
      { value: "14", label: "WIDE1 + WIDE2" },
      { value: "15", label: "WIDE1 + WIDE2 + WIDE3" },
    ]);
  });

  it("rejects values that cannot be encoded by the configuration model", () => {
    const result = validateTrackerConfigDTO({
      identity: { callsign: "LB2KK", ssid: 7 },
      tfCard: { format: "3" },
      transmission: { beaconIntervalSeconds: 0 },
      audioAndRadio: { dcd: "true", lowLed: "false" },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "tfCard.format", code: "invalid-option" }),
      expect.objectContaining({ path: "transmission.beaconIntervalSeconds", code: "minimum" }),
      expect.objectContaining({ path: "audioAndRadio.dcd", code: "type" }),
      expect.objectContaining({ path: "audioAndRadio.lowLed", code: "type" }),
    ]));
  });

  it("accepts valid partial DTOs and throws structured errors on demand", () => {
    const dto = { identity: { callsign: "LB2KK", ssid: 7 }, tfCard: { format: "gpx" } };

    expect(validateTrackerConfigDTO(dto)).toEqual({ valid: true, errors: [] });
    expect(assertValidTrackerConfigDTO(dto)).toBe(dto);

    expect(() => assertValidTrackerConfigDTO({ tfCard: { format: "3" } })).toThrow(ConfigValidationError);
    try {
      assertValidTrackerConfigDTO({ tfCard: { format: "3" } });
    } catch (error) {
      expect(error.errors).toEqual([
        { path: "tfCard.format", code: "invalid-option", message: "value is not one of the allowed options" },
      ]);
    }
  });

  it("publishes the unified digipeater selector and requires a delay when enabled", () => {
    const result = validateTrackerConfigDTO({ digipeater: { selector: "11", enabled: true, alias: "11", forwardDelayMs: null } });

    expect(getTrackerConfigSchema().fields["digipeater.forwardDelayMs"].defaultWhenEnabled).toBe(800);
    expect(result.errors).toEqual([
      expect.objectContaining({ path: "digipeater.forwardDelayMs", code: "required-when-enabled" }),
    ]);
  });

  it("accepts at most three APRS paths in ALIAS-N format", () => {
    expect(validateTrackerConfigDTO({
      paths: { digipeaterPaths: ["WIDE1-1", "WIDE2-2", "TEMP1-1"] },
    })).toEqual({ valid: true, errors: [] });

    const result = validateTrackerConfigDTO({
      paths: { digipeaterPaths: ["WIDE1-1", "WIDE2-1", "assf", "fhgf"] },
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "paths.digipeaterPaths", code: "max-items" }),
      expect.objectContaining({ path: "paths.digipeaterPaths", code: "item-pattern", message: "path 3 must look like WIDE1-1" }),
      expect.objectContaining({ path: "paths.digipeaterPaths", code: "item-pattern", message: "path 4 must look like WIDE1-1" }),
    ]));
  });

  it("rejects new UI values that cannot be represented on the tracker wire", () => {
    const result = validateTrackerConfigDTO({
      decodeOutput: "Bluetooth",
      micE: { messageType: 8 },
      smartBeaconing: { turnSlope: 0, turnTimeSeconds: 1000 },
      power: { autoOffDelaySeconds: 100000 },
      symbols: { moving: { table: "//", code: "🛰" } },
      gps: { virtual: { packet: "bad\npacket" } },
      chinaMapOffset: { longitudeOffset: -46, latitudeOffset: 46 },
      telemetry: { everyPositionPackets: 0 },
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "decodeOutput", code: "invalid-option" }),
      expect.objectContaining({ path: "micE.messageType", code: "invalid-option" }),
      expect.objectContaining({ path: "smartBeaconing.turnSlope", code: "minimum" }),
      expect.objectContaining({ path: "smartBeaconing.turnTimeSeconds", code: "maximum" }),
      expect.objectContaining({ path: "power.autoOffDelaySeconds", code: "maximum" }),
      expect.objectContaining({ path: "symbols.moving.table", code: "max-length" }),
      expect.objectContaining({ path: "symbols.moving.code", code: "encoding" }),
      expect.objectContaining({ path: "gps.virtual.packet", code: "control-character" }),
      expect.objectContaining({ path: "chinaMapOffset.longitudeOffset", code: "minimum" }),
      expect.objectContaining({ path: "chinaMapOffset.latitudeOffset", code: "maximum" }),
      expect.objectContaining({ path: "telemetry.everyPositionPackets", code: "minimum" }),
    ]));
  });

  it("requires a complete structured fixed position and complete optional PHG data", () => {
    const result = validateTrackerConfigDTO({
      gps: { virtual: {
        enabled: true,
        packet: null,
        position: { latitude: 91, longitude: null },
        symbol: { table: "?", code: null },
        phg: { powerWatts: 1, heightFeet: null, gainDb: null, directivityDegrees: null },
        advancedRawPacket: null,
      } },
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "gps.virtual.position.latitude", code: "maximum" }),
      expect.objectContaining({ path: "gps.virtual.position.longitude", code: "required-for-fixed-position" }),
      expect.objectContaining({ path: "gps.virtual.symbol.table", code: "pattern" }),
      expect.objectContaining({ path: "gps.virtual.symbol.code", code: "required-for-fixed-position" }),
      expect.objectContaining({ path: "gps.virtual.phg.heightFeet", code: "required-with-phg" }),
    ]));
  });
});
