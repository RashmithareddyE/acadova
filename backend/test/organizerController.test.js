const test = require('node:test');
const assert = require('node:assert/strict');
const OrganizerTask = require('../models/OrganizerTask');
const controller = require('../controllers/organizerController');
const organizerRoutes = require('../routes/organizerRoutes');
const { protect } = require('../middleware/auth');

const userId = '507f1f77bcf86cd799439012';
const taskId = '507f1f77bcf86cd799439011';

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

function restore(t, method) {
  const original = OrganizerTask[method];
  t.after(() => { OrganizerTask[method] = original; });
}

test('organizer routes use authentication middleware for every task operation', () => {
  assert.equal(organizerRoutes.stack[0].handle, protect);
  assert.ok(organizerRoutes.stack.some((layer) => layer.route?.path === '/' && layer.route.methods.get && layer.route.methods.post));
  assert.ok(organizerRoutes.stack.some((layer) => layer.route?.path === '/:id' && layer.route.methods.put && layer.route.methods.delete));
});

test('creating a task validates fields and stores the authenticated owner', async (t) => {
  restore(t, 'create');
  let inserted;
  OrganizerTask.create = async (values) => { inserted = values; return { _id: taskId, ...values }; };
  const result = await invoke(controller.createTask, {
    user: { id: userId },
    body: { title: '  Submit DBMS assignment ', category: 'assignment', dueDate: '2026-10-30', dueTime: '', priority: 'high', user: '507f1f77bcf86cd799439099' },
  });
  assert.equal(result.statusCode, 201);
  assert.equal(inserted.user, userId);
  assert.equal(inserted.title, 'Submit DBMS assignment');
  assert.notEqual(inserted.user, '507f1f77bcf86cd799439099');
  assert.equal(result.body.task.priority, 'high');
});

test('missing, empty, and invalid task values are rejected', () => {
  const { validateTask } = controller._validation;
  assert.throws(() => validateTask({ dueDate: '2026-10-30' }), /task title/);
  assert.throws(() => validateTask({ title: '  ', dueDate: '2026-10-30' }), /task title/);
  assert.throws(() => validateTask({ title: 'Task', dueDate: '2026-02-30' }), /valid due date/);
  assert.throws(() => validateTask({ title: 'Task', dueDate: '2026-10-30', dueTime: '25:00' }), /valid due time/);
  assert.throws(() => validateTask({ title: 'Task', dueDate: '2026-10-30', category: 'exam' }), /category/);
  assert.throws(() => validateTask({ title: 'Task', dueDate: '2026-10-30', priority: 'urgent' }), /priority/);
});

test('task listing scopes data to the owner and applies overdue filters', async (t) => {
  restore(t, 'find');
  let query;
  const expectedTasks = [{ _id: taskId, title: 'Past assignment' }];
  OrganizerTask.find = (filter) => {
    query = filter;
    return { sort: async () => expectedTasks };
  };
  const result = await invoke(controller.listTasks, {
    user: { id: userId },
    query: { view: 'overdue', date: '2026-10-27', category: 'assignment' },
  });
  assert.deepEqual(query, { user: userId, status: 'pending', dueDate: { $lt: '2026-10-27' }, category: 'assignment' });
  assert.deepEqual(result.body.tasks, expectedTasks);
});

test('today and upcoming filters exclude completed tasks', async (t) => {
  restore(t, 'find');
  const queries = [];
  OrganizerTask.find = (filter) => {
    queries.push(filter);
    return { sort: async () => [] };
  };
  await invoke(controller.listTasks, { user: { id: userId }, query: { view: 'today', date: '2026-10-27' } });
  await invoke(controller.listTasks, { user: { id: userId }, query: { view: 'upcoming', date: '2026-10-27' } });
  assert.deepEqual(queries, [
    { user: userId, status: 'pending', dueDate: '2026-10-27' },
    { user: userId, status: 'pending', dueDate: { $gt: '2026-10-27' } },
  ]);
});

test('completed view remains owner-scoped and only returns completed tasks', async (t) => {
  restore(t, 'find');
  let filter;
  OrganizerTask.find = (value) => { filter = value; return { sort: async () => [] }; };
  await invoke(controller.listTasks, {
    user: { id: userId }, query: { view: 'completed', status: 'pending', date: '2026-10-27' },
  });
  assert.deepEqual(filter, { user: userId, status: 'completed' });
});

test('dashboard task query returns only owner-scoped pending groups and limits upcoming preview', async (t) => {
  restore(t, 'find');
  const queries = [];
  OrganizerTask.find = (filter) => {
    queries.push(filter);
    return {
      sort() {
        return {
          limit: async (count) => {
            assert.equal(count, 5);
            return [];
          },
          then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
        };
      },
    };
  };
  const result = await invoke(controller.listTasks, {
    user: { id: userId }, query: { view: 'dashboard', date: '2026-10-27' },
  });
  assert.deepEqual(queries, [
    { user: userId, status: 'pending', dueDate: '2026-10-27' },
    { user: userId, status: 'pending', dueDate: { $lt: '2026-10-27' } },
    { user: userId, status: 'pending', dueDate: { $gt: '2026-10-27' } },
  ]);
  assert.deepEqual(result.body.tasks, { today: [], overdue: [], upcoming: [] });
});

test('task can be completed and reopened by updating the owner-scoped record', async (t) => {
  restore(t, 'findOneAndUpdate');
  const updates = [];
  OrganizerTask.findOneAndUpdate = async (...args) => { updates.push(args); return { _id: taskId, status: args[1].$set.status }; };
  const completed = await invoke(controller.updateTask, {
    params: { id: taskId }, user: { id: userId }, body: { status: 'completed' },
  });
  const reopened = await invoke(controller.updateTask, {
    params: { id: taskId }, user: { id: userId }, body: { status: 'pending' },
  });
  assert.deepEqual(updates[0][0], { _id: taskId, user: userId });
  assert.equal(completed.body.task.status, 'completed');
  assert.equal(reopened.body.task.status, 'pending');
});

test('editing task details only updates the submitted fields on the owner record', async (t) => {
  restore(t, 'findOneAndUpdate');
  let filter;
  let update;
  OrganizerTask.findOneAndUpdate = async (value, changes) => {
    filter = value; update = changes;
    return { _id: taskId, title: changes.$set.title, dueDate: changes.$set.dueDate };
  };
  const result = await invoke(controller.updateTask, {
    params: { id: taskId }, user: { id: userId }, body: { title: 'Revised title', dueDate: '2026-11-02' },
  });
  assert.deepEqual(filter, { _id: taskId, user: userId });
  assert.deepEqual(update, { $set: { title: 'Revised title', dueDate: '2026-11-02' } });
  assert.equal(result.body.task.title, 'Revised title');
});

test('task can be deleted by its owner', async (t) => {
  restore(t, 'findOneAndDelete');
  OrganizerTask.findOneAndDelete = async (filter) => {
    assert.deepEqual(filter, { _id: taskId, user: userId });
    return { _id: taskId };
  };
  const result = await invoke(controller.deleteTask, {
    params: { id: taskId }, user: { id: userId },
  });
  assert.deepEqual(result.body, { success: true });
});

test('editing title and deleting tasks cannot target another user’s record', async (t) => {
  restore(t, 'findOneAndUpdate');
  restore(t, 'findOneAndDelete');
  let updateFilter;
  let deleteFilter;
  OrganizerTask.findOneAndUpdate = async (filter) => { updateFilter = filter; return null; };
  OrganizerTask.findOneAndDelete = async (filter) => { deleteFilter = filter; return null; };
  await assert.rejects(invoke(controller.updateTask, {
    params: { id: taskId }, user: { id: userId }, body: { title: 'Changed title' },
  }), (error) => error.statusCode === 404);
  await assert.rejects(invoke(controller.deleteTask, {
    params: { id: taskId }, user: { id: userId },
  }), (error) => error.statusCode === 404);
  assert.deepEqual(updateFilter, { _id: taskId, user: userId });
  assert.deepEqual(deleteFilter, { _id: taskId, user: userId });
});
