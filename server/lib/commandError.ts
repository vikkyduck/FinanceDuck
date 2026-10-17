/** Expected command rejection; routes preserve its status instead of returning 500. */
export class CommandError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
