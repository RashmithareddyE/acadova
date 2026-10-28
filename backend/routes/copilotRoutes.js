const express = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/copilotController');

const router = express.Router();
router.use(protect);
router.post('/ask', controller.ask);

module.exports = router;
