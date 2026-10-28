import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickTask } from '../src/lib/quickTask.js';

const today = new Date(2026, 9, 27, 12);

test('parses today and tomorrow and removes date phrase from task title', () => {
  assert.deepEqual(parseQuickTask('Submit DBMS assignment tomorrow', today), {
    title: 'Submit DBMS assignment', dueDate: '2026-10-28', dateIssue: '',
  });
  assert.deepEqual(parseQuickTask('Study today', today), {
    title: 'Study', dueDate: '2026-10-27', dateIssue: '',
  });
});

test('parses specific day and month using the current year when unambiguous', () => {
  assert.deepEqual(parseQuickTask('Complete Computer Networks notes by 30 October', today), {
    title: 'Complete Computer Networks notes', dueDate: '2026-10-30', dateIssue: '',
  });
});

test('parses explicit day/month/year numeric date', () => {
  assert.deepEqual(parseQuickTask('Submit assignment due 30/10/2026', today), {
    title: 'Submit assignment', dueDate: '2026-10-30', dateIssue: '',
  });
});

test('leaves unknown or ambiguous dates blank for manual selection', () => {
  assert.equal(parseQuickTask('Review chapter 4 sometime soon', today).dueDate, '');
  assert.match(parseQuickTask('Submit report by 10/11/2026', today).dateIssue, /two different dates/);
  assert.match(parseQuickTask('Submit report by 31/02/2026', today).dateIssue, /not valid/);
});

test('requires a title and does not infer a year for a past month/day date', () => {
  assert.deepEqual(parseQuickTask('', today), { title: '', dueDate: '', dateIssue: 'Enter a task and choose its due date.' });
  assert.equal(parseQuickTask('Read notes 5 January', today).dueDate, '');
});
