import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { applyDigipeaterSelector, encodeTrackerConfigDTO, getTrackerConfigSchema, parseTrackerConfig } from "../src/tracker-config/index.js";
import { aprsLayoutSections } from "../src/ui/aprs-layout.js";
import { beaconingLayoutSections } from "../src/ui/beaconing-layout.js";
import { deviceLayoutSections } from "../src/ui/device-layout.js";

const fixturePath = new URL("./fixtures/late_config.ini", import.meta.url);

describe("Tracker configuration editing", () => {
  it("encodes APRS draft fields while preserving unrelated records", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.identity = { callsign: "LB2KK", ssid: 7 };
    draft.text.comment = "AP510 test";
    draft.text.status = "ready";
    draft.paths.digipeaterPaths = ["WIDE1-1", "WIDE2-1", null];
    draft.digipeater = { selector: "11", enabled: true, alias: "11", forwardDelayMs: 120 };

    const edited = original.withDTO(draft);
    const records = edited.rawConfig.byKey();

    expect(records.get("01").value).toEqual(Uint8Array.from([..."LB2KK 7"].map((character) => character.charCodeAt(0))));
    expect(records.get("09").decoded()).toBe("ready");
    expect(records.get("10").decoded()).toBe("AP510 test");
    expect(records.get("25").displayValue).toBe("WIDE1 1");
    expect(records.get("26").displayValue).toBe("WIDE2 1");
    expect(records.get("27").displayValue).toBe("0      ");
    expect(records.get("12").displayValue).toBe("11");
    expect(records.get("31").decoded().digipeater_delay_ms).toBe(120);
    expect(Array.from(records.get("28").value)).toEqual(Array.from(original.rawConfig.byKey().get("28").value));
  });

  it("encodes a callsign without an explicit SSID as SSID zero", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.identity = { callsign: "N0CALL", ssid: null };

    const edited = encodeTrackerConfigDTO(original.rawConfig, draft);

    expect(edited.byKey().get("01").displayValue).toBe("N0CALL0");
    expect(edited.byKey().get("01").decoded()).toBe("N0CALL0");
  });

  it.each([
    [false, null, "01"],
    [true, "11", "11"],
    [true, "12", "12"],
    [true, "13", "13"],
    [true, "14", "14"],
    [true, "15", "15"],
  ])("encodes digipeater enabled=%s alias=%s as field 12 value %s", async (enabled, alias, expected) => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.digipeater = { ...draft.digipeater, selector: expected, enabled, alias };

    const edited = original.withDTO(draft);

    expect(edited.rawConfig.byKey().get("12").displayValue).toBe(expected);
    expect(edited.digipeater.selector).toBe(expected);
    expect(edited.digipeater.enabled).toBe(enabled);
    expect(edited.digipeater.alias).toBe(alias);
  });

  it("applies the digipeater selector and initializes only an unset delay", () => {
    const schema = getTrackerConfigSchema();

    expect(applyDigipeaterSelector({ digipeater: { selector: "01", enabled: false, alias: null, forwardDelayMs: null } }, "11", schema).digipeater).toEqual({
      selector: "11",
      enabled: true,
      alias: "11",
      forwardDelayMs: 800,
    });
    expect(applyDigipeaterSelector({ digipeater: { selector: "01", enabled: false, alias: null, forwardDelayMs: 1200 } }, "14", schema).digipeater).toEqual({
      selector: "14",
      enabled: true,
      alias: "14",
      forwardDelayMs: 1200,
    });
    expect(applyDigipeaterSelector({ digipeater: { selector: "14", enabled: true, alias: "14", forwardDelayMs: 1200 } }, "01", schema).digipeater).toEqual({
      selector: "01",
      enabled: false,
      alias: null,
      forwardDelayMs: 1200,
    });
  });

  it("accepts numeric SSID values produced by the UI dropdown", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.identity = { callsign: "LB2KK", ssid: 7 };

    const edited = original.withDTO(draft);

    expect(edited.rawConfig.byKey().get("01").decoded()).toBe("LB2KK 7");
  });

  it("rejects invalid APRS wire values before changing the base config", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.tfCard.format = "3";

    expect(() => original.withDTO(draft)).toThrow(/invalid field/);
    expect(original.identity.display).toBe("N0CALL-9");
  });

  it("rejects malformed or excess APRS paths before encoding records", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const malformed = original.toDTO();
    malformed.paths.digipeaterPaths = ["WIDE1-1", "assf"];
    const excess = original.toDTO();
    excess.paths.digipeaterPaths = ["WIDE1-1", "WIDE2-1", "TEMP1-1", "TEST-1"];

    expect(() => original.withDTO(malformed)).toThrow(/invalid field/);
    expect(() => original.withDTO(excess)).toThrow(/invalid field/);
    expect(original.paths.digipeaterPaths).toEqual(["WIDE1-1", "WIDE2-1", null]);
  });

  it("encodes Beaconing, Radio and Device draft fields into their packed records", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.transmission = { ...draft.transmission, mode: "manual", pttDelayMs: 120, beaconIntervalSeconds: 60, frequencyMHz: 145, txPowerWatts: 0.5, txVolume: 5, rxVolume: 7 };
    draft.features = { ...draft.features, beep: false, highAltitude: true, busyWaitFree: true, txSerialUiOutput: true };
    draft.smartBeaconing = { ...draft.smartBeaconing, lowSpeedKmh: 15, slowRateSeconds: 240, highSpeedKmh: 70, fastRateSeconds: 8, turnAngleDegrees: 30 };
    draft.audioAndRadio = { ...draft.audioAndRadio, squelch: 4, dcd: false, voltageInComment: false, temperatureInComment: true, tfStateInComment: false, blueLed: false, lowLed: true };
    draft.telemetry = { enabled: true, everyPositionPackets: 12 };
    draft.timeslot = { enabled: false, second: 20 };
    draft.tfCard = { format: "kml", writeIntervalSeconds: 45 };
    draft.temperatureUnit = "F";
    draft.gps = { virtual: { enabled: false, packet: null } };
    draft.text.emergency = "Emergency update";

    const edited = original.withDTO(draft);
    const records = edited.rawConfig.byKey();

    expect(records.get("02").decoded()).toBe("120 ms");
    expect(records.get("07").decoded()).toBe("manual");
    expect(records.get("08").decoded()).toBe("0060");
    expect(records.get("16").decoded()).toBe("145.0000");
    expect(records.get("18").decoded()).toMatchObject({ low_speed_kmh: 15, slow_rate_seconds: 240, high_speed_kmh: 70, fast_rate_seconds: 8, turn_angle: 30 });
    expect(records.get("28").decoded()).toMatchObject({ voltage: 0, temperature: 1, squelch: 4, telemetry: 1, telemetry_every: 12, timeslot_enabled: 0, timeslot_second: 20, dcd: 0, tf_format: 1, low_led: 1 });
    expect(records.get("30").decoded()).toBe("Emergency update");
    expect(records.get("31").decoded()).toMatchObject({ tf_interval_seconds: 45, temperature_unit: "F" });
  });

  it("round-trips every newly exposed UI setting through the backend records", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    const schema = getTrackerConfigSchema();
    const exposedPaths = [aprsLayoutSections, beaconingLayoutSections, deviceLayoutSections]
      .flatMap((layout) => layout(draft, { schema }))
      .flatMap((section) => section.fields)
      .map((field) => field.path)
      .filter(Boolean);
    const newPaths = [
      "decodeOutput",
      "micE.enabled",
      "micE.messageType",
      "micE.emergencyMessage",
      "transmission.fixedSymbol.table",
      "transmission.fixedSymbol.code",
      "gps.virtual.position.latitude",
      "gps.virtual.position.longitude",
      "gps.virtual.symbol.table",
      "gps.virtual.symbol.code",
      "gps.virtual.phg.powerWatts",
      "gps.virtual.phg.heightFeet",
      "gps.virtual.phg.gainDb",
      "gps.virtual.phg.directivityDegrees",
      "gps.virtual.advancedRawPacket",
      "smartBeaconing.turnSlope",
      "smartBeaconing.turnTimeSeconds",
      "power.automaticPowerOff",
      "power.autoOnOffEnabled",
      "power.autoOffDelaySeconds",
      "symbols.emergency.table",
      "symbols.emergency.code",
      "symbols.aboveHighSpeed.table",
      "symbols.aboveHighSpeed.code",
      "symbols.moving.table",
      "symbols.moving.code",
      "symbols.parked.table",
      "symbols.parked.code",
      "chinaMapOffset.enabled",
      "chinaMapOffset.longitudeOffset",
      "chinaMapOffset.latitudeOffset",
    ];

    for (const path of newPaths) {
      expect(exposedPaths, `${path} is rendered`).toContain(path);
      expect(schema.fields[path], `${path} has a frontend schema rule`).toBeDefined();
    }

    draft.decodeOutput = "UI";
    draft.micE = { enabled: false, messageType: 2, emergencyMessage: 6 };
    draft.transmission.fixedSymbol = { table: "\\", code: "j" };
    draft.gps.virtual = {
      enabled: true,
      packet: draft.gps.virtual.packet,
      position: { latitude: 59.9, longitude: 10.75 },
      symbol: { table: "/", code: ">" },
      phg: { powerWatts: 1, heightFeet: 10, gainDb: 1, directivityDegrees: 0 },
      advancedRawPacket: null,
    };
    draft.smartBeaconing = { ...draft.smartBeaconing, turnSlope: 111, turnTimeSeconds: 12 };
    draft.power = { automaticPowerOff: true, autoOnOffEnabled: true, autoOffDelaySeconds: 12345 };
    draft.symbols = {
      emergency: { table: "/", code: "!" },
      aboveHighSpeed: { table: "/", code: ">" },
      moving: { table: "\\", code: "j" },
      parked: { table: "/", code: "P" },
    };
    draft.chinaMapOffset = { enabled: true, longitudeOffset: -45, latitudeOffset: 45, raw: "0PP" };

    const edited = original.withDTO(draft);
    const records = edited.rawConfig.byKey();

    expect(records.get("03").displayValue).toBe("3");
    expect(records.get("04").displayValue).toBe("0");
    expect(records.get("06").displayValue).toBe("j\\\\");
    expect(records.get("13").displayValue).toBe("1");
    expect(records.get("14").displayValue).toBe("1#}");
    expect(records.get("15").decoded()).toEqual({ enabled: true, packet: "!5954.00N/01045.00E>PHG1010" });
    expect(records.get("18").decoded()).toMatchObject({ turn_slope: 111, turn_time_seconds: 12 });
    expect(records.get("28").decoded()).toMatchObject({ mice_message: 2 });
    expect(records.get("29").decoded()).toMatchObject({
      auto_power_enabled: 1,
      auto_off_delay_seconds: 12345,
      emergency_symbol_table: "!/",
      above_high_speed_symbol_table: ">/",
      moving_symbol_table: "j\\",
      parked_symbol_table: "P/",
      mice_emergency_message: 6,
    });
    expect(Array.from(records.get("10").value)).toEqual(Array.from(original.rawConfig.byKey().get("10").value));

    expect(edited.toDTO()).toMatchObject({
      decodeOutput: "UI",
      micE: { enabled: false, messageType: 2, emergencyMessage: 6 },
      transmission: { fixedSymbol: { table: "\\", code: "j" } },
      gps: { virtual: {
        enabled: true,
        packet: "!5954.00N/01045.00E>PHG1010",
        position: { latitude: 59.9, longitude: 10.75 },
        symbol: { table: "/", code: ">" },
        phg: { powerWatts: 1, heightFeet: 10, gainDb: 1, directivityDegrees: 0 },
        advancedRawPacket: null,
      } },
      smartBeaconing: { turnSlope: 111, turnTimeSeconds: 12 },
      power: { automaticPowerOff: true, autoOnOffEnabled: true, autoOffDelaySeconds: 12345 },
      symbols: {
        emergency: { table: "/", code: "!" },
        aboveHighSpeed: { table: "/", code: ">" },
        moving: { table: "\\", code: "j" },
        parked: { table: "/", code: "P" },
      },
      chinaMapOffset: { enabled: true, longitudeOffset: -45, latitudeOffset: 45, raw: "1#}" },
    });
  });

  it("preserves an undecodable China map-offset record during unrelated edits", async () => {
    const raw = (await readFile(fixturePath, "latin1")).replace("14=0PP", "14=bad");
    const original = parseTrackerConfig(raw);
    const draft = original.toDTO();
    draft.text.comment = "unrelated update";

    expect(draft.chinaMapOffset).toEqual({ enabled: null, longitudeOffset: null, latitudeOffset: null, raw: "bad" });
    expect(original.validateDTO(draft)).toEqual({ valid: true, errors: [] });

    const edited = original.withDTO(draft);

    expect(edited.rawConfig.byKey().get("14").displayValue).toBe("bad");
    expect(edited.text.comment).toBe("unrelated update");
  });

  it("preserves an unrecognized fixed-position packet during unrelated edits", async () => {
    const raw = (await readFile(fixturePath, "latin1")).replace("15=0!0000.00N/00000.00E-Test", "15=1CUSTOM-PACKET");
    const original = parseTrackerConfig(raw);
    const draft = original.toDTO();
    draft.text.comment = "unrelated update";

    expect(draft.gps.virtual).toMatchObject({
      enabled: true,
      packet: "CUSTOM-PACKET",
      position: null,
      symbol: null,
      advancedRawPacket: "CUSTOM-PACKET",
    });
    expect(original.validateDTO(draft)).toEqual({ valid: true, errors: [] });

    const edited = original.withDTO(draft);

    expect(edited.rawConfig.byKey().get("15").displayValue).toBe("1CUSTOM-PACKET");
    expect(edited.text.comment).toBe("unrelated update");
  });

  it("encodes structured fixed-position edits instead of preserving an old raw packet", async () => {
    const raw = (await readFile(fixturePath, "latin1")).replace("15=0!0000.00N/00000.00E-Test", "15=1CUSTOM-PACKET");
    const original = parseTrackerConfig(raw);
    const draft = original.toDTO();
    draft.gps.virtual = {
      ...draft.gps.virtual,
      position: { latitude: 59.9, longitude: 10.75 },
      symbol: { table: "/", code: ">" },
      phg: null,
    };

    const edited = original.withDTO(draft);

    expect(edited.rawConfig.byKey().get("15").displayValue).toBe("1!5954.00N/01045.00E>");
  });

  it("rejects an invalid structured fixed position before encoding record 15", async () => {
    const original = parseTrackerConfig(await readFile(fixturePath));
    const draft = original.toDTO();
    draft.gps.virtual = {
      enabled: true,
      packet: draft.gps.virtual.packet,
      position: { latitude: 91, longitude: 10.75 },
      symbol: { table: "/", code: ">" },
      phg: { powerWatts: 1, heightFeet: null, gainDb: 1, directivityDegrees: 0 },
      advancedRawPacket: null,
    };

    expect(() => original.withDTO(draft)).toThrow(/configuration contains .* invalid fields/);
    expect(original.rawConfig.byKey().get("15").displayValue).toBe("0!0000.00N/00000.00E-Test");
  });
});
