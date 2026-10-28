# Acadova Demonstration Guide

This guide explains how to demonstrate the application using the features that are actually implemented in the current repository.

## 1. Prerequisites

Before the demo:

- MongoDB must be running locally or reachable through `MONGO_URI`
- the backend `.env` file must be created from `backend/.env.example`
- the frontend `.env` file must be created from `frontend/.env.example`
- the backend and frontend dependencies must be installed

Do not use real credentials or production secrets in the demo.

## 2. Start MongoDB and the backend

```bash
cd backend
npm install
npm run dev
```

Expected result:

- the backend starts successfully
- the API is ready on port 5000 by default
- the health endpoint is reachable at `/api/health`

## 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Expected result:

- the frontend starts in Vite development mode
- the web app is reachable in the browser
- the configured `VITE_API_URL` points to the backend API

## 4. Register or log in

Open the frontend and either:

- register a new student account, or
- use an existing local test account

Expected result:

- the student is redirected to the dashboard once authenticated
- protected pages are accessible only after login
- login and registration use the backend auth APIs

## 5. Create or open a subject

Open the subject management screen and create a subject with a code and name.

Expected result:

- the subject is stored under the authenticated student account
- the record appears in the academic list
- another student's subject is not visible

## 6. Add a timetable entry manually

If timetable entry creation is supported in the current UI, add a subject to a weekday, with start and end time, and a location.

Expected result:

- the timetable is shown for the relevant day
- the data is linked to the logged-in user
- duplicate or invalid entries are rejected by validation

If the timetable import flow is used instead, the system can attempt OCR-based extraction from supported document uploads.

## 7. Open the Today Dashboard

Navigate to the dashboard.

Expected result:

- the dashboard shows the current day and any subject schedule
- attendance guidance and class information are visible
- planned or actual attendance data appears for the logged-in student

## 8. Record attendance

Use the attendance functionality to mark a class as present, absent, or cancelled.

Expected result:

- the attendance record is created for the authenticated user
- percentages update based on the existing backend calculation rules
- cancelled sessions are excluded from conducted totals

## 9. Demonstrate attendance calculation using known values

Use the backend test examples and show the calculation logic with a simple example:

- 24 classes conducted and 18 classes attended = 75%
- a below-target student receives warnings or recovery guidance
- a student at exactly 75% does not require additional recovery under the target rule

Expected result:

- the logic matches the backend calculations in the tests
- warnings and recovery messages stay consistent with the rule-based service

## 10. Show assignment management

Open the organizer or dashboard task area.

Expected result:

- tasks can be created and completed
- due dates are stored with task ownership
- only the current user's tasks are visible

## 11. Show examination planning

Use the exam and syllabus screens if available in the current app state.

Expected result:

- exams can be created for an owned subject
- syllabus topics can be tracked through progress states
- the planner uses those records to shape study suggestions

## 12. Show the study planner

Open the study planner screen and configure study preferences if supported.

Expected result:

- sessions are generated or previewed in line with the current preferences
- scheduling respects availability and timetable conflicts
- completed or skipped sessions remain on the student's own schedule

## 13. Show the Copilot feature

If the assistant route is available in the running UI, ask a question such as:

- "What should I study before my next exam?"
- "Which subjects are below my attendance target?"

Expected result:

- a rule-based response is returned
- the response uses the student's current data and not a fabricated external service

If the Copilot experience is not fully integrated in the current UI, this should be presented as a backend-supported feature rather than a fully polished user flow.

## 14. Demo narrative for faculty

"Acadova is a student-focused academic management application that helps learners keep track of attendance, timetable, assignments, exams, and study planning in one secure system. The application is designed around the student’s own data and keeps records scoped to the authenticated account. The current implementation supports the academic workflow and demonstrates attendance guidance, study planning, and organizer tasks without requiring any paid service to function."

## 15. Unavailable or incomplete features to call out honestly

The following should be called out as unavailable for a live demo if they are not working in the target environment:

- some advanced OCR or timetable recognition scenarios
- physical mobile-device testing
- optional AI-powered enhancements
- any feature that is only partially implemented or not validated in the local setup

## 16. Recommended demo flow

For a concise live presentation, use this order:

1. Start MongoDB and the backend
2. Start the frontend
3. Register or log in
4. Create a subject
5. Add a timetable entry
6. Open the dashboard
7. Mark attendance and show the result
8. Review assignments and tasks
9. Review exam or syllabus data
10. Open study planner if available
11. Ask the rule-based Copilot question if the route is live

This flow matches the functionality currently supported by the repository and avoids claiming features that are not verified.
