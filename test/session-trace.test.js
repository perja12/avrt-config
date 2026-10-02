import { describe, expect, it } from "vitest";

import { createSessionTrace } from "../src/diagnostics/session-trace.js";

describe("session trace", () => {
  it("preserves byte chunks, empty reads, captures, and failures in order", () => {
    let time = Date.parse("2026-10-02T12:00:00.000Z");
    const trace = createSessionTrace({ build: "test-build", mode: "web-serial", now: () => time++ });
    const sent = Uint8Array.from([0x40, 0x53, 0x00]);
    const received = Uint8Array.from([0xff, 0x00, 0x0d, 0x0a]);

    trace.record({ type: "operation-started", operation: "read-config" });
    trace.record({ type: "serial", event: { type: "tx", label: "setup", bytes: sent } });
    trace.record({ type: "serial", event: { type: "rx", bytes: new Uint8Array(), timeoutMs: 250 } });
    trace.record({ type: "serial", event: { type: "rx", bytes: received, timeoutMs: 250 } });
    trace.record({ type: "raw-config-read", purpose: "read", protocolVariant: "legacy", rawBytes: received });
    trace.record({ type: "operation-failed", operation: "read-config", error: new Error("bad capture") });
    sent[0] = 0;
    received[0] = 0;

    const result = trace.snapshot();
    expect(result).toMatchObject({ format: "ap510-session-trace", version: 1, app_build: "test-build", mode: "web-serial" });
    expect(result.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.events[1]).toMatchObject({ type: "tx", bytes_base64: "QFMA", byte_length: 3 });
    expect(result.events[2]).toMatchObject({ type: "rx", bytes_base64: "", byte_length: 0, timeout_ms: 250 });
    expect(result.events[3]).toMatchObject({ type: "rx", bytes_base64: "/wANCg==", byte_length: 4 });
    expect(result.events[4]).toMatchObject({ type: "configuration-capture", purpose: "read", protocol_variant: "legacy", bytes_base64: "/wANCg==" });
    expect(result.events[5]).toMatchObject({ type: "operation-failed", error: { name: "Error", message: "bad capture" } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
