const { Subject, TimetableEntry, Exam, SyllabusTopic } = require('../models/Academic');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const OrganizerTask = require('../models/OrganizerTask');
const { StudySession } = require('../models/StudyPlanner');
const { summarizeStatuses, attendanceInsight } = require('./attendanceCalculator');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY = () => new Date();

function normalize(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
}

function formatPercentage(value) {
  return value === null || value === undefined ? 'No data' : `${Number(value).toFixed(1)}%`;
}

function subjectLabel(subject) {
  if (!subject) return 'your subject';
  const name = subject.name || 'Unknown';
  return subject.code ? `${name} (${subject.code})` : name;
}

function getTodayClasses(entries) {
  const now = TODAY();
  const weekday = (now.getDay() + 6) % 7;
  return entries
    .filter((entry) => Number(entry.weekday) === weekday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function getExamDaysRemaining(dateValue) {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const examDate = new Date(`${dateValue}T00:00:00.000Z`);
  return Math.max(0, Math.ceil((examDate - today) / 86400000));
}

function findSubjectMatch(question, subjects) {
  const normalizedQuestion = normalize(question);
  const exact = subjects.filter((subject) => {
    const haystacks = [subject.name, subject.code, `${subject.name} ${subject.code}`];
    return haystacks.some((value) => normalize(value) && normalizedQuestion.includes(normalize(value)));
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return 'ambiguous';

  const tokens = normalizedQuestion.split(' ');
  const candidate = subjects.find((subject) => {
    const parts = [subject.name, subject.code].flatMap((value) => normalize(value).split(' '));
    return tokens.some((token) => token.length > 2 && parts.includes(token));
  });
  return candidate || null;
}

function buildAttendanceAnswer(subject, summary, target) {
  if (!summary || summary.percentage === null) {
    return `${subjectLabel(subject)} has no confirmed attendance records yet.`;
  }
  if (summary.classesToRecover > 0) {
    return `${subjectLabel(subject)} is at ${formatPercentage(summary.percentage)}. Attend ${summary.classesToRecover} more class${summary.classesToRecover === 1 ? '' : 'es'} to reach ${target}%.`;
  }
  if (summary.percentage >= target) {
    return `${subjectLabel(subject)} is at ${formatPercentage(summary.percentage)} and is already meeting your ${target}% target.`;
  }
  return `${subjectLabel(subject)} is at ${formatPercentage(summary.percentage)}. You can miss up to ${summary.additionalAbsencesAllowed} more class${summary.additionalAbsencesAllowed === 1 ? '' : 'es'} and stay above ${target}%.`;
}

async function buildContext(userId) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [subjects, timetable, attendanceRecords, exams, syllabusTopics, studySessions, tasks, user] = await Promise.all([
    Subject.find({ user: userId }).sort({ name: 1 }).lean(),
    TimetableEntry.find({ user: userId }).populate('subject', 'name code').sort({ weekday: 1, startTime: 1 }).lean(),
    Attendance.find({ user: userId }).populate('subject', 'name code').sort({ date: -1 }).lean(),
    Exam.find({ user: userId }).populate('subject', 'name code').sort({ date: 1, startTime: 1 }).lean(),
    SyllabusTopic.find({ user: userId }).populate('subject', 'name code').sort({ unit: 1, topic: 1 }).lean(),
    StudySession.find({ user: userId, date: todayIso, status: 'planned' }).populate('subject', 'name code').populate('exam', 'title date type').populate('topic', 'unit topic').sort({ startTime: 1 }).lean(),
    OrganizerTask.find({ user: userId, status: 'pending' }).sort({ dueDate: 1, dueTime: 1 }).lean(),
    User.findById(userId).select('attendanceTarget').lean(),
  ]);

  return {
    subjects,
    timetable,
    attendanceRecords,
    exams,
    syllabusTopics,
    studySessions,
    tasks,
    target: user?.attendanceTarget || 75,
  };
}

async function askAcademicQuestion({ userId, question }) {
  if (typeof question !== 'string' || !question.trim()) {
    return {
      intent: 'clarify',
      answer: 'Ask me about today\'s classes, attendance, exams, assignments, syllabus progress, or study plan.',
      actions: [{ label: 'Open dashboard', to: '/dashboard' }],
    };
  }

  const context = await buildContext(userId);
  const text = question.trim();
  const normalized = normalize(text);

  if (/(how do i use acadova|what can you do|how to use|help me)/i.test(text)) {
    return {
      intent: 'usage',
      answer: 'I can help you check today\'s classes, attendance, upcoming exams, pending tasks, syllabus progress, and today\'s study sessions. Try asking: “What classes do I have today?” or “What is my DBMS attendance?”',
      actions: [{ label: 'View dashboard', to: '/dashboard' }, { label: 'Open Study Planner', to: '/study-planner' }],
    };
  }

  const subjectMatch = findSubjectMatch(text, context.subjects);
  if ((/(attendance|attend|miss|target|75|80)/i.test(text) && !/(how do i use acadova|what can you do|how to use|help me)/i.test(text))) {
    if (!context.subjects.length) {
      return {
        intent: 'attendance',
        answer: 'There are no subjects configured yet. Add subjects first, then I can check their attendance.',
        actions: [{ label: 'Open subjects', to: '/subjects' }],
      };
    }

    if (!subjectMatch && context.subjects.length > 1 && /(?:attendance|attend|miss|target|classes can i miss|more classes)/i.test(text)) {
      return {
        intent: 'clarify',
        answer: `Which subject do you mean? I can check ${context.subjects.map((subject) => subjectLabel(subject)).join(', ')}.`,
        actions: context.subjects.slice(0, 3).map((subject) => ({ label: subjectLabel(subject), to: '/attendance' })),
      };
    }

    const selectedSubject = subjectMatch === 'ambiguous' ? null : (subjectMatch || context.subjects[0]);
    if (!selectedSubject) {
      return {
        intent: 'clarify',
        answer: 'I can check attendance for one subject at a time. Which subject would you like me to review?',
        actions: context.subjects.slice(0, 4).map((subject) => ({ label: subjectLabel(subject), to: '/attendance' })),
      };
    }

    const relevantRecords = context.attendanceRecords.filter((record) => {
      const id = record.subject?._id || record.subject;
      return String(id) === String(selectedSubject._id || selectedSubject.id);
    });
    const statuses = relevantRecords.map((record) => record.status).filter(Boolean);
    const summary = summarizeStatuses(statuses, context.target);
    if (!statuses.length) {
      return {
        intent: 'attendance',
        answer: `I do not have any attendance records for ${subjectLabel(selectedSubject)} yet. Add a class record in the attendance page to start tracking it.`,
        actions: [{ label: 'View attendance', to: '/attendance' }],
      };
    }

    if (/(how many more classes|need to reach|recover|classes to reach|reach [0-9]+%|target)/i.test(text)) {
      if (summary.classesToRecover > 0) {
        return {
          intent: 'attendance',
          answer: `${subjectLabel(selectedSubject)} is at ${formatPercentage(summary.percentage)}. You need to attend ${summary.classesToRecover} more class${summary.classesToRecover === 1 ? '' : 'es'} to reach ${context.target}%.`,
          actions: [{ label: 'Open attendance', to: '/attendance' }],
        };
      }
      return {
        intent: 'attendance',
        answer: `${subjectLabel(selectedSubject)} is already meeting ${context.target}% with ${formatPercentage(summary.percentage)} attendance, so no extra attendances are required.`,
        actions: [{ label: 'View attendance', to: '/attendance' }],
      };
    }

    if (/(miss|can i miss|more classes can i miss|safe to miss)/i.test(text)) {
      return {
        intent: 'attendance',
        answer: `${subjectLabel(selectedSubject)} is at ${formatPercentage(summary.percentage)}. You can miss ${summary.additionalAbsencesAllowed} more class${summary.additionalAbsencesAllowed === 1 ? '' : 'es'} and still remain at or above ${context.target}%.`,
        actions: [{ label: 'Open attendance', to: '/attendance' }],
      };
    }

    return {
      intent: 'attendance',
      answer: `${subjectLabel(selectedSubject)} attendance is ${formatPercentage(summary.percentage)} (${summary.attended} attended, ${summary.missed} missed, ${summary.conducted} total classes recorded). ${attendanceInsight(summary).warning ? ` ${attendanceInsight(summary).warning}` : ''}`.trim(),
      actions: [{ label: 'View attendance', to: '/attendance' }],
    };
  }

  if (/(today.*(class|timetable|schedule)|classes.*today|what.*today|timetable.*today|today's classes)/i.test(text) || (/(class|timetable|schedule)/i.test(text) && /(today|todays)/i.test(text))) {
    const todayEntries = getTodayClasses(context.timetable);
    if (!todayEntries.length) {
      return {
        intent: 'timetable',
        answer: 'You do not have any classes scheduled for today. You can add or review your timetable from the timetable page.',
        actions: [{ label: 'Open timetable', to: '/timetable' }],
      };
    }
    const list = todayEntries.map((entry) => `${entry.subject?.name || 'Subject'} · ${entry.startTime}–${entry.endTime}${entry.location ? ` at ${entry.location}` : ''}`).join('; ');
    return {
      intent: 'timetable',
      answer: `Your classes today are: ${list}.`,
      actions: [{ label: 'Open timetable', to: '/timetable' }],
    };
  }

  if (/(exam|upcoming examination|coming up next|next exam)/i.test(text)) {
    const upcomingExams = context.exams.filter((exam) => new Date(exam.date) >= new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`));
    if (!upcomingExams.length) {
      return {
        intent: 'exams',
        answer: 'You do not have any upcoming exams configured yet. Add exam data to the exam page to track them here.',
        actions: [{ label: 'Open exams', to: '/exams' }],
      };
    }
    const nextExam = upcomingExams[0];
    const nextDays = getExamDaysRemaining(nextExam.date);
    const examList = upcomingExams.slice(0, 3).map((exam) => `${exam.subject?.name || 'Subject'} · ${exam.title} · ${new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })} (${getExamDaysRemaining(exam.date)} days left)`).join('; ');
    return {
      intent: 'exams',
      answer: `Your next exam is ${nextExam.title} for ${subjectLabel(nextExam.subject)} on ${new Date(nextExam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}. That is ${nextDays} day${nextDays === 1 ? '' : 's'} away. Upcoming exams: ${examList}.`,
      actions: [{ label: 'Open exams', to: '/exams' }],
    };
  }

  if (/(assignment|assignments|task|tasks|deadline|due|homework)/i.test(text)) {
    if (!context.tasks.length) {
      return {
        intent: 'tasks',
        answer: 'There are no pending assignments or tasks right now. Add one under the organizer to track deadlines.',
        actions: [{ label: 'Open organizer', to: '/organizer' }],
      };
    }
    const upcomingTasks = context.tasks.slice(0, 3).map((task) => `${task.title} (due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ''})`).join('; ');
    return {
      intent: 'tasks',
      answer: `You have ${context.tasks.length} pending assignment${context.tasks.length === 1 ? '' : 's'}: ${upcomingTasks}.`,
      actions: [{ label: 'Open organizer', to: '/organizer' }],
    };
  }

  if (/(syllabus|topic|progress|completed|what have i studied|study progress)/i.test(text)) {
    if (!context.syllabusTopics.length) {
      return {
        intent: 'syllabus',
        answer: 'You do not have any syllabus topics configured yet. Add topics under the syllabus page to track your progress.',
        actions: [{ label: 'Open syllabus', to: '/syllabus' }],
      };
    }
    const bySubject = new Map();
    for (const topic of context.syllabusTopics) {
      const key = String(topic.subject?._id || topic.subject);
      const existing = bySubject.get(key) || { subject: topic.subject, total: 0, completed: 0 };
      existing.total += 1;
      if (topic.completed || topic.progress === 'completed') existing.completed += 1;
      bySubject.set(key, existing);
    }
    const subjectProgress = [...bySubject.values()].map((entry) => {
      const name = subjectLabel(entry.subject);
      const percent = entry.total ? Math.round((entry.completed / entry.total) * 100) : 0;
      return `${name}: ${percent}% complete (${entry.completed}/${entry.total})`;
    }).join('; ');
    return {
      intent: 'syllabus',
      answer: `Your syllabus progress is: ${subjectProgress}.`,
      actions: [{ label: 'Open syllabus', to: '/syllabus' }],
    };
  }

  if (/(study plan|study today|today.*study|study session|what should i study|what should i do today)/i.test(text)) {
    if (!context.studySessions.length) {
      return {
        intent: 'study-plan',
        answer: 'There are no study sessions planned for today yet. Open the Study Planner to create a plan based on your upcoming exams and syllabus.',
        actions: [{ label: 'Open Study Planner', to: '/study-planner' }],
      };
    }
    const sessionsText = context.studySessions.map((session) => {
      const subject = subjectLabel(session.subject);
      const examName = session.exam ? session.exam.title : 'study block';
      return `${subject} · ${session.startTime}–${session.endTime} · ${examName}`;
    }).join('; ');
    return {
      intent: 'study-plan',
      answer: `Today's study plan includes: ${sessionsText}.`,
      actions: [{ label: 'Open Study Planner', to: '/study-planner' }],
    };
  }

  return {
    intent: 'general',
    answer: 'I can help with today\'s timetable, attendance, class targets, exams, assignments, syllabus progress, or your study plan. Try a question like “What classes do I have today?” or “What is my DBMS attendance?”',
    actions: [{ label: 'Open dashboard', to: '/dashboard' }, { label: 'Open Study Planner', to: '/study-planner' }],
  };
}

module.exports = { askAcademicQuestion };
