import { concatBytes, trimAsciiWhitespace } from "./bytes.js";
import { COMMAND_LABELS, DISPLAY_COMMANDS, ProtocolVariant, SETUP_COMMANDS } from "./commands.js";
import {
  TrackerSerialCancelledError,
  TrackerSerialIncompleteResponseError,
  TrackerSerialNoResponseError,
  TrackerSerialTimeoutError,
  TrackerSerialUploadError,
} from "./errors.js";
import { detectSetupVariant, extractConfigurationCapture, hasNumberedRecord, isEchoOnly } from "./framing.js";

const DEFAULT_OPTIONS = Object.freeze({
  setupAttempts: 60,
  setupReadTimeoutMs: 250,
  readTimeoutMs: 250,
  idleReads: 2,
  maxReadChunks: 256,
  acknowledgementReads: 12,
});

const SETUP_RESPONSE_PREFIXES = ["\r\nSETUP", "SETUP"].flatMap((marker) =>
  Array.from({ length: marker.length - 1 }, (_, index) => marker.slice(0, index + 1)),
);
const MAX_SETUP_RESPONSE_CHUNKS = 32;

const LEGACY_NUL_TERMINATED_KEYS = new Set(["09", "10", "15"]);

export class TrackerSerialSession {
  constructor({ transport, onEvent = () => {}, clock = defaultClock } = {}) {
    if (!transport) throw new TypeError("transport is required");
    this.transport = transport;
    this.onEvent = onEvent;
    this.clock = clock;
    this.#protocolVariant = null;
  }

  #protocolVariant;

  get protocolVariant() {
    return this.#protocolVariant;
  }

  async open(options = {}) {
    this.#emitStatus("opening", "Opening serial transport", { cancellable: true });
    await this.transport.open?.(options);
    this.#emitStatus("configuring-port", "Configuring serial port", { cancellable: true });
  }

  async close() {
    this.#emitStatus("closing", "Closing serial transport", { cancellable: true });
    await this.transport.close?.();
  }

  async readConfig(options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    validatePositiveInteger(settings.setupAttempts, "setupAttempts");
    validatePositiveInteger(settings.idleReads, "idleReads");
    validatePositiveInteger(settings.maxReadChunks, "maxReadChunks");

    let offset = 0;
    while (offset < settings.setupAttempts) {
      const setup = await this.#probeSetup({ ...settings, offset });
      offset = setup.attempt;
      const response = await this.#requestConfiguration(setup.variant, settings);

      if (isEchoOnly(response, DISPLAY_COMMANDS[setup.variant])) {
        this.#emit("status", { phase: "reading-config", message: "Tracker echoed display command; retrying setup", detail: { attempt: setup.attempt } });
        continue;
      }
      if (!hasNumberedRecord(response)) {
        this.#emit("status", { phase: "reading-config", message: "No configuration records received; retrying setup", detail: { attempt: setup.attempt } });
        continue;
      }

      const capture = extractConfigurationCapture(response);
      if (!capture || capture.length === 0) {
        throw new TrackerSerialIncompleteResponseError("tracker response did not contain a configuration capture", { response });
      }
      this.#protocolVariant = setup.variant;
      this.#emit("status", {
        phase: "capture-complete",
        message: `Configuration capture received (${capture.length} bytes)`,
        detail: { bytesReceived: capture.length, variant: setup.variant },
      });
      return capture;
    }

    throw new TrackerSerialNoResponseError(
      "AP510 returned only command echoes, noise, or silence, not a configuration; start with the tracker off and power it on while probes are running",
    );
  }

  async writeConfig(records, { variant = ProtocolVariant.NEW, signal, interRecordDelayMs = 50, acknowledgementReads = DEFAULT_OPTIONS.acknowledgementReads } = {}) {
    if (interRecordDelayMs < 0) throw new RangeError("interRecordDelayMs may not be negative");
    const writable = [...records].filter((record) => record.key !== "00");
    if (writable.length === 0) throw new TrackerSerialUploadError("configuration contains no writable records");

    this.#throwIfAborted(signal);
    this.#emitStatus("writing", "Writing tracker configuration", { cancellable: false, detail: { recordCount: writable.length, variant } });

    if (variant === ProtocolVariant.NEW) {
      for (const record of writable) {
        const command = concatBytes([asciiRecordPrefix(record.key), record.value, Uint8Array.from([0x0d, 0x0a])]);
        await this.#write(command, `field ${record.key}`, signal);
        if (interRecordDelayMs > 0) await this.clock.sleep(interRecordDelayMs, signal);
      }
      const acknowledgement = await this.#readAcknowledgement({ reads: acknowledgementReads, signal });
      if (!endsWithOk(acknowledgement)) {
        throw new TrackerSerialUploadError("tracker did not acknowledge the upload; verification is required", { response: acknowledgement });
      }
      return acknowledgement;
    }

    const acknowledgements = [];
    for (const record of writable) {
      const suffix = LEGACY_NUL_TERMINATED_KEYS.has(record.key) ? Uint8Array.from([0x00, 0x0d, 0x0a]) : new Uint8Array();
      const command = concatBytes([Uint8Array.from([0x40]), asciiKey(record.key), record.value, suffix]);
      await this.#write(command, `field ${record.key}`, signal);
      if (record.key === "15") continue;
      const acknowledgement = await this.#read({ timeoutMs: DEFAULT_OPTIONS.readTimeoutMs, signal });
      acknowledgements.push(acknowledgement);
      if (!acknowledgement || !endsWithOk(acknowledgement)) {
        throw new TrackerSerialUploadError(`tracker did not acknowledge field ${record.key}; verification is required`, { response: acknowledgement ?? new Uint8Array() });
      }
    }
    return concatBytes(acknowledgements);
  }

  async #probeSetup(settings) {
    const variants = [ProtocolVariant.NEW, ProtocolVariant.LEGACY];

    for (let attempt = settings.offset + 1; attempt <= settings.setupAttempts; attempt += 1) {
      this.#throwIfAborted(settings.signal);
      const variant = variants[(attempt - 1) % variants.length];
      this.#emitStatus("probing", `Sending setup probe ${attempt}/${settings.setupAttempts}`, {
        cancellable: true,
        detail: { attempt, maxAttempts: settings.setupAttempts, variant },
      });
      // Discard input observed before this probe, without waiting or draining
      // responses that arrive while its write is in flight.
      this.transport.discardQueuedInput?.();
      await this.#write(SETUP_COMMANDS[variant], COMMAND_LABELS.setup[variant], settings.signal);
      // Continue reading a partial marker within this probe's time window.
      // Reset the buffer before the next probe so old echoes cannot select it.
      let response = new Uint8Array();
      let detected = null;
      const deadline = performance.now() + settings.setupReadTimeoutMs;
      for (let chunks = 0; chunks < MAX_SETUP_RESPONSE_CHUNKS; chunks += 1) {
        const timeoutMs = chunks === 0 ? settings.setupReadTimeoutMs : Math.max(0, Math.ceil(deadline - performance.now()));
        if (chunks > 0 && timeoutMs === 0) break;
        const chunk = await this.#read({ timeoutMs, signal: settings.signal });
        if (!chunk?.length) break;
        const window = concatBytes([response, chunk]);
        detected = detectSetupVariant(window);
        if (detected) break;
        // Six bytes retain every possible incomplete SETUP marker, including
        // its CRLF prefix, regardless of how much unrelated data arrives.
        response = window.slice(-6);
        const suffix = String.fromCharCode(...response);
        if (!SETUP_RESPONSE_PREFIXES.some((prefix) => suffix.endsWith(prefix))) break;
      }
      if (detected) {
        this.#emitStatus("setup-detected", `Setup response detected (${detected})`, { cancellable: true, detail: { attempt, variant: detected } });
        return { variant: detected, attempt };
      }
    }

    throw new TrackerSerialNoResponseError(
      "AP510 did not answer setup probes; start with the tracker off and power it on while probes are running",
    );
  }

  async #requestConfiguration(variant, settings) {
    this.#emitStatus("reading-config", "Requesting tracker configuration", { cancellable: true, detail: { variant } });
    await this.#write(DISPLAY_COMMANDS[variant], COMMAND_LABELS.display[variant], settings.signal);

    const chunks = [];
    let idleReads = 0;
    for (let readCount = 0; readCount < settings.maxReadChunks; readCount += 1) {
      this.#throwIfAborted(settings.signal);
      const chunk = await this.#read({ timeoutMs: settings.readTimeoutMs, signal: settings.signal });
      if (chunk?.length) {
        chunks.push(chunk);
        idleReads = 0;
        this.#emit("progress", { phase: "reading-config", bytesReceived: concatBytes(chunks).length });
      } else {
        idleReads += 1;
        if (idleReads >= settings.idleReads) break;
      }
    }

    if (idleReads < settings.idleReads) {
      throw new TrackerSerialTimeoutError("configuration read did not reach an idle window before the read limit");
    }
    return concatBytes(chunks);
  }

  async #readAcknowledgement({ reads, signal }) {
    const chunks = [];
    for (let index = 0; index < reads; index += 1) {
      const chunk = await this.#read({ timeoutMs: DEFAULT_OPTIONS.readTimeoutMs, signal });
      if (chunk?.length) chunks.push(chunk);
      const response = concatBytes(chunks);
      if (endsWithOk(response)) return response;
    }
    return concatBytes(chunks);
  }

  async #write(bytes, label, signal) {
    this.#throwIfAborted(signal);
    await this.transport.write(bytes, { signal });
    this.#emit("tx", { bytes, label });
  }

  async #read(options) {
    this.#throwIfAborted(options.signal);
    const startedAt = performance.now();
    let receiveMetadata = {};
    const chunk = await this.transport.read({ ...options, onReceive: (metadata) => { receiveMetadata = metadata; } });
    this.#emit("rx", { bytes: chunk ?? new Uint8Array(), timeoutMs: options.timeoutMs, elapsedMs: Math.round(performance.now() - startedAt), ...receiveMetadata });
    return chunk ?? new Uint8Array();
  }

  #emitStatus(phase, message, extra = {}) {
    this.#emit("status", { phase, message, ...extra });
  }

  #emit(type, event) {
    this.onEvent({ type, ...event });
  }

  #throwIfAborted(signal) {
    if (signal?.aborted) throw new TrackerSerialCancelledError("Operation cancelled");
  }
}

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

function asciiKey(key) {
  return Uint8Array.from([...key].map((character) => character.charCodeAt(0)));
}

function asciiRecordPrefix(key) {
  return concatBytes([asciiKey(key), Uint8Array.from([0x3d])]);
}

function endsWithOk(bytes) {
  const trimmed = trimAsciiWhitespace(bytes);
  return trimmed.length >= 2 && trimmed.at(-2) === 0x4f && trimmed.at(-1) === 0x4b;
}

const defaultClock = Object.freeze({
  sleep(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new TrackerSerialCancelledError("Operation cancelled"));
        return;
      }
      const timeout = setTimeout(resolve, milliseconds);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new TrackerSerialCancelledError("Operation cancelled"));
        },
        { once: true },
      );
    });
  },
});
