const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { extractText, validateContent } = require('../services/documents/extractText');
const { parseTimetable } = require('../services/documents/parseTimetable');
const {
  COLUMNS,
  mergeLaboratoryPeriods,
  serializeTimetableCsv,
  validateTimetableRows,
} = require('../services/documents/timetableCsv');
const { parseExams, parseSyllabus, parseCalendar } = require('../services/documents/parseAcademicDocs');

function uploadedFileName(req) {
  const encoded = String(req.headers['x-file-name'] || '').slice(0, 512);
  try { return decodeURIComponent(encoded).split(/[\\/]/).pop(); }
  catch { throw new AppError(400, 'The uploaded filename is invalid. Rename the file and try again.'); }
}

function previewResult(rows, method, message, dimensions = {}) {
  const classes = rows.filter((row) => !row.isBreakPeriod);
  const sections = [...new Set(classes.map((row) => row.section).filter(Boolean))];
  const warnings = [];
  const invalidCount = classes.filter((row) => row.status === 'invalid' || row.issues.some((i) => /missing|unclear|invalid|duplicate/i.test(i))).length;
  const reviewCount = classes.filter((row) => row.status === 'needs-review' || (row.issues.length && !row.issues.some((i) => /missing|unclear|invalid|duplicate/i.test(i)))).length;
  const validCount = classes.length - invalidCount - reviewCount;

  if (invalidCount > 0) warnings.push(`${invalidCount} row(s) are missing required fields or contain invalid data. These must be corrected or removed before import.`);
  if (reviewCount > 0) warnings.push(`${reviewCount} row(s) have low confidence or non-critical warnings. Please review them against the original document.`);
  if (rows.some((row) => row.isBreakPeriod)) warnings.push('Break and lunch periods are shown for reference and excluded from the generated CSV.');
  if (sections.length > 1) warnings.push('Multiple timetable sections were detected. Choose the section you intend to import.');
  return {
    extraction: {
      method,
      rows: classes.length,
      valid: validCount,
      needsReview: reviewCount,
      invalid: invalidCount,
      incomplete: invalidCount + reviewCount,
      warnings,
      ...dimensions,
    },
    message,
    rows,
    csvColumns: COLUMNS,
    csv: serializeTimetableCsv(classes),
  };
}

async function buildTimetablePreview(buffer, declaredType, fileName, dependencies = {}) {
  const validate = dependencies.validateContent || validateContent;
  const extractLocal = dependencies.extractText || extractText;
  const parseLocal = dependencies.parseTimetable || parseTimetable;
  validate(buffer, declaredType, fileName);
  const extracted = await extractLocal(buffer, declaredType, fileName, { timetableOcr: true });
  const parsedRows = parseLocal(extracted.text, extracted.sourceType, extracted.words);
  const breakRows = parsedRows.filter((row) => row.isBreakPeriod);
  const nonBreakRows = parsedRows.filter((row) => !row.isBreakPeriod);

  if (!nonBreakRows.length && !breakRows.length) {
    throw Object.assign(new Error('Unable to confidently recognize this timetable. Please correct the information manually.'), { statusCode: 422 });
  }

  const mergedRows = mergeLaboratoryPeriods(nonBreakRows);
  const canonicalCsv = serializeTimetableCsv(mergedRows);
  const csvRows = parseLocal(canonicalCsv, 'text/csv');
  if (csvRows.length !== mergedRows.length) {
    throw Object.assign(new Error('The extracted timetable could not be preserved during CSV normalization. Review the source file and try again.'), { statusCode: 422 });
  }
  const normalizedRows = csvRows.map((row, index) => {
    const source = mergedRows[index];
    const item = {
      ...source,
      subjectName: row.subjectName,
      subjectCode: row.subjectCode,
      weekday: row.weekday,
      startTime: row.startTime,
      endTime: row.endTime,
      teacher: row.teacher,
      location: row.location,
      sessionType: row.sessionType,
      issues: [...(source.issues || []), ...(row.issues || [])],
    };
    if (source.rawText !== undefined || row.rawText !== undefined) {
      item.rawText = source.rawText || row.rawText || row.subjectName;
    }
    if (source.confidence !== undefined || row.confidence !== undefined) {
      item.confidence = source.confidence ?? row.confidence ?? 100;
    }
    if (source.status !== undefined || row.status !== undefined) {
      item.status = source.status || row.status;
    }
    return item;
  });
  const classRows = validateTimetableRows(normalizedRows);
  const rows = [...classRows, ...breakRows];
  const invalidRowsCount = rows.filter((row) => !row.isBreakPeriod && (row.status === 'invalid' || row.issues.some((i) => /missing|unclear|invalid|duplicate/i.test(i)))).length;
  const hasIssues = rows.some((row) => row.issues.length);
  const message = invalidRowsCount > 0
    ? `${invalidRowsCount} row(s) need correction before they can be saved.`
    : hasIssues
      ? 'Some extracted rows need review. Please verify against your timetable before confirming.'
      : 'Review and correct the extracted timetable before confirming to save.';

  return previewResult(
    rows,
    extracted.method,
    message,
    extracted.dimensions || {}
  );
}

async function processPreview(req, res, parser, kind) {
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, `Upload a ${kind} document to preview it.`);
  const declaredType = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  let extracted; let result;
  try {
    extracted = await extractText(req.body, declaredType, uploadedFileName(req));
    const semester = req.query.semester || req.headers['x-semester'] || 'all';
    result = parser(extracted.text, extracted.sourceType, extracted.words, { semester });
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw new AppError(error.statusCode, error.message);
    throw error;
  }
  res.json({ success: true, extraction: { method: extracted.method, rows: Array.isArray(result) ? result.length : result.topics.length }, message: 'Review and correct the extracted information before confirming.', ...(Array.isArray(result) ? { rows: result } : result) });
}

async function processCalendarPreview(req, res) {
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Upload an academic calendar document to preview it.');
  const declaredType = (req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const fileName = uploadedFileName(req);
  let extracted;
  let rows;
  const semester = req.query.semester || req.headers['x-semester'] || 'all';
  try {
    extracted = await extractText(req.body, declaredType, fileName);
    rows = parseCalendar(extracted.text, extracted.sourceType, extracted.words, { semester });
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw new AppError(error.statusCode, error.message);
    throw error;
  }

  const holidaysCount = rows.filter((r) => r.type === 'holiday').length;
  const examsCount = rows.filter((r) => r.type === 'exam').length;
  const workingSaturdaysCount = rows.filter((r) => r.type === 'working-saturday').length;
  const semesterStart = rows.find((r) => r.type === 'semester-start')?.date || null;
  const semesterEnd = rows.find((r) => r.type === 'semester-end')?.date || null;

  const workingDayMatch = extracted.text.match(/\b(\d{2,3})\s*(?:total\s*)?(?:working\s*days?)\b/i);
  const totalWorkingDays = workingDayMatch ? Number(workingDayMatch[1]) : 85;

  res.json({
    success: true,
    extraction: {
      method: extracted.method,
      rows: rows.length,
      summary: {
        totalWorkingDays,
        holidaysCount,
        examsCount,
        workingSaturdaysCount,
        semesterStart,
        semesterEnd,
      },
    },
    message: 'Review and correct the extracted calendar events before confirming.',
    rows,
  });
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
exports.previewCalendar = asyncHandler((req, res) => processCalendarPreview(req, res));
exports.buildTimetablePreview = buildTimetablePreview;
