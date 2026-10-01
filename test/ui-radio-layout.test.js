import { describe, expect, it } from "vitest";
import { radioLayoutSections } from "../src/ui/radio-layout.js";
import { getTrackerConfigSchema } from "../src/tracker-config/index.js";

describe("Radio layout view model", () => {
  it("maps RF, audio and receiver fields", () => {
    const sections = radioLayoutSections({
      transmission: {
        frequencyMHz: 144.8,
        txPowerWatts: 1,
        pttDelayMs: 120,
        txVolume: 5,
        rxVolume: 6,
      },
      audioAndRadio: {
        squelch: 3,
        dcd: true,
      },
    }, { schema: getTrackerConfigSchema() });

    expect(sections.map((section) => section.title)).toEqual(["RF", "Audio", "Receiver"]);
    expect(flattenFields(sections)).toMatchObject({
      Frequency: "144.8",
      "TX power": "1",
      "PTT delay": "120",
      "TX volume": "5",
      "RX volume": "6",
      Squelch: "3",
      "Blue LED indicates": "true",
    });
    expect(findField(sections, "Frequency")).toMatchObject({ inputType: "number", unit: "MHz" });
    expect(findField(sections, "TX power")).toMatchObject({
      control: "select",
      path: "transmission.txPowerWatts",
      options: [
        { value: "0.5", label: "0.5 W" },
        { value: "1", label: "1 W" },
      ],
    });
    expect(findField(sections, "PTT delay")).toMatchObject({ inputType: "number", unit: "ms" });
    expect(findField(sections, "Blue LED indicates")).toMatchObject({
      control: "select",
      path: "audioAndRadio.dcd",
      options: [
        { value: "false", label: "Squelch" },
        { value: "true", label: "Software DCD (Data Carrier Detect)" },
      ],
    });
    expect(findField(sections, "Frequency").width).toBe("compact");
  });

  it("can render an empty pre-read Radio form model", () => {
    const sections = radioLayoutSections({}, { blankEmpty: true });
    const fields = flattenFields(sections);

    expect(fields.Frequency).toBe("");
    expect(fields["TX power"]).toBe("");
    expect(findField(sections, "TX power").options.map((option) => option.value)).toEqual(["0.5", "1"]);
    expect(fields["PTT delay"]).toBe("");
    expect(fields.Squelch).toBe("");
    expect(fields["Blue LED indicates"]).toBe("");
    expect(findField(sections, "Blue LED indicates").options[0]).toEqual({ value: "", label: "" });
  });

  it("does not expose an unsupported transmitter power as a choice", () => {
    const sections = radioLayoutSections({ transmission: { txPowerWatts: 1.5 } }, { schema: getTrackerConfigSchema() });

    expect(findField(sections, "TX power").options.map((option) => option.value)).toEqual(["0.5", "1"]);
  });

  it("handles null DTOs in the pre-read path", () => {
    const fields = flattenFields(radioLayoutSections(null, { blankEmpty: true }));

    expect(fields.Frequency).toBe("");
    expect(fields["TX volume"]).toBe("");
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
