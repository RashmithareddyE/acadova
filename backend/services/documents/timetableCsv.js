const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLUMNS = ['subject', 'subject_code', 'day', 'start_time', 'end_time', 'faculty', 'location', 'session_type'];
const { isCorruptedOrGarbage, cleanCellText } = require('./parseTimetable');

const DAY_ALIASES = new Map([
  ['monday', 'Monday'], ['mon', 'Monday'],
  ['tuesday', 'Tuesday'], ['tue', 'Tuesday'], ['tues', 'Tuesday'],
  ['wednesday', 'Wednesday'], ['wed', 'Wednesday'],
  ['thursday', 'Thursday'], ['thu', 'Thursday'], ['thur', 'Thursday'], ['thurs', 'Thursday'],
  ['friday', 'Friday'], ['fri', 'Friday'],
  ['saturday', 'Saturday'], ['sat', 'Saturday'],
  ['sunday', 'Sunday'], ['sun', 'Sunday'],
]);

function canonicalDay(value) {
  if (Number.isInteger(value) && value >= 0 && value < DAYS.length) return DAYS[value];
  return DAY_ALIASES.get(String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')) || '';
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCanonicalRow(row = {}) {
  return {
    subject: String(row.subjectName ?? row.subject ?? '').trim(),
    subject_code: String(row.subjectCode ?? row.subject_code ?? '').trim(),
    day: canonicalDay(row.weekday ?? row.day),
    start_time: String(row.startTime ?? row.start_time ?? '').trim(),
    end_time: String(row.endTime ?? row.end_time ?? '').trim(),
    faculty: String(row.teacher ?? row.faculty ?? '').trim(),
    location: String(row.location ?? '').trim(),
    session_type: String(row.sessionType ?? row.session_type ?? '').trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
  };
}

function serializeTimetableCsv(rows, { bom = true } = {}) {
  const lines = [
    COLUMNS.join(','),
    ...rows.map((row) => COLUMNS.map((column) => csvCell(toCanonicalRow(row)[column])).join(',')),
  ];
  return `${bom ? '\uFEFF' : ''}${lines.join('\r\n')}\r\n`;
}

function mergeLaboratoryPeriods(rows) {
  const ordered = rows.map((row) => ({ ...row })).sort((left, right) => (
    (left.weekday ?? 7) - (right.weekday ?? 7)
    || String(left.startTime || '').localeCompare(String(right.startTime || ''))
    || String(left.sourceLine || '').localeCompare(String(right.sourceLine || ''))
  ));
  const merged = [];
  for (const row of ordered) {
    const previous = merged.at(-1);
    const isLab = /^(lab|practical)$/i.test(row.sessionType || '')
      || /\b(lab|laboratory|practical)\b/i.test(row.subjectName || '');
    const sameClass = previous && isLab
      && (previous.sessionType === row.sessionType || !previous.sessionType || !row.sessionType)
      && previous.weekday === row.weekday
      && previous.endTime === row.startTime
      && String(previous.subjectName || '').trim().toLowerCase() === String(row.subjectName || '').trim().toLowerCase()
      && String(previous.subjectCode || '').trim().toLowerCase() === String(row.subjectCode || '').trim().toLowerCase()
      && String(previous.teacher || '').trim().toLowerCase() === String(row.teacher || '').trim().toLowerCase()
      && String(previous.location || '').trim().toLowerCase() === String(row.location || '').trim().toLowerCase()
      && String(previous.section || '').trim().toLowerCase() === String(row.section || '').trim().toLowerCase();
    if (sameClass) {
      previous.endTime = row.endTime;
      previous.sourceLines = [...(previous.sourceLines || [previous.sourceLine]), row.sourceLine].filter(Boolean);
      previous.issues = [...new Set([...(previous.issues || []), ...(row.issues || [])])];
      if (row.rawText && previous.rawText && !previous.rawText.includes(row.rawText)) {
        previous.rawText = `${previous.rawText} + ${row.rawText}`;
      }
      if (Number.isFinite(row.confidence) && Number.isFinite(previous.confidence)) {
        previous.confidence = Math.min(previous.confidence, row.confidence);
      }
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

function validateTimetableRows(rows) {
  const validated = rows.map((row) => {
    const next = {
      ...row,
      issues: [...(row.issues || [])],
    };
    if (row.rawText !== undefined) next.rawText = row.rawText;
    if (row.confidence !== undefined) next.confidence = Number.isFinite(row.confidence) ? Math.round(row.confidence) : 100;
    const cleanName = cleanCellText(next.subjectName);
    if (!cleanName || isCorruptedOrGarbage(cleanName)) next.issues.push('Subject is missing.');
    if (!Number.isInteger(next.weekday) || next.weekday < 0 || next.weekday > 6) next.issues.push('Weekday is unclear.');
    const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
    if (!validTime(next.startTime) || !validTime(next.endTime) || next.startTime >= next.endTime) {
      next.issues.push('Start/end time is missing or invalid.');
    }
    if (next.sessionType && !['lecture', 'lab', 'practical', 'tutorial', 'other'].includes(String(next.sessionType).toLowerCase())) {
      next.issues.push('Session type is not supported. Choose Lecture, Lab, Practical, Tutorial, or Other.');
    }
    next.issues = [...new Set(next.issues)];

    const hasBlockingMissing = !cleanName
      || isCorruptedOrGarbage(cleanName)
      || !Number.isInteger(next.weekday)
      || next.weekday < 0
      || next.weekday > 6
      || !validTime(next.startTime)
      || !validTime(next.endTime)
      || next.startTime >= next.endTime;

    if (row.status !== undefined) {
      next.status = hasBlockingMissing ? 'invalid' : ((next.confidence != null && next.confidence < 55) || next.issues.length > 0 ? 'needs-review' : 'valid');
    }

    return next;
  });

  const signature = (row) => [
    row.weekday,
    String(row.subjectCode || row.subjectName || '').trim().toLowerCase(),
    row.startTime,
    row.endTime,
    String(row.section || '').trim().toLowerCase(),
  ].join('|');
  const firstBySignature = new Map();
  for (const row of validated) {
    if (row.issues.some((issue) => /missing|unclear|invalid/i.test(issue))) continue;
    const key = signature(row);
    if (firstBySignature.has(key)) {
      row.issues.push(`Duplicate class row; it matches row ${firstBySignature.get(key)}.`);
      row.status = 'invalid';
    } else {
      firstBySignature.set(key, row.sourceLine || validated.indexOf(row) + 1);
    }
  }

  for (let index = 0; index < validated.length; index += 1) {
    const current = validated[index];
    if (current.issues.some((issue) => /missing|unclear|invalid/i.test(issue))) continue;
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const other = validated[otherIndex];
      if (other.issues.some((issue) => /missing|unclear|invalid/i.test(issue))) continue;
      if (current.weekday !== other.weekday) continue;
      if (current.section && other.section && current.section !== other.section) continue;
      if (signature(current) === signature(other)) continue;
      if (current.startTime < other.endTime && other.startTime < current.endTime) {
        current.issues.push(`Class time overlaps row ${other.sourceLine || otherIndex + 1}.`);
        other.issues.push(`Class time overlaps row ${current.sourceLine || index + 1}.`);
        if (current.status === 'valid') current.status = 'needs-review';
        if (other.status === 'valid') other.status = 'needs-review';
      }
    }
  }
  return validated;
}

module.exports = {
  COLUMNS,
  canonicalDay,
  toCanonicalRow,
  serializeTimetableCsv,
  mergeLaboratoryPeriods,
  validateTimetableRows,
};
