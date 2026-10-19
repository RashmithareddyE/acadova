const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { COOKIE_NAME, verifyToken } = require('../services/tokenService');

// Web clients authenticate with the httpOnly cookie; non-browser clients
// (e.g. the future React Native app) send "Authorization: Bearer <token>".
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies ? req.cookies[COOKIE_NAME] : undefined;
}

const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError(401, 'Authentication required. Please log in.');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Your session has expired. Please log in again.'
        : 'Invalid token. Please log in again.';
    throw new AppError(401, message);
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'This account no longer exists.');

  req.user = user;
  next();
});

module.exports = { protect };
