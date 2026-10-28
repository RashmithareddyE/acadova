const mongoose = require('mongoose');
const OrganizerTask = require('../models/OrganizerTask');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CATEGORIES = ['assignment', 'study', 'personal', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['pending', 'completed'];
const VIEWS = ['all', 'today', 'upcoming', 'overdue', 'completed', 'dashboard'];

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateTask(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Task details must be an object.');
  const values = {};
  const fields = ['title', 'description', 'category', 'dueDate', 'dueTime', 'priority', 'status'];
  for (const field of fields) if (body[field] !== undefined) values[field] = body[field];

  if (!partial || values.title !== undefined) {
    if (typeof values.title !== 'string' || !values.title.trim() || values.title.trim().length > 160) {
      throw new AppError(400, 'Enter a task title of 1 to 160 characters.', { title: 'A task title is required.' });
    }
    values.title = values.title.trim();
  }
  if (!partial || values.dueDate !== undefined) {
    if (!validDate(values.dueDate)) throw new AppError(400, 'Choose a valid due date.', { dueDate: 'Choose a real date.' });
  }
  if (values.description !== undefined && (typeof values.description !== 'string' || values.description.length > 2000)) {
    throw new AppError(400, 'Description must be 2000 characters or fewer.', { description: 'Description is too long.' });
  }
  if (values.category !== undefined && !CATEGORIES.includes(values.category)) throw new AppError(400, 'Choose a valid task category.', { category: 'Choose Assignment, Study, Personal, or Other.' });
  if (values.priority !== undefined && !PRIORITIES.includes(values.priority)) throw new AppError(400, 'Choose Low, Medium, or High priority.', { priority: 'Choose a valid priority.' });
  if (values.status !== undefined && !STATUSES.includes(values.status)) throw new AppError(400, 'Choose Pending or Completed status.', { status: 'Choose a valid status.' });
  if (values.dueTime !== undefined && values.dueTime !== '' && (typeof values.dueTime !== 'string' || !TIME.test(values.dueTime))) {
    throw new AppError(400, 'Enter a valid due time or leave it blank.', { dueTime: 'Use 24-hour time, such as 14:30.' });
  }
  if (values.dueTime === undefined && !partial) values.dueTime = '';
  return values;
}

function validId(value) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(400, 'Invalid task identifier.');
  return value;
}

exports.listTasks = asyncHandler(async (req, res) => {
  const view = req.query.view || 'all';
  if (!VIEWS.includes(view)) throw new AppError(400, 'Choose All, Today, Upcoming, Overdue, or Completed tasks.');
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) throw new AppError(400, 'Enter a valid task date (YYYY-MM-DD).');

  if (view === 'dashboard') {
    const pending = { user: req.user.id, status: 'pending' };
    const [today, overdue, upcoming] = await Promise.all([
      OrganizerTask.find({ ...pending, dueDate: date }).sort({ dueTime: 1, createdAt: -1 }),
      OrganizerTask.find({ ...pending, dueDate: { $lt: date } }).sort({ dueDate: 1, dueTime: 1 }),
      OrganizerTask.find({ ...pending, dueDate: { $gt: date } }).sort({ dueDate: 1, dueTime: 1 }).limit(5),
    ]);
    return res.json({ success: true, tasks: { today, overdue, upcoming } });
  }
  const filter = { user: req.user.id };
  if (view === 'completed') filter.status = 'completed';
  else if (['today', 'upcoming', 'overdue'].includes(view)) {
    filter.status = 'pending';
    if (view === 'today') filter.dueDate = date;
    if (view === 'upcoming') filter.dueDate = { $gt: date };
    if (view === 'overdue') filter.dueDate = { $lt: date };
  }
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new AppError(400, 'Choose Pending or Completed status.');
    if (view === 'all') filter.status = req.query.status;
  }
  if (req.query.category) {
    if (!CATEGORIES.includes(req.query.category)) throw new AppError(400, 'Choose a valid task category.');
    filter.category = req.query.category;
  }
  if (req.query.priority) {
    if (!PRIORITIES.includes(req.query.priority)) throw new AppError(400, 'Choose a valid task priority.');
    filter.priority = req.query.priority;
  }
  const tasks = await OrganizerTask.find(filter).sort({ dueDate: 1, dueTime: 1, createdAt: -1 });
  res.json({ success: true, tasks });
});

exports.createTask = asyncHandler(async (req, res) => {
  const values = validateTask(req.body);
  const task = await OrganizerTask.create({ ...values, user: req.user.id });
  res.status(201).json({ success: true, task });
});

exports.updateTask = asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const values = validateTask(req.body, { partial: true });
  if (!Object.keys(values).length) throw new AppError(400, 'Provide at least one task field to update.');
  const task = await OrganizerTask.findOneAndUpdate(
    { _id: id, user: req.user.id },
    { $set: values },
    { new: true, runValidators: true }
  );
  if (!task) throw new AppError(404, 'Task not found.');
  res.json({ success: true, task });
});

exports.deleteTask = asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const task = await OrganizerTask.findOneAndDelete({ _id: id, user: req.user.id });
  if (!task) throw new AppError(404, 'Task not found.');
  res.json({ success: true });
});

exports._validation = { validDate, validateTask };
