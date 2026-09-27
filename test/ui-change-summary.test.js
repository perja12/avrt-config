import { describe, expect, it } from "vitest";

import { configChangeSummary } from "../src/ui/change-summary.js";

const schema = {
  fields: {
    "identity.callsign": { label: "Callsign", type: "text" },
    "identity.ssid": { label: "SSID", type: "number" },
    "text.comment": { label: "Comment", type: "text" },
    "paths.digipeaterPaths": { label: "APRS path", type: "path-list" },
    "digipeater.selector": {
      label: "Digipeater",
      type: "select",
      options: [
        { value: "01", label: "Disabled" },
        { value: "11", label: "WIDE1" },
      ],
    },
    "digipeater.enabled": { label: "Digipeater enabled", type: "boolean", editable: false },
    "digipeater.alias": { label: "Digipeater alias", type: "select", editable: false },
    "digipeater.forwardDelayMs": { label: "Forward delay", type: "number", unit: "ms" },
  },
};

describe("Configuration change summary", () => {
  it("returns only changed APRS values in compact display form", () => {
    const before = {
      identity: { callsign: "N0CALL", ssid: 9 },
      text: { comment: "old", status: "ready" },
      paths: { digipeaterPaths: ["WIDE1-1", "WIDE2-1", null] },
      digipeater: { selector: "01", enabled: false, alias: null, forwardDelayMs: 300 },
    };
    const after = {
      identity: { callsign: "LB2KK", ssid: 7 },
      text: { comment: "new", status: "ready" },
      paths: { digipeaterPaths: ["WIDE1-1", "WIDE2-1", null] },
      digipeater: { selector: "11", enabled: true, alias: "11", forwardDelayMs: 120 },
    };

    expect(configChangeSummary(schema, before, after, { prefixes: ["identity.", "text.", "paths.", "digipeater."] })).toEqual([
      { label: "Callsign", path: "identity.callsign", before: "N0CALL", after: "LB2KK" },
      { label: "SSID", path: "identity.ssid", before: "9", after: "7" },
      { label: "Comment", path: "text.comment", before: "old", after: "new" },
      { label: "Digipeater", path: "digipeater.selector", before: "Disabled", after: "WIDE1" },
      { label: "Forward delay", path: "digipeater.forwardDelayMs", before: "300 ms", after: "120 ms" },
    ]);
  });

  it("returns no changes when the DTOs are equivalent", () => {
    expect(configChangeSummary(schema, { identity: { callsign: "LB2KK", ssid: null } }, { identity: { callsign: "LB2KK", ssid: 0 } }, { prefixes: ["identity."] })).toEqual([
      { label: "SSID", path: "identity.ssid", before: "(empty)", after: "0" },
    ]);
  });
});
