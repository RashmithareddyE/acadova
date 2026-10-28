# Acadova backend

The backend is a Node.js + Express application that provides protected student APIs for account management, academic records, attendance, organizer tasks, planner data, imports, and Copilot responses.

## Local setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Required environment variables

- `MONGO_URI`
- `JWT_SECRET` (32+ characters)
- `JWT_EXPIRES_IN_DAYS` (optional)
- `CLIENT_URL` (optional but needed for frontend CORS)
- `PORT` (optional)
- `PDFTOTEXT_PATH` (optional)

## Important notes

- Authentication is JWT-based for API clients and cookie-based for the browser frontend.
- Protected routes verify the authenticated student before any academic or attendance record is returned or changed.
- The backend enforces per-user ownership for academic records, timetable entries, organizer tasks, and planner sessions.
- Optional AI vision support is not required for the current project to work; local document extraction and planner logic remain supported without paid services.
