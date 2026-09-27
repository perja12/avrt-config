import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseTrackerConfig } from "../src/tracker-config/index.js";

const fixturePath = new URL("./fixtures/late_config.ini", import.meta.url);
const backupsDir = path.resolve(import.meta.dirname, "../tracker-backups");

describe("TrackerConfig DTO", () => {
  it("maps TF format selectors to the observed AP510 GPX and KML values", () => {
    const featureFlags = (format) => `28=${"5111110"}${"00"}1${"00"}1${format}1`;
    expect(parseTrackerConfig(`00=AVRT5 20210404\r\n${featureFlags(0)}\r\n`).toDTO().tfCard.format).toBe("gpx");
    expect(parseTrackerConfig(`00=AVRT5 20210404\r\n${featureFlags(1)}\r\n`).toDTO().tfCard.format).toBe("kml");
  });

  it("decodes printable China map offsets without treating backslash as display escaping", () => {
    const config = parseTrackerConfig("00=AVRT5 20210404\r\n14=1\\P\r\n");

    expect(config.chinaMapOffset).toEqual({ enabled: true, longitudeOffset: 12, latitudeOffset: 0, raw: "1\\P" });
  });

  it("maps a known fixture into semantic application fields", async () => {
    const config = parseTrackerConfig(await readFile(fixturePath));

    expect(config.metadata).toEqual({
      profile: "avrt5-20210404",
      hardwareTested: true,
      rawSize: 324,
      recordCount: 30,
    });
    expect(config.firmware).toEqual({ model: "AVRT5", version: "20210404", raw: "AVRT5 20210404" });
    expect(config.identity).toEqual({ callsign: "N0CALL", ssid: 9, display: "N0CALL-9", raw: "N0CALL9" });
    expect(config.decodeOutput).toBe("KISS");
    expect(config.transmission).toMatchObject({
      mode: "smart+manual",
      pttDelayMs: 300,
      beaconIntervalSeconds: 30,
      frequencyMHz: 145.5,
      txPowerWatts: 1,
      txVolume: 6,
      rxVolume: 8,
      fixedSymbol: { table: "/", code: ">" },
    });
    expect(config.paths).toEqual({
      legacyPreset: null,
      digipeaterPaths: ["WIDE1-1", "WIDE2-1", null],
    });
    expect(config.smartBeaconing).toEqual({
      lowSpeedKmh: 10,
      slowRateSeconds: 300,
      highSpeedKmh: 60,
      fastRateSeconds: 10,
      turnSlope: 240,
      turnAngleDegrees: 28,
      turnTimeSeconds: 5,
    });
    expect(config.micE).toEqual({ enabled: true, messageType: 7, emergencyMessage: 0 });
    expect(config.power).toEqual({ automaticPowerOff: false, autoOnOffEnabled: false, autoOffDelaySeconds: 30 });
    expect(config.gps.virtual).toEqual({
      enabled: false,
      packet: "!0000.00N/00000.00E-Test",
      position: null,
      symbol: null,
      phg: null,
      advancedRawPacket: "!0000.00N/00000.00E-Test",
    });
    expect(config.features).toEqual({
      highAltitude: false,
      busyWaitFree: false,
      beep: true,
      txSerialUiOutput: false,
    });
    expect(config.telemetry).toEqual({ enabled: false, everyPositionPackets: 10 });
    expect(config.timeslot).toEqual({ enabled: false, second: 1 });
    expect(config.tfCard).toEqual({ format: "kml", writeIntervalSeconds: 10 });
    expect(config.temperatureUnit).toBe("C");
    expect(config.symbols.emergency).toEqual({ table: "/", code: "!" });
    expect(config.chinaMapOffset).toEqual({ enabled: false, longitudeOffset: 0, latitudeOffset: 0, raw: "0PP" });
    expect(config.validateDTO()).toEqual({ valid: true, errors: [] });
  });

  it("keeps Python-parity debug JSON available from the semantic wrapper", async () => {
    const config = parseTrackerConfig(await readFile(fixturePath));

    expect(config.toDebugJSON()).toEqual(config.rawConfig.toJSON());
  });

  it.each([
    ["01=AB110\r\n", { callsign: "AB1", ssid: 10, display: "AB1-10", raw: "AB110" }],
    ["01=TEST10\r\n", { callsign: "TEST", ssid: 10, display: "TEST-10", raw: "TEST10" }],
    ["01=N0CALL15\r\n", { callsign: "N0CALL", ssid: 15, display: "N0CALL-15", raw: "N0CALL15" }],
    ["01=LB2KK 7\r\n", { callsign: "LB2KK", ssid: 7, display: "LB2KK-7", raw: "LB2KK 7" }],
    ["01=N0DEMO0\r\n", { callsign: "N0DEMO", ssid: 0, display: "N0DEMO", raw: "N0DEMO0" }],
    ["01=LB2KK\r\n", { callsign: "LB2KK", ssid: null, display: "LB2KK", raw: "LB2KK" }],
  ])("parses callsign/SSID identity from %s", (record, expected) => {
    const config = parseTrackerConfig(`00=AVRT5 20210404\r\n${record}`);

    expect(config.identity).toEqual(expected);
  });

  it("preserves unknown booleans as null when optional fields are absent", () => {
    const config = parseTrackerConfig("00=AVRT5 20991231\r\n01=N0DEMO0\r\n");

    expect(config.micE.enabled).toBeNull();
    expect(config.power.automaticPowerOff).toBeNull();
    expect(config.features).toEqual({
      highAltitude: null,
      busyWaitFree: null,
      beep: null,
      txSerialUiOutput: null,
    });
    expect(config.digipeater.enabled).toBeNull();
  });

  it("returns a defensive DTO copy", async () => {
    const config = parseTrackerConfig(await readFile(fixturePath));
    const dto = config.toDTO();

    dto.identity.callsign = "BROKEN";

    expect(config.identity.callsign).toBe("N0CALL");
  });

  it.skipIf(!existsSync(backupsDir))("builds a semantic DTO for every local backup without changing debug JSON", async () => {
    const names = await readdir(backupsDir);
    const binNames = names.filter((name) => name.endsWith(".bin")).sort();

    expect(binNames.length).toBeGreaterThan(0);

    for (const binName of binNames) {
      const raw = await readFile(path.join(backupsDir, binName));
      const config = parseTrackerConfig(raw);

      expect.soft(config.metadata.recordCount, `${binName} record count`).toBeGreaterThan(0);
      expect.soft(config.toDebugJSON(), `${binName} debug JSON`).toEqual(config.rawConfig.toJSON());
      expect.soft(config.toDTO(), `${binName} DTO clone`).toEqual(config.dto);
    }
  });
});
