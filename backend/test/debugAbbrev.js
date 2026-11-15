const fs = require('fs');
const path = require('path');
const { extractText } = require('../services/documents/extractText');
const { parseTimetable } = require('../services/documents/parseTimetable');

async function test() {
  const file = 'timetable-abbreviated-sample.jpg';
  const buf = fs.readFileSync(path.join(__dirname, file));
  const res = await extractText(buf, 'image/jpeg', file, { timetableOcr: true });
  
  // Let's inspect rows from parseTimetable
  const rows = parseTimetable(res.text, res.sourceType, res.words);
  console.log('Total rows:', rows.length);
  const byDay = {};
  for (const r of rows) {
    if (!byDay[r.weekday]) byDay[r.weekday] = [];
    byDay[r.weekday].push(r);
  }
  for (const [day, dayRows] of Object.entries(byDay)) {
    console.log(`Day ${day}:`);
    for (const r of dayRows) {
      console.log(`  ${r.subjectName} (${r.subjectCode || 'no code'}) : ${r.startTime} - ${r.endTime} issues:`, r.issues);
    }
  }
}
test();
