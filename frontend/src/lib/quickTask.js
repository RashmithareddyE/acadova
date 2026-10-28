const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validLocalDate(year, month, day) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? localDateString(date)
    : '';
}

function cleanTitle(value) {
  return value.replace(/\b(?:by|due|on)\s*$/i, '').replace(/\s+/g, ' ').replace(/[\s,;:-]+$/, '').trim();
}

export function parseQuickTask(input, now = new Date()) {
  const text = String(input || '').trim();
  if (!text) return { title: '', dueDate: '', dateIssue: 'Enter a task and choose its due date.' };
  const currentDate = localDateString(now);
  const candidates = [
    { regex: /\b(?:by\s+|due\s+(?:on\s+)?)?(today|tomorrow)\b/i, parse: (match) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (match[1].toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1);
      return { date: localDateString(date) };
    } },
    { regex: /\b(?:by\s+|due\s+(?:on\s+)?)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i, parse: (match) => {
      const first = Number(match[1]);
      const second = Number(match[2]);
      const year = Number(match[3]);
      if (first <= 12 && second <= 12 && first !== second) return { issue: 'That numeric date could mean two different dates. Please select the due date manually.' };
      if (first <= 12 && second > 12) return { issue: 'Use an unambiguous day/month/year date, such as 30/10/2026, or select the date manually.' };
      const day = first;
      const month = second - 1;
      const dueDate = validLocalDate(year, month, day);
      return dueDate ? { date: dueDate } : { issue: 'That date is not valid. Please select the due date manually.' };
    } },
    { regex: /\b(?:by\s+|due\s+(?:on\s+)?)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i, parse: (match) => {
      const day = Number(match[1]);
      const month = MONTHS[match[2].toLowerCase()];
      const year = Number(match[3] || now.getFullYear());
      const dueDate = validLocalDate(year, month, day);
      if (!dueDate) return { issue: 'That date is not valid. Please select the due date manually.' };
      if (!match[3] && dueDate < currentDate) return { issue: 'That date has already passed this year. Please select the intended year and date manually.' };
      return { date: dueDate };
    } },
  ];

  for (const candidate of candidates) {
    const match = candidate.regex.exec(text);
    if (!match) continue;
    const parsed = candidate.parse(match);
    return {
      title: cleanTitle(`${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`),
      dueDate: parsed.date || '',
      dateIssue: parsed.issue || '',
    };
  }
  return {
    title: cleanTitle(text.replace(/\b(?:by|due)\s*$/i, '')),
    dueDate: '',
    dateIssue: 'No clear due date found. Choose the date manually before saving.',
  };
}
