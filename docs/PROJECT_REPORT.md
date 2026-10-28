# Project Report: Acadova

## A. Introduction

Acadova is a student academic-management application intended to help learners keep track of their timetable, attendance, assignments, exams, and study schedule in a single place. The repository contains both a web application and a separate Expo mobile project, with the core source of truth in the backend and web frontend.

The project is aimed at students who need a reliable way to organise academic responsibilities without managing multiple disconnected tools or manual spreadsheets.

## B. Problem Statement

University and college students often work with several separate systems to manage:

- class schedules and subject records
- attendance percentages and targets
- assignment deadlines
- examination preparation
- study planning and revision sessions

This fragmentation increases the chance of missing classes, falling below attendance targets, forgetting assignments, and preparing poorly for exams.

## C. Proposed Solution

Acadova addresses this by integrating the most important academic-management features into one application:

- student authentication and account management
- subject and timetable data
- attendance tracking with rules-based guidance
- organizer tasks for deadlines and study work
- exam and syllabus planning
- a study planner that schedules sessions based on available time
- a rule-based Copilot-style module for student questions

The solution keeps the backend as the authority for data and user ownership, so academic records are protected and scoped to the authenticated student.

## D. Objectives

The project goals are to:

1. maintain a secure and student-specific academic workspace
2. track timetable and attendance reliably
3. support assignment and exam planning
4. provide practical study scheduling guidance
5. keep the system demonstrable and reproducible in a local environment
6. avoid unnecessary external dependencies or paid services for the core feature set

## E. Technology Stack

The repository currently contains the following technologies and libraries:

- React 19 with Vite for the web frontend
- React Router for page navigation
- Node.js and Express for the backend API
- MongoDB with Mongoose for persistence
- JWT and cookie-based browser session management
- Tesseract.js and document parsing utilities for OCR/import workflows
- a rule-based Copilot-like service for student assistance
- Expo + React Native for the mobile application scaffold

## F. System Architecture

The system is structured as a classic three-layer application:

- Frontend: React web application under `frontend/`
- Backend: Express API under `backend/`
- Database: MongoDB instance accessed through Mongoose models

Authentication and authorization are enforced in the backend. Browser requests use httpOnly cookies, while API clients and mobile integrations can use Bearer tokens. Protected routes always retrieve the current user from the database and apply user-scoped filtering before returning or modifying data.

The academic modules are served by the backend and consumed by the frontend via the shared API client. The mobile app, where present, is a separate Expo project that calls the same backend endpoints and stores the user token securely.

## G. Module Descriptions

### Authentication and security

Implemented:

- student registration and login
- protected route enforcement in the frontend
- authentication middleware in the backend
- user-scoped data filtering and ownership checks

Partially implemented or environment-dependent:

- browser session persistence and logout flows depend on the configured backend and client origin

### Academic management

Implemented:

- subject creation and management
- timetable records with weekday, time, and location metadata
- exam records with subject and time details
- syllabus topics with status tracking
- academic calendar events

### Attendance module

Implemented:

- attendance record creation for present, absent, and cancelled statuses
- percentage calculations
- target checks at 75% and 80% depending on the user profile
- recovery and safe-miss guidance
- warnings for near-target or below-target states

### Organizer tasks

Implemented:

- task creation, update, completion toggling, and deletion
- owner-scoped retrieval and due-date filtering

### Study planner

Implemented:

- user study preferences
- session generation based on timetable, exam, and syllabus data
- session completion and skipping actions
- planner dashboard summary

### Import and OCR support

Implemented:

- timetable document parsing from text, CSV, TSV, searchable PDFs, and image uploads
- local OCR workflow using Tesseract.js and bundled assets
- preview and review flow before saving extracted entries

Important limitation:

- timetable extraction is heuristic and may fail or require user review on low-quality, rotated, or highly complex documents.

### Copilot assistant

Implemented:

- backend rule-based question and answer flow for student academic requests
- route-based request handling with the existing backend auth

This is best described as a rule-based assistant rather than a paid AI service integration.

### Mobile application

Implemented:

- Expo app scaffold
- auth flow and token storage
- navigation shell
- home, timetable, attendance, and organizer screens
- bundle validation

Not fully validated in this environment:

- physical-device testing and deep end-to-end mobile verification remain outstanding.

## H. Database Design

The backend uses MongoDB with Mongoose models. The main models are:

### User

- `name`
- `email`
- `password` (stored as a bcrypt hash and excluded from serialization)
- `attendanceTarget` (currently supports 75 or 80)

### Subject

- `user` (owner reference)
- `name`
- `code`
- `teacher`
- `credits`
- `description`

A subject is unique per user by code.

### TimetableEntry

- `user`
- `subject`
- `weekday` (0 to 6)
- `startTime`
- `endTime`
- `location`
- `sessionType`

Validation ensures the end time is after the start time.

### CalendarEvent

- `user`
- `title`
- `type` (`event`, `holiday`, `deadline`, `college`)
- `date`
- `endDate`
- `description`

### Exam

- `user`
- `title`
- `type`
- `subject`
- `date`
- `startTime`
- `endTime`
- `venue`
- `notes`

### SyllabusTopic

- `user`
- `subject`
- `unit`
- `topic`
- `completed` (legacy boolean maintained for compatibility)
- `progress` (`not-started`, `in-progress`, `completed`)

### Attendance

- `user`
- `subject`
- `timetableEntry` (optional scheduled-entry link)
- `date`
- `status` (`present`, `absent`, `cancelled`)
- `notes`

A unique index prevents duplicate attendance entries for the same user, timetable entry, and date.

### ClassIntention

- `user`
- `timetableEntry`
- `date`
- `intention` (`attend`, `miss`)

### OrganizerTask

- `user`
- `title`
- `description`
- `category`
- `dueDate`
- `dueTime`
- `priority`
- `status`

### StudyPreferences and StudySession

- `StudyPreferences` tracks user study windows, available days, commitments, and priority subjects
- `StudySession` records generated or user-managed study sessions with exam, subject, topic, date, and status fields

## I. API Overview

The backend exposes grouped routes under `/api`, including:

- `/api/auth` — registration, login, logout, and current-user retrieval
- `/api/academic` — subjects, access to timetable, exams, calendar, and syllabus resources
- `/api/attendance` — today dashboard data, record creation, summary, target, and projection endpoints
- `/api/imports` — preview and extraction endpoints for text, PDF, and image import workflows
- `/api/tasks` — organizer task routes
- `/api/study-planner` — preferences, dashboard, overview, sessions, and plan generation flows
- `/api/copilot` — assistant-style question requests
- `/api/health` — service health check

## J. Security

The current implementation includes the following security measures:

- bcrypt hashing for user passwords
- JWT or cookie-based authenticated access for protected routes
- backend middleware that loads the current user and rejects unauthenticated requests
- user-scoped database queries so one student cannot access another student’s records
- strict route-level checks before modifying timetable, attendance, planner, organizer, and academic records

The frontend does not include secret values, and the repository excludes local `.env` files from Git tracking.

## K. Testing

The following tests were actually executed in this repository:

1. Backend suite
   - Command: `cd backend && node --test test/*.test.js`
   - Result: passed

2. Frontend build
   - Command: `cd frontend && npm run build`
   - Result: passed

3. Mobile bundle export
   - Command: `cd mobile && npx expo export --platform web --output-dir dist`
   - Result: passed

These are the real validation outputs available in the current repository state.

## L. Limitations

The application is not a complete full-scale academic platform. Current limitations include:

- timetable OCR is heuristic and may require user review for low-quality images or unusual layouts
- browser-level end-to-end testing against a real MongoDB-backed environment still needs manual validation
- physical-device testing for the mobile app has not been performed in this environment
- some advanced or optional features remain for future work rather than being marked as complete

## M. Future Enhancements

Planned improvements include:

- more robust timetable extraction for real-world academic layouts
- stronger notification and reminder support
- richer attendance analytics and forecasting
- extended mobile workflow and device testing
- deeper AI integration only if justified and properly configured

## N. Conclusion

Acadova currently delivers a demonstrable, stable academic-management workflow for the implemented features: student authentication, academic data management, attendance tracking, organizer tasks, exam and syllabus planning, study scheduling, and a rule-based assistant. The project is suitable for academic demonstration and evaluation within its documented limits, provided it is run with a valid MongoDB environment and the required local configuration.
