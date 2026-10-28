const test = require('node:test');
const assert = require('node:assert/strict');
const academicController = require('../controllers/academicController');
const { Subject, SyllabusTopic, Exam } = require('../models/Academic');

const userId = '507f1f77bcf86cd799439012';
const subjectId = '507f1f77bcf86cd799439011';

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

test('syllabus progress supports all states and synchronizes the legacy completed flag', async (t) => {
  const originalSubjectExists = Subject.exists;
  const originalTopicExists = SyllabusTopic.exists;
  const originalCreate = SyllabusTopic.create;
  t.after(() => {
    Subject.exists = originalSubjectExists;
    SyllabusTopic.exists = originalTopicExists;
    SyllabusTopic.create = originalCreate;
  });
  Subject.exists = async () => true;
  SyllabusTopic.exists = async () => false;
  const inserted = [];
  SyllabusTopic.create = async (values) => {
    const record = { ...values, async populate() { return this; } };
    inserted.push(record);
    return record;
  };

  for (const [progress, completed] of [['not-started', false], ['in-progress', false], ['completed', true]]) {
    await invoke(academicController.controller('syllabus').create, {
      user: { id: userId },
      body: { subject: subjectId, unit: 'Unit 1', topic: `Topic ${progress}`, progress },
    });
    assert.equal(inserted.at(-1).progress, progress);
    assert.equal(inserted.at(-1).completed, completed);
    assert.equal(inserted.at(-1).user, userId);
  }
});

test('invalid syllabus progress is rejected before database access', async () => {
  await assert.rejects(invoke(academicController.controller('syllabus').create, {
    user: { id: userId },
    body: { subject: subjectId, unit: 'Unit 1', topic: 'Topic', progress: 'planned' },
  }), (error) => error.statusCode === 400);
});

test('syllabus progress updates keep the legacy completed flag synchronized', async (t) => {
  const originals = { subjectExists: Subject.exists, topicExists: SyllabusTopic.exists, findOne: SyllabusTopic.findOne };
  t.after(() => {
    Subject.exists = originals.subjectExists;
    SyllabusTopic.exists = originals.topicExists;
    SyllabusTopic.findOne = originals.findOne;
  });
  Subject.exists = async () => true;
  SyllabusTopic.exists = async () => false;
  const record = {
    subject: subjectId, unit: 'Unit 1', topic: 'Topic', completed: false, progress: 'not-started',
    toObject() { return { ...this }; },
    async save() { this.saved = true; },
    async populate() { return this; },
  };
  SyllabusTopic.findOne = async () => record;
  await invoke(academicController.controller('syllabus').update, {
    user: { id: userId }, params: { id: '507f1f77bcf86cd799439013' },
    body: { progress: 'in-progress' },
  });
  assert.equal(record.progress, 'in-progress');
  assert.equal(record.completed, false);
  assert.equal(record.saved, true);
});

test('exam schema validates paired times and chronological ranges', async () => {
  const base = { user: userId, subject: subjectId, title: 'Midterm', type: 'midterm', date: new Date('2027-01-10') };
  const valid = new Exam({ ...base, startTime: '09:00', endTime: '10:00' });
  await valid.validate();

  const unpaired = new Exam({ ...base, startTime: '09:00' });
  await assert.rejects(unpaired.validate(), /Enter both exam times/);
  const reversed = new Exam({ ...base, startTime: '11:00', endTime: '10:00' });
  await assert.rejects(reversed.validate(), /End time must be after start time/);
});
