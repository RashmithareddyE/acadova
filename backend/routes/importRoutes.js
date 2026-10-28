const express = require('express');
const { protect } = require('../middleware/auth');
const { previewTimetable, previewExams, previewSyllabus, previewCalendar } = require('../controllers/importController');

const router = express.Router();
router.use(protect);
router.post('/timetable/preview', express.raw({
  type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'text/tab-separated-values', 'application/octet-stream'],
  limit: '12mb',
}), previewTimetable);
const rawDocument = express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'text/tab-separated-values', 'application/octet-stream'], limit: '12mb' });
router.post('/exams/preview', rawDocument, previewExams);
router.post('/syllabus/preview', rawDocument, previewSyllabus);
router.post('/calendar/preview', rawDocument, previewCalendar);

module.exports = router;
