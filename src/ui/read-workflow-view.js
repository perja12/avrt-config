import { TrackerWorkflowState } from "../tracker-workflow/index.js";

export function initialReadProgress() {
  return { phase: "waiting", attempt: 0, maxAttempts: null };
}

export function nextReadProgressForSerialStatus(event) {
  if (event.phase === "probing") {
    const attempt = Number(event.detail?.attempt ?? 0);
    const maxAttempts = Number(event.detail?.maxAttempts ?? 0);
    return {
      phase: "probing",
      attempt: Number.isFinite(attempt) ? attempt : 0,
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : null,
      variant: event.detail?.variant ?? null,
    };
  }

  if (event.phase === "setup-detected") {
    return { phase: "reading", attempt: null, maxAttempts: null };
  }

  if (event.phase === "reading-config") {
    return { phase: "reading", attempt: null, maxAttempts: null };
  }

  if (event.phase === "capture-complete") {
    return { phase: "validating", attempt: null, maxAttempts: null };
  }

  return null;
}

export function statusMessageForWorkflowStatus(event) {
  if (event.phase === "connected") {
    return "Connected. Click Read, then power on or power-cycle the tracker while setup probes run.";
  }
  return event.message;
}

export function statusMessageForSerialStatus(event, readProgress) {
  if (event.phase === "probing") {
    const attempt = readProgress?.attempt;
    const maxAttempts = readProgress?.maxAttempts;
    if (attempt && maxAttempts) {
      return `Power on or power-cycle the tracker now. Listening for setup response (${attempt}/${maxAttempts}).`;
    }
    return "Power on or power-cycle the tracker now. Listening for setup response...";
  }

  if (event.phase === "setup-detected") {
    return "Tracker detected. Reading configuration...";
  }

  if (event.phase === "reading-config") {
    return "Reading configuration from the tracker...";
  }

  if (event.phase === "capture-complete") {
    return "Configuration received. Parsing and validating...";
  }

  return event.message;
}

export function readButtonText({ state, operationName, readProgress }) {
  if (operationName === "read-config") {
    if (readProgress?.phase === "probing" && readProgress.attempt && readProgress.maxAttempts) {
      return `Probe ${readProgress.attempt}/${readProgress.maxAttempts}`;
    }
    if (readProgress?.phase === "reading") return "Reading...";
    if (readProgress?.phase === "validating") return "Validating...";
    return "Waiting...";
  }

  if (state === TrackerWorkflowState.LOADED) return "Read Again";
  return "Read";
}

export function readWorkflowCard({ state, operationName, readProgress, hasConfig, errorMessage = null, writeVerified = false, templateMode = false, writePreparing = false }) {
  if (state === TrackerWorkflowState.CONNECTION_LOST) {
    return {
      tone: "error",
      step: "Reconnect",
      title: "Tracker connection lost",
      message: "Click Disconnect, then Connect to reopen the serial connection. Keep the tracker off until you click Read.",
      progress: null,
    };
  }

  if (writePreparing) {
    return {
      tone: "active",
      step: "Checking setup",
      title: "Checking tracker before writing",
      message: "Confirming setup mode. Cancel is available until uploading starts.",
      progress: readProgress?.phase === "probing" ? progressPercent(readProgress) : null,
    };
  }

  if (writeVerified) {
    return {
      tone: "done",
      step: "Written",
      title: templateMode ? "Template written and verified" : "Configuration written and verified",
      message: templateMode ? "The tracker accepted the template. Ready to read again." : "The tracker accepted the configuration and the read-back verification succeeded.",
      progress: null,
    };
  }

  if (operationName === "read-config") {
    if (readProgress?.phase === "probing") {
      const label = readProgress.attempt && readProgress.maxAttempts
        ? `Probe ${readProgress.attempt} of ${readProgress.maxAttempts}`
        : "Listening for setup response";
      return {
        tone: "active",
        step: label,
        title: "Turn on the tracker now",
        message: "Power on or power-cycle the AP510 before the countdown ends.",
        progress: progressPercent(readProgress),
      };
    }

    if (readProgress?.phase === "reading") {
      return {
        tone: "active",
        step: "Reading",
        title: "Reading configuration",
        message: "Configuration bytes are being received from the tracker.",
        progress: null,
      };
    }

    if (readProgress?.phase === "validating") {
      return {
        tone: "active",
        step: "Validating",
        title: "Checking configuration",
        message: "The capture is complete. The parser is decoding and validating the configuration.",
        progress: null,
      };
    }

    return {
      tone: "active",
      step: "Waiting",
      title: "Get ready to power on the tracker",
      message: "Click Cancel if needed. Power on or power-cycle the AP510 when the probe countdown starts.",
      progress: null,
    };
  }

  if (state === TrackerWorkflowState.DISCONNECTED && errorMessage) {
    return {
      tone: "error",
      step: "Connect again",
      title: "Connection did not open",
      message: `${errorMessage} Click Connect to try again.`,
      progress: null,
    };
  }

  if (state === TrackerWorkflowState.DISCONNECTED) {
    return {
      tone: "idle",
      step: "Step 1",
      title: "Connect to the AP510",
      message: "Choose a port with Connect. Keep the tracker off until reading starts.",
      progress: null,
    };
  }

  if (state === TrackerWorkflowState.CONNECTED) {
    return {
      tone: "ready",
      step: "Step 2",
      title: "Ready to read",
      message: "Click Read, then power-cycle the AP510 when probing begins.",
      progress: null,
    };
  }

  if (state === TrackerWorkflowState.LOADED) {
    return {
      tone: "done",
      step: hasConfig ? "Loaded" : "Connected",
      title: hasConfig ? "Configuration loaded" : "Ready to read again",
      message: hasConfig
        ? "Read again to refresh the capture."
        : "The tracker is connected. Click Read to capture the configuration again.",
      progress: null,
    };
  }

  if (state === TrackerWorkflowState.ERROR) {
    return {
      tone: "error",
      step: "Needs attention",
      title: "Read did not complete",
      message: errorMessage || "Check that the tracker is connected, then try Read again and power-cycle it during the probe countdown.",
      progress: null,
    };
  }

  return {
    tone: "idle",
    step: state,
    title: "Preparing tracker workflow",
    message: "Please wait while the tracker workflow changes state.",
    progress: null,
  };
}

function progressPercent(readProgress) {
  const { attempt, maxAttempts } = readProgress ?? {};
  if (!attempt || !maxAttempts) return null;
  return Math.min(100, Math.max(0, Math.round((attempt / maxAttempts) * 100)));
}
