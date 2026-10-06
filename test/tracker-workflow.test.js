import { describe, expect, it } from "vitest";

import {
  createBrowserTrackerWorkflow,
  TrackerWorkflow,
  TrackerWorkflowBusyError,
  TrackerWorkflowState,
  TrackerWorkflowStateError,
  TrackerWorkflowUnsupportedFirmwareError,
} from "../src/tracker-workflow/index.js";

function bytes(text) {
  return Uint8Array.from([...text].map((character) => character.charCodeAt(0)));
}

function makeConfig(rawBytes, { validateError = null, dto = null, recordsMatch = true, recordByte = 0x4e, hardwareTested = true } = {}) {
  const config = {
    rawBytes,
    validateSerialCapture() {
      if (validateError) throw validateError;
    },
    toDTO() {
      return structuredClone(dto ?? {
        identity: { callsign: "N0CALL", ssid: 9, display: "N0CALL-9" },
        metadata: { rawSize: rawBytes.length },
      });
    },
  };
  config.rawConfig = {
    profile: { hardwareTested },
    records: [{ key: "01", value: new Uint8Array([recordByte]) }],
    sameRecordsAs(other) {
      return recordsMatch && other?.records?.length === 1 && other.records[0].key === "01" && other.records[0].value[0] === recordByte;
    },
  };
  config.withDTO = (nextDto) => makeConfig(rawBytes, { dto: nextDto, hardwareTested });
  return config;
}

class FakeSerialSession {
  constructor({ raw = bytes("00=FW\r\n31=end\r\n"), readError = null, protocolVariant = null } = {}) {
    this.raw = raw;
    this.readError = readError;
    this.protocolVariant = protocolVariant;
    this.openCalls = [];
    this.closeCalls = 0;
    this.readCalls = [];
    this.writeCalls = [];
    this.pendingRead = null;
  }

  async open(options) {
    this.openCalls.push(options);
  }

  async close() {
    this.closeCalls += 1;
  }

  async readConfig(options) {
    this.readCalls.push(options);
    if (this.readError) throw this.readError;
    if (this.pendingRead) return this.pendingRead(options);
    return this.raw;
  }

  async writeConfig(records, options) {
    this.writeCalls.push({ records, options });
    return bytes("OK");
  }
}

describe("TrackerWorkflow", () => {
  it("marks an idle loaded connection lost and preserves the draft until disconnect", async () => {
    const events = [];
    const session = new FakeSerialSession();
    const workflow = new TrackerWorkflow({ serialSession: session, parseConfig: makeConfig, onEvent: (event) => events.push(event) });
    await workflow.connect();
    await workflow.readTrackerConfig();
    const draft = workflow.draft;
    workflow.handleSerialEvent({ type: "transport", phase: "receive-loop-ended", detail: { reason: "read-error" } });
    expect(workflow.state).toBe(TrackerWorkflowState.CONNECTION_LOST);
    expect(workflow.draft).toBe(draft);
    expect(events.at(-1)).toMatchObject({ type: "status", phase: "connection-lost" });
    await expect(workflow.readTrackerConfig()).rejects.toBeInstanceOf(TrackerWorkflowStateError);
    await expect(workflow.writeTrackerConfig()).rejects.toBeInstanceOf(TrackerWorkflowStateError);
    await workflow.disconnect();
    await workflow.connect();
    expect(workflow.state).toBe(TrackerWorkflowState.CONNECTED);
  });

  it("does not restore loaded state if connection loss races with a completed capture", async () => {
    const session = new FakeSerialSession();
    const workflow = new TrackerWorkflow({ serialSession: session, parseConfig: makeConfig });
    await workflow.connect();
    session.pendingRead = async () => {
      workflow.handleSerialEvent({ type: "transport", phase: "receive-loop-ended", detail: { reason: "stream-ended" } });
      return session.raw;
    };
    await expect(workflow.readTrackerConfig()).rejects.toThrow("Tracker connection lost");
    expect(workflow.state).toBe(TrackerWorkflowState.CONNECTION_LOST);
    expect(workflow.originalConfig).toBeNull();
    expect(workflow.currentOperation).toBeNull();
  });

  it("does not mark recoverable receive errors or intentional closure as connection loss", async () => {
    const workflow = new TrackerWorkflow({ serialSession: new FakeSerialSession() });
    await workflow.connect();
    for (const event of [
      { type: "transport", phase: "receive-error", detail: { recoverable: true } },
      { type: "transport", phase: "receive-recovered" },
      { type: "transport", phase: "receive-loop-ended", detail: { reason: "close-requested" } },
    ]) workflow.handleSerialEvent(event);
    expect(workflow.state).toBe(TrackerWorkflowState.CONNECTED);
    await workflow.disconnect();
    expect(workflow.state).toBe(TrackerWorkflowState.DISCONNECTED);
  });

  it("connects and disconnects through the injected serial session", async () => {
    const events = [];
    const serialSession = new FakeSerialSession();
    const workflow = new TrackerWorkflow({ serialSession, onEvent: (event) => events.push(event) });

    await workflow.connect({ port: "test" });
    await workflow.disconnect();

    expect(serialSession.openCalls).toEqual([{ port: "test" }]);
    expect(serialSession.closeCalls).toBe(1);
    expect(workflow.state).toBe(TrackerWorkflowState.DISCONNECTED);
    expect(events.map((event) => event.type)).toContain("state");
    expect(events.map((event) => event.operation)).toContain("connect");
    expect(events.map((event) => event.operation)).toContain("disconnect");
  });

  it("reads raw bytes, parses config, validates capture, and stores original plus draft", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const events = [];
    const parsedConfig = makeConfig(raw);
    const parseCalls = [];
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession({ raw }),
      parseConfig: (input) => {
        parseCalls.push(input);
        return parsedConfig;
      },
      onEvent: (event) => events.push(event),
    });

    await workflow.connect();
    const config = await workflow.readTrackerConfig();

    expect(config).toBe(parsedConfig);
    expect(parseCalls).toEqual([raw]);
    expect(workflow.originalConfig).toBe(parsedConfig);
    expect(workflow.draft).toEqual({
      identity: { callsign: "N0CALL", ssid: 9, display: "N0CALL-9" },
      metadata: { rawSize: raw.length },
    });
    expect(workflow.state).toBe(TrackerWorkflowState.LOADED);
    expect(events.some((event) => event.type === "config-loaded" && event.config === parsedConfig)).toBe(true);
  });

  it("can read a template target without replacing the existing Configure draft", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const parsedConfig = makeConfig(raw, { dto: { identity: { callsign: "TARGET" } } });
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession({ raw }),
      parseConfig: () => parsedConfig,
    });
    await workflow.connect();
    workflow.draft = { identity: { callsign: "CONFIGURE-DRAFT" } };
    await workflow.readTrackerConfig({ updateDraft: false });
    expect(workflow.draft.identity.callsign).toBe("CONFIGURE-DRAFT");
    expect(workflow.originalConfig.toDTO().identity.callsign).toBe("TARGET");
  });

  it("updates and resets the draft through the shared configuration validator", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const parsedConfig = makeConfig(raw);
    const events = [];
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession({ raw }),
      parseConfig: () => parsedConfig,
      onEvent: (event) => events.push(event),
    });

    await workflow.connect();
    await workflow.readTrackerConfig();

    const valid = workflow.updateDraft({
      ...workflow.draft,
      identity: { ...workflow.draft.identity, callsign: "LB2KK" },
    });
    expect(valid).toEqual({ valid: true, errors: [] });
    expect(workflow.draft.identity.callsign).toBe("LB2KK");
    expect(workflow.draftDirty).toBe(true);

    const invalid = workflow.updateDraft({
      ...workflow.draft,
      tfCard: { format: "3" },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors[0].path).toBe("tfCard.format");

    workflow.resetDraft();
    expect(workflow.draft.identity.callsign).toBe("N0CALL");
    expect(workflow.draftDirty).toBe(false);
    expect(events.map((event) => event.type)).toContain("draft-changed");
    expect(events.map((event) => event.type)).toContain("draft-reset");
  });

  it("allows cancellation during readiness checking but disables it before uploading", async () => {
    const serialSession = new FakeSerialSession();
    const workflow = new TrackerWorkflow({ serialSession, parseConfig: makeConfig });
    await workflow.connect();
    await workflow.readTrackerConfig();
    serialSession.writeConfig = async () => {
      workflow.handleSerialEvent({ type: "status", phase: "checking-setup", message: "Checking setup" });
      expect(workflow.canCancel).toBe(true);
      workflow.handleSerialEvent({ type: "status", phase: "writing", message: "Uploading" });
      expect(workflow.canCancel).toBe(false);
      expect(workflow.cancelOperation()).toBe(false);
      return bytes("OK");
    };
    await workflow.writeTrackerConfig();
    expect(workflow.state).toBe(TrackerWorkflowState.LOADED);
  });

  it("writes a validated draft and replaces the baseline only after acknowledgement", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const parsedConfig = makeConfig(raw);
    const events = [];
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession({ raw }),
      parseConfig: () => parsedConfig,
      onEvent: (event) => events.push(event),
    });

    await workflow.connect();
    await workflow.readTrackerConfig();
    workflow.updateDraft({ ...workflow.draft, identity: { ...workflow.draft.identity, callsign: "LB2KK" } });

    const written = await workflow.writeTrackerConfig();

    expect(written).toBe(workflow.originalConfig);
    expect(workflow.state).toBe(TrackerWorkflowState.LOADED);
    expect(workflow.draftDirty).toBe(false);
    expect(workflow.serialSession.writeCalls).toHaveLength(1);
    expect(workflow.serialSession.readCalls).toHaveLength(2);
    expect(events.filter((event) => event.type === "raw-config-read").map((event) => event.purpose)).toEqual(["read", "verification"]);
  });

  it("blocks writes to an unverified firmware before any serial upload", async () => {
    const raw = bytes("00=AVRT5 20991231\r\n31=end\r\n");
    const serialSession = new FakeSerialSession({ raw });
    const workflow = new TrackerWorkflow({
      serialSession,
      parseConfig: () => makeConfig(raw, { hardwareTested: false }),
    });

    await workflow.connect();
    await workflow.readTrackerConfig();
    expect(workflow.canWriteFirmware).toBe(false);
    await expect(workflow.writeTrackerConfig()).rejects.toBeInstanceOf(TrackerWorkflowUnsupportedFirmwareError);
    expect(serialSession.writeCalls).toHaveLength(0);
    expect(serialSession.readCalls).toHaveLength(1);
    expect(workflow.state).toBe(TrackerWorkflowState.LOADED);
  });

  it("passes the detected legacy protocol variant through to configuration writes", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const parsedConfig = makeConfig(raw);
    const serialSession = new FakeSerialSession({ raw, protocolVariant: "legacy" });
    const workflow = new TrackerWorkflow({
      serialSession,
      parseConfig: () => parsedConfig,
    });

    await workflow.connect();
    await workflow.readTrackerConfig();
    workflow.updateDraft({ ...workflow.draft, identity: { ...workflow.draft.identity, callsign: "LB2KK" } });
    await workflow.writeTrackerConfig();

    expect(serialSession.writeCalls[0].options.variant).toBe("legacy");
  });

  it("rejects a read-back mismatch and keeps the previous baseline", async () => {
    const raw = bytes("00=FW\r\n31=end\r\n");
    const original = makeConfig(raw);
    const mismatch = makeConfig(raw, { recordByte: 0x58 });
    let parseCount = 0;
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession({ raw }),
      parseConfig: () => (++parseCount === 1 ? original : mismatch),
    });

    await workflow.connect();
    await workflow.readTrackerConfig();
    workflow.updateDraft({ ...workflow.draft, identity: { ...workflow.draft.identity, callsign: "LB2KK" } });

    await expect(workflow.writeTrackerConfig()).rejects.toThrow("read-back does not match");
    expect(workflow.state).toBe(TrackerWorkflowState.ERROR);
    expect(workflow.originalConfig).toBe(original);
    expect(workflow.draftDirty).toBe(true);
  });

  it("rejects reads before connection", async () => {
    const workflow = new TrackerWorkflow({ serialSession: new FakeSerialSession() });

    await expect(workflow.readTrackerConfig()).rejects.toBeInstanceOf(TrackerWorkflowStateError);
  });

  it("moves to error when parsing validation fails", async () => {
    const validationError = new Error("bad capture");
    const workflow = new TrackerWorkflow({
      serialSession: new FakeSerialSession(),
      parseConfig: (input) => makeConfig(input, { validateError: validationError }),
    });

    await workflow.connect();
    await expect(workflow.readTrackerConfig()).rejects.toBe(validationError);

    expect(workflow.state).toBe(TrackerWorkflowState.ERROR);
    expect(workflow.lastError).toBe(validationError);
  });

  it("passes an abort signal to reads and can cancel the active read operation", async () => {
    let capturedSignal = null;
    const serialSession = new FakeSerialSession();
    serialSession.pendingRead = ({ signal }) => {
      capturedSignal = signal;
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
    const workflow = new TrackerWorkflow({ serialSession });

    await workflow.connect();
    const readPromise = workflow.readTrackerConfig();
    await Promise.resolve();

    expect(workflow.canCancel).toBe(true);
    expect(workflow.cancelOperation("User cancelled")).toBe(true);
    await expect(readPromise).rejects.toThrow("User cancelled");
    expect(capturedSignal.aborted).toBe(true);
    expect(workflow.state).toBe(TrackerWorkflowState.ERROR);
    expect(workflow.canCancel).toBe(false);
  });

  it("honors an already-aborted signal before starting a read", async () => {
    const abortReason = new Error("Already cancelled");
    const controller = new AbortController();
    controller.abort(abortReason);
    let capturedSignal = null;
    const serialSession = new FakeSerialSession();
    serialSession.pendingRead = ({ signal }) => {
      capturedSignal = signal;
      if (signal.aborted) throw signal.reason;
      throw new Error("read should not receive a live signal");
    };
    const workflow = new TrackerWorkflow({ serialSession });

    await workflow.connect();
    await expect(workflow.readTrackerConfig({ signal: controller.signal })).rejects.toBe(abortReason);

    expect(capturedSignal.aborted).toBe(true);
    expect(capturedSignal.reason).toBe(abortReason);
    expect(workflow.state).toBe(TrackerWorkflowState.ERROR);
    expect(workflow.lastError).toBe(abortReason);
  });

  it("rejects concurrent operations", async () => {
    const serialSession = new FakeSerialSession();
    serialSession.pendingRead = () => new Promise(() => {});
    const workflow = new TrackerWorkflow({ serialSession });

    await workflow.connect();
    void workflow.readTrackerConfig();
    await Promise.resolve();

    await expect(workflow.disconnect()).rejects.toBeInstanceOf(TrackerWorkflowBusyError);
    workflow.cancelOperation();
  });
});

describe("createBrowserTrackerWorkflow", () => {
  it("wires serial events through the workflow event sink", () => {
    const events = [];
    let capturedSessionOptions = null;
    class StubTransport {
      constructor(options) {
        this.options = options;
      }
    }
    class StubSession {
      constructor(options) {
        capturedSessionOptions = options;
      }
    }
    class StubWorkflow {
      constructor(options) {
        this.options = options;
      }
    }

    const workflow = createBrowserTrackerWorkflow({
      serial: "serial-api",
      port: "port",
      onEvent: (event) => events.push(event),
      TransportClass: StubTransport,
      SessionClass: StubSession,
      WorkflowClass: StubWorkflow,
    });

    capturedSessionOptions.onEvent({ type: "status", phase: "probing" });

    expect(capturedSessionOptions.transport.options).toEqual({ serial: "serial-api", port: "port", onEvent: expect.any(Function) });
    expect(workflow.options.serialSession).toBeInstanceOf(StubSession);
    expect(events).toEqual([{ type: "serial", event: { type: "status", phase: "probing" } }]);
  });
});
