const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCalendar } = require('../services/documents/parseAcademicDocs');
const { TimetableEntry, CalendarEvent, Subject } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const { getSchedule } = require('../controllers/attendanceController');

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

// -------------------------------------------------------------
// 1. DSCE UG CALENDAR EXTRACTION (AUG-DEC 2026, 85 WORKING DAYS)
// -------------------------------------------------------------
test('parses DSCE UG Calendar of events with semester start, holidays, CIEs, and SEE', () => {
  const documentText = `
    DAYANANDA SAGAR COLLEGE OF ENGINEERING
    UG CALENDAR OF EVENTS 2026-27 (ODD SEMESTER)
    FOR III & V SEMESTER B.E. PROGRAMS
    TOTAL WORKING DAYS: 85 DAYS

    10.08.2026 Commencement of classes for III and V Semester
    15.08.2026 Independence Day (General Holiday)
    29.08.2026 Working Saturday (Monday timetable will be followed)
    07.09.2026 Ganesh Chaturthi (Holiday)
    02.10.2026 Gandhi Jayanti (Holiday)
    12.10.2026 to 14.10.2026 CIE - 1 for III and V Semester
    19.10.2026 to 21.10.2026 Dasara / Ayudha Pooja / Vijayadashami Break (Holiday)
    01.11.2026 Kannada Rajyotsava (Holiday)
    09.11.2026 to 11.11.2026 Deepavali / Balipadyami (Holiday)
    16.11.2026 to 18.11.2026 CIE - 2 for III and V Semester
    28.11.2026 Kanakadasa Jayanti (Holiday)
    07.12.2026 to 09.12.2026 CIE - 3 for III and V Semester
    11.12.2026 Last Working Day for III & V Semester
    14.12.2026 to 19.12.2026 Practical Examination / Lab CIE
    21.12.2026 onwards Tentative Semester End Examination (SEE) Theory
    25.12.2026 Christmas (Holiday)
  `;

  const rows = parseCalendar(documentText);
  assert.ok(rows.length >= 14, `Expected at least 14 calendar events, got ${rows.length}`);

  // Semester Start
  const startEvent = rows.find((r) => r.type === 'semester-start');
  assert.ok(startEvent, 'Semester start event detected');
  assert.equal(startEvent.date, '2026-08-10');

  // Holidays
  const holidays = rows.filter((r) => r.type === 'holiday');
  assert.ok(holidays.some((h) => h.date === '2026-08-15' && /independence/i.test(h.title)));
  assert.ok(holidays.some((h) => h.date === '2026-10-02' && /gandhi/i.test(h.title)));
  assert.ok(holidays.some((h) => h.date === '2026-12-25' && /christmas/i.test(h.title)));

  // Working Saturday
  const workingSat = rows.find((r) => r.type === 'working-saturday');
  assert.ok(workingSat, 'Working Saturday detected');
  assert.equal(workingSat.date, '2026-08-29');

  // Internal Assessments (CIE-1, CIE-2, CIE-3)
  const cies = rows.filter((r) => r.type === 'exam' && /cie/i.test(r.title));
  assert.ok(cies.length >= 3, `Expected at least 3 CIE exams, got ${cies.length}`);
  assert.ok(cies.some((c) => c.date === '2026-10-12' && c.endDate === '2026-10-14'));
  assert.ok(cies.some((c) => c.date === '2026-11-16' && c.endDate === '2026-11-18'));
  assert.ok(cies.some((c) => c.date === '2026-12-07' && c.endDate === '2026-12-09'));

  // Semester End
  const endEvent = rows.find((r) => r.type === 'semester-end');
  assert.ok(endEvent, 'Semester end event detected');
  assert.equal(endEvent.date, '2026-12-11');

  // SEE Exam onwards
  const seeEvent = rows.find((r) => /semester end examination|see/i.test(r.title));
  assert.ok(seeEvent, 'Semester End Examination event detected');
  assert.equal(seeEvent.date, '2026-12-21');
});

// -------------------------------------------------------------
// 2. TWO-DIGIT YEAR NORMALIZATION ('26' -> '2026')
// -------------------------------------------------------------
test('normalizes 2-digit years in calendar dates', () => {
  const text = `
    15.08.26 Independence Day (Holiday)
    02.10.26 Gandhi Jayanti (Holiday)
    12.10.26 to 14.10.26 CIE - 1
  `;
  const rows = parseCalendar(text);
  assert.equal(rows.find((r) => /independence/i.test(r.title)).date, '2026-08-15');
  assert.equal(rows.find((r) => /gandhi/i.test(r.title)).date, '2026-10-02');
  const cie = rows.find((r) => /cie/i.test(r.title));
  assert.equal(cie.date, '2026-10-12');
  assert.equal(cie.endDate, '2026-10-14');
});

// -------------------------------------------------------------
// 3. SEMESTER FILTERING
// -------------------------------------------------------------
test('filters events specifically matching chosen semester while keeping shared events', () => {
  const text = `
    10.08.2026 Commencement of classes for III Sem
    17.08.2026 Commencement of classes for V Sem
    15.08.2026 Independence Day (General Holiday)
    12.10.2026 to 14.10.2026 CIE - 1 for Semester 3
    19.10.2026 to 21.10.2026 CIE - 1 for Semester 5
  `;
  const sem3Rows = parseCalendar(text, 'text/plain', [], { semester: '3' });
  // Should include Independence Day and Sem 3 events, but omit Sem 5 events
  assert.ok(sem3Rows.some((r) => /commencement.*iii/i.test(r.title)));
  assert.ok(sem3Rows.some((r) => /cie.*semester 3/i.test(r.title)));
  assert.ok(sem3Rows.some((r) => /independence/i.test(r.title)));
  assert.ok(!sem3Rows.some((r) => /commencement.*v sem/i.test(r.title)), 'Does not include 5th sem commencement');
  assert.ok(!sem3Rows.some((r) => /cie.*semester 5/i.test(r.title)), 'Does not include 5th sem CIE');
});

// -------------------------------------------------------------
// 4. SCHEDULE INTEGRATION WITH CALENDAR
// -------------------------------------------------------------
test('getSchedule excludes college holidays and respects semester dates', async (t) => {
  const userId = '507f1f77bcf86cd799439011';
  const subId = '507f1f77bcf86cd799439012';

  // Timetable: Monday (weekday 0) has 1 class
  const mockEntries = [
    { _id: 'entry1', id: 'entry1', weekday: 0, startTime: '09:00', endTime: '10:00', teacher: 'Dr Rao', subject: { _id: subId, name: 'Computer Networks', code: 'CS301' } },
  ];

  // Calendar: Semester runs 2026-08-10 to 2026-12-11.
  // 2026-08-15 is a Saturday.
  // Monday 2026-08-17 is a normal class day.
  // Monday 2026-10-19 is a Holiday (Dasara).
  const mockCalendar = [
    { type: 'semester-start', date: new Date('2026-08-10T00:00:00.000Z') },
    { type: 'semester-end', date: new Date('2026-12-11T00:00:00.000Z') },
    { type: 'holiday', title: 'Dasara Holiday', date: new Date('2026-10-19T00:00:00.000Z') },
  ];

  restore(t, CalendarEvent, 'find');
  restore(t, TimetableEntry, 'find');
  restore(t, Attendance, 'find');

  CalendarEvent.find = async () => mockCalendar;
  TimetableEntry.find = () => ({
    populate: () => ({
      sort: () => mockEntries,
    }),
  });
  Attendance.find = async () => [];

  // Case 1: Query normal Monday (2026-08-17) -> 1 class returned
  const normalRes = await invoke(getSchedule, {
    user: { id: userId },
    query: { from: '2026-08-17', days: '1' },
  });
  assert.equal(normalRes.body.classes.length, 1);
  assert.equal(normalRes.body.classes[0].date, '2026-08-17');

  // Case 2: Query Holiday Monday (2026-10-19) -> 0 classes returned
  const holidayRes = await invoke(getSchedule, {
    user: { id: userId },
    query: { from: '2026-10-19', days: '1' },
  });
  assert.equal(holidayRes.body.classes.length, 0, 'No classes generated on confirmed holiday');

  // Case 3: Query date outside semester (2026-12-28) -> 0 classes returned
  const outsideRes = await invoke(getSchedule, {
    user: { id: userId },
    query: { from: '2026-12-28', days: '1' },
  });
  assert.equal(outsideRes.body.classes.length, 0, 'No classes generated after semester end');
});
