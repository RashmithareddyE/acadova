const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { extractText, validateContent } = require('../services/documents/extractText');
const { parseTimetable } = require('../services/documents/parseTimetable');
const { extractTimetableWithVision } = require('../services/documents/visionTimetable');
const { parseExams, parseSyllabus, parseCalendar } = require('../services/documents/parseAcademicDocs');

function uploadedFileName(req) {
  const encoded = String(req.headers['x-file-name'] || '').slice(0, 512);
  try { return decodeURIComponent(encoded).split(/[\\/]/).pop(); }
  catch { throw new AppError(400, 'The uploaded filename is invalid. Rename the file and try again.'); }
}

function needsVisionFallback(rows) {
  if (!rows.length) return true;
  const validRows = rows.filter((row) => (
    row.subjectName.trim()
    && Number.isInteger(row.weekday)
    && row.startTime
    && row.endTime
    && row.startTime < row.endTime
  ));
  return validRows.length === 0
    || validRows.length * 2 < rows.length
    || rows.some((row) => Number.isFinite(row.confidence) && row.confidence < 55);
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
  const extractVision = dependencies.extractTimetableWithVision || extractTimetableWithVision;
  const sourceType = validate(buffer, declaredType, fileName);
  let extracted;
  let rows = [];
  let localError;

  try {
    extracted = await extractLocal(buffer, declaredType, fileName, { timetableOcr: true });
    rows = parseLocal(extracted.text, extracted.sourceType, extracted.words);
  } catch (error) {
    if (!sourceType.startsWith('image/') || ![422, 503].includes(error.statusCode)) throw error;
    localError = error;
  }

  if (!sourceType.startsWith('image/') || (!localError && !needsVisionFallback(rows))) {
    if (localError) throw localError;
    return previewResult(
      rows,
      extracted.method,
      rows.some((row) => row.issues.length)
        ? `${rows.filter((row) => row.issues.length).length} row(s) need correction before they can be saved.`
        : 'Review and correct the extracted timetable before confirming to save.',
      extracted.dimensions || {}
    );
  }

  try {
    const visionRows = await extractVision(buffer, sourceType);
    if (!visionRows.length) {
      throw new AppError(422, 'Vision extraction could not identify class rows. Try a clearer image or start a manual preview.');
    }
    return previewResult(
      visionRows,
      'openai-vision-fallback',
      'Review the vision-assisted extraction carefully. Correct or remove uncertain rows before confirming to save.'
    );
  } catch (error) {
    if (rows.length) {
      return previewResult(
        rows,
        extracted.method,
        `Local OCR may be incomplete. ${error.message} Review or correct the preview before saving.`,
        extracted.dimensions || {}
      );
    }
    const message = localError ? `${localError.message} ${error.message}` : error.message;
    throw new AppError(error.statusCode || 502, message);
  }
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
