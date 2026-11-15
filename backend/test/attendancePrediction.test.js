const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAttendance,
  projectAttendance,
  attendanceInsight,
  projectSemesterAttendance,
} = require('../services/attendanceCalculator');
const { buildTodayDashboard } = require('../services/todayDashboard');
const { applicationDateString, timetableWeekdayForDate } = require('../utils/applicationDate');
const { Subject, CalendarEvent, TimetableEntry } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const ClassIntention = require('../models/ClassIntention');
const controller = require('../controllers/attendanceController');

const userId = '507f1f77bcf86cd799439011';
const subjectId = '507f1f77bcf86cd799439012';

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ statusCode: this.statusCode, body }); },
    };
    handler(req, res, reject);
  });
}

function restore(t, model, method) {
  const original = model[method];
  t.after(() => { model[method] = original; });
}

// ---------------------------------------------------------
// 1. HOLIDAY EXCLUSION
// ---------------------------------------------------------
test('holiday exclusion: dates within holidays are excluded from remaining classes', () => {
  const subject = { _id: subjectId, name: 'Data Structures', code: 'CS201', initialConducted: 0, initialAttended: 0 };
  // Scheduled on Mondays (weekday 0)
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '09:00', endTime: '10:00' }];
  // Semester from 2026-11-01 to 2026-11-30.
  // Mondays in Nov 2026: Nov 2, Nov 9, Nov 16, Nov 23, Nov 30 (5 Mondays).
  // Current date is 2026-11-01 (Sunday).
  // Nov 9 is a college holiday.
  const calendarEvents = [
    { type: 'semester-end', date: new Date('2026-11-30T00:00:00.000Z') },
    { type: 'holiday', title: 'Diwali Break', date: new Date('2026-11-09T00:00:00.000Z'), endDate: new Date('2026-11-09T00:00:00.000Z') },
  ];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents,
    currentDate: '2026-11-01',
    actualRecords: [],
    target: 75,
  });

  // Out of 5 Mondays, Nov 9 is excluded -> 4 remaining classes
  assert.equal(result.remainingScheduledClasses, 4);
});

// ---------------------------------------------------------
// 2. WORKING SATURDAY INCLUSION
// ---------------------------------------------------------
test('working Saturday inclusion: special working Saturdays are counted in schedule', () => {
  const subject = { _id: subjectId, name: 'Physics', code: 'PHY101' };
  // Only Monday is normally scheduled
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '10:00', endTime: '11:00' }];
  // Saturday Nov 7, 2026 is marked as working-saturday
  const calendarEvents = [
    { type: 'semester-end', date: new Date('2026-11-08T00:00:00.000Z') },
    { type: 'working-saturday', title: 'Compensatory Saturday', date: new Date('2026-11-07T00:00:00.000Z') },
  ];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents,
    currentDate: '2026-11-01',
    actualRecords: [],
    target: 75,
  });

  // Monday Nov 2 (1) + Working Saturday Nov 7 (1) = 2 remaining classes
  assert.equal(result.remainingScheduledClasses, 2);
});

// ---------------------------------------------------------
// 3. CANCELLED CLASS EXCLUSION
// ---------------------------------------------------------
test('cancelled class exclusion: dates marked as cancelled are omitted from remaining classes', () => {
  const subject = { _id: subjectId, name: 'Chemistry', code: 'CH101' };
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '10:00', endTime: '11:00' }];
  // Mondays: Nov 2, Nov 9, Nov 16
  const calendarEvents = [
    { type: 'semester-end', date: new Date('2026-11-16T00:00:00.000Z') },
    { type: 'cancelled-class', title: 'Faculty on leave', date: new Date('2026-11-09T00:00:00.000Z') },
  ];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents,
    currentDate: '2026-11-01',
    actualRecords: [],
    target: 75,
  });

  // 3 Mondays minus 1 cancelled = 2 classes
  assert.equal(result.remainingScheduledClasses, 2);
});

// ---------------------------------------------------------
// 4. SEMESTER BOUNDARIES
// ---------------------------------------------------------
test('semester boundaries: never invents future classes when semester dates are missing', () => {
  const subject = { _id: subjectId, name: 'Mathematics', code: 'MATH101' };
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '09:00', endTime: '10:00' }];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents: [], // No semester-end configured!
    currentDate: '2026-11-01',
    actualRecords: [],
    target: 75,
  });

  assert.equal(result.remainingScheduledClasses, 0);
  assert.equal(result.semesterEndConfigured, false);
});

test('semester boundaries: classes beyond semester end are excluded', () => {
  const subject = { _id: subjectId, name: 'Biology', code: 'BIO101' };
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '09:00', endTime: '10:00' }];
  // Semester ends on Nov 3, 2026 (only Nov 2 Monday is included, Nov 9 Monday is excluded)
  const calendarEvents = [
    { type: 'semester-end', date: new Date('2026-11-03T00:00:00.000Z') },
  ];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents,
    currentDate: '2026-11-01',
    actualRecords: [],
    target: 75,
  });

  assert.equal(result.remainingScheduledClasses, 1);
});

// ---------------------------------------------------------
// 5. ATTENDANCE PROJECTION
// ---------------------------------------------------------
test('attendance projection: calculates projected, max possible, and min possible attendance', () => {
  const subject = { _id: subjectId, name: 'Operating Systems', code: 'CS301' };
  const timetableEntries = [{ subject: subjectId, weekday: 0, startTime: '09:00', endTime: '10:00' }];
  // 4 remaining classes
  const calendarEvents = [{ type: 'semester-end', date: new Date('2026-11-30T00:00:00.000Z') }];
  // Currently: 6 attended out of 8 conducted = 75%
  const actualRecords = [
    { status: 'present' }, { status: 'present' }, { status: 'present' },
    { status: 'present' }, { status: 'present' }, { status: 'present' },
    { status: 'absent' }, { status: 'absent' },
  ];

  const result = projectSemesterAttendance({
    subject,
    timetableEntries,
    calendarEvents,
    currentDate: '2026-11-01',
    actualRecords,
    target: 75,
  });

  // Current: 6/8 = 75%
  assert.equal(result.percentage, 75);
  // Remaining: 5 Mondays (Nov 2, 9, 16, 23, 30)
  assert.equal(result.remainingScheduledClasses, 5);
  // If all 5 attended: (6 + 5) / (8 + 5) = 11/13 ≈ 84.6%
  assert.equal(result.maxPossiblePercentage, (11 / 13) * 100);
  // If all 5 missed: 6 / (8 + 5) = 6/13 ≈ 46.15%
  assert.equal(result.minPossiblePercentage, (6 / 13) * 100);
});

// ---------------------------------------------------------
// 6. ATTEND / MISS INTENTIONS
// ---------------------------------------------------------
test('attend/miss intentions: update projected attendance without mutating actual records', () => {
  const actualConducted = 10;
  const actualAttended = 8; // 80%
  const target = 75;

  // Student intends to attend next class
  const ifAttend = projectAttendance(actualAttended, actualConducted - actualAttended, 1, 0, target);
  assert.equal(ifAttend.attended, 9);
  assert.equal(ifAttend.conducted, 11);
  assert.equal(ifAttend.percentage, (9 / 11) * 100);

  // Student intends to miss next class
  const ifMiss = projectAttendance(actualAttended, actualConducted - actualAttended, 0, 1, target);
  assert.equal(ifMiss.attended, 8);
  assert.equal(ifMiss.conducted, 11);
  assert.equal(ifMiss.percentage, (8 / 11) * 100);

  // Official actual counts remain untouched
  const official = calculateAttendance(actualAttended, actualConducted - actualAttended, target);
  assert.equal(official.attended, 8);
  assert.equal(official.conducted, 10);
});

// ---------------------------------------------------------
// 7. ACTUAL ATTENDANCE CONFIRMATION & DUPLICATE PREVENTION
// ---------------------------------------------------------
test('actual attendance confirmation: prevents duplicate attendance records for same class and date', async (t) => {
  restore(t, Subject, 'findOne');
  restore(t, TimetableEntry, 'findOne');
  restore(t, Attendance, 'create');

  Subject.findOne = async () => ({ _id: subjectId, user: userId });
  TimetableEntry.findOne = async () => ({ _id: 'entry-1', subject: subjectId, weekday: 0 });
  Attendance.create = async () => {
    const err = new Error('Duplicate key');
    err.code = 11000;
    throw err;
  };

  await assert.rejects(
    invoke(controller.createRecord, {
      user: { id: userId },
      body: { subject: subjectId, timetableEntry: '507f1f77bcf86cd799439013', date: '2026-11-02', status: 'present' },
    }),
    (err) => err.statusCode === 409
  );
});

// ---------------------------------------------------------
// 8. MANUAL ATTENDANCE INITIALIZATION (BASELINE)
// ---------------------------------------------------------
test('manual attendance initialization: incorporates baseline into calculations without fake records', () => {
  // Student joined mid-semester: 20 conducted, 16 attended
  const baseline = { conducted: 20, attended: 16 };
  // In Acadova they have recorded 2 presents and 0 absents
  const result = calculateAttendance(2, 0, 75, baseline);

  assert.equal(result.conducted, 22);
  assert.equal(result.attended, 18);
  assert.equal(result.percentage, (18 / 22) * 100);
});

test('manual attendance initialization: percentage-only initialization converts properly', async (t) => {
  restore(t, Subject, 'findOne');
  let savedConducted = 0;
  let savedAttended = 0;

  Subject.findOne = async () => ({
    _id: subjectId,
    user: userId,
    save: async function () {
      savedConducted = this.initialConducted;
      savedAttended = this.initialAttended;
    },
  });

  const response = await invoke(controller.setBaseline, {
    user: { id: userId },
    body: { subject: subjectId, percentage: 80 },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(savedConducted, 100);
  assert.equal(savedAttended, 80);
});

test('manual attendance initialization: rejects attended classes exceeding conducted classes', async (t) => {
  restore(t, Subject, 'findOne');
  Subject.findOne = async () => ({ _id: subjectId, user: userId });

  await assert.rejects(
    invoke(controller.setBaseline, {
      user: { id: userId },
      body: { subject: subjectId, initialConducted: 10, initialAttended: 12 },
    }),
    (err) => err.statusCode === 400
  );
});

// ---------------------------------------------------------
// 9. SUBJECT-WISE INTELLIGENT ATTENDANCE WARNINGS
// ---------------------------------------------------------
test('subject-wise warnings: below target (< 75%) recommends attendance and calculates recovery', () => {
  const attendance = calculateAttendance(6, 4, 75); // 6/10 = 60%
  const insight = attendanceInsight(attendance);

  assert.equal(insight.level, 'below-target');
  assert.match(insight.warning, /below 75%/);
  assert.match(insight.warning, /strongly recommended/);
  assert.match(insight.warning, /Attend the next \d+ classes/);
});

test('subject-wise warnings: near target (76%) displays caution with remaining safe misses', () => {
  const attendance = calculateAttendance(19, 6, 75); // 19/25 = 76%
  const insight = attendanceInsight(attendance);

  assert.equal(insight.level, 'near-target');
  assert.match(insight.warning, /close to the minimum requirement/);
  assert.match(insight.warning, /Try to attend upcoming classes/);
});

test('subject-wise warnings: healthy attendance (90%) displays healthy confirmation', () => {
  const attendance = calculateAttendance(18, 2, 75); // 18/20 = 90%
  const insight = attendanceInsight(attendance);

  assert.equal(insight.level, 'comfortable');
  assert.match(insight.warning, /Good! Your attendance is healthy/);
  assert.match(insight.warning, /safely miss up to \d+ classes/);
});

// ---------------------------------------------------------
// 10. TODAY DASHBOARD HOLIDAY DISPLAY
// ---------------------------------------------------------
test('today dashboard holiday display: flags holiday and suppresses active classes', () => {
  const subject = { _id: subjectId, name: 'Networks', code: 'CS401' };
  const entry = { _id: 'e-1', subject, startTime: '10:00', endTime: '11:00' };

  const result = buildTodayDashboard({
    date: '2026-11-14',
    weekday: 5,
    target: 75,
    entries: [entry],
    holiday: { title: 'National Holiday', description: 'Campus Closed' },
    exams: [],
    subjects: [subject],
    records: [],
    classRecords: [],
    intentions: [],
  });

  assert.equal(result.isHoliday, true);
  assert.equal(result.holiday.title, 'National Holiday');
  // Regular classes are not displayed as active classes on a holiday!
  assert.deepEqual(result.classes, []);
});

// ---------------------------------------------------------
// 11. INDIA TIMEZONE BOUNDARIES
// ---------------------------------------------------------
test('India timezone boundaries: handles date strings and weekday conversion in Asia/Kolkata', () => {
  // UTC 2026-11-14 20:00:00 is 2026-11-15 01:30:00 AM IST
  const lateUtc = new Date('2026-11-14T20:00:00.000Z');
  const istDateString = applicationDateString(lateUtc);
  assert.equal(istDateString, '2026-11-15');

  // Sunday 2026-11-15 is weekday 6 (0=Mon, 6=Sun)
  const weekday = timetableWeekdayForDate('2026-11-15');
  assert.equal(weekday, 6);

  // Monday 2026-11-16 is weekday 0
  assert.equal(timetableWeekdayForDate('2026-11-16'), 0);
});
