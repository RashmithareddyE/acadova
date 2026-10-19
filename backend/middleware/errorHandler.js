const env = require('../config/env');
const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Maps known library errors onto safe responses; anything else becomes a generic 500.
function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err.type === 'entity.parse.failed') return new AppError(400, 'Request body must be valid JSON.');
  if (err.type === 'entity.too.large') return new AppError(413, 'Request body is too large.');

  if (err.name === 'ValidationError' && err.errors) {
    const fields = {};
    Object.entries(err.errors).forEach(([key, val]) => (fields[key] = val.message));
    return new AppError(400, 'Validation failed.', fields);
  }
  if (err.name === 'CastError') return new AppError(400, 'Invalid identifier.');
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    const message = field === 'email' ? 'An account with this email already exists.' : `Duplicate value for ${field}.`;
    return new AppError(409, message, { [field]: message });
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
    return new AppError(401, 'Invalid or expired token. Please log in again.');

  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const known = normalizeError(err);

  if (!known) {
    console.error('Unhandled error:', err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong on our side. Please try again.',
      ...(env.isProduction ? {} : { detail: err.message }),
    });
  }

  const body = { success: false, message: known.message };
  if (known.errors) body.errors = known.errors;
  return res.status(known.statusCode).json(body);
}

module.exports = { notFound, errorHandler };
