import { describe, expect, it } from "vitest";
import { beaconingLayoutSections } from "../src/ui/beaconing-layout.js";

describe("Beaconing layout view model", () => {
  it("maps transmit cadence, position and Smart Beaconing fields", () => {
    const sections = beaconingLayoutSections({
      transmission: { beaconIntervalSeconds: 30, mode: "smart+manual" },
      timeslot: { enabled: true, second: 15 },
      gps: { virtual: {
        enabled: true,
        packet: "!5954.00N/01045.00E>PHG1010",
        position: { latitude: 59.9, longitude: 10.75 },
        symbol: { table: "/", code: ">" },
        phg: { powerWatts: 1, heightFeet: 10, gainDb: 1, directivityDegrees: 0 },
        advancedRawPacket: null,
      } },
      chinaMapOffset: { enabled: true, longitudeOffset: -2, latitudeOffset: 3 },
      smartBeaconing: {
        lowSpeedKmh: 5,
        slowRateSeconds: 120,
        highSpeedKmh: 70,
        fastRateSeconds: 30,
        turnSlope: 240,
        turnAngleDegrees: 28,
        turnTimeSeconds: 10,
      },
      symbols: {
        aboveHighSpeed: { table: "/", code: ">" },
        moving: { table: "\\", code: "j" },
        parked: { table: "/", code: "P" },
      },
    });

    expect(sections.map((section) => section.title)).toEqual([
      "Transmit cadence",
      "Smart Beaconing",
      "Smart Beaconing symbols",
      "Position offset",
      "Fixed position",
    ]);

    expect(flattenFields(sections)).toMatchObject({
      "TX interval": "30",
      Mode: "smart+manual",
      "Generated fixed-position packet": "!5954.00N/01045.00E>PHG1010",
      "Fixed latitude": "59.9",
      "Fixed longitude": "10.75",
      "Fixed-position symbol table / overlay": "/",
      "Fixed-position symbol code": ">",
      "Longitude offset": "-2",
      "Latitude offset": "3",
      "Low speed": "5",
      "Slow rate": "120",
      "High speed": "70",
      "Fast rate": "30",
      "Turn slope": "240",
      "Turn angle": "28",
      "Turn time": "10",
      "High-speed symbol": ">",
      "Moving symbol": "j",
      "Parked symbol": "P",
    });

    expect(findField(sections, "TX interval")).toMatchObject({ inputType: "number", unit: "s" });
    expect(findField(sections, "Mode")).toMatchObject({ control: "select" });
    expect(findField(sections, "Low speed")).toMatchObject({ inputType: "number", unit: "km/h" });
    expect(findField(sections, "Turn angle")).toMatchObject({ inputType: "number", unit: "°" });
    expect(findField(sections, "Turn slope")).toMatchObject({ inputType: "number", unit: "degree * km/h" });
    expect(findField(sections, "Turn time")).toMatchObject({ inputType: "number", unit: "s", path: "smartBeaconing.turnTimeSeconds" });
    expect(findField(sections, "Moving symbol").path).toBe("symbols.moving.code");
    const symbolSection = sections.find((section) => section.title === "Smart Beaconing symbols");
    expect(symbolSection.columns).toBe(2);
    expect(symbolSection.fields.map((field) => field.path)).toEqual([
      "symbols.aboveHighSpeed.table",
      "symbols.aboveHighSpeed.code",
      "symbols.moving.table",
      "symbols.moving.code",
      "symbols.parked.table",
      "symbols.parked.code",
    ]);
    expect(findField(sections, "High altitude")).toBeUndefined();
    expect(findField(sections, "Use fixed position")).toMatchObject({
      control: "checkbox",
      checked: true,
      indeterminate: false,
    });
    expect(findField(sections, "Generated fixed-position packet")).toMatchObject({ disabled: true, path: "gps.virtual.packet" });
    expect(findField(sections, "Fixed latitude")).toMatchObject({ inputType: "number", unit: "°", path: "gps.virtual.position.latitude" });
    expect(findField(sections, "PHG power")).toMatchObject({ control: "select", value: "1" });
    expect(findField(sections, "Enabled")).toMatchObject({
      control: "checkbox",
      checked: true,
      path: "chinaMapOffset.enabled",
    });
    expect(findField(sections, "Longitude offset")).toMatchObject({ inputType: "number", unit: "0.01 arcmin/step", width: "normal", path: "chinaMapOffset.longitudeOffset" });
    expect(findField(sections, "Latitude offset")).toMatchObject({ inputType: "number", unit: "0.01 arcmin/step", width: "normal", path: "chinaMapOffset.latitudeOffset" });
    expect(sections.find((section) => section.title === "Position offset")).toMatchObject({
      description: "Each step is 0.01 arcmin. Positive longitude moves east and negative west; positive latitude moves north and negative south.",
    });
    expect(sections.some((section) => section.title === "Timeslot")).toBe(false);
    expect(sections.flatMap((section) => section.fields).some((field) => field.path?.startsWith("timeslot."))).toBe(false);
  });

  it("can render an empty pre-read Beaconing form model", () => {
    const sections = beaconingLayoutSections({}, { blankEmpty: true });
    const fields = flattenFields(sections);

    expect(fields["TX interval"]).toBe("");
    expect(fields.Mode).toBe("");
    expect(fields["Generated fixed-position packet"]).toBe("");
    expect(fields["Fixed latitude"]).toBe("");
    expect(fields["Longitude offset"]).toBe("");
    expect(fields["Low speed"]).toBe("");
    expect(fields["Turn slope"]).toBe("");
    expect(findField(sections, "High altitude")).toBeUndefined();
  });

  it("handles null DTOs in the pre-read path", () => {
    const fields = flattenFields(beaconingLayoutSections(null, { blankEmpty: true }));

    expect(fields["TX interval"]).toBe("");
    expect(fields.Mode).toBe("");
  });
});

function flattenFields(sections) {
  return Object.fromEntries(
    sections.flatMap((section) => section.fields.map((field) => [field.label, field.value])),
  );
}

function findField(sections, label) {
  return sections.flatMap((section) => section.fields).find((field) => field.label === label);
}
