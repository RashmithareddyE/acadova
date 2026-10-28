const express = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/studyPlannerController');

const router = express.Router();
router.use(protect);
router.route('/preferences').get(controller.getPreferences).put(controller.updatePreferences);
router.get('/dashboard', controller.getDashboard);
router.get('/overview', controller.getOverview);
router.get('/sessions', controller.listSessions);
router.post('/preview', controller.preview);
router.post('/generate', controller.generate);
router.route('/sessions/:id').put(controller.updateSession).delete(controller.deleteSession);

module.exports = router;
