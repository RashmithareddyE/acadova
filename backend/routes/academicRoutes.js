const express = require('express');
const { protect } = require('../middleware/auth');
const { controller } = require('../controllers/academicController');

const router = express.Router();
router.use(protect);
for (const resource of ['subjects', 'timetable', 'calendar', 'exams', 'syllabus']) {
  const handlers = controller(resource);
  const endpoint = `/${resource}`;
  router.route(endpoint).get(handlers.list).post(handlers.create);
  router.route(`${endpoint}/:id`).put(handlers.update).delete(handlers.remove);
}

module.exports = router;
