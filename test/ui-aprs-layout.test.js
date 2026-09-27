import { describe, expect, it } from "vitest";
import { aprsLayoutSections } from "../src/ui/aprs-layout.js";

describe("APRS layout view model", () => {
  it("maps APRS identity, symbol, paths and digipeater fields", () => {
    const sections = aprsLayoutSections({
      identity: { callsign: "LB2KK", ssid: 7, display: "LB2KK-7" },
      transmission: { fixedSymbol: { table: "/", code: ">" } },
      decodeOutput: "waypoint",
      micE: { enabled: true, messageType: 5, emergencyMessage: 0 },
      symbols: { emergency: { table: "/", code: "!" } },
      text: { comment: "AP510 tracker", status: "", emergency: "SOS" },
      paths: { legacyPreset: "WIDE1-1,WIDE2-1", digipeaterPaths: ["WIDE1-1", "WIDE2-1", null] },
      digipeater: { selector: "11", enabled: true, alias: "11", forwardDelayMs: 300 },
    });

    expect(sections.map((section) => section.title)).toEqual([
      "Identity",
      "Symbol",
      "Protocol output",
      "MIC-E",
      "Text",
      "Paths",
      "Digipeater",
    ]);

    expect(flattenFields(sections)).toMatchObject({
      Callsign: "LB2KK",
      SSID: "7",
      Table: "/",
      Code: ">",
      "Emergency table": "/",
      "Emergency symbol": "!",
      "Decode output": "waypoint",
      "MIC-E type": "5",
      "MIC-E emergency type": "0",
      Comment: "AP510 tracker",
      Status: "none",
      "Emergency text": "SOS",
      "APRS path": "WIDE1-1, WIDE2-1",
      Digipeater: "11",
      "Forward delay": "300",
    });

    expect(findField(sections, "SSID").control).toBe("select");
    expect(findField(sections, "SSID").width).toBe("compact");
    expect(findField(sections, "SSID").options).toContainEqual({ value: "7", label: "7" });
    expect(findField(sections, "Forward delay")).toMatchObject({
      inputType: "number",
      unit: "ms",
      disabled: false,
    });
    expect(findField(sections, "Decode output")).toMatchObject({ control: "select", path: "decodeOutput" });
    expect(findField(sections, "Decode output").options).toContainEqual({
      value: "UI",
      label: "AX.25 UI (Unnumbered Information)",
    });
    expect(findField(sections, "Digipeater").options).toEqual([
      { value: "01", label: "Disabled" },
      { value: "11", label: "WIDE1" },
      { value: "12", label: "WIDE2" },
      { value: "13", label: "WIDE3" },
      { value: "14", label: "WIDE1 + WIDE2" },
      { value: "15", label: "WIDE1 + WIDE2 + WIDE3" },
    ]);
    expect(findField(sections, "MIC-E type")).toMatchObject({ control: "select", path: "micE.messageType" });
    expect(findField(sections, "Emergency symbol").path).toBe("symbols.emergency.code");
    expect(findField(sections, "Combined")).toBeUndefined();
    const textSection = sections.find((section) => section.title === "Text");
    expect(textSection.columns).toBe(1);
    expect(textSection.fields.map((field) => field.path)).toEqual(["text.comment", "text.status", "text.emergency"]);
  });

  it("shows no SSID as none and unknown digipeater state as unknown", () => {
    const sections = aprsLayoutSections({
      identity: { callsign: "N0DEMO", ssid: null, display: "N0DEMO" },
      transmission: { fixedSymbol: null },
      text: {},
      paths: { digipeaterPaths: [] },
      digipeater: { selector: null, enabled: null, alias: null, forwardDelayMs: null },
    });
    const fields = flattenFields(sections);

    expect(fields.SSID).toBe("none");
    expect(fields.Digipeater).toBe("none");
    expect(findField(sections, "Comment").empty).toBe(true);
    expect(findField(sections, "Digipeater").empty).toBe(true);
    expect(findField(sections, "Forward delay").disabled).toBe(false);
  });

  it("can render an empty pre-read APRS form model", () => {
    const fields = flattenFields(aprsLayoutSections({}, { blankEmpty: true }));

    expect(fields.Callsign).toBe("");
    expect(fields.SSID).toBe("");
    expect(fields.Comment).toBe("");
    expect(fields["Emergency text"]).toBe("");
    expect(fields["Decode output"]).toBe("");
    expect(fields["MIC-E type"]).toBe("");
    expect(fields["APRS path"]).toBe("");
    expect(fields.Digipeater).toBe("");
  });

  it("handles null DTOs in the pre-read path", () => {
    const fields = flattenFields(aprsLayoutSections(null, { blankEmpty: true }));

    expect(fields.Callsign).toBe("");
    expect(fields.SSID).toBe("");
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
