function calculateAttendance(present, absent, target, baseline = { attended: 0, conducted: 0 }) {
  const baseAttended = Number(baseline?.attended) || 0;
  const baseConducted = Number(baseline?.conducted) || 0;
  const attended = present + baseAttended;
  const conducted = present + absent + baseConducted;
  const missed = conducted - attended;
  const percentage = conducted === 0 ? null : (attended / conducted) * 100;
  const belowTarget = percentage !== null && percentage < target;
  const additionalAbsencesAllowed = percentage === null || belowTarget
    ? 0
    : Math.max(0, Math.floor(((attended * 100) - (target * conducted)) / target));
  const classesToRecover = belowTarget
    ? Math.ceil(((target * conducted) - (attended * 100)) / (100 - target))
    : 0;
  const res = {
    conducted,
    attended,
    missed,
    percentage,
    target,
    additionalAbsencesAllowed,
    classesToRecover,
  };
  if (baseAttended || baseConducted) {
    res.baseline = { attended: baseAttended, conducted: baseConducted };
  }
  return res;
}

function projectAttendance(present, absent, futureAttend, futureMiss, target, baseline = { attended: 0, conducted: 0 }) {
  const baseAttended = Number(baseline?.attended) || 0;
  const baseConducted = Number(baseline?.conducted) || 0;
  const projectedPresent = present + baseAttended + futureAttend;
  const projectedConducted = present + absent + baseConducted + futureAttend + futureMiss;
  return {
    attended: projectedPresent,
    conducted: projectedConducted,
    percentage: projectedConducted === 0 ? null : (projectedPresent / projectedConducted) * 100,
    target,
  };
}

function summarizeStatuses(statuses, target, baseline = { attended: 0, conducted: 0 }) {
  const present = statuses.filter((status) => status === 'present').length;
  const absent = statuses.filter((status) => status === 'absent').length;
  return calculateAttendance(present, absent, target, baseline);
}

function attendanceInsight(attendance) {
  if (attendance.percentage === null) return { level: 'no-data', warning: '' };
  if (attendance.percentage < attendance.target) {
    return {
      level: 'below-target',
      warning: `Your attendance is below ${attendance.target}%. Attending today's class is strongly recommended. Attend the next ${attendance.classesToRecover} class${attendance.classesToRecover === 1 ? '' : 'es'} to reach ${attendance.target}%.`,
    };
  }
  if (attendance.additionalAbsencesAllowed <= 2 || attendance.percentage < attendance.target + 5) {
    return {
      level: 'near-target',
      warning: attendance.additionalAbsencesAllowed
        ? `Your attendance is close to the minimum requirement. Try to attend upcoming classes. You can miss up to ${attendance.additionalAbsencesAllowed} more class${attendance.additionalAbsencesAllowed === 1 ? '' : 'es'} and remain at or above ${attendance.target}%.`
        : `Your attendance is close to the minimum requirement. Try to attend upcoming classes. You cannot miss another class without falling below ${attendance.target}%.`,
    };
  }
  return {
    level: 'comfortable',
    warning: `Good! Your attendance is healthy. You can safely miss up to ${attendance.additionalAbsencesAllowed} class${attendance.additionalAbsencesAllowed === 1 ? '' : 'es'} while maintaining your ${attendance.target}% target.`,
  };
}

function toIsoDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function projectSemesterAttendance({
  subject,
  timetableEntries = [],
  calendarEvents = [],
  currentDate,
  actualRecords = [],
  intentions = [],
  target = 75,
}) {
  const baseline = {
    attended: subject.initialAttended || 0,
    conducted: subject.initialConducted || 0,
  };
  const currentActual = summarizeStatuses(
    actualRecords.map((r) => r.status),
    target,
    baseline
  );

  const subjectIdStr = (subject._id || subject.id || subject).toString();

  // Find semester end date
  const semesterEndEvent = calendarEvents.find((e) =>
    e.type === 'semester-end' ||
    (typeof e.title === 'string' && /semester end|term end|last working day/i.test(e.title))
  );

  if (!semesterEndEvent || !semesterEndEvent.date) {
    return {
      subject: { id: subjectIdStr, name: subject.name, code: subject.code },
      ...currentActual,
      remainingScheduledClasses: 0,
      semesterEndConfigured: false,
      semesterEndDate: null,
      projectedFinalAttendance: currentActual.percentage,
      maxPossiblePercentage: currentActual.percentage,
      minPossiblePercentage: currentActual.percentage,
      safeMisses: currentActual.additionalAbsencesAllowed,
    };
  }

  const semesterEndDateStr = toIsoDate(semesterEndEvent.date);
  if (!semesterEndDateStr || semesterEndDateStr <= currentDate) {
    return {
      subject: { id: subjectIdStr, name: subject.name, code: subject.code },
      ...currentActual,
      remainingScheduledClasses: 0,
      semesterEndConfigured: true,
      semesterEndDate: semesterEndDateStr,
      projectedFinalAttendance: currentActual.percentage,
      maxPossiblePercentage: currentActual.percentage,
      minPossiblePercentage: currentActual.percentage,
      safeMisses: currentActual.additionalAbsencesAllowed,
    };
  }

  // Pre-index holidays
  const holidays = calendarEvents
    .filter((e) => e.type === 'holiday')
    .map((e) => {
      const start = toIsoDate(e.date);
      const end = toIsoDate(e.endDate) || start;
      return { start, end };
    });

  const isHoliday = (dateStr) => holidays.some((h) => dateStr >= h.start && dateStr <= h.end);

  // Pre-index cancelled classes
  const cancelledDates = new Set(
    calendarEvents
      .filter((e) => e.type === 'cancelled-class')
      .map((e) => toIsoDate(e.date))
  );

  // Pre-index working Saturdays and special working days
  const workingSaturdays = new Set(
    calendarEvents
      .filter((e) => e.type === 'working-saturday')
      .map((e) => toIsoDate(e.date))
  );

  const specialWorkingDays = new Set(
    calendarEvents
      .filter((e) => e.type === 'special-working-day')
      .map((e) => toIsoDate(e.date))
  );

  // Subject timetable entries
  const matchingEntries = timetableEntries.filter((e) => {
    const sId = (e.subject?._id || e.subject)?.toString();
    return sId === subjectIdStr;
  });

  const weekdayCounts = {};
  matchingEntries.forEach((e) => {
    weekdayCounts[e.weekday] = (weekdayCounts[e.weekday] || 0) + 1;
  });

  // Intentions lookup
  const intentionByDate = new Map();
  intentions.forEach((item) => {
    const sId = (item.timetableEntry?.subject || item.subject)?.toString();
    if (!sId || sId === subjectIdStr) {
      intentionByDate.set(item.date, item.intention);
    }
  });

  // Walk from tomorrow to semesterEndDateStr
  let remainingScheduledClasses = 0;
  let plannedAttended = 0;
  let plannedMissed = 0;
  let uncommittedFuture = 0;

  const cur = new Date(`${currentDate}T00:00:00.000Z`);
  const end = new Date(`${semesterEndDateStr}T00:00:00.000Z`);
  cur.setUTCDate(cur.getUTCDate() + 1);

  while (cur <= end) {
    const curDateStr = cur.toISOString().slice(0, 10);
    const day = cur.getUTCDay();
    const weekday = (day + 6) % 7; // 0=Mon, ..., 6=Sun

    if (!isHoliday(curDateStr) && !cancelledDates.has(curDateStr)) {
      let count = 0;
      if (weekday >= 0 && weekday <= 4) {
        // Monday-Friday: regular classes
        count = weekdayCounts[weekday] || 0;
      } else if (weekday === 5) {
        // Saturday: if working Saturday or explicitly scheduled
        if (workingSaturdays.has(curDateStr)) {
          count = weekdayCounts[5] || weekdayCounts[0] || 1;
        } else if (weekdayCounts[5]) {
          count = weekdayCounts[5];
        }
      } else if (weekday === 6) {
        // Sunday: only if special working day
        if (specialWorkingDays.has(curDateStr)) {
          count = weekdayCounts[0] || 1;
        }
      }

      if (specialWorkingDays.has(curDateStr) && count === 0) {
        count = weekdayCounts[0] || 1;
      }

      if (count > 0) {
        remainingScheduledClasses += count;
        const intention = intentionByDate.get(curDateStr);
        if (intention === 'attend') plannedAttended += count;
        else if (intention === 'miss') plannedMissed += count;
        else uncommittedFuture += count;
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const totalProjectedConducted = currentActual.conducted + remainingScheduledClasses;
  const maxPossiblePercentage = totalProjectedConducted === 0
    ? null
    : ((currentActual.attended + remainingScheduledClasses) / totalProjectedConducted) * 100;
  const minPossiblePercentage = totalProjectedConducted === 0
    ? null
    : (currentActual.attended / totalProjectedConducted) * 100;

  const projectedAttended = currentActual.attended + plannedAttended + uncommittedFuture;
  const projectedFinalAttendance = totalProjectedConducted === 0
    ? null
    : (projectedAttended / totalProjectedConducted) * 100;

  const maxSafeAbsencesInRemaining = totalProjectedConducted === 0
    ? 0
    : Math.max(0, Math.floor(((currentActual.attended + remainingScheduledClasses) * 100 - (target * totalProjectedConducted)) / target));

  return {
    subject: { id: subjectIdStr, name: subject.name, code: subject.code },
    ...currentActual,
    remainingScheduledClasses,
    semesterEndConfigured: true,
    semesterEndDate: semesterEndDateStr,
    projectedFinalAttendance,
    maxPossiblePercentage,
    minPossiblePercentage,
    safeMisses: currentActual.additionalAbsencesAllowed,
    maxSafeAbsencesInRemaining,
  };
}

module.exports = {
  calculateAttendance,
  projectAttendance,
  summarizeStatuses,
  attendanceInsight,
  projectSemesterAttendance,
};
