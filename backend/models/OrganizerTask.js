const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  category: { type: String, enum: ['assignment', 'study', 'personal', 'other'], default: 'other' },
  dueDate: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
    validate: {
      validator(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
      },
      message: 'Enter a real due date in YYYY-MM-DD format.',
    },
  },
  dueTime: { type: String, default: '', match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
}, { timestamps: true });

taskSchema.index({ user: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('OrganizerTask', taskSchema);
