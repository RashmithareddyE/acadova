const { attendanceInsight, summarizeStatuses, projectAttendance } = require('./attendanceCalculator');

function buildTodayDashboard({ date, weekday, target, entries, holiday, exams, subjects, records, classRecords, intentions }) {
  const summaries = subjects.map((subject) => {
    const baseline = {
      attended: subject.initialAttended || 0,
      conducted: subject.initialConducted || 0,
    };
    const actual = summarizeStatuses(
      records.filter((record) => (record.subject?._id || record.subject)?.toString() === (subject._id || subject.id)?.toString()).map((record) => record.status),
      target,
      baseline
    );
    return {
      subject: { id: subject._id || subject.id, name: subject.name, code: subject.code },
      ...actual,
      ...attendanceInsight(actual),
    };
  });
  const summaryBySubject = new Map(summaries.map((summary) => [String(summary.subject.id), summary]));
  const recordByEntry = new Map(classRecords.map((record) => [String(record.timetableEntry), record]));
  const intentionByEntry = new Map(intentions.map((item) => [String(item.timetableEntry), item]));
  const classes = holiday ? [] : entries.filter((entry) => entry.subject).map((entry) => {
    const entryId = String(entry._id || entry.id);
    const subjectId = String(entry.subject._id || entry.subject.id || entry.subject);
    const record = recordByEntry.get(entryId) || null;
    const intention = intentionByEntry.get(entryId) || null;
    const summary = summaryBySubject.get(subjectId) || null;

    let projectedIfAttend = null;
    let projectedIfMiss = null;
    if (summary) {
      const projAtt = projectAttendance(summary.attended, summary.missed, 1, 0, target);
      const projMiss = projectAttendance(summary.attended, summary.missed, 0, 1, target);
      projectedIfAttend = projAtt.percentage;
      projectedIfMiss = projMiss.percentage;
    }

    return {
      timetableEntry: entry,
      subject: entry.subject,
      record,
      plan: intention,
      attendance: summary ? {
        ...summary,
        projectedIfAttend,
        projectedIfMiss,
      } : null,
      faculty: entry.teacher || entry.subject?.teacher || '',
      location: entry.location || '',
    };
  });

  return {
    date,
    weekday,
    isHoliday: Boolean(holiday),
    holiday: holiday ? { title: holiday.title, description: holiday.description, endDate: holiday.endDate } : null,
    target,
    classes,
    summaries,
    upcomingExams: exams,
    upcomingAssignments: [],
  };
}

module.exports = { buildTodayDashboard };
