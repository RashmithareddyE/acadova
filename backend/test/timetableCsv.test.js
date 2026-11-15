const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTimetable } = require('../services/documents/parseTimetable');
const {
  COLUMNS,
  mergeLaboratoryPeriods,
  serializeTimetableCsv,
  validateTimetableRows,
} = require('../services/documents/timetableCsv');

test('maps timetables with weekdays in columns and periods in rows', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, confidence: 95, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('Monday', 100, 10, 150, 25), word('Tuesday', 220, 10, 280, 25),
    word('09:00 - 10:00', 10, 100, 80, 115), word('Algorithms', 100, 100, 170, 115), word('Databases', 220, 100, 290, 115),
    word('10:00 - 11:00', 10, 150, 80, 165), word('Networks', 100, 150, 160, 165), word('Physics', 220, 150, 270, 165),
  ];
  const rows = parseTimetable('Monday Tuesday\n09:00 - 10:00 Algorithms Databases\n10:00 - 11:00 Networks Physics', 'image/jpeg', words);
  assert.deepEqual(rows.map((row) => [row.weekday, row.subjectName, row.startTime, row.endTime]), [
    [0, 'Algorithms', '09:00', '10:00'],
    [0, 'Networks', '10:00', '11:00'],
    [1, 'Databases', '09:00', '10:00'],
    [1, 'Physics', '10:00', '11:00'],
  ]);
});

test('resolves subject codes from a separate code-to-subject legend without inventing faculty', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, confidence: 95, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('09:00', 150, 20, 185, 34), word('-', 190, 20, 195, 34), word('10:00', 200, 20, 238, 34),
    word('Monday', 10, 80, 72, 94), word('CS301', 160, 80, 200, 94),
    word('Code', 10, 180, 45, 194), word('Subject', 100, 180, 150, 194),
    word('CS301', 10, 205, 50, 219), word('Data', 100, 205, 135, 219), word('Structures', 140, 205, 205, 219),
  ];
  const rows = parseTimetable('09:00 - 10:00\nMonday CS301\nCode Subject\nCS301 Data Structures', 'image/jpeg', words);
  assert.equal(rows[0].subjectName, 'Data Structures');
  assert.equal(rows[0].subjectCode, 'CS301');
  assert.equal(rows[0].teacher, '');
});

test('reads separately positioned start-time and end-time columns', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, confidence: 95, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('Day', 10, 20, 35, 34), word('Start', 90, 20, 130, 34), word('End', 170, 20, 200, 34), word('Subject', 250, 20, 305, 34),
    word('Monday', 10, 80, 72, 94), word('09:00', 92, 80, 128, 94), word('10:00', 172, 80, 208, 94), word('Algorithms', 250, 80, 330, 94),
  ];
  const [row] = parseTimetable('Day Start End Subject\nMonday 09:00 10:00 Algorithms', 'image/jpeg', words);
  assert.deepEqual([row.weekday, row.subjectName, row.startTime, row.endTime], [0, 'Algorithms', '09:00', '10:00']);
});

test('normalizes canonical and abbreviated weekday labels from CSV', () => {
  const rows = parseTimetable([
    'subject,subject_code,day,start_time,end_time,faculty,location,session_type',
    'Algorithms,CS101,Mon.,9:00 AM,10:00 AM,Dr Rao,Room 4,Lecture',
    'Databases,CS102,Thurs,10:00,11:00,,,',
  ].join('\n'), 'text/csv');

  assert.deepEqual(rows.map((row) => [row.subjectName, row.subjectCode, row.weekday, row.startTime, row.endTime, row.sessionType]), [
    ['Algorithms', 'CS101', 0, '09:00', '10:00', 'lecture'],
    ['Databases', 'CS102', 3, '10:00', '11:00', ''],
  ]);
});

test('CSV export uses the canonical columns, BOM, and RFC-style escaping and can be re-imported', () => {
  const row = {
    subjectName: 'Data, "Systems"',
    subjectCode: 'CS301',
    weekday: 0,
    startTime: '09:00',
    endTime: '10:00',
    teacher: 'Dr "Kumar", Jr.',
    location: 'Room 1\nNorth',
    sessionType: 'lecture',
  };
  const csv = serializeTimetableCsv([row]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split(/\r\n/)[0].slice(1), COLUMNS.join(','));
  assert.match(csv, /"Data, ""Systems"""/);
  assert.match(csv, /"Dr ""Kumar"", Jr\."/);
  const [parsed] = parseTimetable(csv, 'text/csv');
  assert.deepEqual(
    [parsed.subjectName, parsed.subjectCode, parsed.weekday, parsed.startTime, parsed.endTime, parsed.teacher, parsed.location, parsed.sessionType],
    ['Data, "Systems"', 'CS301', 0, '09:00', '10:00', 'Dr "Kumar", Jr.', 'Room 1\nNorth', 'lecture']
  );
});

test('merges contiguous laboratory periods into one attendance session', () => {
  const rows = mergeLaboratoryPeriods([
    { subjectName: 'Networks Lab', subjectCode: 'CS401', weekday: 1, startTime: '10:00', endTime: '11:00', sessionType: 'lab', sourceLine: 3, issues: [] },
    { subjectName: 'Networks Lab', subjectCode: 'CS401', weekday: 1, startTime: '11:00', endTime: '12:00', sessionType: 'lab', sourceLine: 4, issues: [] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].startTime, '10:00');
  assert.equal(rows[0].endTime, '12:00');
  assert.deepEqual(rows[0].sourceLines, [3, 4]);
});

test('optional faculty, location, and session type remain blank without making a row invalid', () => {
  const [row] = validateTimetableRows([{
    subjectName: 'Mathematics',
    subjectCode: 'MA301',
    weekday: 1,
    startTime: '09:00',
    endTime: '10:00',
    teacher: '',
    location: '',
    sessionType: '',
    issues: [],
  }]);
  assert.deepEqual(row.issues, []);
  const [canonical] = parseTimetable(serializeTimetableCsv([row]), 'text/csv');
  assert.equal(canonical.teacher, '');
  assert.equal(canonical.location, '');
  assert.equal(canonical.sessionType, '');
});

test('invalid times, duplicate rows, and unintended overlaps are reported row by row', () => {
  const rows = validateTimetableRows([
    { subjectName: 'Networks', subjectCode: 'CS101', weekday: 0, startTime: '10:00', endTime: '09:00', sourceLine: 2, issues: [] },
    { subjectName: 'Algorithms', subjectCode: 'CS102', weekday: 0, startTime: '09:00', endTime: '10:00', sourceLine: 3, issues: [] },
    { subjectName: 'Algorithms', subjectCode: 'CS102', weekday: 0, startTime: '09:00', endTime: '10:00', sourceLine: 4, issues: [] },
    { subjectName: 'Databases', subjectCode: 'CS103', weekday: 0, startTime: '09:30', endTime: '10:30', sourceLine: 5, issues: [] },
  ]);
  assert.ok(rows[0].issues.includes('Start/end time is missing or invalid.'));
  assert.ok(rows[2].issues.some((issue) => /Duplicate class row/.test(issue)));
  assert.ok(rows[1].issues.some((issue) => /overlaps row 5/.test(issue)));
  assert.ok(rows[3].issues.some((issue) => /overlaps row 3/.test(issue)));
});

test('does not merge laboratory periods that are not contiguous or belong to another weekday', () => {
  const rows = mergeLaboratoryPeriods([
    { subjectName: 'Chemistry Lab', weekday: 0, startTime: '09:00', endTime: '10:00', sessionType: 'lab' },
    { subjectName: 'Chemistry Lab', weekday: 0, startTime: '10:15', endTime: '11:00', sessionType: 'lab' },
    { subjectName: 'Chemistry Lab', weekday: 1, startTime: '11:00', endTime: '12:00', sessionType: 'lab' },
  ]);
  assert.equal(rows.length, 3);
});
