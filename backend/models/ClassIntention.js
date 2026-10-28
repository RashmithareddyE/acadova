const mongoose = require('mongoose');

const classIntentionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timetableEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'TimetableEntry', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  intention: { type: String, required: true, enum: ['attend', 'miss'] },
}, { timestamps: true });

classIntentionSchema.index({ user: 1, timetableEntry: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ClassIntention', classIntentionSchema);
