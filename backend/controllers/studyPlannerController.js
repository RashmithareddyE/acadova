const mongoose = require('mongoose');
const crypto = require('node:crypto');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Subject, TimetableEntry, CalendarEvent, Exam, SyllabusTopic } = require('../models/Academic');
const { StudyPreferences, StudySession } = require('../models/StudyPlanner');
const OrganizerTask = require('../models/OrganizerTask');
const { generatePlan, slotConflicts, toMinutes, WEEKDAY, dateString } = require('../services/planner/generatePlan');
const { getRecommendations } = require('../services/planner/recommendations');
const { applicationDateString } = require('../utils/applicationDate');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const idString = (value) => String(value?._id || value?.id || value);
const todayDate = () => applicationDateString();

function defaultPreferences() {
  return { availableHoursPerDay: null, studyStartTime: '', studyEndTime: '', sessionMinutes: 45, breakMinutes: 10, studyDays: [], prioritySubjects: [], commitments: [] };
}

function validatePreferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Preferences must be an object.');
  const { availableHoursPerDay, studyStartTime, studyEndTime, sessionMinutes, breakMinutes, studyDays, prioritySubjects, commitments } = body;
  if (!Number.isFinite(availableHoursPerDay) || availableHoursPerDay < 0.5 || availableHoursPerDay > 12) throw new AppError(400, 'Available study time must be between 0.5 and 12 hours per day.');
  if (!TIME.test(studyStartTime || '') || !TIME.test(studyEndTime || '') || studyStartTime >= studyEndTime) throw new AppError(400, 'Choose a valid study time window.');
  if (![25, 30, 45, 50, 60, 75, 90].includes(sessionMinutes)) throw new AppError(400, 'Choose a supported study session duration.');
  if (![5, 10, 15, 20, 30].includes(breakMinutes)) throw new AppError(400, 'Choose a supported break duration.');
  if (!Array.isArray(studyDays) || !studyDays.length || studyDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new AppError(400, 'Choose at least one study day.');
  if (!Array.isArray(prioritySubjects) || prioritySubjects.some((id) => !mongoose.isValidObjectId(id))) throw new AppError(400, 'Priority subjects must be valid subject IDs.');
  if (!Array.isArray(commitments) || commitments.length > 30) throw new AppError(400, 'Add no more than 30 weekly commitments.');
  for (const item of commitments) {
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100 || !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6 || !TIME.test(item.startTime || '') || !TIME.test(item.endTime || '') || item.startTime >= item.endTime) throw new AppError(400, 'Check each weekly commitment label, day, and time range.');
  }
  return { availableHoursPerDay, studyStartTime, studyEndTime, sessionMinutes, breakMinutes, studyDays: [...new Set(studyDays)], prioritySubjects: [...new Set(prioritySubjects)], commitments };
}

exports.getPreferences = asyncHandler(async (req, res) => {
  const preferences = await StudyPreferences.findOne({ user: req.user.id }).lean();
  res.json({ success: true, preferences: preferences || defaultPreferences() });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const values = validatePreferences(req.body);
  const uniqueIds = values.prioritySubjects;
  const owned = await Subject.countDocuments({ user: req.user.id, _id: { $in: uniqueIds } });
  if (owned !== uniqueIds.length) throw new AppError(400, 'Priority subjects must belong to your Acadova account.');
  const preferences = await StudyPreferences.findOneAndUpdate({ user: req.user.id }, { $set: { ...values, user: req.user.id } }, { new: true, upsert: true, runValidators: true });
  res.json({ success: true, preferences });
});

exports.getOverview = asyncHandler(async (req, res) => {
  const exams = await Exam.find({ user: req.user.id, date: { $gte: new Date(`${todayDate()}T00:00:00.000Z`) } }).populate('subject', 'name code').sort({ date: 1, startTime: 1 });
  const topics = await SyllabusTopic.find({ user: req.user.id }).select('subject unit topic completed progress');
  const progress = new Map();
  for (const topic of topics) {
    const key = idString(topic.subject); const item = progress.get(key) || { total: 0, completed: 0, inProgress: 0, notStarted: 0, topics: [] };
    const status = topic.completed ? 'completed' : topic.progress || 'not-started';
    item.total += 1;
    if (status === 'completed' || topic.completed) item.completed += 1;
    else if (status === 'in-progress') item.inProgress += 1;
    else item.notStarted += 1;
    item.topics.push({ id: idString(topic), unit: topic.unit, topic: topic.topic, completed: status === 'completed' || topic.completed, progress: status }); progress.set(key, item);
  }
  const sessions = await StudySession.find({ user: req.user.id }).select('exam status');
  const sessionStatus = new Map(); sessions.forEach((session) => { const values = sessionStatus.get(idString(session.exam)) || []; values.push(session.status); sessionStatus.set(idString(session.exam), values); });
  const overview = exams.map((exam) => {
    const syllabus = progress.get(idString(exam.subject)) || { total: 0, completed: 0, inProgress: 0, notStarted: 0, topics: [] };
    const daysRemaining = Math.max(0, Math.ceil((new Date(`${dateString(new Date(exam.date))}T00:00:00.000Z`) - new Date(`${todayDate()}T00:00:00.000Z`)) / 86400000));
    const statuses = sessionStatus.get(idString(exam)) || [];
    const studyPlanStatus = !statuses.length ? 'not generated' : statuses.includes('planned') ? 'in progress' : statuses.every((status) => status === 'completed') ? 'completed' : 'needs rescheduling';
    return { ...exam.toObject(), daysRemaining, syllabus, studyPlanStatus };
  });
  res.json({ success: true, exams: overview });
});

exports.getDashboard = asyncHandler(async (req, res) => {
  const today = todayDate();
  const start = new Date(`${today}T00:00:00.000Z`);
  const [sessions, exam, preferences] = await Promise.all([
    StudySession.find({ user: req.user.id, date: today, status: 'planned' })
      .populate('exam', 'title date type')
      .populate('subject', 'name code')
      .populate('topic', 'unit topic progress completed')
      .sort({ startTime: 1 }),
    Exam.findOne({ user: req.user.id, date: { $gte: start } })
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 }),
    StudyPreferences.findOne({ user: req.user.id }).select('_id'),
  ]);
  let preparation = null;
  if (exam) {
    const topics = await SyllabusTopic.find({ user: req.user.id, subject: exam.subject._id }).select('completed progress');
    const completed = topics.filter((topic) => topic.completed || topic.progress === 'completed').length;
    preparation = { total: topics.length, completed, inProgress: topics.filter((topic) => topic.progress === 'in-progress').length, percentage: topics.length ? Math.round(completed * 100 / topics.length) : null };
  }
  res.json({ success: true, today, sessions, nearestExam: exam, preparation, hasAvailability: Boolean(preferences) });
});

exports.listSessions = asyncHandler(async (req, res) => {
  const sessions = await StudySession.find({ user: req.user.id }).populate('exam', 'title date type').populate('subject', 'name code').populate('topic', 'unit topic progress completed').sort({ date: 1, startTime: 1 });
  res.json({ success: true, sessions });
});

async function buildPlanPreview(userId) {
  const today = todayDate();
  const preferences = await StudyPreferences.findOne({ user: userId }).lean();
  if (!preferences) throw new AppError(400, 'Set your study availability and study days before generating a plan.');
  const [exams, topics, timetable, calendar, assignments, existingSessions] = await Promise.all([
    Exam.find({ user: userId, date: { $gte: new Date(`${today}T00:00:00.000Z`) } }).populate('subject', 'name code').sort({ date: 1 }),
    SyllabusTopic.find({ user: userId }),
    TimetableEntry.find({ user: userId }),
    CalendarEvent.find({ user: userId, $or: [{ date: { $gte: new Date(`${today}T00:00:00.000Z`) } }, { endDate: { $gte: new Date(`${today}T00:00:00.000Z`) } }] }),
    OrganizerTask.find({ user: userId, status: 'pending', category: 'assignment', dueDate: { $gte: today } }).select('title dueDate dueTime priority'),
    StudySession.find({ user: userId }),
  ]);
  if (!exams.length) throw new AppError(400, 'Add an upcoming exam before generating a dated study plan.');
  const result = generatePlan({ exams, topics, timetable, calendar, assignments, preferences, existingSessions, today });
  const existingPlanned = existingSessions.filter((item) => item.status === 'planned');
  const byTopic = new Map(existingPlanned.map((item) => [idString(item.topic), item]));
  const proposedTopicIds = new Set(result.sessions.map((item) => idString(item.topic)));
  const changes = {
    added: result.sessions.filter((item) => !byTopic.has(idString(item.topic))),
    moved: result.sessions.filter((item) => byTopic.has(idString(item.topic)) && byTopic.get(idString(item.topic)).date !== item.date)
      .map((item) => ({ session: item, fromDate: byTopic.get(idString(item.topic)).date })),
    removed: existingPlanned.filter((item) => !proposedTopicIds.has(idString(item.topic))),
    preservedHistory: existingSessions.filter((item) => item.status !== 'planned').length,
  };
  const previewHash = crypto.createHash('sha256').update(JSON.stringify({
    existing: existingPlanned.map((item) => [idString(item._id), idString(item.topic), item.date, item.startTime, item.durationMinutes]).sort((a, b) => a[0].localeCompare(b[0])),
    proposed: result.sessions.map((item) => [idString(item.topic), item.date, item.startTime, item.durationMinutes]).sort((a, b) => a[0].localeCompare(b[0])),
  })).digest('hex');
  const recommendation = await getRecommendations({ summary: result.summary });
  return { ...result, changes, recommendation, previewHash };
}

exports.preview = asyncHandler(async (req, res) => {
  const preview = await buildPlanPreview(req.user.id);
  res.json({ success: true, ...preview });
});

exports.generate = asyncHandler(async (req, res) => {
  if (req.body?.confirmed !== true || typeof req.body.previewHash !== 'string') throw new AppError(400, 'Review the proposed changes and confirm before replacing the current plan.');
  const result = await buildPlanPreview(req.user.id);
  const receivedHash = Buffer.from(req.body.previewHash, 'hex');
  const currentHash = Buffer.from(result.previewHash, 'hex');
  if (receivedHash.length !== currentHash.length || !crypto.timingSafeEqual(receivedHash, currentHash)) {
    throw new AppError(409, 'Your exams, syllabus, availability, or current plan changed after preview. Review a new plan before applying it.');
  }
  const existingSessions = await StudySession.find({ user: req.user.id }).select('topic date status');
  const byTopicDate = new Map(existingSessions.filter((item) => item.status === 'planned').map((item) => [`${idString(item.topic)}:${item.date}`, item]));
  const retainedIds = [];
  const operations = result.sessions.map((item) => {
    const old = byTopicDate.get(`${idString(item.topic)}:${item.date}`);
    if (old) {
      retainedIds.push(old._id);
      return { updateOne: { filter: { _id: old._id, user: req.user.id }, update: { $set: { exam: item.exam._id, subject: item.subject._id, topic: item.topic._id, topicLabel: item.topicLabel, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes, status: 'planned' } } } };
    }
    return { insertOne: { document: { user: req.user.id, exam: item.exam._id, subject: item.subject._id, topic: item.topic._id, topicLabel: item.topicLabel, date: item.date, startTime: item.startTime, durationMinutes: item.durationMinutes, status: 'planned', generated: true } } };
  });
  if (operations.length) await StudySession.bulkWrite(operations);
  const retained = [...retainedIds, ...existingSessions.filter((item) => item.status !== 'planned').map((item) => item._id)];
  await StudySession.deleteMany({ user: req.user.id, status: 'planned', _id: { $nin: retained } });
  const sessions = await StudySession.find({ user: req.user.id }).populate('exam', 'title date type').populate('subject', 'name code').populate('topic', 'unit topic progress completed').sort({ date: 1, startTime: 1 });
  res.json({ success: true, sessions, summary: result.summary, recommendation: result.recommendation });
});

async function assertSessionSlot({ session, date, startTime, durationMinutes, preferences, userId }) {
  const dateValue = DATE.test(date || '') ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!dateValue || Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date || !TIME.test(startTime || '') || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 180) throw new AppError(400, 'Choose a valid date, start time, and duration.');
  if (date < todayDate() || date >= dateString(new Date(session.examDate))) throw new AppError(400, 'Study sessions must be scheduled from today up to the day before the examination.');
  if (!(preferences.studyDays || []).includes(WEEKDAY(date))) throw new AppError(400, 'Choose one of your configured study days.');
  const start = toMinutes(preferences.studyStartTime); const end = toMinutes(preferences.studyEndTime); const begins = toMinutes(startTime);
  if (begins < start || begins + durationMinutes > end || begins + durationMinutes > 1440) throw new AppError(400, 'The session must fit within your preferred study window.');
  const [classes, events, otherSessions] = await Promise.all([
    TimetableEntry.find({ user: userId, weekday: WEEKDAY(date) }),
    CalendarEvent.find({
      user: userId,
      date: { $lte: new Date(`${date}T23:59:59.999Z`) },
      $or: [
        { endDate: { $gte: new Date(`${date}T00:00:00.000Z`) } },
        { endDate: null, date: { $gte: new Date(`${date}T00:00:00.000Z`) } },
      ],
    }),
    StudySession.find({ user: userId, date, _id: { $ne: session._id } }),
  ]);
  if (events.length) throw new AppError(409, 'This date has an academic calendar commitment. Choose another day.');
  const blocks = classes.map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }));
  (preferences.commitments || []).filter((item) => item.weekday === WEEKDAY(date)).forEach((item) => blocks.push({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }));
  otherSessions.forEach((item) => blocks.push({ start: toMinutes(item.startTime), end: toMinutes(item.startTime) + item.durationMinutes }));
  if (slotConflicts(startTime, durationMinutes, blocks)) throw new AppError(409, 'This study session overlaps a class, commitment, or other study session.');
}

exports.updateSession = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid study session identifier.');
  const session = await StudySession.findOne({ _id: req.params.id, user: req.user.id }).populate('exam', 'date');
  if (!session) throw new AppError(404, 'Study session not found.');
  const status = req.body?.status;
  if (!['planned', 'completed', 'skipped'].includes(status)) throw new AppError(400, 'Choose planned, completed, or skipped status.');
  const date = req.body.date ?? session.date;
  const startTime = req.body.startTime ?? session.startTime;
  const durationMinutes = req.body.durationMinutes ?? session.durationMinutes;
  if (status === 'completed' && date > todayDate()) throw new AppError(400, 'A future study session cannot be marked completed.');
  const preferences = await StudyPreferences.findOne({ user: req.user.id }).lean();
  if (!preferences) throw new AppError(400, 'Study preferences are unavailable.');
  if (status === 'planned' || date !== session.date || startTime !== session.startTime || durationMinutes !== session.durationMinutes) {
    await assertSessionSlot({ session: { ...session.toObject(), examDate: session.exam.date }, date, startTime, durationMinutes, preferences, userId: req.user.id });
  }
  session.status = status; session.date = date; session.startTime = startTime; session.durationMinutes = durationMinutes;
  await session.save();
  await session.populate([{ path: 'exam', select: 'title date type' }, { path: 'subject', select: 'name code' }, { path: 'topic', select: 'unit topic progress completed' }]);
  res.json({ success: true, session });
});

exports.deleteSession = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'Invalid study session identifier.');
  const session = await StudySession.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!session) throw new AppError(404, 'Study session not found.');
  res.json({ success: true });
});

exports._validation = { validatePreferences, defaultPreferences, buildPlanPreview };
