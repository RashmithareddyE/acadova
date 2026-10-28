const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAttendance, projectAttendance, summarizeStatuses, attendanceInsight } = require('../services/attendanceCalculator');

test('zero classes has no percentage and no absence allowance', () => {
  assert.deepEqual(calculateAttendance(0, 0, 75), {
    conducted: 0, attended: 0, missed: 0, percentage: null, target: 75,
    additionalAbsencesAllowed: 0, classesToRecover: 0,
  });
});

test('at target has no additional absence allowance and needs no recovery', () => {
  const result = calculateAttendance(3, 1, 75);
  assert.equal(result.percentage, 75);
  assert.equal(result.additionalAbsencesAllowed, 0);
  assert.equal(result.classesToRecover, 0);
});

test('above target computes the exact safe absence allowance', () => {
  const result = calculateAttendance(9, 1, 75);
  assert.equal(result.percentage, 90);
  assert.equal(result.additionalAbsencesAllowed, 2);
});

test('below target never reports positive absences and calculates recovery classes', () => {
  const result = calculateAttendance(6, 3, 75);
  assert.equal(result.percentage, 66.66666666666666);
  assert.equal(result.additionalAbsencesAllowed, 0);
  assert.equal(result.classesToRecover, 3);
  assert.ok((6 + result.classesToRecover) / (9 + result.classesToRecover) * 100 >= 75);
});

test('recovery calculation supports an 80 percent target', () => {
  assert.equal(calculateAttendance(3, 2, 80).classesToRecover, 5);
});

test('projection is deterministic and separate from source counts', () => {
  const result = projectAttendance(6, 2, 2, 1, 75);
  assert.deepEqual(result, { attended: 8, conducted: 11, percentage: (8 / 11) * 100, target: 75 });
});

test('zero future and actual classes remains undefined instead of dividing by zero', () => {
  assert.equal(projectAttendance(0, 0, 0, 0, 80).percentage, null);
});

test('cancelled sessions are excluded from conducted and attended totals', () => {
  const result = summarizeStatuses(['present', 'absent', 'cancelled', 'cancelled'], 75);
  assert.equal(result.conducted, 2);
  assert.equal(result.attended, 1);
  assert.equal(result.missed, 1);
  assert.equal(result.percentage, 50);
});

test('exact-target and above-target allowance follows the additional-absence formula', () => {
  assert.equal(calculateAttendance(12, 4, 75).additionalAbsencesAllowed, 0);
  assert.equal(calculateAttendance(18, 2, 75).additionalAbsencesAllowed, 4);
  assert.equal(calculateAttendance(8, 2, 80).additionalAbsencesAllowed, 0);
});

test('recovery count is the minimum consecutive attendance count', () => {
  const result = calculateAttendance(4, 4, 80);
  assert.equal(result.classesToRecover, 12);
  assert.ok((result.attended + result.classesToRecover) / (result.conducted + result.classesToRecover) >= 0.8);
  assert.ok((result.attended + result.classesToRecover - 1) / (result.conducted + result.classesToRecover - 1) < 0.8);
});

test('projected misses remain separate and cancelled records do not affect a projection', () => {
  const actual = summarizeStatuses(['present', 'cancelled', 'present'], 75);
  const result = projectAttendance(actual.attended, actual.missed, 0, 1, 75);
  assert.deepEqual(result, { attended: 2, conducted: 3, percentage: (2 / 3) * 100, target: 75 });
});

test('attendance insights distinguish below, near, comfortable, and no-data states', () => {
  assert.equal(attendanceInsight(calculateAttendance(6, 3, 75)).level, 'below-target');
  assert.equal(attendanceInsight(calculateAttendance(9, 1, 75)).level, 'near-target');
  assert.equal(attendanceInsight(calculateAttendance(18, 2, 75)).level, 'comfortable');
  assert.equal(attendanceInsight(calculateAttendance(0, 0, 75)).level, 'no-data');
});

test('attendance warnings only recommend mathematically valid recovery or safe misses', () => {
  const below = attendanceInsight(calculateAttendance(6, 3, 75));
  assert.match(below.warning, /Attend the next 3 classes/);
  const near = attendanceInsight(calculateAttendance(9, 1, 75));
  assert.match(near.warning, /miss up to 2 more classes/);
  assert.doesNotMatch(below.warning, /miss/);
});
