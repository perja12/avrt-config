import { TrackerSerialTimeoutError } from "./errors.js";

const RECOVERABLE_RECEIVE_ERRORS = new Set(["FramingError", "ParityError", "BufferOverrunError", "BreakError"]);
const MAX_CONSECUTIVE_RECEIVE_RECOVERIES = 3;

export const DEBUGPROBE_USB_IDS = Object.freeze({ usbVendorId: 0x2e8a, usbProductId: 0x000c });

export class WebSerialTransport {
  constructor({ serial = globalThis.navigator?.serial, port = null, onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.serial = serial;
    this.port = port;
    this.reader = null;
    this.readLoopPromise = null;
    this.readQueue = [];
    this.waitingReads = [];
    this.pendingWrites = new Set();
    this.closed = false;
    this.lastReadError = null;
  }

  async requestPort(options) {
    if (!this.serial) throw new Error("Web Serial is not available");
    this.port = await this.serial.requestPort(options);
    return this.port;
  }

  async open(options = {}) {
    if (!this.port) await this.requestPort(options.requestPort);
    const portOptions = {
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      flowControl: "none",
      bufferSize: 1024,
      ...options.port,
    };
    this.#diagnostic("opening", { portOptions, usbInfo: this.port.getInfo?.() ?? {} });
    try {
      await this.port.open(portOptions);
    } catch (error) {
      this.#diagnostic("open-error", { error: describeError(error) });
      throw error;
    }

    const info = this.port.getInfo?.() ?? {};
    const isDebugprobe =
      info.usbVendorId === DEBUGPROBE_USB_IDS.usbVendorId &&
      info.usbProductId === DEBUGPROBE_USB_IDS.usbProductId;
    await this.setSignals({ dataTerminalReady: isDebugprobe, requestToSend: false });
    this.closed = false;
    this.lastReadError = null;
    this.#diagnostic("opened");
    this.#startReadLoop();
  }

  async close() {
    if (!this.port) return;
    this.#diagnostic("close-requested");
    this.closed = true;
    this.#rejectWrites(new Error("Serial connection closed"));
    for (const waiter of this.waitingReads.splice(0)) waiter.resolve(new Uint8Array());
    await this.reader?.cancel();
    await this.readLoopPromise;
    try {
      await this.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (_) {
      this.#diagnostic("signals-error-during-close", { error: describeError(_) });
      // Device may already be gone.
    }
    await this.port.close();
    this.port = null;
    this.reader = null;
    this.readLoopPromise = null;
    this.readQueue = [];
    this.#diagnostic("closed");
  }

  async setSignals(signals) {
    try {
      await this.port?.setSignals?.(signals);
      this.#diagnostic("signals-set", { signals });
    } catch (error) {
      this.#diagnostic("signals-error", { signals, error: describeError(error) });
      throw error;
    }
  }

  async write(bytes, { signal, timeoutMs = 3000 } = {}) {
    if (signal?.aborted) throw signal.reason ?? new Error("Operation cancelled");
    if (this.closed) throw this.#connectionError();
    const writer = this.port.writable.getWriter();
    let rejectWrite;
    let timeout;
    let wasInterrupted = false;
    const interrupted = new Promise((_, reject) => { rejectWrite = reject; });
    const interruptWrite = (error) => {
      wasInterrupted = true;
      rejectWrite(error);
    };
    const onAbort = () => interruptWrite(signal.reason ?? new Error("Operation cancelled"));
    this.pendingWrites.add(interruptWrite);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => interruptWrite(new TrackerSerialTimeoutError("Serial write timed out; disconnect and reconnect the tracker")), timeoutMs);
    this.#diagnostic("write-started", { byteLength: bytes.length, timeoutMs });
    try {
      await Promise.race([writer.write(bytes), interrupted]);
      this.#diagnostic("write-completed", { byteLength: bytes.length });
    } catch (error) {
      if (wasInterrupted) {
        // Aborting a stream may wait for the in-flight sink write. Start it
        // without waiting so cancellation can still release the workflow.
        this.closed = true;
        this.lastReadError ??= new Error("Serial write interrupted; disconnect and reconnect the tracker");
        this.readQueue = [];
        this.#rejectWrites(error);
        for (const waiter of this.waitingReads.splice(0)) waiter.reject(this.#connectionError());
        this.#diagnostic("write-abort-requested", { error: describeError(error) });
        try {
          Promise.resolve(writer.abort(error)).catch((abortError) => {
            this.#diagnostic("write-abort-error", { error: describeError(abortError) });
          });
        } catch (abortError) {
          this.#diagnostic("write-abort-error", { error: describeError(abortError) });
        }
        this.reader?.cancel().catch((cancelError) => {
          this.#diagnostic("receive-cancel-error", { error: describeError(cancelError) });
        });
      }
      this.#diagnostic("write-error", { byteLength: bytes.length, error: describeError(error) });
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      this.pendingWrites.delete(interruptWrite);
      writer.releaseLock();
    }
  }

  async read({ timeoutMs, signal } = {}) {
    if (signal?.aborted) throw signal.reason ?? new Error("Operation cancelled");
    if (this.closed) {
      this.#diagnostic("read-unavailable", { timeoutMs, error: this.lastReadError ? describeError(this.lastReadError) : null });
      throw this.#connectionError();
    }
    if (this.readQueue.length > 0) return this.readQueue.shift();

    return new Promise((resolve, reject) => {
      let timeout = null;
      const waiter = {
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };
      const cleanup = () => {
        if (timeout !== null) clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        const index = this.waitingReads.indexOf(waiter);
        if (index >= 0) this.waitingReads.splice(index, 1);
      };
      const onAbort = () => waiter.reject(signal.reason ?? new Error("Operation cancelled"));

      if (timeoutMs !== undefined) {
        timeout = setTimeout(() => waiter.resolve(new Uint8Array()), timeoutMs);
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waitingReads.push(waiter);
    });
  }

  #startReadLoop() {
    if (!this.port?.readable || this.readLoopPromise) {
      this.#diagnostic("receive-loop-not-started", { readable: Boolean(this.port?.readable), alreadyRunning: Boolean(this.readLoopPromise) });
      return;
    }
    this.#diagnostic("receive-loop-started");
    this.readLoopPromise = this.#readLoop();
  }

  async #readLoop() {
    let reason = "close-requested";
    let consecutiveRecoveries = 0;
    try {
      while (!this.closed) {
        const stream = this.port?.readable;
        if (!stream) {
          reason = "stream-ended";
          break;
        }
        let recover = false;
        try {
          this.reader = stream.getReader();
          while (!this.closed) {
            const { value, done } = await this.reader.read();
            if (done) {
              reason = this.closed ? "close-requested" : "stream-ended";
              break;
            }
            if (value?.length) {
              consecutiveRecoveries = 0;
              this.#pushReadChunk(value);
            }
          }
        } catch (error) {
          const replacement = this.port?.readable;
          recover = !this.closed && RECOVERABLE_RECEIVE_ERRORS.has(error?.name) &&
            Boolean(replacement) && replacement !== stream &&
            consecutiveRecoveries < MAX_CONSECUTIVE_RECEIVE_RECOVERIES;
          this.#diagnostic("receive-error", {
            error: describeError(error), readable: Boolean(replacement), closeRequested: this.closed, recoverable: recover,
          });
          if (!recover) throw error;
          consecutiveRecoveries += 1;
        } finally {
          this.reader?.releaseLock();
          this.reader = null;
        }
        if (!recover || this.closed) break;
        this.#diagnostic("receive-recovered", { consecutiveRecoveries });
      }
    } catch (error) {
      reason = "read-error";
      this.lastReadError = error;
    } finally {
      this.#diagnostic("receive-loop-ended", { reason, readable: Boolean(this.port?.readable), queuedChunks: this.readQueue.length, waitingReads: this.waitingReads.length });
      this.closed = true;
      this.#rejectWrites(this.#connectionError());
      for (const waiter of this.waitingReads.splice(0)) waiter.reject(this.#connectionError());
    }
  }

  #connectionError() {
    return this.lastReadError ?? new Error("Serial receive stream ended; disconnect and reconnect the tracker");
  }

  #rejectWrites(error) {
    for (const reject of this.pendingWrites) reject(error);
  }

  #diagnostic(phase, detail = {}) {
    this.onEvent({ type: "transport", phase, detail });
  }

  #pushReadChunk(chunk) {
    const waiter = this.waitingReads.shift();
    if (waiter) waiter.resolve(chunk);
    else this.readQueue.push(chunk);
  }
}

function describeError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error) };
}
