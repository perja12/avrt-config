import { describe, expect, it } from "vitest";
import { preflightTemplateWrite, templateTargetChanged } from "../src/tracker-template/preflight.js";

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

  it("keeps edited variable fields through an unchanged tracker re-read", async () => {
    const baseline = { sameRecordsAs: (current) => current === baseline };
    const config = { rawConfig: baseline };
    const candidate = {
      identity: { callsign: "NEW123", ssid: 7 },
      text: { comment: "new comment" },
    };
    const workflow = { readTrackerConfig: async (options) => {
      expect(options).toEqual({ updateDraft: false });
      return config;
    } };

    expect(await preflightTemplateWrite(workflow, baseline, candidate)).toEqual({
      config, changed: false, candidateDto: candidate,
    });
  });

  it("discards the write candidate when the tracker changed", async () => {
    const baseline = { sameRecordsAs: () => false };
    const config = { rawConfig: {} };
    const workflow = { readTrackerConfig: async () => config };

    expect(await preflightTemplateWrite(workflow, baseline, { identity: { callsign: "NEW123" } })).toEqual({
      config, changed: true, candidateDto: null,
    });
  });
});
