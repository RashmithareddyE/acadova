const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { validateRegisterInput, validateLoginInput } = require('../utils/validators');
const { signToken, setAuthCookie, clearAuthCookie } = require('../services/tokenService');

// Compared against when the email is unknown so login takes similar time either way,
// which avoids revealing which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('acadova-timing-guard', 12);

const sendAuthResponse = (res, statusCode, user) => {
  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  res.status(statusCode).json({ success: true, token, user: user.toSafeObject() });
};

exports.register = asyncHandler(async (req, res) => {
  const { values, errors, isValid } = validateRegisterInput(req.body);
  if (!isValid) throw new AppError(400, 'Please correct the highlighted fields.', errors);

  if (await User.exists({ email: values.email })) {
    throw new AppError(409, 'An account with this email already exists.', {
      email: 'An account with this email already exists.',
    });
  }

  // The pre-save hook hashes the password.
  const user = await User.create(values);
  sendAuthResponse(res, 201, user);
});

exports.login = asyncHandler(async (req, res) => {
  const { values, errors, isValid } = validateLoginInput(req.body);
  if (!isValid) throw new AppError(400, 'Please correct the highlighted fields.', errors);

  const user = await User.findOne({ email: values.email }).select('+password');
  let passwordMatches = false;
  if (user) {
    passwordMatches = await user.comparePassword(values.password);
  } else {
    await bcrypt.compare(values.password, DUMMY_HASH);
  }

  if (!passwordMatches) throw new AppError(401, 'Incorrect email or password.');

  sendAuthResponse(res, 200, user);
});

exports.me = (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
};

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out.' });
};
