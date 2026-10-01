import { describe, expect, it } from "vitest";
import { getTrackerConfigSchema } from "../src/tracker-config/index.js";
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
      "Fixed beacon interval",
      "Smart Beaconing",
      "Smart Beaconing symbols",
      "Position offset",
      "Fixed position",
    ]);
    expect(sections.find((section) => section.title === "Fixed beacon interval")).toMatchObject({
      description: [
        "Used only in ",
        { text: "Auto", italic: true },
        " and ",
        { text: "Manual+Auto", italic: true },
        " modes.",
      ],
    });
    expect(sections.find((section) => section.title === "Smart Beaconing")).toMatchObject({
      description: [
        "Automatically adjusts updates to your speed and turns. Used in ",
        { text: "Smart", italic: true },
        " and ",
        { text: "Smart+Manual", italic: true },
        " modes.",
      ],
      columns: 2,
      narrowControls: true,
      groups: [
        {
          title: "Regular position updates",
          fieldPaths: ["smartBeaconing.lowSpeedKmh", "smartBeaconing.slowRateSeconds", "smartBeaconing.highSpeedKmh", "smartBeaconing.fastRateSeconds"],
          footer: "Between these speed thresholds, faster movement gives shorter intervals, keeping roughly the same distance between reports.",
        },
        {
          title: "Updates when turning",
          description: "Send an earlier position update when your direction changes enough to report a corner.",
          fieldPaths: ["smartBeaconing.turnAngleDegrees", "smartBeaconing.turnSlope", "smartBeaconing.turnTimeSeconds"],
        },
      ],
    });

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
      "Slow-speed threshold": "5",
      "Stopped/slow interval": "120",
      "High-speed threshold": "70",
      "High-speed interval": "30",
      "Low-speed turn filtering (turn slope)": "240",
      "Base turn angle": "28",
      "Minimum spacing for turn updates": "10",
      "High-speed symbol": ">",
      "Moving symbol": "j",
      "Parked symbol": "P",
    });

    expect(findField(sections, "TX interval")).toMatchObject({ inputType: "number", unit: "s" });
    expect(findField(sections, "Mode")).toMatchObject({ control: "select", tooltip: "Choose when the tracker sends position reports." });
    expect(findField(sections, "Slow-speed threshold")).toMatchObject({ inputType: "number", unit: "km/h", tooltip: "At or below this speed, use the stopped/slow interval." });
    expect(findField(sections, "Stopped/slow interval")).toMatchObject({ inputType: "number", unit: "seconds", tooltip: "How often to report while stopped or moving slowly." });
    expect(findField(sections, "High-speed threshold")).toMatchObject({ inputType: "number", unit: "km/h", tooltip: "At or above this speed, use the high-speed interval." });
    expect(findField(sections, "High-speed interval")).toMatchObject({ inputType: "number", unit: "seconds", tooltip: "How often to report at high speed. Turns may trigger earlier reports." });
    expect(findField(sections, "Base turn angle")).toMatchObject({ inputType: "number", unit: "°", tooltip: "Smaller angles capture gentler bends. Larger angles require sharper turns." });
    expect(findField(sections, "Low-speed turn filtering (turn slope)")).toMatchObject({ inputType: "number", unit: null, width: "normal", tooltip: "Higher values require larger turns at low speeds. Set to 1 to remove this adjustment." });
    expect(findField(sections, "Minimum spacing for turn updates")).toMatchObject({ inputType: "number", unit: "seconds", path: "smartBeaconing.turnTimeSeconds", tooltip: "Limits how often turns trigger updates. Larger values mean fewer reports during frequent turns." });
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
    expect(fields["Slow-speed threshold"]).toBe("");
    expect(fields["Low-speed turn filtering (turn slope)"]).toBe("");
    expect(findField(sections, "High altitude")).toBeUndefined();
  });

  it("combines the turn-slope hover guidance with the manual examples", () => {
    const schema = getTrackerConfigSchema();
    const sections = beaconingLayoutSections({}, { schema });
    expect(findField(sections, "Low-speed turn filtering (turn slope)").tooltip).toContain("Set to 1");
    expect(schema.fields["smartBeaconing.turnSlope"].help.details).toContain("100 for bicycles");
    expect(schema.fields["smartBeaconing.turnSlope"].help.details).toContain("240 for cars or motorcycles");
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
