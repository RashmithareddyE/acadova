const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { Subject, TimetableEntry, CalendarEvent, Exam, SyllabusTopic } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const { StudySession } = require('../models/StudyPlanner');
const ClassIntention = require('../models/ClassIntention');

const definitions = {
  subjects: { model: Subject, populate: '' },
  timetable: { model: TimetableEntry, populate: 'subject' },
  calendar: { model: CalendarEvent, populate: '' },
  exams: { model: Exam, populate: 'subject', sort: { date: 1, startTime: 1 } },
  syllabus: { model: SyllabusTopic, populate: 'subject' },
};

function cleanPayload(resource, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Request body must be an object.');
  const fields = {
    subjects: ['name', 'code', 'teacher', 'credits', 'description'],
    timetable: ['subject', 'weekday', 'startTime', 'endTime', 'location', 'teacher', 'sessionType'],
    calendar: ['title', 'type', 'date', 'endDate', 'description'],
    exams: ['title', 'type', 'subject', 'date', 'startTime', 'endTime', 'venue', 'notes'],
    syllabus: ['subject', 'unit', 'topic', 'completed', 'progress'],
  }[resource];
  if (!fields) throw new AppError(404, 'Academic resource not found.');
  const payload = {};
  fields.forEach((field) => { if (body[field] !== undefined) payload[field] = body[field]; });
  if (resource === 'syllabus') {
    if (payload.progress !== undefined && !['not-started', 'in-progress', 'completed'].includes(payload.progress)) {
      throw new AppError(400, 'Choose Not Started, In Progress, or Completed topic progress.');
    }
    if (payload.progress !== undefined) payload.completed = payload.progress === 'completed';
    else if (payload.completed !== undefined) payload.progress = payload.completed ? 'completed' : 'not-started';
  }
  for (const key of ['subject']) {
    if (payload[key] !== undefined && !mongoose.isValidObjectId(payload[key])) throw new AppError(400, `Invalid ${key} identifier.`, { [key]: `Invalid ${key} identifier.` });
  }
  return payload;
}

async function assertSubjectOwner(subjectId, userId) {
  if (subjectId && !(await Subject.exists({ _id: subjectId, user: userId }))) {
    throw new AppError(400, 'Choose one of your own subjects.', { subject: 'Subject not found in your account.' });
  }
}

function escapedRegex(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function assertNoDuplicate(resource, values, userId, excludedId) {
  let identity;
  if (resource === 'timetable') {
    if (!values.subject || values.weekday == null || !values.startTime || !values.endTime) return;
    identity = { subject: values.subject, weekday: values.weekday, startTime: values.startTime, endTime: values.endTime };
  } else if (resource === 'calendar') {
    if (!values.title || !values.date || Number.isNaN(new Date(values.date).getTime())) return;
    identity = { title: new RegExp(`^${escapedRegex(values.title)}$`, 'i'), date: values.date };
  } else if (resource === 'exams') {
    if (!values.subject || !values.title || !values.date || Number.isNaN(new Date(values.date).getTime())) return;
    identity = { subject: values.subject, title: new RegExp(`^${escapedRegex(values.title)}$`, 'i'), date: values.date, startTime: values.startTime || '' };
  } else if (resource === 'syllabus') {
    if (!values.subject || !values.unit || !values.topic) return;
    identity = { subject: values.subject, unit: values.unit, topic: values.topic };
  }
  else return;
  if (Object.values(identity).some((value) => value === undefined)) return;
  const query = { ...identity, user: userId };
  if (excludedId) query._id = { $ne: excludedId };
  if (await definitions[resource].model.exists(query)) throw new AppError(409, `A matching ${resource === 'timetable' ? 'class' : resource === 'calendar' ? 'calendar event' : resource === 'exams' ? 'exam' : 'syllabus topic'} already exists.`);
}

function controller(resource) {
  const { model, populate, sort = { createdAt: -1 } } = definitions[resource];
  return {
    list: asyncHandler(async (req, res) => {
      const query = model.find({ user: req.user.id }).sort(sort);
      if (populate) query.populate(populate, 'name code');
      const records = await query;
      res.json({ success: true, records });
    }),
    create: asyncHandler(async (req, res) => {
      const values = cleanPayload(resource, req.body);
      await assertSubjectOwner(values.subject, req.user.id);
      await assertNoDuplicate(resource, values, req.user.id);
      const record = await model.create({ ...values, user: req.user.id });
      if (populate) await record.populate(populate);
      res.status(201).json({ success: true, record });
    }),
    update: asyncHandler(async (req, res) => {
      const values = cleanPayload(resource, req.body);
      await assertSubjectOwner(values.subject, req.user.id);
      const record = await model.findOne({ _id: req.params.id, user: req.user.id });
      if (!record) throw new AppError(404, 'Record not found.');
      await assertNoDuplicate(resource, { ...record.toObject(), ...values }, req.user.id, record._id);
      Object.assign(record, values);
      await record.save();
      if (populate) await record.populate(populate);
      res.json({ success: true, record });
    }),
    remove: asyncHandler(async (req, res) => {
      const record = await model.findOneAndDelete({ _id: req.params.id, user: req.user.id });
      if (!record) throw new AppError(404, 'Record not found.');
      if (resource === 'subjects') {
        const entries = await TimetableEntry.find({ user: req.user.id, subject: record.id }).select('_id');
        await Promise.all([
          TimetableEntry.deleteMany({ user: req.user.id, subject: record.id }),
          Exam.deleteMany({ user: req.user.id, subject: record.id }),
          SyllabusTopic.deleteMany({ user: req.user.id, subject: record.id }),
          Attendance.deleteMany({ user: req.user.id, subject: record.id }),
          ClassIntention.deleteMany({ user: req.user.id, timetableEntry: { $in: entries.map((entry) => entry._id) } }),
          StudySession.deleteMany({ user: req.user.id, subject: record.id }),
        ]);
      }
      if (resource === 'timetable') {
        await Promise.all([
          Attendance.updateMany({ user: req.user.id, timetableEntry: record.id }, { $set: { timetableEntry: null } }),
          ClassIntention.deleteMany({ user: req.user.id, timetableEntry: record.id }),
        ]);
      }
      if (resource === 'exams') await StudySession.deleteMany({ user: req.user.id, exam: record.id });
      if (resource === 'syllabus') await StudySession.deleteMany({ user: req.user.id, topic: record.id, status: 'planned' });
      res.json({ success: true });
    }),
  };
}

module.exports = { controller };
