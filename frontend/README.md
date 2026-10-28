# Acadova frontend

The frontend is a Vite + React application that serves the web dashboard, authentication flow, academic management pages, attendance tools, study planner, organizer, and Copilot assistant.

## Local setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Required environment variables

- `VITE_API_URL` — the backend API base URL, including `/api`

Example:

```bash
VITE_API_URL=http://localhost:5000/api
```

## Notes

- Authentication uses the backend httpOnly cookie and protected routes redirect unauthenticated users to login.
- The frontend should never rely on private or paid external services to work.
- Production builds are validated by `npm run build`.
