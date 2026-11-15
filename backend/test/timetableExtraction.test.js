const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTimetable,
  parsePositionedWords,
  isCorruptedOrGarbage,
  cleanCellText,
  isBorderArtifact,
} = require('../services/documents/parseTimetable');
const {
  validateTimetableRows,
  mergeLaboratoryPeriods,
  serializeTimetableCsv,
  COLUMNS,
} = require('../services/documents/timetableCsv');

test('isBorderArtifact identifies isolated table borders and noise tokens', () => {
  assert.equal(isBorderArtifact('|'), true);
  assert.equal(isBorderArtifact('|||'), true);
  assert.equal(isBorderArtifact('=='), true);
  assert.equal(isBorderArtifact('[|'), true);
  assert.equal(isBorderArtifact('=]'), true);
  assert.equal(isBorderArtifact('---'), true);
  // Valid text and single hyphen separator should not be border artifacts
  assert.equal(isBorderArtifact('Math'), false);
  assert.equal(isBorderArtifact('CS101'), false);
  assert.equal(isBorderArtifact('-'), false);
});

test('cleanCellText cleans border punctuation without destroying valid quotes or abbreviations', () => {
  assert.equal(cleanCellText('| Algorithms |'), 'Algorithms');
  assert.equal(cleanCellText('[CS101: Physics]'), 'CS101: Physics');
  assert.equal(cleanCellText('Networks, "Advanced"'), 'Networks, "Advanced"');
  assert.equal(cleanCellText('Prof. Smith, Jr.'), 'Prof. Smith, Jr.');
});

test('isCorruptedOrGarbage rejects OCR hallucination and border noise', () => {
  const corrupted = 'or =] | [van smn = T= | wma ||| [| wy on || uu me || de i [seca IE 100 Pw ow [[TORRE]';
  assert.equal(isCorruptedOrGarbage(corrupted), true);
  assert.equal(isCorruptedOrGarbage('||| == |'), true);
  assert.equal(isCorruptedOrGarbage('zxvbnm qwrtyp'), true);

  // Legitimate academic names should not be rejected
  assert.equal(isCorruptedOrGarbage('Algorithms'), false);
  assert.equal(isCorruptedOrGarbage('Data Structures and Algorithms'), false);
  assert.equal(isCorruptedOrGarbage('Database Management Systems Lab'), false);
  assert.equal(isCorruptedOrGarbage('CS101 Programming'), false);
});

test('parsePositionedWords drops corrupted OCR noise rows and keeps valid class cells', () => {
  const word = (text, x0, y0, x1, y1, confidence = 95) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('09:00', 100, 20, 140, 35), word('-', 145, 20, 155, 35), word('10:00', 160, 20, 200, 35),
    word('10:00', 250, 20, 290, 35), word('-', 295, 20, 305, 35), word('11:00', 310, 20, 350, 35),
    word('Monday', 10, 80, 70, 95),
    word('Algorithms', 105, 80, 195, 95),
    word('or =] | [van smn = T= | wma ||| [| wy', 255, 80, 345, 95, 15), // corrupted cell
  ];

  const rows = parsePositionedWords(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weekday, 0);
  assert.equal(rows[0].subjectName, 'Algorithms');
  assert.equal(rows[0].startTime, '09:00');
  assert.equal(rows[0].endTime, '10:00');
});

test('parsePositionedWords detects free-text inline subject legends with instructor names', () => {
  const word = (text, x0, y0, x1, y1, confidence = 95) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('09:00 - 10:00', 120, 20, 200, 35),
    word('Monday', 10, 80, 70, 95),
    word('CS202', 120, 80, 180, 95),
    word('CS202 - Operating Systems (Dr. Alan Turing)', 10, 160, 320, 175),
  ];

  const rows = parsePositionedWords(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectCode, 'CS202');
  assert.equal(rows[0].subjectName, 'Operating Systems');
  assert.equal(rows[0].teacher, 'Dr. Alan Turing');
});

test('parsePositionedWords merges laboratory cells spanning across period columns', () => {
  const word = (text, x0, y0, x1, y1, confidence = 95) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
  const words = [
    // Column 1: 09:00 - 10:00 (x: 100 to 200)
    word('09:00', 100, 20, 140, 35), word('-', 145, 20, 155, 35), word('10:00', 160, 20, 200, 35),
    // Column 2: 10:00 - 11:00 (x: 250 to 350)
    word('10:00', 250, 20, 290, 35), word('-', 295, 20, 305, 35), word('11:00', 310, 20, 350, 35),
    word('Monday', 10, 80, 70, 95),
    // Wide Lab cell spanning from x=110 to x=340
    word('Physics', 110, 80, 180, 95),
    word('Laboratory', 190, 80, 340, 95),
  ];

  const rows = parsePositionedWords(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectName, 'Physics');
  assert.equal(rows[0].sessionType, 'lab');
  assert.equal(rows[0].startTime, '09:00');
  assert.equal(rows[0].endTime, '11:00');
});

test('parsePositionedWords detects break and lunch periods and marks them', () => {
  const word = (text, x0, y0, x1, y1, confidence = 95) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });
  const words = [
    word('12:00 - 13:00', 100, 20, 200, 35),
    word('Monday', 10, 80, 70, 95),
    word('Lunch Break', 100, 80, 190, 95),
  ];

  const rows = parsePositionedWords(words);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isBreakPeriod, true);
  assert.match(rows[0].subjectName, /Lunch Break/i);
});

test('validateTimetableRows validates required fields and sets valid, needs-review, and invalid status', () => {
  const rows = [
    {
      subjectName: 'Mathematics',
      subjectCode: 'MA101',
      weekday: 0,
      startTime: '09:00',
      endTime: '10:00',
      confidence: 90,
      status: 'valid',
      issues: [],
    },
    {
      subjectName: 'Physics',
      subjectCode: 'PH101',
      weekday: 1,
      startTime: '10:00',
      endTime: '11:00',
      confidence: 45, // low confidence
      status: 'needs-review',
      issues: ['OCR confidence is low. Verify this row against the image.'],
    },
    {
      subjectName: '', // missing subject
      weekday: 2,
      startTime: '09:00',
      endTime: '10:00',
      status: 'invalid',
      issues: [],
    },
    {
      subjectName: 'Chemistry',
      weekday: 9, // invalid weekday
      startTime: '09:00',
      endTime: '10:00',
      status: 'invalid',
      issues: [],
    },
    {
      subjectName: 'Biology',
      weekday: 3,
      startTime: '11:00',
      endTime: '10:00', // end before start
      status: 'invalid',
      issues: [],
    },
  ];

  const validated = validateTimetableRows(rows);
  assert.equal(validated[0].status, 'valid');
  assert.equal(validated[1].status, 'needs-review');
  assert.equal(validated[2].status, 'invalid');
  assert.equal(validated[3].status, 'invalid');
  assert.equal(validated[4].status, 'invalid');
  assert.ok(validated[2].issues.includes('Subject is missing.'));
  assert.ok(validated[3].issues.includes('Weekday is unclear.'));
  assert.ok(validated[4].issues.includes('Start/end time is missing or invalid.'));
});

test('parseTimetable throws 422 with actionable message when timetable recognition cannot confidently proceed', () => {
  assert.throws(() => {
    parseTimetable('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 'image/jpeg', [
      { text: 'Lorem', confidence: 90, bbox: { x0: 10, y0: 10, x1: 50, y1: 25 } },
      { text: 'ipsum', confidence: 90, bbox: { x0: 60, y0: 10, x1: 100, y1: 25 } },
    ]);
  }, (err) => {
    return err.statusCode === 422 && /Unable to confidently recognize this timetable/i.test(err.message);
  });
});
