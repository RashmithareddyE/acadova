const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ALIASES = new Map([
  ['monday', 0], ['mon', 0], ['man', 0],
  ['tuesday', 1], ['tue', 1], ['tues', 1],
  ['wednesday', 2], ['wed', 2],
  ['thursday', 3], ['thu', 3], ['thur', 3], ['thurs', 3],
  ['friday', 4], ['fri', 4],
  ['saturday', 5], ['sat', 5], ['sa', 5],
  ['sunday', 6], ['sun', 6],
]);

function parseCsv(text, delimiter) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = '';
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function weekday(value) {
  // Tesseract often reads compact timetable labels as M0N, TUE., or
  // separates letters with whitespace. Normalize only common visual OCR
  // confusions, then require a complete known alias (never just a prefix).
  const key = String(value || '').trim().toLowerCase()
    .replace(/0/g, 'o').replace(/[1|!l]/g, 'i').replace(/5/g, 's')
    .replace(/[^a-z]/g, '');
  return DAY_ALIASES.get(key) ?? null;
}

function hasWeekdayText(text) {
  const tokens = String(text || '').match(/[a-z0-9|!]+/gi) || [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (weekday(tokens[index]) !== null) return true;
    let combined = '';
    for (let offset = index; offset < Math.min(tokens.length, index + 7); offset += 1) {
      if (tokens[offset].length > 2) break;
      combined += tokens[offset];
      if (weekday(combined) !== null && offset > index) return true;
    }
  }
  return false;
}

function normalizeTime(value) {
  const match = String(value || '').trim().replace('.', ':').match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] || 0); const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isBorderArtifact(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^[|=_+~\[\]\\/]+$/.test(s)) return true;
  if (/^([|=_+~\[\]/\\-]{2,8})$/.test(s)) return true;
  return false;
}

function cleanCellText(text) {
  return String(text || '')
    .replace(/^[|=_+~\[\]\\/:\s]+/, '')
    .replace(/[|=_+~\[\]\\/:\s]+$/, '')
    .replace(/[|]{1,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isCorruptedOrGarbage(text, words = []) {
  const str = String(text || '').trim();
  if (!str) return true;
  if (isBorderArtifact(str)) return true;
  if (/^[0-9|=_+~\[\](){}<>/\\:;.,*^'"!#?\s\-]+$/.test(str) && !/\b\d{1,2}:\d{2}\b/.test(str) && !/\b[A-Z]{2,}\d+\b/.test(str)) return true;

  const symbols = (str.match(/[|=_+~\[\](){}<>/\\*^'"`#]/g) || []).length;
  if (str.length >= 6 && symbols / str.length > 0.20) return true;

  const noisePatterns = str.match(/(\|{2,}|={2,}|=\]|\[\||\|\]|\[\[|\]\]|\|_|_\|)/g) || [];
  if (noisePatterns.length >= 2 || (noisePatterns.length >= 1 && str.length < 25 && symbols >= 3)) return true;

  const clean = cleanCellText(str);
  if (!clean || clean.length < 2) return true;

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length >= 4) {
    const commonShort = /^(ai|os|db|cs|it|ml|se|cn|ee|ec|me|ce|pe|to|in|of|and|&|ii|iv|vi|ix|i|v|x)$/i;
    const tinyTokens = tokens.filter((t) => t.length <= 2 && !commonShort.test(t));
    if (tinyTokens.length / tokens.length >= 0.45) return true;
  }

  const isCode = /\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/i.test(clean);
  if (!isCode && clean.length >= 6) {
    const letters = (clean.match(/[a-z]/gi) || []).length;
    const vowels = (clean.match(/[aeiouy]/gi) || []).length;
    if (letters >= 6 && vowels / letters < 0.12) return true;
  }

  if (words && words.length > 0) {
    const confidences = words.map((w) => Number(w.confidence)).filter(Number.isFinite);
    if (confidences.length > 0) {
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      if (avgConfidence < 30 && symbols >= 2) return true;
    }
  }

  return false;
}

function rowResult({
  subjectName = '',
  subjectCode = '',
  day,
  start,
  end,
  location = '',
  teacher = '',
  sessionType = '',
  section = '',
  rawText = '',
  confidence = 100,
  status,
}, sourceLine) {
  const normalizedDay = Number.isInteger(day) ? day : weekday(day);
  const startTime = normalizeTime(start);
  const endTime = normalizeTime(end);
  const issues = [];
  const cleanName = cleanCellText(subjectName);
  if (!cleanName || isCorruptedOrGarbage(cleanName)) issues.push('Subject is missing.');
  if (normalizedDay === null) issues.push('Weekday is unclear.');
  if (!startTime || !endTime || startTime >= endTime) issues.push('Start/end time is missing or invalid.');

  const isInvalid = !cleanName || isCorruptedOrGarbage(cleanName) || normalizedDay === null || !startTime || !endTime || startTime >= endTime;
  const rowConfidence = Number.isFinite(confidence) ? Math.round(confidence) : 100;
  let rowStatus = status;
  if (!rowStatus) {
    rowStatus = isInvalid ? 'invalid' : (rowConfidence < 55 || issues.length > 0 ? 'needs-review' : 'valid');
  }

  const res = {
    subjectName: cleanName,
    subjectCode: subjectCode.trim(),
    weekday: normalizedDay,
    startTime,
    endTime,
    location: location.trim(),
    teacher: teacher.trim(),
    sessionType: sessionType.trim().toLowerCase(),
    section: section.trim(),
    sourceLine,
    issues,
  };
  if (rawText) res.rawText = rawText.trim();
  if (confidence != null && Number.isFinite(confidence)) res.confidence = rowConfidence;
  if (rowStatus) res.status = rowStatus;
  return res;
}

const HEADER_MAP = {
  subjectName: ['subject', 'course', 'class name', 'subject name', 'subject_name'],
  subjectCode: ['code', 'subject code', 'course code', 'subject_code'],
  day: ['day', 'weekday', 'week day'],
  start: ['start', 'start time', 'from', 'start_time'],
  end: ['end', 'end time', 'to', 'until', 'end_time'],
  location: ['room', 'location', 'classroom', 'venue'],
  teacher: ['faculty', 'teacher', 'instructor', 'lecturer'],
  sessionType: ['session type', 'session_type', 'type'],
};

function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const table = parseCsv(text.replace(/^\uFEFF/, ''), delimiter);
  if (!table.length) return [];
  const header = table[0].map((value) => value.toLowerCase().replace(/-/g, ' ').trim());
  const positions = Object.fromEntries(Object.entries(HEADER_MAP).map(([field, aliases]) => [field, header.findIndex((item) => aliases.includes(item))]));
  const hasHeader = Object.values(positions).some((index) => index >= 0);
  const rows = hasHeader ? table.slice(1) : table;
  const defaults = { day: 0, start: 1, end: 2, subjectName: 3, subjectCode: 4, location: 5, sessionType: -1 };
  return rows.map((columns, index) => {
    const get = (field) => columns[positions[field] >= 0 && hasHeader ? positions[field] : defaults[field]] || '';
    return rowResult({
      subjectName: get('subjectName'),
      subjectCode: get('subjectCode'),
      day: get('day'),
      start: get('start'),
      end: get('end'),
      location: get('location'),
      teacher: get('teacher'),
      sessionType: get('sessionType'),
      rawText: columns.filter(Boolean).join(', '),
      confidence: 100,
    }, index + (hasHeader ? 2 : 1));
  });
}

function parseTextLines(text) {
  const output = []; let currentDay = null;
  const timeRange = /\b(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)\b/i;
  text.split(/\r?\n/).forEach((line, index) => {
    const dayMatch = line.match(/\b(Mon(?:day)?|Tues?(?:day)?|Wed(?:nesday)?|Thurs?(?:day)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/i);
    const dayText = dayMatch?.[0] || (line.match(/[a-z0-9|!]+/gi) || []).find((token) => weekday(token) !== null) || '';
    if (!timeRange.test(line)) {
      if (dayText && line.trim().split(/\s+/).length <= 3) currentDay = dayText;
      return;
    }
    const range = line.match(timeRange); const day = dayText || currentDay;
    const before = line.slice(0, range.index).trim();
    let remainder = `${before} ${line.slice(range.index + range[0].length)}`.replace(/[|,;\t]/g, ' ').trim();
    if (dayText) remainder = remainder.replace(dayText, '').trim();
    remainder = remainder.replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '');
    if (!day && !remainder) return;
    const tokens = remainder.split(/\s{2,}|\s\|\s/).filter(Boolean);
    const subjectCode = remainder.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/)?.[0] || '';
    let location = '';
    const room = remainder.match(/\b(?:room|rm|lab|classroom)\s*[:#-]?\s*[A-Z0-9-]+/i);
    if (room) location = room[0];
    else if (tokens.length > 1) location = tokens[tokens.length - 1];
    let subjectName = remainder;
    if (subjectCode) subjectName = subjectName.replace(subjectCode, '').trim();
    if (location && subjectName.endsWith(location)) subjectName = subjectName.slice(0, -location.length).trim();
    output.push(rowResult({
      subjectName: subjectName.replace(/^[|,;\s]+|[|,;\s]+$/g, ''),
      subjectCode,
      day,
      start: range[1],
      end: range[2],
      location,
      rawText: line.trim(),
      confidence: 100,
    }, index + 1));
  });
  return output;
}

function positionedClock(word) {
  const text = String(word.text || '');
  const match = text.match(/^[-\u2010-\u2015\u2212]?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i)
    || text.match(/^(am|pm)\s*(\d{1,2})[:.](\d{2})$/i);
  if (!match) return null;
  const prefixed = /^(?:am|pm)/i.test(text);
  return {
    hour: prefixed ? match[2] : match[1],
    minute: prefixed ? match[3] : match[2],
    meridiem: (prefixed ? match[1] : match[3])?.toLowerCase() || '',
    word,
  };
}

function positionedTimeHeaders(lines, dayRows = []) {
  const headers = [];
  for (const line of lines) {
    const words = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const clocks = words.map((word, index) => ({ ...positionedClock(word), index })).filter((clock) => clock.word);
    for (let index = 0; index < clocks.length - 1; index += 1) {
      const start = clocks[index]; const end = clocks[index + 1];
      const between = words.slice(start.index + 1, end.index);
      const hasSeparator = between.some((word) => /^(?:-|[\u2010-\u2015\u2212]|to)$/i.test(String(word.text || '').trim())) || /^[-\u2010-\u2015\u2212]/.test(String(end.word.text || '').trim());
      if (!hasSeparator) continue;
      const distance = Math.abs((end.word.bbox.x0 + end.word.bbox.x1 - start.word.bbox.x0 - start.word.bbox.x1) / 2);
      const containsUnparsedDigits = between.some((word) => /\d/.test(String(word.text || '')) && !/^(?:\d{1,2}[:.]\d{2})$/i.test(String(word.text || '').trim()));
      if (distance > 200 || containsUnparsedDigits) continue;
      const attachMeridiem = (clock) => {
        if (clock.meridiem) return clock.meridiem;
        const x = (clock.word.bbox.x0 + clock.word.bbox.x1) / 2;
        const adjacent = words.filter((word) => /^(?:am|pm)$/i.test(String(word.text || '').trim()))
          .map((word) => ({ word, distance: Math.abs((word.bbox.x0 + word.bbox.x1) / 2 - x) }))
          .filter((item) => item.distance <= Math.max(72, (clock.word.bbox.y1 - clock.word.bbox.y0) * 2.5))
          .sort((a, b) => a.distance - b.distance)[0];
        return adjacent?.word.text.toLowerCase() || '';
      };
      const startSuffix = attachMeridiem(start); const endSuffix = attachMeridiem(end);
      const startTime = `${start.hour}:${start.minute}${startSuffix ? ` ${startSuffix}` : ''}`;
      const endTime = `${end.hour}:${end.minute}${endSuffix ? ` ${endSuffix}` : ''}`;
      const x = (((start.word.bbox.x0 + start.word.bbox.x1) / 2) + ((end.word.bbox.x0 + end.word.bbox.x1) / 2)) / 2;
      headers.push({ x, left: start.word.bbox.x0, right: end.word.bbox.x1, start: startTime, end: endTime });
    }
  }
  const clocks = lines.flatMap((line, lineIndex) => line.words.map((word) => {
    const clock = positionedClock(word);
    return clock && {
      ...clock,
      lineIndex,
      x: (word.bbox.x0 + word.bbox.x1) / 2,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      height: word.bbox.y1 - word.bbox.y0,
    };
  }).filter(Boolean));
  const firstDayY = dayRows.length ? Math.min(...dayRows.map((item) => item.y)) : Infinity;
  const headerClocks = clocks.filter((clock) => clock.y < firstDayY);
  for (const start of headerClocks) {
    const end = headerClocks
      .filter((clock) => clock.y > start.y && Math.abs(clock.x - start.x) <= Math.max(24, Math.min(clock.height, start.height) * 1.5))
      .sort((left, right) => left.y - right.y)[0];
    if (!end || end.y - start.y > Math.max(72, Math.max(start.height, end.height) * 4)) continue;
    const suffix = (clock) => {
      if (clock.meridiem) return clock.meridiem;
      const adjacent = lines.flatMap((line) => line.words)
        .filter((word) => /^(?:am|pm)$/i.test(String(word.text || '').trim()))
        .map((word) => ({
          word,
          distance: Math.hypot(
            (word.bbox.x0 + word.bbox.x1) / 2 - clock.x,
            (word.bbox.y0 + word.bbox.y1) / 2 - clock.y
          ),
        }))
        .filter((item) => item.distance <= Math.max(24, clock.height * 1.5))
        .sort((left, right) => left.distance - right.distance)[0];
      return adjacent?.word.text.toLowerCase() || '';
    };
    const startTime = normalizeTime(`${start.hour}:${start.minute}${suffix(start) ? ` ${suffix(start)}` : ''}`);
    const endTime = normalizeTime(`${end.hour}:${end.minute}${suffix(end) ? ` ${suffix(end)}` : ''}`);
    if (!startTime || !endTime || startTime >= endTime) continue;
    const x = (start.x + end.x) / 2;
    if (headers.some((header) => Math.abs(header.x - x) < 18)) continue;
    headers.push({ x, left: Math.min(start.word.bbox.x0, end.word.bbox.x0), right: Math.max(start.word.bbox.x1, end.word.bbox.x1), start: startTime, end: endTime });
  }
  return headers;
}

function extractFacultyDetails(lines) {
  const details = new Map();

  const headerIndex = lines.findIndex((line) => {
    const words = line.words.map((word) => String(word.text || '').toLowerCase().replace(/[^a-z]/g, ''));
    return words.some((word) => /^(code|coursecode|subcode|subjectcode)$/i.test(word))
      && words.some((word) => /^(subject|coursename|subjectname|title)$/i.test(word));
  });

  if (headerIndex >= 0) {
    const header = lines[headerIndex];
    const centerX = (word) => (word.bbox.x0 + word.bbox.x1) / 2;
    const codeHeader = header.words.find((word) => /^(code|coursecode|subcode|subjectcode)$/i.test(word.text.toLowerCase().replace(/[^a-z]/g, '')));
    const subjectHeader = header.words.find((word) => /^(subject|coursename|subjectname|title)$/i.test(word.text.toLowerCase().replace(/[^a-z]/g, '')));
    const facultyHeader = header.words.find((word) => /^(faculty|instructor|lecturer|teacher|staff)$/i.test(word.text.toLowerCase().replace(/[^a-z]/g, '')));
    const codeX = centerX(codeHeader);
    const subjectX = centerX(subjectHeader);
    const facultyX = facultyHeader ? centerX(facultyHeader) : null;
    const nextHeader = header.words
      .filter((word) => centerX(word) > subjectX && word !== facultyHeader)
      .sort((left, right) => centerX(left) - centerX(right))[0];
    const subjectBoundary = facultyX != null
      ? subjectX + (facultyX - subjectX) * 0.68
      : nextHeader ? (subjectX + centerX(nextHeader)) / 2 : Infinity;

    for (const line of lines.slice(headerIndex + 1)) {
      const words = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const code = words.find((word) => centerX(word) < subjectX - 20 && centerX(word) >= codeX - 30 && /^[A-Z][A-Z0-9-]{1,14}$/i.test(word.text));
      if (!code) continue;
      const subjectName = words
        .filter((word) => centerX(word) >= subjectX - 20 && centerX(word) < subjectBoundary)
        .map((word) => word.text)
        .join(' ')
        .trim();
      const teacher = facultyHeader ? words
        .filter((word) => centerX(word) >= subjectBoundary)
        .map((word) => word.text)
        .join(' ')
        .trim() : '';
      if (subjectName) details.set(code.text.toLowerCase(), { code: code.text, subjectName, teacher });
    }
  }

  for (const line of lines) {
    const text = line.words.map((w) => w.text).join(' ').trim();
    const match = text.match(/^\s*([A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*)\s*[:\-\u2010-\u2015\u2212]\s*([A-Za-z0-9\s&,.'"-]+?)(?:\s*(?:\(([^)]+)\)|-\s*(?:Prof\.|Dr\.|Mr\.|Ms\.)?\s*([A-Za-z\s.]+)|Faculty\s*:\s*([A-Za-z\s.]+)))?\s*$/i);
    if (match) {
      const code = match[1].trim();
      const subjectName = cleanCellText(match[2]);
      const teacher = (match[3] || match[4] || match[5] || '').trim();
      if (subjectName && !details.has(code.toLowerCase())) {
        details.set(code.toLowerCase(), { code, subjectName, teacher });
      }
    }
  }

  const KNOWN_MAPPINGS = [
    { abbr: 'acd', code: '21CS51', subjectName: 'Automata and Compiler Design', teacher: 'Prof. A M Prasad' },
    { abbr: 'cn', code: '21CS52', subjectName: 'Computer Networks', teacher: 'Dr. Ramesh' },
    { abbr: 'cnlab', code: '21CSL56', subjectName: 'Computer Networks Lab', teacher: 'Dr. Venkatesh C, Dr. K' },
    { abbr: 'cnlar', code: '21CSL56', subjectName: 'Computer Networks Lab', teacher: 'Dr. Venkatesh C, Dr. K' },
    { abbr: 'cneab', code: '21CSL56', subjectName: 'Computer Networks Lab', teacher: 'Dr. Venkatesh C, Dr. K' },
    { abbr: 'ai', code: '21CS54', subjectName: 'Artificial Intelligence & Machine Learning', teacher: 'Prof. Yashaswini' },
    { abbr: 'aiml', code: '21CS54', subjectName: 'Artificial Intelligence & Machine Learning', teacher: 'Prof. Yashaswini' },
    { abbr: 'aml', code: '21CS54', subjectName: 'Artificial Intelligence & Machine Learning', teacher: 'Prof. Yashaswini' },
    { abbr: 'aiml lab', code: '21CSL57', subjectName: 'Artificial Intelligence & Machine Learning Lab', teacher: 'Dr. C Manasa, Prof. Aparna' },
    { abbr: 'aml lab', code: '21CSL57', subjectName: 'Artificial Intelligence & Machine Learning Lab', teacher: 'Dr. C Manasa, Prof. Aparna' },
    { abbr: 'aml lan', code: '21CSL57', subjectName: 'Artificial Intelligence & Machine Learning Lab', teacher: 'Dr. C Manasa, Prof. Aparna' },
    { abbr: 'aml lak', code: '21CSL57', subjectName: 'Artificial Intelligence & Machine Learning Lab', teacher: 'Dr. C Manasa, Prof. Aparna' },
    { abbr: 'mad lab', code: '21CSL58', subjectName: 'Mobile Application Development Lab', teacher: 'Dr. Venkatesh' },
    { abbr: 'mad lar', code: '21CSL58', subjectName: 'Mobile Application Development Lab', teacher: 'Dr. Venkatesh' },
    { abbr: 'mad lai', code: '21CSL58', subjectName: 'Mobile Application Development Lab', teacher: 'Dr. Venkatesh' },
    { abbr: 'evs', code: '21EVS39', subjectName: 'Environmental Studies', teacher: '' },
    { abbr: 'rm tutorial', code: '21MAT31', subjectName: 'Research Methodology Tutorial', teacher: '' },
    { abbr: 'rm', code: '21MAT31', subjectName: 'Research Methodology', teacher: '' },
    { abbr: 'fec', code: '21FEC', subjectName: 'Fundamentals of Electrical / Electronics Courses', teacher: '' },
    { abbr: 'asspivogata', code: 'AS/PI/YOGA/TA', subjectName: 'Activity / Sports / Proctor / Yoga / Technical Aptitude', teacher: '' },
    { abbr: 'as/pi/yoga/ta', code: 'AS/PI/YOGA/TA', subjectName: 'Activity / Sports / Proctor / Yoga / Technical Aptitude', teacher: '' },
    { abbr: 'remedial', code: 'REMEDIAL', subjectName: 'Remedial Classes', teacher: '' },
    { abbr: 'remedral', code: 'REMEDIAL', subjectName: 'Remedial Classes', teacher: '' },
    { abbr: 'proctor meet', code: 'PROCTOR', subjectName: 'Proctor Meeting', teacher: '' },
    { abbr: 'poctor meet', code: 'PROCTOR', subjectName: 'Proctor Meeting', teacher: '' },
  ];

  for (const m of KNOWN_MAPPINGS) {
    if (!details.has(m.abbr)) {
      details.set(m.abbr, { code: m.code, subjectName: m.subjectName, teacher: m.teacher });
    }
  }

  return details;
}

function transposeWordCoordinates(words) {
  return words.map((word) => ({
    ...word,
    bbox: {
      x0: word.bbox.y0,
      y0: word.bbox.x0,
      x1: word.bbox.y1,
      y1: word.bbox.x1,
    },
  }));
}

function parseTransposedLayout(lines, dayRows) {
  const daysByLine = new Map();
  for (const row of dayRows) {
    if (!daysByLine.has(row.index)) daysByLine.set(row.index, []);
    daysByLine.get(row.index).push(row);
  }
  const dayHeader = [...daysByLine.values()]
    .map((rows) => [...new Map(rows.map((row) => [row.day, row])).values()])
    .find((rows) => rows.length > 1);
  if (!dayHeader) return [];

  const rangePattern = /(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)\s*(?:[-\u2010-\u2015\u2212]|to)\s*(\d{1,2}(?::[0-5]\d)?\s*(?:am|pm)?)/i;
  const periods = [];
  const timeWords = new Set();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const words = lines[lineIndex].words;
    for (let start = 0; start < words.length; start += 1) {
      let found = false;
      for (let size = 1; size <= 6 && start + size <= words.length; size += 1) {
        const group = words.slice(start, start + size);
        const range = group.map((word) => word.text).join(' ').match(rangePattern);
        if (!range) continue;
        const y = group.reduce((sum, word) => sum + (word.bbox.y0 + word.bbox.y1) / 2, 0) / group.length;
        periods.push({ start: range[1], end: range[2], y, sourceLine: lineIndex + 1 });
        group.forEach((word) => timeWords.add(word));
        found = true;
        break;
      }
      if (found) break;
    }
  }
  if (!periods.length) return [];
  periods.sort((left, right) => left.y - right.y);
  const dayColumns = dayHeader
    .map((row) => ({ ...row, x: (row.dayWord.bbox.x0 + row.dayWord.bbox.x1) / 2 }))
    .sort((left, right) => left.x - right.x);
  const gaps = dayColumns.slice(1).map((day, index) => day.x - dayColumns[index].x).filter((gap) => gap > 0);
  const typicalColumnWidth = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)] : 180;
  const periodGaps = periods.slice(1).map((period, index) => period.y - periods[index].y).filter((gap) => gap > 0).sort((a, b) => a - b);
  const halfPeriod = Math.max(14, Math.min(120, (periodGaps.length ? periodGaps[Math.floor((periodGaps.length - 1) / 2)] : 48) / 2));
  const headerWords = new Set(dayHeader.flatMap((row) => [row.dayWord, ...(row.dayWord.parts || [])]));
  const rows = [];

  for (let dayIndex = 0; dayIndex < dayColumns.length; dayIndex += 1) {
    const day = dayColumns[dayIndex];
    const left = dayIndex === 0 ? day.x - typicalColumnWidth / 2 : (dayColumns[dayIndex - 1].x + day.x) / 2;
    const right = dayIndex === dayColumns.length - 1 ? day.x + typicalColumnWidth / 2 : (day.x + dayColumns[dayIndex + 1].x) / 2;
    for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
      const period = periods[periodIndex];
      const upper = periodIndex === 0 ? period.y - halfPeriod : (periods[periodIndex - 1].y + period.y) / 2;
      const lower = periodIndex === periods.length - 1 ? period.y + halfPeriod : (period.y + periods[periodIndex + 1].y) / 2;
      const cellWords = lines.flatMap((line) => line.words).filter((word) => {
        const centerX = (word.bbox.x0 + word.bbox.x1) / 2;
        const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
        return centerX >= left && centerX < right && centerY >= upper && centerY <= lower
          && !headerWords.has(word) && !timeWords.has(word) && weekday(word.text) === null;
      }).sort((leftWord, rightWord) => (
        (leftWord.bbox.y0 + leftWord.bbox.y1) / 2 - (rightWord.bbox.y0 + rightWord.bbox.y1) / 2
        || leftWord.bbox.x0 - rightWord.bbox.x0
      ));
      let rawText = cellWords.map((word) => word.text).join(' ').replace(/[|:;,]+$/g, '').trim();
      let text = cleanCellText(rawText);
      if (!text || isBorderArtifact(text) || /^(day|subject|faculty|teacher|instructor|semester|section|batch)$/i.test(text)) continue;
      if (isCorruptedOrGarbage(text, cellWords)) continue;
      const isBreakPeriod = /^(break|lunch|recess|free)(?:\s+(?:break|period|time))?$/i.test(text);
      const locationMatch = text.match(/\b(?:room|rm|lab|classroom)\b\s*[:#-]?\s*[A-Z0-9-]+/i);
      const location = locationMatch?.[0] || '';
      if (location) text = text.replace(locationMatch[0], '').trim();
      const sessionType = /\blab(?:oratory)?\b/i.test(text) ? 'lab' : /\bpractical\b/i.test(text) ? 'practical' : /\btutorial\b/i.test(text) ? 'tutorial' : '';
      const subjectCode = text.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/)?.[0] || '';
      let subjectName = subjectCode ? text.replace(subjectCode, '').trim() || subjectCode : text;
      if (sessionType) subjectName = subjectName.replace(/\b(lab(?:oratory)?|practical|tutorial)\b/ig, '').trim() || subjectName;
      const confidence = cellWords.map((word) => Number(word.confidence)).filter(Number.isFinite);
      const avgConfidence = confidence.length ? Math.round(confidence.reduce((sum, value) => sum + value, 0) / confidence.length) : 100;
      const row = rowResult({
        subjectName: isBreakPeriod ? text : subjectName,
        subjectCode,
        day: day.day,
        start: period.start,
        end: period.end,
        location,
        sessionType,
        rawText,
        confidence: avgConfidence,
      }, period.sourceLine);
      if (isBreakPeriod) row.isBreakPeriod = true;
      if (avgConfidence < 55) {
        row.issues.push('OCR confidence is low. Verify this row against the image.');
      }
      rows.push(row);
    }
  }
  const details = extractFacultyDetails(lines);
  for (const row of rows) {
    const detail = details.get((row.subjectCode || row.subjectName).toLowerCase());
    if (!detail) continue;
    row.subjectCode = detail.code;
    if (row.subjectName.toLowerCase() === detail.code.toLowerCase()) row.subjectName = detail.subjectName;
    if (detail.teacher) row.teacher = detail.teacher;
  }
  return rows;
}

function parsePositionedWords(words, transposed = false) {
  const ordered = [...words].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2 || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  for (const word of ordered) {
    const midY = (word.bbox.y0 + word.bbox.y1) / 2;
    let line = lines.find((candidate) => Math.abs(candidate.midY - midY) <= Math.max(10, (word.bbox.y1 - word.bbox.y0) * 0.55));
    if (!line) { line = { midY, words: [] }; lines.push(line); }
    line.words.push(word);
    line.midY = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
  }
  lines.sort((a, b) => a.midY - b.midY);
  const dayRows = lines.flatMap((line, index) => {
    line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const anchors = line.words.flatMap((dayWord, wordIndex) => {
      const directDay = weekday(dayWord.text);
      if (directDay !== null) return [{ day: directDay, dayWord }];
      const fragments = [];
      let candidate = '';
      let end = wordIndex - 1;
      for (let offset = wordIndex; offset < Math.min(line.words.length, wordIndex + 7); offset += 1) {
        const current = line.words[offset];
        const fragment = String(current.text || '').replace(/[^a-z0-9]/gi, '');
        if (!fragment || fragment.length > 2 || (end >= wordIndex && current.bbox.x0 - line.words[end].bbox.x1 > Math.max(16, (current.bbox.y1 - current.bbox.y0) * 1.25))) break;
        fragments.push(current);
        candidate += fragment;
        end = offset;
        const day = weekday(candidate);
        if (day !== null && fragments.length >= 2) {
          const joinedWord = {
            text: candidate,
            confidence: fragments.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0) / fragments.length,
            bbox: { x0: fragments[0].bbox.x0, y0: Math.min(...fragments.map((item) => item.bbox.y0)), x1: fragments.at(-1).bbox.x1, y1: Math.max(...fragments.map((item) => item.bbox.y1)) },
            parts: fragments,
          };
          return [{ day, dayWord: joinedWord }];
        }
      }
      return [];
    });
    return anchors.map(({ day, dayWord }) => ({ line, index, day, dayWord, y: (dayWord.bbox.y0 + dayWord.bbox.y1) / 2 }));
  }).sort((a, b) => a.y - b.y);
  if (!dayRows.length) return transposed ? [] : parsePositionedWords(transposeWordCoordinates(words), true);
  const transposedLayout = parseTransposedLayout(lines, dayRows);
  if (transposedLayout.length) return transposedLayout;
  const weekdayWords = new Set(dayRows.flatMap(({ dayWord }) => [dayWord, ...(dayWord.parts || [])]));
  const timePattern = /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|-\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i;
  const clusters = (line, gapFactor = 1.8) => {
    const result = [];
    for (const word of line.words) {
      if (isBorderArtifact(word.text)) continue;
      const last = result[result.length - 1];
      const height = Math.max(10, word.bbox.y1 - word.bbox.y0);
      if (!last || word.bbox.x0 - last.right > Math.max(18, height * gapFactor)) result.push({ words: [word], left: word.bbox.x0, right: word.bbox.x1 });
      else { last.words.push(word); last.right = word.bbox.x1; }
    }
    return result.map((group) => ({ ...group, x: (group.left + group.right) / 2, text: group.words.map((word) => word.text).join(' ') }));
  };
  const rangePattern = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:[-\u2010-\u2015\u2212]|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  // OCR commonly splits a header such as "09:00 - 10:00" into separate
  // words or even separate lines. Keep the word coordinates and look for a
  // time range within a visual column instead of requiring one OCR line.
  const headers = positionedTimeHeaders(lines, dayRows);
  if (!headers.length) {
    for (const line of lines) {
      const groups = clusters(line, 2.4);
      for (let start = 0; start < groups.length; start += 1) {
        for (let size = 1; size <= 5 && start + size <= groups.length; size += 1) {
          const group = groups.slice(start, start + size);
          const joined = group.map((part) => part.text).join(' ');
          const range = joined.match(rangePattern);
          if (range) {
            const x = (group[0].left + group[group.length - 1].right) / 2;
            if (!headers.some((h) => Math.abs(h.x - x) < 18)) {
              headers.push({
                x,
                left: group[0].left,
                right: group[group.length - 1].right,
                start: normalizeTime(range[1]) || range[1],
                end: normalizeTime(range[2]) || range[2],
              });
            }
          }
        }
      }
    }
  }
  const uniqueHeaders = headers.filter((header, index) => !headers.slice(0, index).some((item) => Math.abs(item.x - header.x) < 18 && item.start === header.start && item.end === header.end));
  const dayGaps = dayRows.slice(1).map((item, index) => item.y - dayRows[index].y).filter((gap) => gap > 0).sort((a, b) => a - b);
  const rowGap = dayGaps.length ? dayGaps[Math.floor((dayGaps.length - 1) / 2)] : 48;
  const halfBand = Math.max(12, Math.min(100, (rowGap || 48) / 2));
  const rows = [];
  const breakPeriods = [];

  const orderedHeaders = [...uniqueHeaders].sort((a, b) => a.x - b.x);
  const boundaries = [];
  for (let i = 0; i < orderedHeaders.length - 1; i += 1) {
    boundaries.push((orderedHeaders[i].x + orderedHeaders[i + 1].x) / 2);
  }

  const clustersInBand = (line, gapFactor = 1.25) => {
    const result = [];
    for (const word of line.words) {
      if (isBorderArtifact(word.text)) continue;
      const last = result[result.length - 1];
      const height = Math.max(10, word.bbox.y1 - word.bbox.y0);
      const wordMidX = (word.bbox.x0 + word.bbox.x1) / 2;
      const crossesBoundary = last && boundaries.some((b) => last.right <= b && wordMidX > b);
      const gap = last ? word.bbox.x0 - last.right : 0;
      if (!last || gap > Math.max(18, height * gapFactor) || (crossesBoundary && gap > 12)) {
        result.push({ words: [word], left: word.bbox.x0, right: word.bbox.x1 });
      } else {
        last.words.push(word);
        last.right = Math.max(last.right, word.bbox.x1);
      }
    }
    return result.map((group) => ({ ...group, x: (group.left + group.right) / 2, text: group.words.map((w) => w.text).join(' ') }));
  };

  const separateTimeHeader = lines.find((line) => (
    line.words.some((word) => /^(start|from)$/i.test(word.text))
    && line.words.some((word) => /^(end|to|until)$/i.test(word.text))
  ));
  const startTimeHeader = separateTimeHeader?.words.find((word) => /^(start|from)$/i.test(word.text));
  const endTimeHeader = separateTimeHeader?.words.find((word) => /^(end|to|until)$/i.test(word.text));
  const startTimeX = startTimeHeader && (startTimeHeader.bbox.x0 + startTimeHeader.bbox.x1) / 2;
  const endTimeX = endTimeHeader && (endTimeHeader.bbox.x0 + endTimeHeader.bbox.x1) / 2;
  const timeAtColumn = (columnX, upper, lower) => {
    if (!Number.isFinite(columnX)) return '';
    const otherColumnX = columnX === startTimeX ? endTimeX : startTimeX;
    const maxDistance = Number.isFinite(otherColumnX)
      ? Math.max(24, Math.min(80, Math.abs(otherColumnX - columnX) * 0.45))
      : 100;
    const candidates = ordered.map((word) => ({ word, clock: positionedClock(word) }))
      .filter(({ word, clock }) => {
        const x = (word.bbox.x0 + word.bbox.x1) / 2;
        const y = (word.bbox.y0 + word.bbox.y1) / 2;
        return clock && y >= upper && y <= lower && Math.abs(x - columnX) <= maxDistance;
      })
      .sort((left, right) => (
        Math.abs((left.word.bbox.x0 + left.word.bbox.x1) / 2 - columnX)
        - Math.abs((right.word.bbox.x0 + right.word.bbox.x1) / 2 - columnX)
      ));
    const selected = candidates[0];
    if (!selected) return '';
    const suffix = selected.clock.meridiem || ordered
      .filter((word) => /^(?:am|pm)$/i.test(String(word.text || '').trim()))
      .map((word) => ({ word, distance: Math.hypot((word.bbox.x0 + word.bbox.x1) / 2 - (selected.word.bbox.x0 + selected.word.bbox.x1) / 2, (word.bbox.y0 + word.bbox.y1) / 2 - (selected.word.bbox.y0 + selected.word.bbox.y1) / 2) }))
      .filter((item) => item.distance <= 40)
      .sort((a, b) => a.distance - b.distance)[0]?.word.text.toLowerCase() || '';
    return normalizeTime(`${selected.clock.hour}:${selected.clock.minute}${suffix ? ` ${suffix}` : ''}`) || '';
  };

  for (let dayIndex = 0; dayIndex < dayRows.length; dayIndex += 1) {
    const item = dayRows[dayIndex];
    // The weekday label and the subject baselines often differ enough that
    // Tesseract puts them on separate lines. Collect all words in the visual
    // day band; its edges are halfway to adjacent weekday anchors.
    const upper = dayIndex === 0 ? item.y - halfBand : Math.max((dayRows[dayIndex - 1].y + item.y) / 2, item.y - halfBand);
    const lower = dayIndex === dayRows.length - 1 ? item.y + halfBand : Math.min((item.y + dayRows[dayIndex + 1].y) / 2, item.y + halfBand);
    const cells = ordered.filter((word) => {
      const y = (word.bbox.y0 + word.bbox.y1) / 2;
      return y >= upper && y <= lower && !weekdayWords.has(word) && weekday(word.text) === null
        && !timePattern.test(word.text) && !isBorderArtifact(word.text);
    });
    if (!cells.length) continue;
    const cellLine = { words: cells.sort((a, b) => a.bbox.x0 - b.bbox.x0) };
    const groups = boundaries.length ? clustersInBand(cellLine, 1.25) : clusters(cellLine, 1.25);
    groups.forEach((group) => {
      const rawText = group.text;
      const text = cleanCellText(rawText);
      if (isCorruptedOrGarbage(text, group.words)) return;

      let range = text.match(rangePattern);
      let sessionType = /\blab(?:oratory)?\b/i.test(text) ? 'lab' : /\bpractical\b/i.test(text) ? 'practical' : /\btutorial\b/i.test(text) ? 'tutorial' : '';

      if (!range && orderedHeaders.length) {
        const isLabOrPractical = /\b(lab|laboratory|practical|workshop|project)\b/i.test(text);
        const coveredColumns = [];
        for (let colIdx = 0; colIdx < orderedHeaders.length; colIdx += 1) {
          const header = orderedHeaders[colIdx];
          const colLeft = colIdx === 0
            ? header.x - Math.max(70, (orderedHeaders[1]?.x - header.x || 140) * 0.48)
            : (orderedHeaders[colIdx - 1].x + header.x) / 2;
          const colRight = colIdx === orderedHeaders.length - 1
            ? header.x + Math.max(70, (header.x - orderedHeaders[colIdx - 1]?.x || 140) * 0.48)
            : (header.x + orderedHeaders[colIdx + 1].x) / 2;
          if (Math.min(group.right, colRight) > Math.max(group.left, colLeft)) {
            coveredColumns.push(colIdx);
          }
        }

        const avgColWidth = orderedHeaders.length > 1
          ? (orderedHeaders[orderedHeaders.length - 1].x - orderedHeaders[0].x) / (orderedHeaders.length - 1)
          : 120;
        const isWideSpan = (group.right - group.left) > avgColWidth * 1.25;

        if (coveredColumns.length >= 2 && (coveredColumns[coveredColumns.length - 1] - coveredColumns[0] === coveredColumns.length - 1) && (isLabOrPractical || isWideSpan)) {
          const firstCol = coveredColumns[0];
          const lastCol = coveredColumns[coveredColumns.length - 1];
          range = {
            start: orderedHeaders[firstCol].start,
            end: orderedHeaders[lastCol].end,
            x: (orderedHeaders[firstCol].x + orderedHeaders[lastCol].x) / 2,
          };
          if (!sessionType && isLabOrPractical) {
            sessionType = 'lab';
          }
        }

        if (!range) {
          const headerIndex = orderedHeaders.reduce((best, header, index) => Math.abs(header.x - group.x) < Math.abs(orderedHeaders[best].x - group.x) ? index : best, 0);
          const header = orderedHeaders[headerIndex];
          const distances = orderedHeaders.map((candidate) => Math.abs(candidate.x - group.x)).sort((a, b) => a - b);
          const leftBound = headerIndex === 0 ? header.x - Math.max(90, (orderedHeaders[1]?.x - header.x || 180) / 2) : (orderedHeaders[headerIndex - 1].x + header.x) / 2;
          const rightBound = headerIndex === orderedHeaders.length - 1 ? header.x + Math.max(90, (header.x - orderedHeaders[headerIndex - 1]?.x || 180) / 2) : (header.x + orderedHeaders[headerIndex + 1].x) / 2;
          const neighborGaps = [orderedHeaders[headerIndex - 1] && header.x - orderedHeaders[headerIndex - 1].x, orderedHeaders[headerIndex + 1] && orderedHeaders[headerIndex + 1].x - header.x].filter(Boolean);
          const maxColumnOffset = Math.min(140, Math.max(60, (Math.min(...neighborGaps, 180) * 0.45)));
          if (group.x >= leftBound && group.x <= rightBound
            && distances[0] <= maxColumnOffset
            && (distances.length < 2 || distances[1] - distances[0] >= 30)) range = header;
        }
      }

      let name = text.replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-\u2010-\u2015\u2212]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/ig, '').trim();
      name = cleanCellText(name);
      if (!name || isBorderArtifact(name) || /^(day|subject|faculty|teacher|instructor|semester|section|batch)$/i.test(name)) return;
      if (isCorruptedOrGarbage(name, group.words)) return;

      const isBreakPeriod = /^(break|lunch|recess|free)(?:\s+(?:break|period|time))?$/i.test(name);
      const locationMatch = name.match(/\b(?:room|rm|lab|classroom)\b\s*[:#-]?\s*[A-Z0-9-]+/i);
      const location = locationMatch?.[0] || '';
      if (location) name = name.replace(locationMatch[0], '').trim();
      if (!sessionType) {
        sessionType = /\blab(?:oratory)?\b/i.test(name) ? 'lab' : /\bpractical\b/i.test(name) ? 'practical' : /\btutorial\b/i.test(name) ? 'tutorial' : '';
      }
      const code = name.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/)?.[0] || '';
      const sectionLine = lines.slice(0, item.index + 1).reverse().find((candidate) => /\b(section|batch|group|semester|year)\s*[:#-]?\s*[A-Z0-9-]+/i.test(candidate.words.map((word) => word.text).join(' ')));
      const section = sectionLine?.words.map((word) => word.text).join(' ').trim() || '';
      let subjectName = code ? name.replace(code, '').trim() || code : name;
      if (sessionType) {
        const withoutSessionType = subjectName.replace(/\b(lab(?:oratory)?|practical|tutorial)\b/ig, '').replace(/\s{2,}/g, ' ').trim();
        if (withoutSessionType) subjectName = withoutSessionType;
      }

      const confidenceWords = [...group.words, item.dayWord].filter((word) => Number.isFinite(word.confidence));
      const avgConfidence = confidenceWords.length
        ? Math.round(confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / confidenceWords.length)
        : 100;

      const separateStart = timeAtColumn(startTimeX, upper, lower);
      const separateEnd = timeAtColumn(endTimeX, upper, lower);

      const row = rowResult({
        subjectName: isBreakPeriod ? name : subjectName,
        subjectCode: code,
        day: item.day,
        start: range?.start || range?.[1] || separateStart,
        end: range?.end || range?.[2] || separateEnd,
        location,
        sessionType,
        section,
        rawText,
        confidence: avgConfidence,
      }, item.index + 1);

      if (isBreakPeriod) row.isBreakPeriod = true;
      if (avgConfidence < 55) {
        row.issues.push('OCR confidence is low. Verify this row against the image.');
      }
      if (isBreakPeriod) breakPeriods.push(row);
      else rows.push(row);
    });
  }
  const facultyDetails = extractFacultyDetails(lines);
  for (const row of rows) {
    let detail = facultyDetails.get((row.subjectCode || row.subjectName).toLowerCase());
    if (!detail) {
      const normalized = (row.subjectCode || row.subjectName).toLowerCase().replace(/8/g, 's').replace(/0/g, 'o');
      for (const [key, val] of facultyDetails.entries()) {
        if (key.replace(/8/g, 's').replace(/0/g, 'o') === normalized) {
          detail = val;
          break;
        }
      }
    }
    if (!detail) continue;
    row.subjectCode = detail.code;
    if (row.subjectName.toLowerCase() === detail.code.toLowerCase() || (row.rawText && row.rawText.toLowerCase() === detail.code.toLowerCase())) {
      row.subjectName = detail.subjectName;
    }
    if (detail.teacher) row.teacher = detail.teacher;
  }
  const output = [...rows, ...breakPeriods];
  return output.length || transposed ? output : parsePositionedWords(transposeWordCoordinates(words), true);
}

function parseTimetable(text, sourceType, words = []) {
  if (words.length) {
    const positioned = parsePositionedWords(words);
    if (positioned.length) return positioned.map((row, index) => ({ ...row, sourceLine: row.sourceLine || index + 1 }));
  }
  const delimited = sourceType === 'text/csv' || sourceType === 'text/tab-separated-values' || (!sourceType.startsWith('image/') && sourceType !== 'application/pdf' && /,|\t/.test(text.split(/\r?\n/, 1)[0]));
  const rows = delimited ? parseDelimited(text) : parseTextLines(text);
  if (!rows.length) {
    const hasDay = words.some((word) => weekday(word.text) !== null) || hasWeekdayText(text);
    const message = sourceType.startsWith('image/')
      ? (hasDay
        ? 'Unable to confidently recognize this timetable. Weekdays were detected, but the timetable rows and period times could not be associated. Try a clearer, upright photo, or start a manual preview to enter the classes you can read.'
        : 'Unable to confidently recognize this timetable. Image text was detected, but no timetable weekdays or class rows were recognized. Try a clearer photo focused on the timetable grid, or start a manual preview.')
      : 'Unable to confidently recognize this timetable. No timetable rows were recognized. Use a CSV with subject, day, startTime, and endTime columns, or try a clearer text-based timetable.';
    throw Object.assign(new Error(message), { statusCode: 422 });
  }
  return rows.map((row, index) => ({ ...row, sourceLine: row.sourceLine || index + 1 }));
}

module.exports = { parseTimetable, normalizeTime, parsePositionedWords, isCorruptedOrGarbage, cleanCellText, isBorderArtifact };
