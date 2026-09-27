import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { ConfigFormatError, diffConfigs, escapeBytes, parseAP510Config } from "../src/tracker-config/index.js";

const fixturePath = new URL("./fixtures/late_config.ini", import.meta.url);

describe("AP510 configuration parser", () => {
  it("parses vendor config captures as ordered byte records", async () => {
    const config = parseAP510Config(await readFile(fixturePath));

    expect(config.firmware()).toBe("AVRT5 20210404");
    expect(config.profile.identifier).toBe("avrt5-20210404");
    expect(config.profile.hardwareTested).toBe(true);
    expect(config.records).toHaveLength(30);
    expect(config.records[0].key).toBe("00");
    expect(config.records.at(-1).key).toBe("31");
    expect(config.byKey().get("03").name).toBe("decode_output");
    expect(config.byKey().get("03").displayValue).toBe("1");
    expect(config.byKey().get("03").decoded()).toBe("KISS");
  });

  it("decodes known late firmware composite records", async () => {
    const config = parseAP510Config(await readFile(fixturePath));

    expect(config.byKey().get("18").decoded()).toEqual({
      low_speed_kmh: 10,
      slow_rate_seconds: 300,
      high_speed_kmh: 60,
      fast_rate_seconds: 10,
      turn_slope: 240,
      turn_angle: 28,
      turn_time_seconds: 5,
    });
    expect(config.byKey().get("28").decoded()).toMatchObject({
      mice_message: 7,
      blue_led: 1,
      telemetry: 0,
      timeslot_enabled: 0,
      timeslot_second: 1,
      low_led: 0,
    });
    expect(config.byKey().get("29").decoded()).toEqual({
      auto_power_enabled: 0,
      auto_off_delay_seconds: 30,
      auto_off_delay_raw: "00030",
      emergency_symbol_table: "!/",
      above_high_speed_symbol_table: ">/",
      moving_symbol_table: ">/",
      parked_symbol_table: "P/",
      mice_emergency_message: 0,
    });
    expect(config.byKey().get("31").decoded()).toEqual({
      tf_interval_seconds: 10,
      digipeater_delay_ms: 800,
      temperature_unit: "C",
    });
  });

  it("selects hardware-tested and fallback profiles from firmware records", () => {
    const finalFirmware = parseAP510Config("00= AVRT5 20210404\r\n17=1\r\n");
    const earlierFirmware = parseAP510Config("00=AVRT5 20200605\r\n17=1\r\n");
    const unknownFirmware = parseAP510Config("00=AVRT5 20991231\r\n17=1\r\n");

    expect(finalFirmware.profile.identifier).toBe("avrt5-20210404");
    expect(finalFirmware.profile.hardwareTested).toBe(true);
    expect(earlierFirmware.profile.identifier).toBe("avrt5-20200605");
    expect(earlierFirmware.profile.hardwareTested).toBe(true);
    expect(unknownFirmware.profile.identifier).toBe("documented-numbered");
    expect(unknownFirmware.profile.hardwareTested).toBe(false);
    expect(unknownFirmware.byKey().get("17").decoded()).toBe("on");
  });

  it("keeps unknown records lossless with ASCII fallback decoding", () => {
    const config = parseAP510Config("00=AVRT5 20210404\r\n99=mystery\r\n");
    const record = config.byKey().get("99");

    expect(record.name).toBe("unknown");
    expect(record.displayValue).toBe("mystery");
    expect(record.decoded()).toBe("mystery");
  });

  it("preserves binary values and raw capture bytes", () => {
    const raw = Uint8Array.from([
      0x0d, 0x0a, 0x30, 0x30, 0x3d, 0x41, 0x56, 0x52, 0x54, 0x35, 0x0d, 0x0a, 0x31, 0x35,
      0x3d, 0x30, 0x61, 0x62, 0x63, 0x00, 0x64, 0x65, 0x66, 0xff, 0x0d, 0x0a,
    ]);

    const config = parseAP510Config(raw);
    const record = config.byKey().get("15");

    expect(config.raw).toEqual(raw);
    expect(record.value).toEqual(Uint8Array.from([0x30, 0x61, 0x62, 0x63, 0x00, 0x64, 0x65, 0x66, 0xff]));
    expect(record.displayValue).toBe(String.raw`0abc\x00def\xff`);
    expect(record.toJSON().base64).toBe("MGFiYwBkZWb/");
  });

  it("rejects missing and duplicate records", () => {
    expect(() => parseAP510Config("not a configuration")).toThrow(ConfigFormatError);
    expect(() => parseAP510Config("01=FIRST\r\n01=SECOND\r\n")).toThrow("duplicate keys: 01");
  });

  it("updates record values without disturbing capture wrappers or unrelated bytes", () => {
    const original = parseAP510Config(
      Uint8Array.from([
        0x48, 0x45, 0x41, 0x44, 0x45, 0x52, 0x0d, 0x0a, 0x30, 0x30, 0x3d, 0x20, 0x41, 0x56,
        0x52, 0x54, 0x35, 0x20, 0x32, 0x30, 0x32, 0x31, 0x30, 0x34, 0x30, 0x34, 0x0d, 0x0a,
        0x30, 0x39, 0x3d, 0x6f, 0x6c, 0x64, 0x0d, 0x0a, 0x31, 0x35, 0x3d, 0x30, 0xff, 0xff,
        0x0d, 0x0a, 0x54, 0x41, 0x49, 0x4c,
      ]),
    );

    const updated = original.withUpdates({ "09": "new" });

    expect(escapeBytes(updated.raw)).toBe(String.raw`HEADER\r\n00= AVRT5 20210404\r\n09=new\r\n15=0\xff\xff\r\nTAIL`);
    expect(updated.sameRecordsAs(original)).toBe(false);
    expect(original.sameRecordsAs(parseAP510Config(original.raw))).toBe(true);
    expect(() => original.withUpdates({ "11": "value" })).toThrow("missing keys: 11");
  });

  it("round-trips parsed raw bytes into the same ordered records", async () => {
    const original = parseAP510Config(await readFile(fixturePath));
    const reparsed = parseAP510Config(original.raw);

    expect(reparsed.sameRecordsAs(original)).toBe(true);
    expect(reparsed.toJSON()).toEqual(original.toJSON());
  });

  it("withUpdates only changes requested record value bytes", () => {
    const raw = Uint8Array.from([
      0x48, 0x45, 0x41, 0x44, 0x45, 0x52, 0x0d, 0x0a, 0x30, 0x30, 0x3d, 0x20, 0x41, 0x56,
      0x52, 0x54, 0x35, 0x20, 0x32, 0x30, 0x32, 0x31, 0x30, 0x34, 0x30, 0x34, 0x0d, 0x0a,
      0x30, 0x39, 0x3d, 0x6f, 0x6c, 0x64, 0x0d, 0x0a, 0x31, 0x35, 0x3d, 0x30, 0xff, 0xff,
      0x0d, 0x0a, 0x54, 0x41, 0x49, 0x4c,
    ]);
    const original = parseAP510Config(raw);

    const updated = original.withUpdates({ "09": "new value" });

    expect(updated.byKey().get("09").displayValue).toBe("new value");
    expect(updated.byKey().get("15").value).toEqual(original.byKey().get("15").value);
    expect(escapeBytes(updated.raw)).toBe(String.raw`HEADER\r\n00= AVRT5 20210404\r\n09=new value\r\n15=0\xff\xff\r\nTAIL`);
  });

  it.each([
    ["CRLF line endings", "00=FW\r\n01=value\r\n", [["00", "FW"], ["01", "value"]]],
    ["LF line endings", "00=FW\n01=value\n", [["00", "FW"], ["01", "value"]]],
    ["noise before first record", "noise\r\n00=FW\r\n", [["00", "FW"]]],
    ["extra CR before LF is preserved in value", "00=FW\r\r\n", [["00", "FW\\r"]]],
    ["bare CR inside value is preserved", "00=FW\r01=still-value\r\n", [["00", "FW\\r01=still-value"]]],
    ["unterminated final record", "00=FW", [["00", "FW"]]],
  ])("parses record boundary case: %s", (_name, input, expectedRecords) => {
    const config = parseAP510Config(input);

    expect(config.records.map((record) => [record.key, record.displayValue])).toEqual(expectedRecords);
  });

  it("diffs changed, added, and removed records in key order", () => {
    const before = parseAP510Config(new Uint8Array([0x30, 0x31, 0x3d, 0x4f, 0x4c, 0x44, 0x0d, 0x0a, 0x30, 0x32, 0x3d, 0x31, 0x0d, 0x0a, 0x33, 0x30, 0x3d, 0x67, 0x6f, 0x6e, 0x65, 0x0d, 0x0a]));
    const after = parseAP510Config(new Uint8Array([0x30, 0x31, 0x3d, 0x4e, 0x45, 0x57, 0x0d, 0x0a, 0x30, 0x32, 0x3d, 0x31, 0x0d, 0x0a, 0x33, 0x31, 0x3d, 0x00, 0x0d, 0x0a]));

    expect(diffConfigs(before, after)).toEqual(["- 01=OLD", "+ 01=NEW", "- 30=gone", String.raw`+ 31=\x00`]);
  });

  it("escapes arbitrary bytes for display", () => {
    expect(escapeBytes(Uint8Array.from([0x61, 0x5c, 0x78, 0x30, 0x30, 0x09, 0x0d, 0x0a, 0x00, 0xff, 0x7e]))).toBe(
      String.raw`a\\x00\t\r\n\x00\xff~`,
    );
  });
});
