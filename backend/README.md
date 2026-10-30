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
- Timetable image recognition runs locally with the bundled Tesseract.js English model. It uses no paid OCR API and needs no separate OCR server.
- To run timetable OCR locally, install backend dependencies with `npm install` and start the backend with `npm run dev`; the authenticated `POST /api/imports/timetable/preview` route performs extraction and returns an editable preview.
- PaddleOCR was evaluated but is not part of this deployment: the application is Node.js-only, while PaddleOCR and its model files are not currently installed or managed by this project. Adding it would require a separately provisioned Python runtime and model-download lifecycle; the existing bundled local OCR avoids that operational dependency.
