const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTimetablePreview } = require('../controllers/importController');

function pngHeader() {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(511, 16);
  image.writeUInt32BE(338, 20);
  return image;
}

test('uses local OCR only and keeps incomplete rows editable in the preview', async () => {
  const row = {
    subjectName: 'Algorithms',
    subjectCode: 'CS201',
    weekday: 0,
    startTime: '',
    endTime: '',
    location: '',
    teacher: '',
    sessionType: '',
    section: '',
    issues: ['Start/end time is missing or invalid.'],
  };
  const result = await buildTimetablePreview(pngHeader(), 'image/png', 'schedule.png', {
    extractText: async () => ({
      text: 'Monday Algorithms',
      sourceType: 'image/png',
      method: 'tesseract.js-local-ocr',
      words: [],
    }),
    parseTimetable: () => [row],
    remoteOcrFallback: async () => {
      throw new Error('A paid or remote OCR fallback must not be called.');
    },
  });

  assert.equal(result.extraction.method, 'tesseract.js-local-ocr');
  assert.equal(result.extraction.incomplete, 1);
  assert.deepEqual(result.rows, [row]);
  assert.match(result.message, /need correction/i);
});

test('surfaces local OCR failures so the user can choose manual entry', async () => {
  await assert.rejects(() => buildTimetablePreview(pngHeader(), 'image/png', 'schedule.png', {
    extractText: async () => {
      throw Object.assign(new Error('Local OCR could not start.'), { statusCode: 503 });
    },
  }), (error) => error.statusCode === 503 && /Local OCR could not start/.test(error.message));
});

test('exposes normalized CSV and extraction warnings before any persistence call', async () => {
  const result = await buildTimetablePreview(pngHeader(), 'image/png', 'schedule.png', {
    extractText: async () => ({
      text: 'Monday Mathematics',
      sourceType: 'image/png',
      method: 'tesseract.js-local-ocr',
      words: [],
    }),
    parseTimetable: () => [{
      subjectName: 'Mathematics',
      subjectCode: 'MA301',
      weekday: 0,
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      teacher: '',
      sessionType: '',
      section: '',
      sourceLine: 1,
      issues: ['OCR confidence is low. Verify this row against the image.'],
    }],
  });

  assert.equal(result.csvColumns.join(','), 'subject,subject_code,day,start_time,end_time,faculty,location,session_type');
  assert.ok(result.csv.startsWith('\uFEFFsubject,subject_code,day,start_time,end_time,faculty,location,session_type'));
  assert.match(result.csv, /Mathematics,MA301,Monday,09:00,10:00,,,/);
  assert.equal(result.extraction.incomplete, 1);
  assert.ok(result.extraction.warnings.length > 0);
});
