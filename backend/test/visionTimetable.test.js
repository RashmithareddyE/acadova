const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTimetableWithVision,
  normalizeVisionRows,
} = require('../services/documents/visionTimetable');
const { buildTimetablePreview } = require('../controllers/importController');

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return ({ 'x-request-id': 'req_test123', 'retry-after': '17' })[name.toLowerCase()] || null;
      },
    },
    json: async () => ({ output_text: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  };
}

function providerError(status, code, type, message, headers = {}) {
  return {
    ok: false,
    status,
    headers: {
      get(name) {
        return ({
          'x-request-id': 'req_provider456',
          ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])),
        })[name.toLowerCase()] || null;
      },
    },
    json: async () => ({ error: { code, type, message } }),
  };
}

function validRecord(overrides = {}) {
  return {
    subjectName: 'Algorithms',
    subjectCode: 'CS201',
    weekday: 0,
    startTime: '09:00',
    endTime: '10:00',
    location: 'Room 4',
    sessionType: 'lecture',
    section: '',
    confidence: 91,
    issues: [],
    ...overrides,
  };
}

function withVisionKey(value, operation) {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = value;
  return Promise.resolve()
    .then(operation)
    .finally(() => {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    });
}

test('sends an image to the Responses API and returns records in the preview row shape', async () => {
  await withVisionKey('test-only-key', async () => {
    const previousModel = process.env.OPENAI_VISION_MODEL;
    process.env.OPENAI_VISION_MODEL = 'configured-vision-model';
    let requestUrl;
    let requestOptions;
    let rows;
    try {
      rows = await extractTimetableWithVision(
        Buffer.from('mock-image'),
        'image/jpeg',
        {
          fetchImpl: async (url, options) => {
            requestUrl = url;
            requestOptions = options;
            return response({ rows: [validRecord()] });
          },
        }
      );
    } finally {
      if (previousModel === undefined) delete process.env.OPENAI_VISION_MODEL;
      else process.env.OPENAI_VISION_MODEL = previousModel;
    }

    assert.equal(requestUrl, 'https://api.openai.com/v1/responses');
    assert.equal(requestOptions.headers.Authorization, 'Bearer test-only-key');
    const body = JSON.parse(requestOptions.body);
    assert.equal(body.model, 'configured-vision-model');
    assert.equal(body.input[0].content[1].type, 'input_image');
    assert.equal(body.text.format.type, 'json_schema');
    assert.deepEqual(rows, [{
      subjectName: 'Algorithms',
      subjectCode: 'CS201',
      weekday: 0,
      startTime: '09:00',
      endTime: '10:00',
      location: 'Room 4',
      sessionType: 'lecture',
      section: '',
      confidence: 91,
      sourceLine: 1,
      issues: [],
    }]);
  });
});

test('keeps missing and invalid fields empty and marks rows for review', () => {
  const [row] = normalizeVisionRows({
    rows: [{
      subjectName: 25,
      subjectCode: 'CS201',
      weekday: 'Funday',
      startTime: '27:80',
      endTime: '',
      location: null,
      sessionType: 'seminar',
      confidence: 'certain',
      issues: ['The period heading is blurry.'],
    }],
  });

  assert.equal(row.subjectName, '');
  assert.equal(row.weekday, null);
  assert.equal(row.startTime, '');
  assert.equal(row.endTime, '');
  assert.equal(row.location, '');
  assert.equal(row.sessionType, '');
  assert.equal(row.confidence, 0);
  assert.ok(row.issues.includes('Weekday is unclear.'));
  assert.ok(row.issues.includes('Start/end time is missing or invalid.'));
  assert.ok(row.issues.includes('Session type is unclear.'));
  assert.ok(row.issues.includes('Vision confidence is low. Verify this row against the image.'));
  assert.ok(row.issues.includes('The period heading is blurry.'));
});

test('marks entirely missing required row fields for review instead of inventing values', () => {
  const [row] = normalizeVisionRows({ rows: [{}] });
  assert.equal(row.subjectName, '');
  assert.equal(row.weekday, null);
  assert.equal(row.startTime, '');
  assert.equal(row.endTime, '');
  assert.equal(row.location, '');
  assert.equal(row.sessionType, '');
  assert.ok(row.issues.includes('Subject is unclear.'));
  assert.ok(row.issues.includes('Weekday is unclear.'));
  assert.ok(row.issues.includes('Start/end time is missing or invalid.'));
});

test('keeps uncertain visible text editable and explicitly flagged', () => {
  const [row] = normalizeVisionRows({ rows: [validRecord({
    subjectName: 'Algorithms?',
    weekday: null,
    startTime: '',
    confidence: 42,
    issues: ['Subject text is uncertain.'],
  })] });

  assert.equal(row.subjectName, 'Algorithms?');
  assert.equal(row.startTime, '');
  assert.ok(row.issues.length >= 4);
});

test('reports when the vision API key is absent without calling the provider', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      () => extractTimetableWithVision(Buffer.from('image'), 'image/jpeg', {
        fetchImpl: async () => assert.fail('provider must not be called without a key'),
      }),
      (error) => error.code === 'VISION_NOT_CONFIGURED' && /OPENAI_API_KEY/.test(error.message)
    );
  } finally {
    if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
  }
});

test('distinguishes temporary request rate limits and uses Retry-After without retrying', async () => {
  await withVisionKey('test-only-key', async () => {
    let requests = 0;
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      await assert.rejects(
        () => extractTimetableWithVision(Buffer.from('image'), 'image/png', {
          fetchImpl: async () => {
            requests += 1;
            return providerError(429, 'rate_limit_exceeded', 'requests', 'Too many requests', { 'Retry-After': '17' });
          },
        }),
        (error) => error.code === 'VISION_RATE_LIMITED' && /17 second/.test(error.message) && error.retryAfterSeconds === 17
      );
    } finally {
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
    assert.equal(requests, 1, 'the service does not automatically retry rate-limit responses');
  });
});

test('distinguishes exhausted credits, spending limits, authentication, permissions, model availability, and overload', async () => {
  await withVisionKey('test-only-key', async () => {
    const cases = [
      [429, 'insufficient_quota', 'insufficient_quota', 'You exceeded your current quota.', 'VISION_QUOTA_EXHAUSTED', /credits are exhausted/],
      [429, 'project_budget_exceeded', 'billing_error', 'Project budget exceeded.', 'VISION_SPENDING_LIMIT', /spending limit has been reached/],
      [401, 'invalid_api_key', 'authentication_error', 'Invalid API key.', 'VISION_AUTHENTICATION', /could not authenticate/],
      [403, 'permission_denied', 'invalid_request_error', 'Project has no access to this resource.', 'VISION_PERMISSION', /not permitted/],
      [404, 'model_not_found', 'invalid_request_error', 'Model is unavailable.', 'VISION_MODEL_UNAVAILABLE', /vision model is unavailable/],
      [503, 'server_overloaded', 'server_error', 'The model is overloaded.', 'VISION_MODEL_OVERLOADED', /temporarily overloaded/],
    ];
    for (const [status, code, type, message, expectedCode, expectedMessage] of cases) {
      await assert.rejects(
        () => extractTimetableWithVision(Buffer.from('image'), 'image/png', {
          fetchImpl: async () => providerError(status, code, type, message),
        }),
        (error) => error.code === expectedCode && expectedMessage.test(error.message)
      );
    }
  });
});

test('logs sanitized provider diagnostics only in development', async () => {
  await withVisionKey('sk-secret-token-for-test', async () => {
    const previousEnv = process.env.NODE_ENV;
    const originalWarn = console.warn;
    const logs = [];
    console.warn = (...args) => logs.push(args);
    try {
      process.env.NODE_ENV = 'development';
      await assert.rejects(() => extractTimetableWithVision(Buffer.from('private image data'), 'image/jpeg', {
        fetchImpl: async () => providerError(
          429,
          'insufficient_quota',
          'quota_error',
          'Quota failed. Authorization: Bearer sk-secret-token-for-test',
          { 'x-request-id': 'req_safe-123' }
        ),
      }));
      process.env.NODE_ENV = 'production';
      await assert.rejects(() => extractTimetableWithVision(Buffer.from('private image data'), 'image/jpeg', {
        fetchImpl: async () => providerError(401, 'invalid_api_key', 'authentication_error', 'Invalid API key.'),
      }));
    } finally {
      console.warn = originalWarn;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }

    assert.equal(logs.length, 1);
    const diagnostic = JSON.stringify(logs[0]);
    assert.match(diagnostic, /429/);
    assert.match(diagnostic, /insufficient_quota/);
    assert.match(diagnostic, /quota_error/);
    assert.match(diagnostic, /req_safe-123/);
    assert.doesNotMatch(diagnostic, /sk-secret-token-for-test/);
    assert.doesNotMatch(diagnostic, /private image data/);
    assert.match(diagnostic, /\[redacted\]/);
  });
});

test('does not call an unclassified 429 a temporary rate limit', async () => {
  await withVisionKey('test-only-key', async () => {
    await assert.rejects(
      () => extractTimetableWithVision(Buffer.from('image'), 'image/png', {
        fetchImpl: async () => providerError(429, 'unknown_error', 'api_error', 'The request could not be completed.'),
      }),
      (error) => error.code === 'VISION_PROVIDER_ERROR' && error.code !== 'VISION_RATE_LIMITED'
    );
  });
});

test('handles malformed structured output with a safe error', async () => {
  await withVisionKey('test-only-key', async () => {
    await assert.rejects(
      () => extractTimetableWithVision(Buffer.from('image'), 'image/png', { fetchImpl: async () => response('{bad json') }),
      (error) => error.code === 'VISION_INVALID_OUTPUT' && error.statusCode === 502
    );
  });
});

test('handles a provider timeout without exposing provider details', async () => {
  await withVisionKey('test-only-key', async () => {
    await assert.rejects(
      () => extractTimetableWithVision(Buffer.from('image'), 'image/webp', {
        timeoutMs: 10,
        fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }, { once: true });
        }),
      }),
      (error) => error.code === 'VISION_TIMEOUT' && error.statusCode === 504
    );
  });
});

test('returns fallback rows in the established preview shape and leaves saving to confirmation', async () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(511, 16);
  image.writeUInt32BE(338, 20);
  let localArgs;
  const result = await buildTimetablePreview(image, 'image/png', 'schedule.png', {
    extractText: async (...args) => {
      localArgs = args;
      return { text: 'gibberish fragments', sourceType: 'image/png', method: 'tesseract.js-local-ocr', words: [] };
    },
    parseTimetable: () => {
      const error = new Error('Image text was detected, but no timetable weekdays or class rows were recognized.');
      error.statusCode = 422;
      throw error;
    },
    extractTimetableWithVision: async () => normalizeVisionRows({ rows: [validRecord()] }),
  });

  assert.deepEqual(localArgs[3], { timetableOcr: true });
  assert.deepEqual(result.extraction, { method: 'openai-vision-fallback', rows: 1, incomplete: 0 });
  assert.equal(result.rows[0].subjectName, 'Algorithms');
  assert.equal(result.rows[0].weekday, 0);
  assert.equal(result.rows[0].startTime, '09:00');
  assert.ok(/confirming to save/.test(result.message));
});

test('preserves local preview rows and reports unavailable vision fallback', async () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(511, 16);
  image.writeUInt32BE(338, 20);
  const localRow = {
    subjectName: 'Algorithms',
    subjectCode: '',
    weekday: 0,
    startTime: '',
    endTime: '',
    location: '',
    sessionType: '',
    issues: ['Start/end time is missing or invalid.'],
  };
  const result = await buildTimetablePreview(image, 'image/png', 'schedule.png', {
    extractText: async () => ({ text: 'Monday Algorithms', sourceType: 'image/png', method: 'tesseract.js-local-ocr', words: [] }),
    parseTimetable: () => [localRow],
    extractTimetableWithVision: async () => { throw Object.assign(new Error('Vision fallback is not configured.'), { statusCode: 503 }); },
  });

  assert.equal(result.extraction.method, 'tesseract.js-local-ocr');
  assert.deepEqual(result.rows, [localRow]);
  assert.match(result.message, /Vision fallback is not configured/);
});

test('does not call vision for a complete local timetable preview', async () => {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(511, 16);
  image.writeUInt32BE(338, 20);
  const localRow = validRecord();
  let calledVision = false;
  const result = await buildTimetablePreview(image, 'image/png', 'schedule.png', {
    extractText: async () => ({ text: 'Monday Algorithms 09:00 - 10:00', sourceType: 'image/png', method: 'tesseract.js-local-ocr', words: [] }),
    parseTimetable: () => [localRow],
    extractTimetableWithVision: async () => { calledVision = true; return []; },
  });

  assert.equal(calledVision, false);
  assert.equal(result.extraction.method, 'tesseract.js-local-ocr');
  assert.deepEqual(result.rows, [localRow]);
});
