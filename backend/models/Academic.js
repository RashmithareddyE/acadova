const mongoose = require('mongoose');

const ownership = { user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true } };

const subjectSchema = new mongoose.Schema({
  ...ownership,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, maxlength: 30 },
  teacher: { type: String, trim: true, maxlength: 100, default: '' },
  credits: { type: Number, required: true, min: 0, max: 60 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
}, { timestamps: true });
subjectSchema.index({ user: 1, code: 1 }, { unique: true });

const timetableSchema = new mongoose.Schema({
  ...ownership,
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  weekday: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  teacher: { type: String, trim: true, maxlength: 100, default: '' },
  sessionType: { type: String, enum: ['', 'lecture', 'lab', 'practical', 'tutorial', 'other'], default: '' },
}, { timestamps: true });
timetableSchema.pre('validate', function validateRange() {
  if (this.startTime && this.endTime && this.startTime >= this.endTime) this.invalidate('endTime', 'End time must be after start time.');
});

const calendarSchema = new mongoose.Schema({
  ...ownership,
  title: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: ['event', 'holiday', 'deadline', 'college'] },
  date: { type: Date, required: true },
  endDate: { type: Date, default: null },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
}, { timestamps: true });
calendarSchema.pre('validate', function validateRange() {
  if (this.endDate && this.date && this.endDate < this.date) this.invalidate('endDate', 'End date must be on or after the start date.');
});

const examSchema = new mongoose.Schema({
  ...ownership,
  title: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, required: true, enum: ['midterm', 'final', 'quiz', 'practical', 'other'] },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date: { type: Date, required: true },
  startTime: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  venue: { type: String, trim: true, maxlength: 160, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
}, { timestamps: true });
examSchema.index({ user: 1, date: 1, startTime: 1 });
examSchema.pre('validate', function validateRange() {
  if (Boolean(this.startTime) !== Boolean(this.endTime)) this.invalidate('endTime', 'Enter both exam times or leave both blank.');
  if (this.startTime && this.endTime && this.startTime >= this.endTime) this.invalidate('endTime', 'End time must be after start time.');
});

const syllabusSchema = new mongoose.Schema({
  ...ownership,
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  unit: { type: String, required: true, trim: true, maxlength: 120 },
  topic: { type: String, required: true, trim: true, maxlength: 200 },
  completed: { type: Boolean, default: false },
  progress: { type: String, enum: ['not-started', 'in-progress', 'completed'], default: 'not-started' },
}, { timestamps: true });
syllabusSchema.index({ user: 1, subject: 1, unit: 1, topic: 1 }, { unique: true });

module.exports = {
  Subject: mongoose.model('Subject', subjectSchema),
  TimetableEntry: mongoose.model('TimetableEntry', timetableSchema),
  CalendarEvent: mongoose.model('CalendarEvent', calendarSchema),
  Exam: mongoose.model('Exam', examSchema),
  SyllabusTopic: mongoose.model('SyllabusTopic', syllabusSchema),
};
