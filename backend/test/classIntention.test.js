const test = require('node:test');
const assert = require('node:assert/strict');
const { TimetableEntry } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const ClassIntention = require('../models/ClassIntention');
const controller = require('../controllers/attendanceController');
const attendanceRoutes = require('../routes/attendanceRoutes');
const { protect } = require('../middleware/auth');

const id = '507f1f77bcf86cd799439011';
const userId = '507f1f77bcf86cd799439012';
const plannedDate = (() => {
  const date = new Date();
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
})();

test('today and intention endpoints remain behind the existing authentication middleware', () => {
  assert.equal(attendanceRoutes.stack[0].handle, protect);
  assert.ok(attendanceRoutes.stack.some((layer) => layer.route?.path === '/today' && layer.route.methods.get));
  assert.ok(attendanceRoutes.stack.some((layer) => layer.route?.path === '/intentions' && layer.route.methods.put));
  assert.ok(attendanceRoutes.stack.some((layer) => layer.route?.path === '/intentions/:id' && layer.route.methods.delete));
});

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

test('class intention schema has a unique per-user scheduled-entry and date index', () => {
  const index = ClassIntention.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.timetableEntry === 1 && keys.date === 1 && options.unique
  );
  assert.ok(index);
});

test('attendance schema enforces one record per user, scheduled entry, and date', () => {
  const index = Attendance.schema.indexes().find(([keys, options]) =>
    keys.user === 1 && keys.timetableEntry === 1 && keys.date === 1 &&
    options.unique && options.partialFilterExpression?.timetableEntry?.$type === 'objectId'
  );
  assert.ok(index);
});

test('intention creation scopes the timetable lookup and upsert to the authenticated user', async (t) => {
  restore(t, TimetableEntry, 'findOne');
  restore(t, Attendance, 'exists');
  restore(t, ClassIntention, 'findOneAndUpdate');
  TimetableEntry.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: id, user: userId });
    return { weekday: 0 };
  };
  Attendance.exists = async (filter) => {
    assert.deepEqual(filter, { user: userId, timetableEntry: id, date: plannedDate });
    return null;
  };
  ClassIntention.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { user: userId, timetableEntry: id, date: plannedDate });
    assert.deepEqual(update, { $set: { intention: 'attend' } });
    assert.equal(options.upsert, true);
    return { intention: 'attend' };
  };

  const result = await invoke(controller.setIntention, {
    user: { id: userId },
    body: { timetableEntry: id, date: plannedDate, intention: 'attend' },
  });
  assert.equal(result.body.plan.intention, 'attend');
});

test('intention creation rejects another user’s timetable entry', async (t) => {
  restore(t, TimetableEntry, 'findOne');
  TimetableEntry.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: id, user: userId });
    return null;
  };
  await assert.rejects(invoke(controller.setIntention, {
    user: { id: userId },
    body: { timetableEntry: id, date: plannedDate, intention: 'miss' },
  }), (error) => error.statusCode === 404);
});

test('intention cannot be created when actual attendance already exists', async (t) => {
  restore(t, TimetableEntry, 'findOne');
  restore(t, Attendance, 'exists');
  restore(t, ClassIntention, 'findOneAndUpdate');
  TimetableEntry.findOne = async () => ({ weekday: 0 });
  Attendance.exists = async () => ({ _id: id });
  ClassIntention.findOneAndUpdate = () => assert.fail('Must not create a plan after actual attendance exists.');
  await assert.rejects(invoke(controller.setIntention, {
    user: { id: userId },
    body: { timetableEntry: id, date: plannedDate, intention: 'miss' },
  }), (error) => error.statusCode === 409);
});

test('duplicate scheduled attendance is returned as a conflict', async (t) => {
  const Subject = require('../models/Academic').Subject;
  restore(t, Subject, 'findOne');
  restore(t, Attendance, 'create');
  Subject.findOne = async (filter) => {
    assert.deepEqual(filter, { _id: id, user: userId });
    return { _id: id };
  };
  Attendance.create = async () => { throw Object.assign(new Error('duplicate key'), { code: 11000 }); };
  await assert.rejects(invoke(controller.createRecord, {
    user: { id: userId },
    body: { subject: id, date: '2020-01-06', status: 'present' },
  }), (error) => error.statusCode === 409);
});

test('deleting a class intention is scoped to the authenticated user', async (t) => {
  restore(t, ClassIntention, 'findOneAndDelete');
  ClassIntention.findOneAndDelete = async (filter) => {
    assert.deepEqual(filter, { _id: id, user: userId });
    return null;
  };
  await assert.rejects(invoke(controller.deleteIntention, {
    user: { id: userId },
    params: { id },
  }), (error) => error.statusCode === 404);
});
