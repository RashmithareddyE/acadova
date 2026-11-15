const { normalizeTime } = require('./parseTimetable');

function dateValue(value, defaultYear = null) {
  const input = String(value || '').trim();
  if (!input) return '';
  let year; let month; let day;
  let match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = input.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{2,4})?$/i);
    if (match) {
      const yr = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : defaultYear;
      if (yr) {
        const monthNumber = new Date(`${match[2]} 1, ${yr}`).getMonth() + 1;
        if (monthNumber > 0) { day = match[1]; month = monthNumber; year = yr; }
      }
    }
    if (!match) match = input.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})?$/i);
    if (match && !day) {
      const yr = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : defaultYear;
      if (yr) {
        const monthNumber = new Date(`${match[1]} 1, ${yr}`).getMonth() + 1;
        if (monthNumber > 0) { day = match[2]; month = monthNumber; year = yr; }
      }
    }
  }
  if (!year) {
    match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (match) {
      day = match[1];
      month = match[2];
      year = match[3].length === 2 ? `20${match[3]}` : match[3];
    } else if (defaultYear) {
      match = input.match(/^(\d{1,2})[-/.](\d{1,2})$/);
      if (match) {
        day = match[1];
        month = match[2];
        year = defaultYear;
      }
    }
  }
  if (!year) {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
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
  if (/working saturday|saturday working/.test(value)) return 'working-saturday';
  if (/special working|extra class|compensatory working/.test(value)) return 'special-working-day';
  if (/cancelled class|class cancelled|cancellation|classes suspended/.test(value)) return 'cancelled-class';
  if (/semester start|term start|session start|reopening|commencement of (?:classes|semester|academic|courses)|classes commence|course registration/.test(value)) return 'semester-start';
  if (/semester end|term end|last working day|session end|conclusion of (?:classes|semester)/.test(value)) return 'semester-end';
  if (/exam|examination|midterm|final exam|quiz|practical exam|cie\s*[-–—:]?\s*[1-3]|internal assessment|see\b|lab internals|theory exam|see theory|iat\s*[-–—:]?\s*[1-3]|laboratory internal assessment/.test(value)) return 'exam';
  if (/holiday|vacation|break|no class|recess|independence day|republic day|ganesh|chaturthi|gandhi|jayanti|dasara|dussera|dussehra|ayudha|pooja|vijayadashami|deepavali|diwali|naraka|balipadyami|kanakadasa|christmas|eid|id-milad|bakrid|muharram|maha\s*shivaratri|ugadi|good friday|ambedkar|labour day|basava|amavasya/.test(value)) return 'holiday';
  if (/deadline|due date|submission|last date|display of iat|course end survey/.test(value)) return 'deadline';
  if (/college|university|orientation|induction|convocation|graduation|fest|sports|activity point|ncmc|nptel|mooc/.test(value)) return 'college';
  return 'event';
}

function parseCalendar(text, sourceType = '', words = [], options = {}) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length && !words.length) {
    throw Object.assign(new Error('No calendar information was recognized. Use a document with event names and dates, or enter events manually.'), { statusCode: 422 });
  }

  // Detect default academic year from document text (e.g. "2026", "2026-27")
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const defaultYear = yearMatch ? yearMatch[1] : '2026';

  const header = (lines[0] || '').toLowerCase().split(/\t|,/).map((part) => part.trim());
  const aliases = {
    title: ['event', 'title', 'event title', 'name', 'activity', 'particulars', 'remarks', 'event/activity'],
    date: ['date', 'start date', 'event date', 'from'],
    endDate: ['end date', 'to date', 'through', 'to'],
    type: ['type', 'category'],
    description: ['description', 'details', 'notes'],
  };
  const positions = Object.fromEntries(Object.entries(aliases).map(([key, valList]) => [key, header.findIndex((item) => valList.includes(item))]));
  const tabular = Object.values(positions).some((index) => index >= 0);
  const output = [];

  if (tabular) {
    const table = parseDelimitedRows(text);
    for (const [index, columns] of table.entries()) {
      if (index === 0) continue;
      const get = (field) => positions[field] >= 0 ? columns[positions[field]] || '' : '';
      const title = get('title').trim();
      const date = dateValue(get('date'), defaultYear);
      const rawEndDate = get('endDate').trim();
      const endDate = dateValue(rawEndDate, defaultYear);
      const issues = [];
      if (!title) issues.push('Event title is missing.');
      if (!date) issues.push('Event date is unclear or invalid.');
      if (rawEndDate && !endDate) issues.push('Event end date is unclear or invalid.');
      if (endDate && date && endDate < date) issues.push('End date must be on or after the event date.');
      output.push({ title, type: calendarType(title, get('type')), date, endDate, description: get('description'), sourceLine: index + 1, issues });
    }
  } else {
    // Free text / line matching with enhanced date patterns (supports 2-digit years, ranges, and text dates)
    const datePattern = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})\b/ig;

    const rangeRegex = /\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s*(?:to|-|–|—|through)\s*(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/i;
    const onwardsRegex = /\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+onwards\b/i;

    let currentMonth = '08';
    const monthNameToNum = {
      aug: '08', august: '08',
      sep: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
    };

    for (const [index, line] of lines.entries()) {
      let date = '';
      let endDate = '';
      let title = '';

      // Check for month header line
      const monMatch = line.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
      if (monMatch && line.length < 35 && !/\b(?:exam|holiday|iat|cie|assessment|survey|registration|commencement)\b/i.test(line)) {
        currentMonth = monthNameToNum[monMatch[1].toLowerCase()] || currentMonth;
      }

      // Check explicit Month Day onwards / event
      const explicitMonthMatch = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s+(?:onwards\s+)?[-–—:]\s*(.+)/i);
      if (explicitMonthMatch) {
        const monStr = explicitMonthMatch[1].toLowerCase().slice(0, 3);
        const mm = monthNameToNum[monStr] || currentMonth;
        const dd = String(explicitMonthMatch[2]).padStart(2, '0');
        const yr = explicitMonthMatch[3] || defaultYear;
        date = `${yr}-${mm}-${dd}`;
        title = explicitMonthMatch[4].trim();
      }

      // Check range first
      const rangeMatch = !date && line.match(rangeRegex);
      const onwardsMatch = !date && line.match(onwardsRegex);

      if (!date && rangeMatch) {
        date = dateValue(rangeMatch[1], defaultYear);
        endDate = dateValue(rangeMatch[2], defaultYear);
        title = line.replace(rangeRegex, ' ').replace(/[|,;:–—-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      } else if (!date && onwardsMatch) {
        date = dateValue(onwardsMatch[1], defaultYear);
        title = line.replace(onwardsRegex, ' ').replace(/[|,;:–—-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      } else if (!date) {
        const matches = [...line.matchAll(datePattern)];
        if (matches.length) {
          date = dateValue(matches[0][0], defaultYear);
          endDate = matches[1] ? dateValue(matches[1][0], defaultYear) : '';
          title = line.replace(datePattern, ' ').replace(/\b(?:to|through|until)\b/ig, ' ').replace(/[|,;:–—-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        } else {
          // Check ordinal range with active month: e.g. "*24th to *28th . Course Registration..." or "*28th to *30th — IAT 1"
          const ordinalRangeMatch = line.match(/[*¥#]?(\d{1,2})(?:st|nd|rd|th|[%™])?\s*(?:to|-|–|—)\s*[*¥#]?(\d{1,2})(?:st|nd|rd|th|[%™])?\s*[-–—.:_]\s*(.+)/i);
          if (ordinalRangeMatch && ordinalRangeMatch[3].length > 3) {
            const startDay = String(ordinalRangeMatch[1]).padStart(2, '0');
            const endDay = String(ordinalRangeMatch[2]).padStart(2, '0');
            date = `${defaultYear}-${currentMonth}-${startDay}`;
            endDate = `${defaultYear}-${currentMonth}-${endDay}`;
            title = ordinalRangeMatch[3].replace(/^[-–—.:_|\s]+/, '').trim();
          } else {
            // Check ordinal single date with active month: e.g. "*26th - Id-Milad, Holiday" or "14th — Ganesha Chathurthi, Holiday"
            const ordinalSingleMatch = line.match(/^[*¥#]?(\d{1,2})(?:st|nd|rd|th|[%™])?\s*[-–—.:_]\s*(.+)/i);
            if (ordinalSingleMatch && ordinalSingleMatch[2].length > 3 && !/^(?:week|mon|tue|wed|thu|fri|sat)/i.test(ordinalSingleMatch[2])) {
              const day = String(ordinalSingleMatch[1]).padStart(2, '0');
              date = `${defaultYear}-${currentMonth}-${day}`;
              title = ordinalSingleMatch[2].replace(/^[-–—.:_|\s]+/, '').trim();
            }
          }
        }
      }

      if (!date && !title) continue;
      const issues = [];
      if (!title) issues.push('Event title is missing.');
      if (!date) issues.push('Event date is unclear or invalid.');
      if (endDate && date && endDate < date) issues.push('End date must be on or after the event date.');

      // Check semester filter if specified
      const targetSem = options.semester;
      if (targetSem && targetSem !== 'all') {
        const prefixMatch = title.match(/\b(?:sem(?:ester)?)\s*[:#-]?\s*([1-8]|i|ii|iii|iv|v|vi|vii|viii)\b/i);
        const suffixMatch = title.match(/\b([1-8]|i|ii|iii|iv|v|vi|vii|viii)(?:st|nd|rd|th)?\s*sem(?:ester)?\b/i);
        const rawSem = prefixMatch ? prefixMatch[1] : suffixMatch ? suffixMatch[1] : null;
        if (rawSem) {
          const romanToNum = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8' };
          const foundSem = romanToNum[rawSem.toLowerCase()] || rawSem;
          if (foundSem !== String(targetSem)) {
            continue; // Skip events that explicitly belong to a different semester
          }
        }
      }

      output.push({
        title,
        type: calendarType(title),
        date,
        endDate,
        description: '',
        sourceLine: index + 1,
        issues,
      });
    }
  }

  // Deduplicate entries that have exact same title and date
  const seen = new Set();
  const deduped = [];
  for (const entry of output) {
    const key = `${entry.title.toLowerCase().trim()}|${entry.date}|${entry.endDate}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  if (!deduped.length) {
    throw Object.assign(new Error('No calendar events with recognizable dates were found. Check the document or enter events manually.'), { statusCode: 422 });
  }

  return deduped;
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

module.exports = { parseExams, parseSyllabus, parseCalendar, dateValue, calendarType };
