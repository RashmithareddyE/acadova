const test = require('node:test');
const assert = require('node:assert/strict');
const { generatePlan, slotConflicts, WEEKDAY, toMinutes } = require('../services/planner/generatePlan');

const prefs = {
  availableHoursPerDay: 1.5, studyStartTime: '09:00', studyEndTime: '12:00',
  sessionMinutes: 45, breakMinutes: 10, studyDays: [0, 1, 2, 3, 4], prioritySubjects: [], commitments: [],
};
const subject = (id, name) => ({ _id: id, name, code: id.toUpperCase() });
const exam = (subjectValue, date) => ({ _id: `exam-${subjectValue._id}`, subject: subjectValue, date: new Date(`${date}T00:00:00.000Z`), title: `Exam ${subjectValue.name}` });
const topic = (id, subjectValue, completed = false) => ({ _id: id, subject: subjectValue._id, topic: `Topic ${id}`, unit: 'Unit 1', completed });

test('places sessions around timetable and weekly commitment conflicts', () => {
  const s = subject('s1', 'Biology');
  const result = generatePlan({
    today: '2026-01-05', exams: [exam(s, '2026-01-08')], topics: [topic('t1', s), topic('t2', s)],
    timetable: [{ weekday: 0, startTime: '09:00', endTime: '10:00' }],
    calendar: [], preferences: { ...prefs, commitments: [{ weekday: 0, startTime: '10:45', endTime: '11:30', label: 'Work' }] },
  });
  for (const session of result.sessions) {
    const start = toMinutes(session.startTime); const end = start + session.durationMinutes;
    assert.equal(session.date === '2026-01-05' && start < 600 && end > 540, false);
    assert.equal(session.date === '2026-01-05' && start < 690 && end > 645, false);
  }
  assert.equal(WEEKDAY('2026-01-05'), 0);
  assert.equal(slotConflicts('10:00', 45, [{ start: 540, end: 600 }]), false);
});

test('calendar dates block study and insufficient capacity is reported without inventing topics', () => {
  const s = subject('s2', 'Chemistry');
  const result = generatePlan({
    today: '2026-01-05', exams: [exam(s, '2026-01-07')], topics: [topic('t1', s), topic('t2', s), topic('t3', s)],
    timetable: [], calendar: [{ date: new Date('2026-01-06T00:00:00.000Z'), endDate: null, title: 'Holiday' }],
    preferences: { ...prefs, availableHoursPerDay: 1, studyDays: [0, 1] },
  });
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].date, '2026-01-05');
  assert.equal(result.summary.unscheduledTopics.length, 2);
  assert.equal(result.summary.unfinishedTopics, 3);
});

test('completed syllabus topics are excluded and subjects with no syllabus are disclosed', () => {
  const a = subject('s3', 'History'); const b = subject('s4', 'Physics');
  const result = generatePlan({
    today: '2026-01-05', exams: [exam(a, '2026-01-08'), exam(b, '2026-01-08')],
    topics: [topic('done', a, true), topic('todo', a)], timetable: [], calendar: [], preferences: prefs,
  });
  assert.equal(result.summary.unfinishedTopics, 1);
  assert.deepEqual(result.summary.subjectsWithoutSyllabus.map((item) => item.subject), ['Physics']);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].topicLabel, 'Topic todo');
});

test('no exam plans are returned when the student has no upcoming examinations', () => {
  const s = subject('s5', 'Art');
  const result = generatePlan({ today: '2026-01-05', exams: [exam(s, '2026-01-04')], topics: [topic('t1', s)], timetable: [], calendar: [], preferences: prefs });
  assert.equal(result.sessions.length, 0);
  assert.equal(result.summary.upcomingExams, 0);
});

test('topics with in-progress status remain schedulable until explicitly completed', () => {
  const s = subject('s6', 'Physics');
  const result = generatePlan({
    today: '2026-01-05',
    exams: [exam(s, '2026-01-08')],
    topics: [{ ...topic('in-progress', s), progress: 'in-progress' }, { ...topic('complete', s), progress: 'completed' }],
    timetable: [],
    calendar: [],
    preferences: prefs,
  });
  assert.deepEqual(result.sessions.map((session) => session.topicLabel), ['Topic in-progress']);
});

test('nearer examinations are scheduled before topics for later examinations', () => {
  const first = subject('soon', 'Mathematics');
  const later = subject('later', 'History');
  const result = generatePlan({
    today: '2026-01-05',
    exams: [exam(later, '2026-01-12'), exam(first, '2026-01-08')],
    topics: [topic('later-topic', later), topic('near-topic', first)],
    timetable: [],
    calendar: [],
    preferences: { ...prefs, availableHoursPerDay: 0.75 },
  });
  assert.equal(result.sessions[0].subject._id, first._id);
});

test('assignment due dates are reserved as all-day commitments without inventing assignment workload', () => {
  const s = subject('s7', 'Economics');
  const result = generatePlan({
    today: '2026-01-05',
    exams: [exam(s, '2026-01-09')],
    topics: [topic('t1', s), topic('t2', s)],
    timetable: [],
    calendar: [],
    assignments: [{ title: 'Essay', dueDate: '2026-01-06', status: 'pending', category: 'assignment' }],
    preferences: { ...prefs, availableHoursPerDay: 0.75, studyDays: [0, 1] },
  });
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].date, '2026-01-05');
  assert.deepEqual(result.summary.assignmentDueDates, ['2026-01-06']);
  assert.equal(result.summary.unscheduledTopics.length, 1);
});

test('logged topic sessions do not create duplicate topic/date entries on regeneration', () => {
  const s = subject('s8', 'Statistics');
  const result = generatePlan({
    today: '2026-01-05',
    exams: [exam(s, '2026-01-08')],
    topics: [topic('t1', s)],
    timetable: [],
    calendar: [],
    existingSessions: [{ topic: 't1', date: '2026-01-05', startTime: '09:00', durationMinutes: 45, status: 'completed' }],
    preferences: { ...prefs, availableHoursPerDay: 0.75 },
  });
  assert.equal(result.sessions.some((session) => session.topic._id === 't1' && session.date === '2026-01-05'), false);
  assert.equal(result.sessions.length, 1);
});

test('no topic study session is scheduled on or after its examination date', () => {
  const s = subject('s9', 'Literature');
  const result = generatePlan({
    today: '2026-01-05',
    exams: [exam(s, '2026-01-06')],
    topics: [topic('t1', s)],
    timetable: [],
    calendar: [],
    preferences: { ...prefs, studyDays: [0, 1] },
  });
  assert.ok(result.sessions.every((session) => session.date < '2026-01-06'));
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].date, '2026-01-05');
});
