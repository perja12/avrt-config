export const DEBUGPROBE_USB_IDS = Object.freeze({ usbVendorId: 0x2e8a, usbProductId: 0x000c });

export class WebSerialTransport {
  constructor({ serial = globalThis.navigator?.serial, port = null } = {}) {
    this.serial = serial;
    this.port = port;
    this.reader = null;
    this.readLoopPromise = null;
    this.readQueue = [];
    this.waitingReads = [];
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
    await this.port.open({
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      flowControl: "none",
      bufferSize: 1024,
      ...options.port,
    });

    const info = this.port.getInfo?.() ?? {};
    const isDebugprobe =
      info.usbVendorId === DEBUGPROBE_USB_IDS.usbVendorId &&
      info.usbProductId === DEBUGPROBE_USB_IDS.usbProductId;
    await this.setSignals({ dataTerminalReady: isDebugprobe, requestToSend: false });
    this.closed = false;
    this.lastReadError = null;
    this.#startReadLoop();
  }

  async close() {
    if (!this.port) return;
    this.closed = true;
    for (const waiter of this.waitingReads.splice(0)) waiter.resolve(new Uint8Array());
    await this.reader?.cancel();
    await this.readLoopPromise;
    try {
      await this.setSignals({ dataTerminalReady: false, requestToSend: false });
    } catch (_) {
      // Device may already be gone.
    }
    await this.port.close();
    this.port = null;
    this.reader = null;
    this.readLoopPromise = null;
    this.readQueue = [];
  }

  async setSignals(signals) {
    await this.port?.setSignals?.(signals);
  }

  async write(bytes) {
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  async read({ timeoutMs, signal } = {}) {
    if (this.readQueue.length > 0) return this.readQueue.shift();
    if (this.closed) return new Uint8Array();

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
    if (!this.port?.readable || this.readLoopPromise) return;
    this.reader = this.port.readable.getReader();
    this.readLoopPromise = this.#readLoop();
  }

  async #readLoop() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value?.length) this.#pushReadChunk(value);
      }
    } catch (error) {
      this.lastReadError = error;
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      this.closed = true;
      for (const waiter of this.waitingReads.splice(0)) waiter.resolve(new Uint8Array());
    }
  }

  #pushReadChunk(chunk) {
    const waiter = this.waitingReads.shift();
    if (waiter) waiter.resolve(chunk);
    else this.readQueue.push(chunk);
  }
}
