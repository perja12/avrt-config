import { describe, expect, it } from "vitest";
import { templateTargetChanged } from "../src/tracker-template/preflight.js";

describe("template write preflight", () => {
  it("detects a changed raw capture", () => {
    const baseline = { sameRecordsAs: (current) => current === baseline };
    expect(templateTargetChanged(baseline, baseline)).toBe(false);
    expect(templateTargetChanged(baseline, {})).toBe(true);
  });

  it("requires a complete baseline and current capture", () => {
    expect(templateTargetChanged(null, {})).toBe(true);
    expect(templateTargetChanged({}, {})).toBe(true);
  });
});
