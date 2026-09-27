import { describe, expect, it } from "vitest";

import { supportsWebSerial } from "../src/ui/browser-capabilities.js";

describe("browser capabilities", () => {
  it("detects Web Serial support", () => {
    expect(supportsWebSerial({ serial: {} })).toBe(true);
    expect(supportsWebSerial({})).toBe(false);
    expect(supportsWebSerial(null)).toBe(false);
  });
});
