# Project Presentation: Acadova

## Slide 1 — Title

Acadova  
Academic Management System for Students

- Student Name: [Insert student name]
- Department: [Insert department]
- College: [Insert college name]
- Project Guide: [Insert guide name]

Speaker notes:
- Open with the core idea: Acadova is a student-focused academic management system designed to consolidate timetable, attendance, assignments, exam planning, and study preparation in one place.
- Emphasise that this is a practical academic project centred on a real student workflow rather than a generic productivity app.

---

## Slide 2 — Problem Statement

Students frequently split their academic life across multiple tools and manual records:

- class timetable and subject records
- attendance tracking and target monitoring
- assignment and deadline management
- revision planning and exam preparation

This creates several common problems:

- missed classes or falling below attendance thresholds
- forgetting assignment deadlines
- poor coordination between lectures, study time, and examinations
- fragmented academic planning across unrelated systems

Speaker notes:
- Explain that the project targets a very common student problem: academic responsibility is scattered across different devices and records.
- Frame the application as a practical solution to reduce manual workload and improve consistency.

---

## Slide 3 — Proposed Solution

Acadova brings the core academic-management workflow into a single application with:

- authenticated student accounts
- subject and timetable management
- attendance tracking with target-based warnings
- organizer tasks for assignments and deadlines
- exam and syllabus management
- study planning and session scheduling
- a rule-based Copilot-style academic assistant

The backend is the source of truth and enforces student-specific ownership for academic records.

Speaker notes:
- State that the application keeps authentication and ownership checks on the backend so one student cannot access another student’s academic records.
- Emphasise that the solution is focused on the current working functionality rather than speculative advanced features.

---

## Slide 4 — Objectives

The major project objectives are:

1. Centralise academic information for a student into one system.
2. Improve attendance awareness and allow target-based planning.
3. Support timetable, subject, and academic record management.
4. Help students organise assignments and examinations.
5. Provide study-planning support based on the student’s available time.
6. Keep the system secure, user-scoped, and demonstrable in a local environment.

Speaker notes:
- Keep this slide focused on the intended outcomes rather than the full feature backlog.
- Mention the practical student value: easier planning, better motivation, and clearer academic guidance.

---

## Slide 5 — Technology Stack

The repository currently uses the following technologies:

- React 19 + Vite for the web frontend
- React Router for client-side routing
- Node.js + Express for the backend API
- MongoDB + Mongoose for persistent data storage
- JWT and cookie-based session handling for authentication
- Tesseract.js and document parsing utilities for OCR/import workflows
- Node-based backend services for attendance calculations, study planning, and Copilot-style rule logic

Purpose of each major technology:

- React provides the user interface and component structure.
- Express exposes the protected academic APIs.
- MongoDB stores student records and academic data.
- JWT and cookies securely authenticate users and maintain sessions.
- Tesseract.js supports local OCR/document-based timetable imports where the workflow is implemented.

Speaker notes:
- Explain that the underlying architecture is simple and practical: a web frontend, an API layer, and a database with user-based authorisation.
- Mention that the project deliberately avoids paid AI dependencies for the core workflow.

---

## Slide 6 — System Architecture

Actual architecture in the current repository:

```text
+----------------------+
| React Frontend       |
| (Vite + React Router)|
+----------+-----------+
           |
           | HTTP requests / API calls
           v
+----------------------+
| Node.js + Express    |
| Backend API          |
| - auth               |
| - academic routes   |
| - attendance         |
| - planner            |
| - organizer          |
| - OCR/import        |
| - Copilot logic      |
+----------+-----------+
           |
           | Mongoose queries
           v
+----------------------+
| MongoDB              |
| User + Academic      |
| Attendance + Planner |
+----------------------+
```

Authentication flow:

- User signs in or registers through the frontend.
- Backend validates credentials and returns a session token or cookie.
- Protected routes require an authenticated student before returning data.
- Academic records are filtered by `user` ownership before access or modification.

Note: the current repository checkout does not include a separately implemented mobile application directory.

Speaker notes:
- Clarify that the system is designed around the backend as the authority for permissions and data access.
- Point out that the frontend is a presentation layer; the backend enforces the actual rules.

---

## Slide 7 — Main Modules

The main implemented modules are:

### Authentication and access control
- student registration and login
- protected pages and route guards
- ownership-based academic access

### Academic management
- subject creation and management
- timetable entry and viewing
- exam and syllabus tracking
- calendar event management

### Attendance intelligence
- present, absent, and cancelled status tracking
- percentage calculation based on confirmed attendance
- 75% and related target guidance
- safe-miss and recovery calculations

### Organizer and study planning
- assignment/task management
- study planner preferences and generated sessions
- dashboard summary based on current academic data

### Import and OCR support
- text, CSV/TSV, searchable PDF, and image processing where supported
- local OCR-based extraction for supported timetable workflows

### Copilot-style assistance
- backend rule-based academic response logic
- student-facing guidance based on current academic data

Important: the project still treats OCR and some advanced document recognition as heuristic and review-assisted rather than fully autonomous.

Speaker notes:
- Present the modules as the actual working project features, not as a complete long-term product vision.
- For incomplete areas, call them out as limitations rather than hiding them.

---

## Slide 8 — Demonstration and Results

Recommended live demonstration flow:

1. Start MongoDB and the backend.
2. Start the frontend.
3. Register or log in.
4. Create a subject.
5. Add a timetable entry manually.
6. Open the dashboard and confirm the class appears on the correct weekday.
7. Record attendance for a subject.
8. Confirm the attendance percentage and target warning behaviour.
9. Navigate to organizer, exam/syllabus, and study-planner modules.

Verified technical results documented in the repository:

- Backend tests passed using `node --test test/*.test.js`.
- Frontend production build passed using `npm run build`.

Speaker notes:
- Keep the viva demonstration lean and realistic.
- If OCR fails, do not force a failed demonstration; use the manual timetable path instead.
- Emphasise that the application should be shown as a working academic MVP rather than an over-promised full platform.

---

## Slide 9 — Limitations and Future Enhancements

Current limitations:

- OCR and timetable extraction remain heuristic and may require manual review.
- Live browser validation depends on a local MongoDB environment and proper `.env` setup.
- The current repository checkout does not include a separately completed mobile app.
- Advanced AI or vision features are optional and not required for the core workflow.

Future enhancements:

- more reliable timetable image recognition
- richer notification and reminder features
- expanded mobile support if implemented later
- deeper analytics and academic insights
- optional AI integration only if justified and properly configured

Speaker notes:
- Be honest about the current status: the project is a solid MVP, not a fully autonomous academic intelligence platform.
- Frame future work as next development opportunities rather than claimed achievements.

---

## Slide 10 — Conclusion

Acadova demonstrates a practical, student-centred academic management workflow that helps learners track attendance, timetables, assignments, exams, and study preparation in one place.

The project’s actual contribution is a secure, user-scoped academic MVP that works within the current repository and is suitable for demonstration when run with the appropriate local environment configuration.

Future work should focus on improving OCR reliability, deeper end-to-end validation, and optional enhancements after the core features are stable.

Speaker notes:
- Conclude by reinforcing the project’s value: manageable scope, secure academic data handling, and a clear demonstration workflow.
- State that the project is a credible academic solution with realistic and honest limitations.
