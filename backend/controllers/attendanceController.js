const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const ClassIntention = require('../models/ClassIntention');
const User = require('../models/User');
const { Subject, TimetableEntry, CalendarEvent, Exam } = require('../models/Academic');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { attendanceInsight, projectAttendance, summarizeStatuses } = require('../services/attendanceCalculator');
const { buildTodayDashboard } = require('../services/todayDashboard');

const STATUSES = ['present', 'absent', 'cancelled'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function weekdayFor(dateString) {
  const day = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
  return (day + 6) % 7;
}

function dateBounds(dateString) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function objectId(value, label) {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) throw new AppError(400, `Invalid ${label} identifier.`, { [label]: `Invalid ${label} identifier.` });
  return value;
}

async function ownedReferences({ subjectId, timetableId, userId, date }) {
  objectId(subjectId, 'subject');
  const subject = await Subject.findOne({ _id: subjectId, user: userId });
  if (!subject) throw new AppError(400, 'Choose one of your own subjects.', { subject: 'Subject not found in your account.' });
  if (timetableId) {
    objectId(timetableId, 'timetableEntry');
    const entry = await TimetableEntry.findOne({ _id: timetableId, user: userId });
    if (!entry) throw new AppError(400, 'Choose one of your own timetable entries.', { timetableEntry: 'Timetable entry not found in your account.' });
    if (entry.subject.toString() !== subject._id.toString()) throw new AppError(400, 'The timetable entry does not match the selected subject.', { timetableEntry: 'The selected class belongs to another subject.' });
    if (entry.weekday !== weekdayFor(date)) throw new AppError(400, 'The timetable entry is not scheduled for this date.', { date: 'Choose a date that matches the class weekday.' });
  }
}

function payload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Request body must be an object.');
  const { subject, timetableEntry, date, status, notes = '' } = body;
  if (!subject) throw new AppError(400, 'Subject is required.', { subject: 'Subject is required.' });
  if (!validDate(date)) throw new AppError(400, 'Enter a valid class date (YYYY-MM-DD).', { date: 'Enter a valid date.' });
  if (!STATUSES.includes(status)) throw new AppError(400, 'Choose Present, Absent, or Cancelled.', { status: 'Choose a valid attendance status.' });
  const today = new Date().toISOString().slice(0, 10);
  if (date > today && status !== 'cancelled') throw new AppError(400, 'Future classes are projections, not completed attendance. Only a known cancellation can be recorded ahead of time.', { status: 'Future planned absences are not saved as actual attendance.' });
  if (typeof notes !== 'string' || notes.length > 1000) throw new AppError(400, 'Notes must be 1000 characters or fewer.', { notes: 'Notes must be 1000 characters or fewer.' });
  return { subject, timetableEntry: timetableEntry || null, date, status, notes: notes.trim() };
}

exports.listRecords = asyncHandler(async (req, res) => {
  const filter = { user: req.user.id };
  if (req.query.date) {
    if (!validDate(req.query.date)) throw new AppError(400, 'Enter a valid date (YYYY-MM-DD).');
    filter.date = req.query.date;
  }
  if (req.query.subject) filter.subject = objectId(req.query.subject, 'subject');
  const records = await Attendance.find(filter).sort({ date: -1, createdAt: -1 }).populate('subject', 'name code').populate('timetableEntry', 'weekday startTime endTime location');
  res.json({ success: true, records });
});

exports.createRecord = asyncHandler(async (req, res) => {
  const values = payload(req.body);
  await ownedReferences({ subjectId: values.subject, timetableId: values.timetableEntry, userId: req.user.id, date: values.date });
  let record;
  try { record = await Attendance.create({ ...values, user: req.user.id }); }
  catch (err) {
    if (err.code === 11000) throw new AppError(409, 'Attendance is already recorded for this scheduled class on that date. Edit the existing record instead.');
    throw err;
  }
  await record.populate([{ path: 'subject', select: 'name code' }, { path: 'timetableEntry', select: 'weekday startTime endTime location' }]);
  res.status(201).json({ success: true, record });
});

exports.updateRecord = asyncHandler(async (req, res) => {
  objectId(req.params.id, 'record');
  const values = payload(req.body);
  await ownedReferences({ subjectId: values.subject, timetableId: values.timetableEntry, userId: req.user.id, date: values.date });
  const record = await Attendance.findOne({ _id: req.params.id, user: req.user.id });
  if (!record) throw new AppError(404, 'Attendance record not found.');
  Object.assign(record, values);
  await record.save();
  await record.populate([{ path: 'subject', select: 'name code' }, { path: 'timetableEntry', select: 'weekday startTime endTime location' }]);
  res.json({ success: true, record });
});

exports.deleteRecord = asyncHandler(async (req, res) => {
  objectId(req.params.id, 'record');
  const record = await Attendance.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!record) throw new AppError(404, 'Attendance record not found.');
  res.json({ success: true });
});

exports.getTarget = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('attendanceTarget');
  res.json({ success: true, target: user.attendanceTarget || 75 });
});

exports.updateTarget = asyncHandler(async (req, res) => {
  const target = req.body?.target;
  if (![75, 80].includes(target)) throw new AppError(400, 'Attendance target must be 75% or 80%.', { target: 'Choose 75% or 80%.' });
  const user = await User.findById(req.user.id);
  user.attendanceTarget = target;
  await user.save();
  res.json({ success: true, target: user.attendanceTarget });
});

exports.getSummaries = asyncHandler(async (req, res) => {
  const target = (await User.findById(req.user.id).select('attendanceTarget'))?.attendanceTarget || 75;
  const [subjects, records] = await Promise.all([
    Subject.find({ user: req.user.id }).sort({ name: 1 }),
    Attendance.find({ user: req.user.id }).select('subject status'),
  ]);
  const summaries = subjects.map((subject) => {
    const sessions = records.filter((record) => record.subject.toString() === subject._id.toString());
    const actual = summarizeStatuses(sessions.map((record) => record.status), target);
    let status = 'no data';
    if (actual.percentage !== null) {
      if (actual.percentage < target) status = 'below target';
      else if (actual.additionalAbsencesAllowed <= 2) status = 'at risk';
      else status = 'safe';
    }
    return { subject: { id: subject.id, name: subject.name, code: subject.code }, ...actual, ...attendanceInsight(actual), status };
  });
  const present = summaries.reduce((sum, item) => sum + item.attended, 0);
  const conducted = summaries.reduce((sum, item) => sum + item.conducted, 0);
  res.json({ success: true, target, overall: { conducted, attended: present, missed: conducted - present, percentage: conducted ? (present / conducted) * 100 : null }, summaries });
});

exports.getTodayDashboard = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) throw new AppError(400, 'Enter a valid dashboard date (YYYY-MM-DD).');
  const { start, end } = dateBounds(date);
  const userId = req.user.id;
  const weekday = weekdayFor(date);
  const [user, entries, holiday, exams, subjects, records] = await Promise.all([
    User.findById(userId).select('attendanceTarget'),
    TimetableEntry.find({ user: userId, weekday }).populate('subject', 'name code').sort({ startTime: 1 }),
    CalendarEvent.findOne({
      user: userId,
      type: 'holiday',
      date: { $lt: end },
      $or: [
        { endDate: { $gte: start } },
        { endDate: null, date: { $gte: start } },
      ],
    }).sort({ date: 1 }),
    Exam.find({ user: userId, date: { $gte: start } })
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 })
      .limit(5),
    Subject.find({ user: userId }).sort({ name: 1 }),
    Attendance.find({ user: userId }).select('subject status timetableEntry date'),
  ]);
  const target = user?.attendanceTarget || 75;
  const entryIds = entries.map((entry) => entry._id);
  const [classRecords, intentions] = await Promise.all([
    entryIds.length
      ? Attendance.find({ user: userId, date, timetableEntry: { $in: entryIds } })
      : [],
    entryIds.length
      ? ClassIntention.find({ user: userId, date, timetableEntry: { $in: entryIds } })
      : [],
  ]);
  res.json({
    success: true,
    ...buildTodayDashboard({ date, weekday, target, entries, holiday, exams, subjects, records, classRecords, intentions }),
  });
});

exports.setIntention = asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new AppError(400, 'Request body must be an object.');
  }
  const { timetableEntry, date, intention } = req.body;
  objectId(timetableEntry, 'timetableEntry');
  if (!validDate(date)) throw new AppError(400, 'Enter a valid class date (YYYY-MM-DD).');
  if (date < new Date().toISOString().slice(0, 10)) throw new AppError(400, 'Plans can only be recorded for today or a future class.');
  if (!['attend', 'miss'].includes(intention)) throw new AppError(400, 'Choose whether you plan to attend or miss this class.');
  const entry = await TimetableEntry.findOne({ _id: timetableEntry, user: req.user.id });
  if (!entry) throw new AppError(404, 'Scheduled class not found in your timetable.');
  if (entry.weekday !== weekdayFor(date)) throw new AppError(400, 'This class is not scheduled for the selected date.');
  if (await Attendance.exists({ user: req.user.id, timetableEntry, date })) {
    throw new AppError(409, 'Actual attendance is already recorded for this class. Update the attendance record instead.');
  }
  let plan;
  try {
    plan = await ClassIntention.findOneAndUpdate(
      { user: req.user.id, timetableEntry, date },
      { $set: { intention } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code === 11000) throw new AppError(409, 'A plan for this scheduled class was changed at the same time. Refresh and try again.');
    throw error;
  }
  res.json({ success: true, plan });
});

exports.deleteIntention = asyncHandler(async (req, res) => {
  objectId(req.params.id, 'intention');
  const plan = await ClassIntention.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!plan) throw new AppError(404, 'Class plan not found.');
  res.json({ success: true });
});

exports.getSchedule = asyncHandler(async (req, res) => {
  const from = req.query.from || req.query.date;
  const days = Number(req.query.days || 1);
  if (!validDate(from)) throw new AppError(400, 'Enter a valid date (YYYY-MM-DD).');
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new AppError(400, 'Schedule range must be between 1 and 14 days.');
  const dates = Array.from({ length: days }, (_, i) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return date.toISOString().slice(0, 10);
  });
  const entries = await TimetableEntry.find({ user: req.user.id, weekday: { $in: [...new Set(dates.map(weekdayFor))] } }).populate('subject', 'name code').sort({ startTime: 1 });
  const records = await Attendance.find({ user: req.user.id, date: { $in: dates }, timetableEntry: { $in: entries.map((entry) => entry._id) } });
  const lookup = new Map(records.map((record) => [`${record.date}:${record.timetableEntry}`, record]));
  const classes = dates.flatMap((date) => entries.filter((entry) => entry.weekday === weekdayFor(date)).map((entry) => {
    const record = lookup.get(`${date}:${entry.id}`);
    return { date, timetableEntry: entry, subject: entry.subject, record: record || null };
  })).sort((a, b) => a.date.localeCompare(b.date) || a.timetableEntry.startTime.localeCompare(b.timetableEntry.startTime));
  res.json({ success: true, classes });
});

exports.project = asyncHandler(async (req, res) => {
  const subjectId = objectId(req.query.subject, 'subject');
  const subject = await Subject.findOne({ _id: subjectId, user: req.user.id });
  if (!subject) throw new AppError(404, 'Subject not found.');
  const attend = Number(req.query.attend || 0);
  const miss = Number(req.query.miss || 0);
  if (![attend, miss].every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) throw new AppError(400, 'Future class counts must be whole numbers from 0 to 1000.');
  const [targetUser, records] = await Promise.all([
    User.findById(req.user.id).select('attendanceTarget'),
    Attendance.find({ user: req.user.id, subject: subjectId, status: { $in: ['present', 'absent'] } }).select('status'),
  ]);
  const actual = summarizeStatuses(records.map((record) => record.status), targetUser.attendanceTarget || 75);
  res.json({ success: true, projection: projectAttendance(actual.attended, actual.missed, attend, miss, targetUser.attendanceTarget || 75) });
});
