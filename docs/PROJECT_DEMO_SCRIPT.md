# Project Demo Script: Acadova

## Introduction

“Acadova is a student-focused academic management system built to help learners organise timetable, attendance, assignments, exam preparation, and study planning in one place. The project focuses on the actual student workflow: keeping records secure, helping monitor attendance targets, and making academic planning easier without relying on paid AI services for the core experience.”

## Recommended five-minute demo flow

### 1. Open the application and log in

Steps:
- Start MongoDB.
- Start the backend using the documented `npm run dev` command.
- Start the frontend using the documented `npm run dev` command.
- Open the login or registration screen.

What to say:
- “This is the authenticated entry point for the student workspace. Only a registered and logged-in student can access academic data.”

Expected result:
- login page loads correctly
- protected routes require authentication

### 2. Create or select a subject

Steps:
- Create a subject with a name and code.
- Save it under the authenticated student account.

What to say:
- “Subjects are the main academic grouping in the system. Every timetable class, exam, and study record is linked to the student’s own subject list.”

Expected result:
- subject appears in the student’s academic data
- the subject is scoped to the current user only

### 3. Add a timetable entry manually

Steps:
- Navigate to the timetable area.
- Add a class for a day, start time, end time, and location.

What to say:
- “The timetable is one of the most important modules because it powers the dashboard and academic planning.”

Expected result:
- class appears on the correct weekday
- record is saved and remains linked to the student account

Alternative if OCR fails:
- If timetable import or OCR is not reliable on the current document, switch to the manual timetable entry flow as the reliable demonstration path.

### 4. Open the Today Dashboard

Steps:
- Open the dashboard for the current day.
- Confirm the timetable and relevant academic notes are visible.

What to say:
- “This dashboard brings together the student’s academic obligations in a single view.”

Expected result:
- timetable entries are visible for the day
- the student can immediately see their current academic routine

### 5. Record attendance

Steps:
- Record a class as present, absent, or cancelled.
- Save the record.

What to say:
- “Attendance is based on confirmed class records, not future plans or intentions.”

Expected result:
- attendance record is created
- the percentage updates based on the confirmed attendance data

### 6. Show attendance calculation and target warning

Steps:
- Use a known sample such as 24 conducted classes and 18 attended classes.
- Explain the calculated result.

What to say:
- “The system calculates the student’s attendance percentage from confirmed records and warns the student when they are below the target threshold.”

Expected result:
- 75% example shows the correct target behaviour
- the student sees the target warning or safe-miss guidance relevant to their current state

### 7. Show organizer and exam/syllabus data

Steps:
- Open organizer tasks or exam/syllabus area.
- Add or view a task, exam, or syllabus topic.

What to say:
- “The application also helps the student organise assignments, exam preparation, and study responsibilities without leaving the academic workspace.”

Expected result:
- records appear for the authenticated student only

### 8. Show the study planner or Copilot module if available

Steps:
- Open study planner or Copilot.
- Ask or review a relevant academic question or planner summary.

What to say:
- “The Copilot-style support is rule-based and uses the student’s current academic data rather than depending on a paid external AI service.”

Expected result:
- a response is returned based on the local academic context
- no paid API requirement is necessary for the core workflow

## How to explain the technology stack

- React powers the interface.
- Express serves the backend API.
- MongoDB stores user and academic records.
- Authentication and ownership checks protect student data.
- OCR is included for supported document workflows but is not described as perfectly reliable.

## How to handle limitations professionally

If OCR fails during the demonstration, say:

- “The document-import and OCR workflow is heuristic and can require manual correction, so the reliable demonstration path is to add the timetable manually.”

If a module is not fully validated, say:

- “This part is implemented in the repository but remains limited or requires additional local validation. We are demonstrating the verified core workflow instead.”

## Closing summary

“This project demonstrates a realistic student academic dashboard that keeps academic records secure, supports attendance awareness, and helps students plan their study and deadlines in a single system.”

The focus of the presentation should remain on the verified, working core workflow rather than on speculative future features.
