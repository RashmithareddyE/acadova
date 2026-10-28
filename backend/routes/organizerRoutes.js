const express = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/organizerController');

const router = express.Router();
router.use(protect);
router.route('/').get(controller.listTasks).post(controller.createTask);
router.route('/:id').put(controller.updateTask).delete(controller.deleteTask);

module.exports = router;
