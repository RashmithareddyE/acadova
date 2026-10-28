function deterministicRecommendations({ summary }) {
  const messages = [];
  if (!summary.upcomingExams) messages.push('Add an upcoming examination to generate a dated study plan.');
  if (summary.subjectsWithoutSyllabus.length) messages.push('Add confirmed syllabus topics for every exam subject to include topic-level sessions.');
  if (summary.assignmentDueDates?.length) messages.push(`${summary.assignmentDueDates.length} day(s) with pending assignment deadlines are reserved; the planner does not guess assignment workload or schedule work on its due date.`);
  if (summary.unscheduledTopics.length) messages.push(`${summary.unscheduledTopics.length} unfinished topic(s) do not fit before their examinations. Consider increasing study availability or prioritizing topics yourself.`);
  if (summary.limitedHorizon) messages.push('The planner schedules at most 370 days ahead. Exams beyond that window need a later plan refresh.');
  if (!messages.length && summary.unfinishedTopics) messages.push('The unfinished confirmed syllabus topics fit in the current plan.');
  if (!messages.length && !summary.unfinishedTopics) messages.push('No unfinished syllabus topics remain for the upcoming exams.');
  return { source: 'deterministic', messages };
}

async function getRecommendations(context, optionalProvider = null) {
  if (typeof optionalProvider === 'function') return optionalProvider(context);
  return deterministicRecommendations(context);
}

module.exports = { getRecommendations, deterministicRecommendations };
