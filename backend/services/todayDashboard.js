const { attendanceInsight, summarizeStatuses } = require('./attendanceCalculator');

function buildTodayDashboard({ date, weekday, target, entries, holiday, exams, subjects, records, classRecords, intentions }) {
  const summaries = subjects.map((subject) => {
    const actual = summarizeStatuses(
      records.filter((record) => record.subject.toString() === subject._id.toString()).map((record) => record.status),
      target
    );
    return {
      subject: { id: subject.id, name: subject.name, code: subject.code },
      ...actual,
      ...attendanceInsight(actual),
    };
  });
  const summaryBySubject = new Map(summaries.map((summary) => [summary.subject.id, summary]));
  const recordByEntry = new Map(classRecords.map((record) => [record.timetableEntry.toString(), record]));
  const intentionByEntry = new Map(intentions.map((item) => [item.timetableEntry.toString(), item]));
  const classes = entries.filter((entry) => entry.subject).map((entry) => {
    const record = recordByEntry.get(entry._id.toString()) || null;
    const intention = intentionByEntry.get(entry._id.toString()) || null;
    return {
      timetableEntry: entry,
      subject: entry.subject,
      record,
      plan: intention,
      attendance: summaryBySubject.get(entry.subject._id.toString()) || null,
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
