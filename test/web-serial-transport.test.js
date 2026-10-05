import { describe, expect, it, vi } from "vitest";

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
