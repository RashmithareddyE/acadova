const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Kolkata';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function applicationDateString(now = new Date()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateOnlyString(value) {
  const date = value instanceof Date ? value : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const result = date.toISOString().slice(0, 10);
  return typeof value === 'string' && result !== value ? null : result;
}

function weekdayForDate(value) {
  const date = dateOnlyString(value);
  return date ? new Date(`${date}T00:00:00.000Z`).getUTCDay() : null;
}

module.exports = { APP_TIME_ZONE, applicationDateString, dateOnlyString, weekdayForDate };
