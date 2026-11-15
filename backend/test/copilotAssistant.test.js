const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { askAcademicQuestion } = require('../services/copilotAssistant');
const { applicationDateString, timetableWeekdayForDate, applicationWeekday } = require('../utils/applicationDate');
const { Subject, TimetableEntry, Exam, SyllabusTopic } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const OrganizerTask = require('../models/OrganizerTask');
const { StudySession } = require('../models/StudyPlanner');

const testUserId = new mongoose.Types.ObjectId();
const mathId = new mongoose.Types.ObjectId();
const dbmsId = new mongoose.Types.ObjectId();

test('applicationDate utilities handle dates and weekdays correctly', () => {
  const dateStr = applicationDateString();
  assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/);

  // 2026-11-16 is Monday -> 0
  assert.equal(timetableWeekdayForDate('2026-11-16'), 0);
  // 2026-11-17 is Tuesday -> 1
  assert.equal(timetableWeekdayForDate('2026-11-17'), 1);
  // 2026-11-22 is Sunday -> 6
  assert.equal(timetableWeekdayForDate('2026-11-22'), 6);

  const currentWeekday = applicationWeekday();
  assert.ok(Number.isInteger(currentWeekday) && currentWeekday >= 0 && currentWeekday <= 6);
});

test('copilot routes timetable queries properly and not to attendance', async (t) => {
  const origFind = TimetableEntry.find;
  t.after(() => { TimetableEntry.find = origFind; });

  const todayStr = applicationDateString();
  const currentWeekday = timetableWeekdayForDate(todayStr);

  TimetableEntry.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          { _id: new mongoose.Types.ObjectId(), weekday: currentWeekday, startTime: '09:00', endTime: '10:00', subject: { name: 'Mathematics', code: 'MATH101' }, location: 'Room 101' },
        ],
      }),
    }),
  });

  // Mock other models
  Subject.find = () => ({ sort: () => ({ lean: async () => [{ _id: mathId, name: 'Mathematics', code: 'MATH101' }] }) });
  Attendance.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Exam.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  SyllabusTopic.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  StudySession.find = () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) }) }) });
  OrganizerTask.find = () => ({ sort: () => ({ lean: async () => [] }) });
  User.findById = () => ({ select: () => ({ lean: async () => ({ attendanceTarget: 75 }) }) });

  // 1. "What classes do I have today?"
  const res1 = await askAcademicQuestion({ userId: testUserId, question: 'What classes do I have today?' });
  assert.equal(res1.intent, 'timetable');
  assert.match(res1.answer, /Mathematics/);

  // 2. "What classes should I attend today?" (previously routed to attendance due to 'attend' keyword!)
  const res2 = await askAcademicQuestion({ userId: testUserId, question: 'What classes should I attend today?' });
  assert.equal(res2.intent, 'timetable');

  // 3. "Show my timetable" (previously fell through to general!)
  const res3 = await askAcademicQuestion({ userId: testUserId, question: 'Show my timetable' });
  assert.equal(res3.intent, 'timetable');
});

test('copilot exam queries never return NaN days', async (t) => {
  const origExamFind = Exam.find;
  t.after(() => { Exam.find = origExamFind; });

  const futureExamDate = new Date(Date.now() + 5 * 86400000);
  Exam.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          { _id: new mongoose.Types.ObjectId(), title: 'End Semester Exam', date: futureExamDate, startTime: '10:00', endTime: '13:00', subject: { name: 'Database Systems', code: 'CS301' } },
        ],
      }),
    }),
  });

  Subject.find = () => ({ sort: () => ({ lean: async () => [{ _id: dbmsId, name: 'Database Systems', code: 'CS301' }] }) });
  TimetableEntry.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Attendance.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  SyllabusTopic.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  StudySession.find = () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) }) }) });
  OrganizerTask.find = () => ({ sort: () => ({ lean: async () => [] }) });
  User.findById = () => ({ select: () => ({ lean: async () => ({ attendanceTarget: 75 }) }) });

  const res = await askAcademicQuestion({ userId: testUserId, question: 'When is my next exam?' });
  assert.equal(res.intent, 'exams');
  assert.ok(!res.answer.includes('NaN'), `Expected no NaN in answer, got: ${res.answer}`);
  assert.match(res.answer, /\d+ days? away/);
});

test('copilot study session end times are computed and never undefined', async (t) => {
  const origStudyFind = StudySession.find;
  t.after(() => { StudySession.find = origStudyFind; });

  StudySession.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          sort: () => ({
            lean: async () => [
              {
                _id: new mongoose.Types.ObjectId(),
                startTime: '14:00',
                durationMinutes: 45,
                topicLabel: 'Normalization',
                subject: { name: 'DBMS', code: 'CS301' },
                exam: { title: 'Midterm' },
              },
            ],
          }),
        }),
      }),
    }),
  });

  Subject.find = () => ({ sort: () => ({ lean: async () => [{ _id: dbmsId, name: 'DBMS', code: 'CS301' }] }) });
  TimetableEntry.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Attendance.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Exam.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  SyllabusTopic.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  OrganizerTask.find = () => ({ sort: () => ({ lean: async () => [] }) });
  User.findById = () => ({ select: () => ({ lean: async () => ({ attendanceTarget: 75 }) }) });

  const res = await askAcademicQuestion({ userId: testUserId, question: 'What should I study today?' });
  assert.equal(res.intent, 'study-plan');
  assert.ok(!res.answer.includes('undefined'), `Expected no undefined in answer, got: ${res.answer}`);
  assert.match(res.answer, /14:00–14:45/);
});

test('copilot routes notes queries', async () => {
  const res = await askAcademicQuestion({ userId: testUserId, question: 'Where can I find my personal notes?' });
  assert.equal(res.intent, 'notes');
  assert.match(res.answer, /Organizer/);
});

test('copilot routes attendance calculation questions', async () => {
  Subject.find = () => ({ sort: () => ({ lean: async () => [{ _id: mathId, name: 'Mathematics', code: 'MATH101' }] }) });
  TimetableEntry.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Attendance.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => [
          { subject: mathId, status: 'present' },
          { subject: mathId, status: 'present' },
          { subject: mathId, status: 'absent' },
        ],
      }),
    }),
  });
  Exam.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  SyllabusTopic.find = () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) });
  StudySession.find = () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => [] }) }) }) }) });
  OrganizerTask.find = () => ({ sort: () => ({ lean: async () => [] }) });
  User.findById = () => ({ select: () => ({ lean: async () => ({ attendanceTarget: 75 }) }) });

  const res = await askAcademicQuestion({ userId: testUserId, question: 'What is my Mathematics attendance?' });
  assert.equal(res.intent, 'attendance');
  assert.match(res.answer, /66\.7%/);
});
