export class TrackerWorkflowError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    Object.assign(this, options);
  }
}

export class TrackerWorkflowBusyError extends TrackerWorkflowError {}

export class TrackerWorkflowStateError extends TrackerWorkflowError {}

export class TrackerWorkflowVerificationError extends TrackerWorkflowError {}
