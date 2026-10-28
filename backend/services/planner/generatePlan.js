const WEEKDAY = (date) => (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const fromMinutes = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dateString = (date) => date.toISOString().slice(0, 10);
const id = (value) => String(value?._id || value?.id || value);

function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

function generatePlan({ exams, topics, timetable, calendar = [], assignments = [], preferences, existingSessions = [], today = dateString(new Date()) }) {
  const upcoming = [...exams].filter((exam) => dateString(new Date(exam.date)) >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
  const examBySubject = new Map();
  upcoming.forEach((exam) => {
    const subjectId = id(exam.subject);
    if (!examBySubject.has(subjectId)) examBySubject.set(subjectId, exam);
  });
  const priority = new Set((preferences.prioritySubjects || []).map(id));
  const work = [];
  const subjectsWithoutSyllabus = [];
  for (const [subjectId, exam] of examBySubject) {
    const subjectTopics = topics.filter((topic) => id(topic.subject) === subjectId);
    if (!subjectTopics.length) {
      subjectsWithoutSyllabus.push({ subject: exam.subject?.name || 'Subject', exam: exam.title });
      continue;
    }
    subjectTopics.filter((topic) => !topic.completed && topic.progress !== 'completed').forEach((topic) => work.push({
      exam, topic, subjectId, priority: priority.has(subjectId) ? 1 : 0,
    }));
  }

  const availableHours = Number(preferences.availableHoursPerDay);
  const sessionMinutes = Number(preferences.sessionMinutes);
  const maxStudyMinutes = Math.floor(availableHours * 60);
  const windowStart = toMinutes(preferences.studyStartTime);
  const windowEnd = toMinutes(preferences.studyEndTime);
  const startDate = new Date(`${today}T00:00:00.000Z`);
  const lastExam = upcoming.length ? new Date(upcoming[upcoming.length - 1].date) : null;
  const horizonDays = lastExam ? Math.max(0, Math.ceil((lastExam - startDate) / 86400000)) : 0;
  const boundedDays = Math.min(horizonDays, 370);
  const horizonEnd = new Date(startDate); if (boundedDays > 0) horizonEnd.setUTCDate(horizonEnd.getUTCDate() + boundedDays - 1);
  const sessions = [];
  const assignmentsToday = new Map();
  const blockedByDate = new Map();
  const allDayByDate = new Set();
  const assignmentDates = new Set();

  for (const event of calendar) {
    const eventStart = dateString(new Date(event.date));
    const eventEnd = event.endDate ? dateString(new Date(event.endDate)) : eventStart;
    const from = eventStart < today ? today : eventStart;
    const to = eventEnd > dateString(horizonEnd) ? dateString(horizonEnd) : eventEnd;
    if (from > to || to < today || from > dateString(horizonEnd)) continue;
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) { allDayByDate.add(dateString(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  }
  for (const assignment of assignments) {
    if (assignment.status !== 'pending' || assignment.category !== 'assignment' || assignment.dueDate < today || assignment.dueDate > dateString(horizonEnd)) continue;
    allDayByDate.add(assignment.dueDate);
    assignmentDates.add(assignment.dueDate);
  }
  for (const session of existingSessions.filter((item) => item.status !== 'planned' && item.date >= today)) {
    const blocks = blockedByDate.get(session.date) || [];
    blocks.push({ start: toMinutes(session.startTime), end: toMinutes(session.startTime) + session.durationMinutes });
    blockedByDate.set(session.date, blocks);
  }

  const loggedTopicDates = new Set(existingSessions
    .filter((item) => item.status !== 'planned')
    .map((item) => `${id(item.topic)}:${item.date}`));
  const sortedWork = () => work.filter((item) => !item.assigned).sort((a, b) => new Date(a.exam.date) - new Date(b.exam.date) || b.priority - a.priority || String(a.topic.topic).localeCompare(String(b.topic.topic)));
  for (let offset = 0; offset < boundedDays && work.some((item) => !item.assigned); offset += 1) {
    const date = new Date(startDate); date.setUTCDate(date.getUTCDate() + offset);
    const day = dateString(date); const weekday = WEEKDAY(day);
    if (!(preferences.studyDays || []).includes(weekday) || allDayByDate.has(day) || windowEnd <= windowStart) continue;
    const blocks = [...(blockedByDate.get(day) || [])];
    timetable.filter((entry) => entry.weekday === weekday).forEach((entry) => blocks.push({ start: toMinutes(entry.startTime), end: toMinutes(entry.endTime) }));
    (preferences.commitments || []).filter((entry) => entry.weekday === weekday).forEach((entry) => blocks.push({ start: toMinutes(entry.startTime), end: toMinutes(entry.endTime) }));
    let cursor = windowStart; let focusMinutes = 0;
    const countToday = new Map();
    while (focusMinutes + sessionMinutes <= maxStudyMinutes) {
      const candidates = sortedWork().filter((item) =>
        day < dateString(new Date(item.exam.date)) &&
        !loggedTopicDates.has(`${id(item.topic)}:${day}`) &&
        (countToday.get(item.subjectId) || 0) < 2
      );
      if (!candidates.length) break;
      let slot = null;
      while (cursor + sessionMinutes <= windowEnd) {
        const conflict = blocks.filter((block) => overlaps({ start: cursor, end: cursor + sessionMinutes }, block)).sort((a, b) => a.end - b.end)[0];
        if (!conflict) { slot = { start: cursor, end: cursor + sessionMinutes }; break; }
        cursor = conflict.end;
      }
      if (!slot) break;
      const item = candidates[0];
      sessions.push({ exam: item.exam, subject: item.exam.subject, topic: item.topic, topicLabel: item.topic.topic, date: day, startTime: fromMinutes(slot.start), durationMinutes: sessionMinutes, status: 'planned', generated: true });
      item.assigned = true; focusMinutes += sessionMinutes;
      countToday.set(item.subjectId, (countToday.get(item.subjectId) || 0) + 1);
      blocks.push(slot); blocks.sort((a, b) => a.start - b.start);
      cursor = slot.end + Number(preferences.breakMinutes || 0);
    }
  }
  const unscheduledTopics = work.filter((item) => !item.assigned).map((item) => ({ subject: item.exam.subject?.name || 'Subject', topic: item.topic.topic, examDate: dateString(new Date(item.exam.date)) }));
  return {
    sessions,
    summary: {
      upcomingExams: upcoming.length,
      unfinishedTopics: work.length,
      scheduledTopics: sessions.length,
      unscheduledTopics,
      subjectsWithoutSyllabus,
      assignmentDueDates: [...assignmentDates].sort(),
      limitedHorizon: horizonDays > 370,
    },
  };
}

function slotConflicts(start, duration, blocks) {
  const candidate = { start: toMinutes(start), end: toMinutes(start) + duration };
  return blocks.some((block) => overlaps(candidate, block));
}

module.exports = { generatePlan, slotConflicts, toMinutes, fromMinutes, dateString, WEEKDAY };
