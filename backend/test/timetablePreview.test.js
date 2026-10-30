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
