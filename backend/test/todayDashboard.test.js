const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTodayDashboard } = require('../services/todayDashboard');

const subject = { _id: 'subject-1', id: 'subject-1', name: 'Database Systems', code: 'DBS' };
const entry = { _id: 'entry-1', subject, startTime: '09:00', endTime: '10:00' };

test('dashboard returns empty timetable and confirmed holiday without inventing classes', () => {
  const result = buildTodayDashboard({
    date: '2026-10-26',
    weekday: 0,
    target: 75,
    entries: [],
    holiday: { title: 'College Foundation Day', description: 'Campus closed' },
    exams: [],
    subjects: [subject],
    records: [],
    classRecords: [],
    intentions: [],
  });
  assert.equal(result.isHoliday, true);
  assert.deepEqual(result.classes, []);
  assert.equal(result.holiday.title, 'College Foundation Day');
  assert.deepEqual(result.upcomingAssignments, []);
});

test('an empty timetable with no calendar record is not treated as a holiday', () => {
  const result = buildTodayDashboard({
    date: '2026-10-27',
    weekday: 1,
    target: 75,
    entries: [],
    holiday: null,
    exams: [],
    subjects: [],
    records: [],
    classRecords: [],
    intentions: [],
  });
  assert.equal(result.isHoliday, false);
  assert.equal(result.holiday, null);
  assert.deepEqual(result.classes, []);
});

test('plans stay separate from confirmed attendance totals and class record status', () => {
  const result = buildTodayDashboard({
    date: '2026-10-26',
    weekday: 0,
    target: 75,
    entries: [entry],
    holiday: null,
    exams: [],
    subjects: [subject],
    records: [{ subject: 'subject-1', status: 'present' }, { subject: 'subject-1', status: 'absent' }],
    classRecords: [{ timetableEntry: 'entry-1', status: 'cancelled' }],
    intentions: [{ _id: 'plan-1', timetableEntry: 'entry-1', intention: 'attend' }],
  });
  assert.equal(result.isHoliday, false);
  assert.equal(result.summaries[0].attended, 1);
  assert.equal(result.summaries[0].conducted, 2);
  assert.equal(result.summaries[0].percentage, 50);
  assert.equal(result.classes[0].record.status, 'cancelled');
  assert.equal(result.classes[0].plan.intention, 'attend');
});

test('dashboard returns owner-provided upcoming exam data without deriving fake assignments', () => {
  const exam = { _id: 'exam-1', title: 'Midterm', date: new Date('2026-11-02T00:00:00.000Z') };
  const result = buildTodayDashboard({
    date: '2026-10-26',
    weekday: 0,
    target: 75,
    entries: [],
    holiday: null,
    exams: [exam],
    subjects: [],
    records: [],
    classRecords: [],
    intentions: [],
  });
  assert.deepEqual(result.upcomingExams, [exam]);
  assert.deepEqual(result.upcomingAssignments, []);
});
