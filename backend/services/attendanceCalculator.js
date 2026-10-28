function calculateAttendance(present, absent, target) {
  const conducted = present + absent;
  const percentage = conducted === 0 ? null : (present / conducted) * 100;
  const belowTarget = percentage !== null && percentage < target;
  const additionalAbsencesAllowed = percentage === null || belowTarget
    ? 0
    : Math.max(0, Math.floor(((present * 100) - (target * conducted)) / target));
  const classesToRecover = belowTarget
    ? Math.ceil(((target * conducted) - (present * 100)) / (100 - target))
    : 0;
  return { conducted, attended: present, missed: absent, percentage, target, additionalAbsencesAllowed, classesToRecover };
}

function projectAttendance(present, absent, futureAttend, futureMiss, target) {
  const projectedPresent = present + futureAttend;
  const projectedConducted = present + absent + futureAttend + futureMiss;
  return {
    attended: projectedPresent,
    conducted: projectedConducted,
    percentage: projectedConducted === 0 ? null : (projectedPresent / projectedConducted) * 100,
    target,
  };
}

function summarizeStatuses(statuses, target) {
  const present = statuses.filter((status) => status === 'present').length;
  const absent = statuses.filter((status) => status === 'absent').length;
  return calculateAttendance(present, absent, target);
}

function attendanceInsight(attendance) {
  if (attendance.percentage === null) return { level: 'no-data', warning: '' };
  if (attendance.percentage < attendance.target) {
    return {
      level: 'below-target',
      warning: `Attendance is ${attendance.percentage.toFixed(1)}%. Attend the next ${attendance.classesToRecover} class${attendance.classesToRecover === 1 ? '' : 'es'} to reach ${attendance.target}%.`,
    };
  }
  if (attendance.additionalAbsencesAllowed <= 2) {
    return {
      level: 'near-target',
      warning: attendance.additionalAbsencesAllowed
        ? `You can miss up to ${attendance.additionalAbsencesAllowed} more class${attendance.additionalAbsencesAllowed === 1 ? '' : 'es'} and remain at or above ${attendance.target}%.`
        : `You cannot miss another class without falling below ${attendance.target}%.`,
    };
  }
  return { level: 'comfortable', warning: '' };
}

module.exports = { calculateAttendance, projectAttendance, summarizeStatuses, attendanceInsight };
