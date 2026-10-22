function validateRegisterInput(body = {}) {
  const input = body && typeof body === 'object' ? body : {};

  const name =
    typeof input.name === 'string' ? input.name.trim() : '';

  const email =
    typeof input.email === 'string'
      ? input.email.trim().toLowerCase()
      : '';

  const password =
    typeof input.password === 'string' ? input.password : '';

  const errors = {};

  // Validate name
  if (!name) {
    errors.name = 'Name is required.';
  } else if (name.length > 80) {
    errors.name = 'Name must not exceed 80 characters.';
  }

  // Validate email
  if (!email) {
    errors.email = 'Email is required.';
  } else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = 'Please enter a valid email address.';
  }

  // Validate password
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must contain at least 8 characters.';
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.password = 'Password must not exceed 72 UTF-8 bytes.';
  }

  return {
    values: { name, email, password },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

function validateLoginInput(body = {}) {
  const input = body && typeof body === 'object' ? body : {};

  const email =
    typeof input.email === 'string'
      ? input.email.trim().toLowerCase()
      : '';

  const password =
    typeof input.password === 'string' ? input.password : '';

  const errors = {};

  if (!email) {
    errors.email = 'Email is required.';
  } else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.password = 'Password must not exceed 72 UTF-8 bytes.';
  }

  return {
    values: { email, password },
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

module.exports = {
  validateRegisterInput,
  validateLoginInput,
};