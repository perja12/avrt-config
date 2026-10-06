import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DISPLAY_COMMANDS,
  ProtocolVariant,
  SETUP_COMMANDS,
  TrackerSerialCancelledError,
  TrackerSerialNoResponseError,
  TrackerSerialIncompleteResponseError,
  TrackerSerialSession,
  TrackerSerialUploadError,
  detectSetupVariant,
  extractConfigurationCapture,
} from "../src/tracker-serial/index.js";

function bytes(text) {
  return Uint8Array.from([...text].map((character) => character.charCodeAt(0)));
}

function text(raw) {
  return String.fromCharCode(...raw);
}

function finalResponse() {
  const fixture = readFileSync(new URL("./fixtures/late_config.ini", import.meta.url), "utf8");
  return bytes("\r\n" + fixture.slice(fixture.indexOf("00="), fixture.indexOf("<end>")).replace(/\r?\n/g, "\r\n"));
}

class FakeTransport {
  constructor(reads = []) {
    this.reads = reads.map((value) => (typeof value === "string" ? bytes(value) : value));
    this.writes = [];
    this.openCalls = [];
    this.closeCalls = 0;
  }

  async open(options) {
    this.openCalls.push(options);
  }

  async close() {
    this.closeCalls += 1;
  }

  async write(data) {
    this.writes.push(data.slice());
  }

  async read() {
    return this.reads.shift() ?? new Uint8Array();
  }
}

class FakeClock {
  constructor(now = 0) {
    this.now = now;
  }

  async sleep(milliseconds) {
    this.now += milliseconds;
  }

  advance(milliseconds) {
    this.now += milliseconds;
  }
}

class BootWindowTrackerTransport {
  constructor({ clock, bootAtMs, setupWindowMs, response = finalResponse() }) {
    this.clock = clock;
    this.bootAtMs = bootAtMs;
    this.setupWindowMs = setupWindowMs;
    this.response = response;
    this.reads = [];
    this.writes = [];
    this.detectedVariant = null;
    this.setupWriteTimes = [];
  }

  async write(data) {
    const written = data.slice();
    const label = text(written);
    this.writes.push(written);

    if (label.includes("SETUP")) {
      this.setupWriteTimes.push(this.clock.now);
      if (this.#isListening()) {
        this.detectedVariant = label.startsWith("\r\n") ? ProtocolVariant.NEW : ProtocolVariant.LEGACY;
        this.reads.push(this.detectedVariant === ProtocolVariant.NEW ? bytes("\r\nSETUP\r\n") : bytes("SETUP"));
      }
    } else if (this.detectedVariant === ProtocolVariant.NEW && label === "\r\nDISP\r\n") {
      this.reads.push(this.response);
    } else if (this.detectedVariant === ProtocolVariant.LEGACY && label === "@DISP") {
      this.reads.push(this.response);
    }
  }

  async read({ timeoutMs = 0 } = {}) {
    if (this.reads.length > 0) return this.reads.shift();
    this.clock.advance(timeoutMs);
    return new Uint8Array();
  }

  #isListening() {
    return this.clock.now >= this.bootAtMs && this.clock.now < this.bootAtMs + this.setupWindowMs;
  }
}

const noDelayClock = Object.freeze({
  async sleep() {},
});

describe("tracker-serial framing", () => {
  it("detects setup variants from response windows", () => {
    expect(detectSetupVariant(bytes("noise\r\nSETUP\r\n"))).toBe(ProtocolVariant.NEW);
    expect(detectSetupVariant(bytes("noise SETUP"))).toBe(ProtocolVariant.LEGACY);
    expect(detectSetupVariant(bytes("noise"))).toBeNull();
  });

  it("extracts configuration captures while preserving leading CRLF", () => {
    const capture = extractConfigurationCapture(bytes("echo\r\n00=FW\r\n01=A\r\n31=Z\r\ntrailer"));

    expect(text(capture)).toBe("\r\n00=FW\r\n01=A\r\n31=Z\r\n");
  });
});

describe("TrackerSerialSession", () => {
  it.each([
    ["missing firmware", "01=N0CALL9\r\n31=001008000\r\n", "firmware record 00"],
    ["empty firmware", "00=\r\n01=N0CALL9\r\n31=001008000\r\n", "firmware record 00"],
    ["missing required field", text(finalResponse()).replace(/02=.*?\r\n/, ""), "missing required keys: 02"],
    ["missing terminal", text(finalResponse()).replace(/31=.*?\r\n/, ""), "expected terminal key 31"],
    ["partial terminal without newline", text(finalResponse()).replace(/31=.*?\r\n/, "31=001"), "complete numbered record"],
    ["short terminal with newline", text(finalResponse()).replace(/31=.*?\r\n/, "31=001\r\n"), "terminal record 31"],
  ])("rejects an incomplete serial capture: %s", async (_label, response, reason) => {
    const events = [];
    const session = new TrackerSerialSession({ transport: new FakeTransport(["\r\nSETUP\r\n", response, "", ""]), onEvent: (event) => events.push(event) });
    let failure;
    try { await session.readConfig({ setupAttempts: 1 }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(TrackerSerialIncompleteResponseError);
    expect(failure.message).toContain(reason);
    expect(text(failure.response)).toBe(response);
    expect(events.some((event) => event.phase === "capture-complete")).toBe(false);
    expect(events.some((event) => event.phase === "capture-incomplete")).toBe(true);
    expect(session.protocolVariant).toBeNull();
  });

  it("accepts a terminal record split across chunks and preserves binary values", async () => {
    const response = bytes(text(finalResponse()).replace(/15=.*?\r\n/, "15=0\x00\xff\r\n").replace(/31=.*?\r\n/, "31=0010\xff\xff\xff\xff0\r\n"));
    const split = response.length - 5;
    const session = new TrackerSerialSession({ transport: new FakeTransport(["\r\nSETUP\r\n", response.slice(0, split), response.slice(split), "", ""]) });
    expect(await session.readConfig({ setupAttempts: 1 })).toEqual(response);
  });

  it("opens and closes the injected transport", async () => {
    const transport = new FakeTransport();
    const session = new TrackerSerialSession({ transport });

    await session.open({ port: "test" });
    await session.close();

    expect(transport.openCalls).toEqual([{ port: "test" }]);
    expect(transport.closeCalls).toBe(1);
  });

  it("reads configuration with the new protocol and emits useful events", async () => {
    const events = [];
    const transport = new FakeTransport(["\r\nSETUP\r\n", finalResponse(), "", ""]);
    const session = new TrackerSerialSession({ transport, onEvent: (event) => events.push(event), clock: noDelayClock });

    const raw = await session.readConfig({ setupAttempts: 1 });

    expect(text(raw)).toBe(text(finalResponse()));
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n"]);
    expect(events.map((event) => event.type)).toContain("tx");
    expect(events.map((event) => event.type)).toContain("rx");
    expect(events.filter((event) => event.type === "rx" && event.bytes.length === 0)).toHaveLength(2);
    expect(events.filter((event) => event.type === "rx").every((event) => event.timeoutMs === 250)).toBe(true);
    expect(events.some((event) => event.type === "status" && event.phase === "setup-detected")).toBe(true);
    expect(events.some((event) => event.type === "status" && event.phase === "capture-complete")).toBe(true);
  });

  it.each([
    ["\r", "\nSETUP\r\n"],
    ["\r\n", "SETUP\r\n"],
    ["noise\r\nS", "ETUP\r\n"],
    ["\r\nSE", "TUP\r\n"],
    ["\r\nSET", "UP\r\n"],
    ["\r\nSETU", "P\r\n"],
    ["\r", "\n", "S", "E", "T", "U", "P"],
  ])("recognizes a new SETUP response split into chunks: %j", async (...chunks) => {
    const transport = new FakeTransport([...chunks, finalResponse(), "", ""]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    expect(text(await session.readConfig({ setupAttempts: 1 }))).toBe(text(finalResponse()));
    expect(session.protocolVariant).toBe(ProtocolVariant.NEW);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n"]);
  });

  it("recognizes a legacy SETUP response split into single bytes", async () => {
    const transport = new FakeTransport(["", ..."SETUP", finalResponse(), "", ""]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    await session.readConfig({ setupAttempts: 2 });
    expect(session.protocolVariant).toBe(ProtocolVariant.LEGACY);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@SETUP", "@DISP"]);
  });

  it("discards a partial response when its probe times out", async () => {
    const transport = new FakeTransport(["\r\nSE", "", "TUP", ""]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    await expect(session.readConfig({ setupAttempts: 3 })).rejects.toBeInstanceOf(TrackerSerialNoResponseError);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@SETUP", "\r\nSETUP\r\n"]);
  });

  it("bounds continuation reads even when noise repeatedly ends in a partial marker", async () => {
    const transport = new FakeTransport(Array(100).fill("noiseS"));
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    await expect(session.readConfig({ setupAttempts: 1 })).rejects.toBeInstanceOf(TrackerSerialNoResponseError);
    expect(transport.reads).toHaveLength(68);
  });

  it("alternates setup probes and reads legacy configuration", async () => {
    const transport = new FakeTransport(["", "SETUP", "00=AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n", "", ""]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });

    const raw = await session.readConfig({ setupAttempts: 2 });

    expect(text(raw)).toBe("00=AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n");
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@SETUP", "@DISP"]);
  });

  it("does not let an earlier new-protocol echo select the legacy probe variant", async () => {
    const transport = new FakeTransport([
      "\r\nSETUP\r\n",
      "\r\nDISP\r\n",
      "",
      "",
      "SETUP",
      "00=AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n",
      "",
      "",
    ]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });

    const raw = await session.readConfig({ setupAttempts: 2 });

    expect(text(raw)).toContain("29=legacy");
    expect(session.protocolVariant).toBe(ProtocolVariant.LEGACY);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n", "@SETUP", "@DISP"]);
  });

  it("retries command echoes until a real configuration arrives", async () => {
    const transport = new FakeTransport([
      "\r\nSETUP\r\n",
      "\r\nDISP\r\n",
      "",
      "",
      "\r\nSETUP\r\n",
      finalResponse(),
      "",
      "",
    ]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });

    const raw = await session.readConfig({ setupAttempts: 2 });

    expect(text(raw)).toBe(text(finalResponse()));
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n", "@SETUP", "\r\nDISP\r\n"]);
  });

  it.each([
    ["setup silence", ["", ""]],
    ["echo-only configuration", ["\r\nSETUP\r\n", "\r\nDISP\r\n", "", "", "", ""]],
  ])("offers recovery steps after %s", async (_label, responses) => {
    const session = new TrackerSerialSession({ transport: new FakeTransport(responses), clock: noDelayClock });
    const result = session.readConfig({ setupAttempts: 2 });
    await expect(result).rejects.toBeInstanceOf(TrackerSerialNoResponseError);
    await expect(result).rejects.toMatchObject({ message: expect.stringContaining("reconnect the port") });
    await expect(result).rejects.toMatchObject({ message: expect.stringContaining("unplug and reconnect the USB cable") });
    await expect(result).rejects.toMatchObject({ message: expect.stringContaining("save the Diagnostics trace before reloading") });
  });

  it("catches a tracker that powers on during the setup probing window", async () => {
    const clock = new FakeClock();
    const transport = new BootWindowTrackerTransport({ clock, bootAtMs: 750, setupWindowMs: 300 });
    const session = new TrackerSerialSession({ transport, clock });

    const raw = await session.readConfig({ setupAttempts: 6, setupReadTimeoutMs: 250 });

    expect(text(raw)).toBe(text(finalResponse()));
    expect(transport.setupWriteTimes).toEqual([0, 250, 500, 750]);
    expect(transport.detectedVariant).toBe(ProtocolVariant.LEGACY);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@SETUP", "\r\nSETUP\r\n", "@SETUP", "@DISP"]);
  });

  it("misses a short setup window when probe timing is too slow", async () => {
    const clock = new FakeClock();
    const transport = new BootWindowTrackerTransport({ clock, bootAtMs: 250, setupWindowMs: 200 });
    const session = new TrackerSerialSession({ transport, clock });

    await expect(session.readConfig({ setupAttempts: 4, setupReadTimeoutMs: 500 })).rejects.toBeInstanceOf(TrackerSerialNoResponseError);

    expect(transport.setupWriteTimes).toEqual([0, 500, 1000, 1500]);
  });

  it("catches the same short setup window when probe timing is fast enough", async () => {
    const clock = new FakeClock();
    const transport = new BootWindowTrackerTransport({ clock, bootAtMs: 250, setupWindowMs: 200 });
    const session = new TrackerSerialSession({ transport, clock });

    const raw = await session.readConfig({ setupAttempts: 5, setupReadTimeoutMs: 100 });

    expect(text(raw)).toBe(text(finalResponse()));
    expect(transport.setupWriteTimes).toEqual([0, 100, 200, 300]);
    expect(transport.detectedVariant).toBe(ProtocolVariant.LEGACY);
  });

  it("cancels before a safe read operation starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const session = new TrackerSerialSession({ transport: new FakeTransport(), clock: noDelayClock });

    await expect(session.readConfig({ signal: controller.signal })).rejects.toBeInstanceOf(TrackerSerialCancelledError);
  });

  it.each([
    ["silence", []],
    ["setup and display echoes", ["\r\nSETUP\r\n", "\r\nDISP\r\n", "", ""]],
    ["incomplete capture", ["\r\nSETUP\r\n", "00=AVRT5 20210404\r\n01=N0CALL9\r\n", "", ""]],
  ])("does not send configuration fields when readiness checking receives %s", async (_label, responses) => {
    const transport = new FakeTransport(responses);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    await expect(session.writeConfig([{ key: "01", value: bytes("N0CALL9") }], { interRecordDelayMs: 0 })).rejects.toThrow("no configuration fields were sent");
    expect(transport.writes.every((chunk) => ["\r\nSETUP\r\n", "@SETUP", "\r\nDISP\r\n", "@DISP"].includes(text(chunk)))).toBe(true);
  });

  it("blocks an upload if firmware differs from the draft baseline", async () => {
    const transport = new FakeTransport(["\r\nSETUP\r\n", finalResponse(), "", ""]);
    const session = new TrackerSerialSession({ transport });
    await expect(session.writeConfig([
      { key: "00", value: bytes("AVRT5 20200605") }, { key: "01", value: bytes("N0CALL9") },
    ])).rejects.toThrow("firmware changed");
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n"]);
  });

  it("blocks an upload if the freshly detected protocol differs", async () => {
    const transport = new FakeTransport(["SETUP", "00=AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n", "", ""]);
    const session = new TrackerSerialSession({ transport });
    await expect(session.writeConfig([{ key: "01", value: bytes("N0CALL9") }], { variant: ProtocolVariant.NEW })).rejects.toThrow("protocol changed");
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@DISP"]);
  });

  it("can cancel readiness checking without sending configuration fields", async () => {
    const controller = new AbortController();
    const transport = new FakeTransport();
    transport.read = async ({ signal }) => {
      controller.abort();
      expect(signal.aborted).toBe(true);
      return new Uint8Array();
    };
    const session = new TrackerSerialSession({ transport });
    await expect(session.writeConfig([{ key: "01", value: bytes("N0CALL9") }], { signal: controller.signal })).rejects.toBeInstanceOf(TrackerSerialCancelledError);
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n"]);
  });

  it("writes new-protocol records and waits for final OK", async () => {
    const transport = new FakeTransport(["\r\nSETUP\r\n", finalResponse(), "", "", "\r\nOK"]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    const records = [
      { key: "00", value: bytes(" AVRT5 20210404") },
      { key: "01", value: bytes("N0CALL9") },
      { key: "09", value: bytes("status") },
    ];

    const acknowledgement = await session.writeConfig(records, { variant: ProtocolVariant.NEW, interRecordDelayMs: 0 });

    expect(text(acknowledgement)).toBe("\r\nOK");
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "\r\nDISP\r\n", "01=N0CALL9\r\n", "09=status\r\n"]);
  });

  it("writes legacy records using field-specific framing", async () => {
    const transport = new FakeTransport(["SETUP", "00=AVRT5 20141008\r\n01=N0CALL9\r\n29=legacy\r\n", "", "", "OK", "OK"]);
    const session = new TrackerSerialSession({ transport, clock: noDelayClock });
    const records = [
      { key: "00", value: bytes("AVRT5 20141008") },
      { key: "09", value: bytes("status") },
      { key: "15", value: bytes("0abc") },
      { key: "16", value: bytes("145.5000") },
    ];

    const acknowledgement = await session.writeConfig(records, { variant: ProtocolVariant.LEGACY, interRecordDelayMs: 0 });

    expect(text(acknowledgement)).toBe("OKOK");
    expect(transport.writes.map(text)).toEqual(["\r\nSETUP\r\n", "@DISP", "@09status\u0000\r\n", "@150abc\u0000\r\n", "@16145.5000"]);
  });

  it("rejects bad write acknowledgements", async () => {
    const session = new TrackerSerialSession({ transport: new FakeTransport(["\r\nSETUP\r\n", finalResponse(), "", "", "NO"]), clock: noDelayClock });

    await expect(
      session.writeConfig([{ key: "01", value: bytes("N0CALL9") }], { variant: ProtocolVariant.NEW, interRecordDelayMs: 0 }),
    ).rejects.toBeInstanceOf(TrackerSerialUploadError);
  });
});
