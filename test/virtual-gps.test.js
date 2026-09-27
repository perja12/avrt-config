import { describe, expect, it } from "vitest";

import { formatFixedPositionPacket, parseFixedPositionPacket } from "../src/tracker-config/index.js";

describe("Virtual GPS fixed-position packets", () => {
  it("parses the packet construct documented in the AP510 manual", () => {
    expect(parseFixedPositionPacket("!3035.00N/11417.00ErPHG1010")).toEqual({
      position: { latitude: 30 + 35 / 60, longitude: 114 + 17 / 60 },
      symbol: { table: "/", code: "r" },
      phg: { powerWatts: 1, heightFeet: 10, gainDb: 1, directivityDegrees: 0 },
    });
  });

  it("formats decimal southern and western coordinates without PHG", () => {
    expect(formatFixedPositionPacket({
      position: { latitude: -33.875, longitude: -151.2 },
      symbol: { table: "\\", code: ">" },
      phg: null,
      advancedRawPacket: null,
    })).toBe("!3352.50S\\15112.00W>");
  });

  it("returns null for malformed packets and incomplete structured values", () => {
    expect(parseFixedPositionPacket("!9060.00N/18100.00E>")).toBeNull();
    expect(formatFixedPositionPacket({
      position: { latitude: 59.9, longitude: null },
      symbol: { table: "/", code: ">" },
    })).toBeNull();
  });
});
