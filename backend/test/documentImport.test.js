const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
const { parseTimetable, normalizeTime } = require('../services/documents/parseTimetable');
const {
  validateContent, MAX_BYTES, imageDimensions, scoreOcrResult, selectBestOcrResult, preprocessImageCandidates,
} = require('../services/documents/extractText');
const { parseExams, parseSyllabus, parseCalendar, dateValue } = require('../services/documents/parseAcademicDocs');
const { extractText, shutdownOcrWorker } = require('../services/documents/extractText');

after(shutdownOcrWorker);

function makeTextPdf(text) {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

test('parses CSV timetable rows and normalizes weekdays and 12-hour times', () => {
  const rows = parseTimetable('subject,code,day,start,end,location\nAlgorithms,CS101,Monday,9:00 AM,10:15 AM,Room 4', 'text/csv');
  assert.equal(rows.length, 1);
  assert.deepEqual({ subject: rows[0].subjectName, code: rows[0].subjectCode, day: rows[0].weekday, start: rows[0].startTime, end: rows[0].endTime, location: rows[0].location }, {
    subject: 'Algorithms', code: 'CS101', day: 0, start: '09:00', end: '10:15', location: 'Room 4',
  });
  assert.deepEqual(rows[0].issues, []);
});

test('parses text timetable lines and flags incomplete values for review', () => {
  const rows = parseTimetable('Monday\n09:00 - 10:00 CS101 Data Structures Room 4\nWednesday 25:00 - 26:00 Invalid Time', 'text/plain');
  assert.equal(rows[0].subjectName, 'Data Structures');
  assert.equal(rows[0].weekday, 0);
  assert.ok(rows[1].issues.includes('Start/end time is missing or invalid.'));
});

test('uses OCR word positions to map weekday rows to matching time columns', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 }, confidence: 95 });
  const words = [
    word('Monday', 10, 100, 70, 120), word('Algorithms', 150, 100, 240, 120),
    word('Tuesday', 10, 150, 70, 170), word('Databases', 150, 150, 240, 170),
    word('9:00', 130, 50, 160, 70), word('-', 162, 50, 170, 70), word('10:00', 172, 50, 210, 70),
  ];
  const rows = parseTimetable('Monday Algorithms\nTuesday Databases', 'image/jpeg', words);
  assert.deepEqual(rows.map((row) => [row.weekday, row.subjectName, row.startTime, row.endTime]), [
    [0, 'Algorithms', '09:00', '10:00'], [1, 'Databases', '09:00', '10:00'],
  ]);
});

test('maps subjects when OCR separates the weekday and subject baselines and preserves stacked sections', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 }, confidence: 91 });
  const words = [
    word('Semester', 20, 12, 80, 24), word('1', 84, 12, 90, 24),
    word('09:00', 190, 35, 225, 47), word('-', 230, 35, 235, 47), word('10:00', 240, 35, 278, 47),
    word('Monday,', 10, 70, 78, 84), word('Algorithms', 190, 83, 264, 96),
    word('Tuesday', 10, 120, 76, 134), word('Physics', 190, 133, 244, 146),
    word('Faculty', 500, 190, 548, 202), word('Semester', 20, 212, 80, 224), word('2', 84, 212, 90, 224),
    word('09:00', 190, 235, 225, 247), word('-', 230, 235, 235, 247), word('10:00', 240, 235, 278, 247),
    word('Monday', 10, 270, 72, 284), word('Databases', 190, 283, 264, 296),
  ];
  const rows = parseTimetable('Semester 1\n09:00 - 10:00\nMonday\nAlgorithms\nTuesday\nPhysics\nSemester 2\n09:00 - 10:00\nMonday\nDatabases', 'image/jpeg', words);
  assert.deepEqual(rows.map((row) => [row.section, row.weekday, row.subjectName, row.startTime, row.endTime]), [
    ['Semester 1', 0, 'Algorithms', '09:00', '10:00'],
    ['Semester 1', 1, 'Physics', '09:00', '10:00'],
    ['Semester 2', 0, 'Databases', '09:00', '10:00'],
  ]);
});

test('recognizes punctuated short weekdays and common OCR weekday character confusions', () => {
  const rows = parseTimetable([
    'subject,day,start,end',
    'Algorithms,MON.,9:00 AM,10:00 AM',
    'Databases,Tues,10:00 AM,11:00 AM',
    'Networks,Thurs.,11:00 AM,12:00 PM',
    'Systems,M0N,1:00 PM,2:00 PM',
  ].join('\n'), 'text/csv');
  assert.deepEqual(rows.map((row) => row.weekday), [0, 1, 3, 0]);
});

test('joins OCR-split weekday letters and reads meridiem time headings from positioned words', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 }, confidence: 88 });
  const words = [
    word('9:00', 180, 20, 211, 34), word('AM', 214, 20, 232, 34), word('–', 235, 20, 241, 34), word('10:00', 244, 20, 280, 34), word('AM', 283, 20, 301, 34),
    word('M', 12, 60, 21, 75), word('o', 23, 60, 32, 75), word('n', 34, 60, 43, 75), word('Algorithms', 185, 73, 265, 88),
    word('TUE.', 12, 110, 46, 125), word('Databases', 185, 123, 265, 138),
  ];
  const rows = parseTimetable('9:00 AM – 10:00 AM\nM o n Algorithms\nTUE. Databases', 'image/jpeg', words);
  assert.deepEqual(rows.map((row) => [row.weekday, row.subjectName, row.startTime, row.endTime]), [
    [0, 'Algorithms', '09:00', '10:00'], [1, 'Databases', '09:00', '10:00'],
  ]);
});

test('keeps recognizable day and subject cells reviewable when the image has no readable period headings', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 }, confidence: 90 });
  const rows = parseTimetable('Monday Algorithms', 'image/jpeg', [word('Monday', 10, 50, 70, 64), word('Algorithms', 150, 63, 230, 76)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectName, 'Algorithms');
  assert.equal(rows[0].weekday, 0);
  assert.ok(rows[0].issues.includes('Start/end time is missing or invalid.'));
});

test('distinguishes image text that lacks recognizable timetable structure', () => {
  assert.throws(() => parseTimetable('Faculty directory and course list', 'image/jpeg'), /Image text was detected, but no timetable weekdays/);
});

test('reads image dimensions and rejects an image extension that conflicts with bytes', () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  assert.deepEqual(imageDimensions(png, 'image/png'), { width: 640, height: 480 });
  assert.throws(() => validateContent(png, 'image/png'), /filename/i);
  assert.throws(() => validateContent(png, 'image/png', 'timetable.jpg'), /extension does not match/i);
});

test('preprocesses timetable images into bounded enhanced and thresholded candidates without mutating input', async () => {
  const image = fs.readFileSync(path.join(__dirname, 'timetable-sample.jpg'));
  const original = Buffer.from(image);
  const candidates = await preprocessImageCandidates(image);
  assert.ok(candidates.enhanced.length > 0);
  assert.ok(candidates.thresholded.length > 0);
  assert.deepEqual(image, original);
  const { width, height } = await sharp(candidates.enhanced).metadata();
  assert.ok(width <= 3600 && height <= 3600);
  assert.ok(width * height <= 12_000_000);
  assert.ok(candidates.scaleX <= 2 && candidates.scaleY <= 2);
});

test('auto-orients images using their EXIF orientation during preprocessing', async () => {
  const image = fs.readFileSync(path.join(__dirname, 'timetable-sample.jpg'));
  const rotated = await sharp(image).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const candidates = await preprocessImageCandidates(rotated);
  const { width, height } = await sharp(candidates.enhanced).metadata();
  assert.ok(height > width, 'the EXIF-rotated image is corrected to portrait orientation');
});

test('selects one internally consistent OCR result using words, weekday, time, and confidence signals', () => {
  const weak = {
    text: 'college notices course departments',
    words: ['college', 'notices', 'course', 'departments'].map((text) => ({ text, confidence: 90 })),
  };
  const strong = {
    text: 'Tuesdoy 09:00 - 10:00',
    words: [
      { text: 'Tuesdoy', confidence: 85 },
      { text: 'Algorithms', confidence: 92 },
      { text: '09:00', confidence: 95 },
    ],
  };
  assert.ok(scoreOcrResult(strong).score > scoreOcrResult(weak).score);
  const selected = selectBestOcrResult([
    { ...weak, quality: scoreOcrResult(weak), image: 'original' },
    { ...strong, quality: scoreOcrResult(strong), image: 'enhanced' },
  ]);
  assert.equal(selected.image, 'enhanced');
  assert.equal(selected.text, strong.text);
  assert.deepEqual(selected.words, strong.words);
});

test('runs bundled local OCR on an actual JPEG timetable and maps its columns', async () => {
  const imagePath = path.join(__dirname, 'timetable-sample.jpg');
  const extracted = await extractText(fs.readFileSync(imagePath), 'image/jpeg', 'timetable-sample.jpg', { timetableOcr: true });
  assert.equal(extracted.method, 'tesseract.js-local-ocr');
  assert.match(extracted.text, /Monday/i);
  assert.ok(extracted.words.length > 5);
  const rows = parseTimetable(extracted.text, extracted.sourceType, extracted.words);
  assert.deepEqual(rows.map((row) => [row.weekday, row.subjectName, row.startTime, row.endTime]), [
    [0, 'Mathematics', '09:00', '10:00'], [0, 'Physics', '10:15', '11:15'],
    [1, 'Programming', '09:00', '10:00'], [1, 'Tutorial', '10:15', '11:15'],
  ]);
  assert.equal(rows[1].sessionType, 'lab');
  assert.equal(rows[3].sessionType, 'tutorial');
});

test('runs local OCR on an abbreviated timetable with a separate faculty table', async () => {
  const file = 'timetable-abbreviated-sample.jpg';
  const extracted = await extractText(fs.readFileSync(path.join(__dirname, file)), 'image/jpeg', file, { timetableOcr: true });
  const rows = parseTimetable(extracted.text, extracted.sourceType, extracted.words);
  assert.ok(rows.length >= 20, `expected timetable cells, got ${rows.length}`);
  assert.deepEqual([...new Set(rows.map((row) => row.weekday))].sort(), [0, 1, 2, 3, 4]);
  assert.ok(rows.some((row) => row.weekday === 0 && row.subjectCode === 'CS101' && row.startTime === '09:00'));
  assert.ok(rows.some((row) => row.issues.includes('Start/end time is missing or invalid.')), 'ambiguous OCR headings stay reviewable');
  assert.ok(rows.every((row) => !/faculty|dr rao|prof shah/i.test(row.subjectName)), 'the lower faculty table is not imported as a class');
  assert.ok(rows.every((row) => row.subjectName !== '-'), 'empty cells are not emitted as subjects');
});

test('extracts calendar events, exams, and syllabus topics from JPEG uploads', async () => {
  const readImage = async (file) => extractText(fs.readFileSync(path.join(__dirname, file)), 'image/jpeg', file);
  const calendar = parseCalendar((await readImage('calendar-sample.jpg')).text);
  assert.deepEqual(calendar.map((event) => [event.title, event.date, event.type]), [
    ['Founders Day', '2026-09-05', 'event'],
    ['Winter Break', '2026-12-24', 'holiday'],
    ['Project submission deadline', '2026-10-15', 'deadline'],
  ]);
  const exams = parseExams((await readImage('exam-sample.jpg')).text);
  assert.deepEqual(exams.map((exam) => [exam.subjectName, exam.date, exam.startTime, exam.endTime, exam.venue]), [
    ['Algorithms', '2026-11-12', '09:00', '11:00', 'Hall A'],
    ['Physics', '2026-11-18', '13:00', '15:00', 'Room 4'],
  ]);
  const syllabus = parseSyllabus((await readImage('syllabus-sample.jpg')).text);
  assert.equal(syllabus.subjectName, 'Algorithms');
  assert.deepEqual(syllabus.topics.map((topic) => topic.topic), ['Complexity analysis', 'Asymptotic notation', 'Traversal']);
});

test('returns an actionable unreadable-image error for a blank JPEG', async () => {
  await assert.rejects(() => extractText(fs.readFileSync(path.join(__dirname, 'blank-image.jpg')), 'image/jpeg', 'blank-image.jpg'), /No readable text/i);
});

test('decodes a valid WebP upload with the local OCR pipeline', async () => {
  const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==', 'base64');
  await assert.rejects(() => extractText(webp, 'image/webp', 'pixel.webp'), /No readable text/i);
});

test('keeps searchable PDF extraction working through pdftotext', async (context) => {
  const command = process.env.PDFTOTEXT_PATH || 'pdftotext';
  if (spawnSync(command, ['-v'], { windowsHide: true }).error) return context.skip('Poppler pdftotext is not installed in this environment.');
  const extracted = await extractText(makeTextPdf('Algorithms Monday 09:00 10:00'), 'application/pdf', 'schedule.pdf');
  assert.equal(extracted.method, 'pdf-text');
  assert.match(extracted.text, /Algorithms Monday 09:00 10:00/);
});

test('normalizes 24-hour and meridiem clock values', () => {
  assert.equal(normalizeTime('12:30 AM'), '00:30');
  assert.equal(normalizeTime('12 PM'), '12:00');
  assert.equal(normalizeTime('24:00'), null);
});

test('rejects empty, oversized, binary text, and mismatched declared file content', () => {
  assert.throws(() => validateContent(Buffer.alloc(0), 'text/csv'), /non-empty/);
  assert.throws(() => validateContent(Buffer.alloc(MAX_BYTES + 1, 65), 'text/plain'), /12 MB/);
  assert.throws(() => validateContent(Buffer.from([0, 1, 2]), 'text/plain'), /CSV or plain text/);
  const pdf = Buffer.from('%PDF-1.4 sample');
  assert.throws(() => validateContent(pdf, 'image/png'), /does not match/);
});

test('rejects a non-timetable text document with a reviewable extraction error', () => {
  assert.throws(() => parseTimetable('This file has no rows or class times.', 'text/plain'), /No timetable rows were recognized/);
});

test('parses multiple exam rows and leaves unrecognized subjects for user resolution', () => {
  const rows = parseExams('subject,code,date,start,end,venue,exam\nCalculus,MATH101,2026-11-02,09:00,11:00,Hall A,Midterm\nPhysics,PHY102,2026-11-05,,,Room 2,Final', 'text/csv');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-11-02');
  assert.equal(rows[0].type, 'midterm');
  assert.equal(rows[1].startTime, '');
  assert.equal(dateValue('31/02/2026'), '');
});

test('parses syllabus units and topics without fabricating content', () => {
  const result = parseSyllabus('Subject: Algorithms\nCode: CS201\nUnit 1: Foundations\n- Complexity analysis\n- Asymptotic notation\nUnit 2: Graphs\n- Traversal');
  assert.equal(result.subjectName, 'Algorithms');
  assert.equal(result.units.length, 2);
  assert.deepEqual(result.topics.map((item) => item.topic), ['Complexity analysis', 'Asymptotic notation', 'Traversal']);
});

test('parses calendar events, holidays, ranges, deadlines, and day-first month names', () => {
  const rows = parseCalendar('event,date,end date,type,description\nWinter Break,2026-12-24,2027-01-02,holiday,No classes\nProject deadline,02/11/2026,,deadline,Submit report');
  assert.deepEqual(rows.map((row) => [row.title, row.type, row.date, row.endDate]), [
    ['Winter Break', 'holiday', '2026-12-24', '2027-01-02'],
    ['Project deadline', 'deadline', '2026-11-02', ''],
  ]);
  const textRows = parseCalendar('Founders Day 5 September 2026');
  assert.equal(textRows[0].title, 'Founders Day');
  assert.equal(textRows[0].date, '2026-09-05');
  assert.equal(dateValue('31 February 2026'), '');
  const invalidRange = parseCalendar('event,date,end date\nSpring break,2026-03-01,31/02/2026')[0];
  assert.ok(invalidRange.issues.includes('Event end date is unclear or invalid.'));
});
