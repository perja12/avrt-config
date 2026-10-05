import { TrackerSerialSession, WebSerialTransport } from "../tracker-serial/index.js";
import { MockTrackerSerialSession } from "./mock-session.js";
import { TrackerWorkflow } from "./workflow.js";

export function createBrowserTrackerWorkflow({
  serial,
  port = null,
  mockTracker = false,
  onEvent = () => {},
  TransportClass = WebSerialTransport,
  SessionClass = TrackerSerialSession,
  WorkflowClass = TrackerWorkflow,
} = {}) {
  let workflow;
  const emitSerial = (event) => {
    onEvent({ type: "serial", event });
    workflow?.handleSerialEvent?.(event);
  };
  const serialSession = mockTracker
    ? new MockTrackerSerialSession({ onEvent: emitSerial, scenario: mockTracker === true ? "normal" : mockTracker })
    : new SessionClass({
        transport: new TransportClass({ serial, port, onEvent: emitSerial }),
        onEvent: emitSerial,
      });

  workflow = new WorkflowClass({ serialSession, onEvent });
  return workflow;
}
