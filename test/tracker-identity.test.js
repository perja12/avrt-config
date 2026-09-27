import { describe, expect, it } from "vitest";

import { formatTrackerIdentity } from "../src/ui/tracker-identity.js";

describe("Tracker identity display", () => {
  it.each([
    [{ callsign: "LB2KK", ssid: 7 }, "LB2KK-7"],
    [{ callsign: "LB2KK", ssid: 0 }, "LB2KK"],
    [{ callsign: "LB2KK", ssid: null }, "LB2KK"],
    [{ callsign: "", ssid: 7 }, null],
    [null, null],
  ])("formats %j as %j", (identity, expected) => {
    expect(formatTrackerIdentity(identity)).toBe(expected);
  });
});
