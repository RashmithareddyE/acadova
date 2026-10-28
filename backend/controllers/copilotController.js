const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { askAcademicQuestion } = require('../services/copilotAssistant');

exports.ask = asyncHandler(async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) {
    throw new AppError(400, 'Ask a question about your timetable, attendance, exams, assignments, or study plan.');
  }

  const result = await askAcademicQuestion({ userId: req.user.id, question });
  res.json({ success: true, ...result });
});
