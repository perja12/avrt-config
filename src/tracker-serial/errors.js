export class TrackerSerialError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    Object.assign(this, options);
  }
}

export class TrackerSerialTimeoutError extends TrackerSerialError {}

export class TrackerSerialCancelledError extends TrackerSerialError {}

export class TrackerSerialNoResponseError extends TrackerSerialError {}

export class TrackerSerialIncompleteResponseError extends TrackerSerialError {}

export class TrackerSerialUploadError extends TrackerSerialError {}
