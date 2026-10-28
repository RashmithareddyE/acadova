# Acadova

Acadova is a student-focused academic management web application for tracking attendance, subjects, timetables, assignments, exams, and study planning in one place.

## Problem statement

Students often manage academic obligations across separate tools: timetable planners, spreadsheets, attendance trackers, assignment notes, and revision calendars. This fragmentation makes it harder to stay on top of class attendance targets, deadlines, and exam preparation.

## Proposed solution

Acadova brings the core academic-management workflow into a single web application with:

- authenticated student accounts
- subject and timetable management
- attendance tracking and target guidance
- organizer tasks for assignments and deadlines
- examination and study planning
- rule-based Copilot-style academic support

## Main objectives

- centralise academic data for a student account
- protect records so each user only accesses their own data
- make attendance and study planning actionable
- reduce manual administrative overhead for timetable and exam preparation
- provide a reliable demonstration-ready web application

## Key features currently implemented

- Student registration and login
- Protected routes and authenticated API access
- Subject CRUD and academic data management
- Manual timetable entry and timetable import/OCR support for supported document types
- Attendance tracking, target checks, safe-miss calculations, and recovery guidance
- Organizer tasks and assignment tracking
- Exam planning and syllabus tracking
- Study planner preferences, session generation, and dashboard summary
- Copilot-style guided academic responses via the existing rule-based backend module

## Technologies used

- React 19 + Vite frontend
- React Router for web navigation
- Node.js + Express backend
- MongoDB + Mongoose models
- JWT-based auth and cookie-based browser auth
- Tesseract.js and document parsing utilities for import/OCR flows

## System architecture

The project follows a split architecture:

- Frontend: browser-based React application under `frontend/`
- Backend: Express API under `backend/`
- Database: MongoDB with owner-scoped Mongoose models
- Authentication: JWT for API access and cookie-based session handling for browser requests
- Academic modules: subject, timetable, exam, syllabus, attendance, organizer, and planner

## Project directory structure

```text
acadova/
├── backend/                 # Express backend and MongoDB models
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── test/
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/               # Vite + React web application
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.*
├── docs/                   # Submission and setup documentation
├── PROJECT_PROGRESS.md
├── README.md
├── .gitignore
└── .env.example           # optional root-level local dev config if present
```

## Installation prerequisites

- Node.js 20+ recommended
- MongoDB instance running locally or remotely
- npm package manager
- Optional: local `pdftotext` utility for searchable PDF parsing if used in a document workflow

## Environment configuration

Create local environment files before running the app.

Backend:

```bash
cd backend
cp .env.example .env
```

Required backend variables:

- `MONGO_URI`
- `JWT_SECRET` (minimum 32 characters)
- `JWT_EXPIRES_IN_DAYS` (optional)
- `CLIENT_URL` (optional but needed for CORS)
- `PORT` (optional, defaults to 5000)
- `PDFTOTEXT_PATH` (optional)

Frontend:

```bash
cd frontend
cp .env.example .env
```

Required frontend variable:

- `VITE_API_URL` should point to the backend API base URL, including `/api`

Example:

```env
VITE_API_URL=http://localhost:5000/api
```

Do not commit real secrets or environment values with credentials.

## Backend startup

```bash
cd backend
npm install
npm run dev
```

The backend starts on port 5000 by default and exposes the API under `/api`.

## Frontend startup

```bash
cd frontend
npm install
npm run dev
```

The frontend uses the backend URL configured in `VITE_API_URL`.

## Testing

Relevant existing tests can be run from the backend:

```bash
cd backend
node --test test/*.test.js
```

Frontend production build:

```bash
cd frontend
npm run build
```

## Known limitations

- OCR and timetable extraction are heuristic and not guaranteed to recover all real-world schedule formats.
- Live browser E2E validation requires a real MongoDB environment and manual testing.
- Optional AI/vision integrations remain optional and are not required for the current project.

## Future enhancements

- stronger real-world OCR and timetable extraction tuning
- richer dashboards and notifications
- additional analytics and student insights
- optional AI integration only if genuinely needed and configured responsibly

## Submission status

The repository currently contains a working, documented core student-academic workflow with documented limits and tested backend logic. The project is suitable for demonstration when run with a local MongoDB instance and the provided environment configuration.
