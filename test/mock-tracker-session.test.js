import { describe, expect, it, vi } from "vitest";

import { MockTrackerSerialSession } from "../src/tracker-workflow/mock-session.js";
import { parseTrackerConfig } from "../src/tracker-config/index.js";
import { createBrowserTrackerWorkflow, TrackerWorkflowUnsupportedFirmwareError } from "../src/tracker-workflow/index.js";
import { createSessionTrace } from "../src/diagnostics/session-trace.js";

describe("MockTrackerSerialSession", () => {
  it("provides a missing-kept scenario with empty comment and status fields", async () => {
    const session = new MockTrackerSerialSession({ scenario: "missing-kept" });
    const raw = await session.readConfig();
    const config = parseTrackerConfig(raw);
    expect(config.text.comment).toBe("");
    expect(config.text.status).toBe("");
  });
  it("reads an unsupported mock firmware and blocks writes before upload", async () => {
    const trace = createSessionTrace({ build: "test", mode: "mock:unsupported" });
    const workflow = createBrowserTrackerWorkflow({ mockTracker: "unsupported", onEvent: trace.record });
    const upload = vi.spyOn(workflow.serialSession, "writeConfig");

    await workflow.connect();
    const config = await workflow.readTrackerConfig();

    expect(config.firmware.raw).toBe("AVRT5 20991231");
    expect(config.metadata.profile).toBe("documented-numbered");
    expect(config.metadata.hardwareTested).toBe(false);
    expect(workflow.canWriteFirmware).toBe(false);
    const capture = trace.snapshot().events.find((event) => event.type === "configuration-capture");
    expect(capture).toMatchObject({ purpose: "read", byte_length: config.rawConfig.raw.length });
    expect(Buffer.from(capture.bytes_base64, "base64")).toEqual(Buffer.from(config.rawConfig.raw));
    await expect(workflow.writeTrackerConfig()).rejects.toBeInstanceOf(TrackerWorkflowUnsupportedFirmwareError);
    expect(upload).not.toHaveBeenCalled();
  });
  it("simulates a readable tracker and emits progress events", async () => {
    const events = [];
    const session = new MockTrackerSerialSession({ onEvent: (event) => events.push(event) });

    await session.open();
    const raw = await session.readConfig();
    const config = parseTrackerConfig(raw);

    expect(new TextDecoder().decode(raw)).toContain("00=AVRT5 20210404");
    expect(config.micE).toEqual({ enabled: true, messageType: 5, emergencyMessage: 5 });
    expect(config.chinaMapOffset).toEqual({ enabled: false, longitudeOffset: 0, latitudeOffset: 0, raw: "0PP" });
    expect(config.digipeater).toEqual({ selector: "01", enabled: false, alias: null, forwardDelayMs: 800 });
    expect(events.filter((event) => event.type === "status").map((event) => event.phase)).toEqual([
      "probing",
      "probing",
      "probing",
      "setup-detected",
      "capture-complete",
    ]);
  });

  it("keeps written records for subsequent read-back", async () => {
    const session = new MockTrackerSerialSession();
    await session.open();
    await session.writeConfig([
      { key: "00", value: new TextEncoder().encode("AVRT5 20210404") },
      { key: "31", value: new TextEncoder().encode("001000000") },
    ]);

    expect(new TextDecoder().decode(await session.readConfig())).toContain("31=001000000");
  });
});
