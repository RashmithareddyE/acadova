# Setup and Troubleshooting Guide

## 1. Required software

- Node.js 20+ recommended
- npm
- MongoDB running locally or remotely
- optional: `pdftotext` for searchable PDF document extraction if used in the local environment

## 2. Dependency installation

Backend:

```bash
cd backend
npm install
```

Frontend:

```bash
cd frontend
npm install
```

Mobile app:

```bash
cd mobile
npm install
```

## 3. Environment variables

Create local environment files from the examples without committing real secrets.

### Backend

```bash
cd backend
cp .env.example .env
```

Required names:

- `MONGO_URI`
- `JWT_SECRET` (minimum 32 characters)
- `PORT` (optional, defaults to 5000)
- `JWT_EXPIRES_IN_DAYS` (optional)
- `CLIENT_URL` (optional but needed for browser CORS)
- `PDFTOTEXT_PATH` (optional)

Example placeholders:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/acadova
JWT_SECRET=replace_with_a_secure_secret_of_at_least_32_characters
JWT_EXPIRES_IN_DAYS=7
CLIENT_URL=http://localhost:5173
PDFTOTEXT_PATH=pdftotext
```

### Frontend

```bash
cd frontend
cp .env.example .env
```

Required names:

- `VITE_API_URL`

Example:

```env
VITE_API_URL=http://localhost:5000/api
```

### Mobile app

For physical-device testing, use the development machine IP instead of `localhost`.

```env
EXPO_PUBLIC_API_URL=http://192.168.1.10:5000/api
```

## 4. Backend setup

```bash
cd backend
npm run dev
```

Common backend startup checks:

- confirm MongoDB is reachable at `MONGO_URI`
- confirm `JWT_SECRET` is at least 32 characters
- verify the port is not already in use

## 5. Frontend setup

```bash
cd frontend
npm run dev
```

The frontend uses `VITE_API_URL` to talk to the backend API. If the frontend cannot reach the backend, check the value in `.env` and the backend server status.

## 6. Mobile app setup

```bash
cd mobile
npx expo start
```

If testing on a real phone:

- do not use `localhost`
- use the machine's LAN IP and not a local-server-only loopback value

## 7. Common startup errors

### MongoDB connection failed

Symptoms:

- backend fails to start
- API routes are unreachable

Check:

- the MongoDB service is running
- the URI is correct
- the database name exists or can be created by MongoDB

### JWT_SECRET is missing or too short

Symptoms:

- the backend exits during startup

Fix:

- set a secure secret in `backend/.env`
- use at least 32 characters

### Frontend cannot reach the backend

Symptoms:

- login fails
- API calls cannot complete

Check:

- `VITE_API_URL` includes `/api`
- the backend server is running
- CORS settings allow the frontend origin

### Mobile app cannot reach backend

Symptoms:

- authentication fails on device
- fetch requests fail with network errors

Check:

- use the correct machine IP
- ensure both devices are on the same local network
- check that the backend is not listening only on localhost when a phone is connecting

## 8. Authentication issues

Common problems:

- invalid or expired JWT tokens
- frontend not sending cookies for browser auth
- backend CORS disabled for the frontend origin

Check:

- the browser is hitting the same origin or the origin is allowed by `CLIENT_URL`
- the user account exists and the password is correct
- the user is authenticated before visiting protected pages

## 9. OCR and document-import limitations

Current document extraction is heuristic and not guaranteed for every real timetable image:

- low-quality or rotated schedules may fail
- complex layouts or heavily stylized tables may require manual review
- searchable PDFs and clean text documents are more reliable than image OCR
- extracted results should still be checked before saving for important academic data

## 10. Test commands

Backend tests:

```bash
cd backend
node --test test/*.test.js
```

Frontend build:

```bash
cd frontend
npm run build
```

Mobile bundle validation:

```bash
cd mobile
npx expo export --platform web --output-dir dist
```

## 11. Reporting issues

When reporting a problem, include:

- the command used
- the error message
- whether the app was run in browser or mobile mode
- whether the backend, frontend, or mobile app failed
- your environment variables (without exposing secrets)

## 12. Security reminder

- never commit `.env` files
- never paste real secrets into issue reports or docs
- keep MongoDB credentials and JWT secrets local
- rotate a secret immediately if it is accidentally exposed in a tracked file
