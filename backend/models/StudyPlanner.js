const mongoose = require('mongoose');

const ownership = { user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true } };
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const commitmentSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true, maxlength: 100 },
  weekday: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true, match: timePattern },
  endTime: { type: String, required: true, match: timePattern },
}, { _id: true });
commitmentSchema.pre('validate', function validateRange() {
  if (this.startTime && this.endTime && this.startTime >= this.endTime) this.invalidate('endTime', 'Commitment end time must be after its start time.');
});

const preferencesSchema = new mongoose.Schema({
  ...ownership,
  availableHoursPerDay: { type: Number, min: 0.5, max: 12, required: true },
  studyStartTime: { type: String, required: true, match: timePattern },
  studyEndTime: { type: String, required: true, match: timePattern },
  sessionMinutes: { type: Number, enum: [25, 30, 45, 50, 60, 75, 90], default: 45 },
  breakMinutes: { type: Number, enum: [5, 10, 15, 20, 30], default: 10 },
  studyDays: { type: [Number], validate: (days) => days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) },
  prioritySubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  commitments: { type: [commitmentSchema], default: [] },
}, { timestamps: true });
preferencesSchema.index({ user: 1 }, { unique: true });
preferencesSchema.pre('validate', function validateRange() {
  if (this.studyStartTime && this.studyEndTime && this.studyStartTime >= this.studyEndTime) this.invalidate('studyEndTime', 'Study window end must be after its start.');
});

const sessionSchema = new mongoose.Schema({
  ...ownership,
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusTopic', required: true },
  topicLabel: { type: String, required: true, trim: true, maxlength: 200 },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, required: true, match: timePattern },
  durationMinutes: { type: Number, required: true, min: 15, max: 180 },
  status: { type: String, enum: ['planned', 'completed', 'skipped'], default: 'planned' },
  generated: { type: Boolean, default: true },
}, { timestamps: true });
sessionSchema.index({ user: 1, date: 1, startTime: 1 });
sessionSchema.index({ user: 1, topic: 1, date: 1 }, { unique: true });

module.exports = {
  StudyPreferences: mongoose.model('StudyPreferences', preferencesSchema),
  StudySession: mongoose.model('StudySession', sessionSchema),
};
