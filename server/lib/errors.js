export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }
  toJSON() {
    const body = { error: { code: this.code, message: this.message } };
    if (this.fields) body.error.fields = this.fields;
    return body;
  }
}

export const badRequest = (message = 'Invalid request', fields) => new AppError(400, 'bad_request', message, fields);
export const validationError = (fields, message = 'Please correct the highlighted fields') =>
  new AppError(422, 'validation_failed', message, fields);
export const unauthorized = (message = 'You need to sign in to continue') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message = 'That conflicts with something that already exists') =>
  new AppError(409, 'conflict', message);
export const tooMany = (message = 'Too many attempts, please slow down', retryAfter = 60) => {
  const err = new AppError(429, 'rate_limited', message);
  err.retryAfter = retryAfter;
  return err;
};
export const serverError = (message = 'Something went wrong on our side') => new AppError(500, 'server_error', message);
