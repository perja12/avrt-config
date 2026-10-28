import { bytesToBase64 } from "../tracker-config/bytes.js";

export function createSessionTrace({ build, mode, now = () => Date.now(), navigatorLike = globalThis.navigator } = {}) {
  const createdAt = new Date(now()).toISOString();
  const events = [];
  const environment = {
    user_agent: navigatorLike?.userAgent ?? null,
    platform: navigatorLike?.userAgentData?.platform ?? navigatorLike?.platform ?? null,
    web_serial_available: Boolean(navigatorLike?.serial),
  };
  let readSummary = null;

  function record(source) {
    let entry = null;
    if (source.type === "operation-started" && source.operation === "read-config") {
      readSummary = { started_at_ms: now(), setup_probes: 0, tx_bytes: 0, rx_bytes: 0, empty_reads: 0, transport_rx_bytes: 0 };
    }
    if (readSummary && source.type === "serial") {
      const serial = source.event;
      if (serial.type === "status" && serial.phase === "probing") readSummary.setup_probes += 1;
      if (serial.type === "tx") readSummary.tx_bytes += serial.bytes.length;
      if (serial.type === "rx-arrived") readSummary.transport_rx_bytes += serial.bytes.length;
      if (serial.type === "rx") {
        readSummary.rx_bytes += serial.bytes.length;
        if (!serial.bytes.length) readSummary.empty_reads += 1;
      }
    }

    if (source.type === "serial") {
      const serial = source.event;
      if (serial.type === "tx" || serial.type === "rx" || serial.type === "rx-arrived") {
        entry = {
          type: serial.type,
          bytes_base64: bytesToBase64(serial.bytes),
          byte_length: serial.bytes.length,
        };
        if (serial.label !== undefined) entry.label = serial.label;
        if (serial.timeoutMs !== undefined) entry.timeout_ms = serial.timeoutMs;
        if (serial.elapsedMs !== undefined) entry.elapsed_ms = serial.elapsedMs;
        if (serial.receivedAt !== undefined) entry.received_at = serial.receivedAt;
        if (serial.receiveSequence !== undefined) entry.receive_sequence = serial.receiveSequence;
        if (serial.queued !== undefined) entry.queued = serial.queued;
        if (serial.queueAgeMs !== undefined) entry.queue_age_ms = serial.queueAgeMs;
      } else if (serial.type === "status" || serial.type === "progress" || serial.type === "transport") {
        entry = { type: `serial-${serial.type}`, phase: serial.phase };
        if (serial.message !== undefined) entry.message = serial.message;
        if (serial.cancellable !== undefined) entry.cancellable = serial.cancellable;
        if (serial.detail !== undefined) entry.detail = structuredClone(serial.detail);
        if (serial.bytesReceived !== undefined) entry.bytes_received = serial.bytesReceived;
      }
    } else if (source.type === "raw-config-read") {
      entry = {
        type: "configuration-capture",
        purpose: source.purpose,
        protocol_variant: source.protocolVariant,
        bytes_base64: bytesToBase64(source.rawBytes),
        byte_length: source.rawBytes.length,
      };
    } else if (["operation-started", "operation-completed", "operation-failed"].includes(source.type)) {
      entry = { type: source.type, operation: source.operation };
      if (source.cancellable !== undefined) entry.cancellable = source.cancellable;
      if (source.error) entry.error = { name: source.error.name, message: source.error.message };
    } else if (source.type === "config-loaded" || source.type === "config-written") {
      entry = { type: source.type, diagnostics: source.config.toDebugJSON() };
    } else if (source.type === "state") {
      entry = { type: "state", previous: source.previous, state: source.state };
    } else if (source.type === "status") {
      entry = { type: "status", phase: source.phase, message: source.message };
    }

    if (readSummary && source.operation === "read-config" && ["operation-completed", "operation-failed"].includes(source.type)) {
      const { started_at_ms, ...counts } = readSummary;
      entry.read_summary = { ...counts, elapsed_ms: Math.max(0, now() - started_at_ms) };
      readSummary = null;
    }

    if (entry) events.push({ sequence: events.length + 1, at: new Date(now()).toISOString(), ...entry });
  }

  return {
    record,
    get hasEvents() { return events.length > 0; },
    snapshot() {
      return {
        format: "ap510-session-trace",
        version: 1,
        created_at: createdAt,
        app_build: build,
        mode,
        environment: structuredClone(environment),
        events: structuredClone(events),
      };
    },
  };
}
