// An error with an HTTP status and a message that is safe to show visitors.
export class AppError extends Error {
  constructor(message, status = 500, code = 'SERVER_ERROR', publicMessage) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.publicMessage =
      publicMessage || 'Something went wrong on our side. Try again in a few minutes.';
  }
}
