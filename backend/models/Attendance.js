const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  timetableEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'TimetableEntry', default: null },
  // Calendar date stored as YYYY-MM-DD to avoid timezone shifts on display.
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, required: true, enum: ['present', 'absent', 'cancelled'] },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true });

attendanceSchema.index(
  { user: 1, timetableEntry: 1, date: 1 },
  { unique: true, partialFilterExpression: { timetableEntry: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Attendance', attendanceSchema);
