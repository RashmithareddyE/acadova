const { normalizeTime } = require('./parseTimetable');

const API_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ROWS = 100;
const SESSION_TYPES = new Set(['lecture', 'lab', 'practical', 'tutorial', 'other']);
const WEEKDAYS = new Map([
  ['monday', 0], ['mon', 0], ['tuesday', 1], ['tue', 1], ['tues', 1],
  ['wednesday', 2], ['wed', 2], ['thursday', 3], ['thu', 3], ['thur', 3], ['thurs', 3],
  ['friday', 4], ['fri', 4], ['saturday', 5], ['sat', 5], ['sunday', 6], ['sun', 6],
]);

const TIMETABLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['subjectName', 'subjectCode', 'weekday', 'startTime', 'endTime', 'location', 'sessionType', 'section', 'confidence', 'issues'],
        properties: {
          subjectName: { type: 'string' },
          subjectCode: { type: 'string' },
          weekday: { anyOf: [{ type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] }, { type: 'null' }] },
          startTime: { type: 'string' },
          endTime: { type: 'string' },
          location: { type: 'string' },
          sessionType: { type: 'string' },
          section: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          issues: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const PROMPT = [
  'Extract class records from this timetable image only.',
  'Understand the timetable grid and its row and column structure; identify weekday rows and class periods.',
  'Read period headings even when start and end times are stacked vertically.',
  'Read subject names, course codes, classroom names, labs, and tutorials when visible.',
  'Return a section label only when it is visibly associated with a timetable section; otherwise use an empty string.',
  'Support different colleges and timetable layouts; do not assume a particular institution or fixed layout.',
  'Return only information visibly supported by the image. Never invent subjects, weekdays, times, or classrooms.',
  'For unclear fields, use an empty string or null and add a concise issue describing what needs review.',
  'Do not interpret faculty directories, unrelated course lists, or decorative headings as classes.',
  'Use weekday indices Monday=0 through Sunday=6. Use 24-hour HH:mm for readable times.',
  'Use confidence from 0 to 100 to describe visual certainty, not factual certainty.',
].join(' ');

function visionError(statusCode, message, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function sanitizeProviderMessage(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\b(api[_ -]?key|authorization)\s*[:=]\s*["']?[^"'\s,;]+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function safeRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

function retryAfterSeconds(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function providerErrorDetails(body) {
  const error = body && typeof body === 'object' && body.error && typeof body.error === 'object'
    ? body.error
    : {};
  return {
    code: sanitizeProviderMessage(error.code),
    type: sanitizeProviderMessage(error.type),
    message: sanitizeProviderMessage(error.message),
  };
}

function logProviderFailure({ status, details, requestId }) {
  if (process.env.NODE_ENV !== 'development') return;
  console.warn('Vision provider request failed', {
    status: Number.isInteger(status) ? status : null,
    providerCode: details.code || null,
    providerType: details.type || null,
    providerMessage: details.message || null,
    requestId: safeRequestId(requestId) || null,
  });
}

function classifyProviderFailure(status, details, retrySeconds) {
  const code = details.code.toLowerCase();
  const type = details.type.toLowerCase();
  const message = details.message.toLowerCase();
  const combined = `${code} ${type} ${message}`;
  if (/project.*(budget|spend|usage.?limit)|organization.*(budget|spend|usage.?limit)|spending.?limit|budget.?limit|hard.?limit/.test(combined)) {
    return visionError(503, 'Vision extraction is unavailable because the OpenAI organization or project spending limit has been reached. Contact the account administrator or use manual entry.', 'VISION_SPENDING_LIMIT');
  }
  if (/insufficient_quota|quota_exceeded|billing_not_active|credit_balance|out.of.credits|insufficient.*credit|exceeded.*quota/.test(combined)) {
    return visionError(503, 'Vision extraction is unavailable because the OpenAI API quota or credits are exhausted. Check the API billing and quota, or use manual entry.', 'VISION_QUOTA_EXHAUSTED');
  }
  if (/invalid_api_key|incorrect_api_key|authentication_error|invalid.*api.?key/.test(combined) || status === 401) {
    return visionError(503, 'Vision extraction could not authenticate with OpenAI. Check the backend API key configuration, or use manual entry.', 'VISION_AUTHENTICATION');
  }
  if (/permission|not.*authorized|access_denied|organization.*verification|project.*access/.test(combined) || status === 403) {
    return visionError(503, 'Vision extraction is not permitted for the configured OpenAI project or organization. Check its access settings, or use manual entry.', 'VISION_PERMISSION');
  }
  if (/model_not_found|model.*not.*available|model.*unavailable|unsupported.*model/.test(combined)) {
    return visionError(503, 'The configured vision model is unavailable to this OpenAI project. Check OPENAI_VISION_MODEL and project access, or use manual entry.', 'VISION_MODEL_UNAVAILABLE');
  }
  if (/overload|server_overloaded|model.*busy|capacity/.test(combined) || status === 529) {
    return visionError(503, 'The OpenAI vision model is temporarily overloaded. Retry later or use manual entry.', 'VISION_MODEL_OVERLOADED');
  }
  if (status === 429 && /rate_limit|rate limit|requests_per|tokens_per/.test(combined)) {
    const retryMessage = Number.isFinite(retrySeconds)
      ? ` Retry in approximately ${retrySeconds} second(s).`
      : ' Retry later.';
    return Object.assign(
      visionError(503, `Vision extraction is temporarily rate-limited.${retryMessage} You can also use manual entry.`, 'VISION_RATE_LIMITED'),
      { retryAfterSeconds: retrySeconds }
    );
  }
  if (status === 408 || status >= 500) {
    return visionError(502, 'The OpenAI vision service is temporarily unavailable. Retry later or use manual entry.', 'VISION_PROVIDER_ERROR');
  }
  if (status === 404) {
    return visionError(503, 'The configured vision model or API endpoint is unavailable. Check backend model configuration, or use manual entry.', 'VISION_MODEL_UNAVAILABLE');
  }
  return visionError(502, 'Vision extraction failed because the OpenAI request was rejected. Check backend vision configuration, or use manual entry.', 'VISION_PROVIDER_ERROR');
}

function normalizeWeekday(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 6) return value;
  if (typeof value !== 'string') return null;
  return WEEKDAYS.get(value.trim().toLowerCase().replace(/[^a-z]/g, '')) ?? null;
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeVisionRows(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.rows)) {
    throw visionError(502, 'Vision extraction returned an invalid timetable structure.', 'VISION_INVALID_OUTPUT');
  }
  if (payload.rows.length > MAX_ROWS) {
    throw visionError(502, 'Vision extraction returned too many timetable rows to review safely.', 'VISION_INVALID_OUTPUT');
  }

  return payload.rows.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw visionError(502, 'Vision extraction returned a malformed timetable row.', 'VISION_INVALID_OUTPUT');
    }

    const subjectName = safeString(record.subjectName);
    const subjectCode = safeString(record.subjectCode);
    const weekday = normalizeWeekday(record.weekday);
    const startCandidate = safeString(record.startTime);
    const endCandidate = safeString(record.endTime);
    const startTime = normalizeTime(startCandidate) || '';
    const endTime = normalizeTime(endCandidate) || '';
    const location = safeString(record.location);
    const requestedSessionType = safeString(record.sessionType).toLowerCase();
    const sessionType = SESSION_TYPES.has(requestedSessionType) ? requestedSessionType : '';
    const section = safeString(record.section);
    const confidence = Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(100, Math.round(record.confidence)))
      : 0;
    const issues = Array.isArray(record.issues)
      ? record.issues.filter((issue) => typeof issue === 'string').map((issue) => issue.trim()).filter(Boolean).slice(0, 10)
      : [];

    if (!subjectName) issues.push('Subject is unclear.');
    if (weekday === null) issues.push('Weekday is unclear.');
    if (!startTime || !endTime || startTime >= endTime) issues.push('Start/end time is missing or invalid.');
    if (record.sessionType && !sessionType) issues.push('Session type is unclear.');
    if (confidence < 55) issues.push('Vision confidence is low. Verify this row against the image.');

    return {
      subjectName,
      subjectCode,
      weekday,
      startTime,
      endTime,
      location,
      sessionType,
      section,
      confidence,
      sourceLine: index + 1,
      issues: [...new Set(issues)],
    };
  });
}

function responseText(response) {
  if (!response || typeof response !== 'object') return '';
  if (typeof response.output_text === 'string') return response.output_text;
  const chunks = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content.type === 'output_text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

async function extractTimetableWithVision(image, mimeType, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw visionError(
      503,
      'Vision fallback is not configured. Set OPENAI_API_KEY on the backend, or correct the local preview/manual entries.',
      'VISION_NOT_CONFIGURED'
    );
  }
  if (!Buffer.isBuffer(image) || !image.length || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw visionError(415, 'Vision fallback requires a valid JPG, PNG, or WebP timetable image.', 'VISION_INVALID_IMAGE');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  let response;
  try {
    const fetchImpl = options.fetchImpl || fetch;
    response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: PROMPT },
            { type: 'input_image', image_url: `data:${mimeType};base64,${image.toString('base64')}`, detail: 'high' },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'acadova_timetable',
            strict: true,
            schema: TIMETABLE_SCHEMA,
          },
        },
        max_output_tokens: 6000,
      }),
    });
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      logProviderFailure({
        status: null,
        details: { code: 'timeout', type: 'network_error', message: 'Vision provider request timed out.' },
      });
      throw visionError(504, 'Vision fallback timed out. Retry with a clearer or smaller image, or use manual entry.', 'VISION_TIMEOUT');
    }
    logProviderFailure({
      status: null,
      details: { code: '', type: 'network_error', message: 'Vision provider could not be reached.' },
    });
    throw visionError(502, 'Vision fallback could not reach the provider. Retry later or use manual entry.', 'VISION_PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const details = providerErrorDetails(body);
    const requestId = response.headers?.get?.('x-request-id') || response.headers?.get?.('request-id');
    logProviderFailure({ status: response.status, details, requestId });
    const retrySeconds = response.status === 429
      ? retryAfterSeconds(response.headers?.get?.('retry-after'))
      : undefined;
    throw classifyProviderFailure(response.status, details, retrySeconds);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    logProviderFailure({
      status: response.status,
      details: { code: 'invalid_response', type: 'malformed_response', message: 'Vision provider returned invalid JSON.' },
      requestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('request-id'),
    });
    throw visionError(502, 'Vision provider returned an unreadable response. Retry or use manual entry.', 'VISION_INVALID_OUTPUT');
  }
  const text = responseText(result);
  if (!text) {
    logProviderFailure({
      status: response.status,
      details: { code: 'empty_output', type: 'malformed_response', message: 'Vision provider returned no structured text.' },
      requestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('request-id'),
    });
    throw visionError(502, 'Vision provider returned no timetable data. Retry or use manual entry.', 'VISION_INVALID_OUTPUT');
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    logProviderFailure({
      status: response.status,
      details: { code: 'invalid_json', type: 'malformed_response', message: 'Vision provider returned malformed structured JSON.' },
      requestId: response.headers?.get?.('x-request-id') || response.headers?.get?.('request-id'),
    });
    throw visionError(502, 'Vision provider returned malformed timetable data. Retry or use manual entry.', 'VISION_INVALID_OUTPUT');
  }

  return normalizeVisionRows(payload);
}

module.exports = { extractTimetableWithVision, normalizeVisionRows };
