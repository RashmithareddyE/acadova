const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../controllers/studyPlannerController');
const { StudySession } = require('../models/StudyPlanner');
const { StudyPreferences } = require('../models/StudyPlanner');
const { TimetableEntry, CalendarEvent, Exam, SyllabusTopic } = require('../models/Academic');
const studyPlannerRoutes = require('../routes/studyPlannerRoutes');
const { protect } = require('../middleware/auth');

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

test('study preferences validation rejects absent availability, days, and invalid commitment times', () => {
  const { validatePreferences } = controller._validation;
  assert.throws(() => validatePreferences({}), /between 0.5 and 12 hours/);
  assert.throws(() => validatePreferences({ availableHoursPerDay: 2, studyStartTime: '21:00', studyEndTime: '20:00', sessionMinutes: 45, breakMinutes: 10, studyDays: [1], prioritySubjects: [], commitments: [] }), /valid study time window/);
  assert.throws(() => validatePreferences({ availableHoursPerDay: 2, studyStartTime: '09:00', studyEndTime: '18:00', sessionMinutes: 45, breakMinutes: 10, studyDays: [], prioritySubjects: [], commitments: [] }), /at least one study day/);
});

test('updating a session scopes its lookup to the authenticated owner', async () => {
  const original = StudySession.findOne;
  let filter;
  StudySession.findOne = (value) => { filter = value; return { populate: async () => null }; };
  try {
    let caught;
    await new Promise((resolve) => controller.updateSession({ params: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' } }, {}, (error) => { caught = error; resolve(); }));
    assert.deepEqual(filter, { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', user: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
    assert.equal(caught.statusCode, 404);
  } finally { StudySession.findOne = original; }
});

async function exerciseReschedule(classBlocks) {
  const originals = { sessionOne: StudySession.findOne, sessionMany: StudySession.find, preference: StudyPreferences.findOne, timetable: TimetableEntry.find, calendar: CalendarEvent.find };
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const examDate = new Date(tomorrow); examDate.setUTCDate(examDate.getUTCDate() + 2);
  const day = (tomorrow.getUTCDay() + 6) % 7;
  const date = tomorrow.toISOString().slice(0, 10);
  const session = { _id: 'cccccccccccccccccccccccc', date, startTime: '09:00', durationMinutes: 45, exam: { date: examDate }, status: 'skipped', toObject() { return { _id: this._id, date: this.date, startTime: this.startTime, durationMinutes: this.durationMinutes }; }, async save() {}, async populate() { return this; } };
  StudySession.findOne = () => ({ populate: async () => session });
  StudySession.find = async () => [];
  StudyPreferences.findOne = () => ({ lean: async () => ({ studyDays: [day], studyStartTime: '08:00', studyEndTime: '18:00', commitments: [] }) });
  TimetableEntry.find = async () => classBlocks;
  CalendarEvent.find = async () => [];
  try {
    let payload;
    let caught;
    await new Promise((resolve) => controller.updateSession({ params: { id: session._id }, user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, body: { status: 'planned', date, startTime: '09:00', durationMinutes: 60 } }, { json: (value) => { payload = value; resolve(); } }, (error) => { caught = error; resolve(); }));
    return { payload, caught };
  } finally {
    StudySession.findOne = originals.sessionOne; StudySession.find = originals.sessionMany; StudyPreferences.findOne = originals.preference; TimetableEntry.find = originals.timetable; CalendarEvent.find = originals.calendar;
  }
}

test('rescheduling a skipped session rejects timetable conflicts', async () => {
  const result = await exerciseReschedule([{ startTime: '09:30', endTime: '10:15' }]);
  assert.equal(result.caught.statusCode, 409);
  assert.match(result.caught.message, /overlaps/);
});

test('a skipped session can be moved into a free configured study slot', async () => {
  const result = await exerciseReschedule([]);
  assert.equal(result.caught, undefined);
  assert.equal(result.payload.session.status, 'planned');
  assert.equal(result.payload.session.durationMinutes, 60);
});

test('planner preview and dashboard routes remain protected and expose delete support', () => {
  assert.equal(studyPlannerRoutes.stack[0].handle, protect);
  assert.ok(studyPlannerRoutes.stack.some((layer) => layer.route?.path === '/preview' && layer.route.methods.post));
  assert.ok(studyPlannerRoutes.stack.some((layer) => layer.route?.path === '/dashboard' && layer.route.methods.get));
  assert.ok(studyPlannerRoutes.stack.some((layer) => layer.route?.path === '/sessions/:id' && layer.route.methods.delete));
});

test('study sessions have a unique owner/topic/date index to prevent duplicate sessions', () => {
  const uniqueTopicDate = StudySession.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.topic === 1 && keys.date === 1 && options.unique === true);
  assert.ok(uniqueTopicDate);
});

test('a plan cannot be replaced without an explicit confirmation and preview hash', async () => {
  await assert.rejects(invoke(controller.generate, {
    user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
    body: { confirmed: true },
  }), (error) => error.statusCode === 400 && /Review the proposed changes/.test(error.message));
});

test('dashboard planner query scopes today sessions, nearest exam, and progress to the owner', async (t) => {
  const originals = {
    sessionFind: StudySession.find,
    examFindOne: Exam.findOne,
    preferencesFindOne: StudyPreferences.findOne,
    topicFind: SyllabusTopic.find,
  };
  t.after(() => {
    StudySession.find = originals.sessionFind;
    Exam.findOne = originals.examFindOne;
    StudyPreferences.findOne = originals.preferencesFindOne;
    SyllabusTopic.find = originals.topicFind;
  });
  const userId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const subjectId = 'cccccccccccccccccccccccc';
  const exam = { _id: 'dddddddddddddddddddddddd', title: 'Midterm', subject: { _id: subjectId, name: 'Physics' } };
  let dashboardExam = exam;
  let dashboardSessions = [{ _id: 'session' }];
  let dashboardPreferences = { _id: 'preferences' };
  let sessionFilter;
  let examFilter;
  let topicFilter;
  StudySession.find = (filter) => {
    sessionFilter = filter;
    const query = { populate() { return this; }, sort: async () => dashboardSessions };
    return query;
  };
  Exam.findOne = (filter) => {
    examFilter = filter;
    const query = { populate() { return this; }, sort: async () => dashboardExam };
    return query;
  };
  StudyPreferences.findOne = (filter) => {
    assert.deepEqual(filter, { user: userId });
    return { select: async () => dashboardPreferences };
  };
  SyllabusTopic.find = (filter) => {
    topicFilter = filter;
    return { select: async () => [{ completed: false, progress: 'in-progress' }, { completed: true, progress: 'completed' }] };
  };

  const result = await invoke(controller.getDashboard, { user: { id: userId } });
  assert.deepEqual(sessionFilter, { user: userId, date: result.body.today, status: 'planned' });
  assert.equal(examFilter.user, userId);
  assert.deepEqual(topicFilter, { user: userId, subject: subjectId });
  assert.equal(result.body.sessions.length, 1);
  assert.equal(result.body.nearestExam.title, 'Midterm');
  assert.deepEqual(result.body.preparation, { total: 2, completed: 1, inProgress: 1, percentage: 50 });
  assert.equal(result.body.hasAvailability, true);

  dashboardExam = null;
  dashboardSessions = [];
  dashboardPreferences = null;
  const empty = await invoke(controller.getDashboard, { user: { id: userId } });
  assert.deepEqual(empty.body.sessions, []);
  assert.equal(empty.body.nearestExam, null);
  assert.equal(empty.body.preparation, null);
  assert.equal(empty.body.hasAvailability, false);
});

test('marking a study session completed does not update syllabus progress', async (t) => {
  const originals = { session: StudySession.findOne, preference: StudyPreferences.findOne };
  t.after(() => {
    StudySession.findOne = originals.session;
    StudyPreferences.findOne = originals.preference;
  });
  const today = new Date().toISOString().slice(0, 10);
  const session = {
    _id: 'cccccccccccccccccccccccc', date: today, startTime: '09:00', durationMinutes: 45,
    exam: { date: new Date(`${today}T00:00:00.000Z`) }, status: 'planned',
    async save() { this.saved = true; },
    async populate() { return this; },
    toObject() { return { date: this.date, startTime: this.startTime, durationMinutes: this.durationMinutes }; },
  };
  StudySession.findOne = () => ({ populate: async () => session });
  StudyPreferences.findOne = () => ({ lean: async () => ({ studyDays: [0, 1, 2, 3, 4, 5, 6], studyStartTime: '08:00', studyEndTime: '18:00', commitments: [] }) });
  const result = await invoke(controller.updateSession, {
    params: { id: session._id }, user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, body: { status: 'completed' },
  });
  assert.equal(session.status, 'completed');
  assert.equal(session.saved, true);
  assert.equal(result.body.session.status, 'completed');
  session.status = 'planned';
  await invoke(controller.updateSession, {
    params: { id: session._id }, user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, body: { status: 'skipped' },
  });
  assert.equal(session.status, 'skipped');
});

test('removing a study session is scoped to the authenticated student', async (t) => {
  const original = StudySession.findOneAndDelete;
  t.after(() => { StudySession.findOneAndDelete = original; });
  let filter;
  StudySession.findOneAndDelete = async (value) => { filter = value; return null; };
  await assert.rejects(invoke(controller.deleteSession, {
    params: { id: 'cccccccccccccccccccccccc' }, user: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
  }), (error) => error.statusCode === 404);
  assert.deepEqual(filter, { _id: 'cccccccccccccccccccccccc', user: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
});
