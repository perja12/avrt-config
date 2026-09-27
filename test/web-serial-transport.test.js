import { describe, expect, it } from "vitest";

import { DEBUGPROBE_USB_IDS, WebSerialTransport } from "../src/tracker-serial/index.js";

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
