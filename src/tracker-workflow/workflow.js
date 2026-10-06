import { getTrackerConfigSchema, parseTrackerConfig, SUPPORTED_WRITE_FIRMWARES, validateTrackerConfigDTO } from "../tracker-config/index.js";
import { TrackerWorkflowBusyError, TrackerWorkflowStateError, TrackerWorkflowUnsupportedFirmwareError, TrackerWorkflowVerificationError } from "./errors.js";
import { TrackerWorkflowState } from "./state.js";

export class TrackerWorkflow {
  constructor({ serialSession, parseConfig = parseTrackerConfig, onEvent = () => {} } = {}) {
    if (!serialSession) throw new TypeError("serialSession is required");
    this.serialSession = serialSession;
    this.parseConfig = parseConfig;
    this.onEvent = onEvent;
    this.state = TrackerWorkflowState.DISCONNECTED;
    this.originalConfig = null;
    this.draft = null;
    this.lastError = null;
    this.currentOperation = null;
    this.protocolVariant = null;
  }

  handleSerialEvent(event) {
    if (event.type === "status" && this.currentOperation?.name === "write-config" && ["checking-setup", "writing"].includes(event.phase)) {
      this.currentOperation.cancellable = event.phase === "checking-setup";
      this.currentOperation.stage = event.phase;
      this.#emitStatus(event.phase, event.message);
    }
    const connectionEnded = event.type === "transport" && (
      (event.phase === "receive-loop-ended" && event.detail?.reason !== "close-requested") ||
      event.phase === "write-abort-requested"
    );
    if (!connectionEnded || [TrackerWorkflowState.DISCONNECTED, TrackerWorkflowState.DISCONNECTING, TrackerWorkflowState.CONNECTION_LOST].includes(this.state)) return;
    this.lastError = new Error("Tracker connection lost. Click Disconnect, then Connect to reopen the serial connection.");
    this.currentOperation?.controller.abort(this.lastError);
    this.#setState(TrackerWorkflowState.CONNECTION_LOST);
    this.#emitStatus("connection-lost", this.lastError.message);
  }

  get canCancel() {
    return Boolean(this.currentOperation?.cancellable);
  }

  get draftDirty() {
    if (!this.originalConfig || !this.draft) return false;
    return JSON.stringify(this.draft) !== JSON.stringify(this.originalConfig.toDTO());
  }

  get canWriteFirmware() {
    return this.originalConfig?.rawConfig?.profile?.hardwareTested === true;
  }

  getConfigSchema() {
    return getTrackerConfigSchema();
  }

  updateDraft(draft) {
    const nextDraft = structuredClone(draft);
    const validation = validateTrackerConfigDTO(nextDraft);
    this.draft = nextDraft;
    this.#emit({ type: "draft-changed", draft: structuredClone(nextDraft), validation });
    return validation;
  }

  resetDraft() {
    if (!this.originalConfig) return null;
    this.draft = this.originalConfig.toDTO();
    const validation = validateTrackerConfigDTO(this.draft);
    this.#emit({ type: "draft-reset", draft: structuredClone(this.draft), validation });
    return this.draft;
  }

  async connect(options = {}) {
    this.#assertIdle();
    this.#setState(TrackerWorkflowState.CONNECTING);
    return this.#runOperation("connect", { cancellable: false }, async () => {
      this.#emitStatus("opening", "Opening tracker connection");
      await this.serialSession.open?.(options);
      if (this.state === TrackerWorkflowState.CONNECTION_LOST) throw this.lastError;
      this.#setState(TrackerWorkflowState.CONNECTED);
      this.#emitStatus("connected", "Tracker connection opened");
    });
  }

  async disconnect() {
    this.#assertIdle();
    this.#setState(TrackerWorkflowState.DISCONNECTING);
    return this.#runOperation("disconnect", { cancellable: false }, async () => {
      this.#emitStatus("disconnecting", "Closing tracker connection");
      await this.serialSession.close?.();
      this.originalConfig = null;
      this.draft = null;
      this.#setState(TrackerWorkflowState.DISCONNECTED);
      this.#emitStatus("disconnected", "Tracker connection closed");
    });
  }

  async readTrackerConfig({ signal, updateDraft = true } = {}) {
    this.#assertIdle();
    this.#assertState([TrackerWorkflowState.CONNECTED, TrackerWorkflowState.LOADED, TrackerWorkflowState.ERROR], "read tracker configuration");
    this.#setState(TrackerWorkflowState.READING);

    return this.#runOperation("read-config", { cancellable: true, signal }, async (operationSignal) => {
      this.#emitStatus("reading", "Reading tracker configuration");
      const rawBytes = await this.serialSession.readConfig({ signal: operationSignal });
      if (this.state === TrackerWorkflowState.CONNECTION_LOST) throw this.lastError;
      this.protocolVariant = this.serialSession.protocolVariant ?? this.serialSession.getProtocolVariant?.() ?? null;
      this.#emit({ type: "raw-config-read", rawBytes, purpose: "read", protocolVariant: this.protocolVariant });

      const config = this.parseConfig(rawBytes);
      config.validateSerialCapture();

      this.originalConfig = config;
      const loadedDraft = config.toDTO();
      if (updateDraft) this.draft = loadedDraft;
      this.#setState(TrackerWorkflowState.LOADED);
      this.#emit({ type: "config-loaded", config, draft: structuredClone(updateDraft ? this.draft : loadedDraft), draftUpdated: updateDraft });
      return config;
    });
  }

  async writeTrackerConfig({ signal, draft = this.draft, updateDraft = true } = {}) {
    this.#assertIdle();
    this.#assertState([TrackerWorkflowState.LOADED], "write tracker configuration");
    if (!this.canWriteFirmware) {
      const firmware = this.originalConfig?.firmware?.raw ?? this.originalConfig?.rawConfig?.firmware?.() ?? "unknown";
      throw new TrackerWorkflowUnsupportedFirmwareError(
        `Writing is blocked for unverified firmware ${firmware}. Supported firmware: ${SUPPORTED_WRITE_FIRMWARES.join(", ")}. Report this version with Diagnostics and Activity at https://github.com/perja12/avrt-config/issues/new`,
      );
    }

    const validation = validateTrackerConfigDTO(draft);
    if (!validation.valid) {
      const error = new TypeError(`cannot write invalid configuration: ${validation.errors[0].message}`);
      error.validation = validation;
      throw error;
    }

    const candidate = this.originalConfig.withDTO(draft);
    this.#setState(TrackerWorkflowState.WRITING);
    return this.#runOperation("write-config", { cancellable: false, signal }, async (operationSignal) => {
      this.#emitStatus("writing", "Writing tracker configuration");
      const writeOptions = { signal: operationSignal };
      if (this.protocolVariant) writeOptions.variant = this.protocolVariant;
      const acknowledgement = await this.serialSession.writeConfig(candidate.rawConfig.records, writeOptions);
      if (this.state === TrackerWorkflowState.CONNECTION_LOST) throw this.lastError;
      this.#emitStatus("verifying", "Reading back tracker configuration for verification");
      const rawBytes = await this.serialSession.readConfig({ signal: operationSignal });
      if (this.state === TrackerWorkflowState.CONNECTION_LOST) throw this.lastError;
      this.#emit({ type: "raw-config-read", rawBytes, purpose: "verification", protocolVariant: this.protocolVariant });
      const verified = this.parseConfig(rawBytes);
      verified.validateSerialCapture();
      if (!candidate.rawConfig.sameRecordsAs(verified.rawConfig)) {
        throw new TrackerWorkflowVerificationError("tracker read-back does not match the configuration that was written", {
          expected: candidate,
          actual: verified,
        });
      }

      this.originalConfig = verified;
      const verifiedDraft = verified.toDTO();
      if (updateDraft) this.draft = verifiedDraft;
      this.#setState(TrackerWorkflowState.LOADED);
      this.#emit({ type: "config-written", config: verified, draft: structuredClone(updateDraft ? this.draft : verifiedDraft), draftUpdated: updateDraft, acknowledgement, verified: true });
      return verified;
    });
  }

  cancelOperation(reason = "Operation cancelled") {
    if (!this.currentOperation?.cancellable) return false;
    this.currentOperation.controller.abort(new Error(reason));
    this.#emit({ type: "status", phase: "cancelled", message: reason });
    return true;
  }

  #assertIdle() {
    if (this.currentOperation) {
      throw new TrackerWorkflowBusyError(`workflow is busy with ${this.currentOperation.name}`);
    }
  }

  #assertState(allowedStates, action) {
    if (!allowedStates.includes(this.state)) {
      throw new TrackerWorkflowStateError(`cannot ${action} while workflow is ${this.state}`, {
        state: this.state,
        allowedStates,
      });
    }
  }

  async #runOperation(name, { cancellable, signal } = {}, body) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    if (signal?.aborted) {
      controller.abort(signal.reason);
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
    this.currentOperation = { name, cancellable, controller };
    this.#emit({ type: "operation-started", operation: name, cancellable });

    try {
      const result = await body(controller.signal);
      if (this.state !== TrackerWorkflowState.CONNECTION_LOST) this.lastError = null;
      this.#emit({ type: "operation-completed", operation: name });
      return result;
    } catch (error) {
      if (this.state !== TrackerWorkflowState.CONNECTION_LOST) {
        this.lastError = error;
        if (this.state !== TrackerWorkflowState.DISCONNECTED) this.#setState(TrackerWorkflowState.ERROR);
      }
      this.#emit({ type: "operation-failed", operation: name, error });
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      this.currentOperation = null;
    }
  }

  #setState(state) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this.#emit({ type: "state", previous, state });
  }

  #emitStatus(phase, message, detail = {}) {
    this.#emit({ type: "status", phase, message, detail });
  }

  #emit(event) {
    this.onEvent(event);
  }
}
