export const TIMETABLE_CSV_COLUMNS = [
  'subject',
  'subject_code',
  'day',
  'start_time',
  'end_time',
  'faculty',
  'location',
  'session_type',
];

export function timetableRowsToCanonicalRows(rows, subjects = []) {
  return rows.map((row) => {
    const subject = subjects.find((item) => String(item._id || item.id) === String(row.subjectId));
    const day = Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday < 7
      ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][row.weekday]
      : '';
    return {
      subject: subject?.name || row.subjectName || '',
      subject_code: subject?.code || row.subjectCode || '',
      day,
      start_time: row.startTime || '',
      end_time: row.endTime || '',
      faculty: row.teacher || '',
      location: row.location || '',
      session_type: String(row.sessionType || '').replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
    };
  });
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function timetableRowsToCsv(rows, subjects = []) {
  const canonicalRows = timetableRowsToCanonicalRows(rows, subjects);
  const lines = [
    TIMETABLE_CSV_COLUMNS.join(','),
    ...canonicalRows.map((row) => TIMETABLE_CSV_COLUMNS.map((column) => escapeCsvCell(row[column])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
