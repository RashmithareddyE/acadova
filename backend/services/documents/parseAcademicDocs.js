const { normalizeTime } = require('./parseTimetable');

function dateValue(value) {
  const input = String(value || '').trim();
  let year; let month; let day;
  let match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = input.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/i);
    if (match) {
      const monthNumber = new Date(`${match[2]} 1, ${match[3]}`).getMonth() + 1;
      if (monthNumber > 0) { day = match[1]; month = monthNumber; year = match[3]; }
    }
    if (!match) match = input.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (match && !day) {
      const monthFirst = /^[A-Za-z]/.test(input);
      const monthText = monthFirst ? match[1] : match[2];
      const monthNumber = new Date(`${monthText} 1, ${monthFirst ? match[3] : match[3]}`).getMonth() + 1;
      if (monthNumber > 0) { day = monthFirst ? match[2] : match[1]; month = monthNumber; year = match[3]; }
    }
  }
  if (!year) {
    match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) { day = match[1]; month = match[2]; year = match[3]; }
    else {
      const parsed = new Date(input);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toISOString().slice(0, 10);
    }
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? date.toISOString().slice(0, 10) : '';
}

function parseDelimitedRows(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const output = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value.trim()); if (row.some(Boolean)) output.push(row); row = []; value = '';
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) output.push(row);
  return output;
}

function calendarType(title, supplied = '') {
  const value = `${supplied} ${title}`.toLowerCase();
  if (/holiday|vacation|break|no class/.test(value)) return 'holiday';
  if (/deadline|due date|submission/.test(value)) return 'deadline';
  if (/college|university|orientation|semester|term|commencement/.test(value)) return 'college';
  return 'event';
}

function parseCalendar(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw Object.assign(new Error('No calendar information was recognized. Use a document with event names and dates, or enter events manually.'), { statusCode: 422 });
  const header = lines[0].toLowerCase().split(/\t|,/).map((part) => part.trim());
  const aliases = {
    title: ['event', 'title', 'event title', 'name', 'activity'],
    date: ['date', 'start date', 'event date'],
    endDate: ['end date', 'to date', 'through'],
    type: ['type', 'category'],
    description: ['description', 'details', 'notes'],
  };
  const positions = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, header.findIndex((item) => values.includes(item))]));
  const tabular = Object.values(positions).some((index) => index >= 0);
  const output = [];
  if (tabular) {
    const table = parseDelimitedRows(text);
    for (const [index, columns] of table.entries()) {
      if (index === 0) continue;
      const get = (field) => positions[field] >= 0 ? columns[positions[field]] || '' : '';
      const title = get('title').trim(); const date = dateValue(get('date')); const rawEndDate = get('endDate').trim(); const endDate = dateValue(rawEndDate);
      const issues = [];
      if (!title) issues.push('Event title is missing.');
      if (!date) issues.push('Event date is unclear or invalid.');
      if (rawEndDate && !endDate) issues.push('Event end date is unclear or invalid.');
      if (endDate && date && endDate < date) issues.push('End date must be on or after the event date.');
      output.push({ title, type: calendarType(title, get('type')), date, endDate, description: get('description'), sourceLine: index + 1, issues });
    }
  } else {
    const datePattern = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/ig;
    for (const [index, line] of lines.entries()) {
      const matches = [...line.matchAll(datePattern)];
      if (!matches.length) continue;
      const date = dateValue(matches[0][0]); const endDate = matches[1] ? dateValue(matches[1][0]) : '';
      const title = line.replace(datePattern, ' ').replace(/\b(?:to|through|until)\b/ig, ' ').replace(/[|,;:–—-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const issues = [];
      if (!title) issues.push('Event title is missing.');
      if (!date) issues.push('Event date is unclear or invalid.');
      if (matches[1] && !endDate) issues.push('Event end date is unclear or invalid.');
      if (endDate && date && endDate < date) issues.push('End date must be on or after the event date.');
      output.push({ title, type: calendarType(title), date, endDate, description: '', sourceLine: index + 1, issues });
    }
  }
  if (!output.length) throw Object.assign(new Error('No calendar events with recognizable dates were found. Check the document or enter events manually.'), { statusCode: 422 });
  return output;
}

function splitLine(line) { return line.split(/\t|\s*,\s*|\s*\|\s*/).map((part) => part.trim()).filter(Boolean); }

function parseExams(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = (lines[0] || '').toLowerCase().split(/\t|,/).map((part) => part.trim());
  const aliases = { subjectName: ['subject', 'subject name', 'course'], subjectCode: ['code', 'subject code'], date: ['date', 'exam date'], startTime: ['start', 'start time'], endTime: ['end', 'end time'], venue: ['venue', 'room', 'location'], title: ['exam', 'exam name', 'type'], notes: ['notes', 'instructions'] };
  const positions = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex((item) => names.includes(item))]));
  const tabular = Object.values(positions).some((index) => index >= 0);
  const rows = [];
  for (const [index, line] of lines.entries()) {
    if (tabular && index === 0) continue;
    const cols = tabular ? splitLine(line) : null;
    const get = (key) => tabular ? (positions[key] >= 0 ? cols[positions[key]] || '' : '') : '';
    let subjectName = get('subjectName'); let subjectCode = get('subjectCode'); let date = dateValue(get('date'));
    let title = get('title'); let startTime = normalizeTime(get('startTime')); let endTime = normalizeTime(get('endTime')); let venue = get('venue'); let notes = get('notes');
    if (!tabular) {
      const dateMatch = line.match(/\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i);
      if (!dateMatch) continue;
      date = dateValue(dateMatch[0]);
      const afterDate = line.slice(dateMatch.index + dateMatch[0].length);
      const venueMatch = afterDate.match(/\b(?:room|venue|hall|location)\s*[:#-]?\s*([A-Za-z]?\d+[A-Za-z]?|[A-Z]{1,3})\b/i);
      const timeRegion = venueMatch ? afterDate.slice(0, venueMatch.index) : afterDate;
      const times = [...timeRegion.matchAll(/\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)\b/gi)];
      startTime = normalizeTime(times[0]?.[0]); endTime = normalizeTime(times[1]?.[0]);
      const prefix = line.slice(0, dateMatch.index).trim();
      const type = prefix.match(/\b(mid[- ]?term|final|quiz|practical|exam(?:ination)?)\b/i);
      title = type?.[0] || 'Exam';
      const code = prefix.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/);
      subjectCode = code?.[0] || '';
      venue = venueMatch ? venueMatch[0].trim() : '';
      subjectName = prefix.replace(type?.[0] || '', ' ').replace(subjectCode, ' ').replace(/[|,;:-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    const issues = [];
    if (!date) issues.push('Exam date is unclear or invalid.');
    if (!subjectName && !subjectCode) issues.push('Subject is unclear.');
    if (Boolean(startTime) !== Boolean(endTime)) issues.push('Enter both exam times or leave both blank.');
    if (startTime && endTime && startTime >= endTime) issues.push('End time must be after start time.');
    rows.push({ title: title || 'Exam', type: /final/i.test(title) ? 'final' : /mid/i.test(title) ? 'midterm' : /quiz/i.test(title) ? 'quiz' : /practical/i.test(title) ? 'practical' : 'other', subjectName, subjectCode, date, startTime: startTime || '', endTime: endTime || '', venue, notes, sourceLine: index + 1, issues });
  }
  if (!rows.length) throw Object.assign(new Error('No exam rows were recognized. Use a table with subject, date, start time, end time, and venue columns, or correct the details manually.'), { statusCode: 422 });
  return rows;
}

function parseSyllabus(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let subjectName = ''; let subjectCode = ''; let unit = ''; let unitTitle = ''; const topics = [];
  for (const line of lines) {
    const subject = line.match(/^(?:subject|course)\s*[:\-]\s*(.+)$/i);
    if (subject) { subjectName = subject[1].trim(); continue; }
    const code = line.match(/^(?:subject\s+)?code\s*[:\-]\s*([A-Z0-9-]+)$/i);
    if (code) { subjectCode = code[1]; continue; }
    const heading = line.match(/^(?:unit|module)\s*([\w.-]+)\s*[:.\-–—]?\s*(.*)$/i);
    if (heading) { unit = `Unit ${heading[1]}`; unitTitle = heading[2].trim(); continue; }
    const unitNumber = line.match(/^\d+[.)]\s+(.+)$/);
    if (!unit && unitNumber && /unit|module/i.test(line)) { unit = line; unitTitle = ''; continue; }
    if (!unit) continue;
    const cleaned = line.replace(/^(?:[-*•▪]|\d+[.)])\s*/, '').trim();
    if (!cleaned || /^(hours|references|textbooks)\s*:/i.test(cleaned)) continue;
    if (!unitTitle && !/^(?:[-*•▪]|\d+[.)])/.test(line)) { unitTitle = cleaned; continue; }
    topics.push({ unit, unitTitle, topic: cleaned, sourceLine: lines.indexOf(line) + 1, issues: [] });
  }
  if (!topics.length) throw Object.assign(new Error('No syllabus unit topics were recognized. Add unit headings and topic lines, or enter the syllabus manually.'), { statusCode: 422 });
  return { subjectName, subjectCode, units: [...new Set(topics.map((topic) => topic.unit))].map((name) => ({ name, title: topics.find((topic) => topic.unit === name)?.unitTitle || '' })), topics };
}

module.exports = { parseExams, parseSyllabus, parseCalendar, dateValue };
