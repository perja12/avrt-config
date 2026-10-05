import { describe, expect, it } from "vitest";
import { TrackerWorkflowState } from "../src/tracker-workflow/index.js";
import {
  initialReadProgress,
  nextReadProgressForSerialStatus,
  readButtonText,
  readWorkflowCard,
  statusMessageForSerialStatus,
  statusMessageForWorkflowStatus,
} from "../src/ui/read-workflow-view.js";

describe("read workflow UI helpers", () => {
  it("shows reconnect instructions after connection loss even with stale progress or write success", () => {
    expect(readWorkflowCard({
      state: TrackerWorkflowState.CONNECTION_LOST,
      operationName: "read-config",
      readProgress: { phase: "probing", attempt: 1, maxAttempts: 60 },
      hasConfig: true,
      writeVerified: true,
    })).toMatchObject({
      tone: "error", title: "Tracker connection lost", step: "Reconnect", progress: null,
      message: expect.stringContaining("Click Disconnect, then Connect"),
    });
  });

  it("tells the user what to do after connecting", () => {
    expect(statusMessageForWorkflowStatus({
      type: "status",
      phase: "connected",
      message: "Tracker connection opened",
    })).toContain("Click Read");
  });

  it("renders read button labels for the setup timing phases", () => {
    expect(readButtonText({
      state: TrackerWorkflowState.CONNECTED,
      operationName: "read-config",
      readProgress: initialReadProgress(),
    })).toBe("Waiting...");

    expect(readButtonText({
      state: TrackerWorkflowState.READING,
      operationName: "read-config",
      readProgress: { phase: "probing", attempt: 12, maxAttempts: 60 },
    })).toBe("Probe 12/60");

    expect(readButtonText({
      state: TrackerWorkflowState.READING,
      operationName: "read-config",
      readProgress: { phase: "reading" },
    })).toBe("Reading...");

    expect(readButtonText({
      state: TrackerWorkflowState.LOADED,
      operationName: null,
      readProgress: null,
    })).toBe("Read Again");
  });

  it("turns serial status events into user-facing read instructions", () => {
    const probeEvent = {
      type: "status",
      phase: "probing",
      message: "Sending setup probe 7/60",
      detail: { attempt: 7, maxAttempts: 60, variant: "new" },
    };
    const progress = nextReadProgressForSerialStatus(probeEvent);

    expect(progress).toEqual({ phase: "probing", attempt: 7, maxAttempts: 60, variant: "new" });
    expect(statusMessageForSerialStatus(probeEvent, progress)).toContain("(7/60)");

    const detectedEvent = { type: "status", phase: "setup-detected", message: "detected" };
    expect(nextReadProgressForSerialStatus(detectedEvent)).toMatchObject({ phase: "reading" });
    expect(statusMessageForSerialStatus(detectedEvent)).toContain("Tracker detected");
    expect(statusMessageForSerialStatus({ type: "status", phase: "reading-config", message: "reading" })).toContain("Reading configuration");
    expect(statusMessageForSerialStatus({ type: "status", phase: "capture-complete", message: "done" })).toContain("Parsing and validating");
  });

  it("describes the central workflow card for idle, ready, active, loaded and error states", () => {
    expect(readWorkflowCard({
      state: TrackerWorkflowState.DISCONNECTED,
      operationName: null,
      readProgress: null,
      hasConfig: false,
    })).toMatchObject({
      tone: "idle",
      step: "Step 1",
      title: "Connect to the AP510",
      progress: null,
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.CONNECTED,
      operationName: null,
      readProgress: null,
      hasConfig: false,
    })).toMatchObject({
      tone: "ready",
      step: "Step 2",
      title: "Ready to read",
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.READING,
      operationName: "read-config",
      readProgress: { phase: "probing", attempt: 15, maxAttempts: 60 },
      hasConfig: false,
    })).toMatchObject({
      tone: "active",
      step: "Probe 15 of 60",
      title: "Turn on the tracker now",
      progress: 25,
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.LOADED,
      operationName: null,
      readProgress: null,
      hasConfig: true,
    })).toMatchObject({
      tone: "done",
      step: "Loaded",
      title: "Configuration loaded",
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.CONNECTED,
      operationName: null,
      readProgress: null,
      hasConfig: true,
      writeVerified: true,
    })).toMatchObject({
      tone: "done",
      step: "Written",
      title: "Configuration written and verified",
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.LOADED,
      operationName: null,
      readProgress: null,
      hasConfig: true,
      writeVerified: true,
      templateMode: true,
    })).toMatchObject({
      title: "Template written and verified",
      message: "The tracker accepted the template. Ready to read again.",
    });

    expect(readWorkflowCard({
      state: TrackerWorkflowState.ERROR,
      operationName: null,
      readProgress: null,
      hasConfig: false,
      errorMessage: "No SETUP response detected",
    })).toMatchObject({
      tone: "error",
      step: "Needs attention",
      title: "Read did not complete",
      message: "No SETUP response detected",
    });
  });
});
