import { describe, expect, it, vi } from "vitest";

import { createBrowserTrackerWorkflow } from "../src/tracker-workflow/browser.js";
import { TrackerWorkflow } from "../src/tracker-workflow/workflow.js";
import { createSessionTrace } from "../src/diagnostics/session-trace.js";

import { TrackerSerialSession, DEBUGPROBE_USB_IDS, WebSerialTransport } from "../src/tracker-serial/index.js";

function bytes(text) {
  return Uint8Array.from([...text].map((character) => character.charCodeAt(0)));
}

function text(raw) {
  return String.fromCharCode(...raw);
}

class FakeReader {
  constructor(reads, { rejectOnRead = null } = {}) {
    this.reads = reads;
    this.rejectOnRead = rejectOnRead;
    this.cancelled = false;
    this.released = false;
  }

  async read() {
    if (this.cancelled) return { done: true };
    if (this.rejectOnRead) throw this.rejectOnRead;
    if (this.reads.length > 0) return this.reads.shift();
    return new Promise((resolve) => {
      this.resolvePending = resolve;
    });
  }

  async cancel() {
    this.cancelled = true;
    this.resolvePending?.({ done: true });
  }

  releaseLock() {
    this.released = true;
  }
}

class FakePort {
  constructor({ reads = [], info = {}, readError = null } = {}) {
    this.reader = new FakeReader(reads, { rejectOnRead: readError });
    this.info = info;
    this.openCalls = [];
    this.signalCalls = [];
    this.closeCalls = 0;
    this.writes = [];
    this.readable = {
      getReader: () => this.reader,
    };
    this.writable = {
      getWriter: () => ({
        write: async (bytesToWrite) => this.writes.push(bytesToWrite.slice()),
        releaseLock: () => {},
      }),
    };
  }

  async open(options) {
    this.openCalls.push(options);
  }

  async close() {
    this.closeCalls += 1;
  }

  async setSignals(signals) {
    this.signalCalls.push(signals);
  }

  getInfo() {
    return this.info;
  }
}

describe("WebSerialTransport", () => {
  it.each([false, true])("notifies the browser workflow of device loss while reading=%s", async (reading) => {
    const events = [];
    const port = new FakePort();
    let controller;
    port.readable = new ReadableStream({ start(value) { controller = value; } });
    const workflow = createBrowserTrackerWorkflow({ port, onEvent: (event) => events.push(event) });
    await workflow.connect();
    const pendingRead = reading ? workflow.readTrackerConfig() : null;
    const rejection = pendingRead ? expect(pendingRead).rejects.toThrow() : null;
    port.readable = null;
    controller.error(new DOMException("The device has been lost.", "NetworkError"));
    if (rejection) await rejection;
    else { await Promise.resolve(); await Promise.resolve(); }
    expect(workflow.state).toBe("connection-lost");
    expect(workflow.currentOperation).toBeNull();
    expect(events.some((event) => event.type === "status" && event.phase === "connection-lost")).toBe(true);
    await workflow.disconnect();
    expect(workflow.state).toBe("disconnected");
  });

  it("records idle byte arrival before consumption and correlates its timestamps", async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    try {
      vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
      const trace = createSessionTrace();
      const emit = (event) => trace.record({ type: "serial", event });
      const port = new FakePort({ reads: [{ value: bytes("startup"), done: false }] });
      const transport = new WebSerialTransport({ port, onEvent: emit });
      const session = new TrackerSerialSession({ transport, onEvent: emit });
      await session.open();
      expect(trace.snapshot().events.find((event) => event.type === "rx-arrived")).toMatchObject({
        received_at: "2026-10-05T12:00:00.000Z", receive_sequence: 1, queued: true, bytes_base64: "c3RhcnR1cA==",
      });
      expect(trace.snapshot().events.some((event) => event.type === "rx")).toBe(false);
      vi.advanceTimersByTime(1000);
      let metadata;
      expect(text(await transport.read({ onReceive: (value) => { metadata = value; } }))).toBe("startup");
      emit({ type: "rx", bytes: bytes("startup"), ...metadata });
      const consumed = trace.snapshot().events.find((event) => event.type === "rx");
      expect(consumed).toMatchObject({ received_at: "2026-10-05T12:00:00.000Z", at: "2026-10-05T12:00:01.000Z", receive_sequence: 1, queued: true, queue_age_ms: 1000 });
      await session.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards stale setup markers but keeps fresh responses arriving during the write", async () => {
    const trace = createSessionTrace();
    const emit = (event) => trace.record({ type: "serial", event });
    const port = new FakePort();
    let controller;
    port.readable = new ReadableStream({ start(value) { controller = value; } });
    port.writable = new WritableStream({
      write(chunk) {
        port.writes.push(chunk);
        if (text(chunk) === "\r\nSETUP\r\n") controller.enqueue(bytes("SETUP"));
        if (text(chunk) === "@DISP") controller.enqueue(bytes("00= AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n"));
      },
    });
    const transport = new WebSerialTransport({ port, onEvent: emit });
    const session = new TrackerSerialSession({ transport, onEvent: emit });
    await session.open();
    controller.enqueue(bytes("\r\nSETUP\r\n"));
    await Promise.resolve();
    expect(transport.readQueue).toHaveLength(1);
    const capture = await session.readConfig({ setupAttempts: 1, readTimeoutMs: 1 });
    expect(text(capture)).toContain("01=N0CALL9");
    expect(session.protocolVariant).toBe("legacy");
    expect(port.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@DISP"]);
    const events = trace.snapshot().events;
    expect(events.find((event) => event.phase === "queued-input-discarded").detail).toMatchObject({ byteLength: 9, receiveSequences: [1] });
    expect(events.filter((event) => event.type === "rx" && event.byte_length).map((event) => event.receive_sequence)).toEqual([2, 3]);
    expect(events.filter((event) => event.type === "rx-arrived")).toHaveLength(3);
    await session.close();
  });

  it("discards stale partial markers before they can prefix a fresh legacy response", async () => {
    const port = new FakePort({ reads: [{ value: bytes("\r\n"), done: false }] });
    const transport = new WebSerialTransport({ port });
    await transport.open();
    transport.discardQueuedInput();
    port.reader.resolvePending({ value: bytes("SETUP"), done: false });
    await Promise.resolve();
    expect(text(await transport.read({ timeoutMs: 1 }))).toBe("SETUP");
    await transport.close();
  });

  it("opens AP510 serial defaults and asserts DTR for Debugprobe only", async () => {
    const port = new FakePort({ info: DEBUGPROBE_USB_IDS });
    const transport = new WebSerialTransport({ port });

    await transport.open();
    await transport.close();

    expect(port.openCalls[0]).toMatchObject({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      flowControl: "none",
    });
    expect(port.signalCalls[0]).toEqual({ dataTerminalReady: true, requestToSend: false });
    expect(port.signalCalls.at(-1)).toEqual({ dataTerminalReady: false, requestToSend: false });
    expect(port.closeCalls).toBe(1);
    expect(port.reader.released).toBe(true);
  });

  it("queues read chunks and allows timeout reads without cancelling the stream", async () => {
    const port = new FakePort({
      reads: [{ value: bytes("abc"), done: false }],
    });
    const transport = new WebSerialTransport({ port });

    await transport.open();
    await Promise.resolve();

    expect(text(await transport.read({ timeoutMs: 1 }))).toBe("abc");
    expect(await transport.read({ timeoutMs: 1 })).toEqual(new Uint8Array());
    expect(port.reader.cancelled).toBe(false);

    await transport.close();
  });

  it("writes through the current port writer", async () => {
    const port = new FakePort();
    const transport = new WebSerialTransport({ port });

    await transport.write(bytes("SETUP"));

    expect(port.writes.map(text)).toEqual(["SETUP"]);
  });

  it("exports receive errors and unavailable reads through the session trace", async () => {
    const trace = createSessionTrace({ mode: "web-serial" });
    const error = new DOMException("UART framing error", "FramingError");
    const port = new FakePort({ info: DEBUGPROBE_USB_IDS, readError: error });
    const transport = new WebSerialTransport({ port, onEvent: (event) => trace.record({ type: "serial", event }) });
    await transport.open();
    await transport.readLoopPromise;
    await expect(transport.read({ timeoutMs: 250 })).rejects.toBe(error);
    await transport.close();
    const events = JSON.parse(JSON.stringify(trace.snapshot())).events;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "serial-transport", phase: "opening", detail: expect.objectContaining({ usbInfo: DEBUGPROBE_USB_IDS, portOptions: expect.objectContaining({ baudRate: 9600 }) }) }),
      expect.objectContaining({ phase: "signals-set", detail: { signals: { dataTerminalReady: true, requestToSend: false } } }),
      expect.objectContaining({ phase: "receive-error", detail: expect.objectContaining({ error: { name: "FramingError", message: "UART framing error" } }) }),
      expect.objectContaining({ phase: "receive-loop-ended", detail: expect.objectContaining({ reason: "read-error" }) }),
      expect.objectContaining({ phase: "read-unavailable", detail: expect.objectContaining({ timeoutMs: 250 }) }),
    ]));
  });

  it.each(["FramingError", "ParityError", "BufferOverrunError", "BreakError"])("recovers a pending read after %s using the replacement stream", async (name) => {
    const events = [];
    const port = new FakePort();
    let fail;
    let replacementController;
    const replacement = new ReadableStream({ start(controller) { replacementController = controller; } });
    port.readable = new ReadableStream({ start(controller) { fail = controller; } });
    const transport = new WebSerialTransport({ port, onEvent: (event) => events.push(event) });
    await transport.open();
    const reading = transport.read({ timeoutMs: 250 });
    port.readable = replacement;
    fail.error(new DOMException("UART error", name));
    replacementController.enqueue(bytes("SETUP"));
    expect(text(await reading)).toBe("SETUP");
    expect(transport.closed).toBe(false);
    expect(transport.lastReadError).toBeNull();
    expect(events.some((event) => event.phase === "receive-recovered")).toBe(true);
    await transport.write(bytes("DISP"));
    await transport.close();
    expect(replacement.locked).toBe(false);
  });

  it("does not recover fatal device loss even if a stream remains available", async () => {
    const port = new FakePort();
    let controller;
    port.readable = new ReadableStream({ start(value) { controller = value; } });
    const transport = new WebSerialTransport({ port });
    await transport.open();
    const reading = transport.read({ timeoutMs: 250 });
    const error = new DOMException("The device has been lost.", "NetworkError");
    const rejection = expect(reading).rejects.toBe(error);
    port.readable = new ReadableStream();
    controller.error(error);
    await rejection;
    expect(transport.closed).toBe(true);
    await transport.close();
  });

  it("limits consecutive recoveries without received data", async () => {
    const events = [];
    const port = new FakePort();
    let currentController;
    const newStream = () => new ReadableStream({ start(controller) { currentController = controller; } });
    port.readable = newStream();
    const transport = new WebSerialTransport({ port, onEvent: (event) => events.push(event) });
    await transport.open();
    const reading = transport.read({ timeoutMs: 250 });
    const rejection = expect(reading).rejects.toThrow("UART error");
    for (let index = 0; index < 4; index += 1) {
      const previousController = currentController;
      port.readable = newStream();
      previousController.error(new DOMException("UART error", "FramingError"));
      await Promise.resolve();
      await Promise.resolve();
    }
    await rejection;
    expect(events.filter((event) => event.phase === "receive-recovered")).toHaveLength(3);
    await transport.close();
  });

  it("allows cancellation and disconnect after receive recovery", async () => {
    const port = new FakePort();
    let controller;
    port.readable = new ReadableStream({ start(value) { controller = value; } });
    const transport = new WebSerialTransport({ port });
    await transport.open();
    port.readable = new ReadableStream();
    controller.error(new DOMException("UART error", "FramingError"));
    await Promise.resolve();
    const abort = new AbortController();
    const reading = transport.read({ timeoutMs: 250, signal: abort.signal });
    const rejection = expect(reading).rejects.toThrow("Cancelled");
    abort.abort(new Error("Cancelled"));
    await rejection;
    await transport.close();
    expect(transport.port).toBeNull();
  });

  it("distinguishes unexpected stream endings from an intentional close", async () => {
    for (const unexpected of [true, false]) {
      const events = [];
      const port = new FakePort({ reads: unexpected ? [{ done: true }] : [] });
      const transport = new WebSerialTransport({ port, onEvent: (event) => events.push(event) });
      await transport.open();
      if (unexpected) await transport.readLoopPromise;
      await transport.close();
      expect(events.find((event) => event.phase === "receive-loop-ended").detail.reason).toBe(unexpected ? "stream-ended" : "close-requested");
      expect(events.some((event) => event.phase === "receive-error")).toBe(false);
    }
  });

  it("cancels a read stuck in a serial write and allows disconnect", async () => {
    const port = new FakePort();
    let finishWrite;
    let released = false;
    port.writable.getWriter = () => ({
      write: () => new Promise((resolve) => { finishWrite = resolve; }),
      abort: async () => {},
      releaseLock: () => { released = true; },
    });
    const transport = new WebSerialTransport({ port });
    const workflow = new TrackerWorkflow({ serialSession: new TrackerSerialSession({ transport }) });
    await workflow.connect();
    const reading = workflow.readTrackerConfig();
    const rejection = expect(reading).rejects.toThrow("Cancelled by user");
    expect(workflow.cancelOperation("Cancelled by user")).toBe(true);
    await rejection;
    expect(workflow.currentOperation).toBeNull();
    expect(released).toBe(true);
    await workflow.disconnect();
    expect(workflow.state).toBe("disconnected");
    finishWrite();
    await Promise.resolve();
    expect(workflow.state).toBe("disconnected");
  });

  it("rejects pending writes when the receive stream ends", async () => {
    const port = new FakePort();
    port.writable.getWriter = () => ({ write: () => new Promise(() => {}), abort: async () => {}, releaseLock: () => {} });
    const transport = new WebSerialTransport({ port });
    await transport.open();
    const writing = transport.write(bytes("SETUP"));
    const rejection = expect(writing).rejects.toThrow("Serial receive stream ended");
    port.reader.resolvePending({ done: true });
    await rejection;
    await transport.close();
  });

  it("times out a stalled write and releases its writer", async () => {
    vi.useFakeTimers();
    try {
      const port = new FakePort();
      const releaseLock = vi.fn();
      port.writable.getWriter = () => ({ write: () => new Promise(() => {}), abort: async () => {}, releaseLock });
      const transport = new WebSerialTransport({ port });
      await transport.open();
      const writing = transport.write(bytes("SETUP"));
      const rejection = expect(writing).rejects.toThrow("Serial write timed out");
      await vi.advanceTimersByTimeAsync(3000);
      await rejection;
      expect(releaseLock).toHaveBeenCalled();
      await transport.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["cancel", "timeout"])("aborts a real WritableStream on %s and prevents later writes", async (interruption) => {
    vi.useFakeTimers();
    try {
      let finishWrite;
      const transmitted = [];
      const abort = vi.fn();
      const port = new FakePort();
      port.writable = new WritableStream({
        write(chunk) {
          transmitted.push(text(chunk));
          return new Promise((resolve) => { finishWrite = resolve; });
        },
        abort,
      });
      const controller = new AbortController();
      const transport = new WebSerialTransport({ port });
      await transport.open();
      const writing = transport.write(bytes("first"), { signal: controller.signal });
      const rejection = expect(writing).rejects.toThrow(interruption === "cancel" ? "cancelled" : "timed out");
      await Promise.resolve();
      if (interruption === "cancel") controller.abort(new Error("cancelled"));
      else await vi.advanceTimersByTimeAsync(3000);
      await rejection;
      expect(transport.closed).toBe(true);
      expect(port.writable.locked).toBe(false);
      await expect(transport.write(bytes("second"))).rejects.toThrow("disconnect and reconnect");
      await expect(transport.read({ timeoutMs: 250 })).rejects.toThrow("disconnect and reconnect");
      // A raw writer also cannot enqueue commands while the sink is still stalled.
      const rawWriter = port.writable.getWriter();
      await expect(rawWriter.write(bytes("third"))).rejects.toThrow();
      rawWriter.releaseLock();
      finishWrite();
      await vi.advanceTimersByTimeAsync(0);
      expect(abort).toHaveBeenCalledOnce();
      expect(transmitted).toEqual(["first"]);
      await transport.close();
      // Reopening a fresh stream restores normal operation.
      port.writable = new WritableStream({ write: (chunk) => transmitted.push(text(chunk)) });
      port.reader = new FakeReader([]);
      transport.port = port;
      await transport.open();
      await transport.write(bytes("reconnected"));
      expect(transmitted).toEqual(["first", "reconnected"]);
      await transport.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still closes and clears state after a stream read failure", async () => {
    const readError = new Error("device disconnected");
    const port = new FakePort({ readError });
    const transport = new WebSerialTransport({ port });

    await transport.open();
    await Promise.resolve();
    await transport.close();

    expect(transport.lastReadError).toBe(readError);
    expect(port.signalCalls.at(-1)).toEqual({ dataTerminalReady: false, requestToSend: false });
    expect(port.closeCalls).toBe(1);
    expect(port.reader.released).toBe(true);
    expect(transport.port).toBeNull();
  });
});
