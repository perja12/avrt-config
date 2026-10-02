const MOCK_CONFIG_TEXT = `
00=AVRT5 20210404\r
01=LB2KK7\r
02=4\r
03=1\r
04=1\r
06=//\r
07=5\r
08=0030\r
09=AP510 mock status\r
10=AP510 mock tracker\r
12=01\r
13=0\r
14=0PP\r
15=0\r
16=144.8000\r
17=1\r
18=0100300060010240028005\r
19=0\r
20=0\r
21=6\r
22=8\r
23=1\r
24=0\r
25=WIDE1 1\r
26=WIDE2 1\r
27=0      \r
28=511111010001010\r
29=000030//[/[/[/5\r
30=Emergency\r
31=001008000\r
`;

export class MockTrackerSerialSession {
  constructor({ onEvent = () => {}, scenario = "normal" } = {}) {
    this.onEvent = onEvent;
    this.scenario = scenario;
    this.connected = false;
    this.rawConfig = new TextEncoder().encode(MOCK_CONFIG_TEXT);
    if (scenario === "missing-kept") {
      this.rawConfig = new TextEncoder().encode(MOCK_CONFIG_TEXT
        .replace("09=AP510 mock status", "09=")
        .replace("10=AP510 mock tracker", "10="));
    } else if (scenario === "unsupported") {
      this.rawConfig = new TextEncoder().encode(MOCK_CONFIG_TEXT.replace("00=AVRT5 20210404", "00=AVRT5 20991231"));
    }
  }

  async open() {
    await delay(180);
    this.connected = true;
  }

  async close() {
    await delay(100);
    this.connected = false;
  }

  async readConfig({ signal } = {}) {
    if (this.scenario === "timeout") throw new Error("Mock tracker did not answer setup probes");

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      this.#emit({
        type: "status",
        phase: "probing",
        message: `Sending setup probe ${attempt}/3`,
        detail: { attempt, maxAttempts: 3 },
      });
      await delay(280, signal);
    }
    this.#emit({ type: "status", phase: "setup-detected", message: "Setup response detected (mock tracker)" });
    await delay(180, signal);
    this.#emit({
      type: "status",
      phase: "capture-complete",
      message: `Configuration capture received (${this.rawConfig.length} bytes)`,
      detail: { bytesReceived: this.rawConfig.length, variant: "new" },
    });
    return this.rawConfig.slice();
  }

  async writeConfig(records, { signal } = {}) {
    await delay(220, signal);
    const lines = records.map((record) => concatBytes([
      new TextEncoder().encode(`${record.key}=`),
      record.value,
      new Uint8Array([0x0d, 0x0a]),
    ]));
    this.rawConfig = concatBytes(lines);
    return new TextEncoder().encode("OK");
  }

  #emit(event) {
    this.onEvent(event);
  }
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Operation cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error("Operation cancelled"));
    }, { once: true });
  });
}

function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
