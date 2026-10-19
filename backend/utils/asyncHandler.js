class AppError extends Error {
  /**
   * @param {number} statusCode HTTP status code
   * @param {string} message    Safe, user-facing message
   * @param {Object} [errors]   Optional field-level errors, e.g. { email: 'Invalid email' }
   */
  constructor(statusCode, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }
}

module.exports = AppError;
