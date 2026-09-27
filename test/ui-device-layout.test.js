import { describe, expect, it } from "vitest";
import { deviceLayoutSections } from "../src/ui/device-layout.js";

describe("Device layout view model", () => {
  it("maps device info, indicators, telemetry and storage fields", () => {
    const sections = deviceLayoutSections({
      firmware: { raw: "AVRT5 20210404" },
      metadata: { profile: "avrt5-20210404", hardwareTested: true },
      temperatureUnit: "C",
      features: {
        beep: true,
        highAltitude: false,
        busyWaitFree: false,
        txSerialUiOutput: true,
      },
      audioAndRadio: {
        blueLed: true,
        lowLed: false,
        voltageInComment: true,
        temperatureInComment: false,
        tfStateInComment: true,
      },
      telemetry: {
        enabled: true,
        everyPositionPackets: 4,
      },
      tfCard: {
        format: "gpx",
        writeIntervalSeconds: 60,
      },
      power: {
        automaticPowerOff: true,
        autoOnOffEnabled: true,
        autoOffDelaySeconds: 90,
      },
    });

    expect(sections.map((section) => section.title)).toEqual([
      "Device info",
      "Indicators",
      "Power management",
      "Telemetry",
      "Storage and advanced",
      "Experimental features",
    ]);

    expect(flattenFields(sections)).toMatchObject({
      Firmware: "AVRT5 20210404",
      Profile: "avrt5-20210404 (hardware tested)",
      "Temperature unit": "C",
      "Send telemetry every N position packets": "4",
      "TF format": "gpx",
      "Write interval": "60",
      "Auto-off delay": "90",
      "LED brightness": "false",
    });

    expect(findField(sections, "Temperature unit")).toMatchObject({ control: "select" });
    expect(findField(sections, "Send telemetry every N position packets")).toMatchObject({ inputType: "number", unit: null });
    expect(findField(sections, "TF format")).toMatchObject({ control: "select" });
    expect(findField(sections, "TF format").options.map((option) => option.value)).toEqual(["gpx", "kml"]);
    expect(findField(sections, "Write interval")).toMatchObject({ inputType: "number", unit: "s" });
    expect(findField(sections, "Beep")).toMatchObject({ control: "checkbox", checked: true, indeterminate: false });
    expect(findField(sections, "LED brightness")).toMatchObject({
      control: "select",
      path: "audioAndRadio.lowLed",
      options: [
        { value: "false", label: "Normal brightness" },
        { value: "true", label: "Low intensity" },
      ],
    });
    expect(findField(sections, "Telemetry", "Enabled")).toMatchObject({ control: "checkbox", checked: true, indeterminate: false });
    expect(findField(sections, "Busy wait free")).toMatchObject({ control: "checkbox", checked: false, indeterminate: false });
    expect(findField(sections, "Include own packets in AX.25 UI output")).toMatchObject({
      control: "checkbox",
      checked: true,
      path: "features.txSerialUiOutput",
    });
    expect(findField(sections, "Power management", "90-minute power off")).toMatchObject({ control: "checkbox", checked: true });
    expect(findField(sections, "Experimental features", "High altitude")).toMatchObject({ control: "checkbox", checked: false });
    expect(findField(sections, "Experimental features", "Auto on/off")).toMatchObject({ control: "checkbox", checked: true });
    expect(findField(sections, "Experimental features", "Auto-off delay")).toMatchObject({ inputType: "number", unit: "s" });
    expect(sections.find((section) => section.title === "Experimental features")).toMatchObject({
      descriptionTone: "warning",
      description: "Do not enable unless hardware modification has been completed. See user manual.",
    });
    expect(findField(sections, "Position offset")).toBeUndefined();
    expect(findField(sections, "Encoded position offset")).toBeUndefined();
  });

  it("can render an empty pre-read Device form model", () => {
    const sections = deviceLayoutSections({}, { blankEmpty: true });
    const fields = flattenFields(sections);

    expect(fields.Firmware).toBe("");
    expect(fields.Profile).toBe("");
    expect(fields["Temperature unit"]).toBe("");
    expect(fields["Send telemetry every N position packets"]).toBe("");
    expect(fields["Write interval"]).toBe("");
    expect(fields["Auto-off delay"]).toBe("");
    expect(fields["LED brightness"]).toBe("");
    expect(findField(sections, "Experimental features", "High altitude")).toMatchObject({
      control: "checkbox",
      checked: false,
      indeterminate: true,
    });
    expect(findField(sections, "Beep")).toMatchObject({
      control: "checkbox",
      checked: false,
      indeterminate: true,
    });
  });

  it("handles null DTOs in the pre-read path", () => {
    const fields = flattenFields(deviceLayoutSections(null, { blankEmpty: true }));

    expect(fields.Firmware).toBe("");
    expect(fields["TF format"]).toBe("");
  });
});

function flattenFields(sections) {
  return Object.fromEntries(
    sections.flatMap((section) => section.fields.map((field) => [field.label, field.value])),
  );
}

function findField(sections, labelOrSection, maybeLabel) {
  if (!maybeLabel) {
    return sections.flatMap((section) => section.fields).find((field) => field.label === labelOrSection);
  }
  const section = sections.find((item) => item.title === labelOrSection);
  return section?.fields.find((field) => field.label === maybeLabel);
}
