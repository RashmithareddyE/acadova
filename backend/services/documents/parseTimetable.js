const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ALIASES = new Map([
  ['monday', 0], ['mon', 0], ['tuesday', 1], ['tue', 1], ['tues', 1],
  ['wednesday', 2], ['wed', 2], ['thursday', 3], ['thu', 3], ['thur', 3], ['thurs', 3],
  ['friday', 4], ['fri', 4], ['saturday', 5], ['sat', 5], ['sunday', 6], ['sun', 6],
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

function rowResult({ subjectName = '', subjectCode = '', day, start, end, location = '', sessionType = '', section = '' }, sourceLine) {
  const normalizedDay = Number.isInteger(day) ? day : weekday(day);
  const startTime = normalizeTime(start); const endTime = normalizeTime(end);
  const issues = [];
  if (!subjectName.trim()) issues.push('Subject is missing.');
  if (normalizedDay === null) issues.push('Weekday is unclear.');
  if (!startTime || !endTime || startTime >= endTime) issues.push('Start/end time is missing or invalid.');
  return {
    subjectName: subjectName.trim(), subjectCode: subjectCode.trim(), weekday: normalizedDay,
    startTime, endTime, location: location.trim(), sessionType: sessionType.trim(), section: section.trim(), sourceLine, issues,
  };
}

const HEADER_MAP = {
  subjectName: ['subject', 'course', 'class name', 'subject name'],
  subjectCode: ['code', 'subject code', 'course code'],
  day: ['day', 'weekday', 'week day'],
  start: ['start', 'start time', 'from'],
  end: ['end', 'end time', 'to', 'until'],
  location: ['room', 'location', 'classroom', 'venue'],
};

function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const table = parseCsv(text, delimiter);
  if (!table.length) return [];
  const header = table[0].map((value) => value.toLowerCase().replace(/[_-]/g, ' ').trim());
  const positions = Object.fromEntries(Object.entries(HEADER_MAP).map(([field, aliases]) => [field, header.findIndex((item) => aliases.includes(item))]));
  const hasHeader = Object.values(positions).some((index) => index >= 0);
  const rows = hasHeader ? table.slice(1) : table;
  const defaults = { day: 0, start: 1, end: 2, subjectName: 3, subjectCode: 4, location: 5 };
  return rows.map((columns, index) => {
    const get = (field) => columns[positions[field] >= 0 && hasHeader ? positions[field] : defaults[field]] || '';
    return rowResult({ subjectName: get('subjectName'), subjectCode: get('subjectCode'), day: get('day'), start: get('start'), end: get('end'), location: get('location') }, index + (hasHeader ? 2 : 1));
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
    const tokens = remainder.split(/\s{2,}|\s\|\s/).filter(Boolean);
    const subjectCode = remainder.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/)?.[0] || '';
    let location = '';
    const room = remainder.match(/\b(?:room|rm|lab|classroom)\s*[:#-]?\s*[A-Z0-9-]+/i);
    if (room) location = room[0];
    else if (tokens.length > 1) location = tokens[tokens.length - 1];
    let subjectName = remainder;
    if (subjectCode) subjectName = subjectName.replace(subjectCode, '').trim();
    if (location && subjectName.endsWith(location)) subjectName = subjectName.slice(0, -location.length).trim();
    output.push(rowResult({ subjectName: subjectName.replace(/^[|,;\s]+|[|,;\s]+$/g, ''), subjectCode, day, start: range[1], end: range[2], location }, index + 1));
  });
  return output;
}

function positionedClock(word) {
  const match = String(word.text || '').match(/^[-\u2010-\u2015\u2212]?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
  return match ? { hour: match[1], minute: match[2], meridiem: match[3]?.toLowerCase() || '', word } : null;
}

function positionedTimeHeaders(lines) {
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
  return headers;
}

function parsePositionedWords(words) {
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
  if (!dayRows.length) return [];
  const weekdayWords = new Set(dayRows.flatMap(({ dayWord }) => [dayWord, ...(dayWord.parts || [])]));
  const timePattern = /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|-\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i;
  const clusters = (line, gapFactor = 1.8) => {
    const result = [];
    for (const word of line.words) {
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
  const headers = positionedTimeHeaders(lines);
  for (const line of lines) {
    const groups = clusters(line, 2.4);
    for (let start = 0; start < groups.length; start += 1) {
      for (let size = 1; size <= 5 && start + size <= groups.length; size += 1) {
        const group = groups.slice(start, start + size);
        const joined = group.map((part) => part.text).join(' ');
        const range = joined.match(rangePattern);
        if (range && !headers.length) headers.push({ x: (group[0].left + group[group.length - 1].right) / 2, left: group[0].left, right: group[group.length - 1].right, start: range[1], end: range[2] });
      }
    }
  }
  const uniqueHeaders = headers.filter((header, index) => !headers.slice(0, index).some((item) => Math.abs(item.x - header.x) < 18 && item.start === header.start && item.end === header.end));
  const dayGaps = dayRows.slice(1).map((item, index) => item.y - dayRows[index].y).filter((gap) => gap > 0).sort((a, b) => a - b);
  const rowGap = dayGaps.length ? dayGaps[Math.floor((dayGaps.length - 1) / 2)] : 48;
  const halfBand = Math.max(12, Math.min(100, (rowGap || 48) / 2));
  const rows = [];
  for (let dayIndex = 0; dayIndex < dayRows.length; dayIndex += 1) {
    const item = dayRows[dayIndex];
    // The weekday label and the subject baselines often differ enough that
    // Tesseract puts them on separate lines. Collect all words in the visual
    // day band; its edges are halfway to adjacent weekday anchors.
    const upper = dayIndex === 0 ? item.y - halfBand : Math.max((dayRows[dayIndex - 1].y + item.y) / 2, item.y - halfBand);
    const lower = dayIndex === dayRows.length - 1 ? item.y + halfBand : Math.min((item.y + dayRows[dayIndex + 1].y) / 2, item.y + halfBand);
    const cells = ordered.filter((word) => {
      const y = (word.bbox.y0 + word.bbox.y1) / 2;
      return y >= upper && y <= lower && !weekdayWords.has(word) && weekday(word.text) === null && !timePattern.test(word.text);
    });
    if (!cells.length) continue;
    const cellLine = { words: cells.sort((a, b) => a.bbox.x0 - b.bbox.x0) };
    clusters(cellLine, 1.25).forEach((group) => {
      const text = group.text.replace(/[|:;,]+$/g, '').trim();
      let range = text.match(rangePattern);
      if (!range && uniqueHeaders.length) {
        const orderedHeaders = [...uniqueHeaders].sort((a, b) => a.x - b.x);
        const headerIndex = orderedHeaders.reduce((best, header, index) => Math.abs(header.x - group.x) < Math.abs(orderedHeaders[best].x - group.x) ? index : best, 0);
        const header = orderedHeaders[headerIndex];
        const leftBound = headerIndex === 0 ? header.x - Math.max(90, (orderedHeaders[1]?.x - header.x || 180) / 2) : (orderedHeaders[headerIndex - 1].x + header.x) / 2;
        const rightBound = headerIndex === orderedHeaders.length - 1 ? header.x + Math.max(90, (header.x - orderedHeaders[headerIndex - 1]?.x || 180) / 2) : (header.x + orderedHeaders[headerIndex + 1].x) / 2;
        const neighborGaps = [orderedHeaders[headerIndex - 1] && header.x - orderedHeaders[headerIndex - 1].x, orderedHeaders[headerIndex + 1] && orderedHeaders[headerIndex + 1].x - header.x].filter(Boolean);
        const maxColumnOffset = Math.min(140, Math.max(60, (Math.min(...neighborGaps, 180) * 0.45)));
        if (group.x >= leftBound && group.x <= rightBound && Math.abs(group.x - header.x) <= maxColumnOffset) range = header;
      }
      let name = text.replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-\u2010-\u2015\u2212]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/ig, '').trim();
      if (!name || /^[-\u2010-\u2015\u2212|/]+$/.test(name) || /^(break|lunch|recess|free|day|subject|faculty|teacher|instructor|semester|section|batch)$/i.test(name)) return;
      const locationMatch = name.match(/\b(?:room|rm|lab|classroom)\s*[:#-]?\s*[A-Z0-9-]+/i);
      const location = locationMatch?.[0] || '';
      if (location) name = name.replace(locationMatch[0], '').trim();
      const sessionType = /\blab(?:oratory)?\b/i.test(name) ? 'lab' : /\bpractical\b/i.test(name) ? 'practical' : /\btutorial\b/i.test(name) ? 'tutorial' : '';
      const code = name.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/)?.[0] || '';
      const sectionLine = lines.slice(0, item.index + 1).reverse().find((candidate) => /\b(section|batch|group|semester|year)\s*[:#-]?\s*[A-Z0-9-]+/i.test(candidate.words.map((word) => word.text).join(' ')));
      const section = sectionLine?.words.map((word) => word.text).join(' ').trim() || '';
      let subjectName = code ? name.replace(code, '').trim() || code : name;
      if (sessionType) {
        const withoutSessionType = subjectName.replace(/\b(lab(?:oratory)?|practical|tutorial)\b/ig, '').replace(/\s{2,}/g, ' ').trim();
        if (withoutSessionType) subjectName = withoutSessionType;
      }
      const row = rowResult({ subjectName, subjectCode: code, day: item.day, start: range?.start || range?.[1], end: range?.end || range?.[2], location, sessionType, section }, item.index + 1);
      const confidenceWords = [...group.words, item.dayWord].filter((word) => Number.isFinite(word.confidence));
      if (confidenceWords.length) {
        row.confidence = Math.round(confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / confidenceWords.length);
        if (row.confidence < 55) row.issues.push('OCR confidence is low. Verify this row against the image.');
      }
      rows.push(row);
    });
  }
  return rows;
}

function parseTimetable(text, sourceType, words = []) {
  if (words.length) {
    const positioned = parsePositionedWords(words);
    if (positioned.length) return positioned.map((row, index) => ({ ...row, sourceLine: row.sourceLine || index + 1 }));
  }
  const delimited = sourceType === 'text/csv' || sourceType === 'text/tab-separated-values' || /,|\t/.test(text.split(/\r?\n/, 1)[0]);
  const rows = delimited ? parseDelimited(text) : parseTextLines(text);
  if (!rows.length) {
    const hasDay = words.some((word) => weekday(word.text) !== null) || hasWeekdayText(text);
    const message = sourceType.startsWith('image/')
      ? (hasDay
        ? 'Weekdays were detected, but the timetable rows and period times could not be associated. Try a clearer, upright photo, or start a manual preview to enter the classes you can read.'
        : 'Image text was detected, but no timetable weekdays or class rows were recognized. Try a clearer photo focused on the timetable grid, or start a manual preview.')
      : 'No timetable rows were recognized. Use a CSV with subject, day, startTime, and endTime columns, or try a clearer text-based timetable.';
    throw Object.assign(new Error(message), { statusCode: 422 });
  }
  return rows.map((row, index) => ({ ...row, sourceLine: row.sourceLine || index + 1 }));
}

module.exports = { parseTimetable, normalizeTime, parsePositionedWords };
