const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { extractText, validateContent } = require('../services/documents/extractText');
const { parseTimetable } = require('../services/documents/parseTimetable');
const { parseExams, parseSyllabus, parseCalendar } = require('../services/documents/parseAcademicDocs');

function uploadedFileName(req) {
  const encoded = String(req.headers['x-file-name'] || '').slice(0, 512);
  try { return decodeURIComponent(encoded).split(/[\\/]/).pop(); }
  catch { throw new AppError(400, 'The uploaded filename is invalid. Rename the file and try again.'); }
}

function previewResult(rows, method, message, dimensions = {}) {
  return {
    extraction: {
      method,
      rows: rows.length,
      incomplete: rows.filter((row) => row.issues.length).length,
      ...dimensions,
    },
    message,
    rows,
  };
}

async function buildTimetablePreview(buffer, declaredType, fileName, dependencies = {}) {
  const validate = dependencies.validateContent || validateContent;
  const extractLocal = dependencies.extractText || extractText;
  const parseLocal = dependencies.parseTimetable || parseTimetable;
  validate(buffer, declaredType, fileName);
  const extracted = await extractLocal(buffer, declaredType, fileName, { timetableOcr: true });
  const rows = parseLocal(extracted.text, extracted.sourceType, extracted.words);
  return previewResult(
    rows,
    extracted.method,
    rows.some((row) => row.issues.length)
      ? `${rows.filter((row) => row.issues.length).length} row(s) need correction before they can be saved.`
      : 'Review and correct the extracted timetable before confirming to save.',
    extracted.dimensions || {}
  );
}

async function processPreview(req, res, parser, kind) {
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, `Upload a ${kind} document to preview it.`);
  const declaredType = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  let extracted; let result;
  try { extracted = await extractText(req.body, declaredType, uploadedFileName(req)); result = parser(extracted.text, extracted.sourceType); }
  catch (error) { if (Number.isInteger(error.statusCode)) throw new AppError(error.statusCode, error.message); throw error; }
  res.json({ success: true, extraction: { method: extracted.method, rows: Array.isArray(result) ? result.length : result.topics.length }, message: 'Review and correct the extracted information before confirming.', ...(Array.isArray(result) ? { rows: result } : result) });
}

exports.previewTimetable = asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Upload a timetable file to preview it.');
  const declaredType = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const fileName = uploadedFileName(req);
  try {
    res.json({ success: true, ...(await buildTimetablePreview(req.body, declaredType, fileName)) });
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw new AppError(error.statusCode, error.message);
    throw error;
  }
});

exports.previewExams = asyncHandler((req, res) => processPreview(req, res, parseExams, 'exam schedule'));
exports.previewSyllabus = asyncHandler((req, res) => processPreview(req, res, parseSyllabus, 'syllabus'));
exports.previewCalendar = asyncHandler((req, res) => processPreview(req, res, parseCalendar, 'academic calendar'));
exports.buildTimetablePreview = buildTimetablePreview;
