const express = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/attendanceController');

const router = express.Router();
router.use(protect);
router.get('/target', controller.getTarget);
router.put('/target', controller.updateTarget);
router.get('/summary', controller.getSummaries);
router.get('/today', controller.getTodayDashboard);
router.get('/schedule', controller.getSchedule);
router.get('/projection', controller.project);
router.put('/intentions', controller.setIntention);
router.delete('/intentions/:id', controller.deleteIntention);
router.route('/records').get(controller.listRecords).post(controller.createRecord);
router.route('/records/:id').put(controller.updateRecord).delete(controller.deleteRecord);

module.exports = router;
