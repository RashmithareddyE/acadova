const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'acadova_token';
const ALGORITHM = 'HS256';

function signToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: `${env.jwtExpiresInDays}d`,
  });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}

// httpOnly keeps the token out of reach of page scripts (XSS); the browser sends it automatically.
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/',
});

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: env.jwtExpiresInDays * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

module.exports = { COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
