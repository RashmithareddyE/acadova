# Acadova project progress

Updated: 2026-11-14

## Intelligent Academic Companion & Module Connection Phase

### Verified Working in the Current Repository

1. **Academic Calendar Intelligence (Task 2)**:
   - Calendar schema extended to support explicit event types: `holiday`, `working-saturday`, `special-working-day`, `cancelled-class`, `semester-start`, `semester-end`, `exam`, `deadline`, `college`, and `event`.
   - Document import parser enhanced with regex detection for each calendar event type.
   - Added interactive Monthly Calendar View (`MonthCalendar`) with month navigation, event badges with color distinctions, and click-to-edit / click-to-add interactions alongside list view.

2. **Intelligent Attendance Prediction Connected to Timetable & Calendar (Task 3)**:
   - Implemented `projectSemesterAttendance` engine in `backend/services/attendanceCalculator.js`.
   - Correctly integrates weekly timetable with the academic calendar:
     - Excludes college holidays and multi-day holiday ranges.
     - Excludes cancelled classes.
     - Includes working Saturdays and special working days.
     - Strictly respects semester end boundaries and avoids inventing unconfigured future classes.
   - Calculates classes conducted, classes attended, current percentage, remaining scheduled classes, safe misses, recovery classes, and projected final attendance.
   - Fully connected to `/api/attendance/summary` and `/api/attendance/today`.

3. **Attend / Miss Intentions & Official Confirmation (Task 4)**:
   - Interactive `[I'll Attend]` and `[I'll Miss]` buttons on Today Dashboard that model projected attendance scenarios without mutating official records.
   - Separate post-class confirmation `[Present]` and `[Absent]` buttons that update official records in MongoDB with duplicate prevention.

4. **Intelligent Subject-Wise Attendance Warnings (Task 5)**:
   - Rendered directly below each subject on the dashboard and attendance pages.
   - Mathematically derived status messages distinguishing below target (< 75%), near target / at risk, and comfortable/healthy states.

5. **Today Dashboard Integration (Task 6)**:
   - Serves as the landing page after login.
   - Shows current date, weekday, today's classes with faculty, timings, room numbers, attendance %, and warnings.
   - Displays holiday state ("Today is a College Holiday!") with holiday title, description, and recommended activities without displaying regular classes as active classes.
   - Displays assignments due today, overdue assignments, upcoming deadlines, pending tasks, and study sessions below classes.

6. **Manual Attendance Baseline Initialization (Task 7)**:
   - Added `initialConducted` and `initialAttended` fields to `Subject` schema with validation (`initialAttended <= initialConducted`).
   - Supports mid-semester joiners through counts or percentage-only baseline via `PUT /api/attendance/baseline`.
   - Continues all future calculations from the baseline without creating artificial historical log records.

7. **Automated Verification (Task 8)**:
   - Added test suite `backend/test/attendancePrediction.test.js` covering 16 scenarios including holiday exclusion, working Saturday inclusion, cancelled class exclusion, semester boundaries, attendance projection, intentions, actual attendance confirmation, manual baseline initialization, subject-wise warnings, dashboard holiday display, and India timezone boundaries.
   - 124/124 backend tests passing (`node --test`).
   - 5/5 frontend unit tests passing (`node --test test/*.test.js`).
   - Frontend production build passing (`npm.cmd run build`).

---

## Phase 8 stabilization and QA status

### Verified working in the current repository

- Backend API and ownership checks are in place and enforce authenticated student scoping for academic, attendance, organizer, planner, and import routes.
- Attendance calculation logic is covered by backend tests for target states, recovery counts, safe-miss allowances, and exclusion of cancelled classes.
- Study planner, assignment organizer, import/OCR, and document-processing flows pass the existing backend test suite.
- The Vite frontend builds successfully for production.

### Audit checklist

- Implemented features: student auth, protected web routes, academic CRUD, attendance tracking, organizer tasks, exam and syllabus data, planner, Copilot assistant, and automated document import/OCR flow.
- Incomplete features: live browser E2E verification against a running MongoDB instance and any optional external AI/vision integrations remain outside verified runtime confirmation.
- Broken integrations: no critical production build regression was identified in the current repo state.
- Duplicate implementations: no duplicate academic or auth model was identified; the project keeps a single backend source of truth.
- Missing environment variables: backend `.env` and frontend `.env` are required locally before the app starts; example files are present and contain required names without secrets.
- Incorrect API URLs: frontend `VITE_API_URL` must point to the backend API base URL and must include `/api`.
- Invalid imports: none identified in the currently built frontend.
- Broken routes: none identified in the current build and backend tests.
- Missing error handling: backend error middleware and API validation are in place; UI-level error messaging is present across the implemented pages.
- Security issues: no committed secrets were found in the repository; the project requires local `.env` configuration and does not expose secrets to the frontend.
- Existing test coverage: backend tests are the primary validation layer, and the frontend has a successful production build.

### Validation executed

- `node --test test/*.test.js` in `backend`: passed.
- `npm run build` in `frontend`: passed.

### Operational limitations

- The backend requires a MongoDB instance and valid `.env` values to run in a live environment.
- Optional AI/vision services remain optional and are not required for the primary workflow.

## Revised roadmap status: Phase 2 Academic Data Intake

Phase 2 now has authenticated intake and editable confirmation flows for timetable, calendar, exam, and syllabus data. Timetable photos use local Tesseract.js plus table-position interpretation. Calendar, exam, and syllabus previews share the document parser/upload pattern and can process supported images or searchable PDFs. Imported and manually entered records use the same authenticated academic APIs and owner-scoped models.

### Phase 2 work completed in this continuation

- Added academic-calendar extraction for delimited tables and readable text lines, including event titles, start/end dates, inferred event categories, and review issues for missing/invalid values. Added image/PDF preview route and a correction/confirmation UI on the existing calendar page.
- Extended exam date interpretation to day-first month-name formats and corrected subject/time/venue extraction on photographed exam schedules.
- Connected image filenames through the shared exam, syllabus, and calendar preview API so backend MIME/extension validation succeeds consistently.
- Added a shared subject picker for timetable, exam, and syllabus imports. Students can match an existing subject or explicitly create one after entering its name, code, and credits.
- Added server-side duplicate checks for timetable entries, calendar events, exams, and syllabus topics. Subject ownership checks continue to use the authenticated user.
- Preserved manual entry on all existing academic pages and enabled calendar image/PDF import without changing future roadmap phases.

### Phase 2 verification

- `node --test backend/test/attendanceCalculator.test.js backend/test/documentImport.test.js backend/test/studyPlanner.test.js backend/test/studyPlannerController.test.js`: passed (34 tests). Generated JPEG fixtures exercised timetable, calendar, exam, and syllabus OCR and interpretation. Searchable PDF extraction was tested through Poppler. WebP decode and blank-image error behavior were also exercised.
- `node --check` for the academic-document parser, import controller/routes, academic controller, and environment config: passed. `npm.cmd run build` in `frontend`: passed (41 modules transformed).
- Authenticated HTTP + MongoDB image-import integration passed for calendar, exam, and syllabus previews and saves; calendar reload, duplicate event rejection, subject ownership, and account isolation were checked. A separate manual timetable create/reload check passed and its exact duplicate was rejected (409). Earlier timetable integration tested image preview, corrected save/reload, and second-account isolation.
- Temporary MongoDB accounts and records used in integration checks were deleted.
- No user-provided timetable image was found; generated fixtures are test aids and do not establish extraction quality on the user's specific photo.

### Phase 2 remaining limitations / next task

- Scanned/image-only PDFs do not yet get rasterized for OCR; searchable PDFs work, and direct JPEG/PNG/WebP image uploads use local OCR. The import UI states this limitation.
- Table and section detection are heuristic; real, small-text, rotated, low-light, and complex multi-section student documents still need browser review and tuning.
- Browser-level camera/gallery, editable correction, subject creation, and manual-entry UI flows were not automated. Their production bundles build, and equivalent authenticated API persistence flows were exercised.
- Finish Phase 2 by validating the import UI on representative student documents, then move to the revised Phase 4 Personal Organizer. The existing attendance and exam planner workspaces were preserved; the revised roadmap places the organizer before the AI exam planner.

## Timetable photo OCR upgrade

### Implemented

- Replaced the image import dependency on a separately installed Tesseract executable with local Tesseract.js 6 and a bundled English trained-data package. OCR accepts JPEG, PNG, and WebP inputs and returns recognized word bounding boxes for layout-aware parsing.
- Added image dimension decoding and limits (12 MiB upload, 12,000 pixels per side, 40 megapixels), actual image signature/MIME matching, and filename-extension/content checks. The browser passes the selected filename to the authenticated preview route.
- Added position-based timetable extraction: OCR words are grouped into visual lines, weekday rows are identified, and subjects are mapped by horizontal table column to recognized time headers. OCR results continue through the existing editable preview and explicit confirm/save flow.
- Preserved searchable PDF extraction and CSV/TSV/plain-text parsing, plus manual timetable entry. The OCR review supports editing by subject match, day, times, location, and session type; it can add/remove classes and select detected sections when labels are recognized.
- The parser uses word bounding boxes to group multiword cells, match separate time-period columns, identify lab/practical/tutorial labels, and extract room labels. Low confidence/missing fields remain flagged for correction. Section label recognition is heuristic and depends on legible labels such as "Section A" or "Batch 1".
- Fixed a timetable-parser failure where OCR recognized weekdays and subjects on slightly different vertical baselines but the parser only examined one OCR line; the old row-spacing band could also sweep timetable headings into subject cells across gaps between stacked sections. Parsing now gathers words inside bounded weekday row bands, uses a robust median row spacing, recognizes split dash/time-range headings, deduplicates matching headers in stacked schedules, and constrains header-to-cell time assignment. Recognizable subject/day cells remain in the preview with missing times flagged instead of being discarded.
- Image preview errors now distinguish readable text with no weekday structure from weekdays detected without usable schedule rows, and the upload component offers a manual preview entry point after extraction errors.
- Follow-up recognition fix: weekday matching now requires an explicit full name or known abbreviation, with limited OCR substitutions for common confusions such as `M0N`, punctuation, and letter-split labels; this prevents the old parser from losing day anchors when OCR returns digits or separated characters. Position-based time-header pairing now handles AM/PM and split dash tokens, avoids pairing across unparsed numeric OCR fragments or implausibly distant times, and leaves cells with uncertain period mapping incomplete for preview correction. Code-only cells retain their recognized code as the reviewable subject text, and dash-only empty cells are omitted.
- Removed the obsolete TESSERACT_PATH setting. OCR and its English model are bundled with backend dependencies; no executable install or external API key is required.
- Diagnosed the reported obsolete OCR error: it was returned by a pre-existing stale Node backend process (PID 28948) bound to port 5000, not by the source in this checkout. The message does not exist in the current project source. After stopping that stale process and starting this checkout's backend on port 5000, the same authenticated JPEG preview returned local OCR output normally.

### Verification

- `node --test test/*.test.js` in `backend`: passed (40 tests), including actual local OCR against generated JPEG timetable fixtures with abbreviated weekdays and a separate faculty table, OCR substitutions/split labels, AM/PM headings, vertical baseline offsets, stacked sections, partial rows, image-structure diagnostics, unreadable JPEG handling, WebP, searchable PDF, CSV/TSV/text parsers, and planner/attendance behavior.
- Backend syntax checks passed for document extraction/parsing and import/academic controllers.
- `npm.cmd run build` in `frontend`: passed (41 modules transformed) after adding a manual-preview recovery button.
- Authenticated HTTP + MongoDB integration using the generated JPEG: preview returned four entries; a corrected class was saved; reloading the timetable returned it; a second test account did not see the first account's record. Temporary test records/accounts were deleted.
- Reproduced the user's exact 503 message from the stale port-5000 process, identified its PID, stopped it, and restarted the current backend on port 5000. Repeated the authenticated JPEG preview after restart: HTTP 200, `tesseract.js-local-ocr`, and four day/period-aligned rows; MongoDB corrected-row save/reload passed; a second account saw zero rows; unauthenticated preview returned 401. Temporary integration users, subjects, and timetable entries were removed.
- Backend startup check: `node server.js` connected to MongoDB and listened on port 5000 successfully. Startup still logs a pre-existing duplicate StudyPreferences index warning.
- No user-supplied image was found in the workspace; the generated fixture is not claimed to represent the user's photo. The image workflow was exercised end-to-end through authenticated API and MongoDB, but not in a live browser. PDF selectable-text and CSV behavior are covered by parser tests; manual-entry UI remains present and uses the same tested academic create/list routes.
- Existing Mongoose startup emitted a duplicate `{ user: 1 }` index warning for `StudyPreferences` during integration; the timetable integration succeeded. This warning is unrelated to OCR and remains known.
- After the parser changes, the running authenticated HTTP preview returned HTTP 200 with `tesseract.js-local-ocr` and the expected four fixture rows (Monday Mathematics/Physics, Tuesday Programming/Tutorial), all with complete time ranges.
- Authenticated HTTP + MongoDB integration using the abbreviated JPEG fixture returned 22 timetable rows across Monday-Friday; one corrected/matched row saved and reloaded, a second user saw zero records, and unauthenticated preview was rejected (401). Temporary users, subjects, and rows were deleted. OCR-ambiguous period headers remain flagged for correction instead of receiving guessed times.

### Remaining / next

- Test representative real student photos, especially rotated/low-light and dense multi-section tables; layout and section detection remain heuristic and may require correction in preview. Rotation correction and image enhancement are not implemented.
- Add browser-level coverage for camera/gallery selection, editable preview, and manual entry.
- Validate the Phase 2 import and correction interface in a browser using representative student documents before sign-off. No student-provided photo was present in the workspace; tests used the generated JPEG fixture.
- The latest user-reported photo itself is still unavailable in the repository/workspace. The added abbreviated timetable JPEG is a generated raster fixture used to exercise the real OCR engine, not a substitute claim that the supplied college photo was recognized.

## Existing exam planner workspace (revised roadmap Phase 5)

Implemented an authenticated, deterministic study planner using confirmed exams, syllabus topics, weekly timetable classes, academic calendar dates, and student supplied study preferences. No AI provider is configured; generated schedules and recommendations use local deterministic logic and factual Acadova records only.

### Existing planner features

- Upcoming exams shown chronologically with days remaining, syllabus completion, and plan status.
- Per-user study window, daily available hours, session/break length, study weekdays, priority subjects, and weekly commitments.
- Sessions scheduled from unfinished confirmed syllabus topics, before their associated exam, within configured days and time windows.
- Timetable classes, calendar event dates, weekly commitments, and existing terminal sessions are avoided as conflicts.
- Insufficient capacity and exam subjects without syllabus topics are reported without inventing study topics or topic importance.
- Sessions can be completed, skipped, edited for duration, or rescheduled. Regeneration retains completed/skipped history and reuses matching planned records when possible.
- Routes are protected by existing authentication middleware; all planner queries and session updates scope by the authenticated user. Priority subject IDs are checked for ownership.
- Responsive planner page linked from the dashboard.

## Current state

Phase 3 attendance functionality is present in the existing Acadova application. Subject, timetable, authentication, and academic records were confirmed in the current codebase. Attendance routes use the existing authentication middleware; controllers derive ownership from the authenticated user.

### Implemented

- Per-user attendance records with subject and optional timetable references, date, status, notes, and timestamps.
- Present, absent, and cancelled statuses. Cancelled sessions are excluded from conducted and attended totals.
- Create, list, update, and delete operations, with a unique per-user scheduled class/date index and a conflict response for duplicates.
- Timetable-driven class listing for a selected date and one-week upcoming class view.
- Subject and timetable ownership checks, including weekday and subject consistency checks.
- Overall and per-subject attendance summaries, safe/no-data states, target status, absence allowance, and recovery count.
- Per-user 75% or 80% target setting.
- Backend future scenario calculations that do not create attendance records.
- Selection of upcoming timetable sessions as planned absences, projected per subject without adding them to actual history.
- Future Present/Absent record creation is rejected; known future cancellations remain recordable.
- Manual unscheduled records, history editing/deletion, and date selection are available.

## Verification run

- `node --test test/documentImport.test.js test/attendanceCalculator.test.js`: passed (18 tests after Phase 3 calculation edge coverage was added).
- `node --check` on the attendance controller and related backend code: passed in the implementation session.
- `npm.cmd run build` in `frontend`: passed after the latest attendance UI changes.
- MongoDB-backed API tests for CRUD, duplicate conflicts, and cross-user access were not run. No live database workflow was exercised.
- Phase 4: `node --test test/studyPlanner.test.js test/studyPlannerController.test.js test/attendanceCalculator.test.js test/documentImport.test.js`: passed (26 tests), including scheduler conflicts, insufficient availability, completed topics, preferences validation, owner-scoped lookups, and rescheduling conflicts/free slots.
- Phase 4: `node --check` for the planner controller, route, models, scheduler/recommendation services, and app mount: passed.
- Phase 4: `npm.cmd run build` in `frontend`: passed (40 modules transformed).
- No known failing tests or build errors remain from Phase 4. No live MongoDB or browser workflow was exercised; persistence, MongoDB unique-index creation, and cross-account integration remain unverified.

## Remaining work

- Exercise authenticated create/list/edit/delete flows, duplicate prevention, invalid input handling, and cross-user isolation against a test MongoDB instance.
- Verify selected planned absences produce projections while attendance history remains unchanged in a browser session.
- Consider adding automated route/controller tests with a disposable MongoDB test setup.
- Exercise planner preference persistence, generation/regeneration persistence, session status edits, and rescheduling against a test MongoDB instance and browser.
- Verify conflict handling and cross-user isolation with two authenticated accounts against a test database.

## Next task

Complete browser-level Phase 2 validation with representative student documents. Decide whether scanned-PDF rasterization is required before Phase 2 sign-off. Then begin the revised Phase 4 Personal Organizer; the existing exam planner workspace is Phase 5 in the revised roadmap.

## Phase 3 Today Dashboard continuation

### Implemented

- Replaced the static dashboard landing content with the authenticated student's local Today view: current date and weekday, chronological scheduled classes, start/end times, location/session type, actual attendance state, and subject attendance status.
- Added owner-scoped `GET /api/attendance/today?date=YYYY-MM-DD`, combining the student's timetable, confirmed attendance, separate class intentions, target, confirmed calendar holidays, and the next five saved exams. Missing calendar data is not treated as a holiday.
- Added persisted `attend` / `miss` intentions in a separate `ClassIntention` collection with a unique `{ user, timetableEntry, date }` index. These plans are not attendance records and do not affect calculations.
- Added protected `PUT /api/attendance/intentions` and `DELETE /api/attendance/intentions/:id`; both scope records to the authenticated user. Intentions are refused when actual attendance is already recorded.
- Added separate Present/Absent confirmation actions on the dashboard, retaining the existing attendance API and duplicate scheduled-class/date constraint.
- Added below-target, near-target, comfortable, and no-data indicators using confirmed attendance counts and the student's existing 75%/80% target. Empty timetable and confirmed-holiday states link to the existing calendar/timetable pages.
- Included upcoming exams from existing records. No assignment model/data exists, so no assignment items are fabricated. The dashboard does not use external AI services.
- Removed class intentions when their timetable entry or parent subject is deleted.

### Files created or modified for Phase 3

- Created `backend/models/ClassIntention.js` and `backend/services/todayDashboard.js`.
- Modified `backend/controllers/attendanceController.js`, `backend/controllers/academicController.js`, `backend/routes/attendanceRoutes.js`, and `backend/services/attendanceCalculator.js`.
- Added `backend/test/classIntention.test.js` and `backend/test/todayDashboard.test.js`; extended `backend/test/attendanceCalculator.test.js`.
- Modified `frontend/src/pages/Dashboard.jsx`, `frontend/src/lib/api.js`, and `frontend/src/styles.css`.
- Updated `PROJECT_PROGRESS.md`.

### API and schema notes

- `GET /api/attendance/today?date=YYYY-MM-DD` returns classes, actual records, plans, subject summaries, holiday status, target, and upcoming exams for the authenticated student.
- `PUT /api/attendance/intentions` accepts `{ timetableEntry, date, intention }`, where intention is `attend` or `miss`.
- `DELETE /api/attendance/intentions/:id` removes only the authenticated user's intention.
- Added the `ClassIntention` Mongoose schema with a unique per-user timetable-entry/date index. Existing attendance uniqueness and actual attendance records remain unchanged.

### Verification

- `node --test` in `backend`: passed, 71 tests (0 failures), including calculation boundaries, no-data, safe absences/recovery classes, plan/record separation, empty timetable/holiday behavior, authenticated route registration, ownership checks, and duplicate constraints.
- Backend `node --check` passed for all modified controller, route, service, model, and test files.
- `npm.cmd run build` in `frontend`: passed; Vite transformed 41 modules.
- No live MongoDB-backed API or browser session was exercised. The integration behavior, database index creation on deployment, and two-account cross-user isolation remain outstanding manual checks.

### Manual local verification

1. Start MongoDB and configure the backend as usual; from `backend`, run `npm.cmd run dev` on Windows (`npm run dev` on other platforms).
2. From `frontend`, run `npm.cmd run dev` on Windows (`npm run dev` on other platforms), sign in, and confirm the dashboard shows today's date and weekday.
3. Add a subject and weekly timetable entry for today. Reload the dashboard and verify class order, time range, and optional location.
4. Choose “Plan to attend” or “Plan to miss”; verify the plan label changes. Confirm that attendance totals remain unchanged.
5. After class, use “Confirm present” or “Confirm absent”; verify the actual state and subject percentage update. To check a live duplicate, replay the successful `/api/attendance/records` request from the browser Network panel; it should return HTTP 409.
6. Add a confirmed holiday spanning today in the academic calendar; verify the holiday banner. Remove it and confirm an ordinary empty timetable is not labeled a holiday.
7. Add a future exam and verify it appears under Upcoming examinations. Confirm no assignment data is displayed unless an assignment feature is added in a future scope.
8. Repeat with a second account to manually confirm records and plans are isolated by user.

Phase 3 dashboard work is complete for this request. No Phase 4 work was started as part of this continuation.

## Phase 4 Personal Organizer and Assignment Manager

### Implemented

- Added a MongoDB-backed `OrganizerTask` model for authenticated students. Tasks have title, optional description, category, required due date, optional due time, priority, pending/completed status, and Mongoose creation/update timestamps.
- Added a compound `{ user, status, dueDate }` index for the task list and dashboard date/status queries.
- Added protected task list/create/update/delete endpoints under `/api/tasks`. All reads and writes derive ownership from `req.user.id`; supplied user fields are ignored. Task title, category, date, time, priority, and status are validated on the backend, including real calendar-date validation.
- Added all, today, upcoming, overdue, and completed task views plus category/status/priority filters. Dashboard retrieval returns all pending overdue tasks and up to five upcoming deadlines, with due-today tasks grouped separately.
- Added the authenticated `/organizer` page, quick-add review flow, editable task form, task filters, completion/reopen controls, and deletion. Quick-add recognizes today, tomorrow, day + month (current year only when not already past), and unambiguous DD/MM/YYYY dates. Unknown, invalid, or ambiguous dates stay blank and require manual selection.
- Added dashboard organizer summary with due-today tasks, overdue tasks, a limited upcoming preview, quick-add, completion action, and a link to the full Organizer. Both screens use the same task records and API.
- Used ordinary JavaScript only; no paid AI API, new dependencies, or duplicate assignment records were added.

### Files created or modified

- Created `backend/models/OrganizerTask.js`, `backend/controllers/organizerController.js`, and `backend/routes/organizerRoutes.js`.
- Modified `backend/app.js` to mount the protected organizer API.
- Added `backend/test/organizerController.test.js`.
- Added `frontend/src/lib/quickTask.js`, `frontend/src/components/OrganizerTasks.jsx`, `frontend/src/pages/OrganizerPage.jsx`, and `frontend/test/quickTask.test.js`.
- Modified `frontend/src/App.jsx`, `frontend/src/lib/api.js`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/styles.css`.
- Updated `PROJECT_PROGRESS.md`.

### API and database changes

- `GET /api/tasks?view=all|today|upcoming|overdue|completed&date=YYYY-MM-DD&category=...&status=...&priority=...`
- `GET /api/tasks?view=dashboard&date=YYYY-MM-DD` returns `{ tasks: { today, overdue, upcoming } }`; upcoming preview is limited to five, overdue tasks are not capped.
- `POST /api/tasks` creates a task. `PUT /api/tasks/:id` updates only provided, validated fields, including completion/reopening via status. `DELETE /api/tasks/:id` deletes the authenticated user's task.
- Added the `OrganizerTask` collection and its compound index. No existing academic, attendance, or study-planner schema was repurposed.

### Verification

- `node --test` in `backend`: passed (82 tests, 0 failures), including task CRUD, validation, owner scoping, filters, dashboard grouping, and completion/reopening.
- `node --test test/quickTask.test.js` in `frontend`: passed (5 tests) for relative dates, specific month dates, numeric date handling, invalid/ambiguous dates, and missing input.
- Backend `node --check` passed for app mounting, organizer controller/routes/model, and organizer tests.
- `npm.cmd run build` in `frontend`: passed; Vite transformed 44 modules.
- No live MongoDB-backed/browser integration was run. MongoDB persistence/index creation and end-to-end account isolation still need manual verification.

### Manual verification

1. Start MongoDB, then start the backend from `backend` with `npm.cmd run dev` on Windows. Start the frontend from `frontend` with `npm.cmd run dev`.
2. Sign in, open **Organizer**, and quick-add “Submit DBMS assignment tomorrow”. Confirm the detected title/date, edit if needed, select priority, and confirm save.
3. Check that the task appears in All tasks and Upcoming/Today as appropriate. Edit the title, due date, category, time, and priority, then save.
4. Mark it complete; verify it disappears from pending views and appears in Completed. Reopen it and confirm it returns to pending views. Delete a test task.
5. From Dashboard, quick-add another task and mark it complete. Visit Organizer and verify the same record/status is shown there.
6. Try an ambiguous numeric date such as `10/11/2026`, an invalid date such as `31/02/2026`, and an unrecognized phrase. Verify no date is silently selected and manual selection is required.
7. Sign in as a second student and verify the first student's tasks are absent; attempt to update/delete a task ID from the other account and expect a not-found response.

### Known limitations

- Quick-add deliberately supports a small date vocabulary and does not infer dates from arbitrary natural language. Two-digit numeric dates with both day and month at or below 12 are treated as ambiguous. Date-only inputs without an explicit year that would land in the past are left for manual year selection.
- Dashboard shows all overdue tasks and the five nearest upcoming pending tasks. More advanced recurring tasks, reminders, notifications, and assignment-to-subject links are outside this phase.
- Database and browser workflows require local verification; mocked controller tests do not exercise a running MongoDB instance.

## Phase 5: Exam Planner and Smart Study Scheduler

### Implemented

- Reused the existing authenticated exam CRUD, subject/syllabus records, study availability preferences, timetable, academic calendar, Organizer tasks, and study-session model. No paid AI service is used.
- Added three-state syllabus topic progress (`Not Started`, `In Progress`, `Completed`) to the existing syllabus flow. The existing `completed` boolean remains synchronized for compatibility with older records and consumers.
- Improved deterministic scheduling to prioritize nearer exams, include unfinished/in-progress topics, avoid class/commitment/calendar conflicts, avoid assignment due dates, and never schedule a topic on or after its examination. Completed or skipped sessions are not regenerated on the same topic/date.
- Pending assignment due dates are reserved as unavailable dates; assignment workload is not inferred because tasks do not carry a reliable estimate.
- Added a plan preview/review step before replacing the current plan. Applying requires an explicit confirmation and preview hash; completed/skipped history is retained. The existing owner/topic/date unique index prevents duplicate study sessions.
- Added owner-scoped planner dashboard data for today's sessions, nearest upcoming examination, syllabus preparation progress, and configured availability. The Today Dashboard now shows this information and supports completing/skipping today's sessions.
- Added owner-scoped deletion for individual sessions. Existing session edits and completion/skipping remain available. Completing a session does not automatically complete its syllabus topic.
- Improved planner empty states and responsive styling, with links to exams, syllabus topics, manual Organizer tasks, and the complete planner.
- Corrected a scheduler date comparison so candidate study dates are compared as ISO calendar dates and validated to remain strictly before the exam.

### Files changed

- Backend: `backend/services/planner/generatePlan.js`, `backend/services/planner/recommendations.js`, `backend/models/Academic.js`, `backend/controllers/academicController.js`, `backend/controllers/studyPlannerController.js`, `backend/routes/studyPlannerRoutes.js`.
- Backend tests: `backend/test/studyPlanner.test.js`, `backend/test/studyPlannerController.test.js`, and new `backend/test/academicProgress.test.js`.
- Frontend: `frontend/src/lib/api.js`, `frontend/src/pages/AcademicPage.jsx`, `frontend/src/pages/StudyPlannerPage.jsx`, `frontend/src/pages/Dashboard.jsx`, and `frontend/src/styles.css`.
- Documentation: `PROJECT_PROGRESS.md`.

### API and database changes

- Added `GET /api/study-planner/dashboard` for owner-scoped Today Dashboard study data.
- Added `POST /api/study-planner/preview` to calculate proposed plan changes without persisting them.
- `POST /api/study-planner/generate` now requires `{ confirmed: true, previewHash }`; stale previews return a conflict and must be reviewed again.
- Added `DELETE /api/study-planner/sessions/:id`, scoped to the authenticated student. Existing preferences, overview, session list, and session update routes remain in place.
- Extended the existing syllabus topic schema with a progress enum while keeping the legacy completion boolean synchronized. No new exam, syllabus, preferences, or study-session collections were introduced.

### Verification

- `node --test` in `backend`: passed (97 tests, 0 failures), including scheduler ordering, timetable/commitment/calendar/assignment conflicts, no scheduling on/after exams, topic progress, preference validation, owner scoping, session completion/skipping/deletion, and dashboard data/empty state.
- `node --test` in `frontend`: passed (5 tests).
- `npm.cmd run build` in `frontend`: passed; Vite transformed 44 modules.
- `node --check` passed for modified backend implementation and test files.
- No live MongoDB-backed or browser end-to-end verification was run. Real database index creation and cross-account behavior still need local verification.

### Manual verification

1. Start MongoDB, run the backend from `backend` with `npm.cmd run dev`, and run the frontend from `frontend` with `npm.cmd run dev`. Sign in with an account containing real academic data.
2. On **Exams**, create an upcoming exam for an owned subject, optionally with both start and end times. Confirm invalid one-sided or reversed time ranges are rejected.
3. On **Syllabus**, add topics for that subject and move a topic through Not Started, In Progress, and Completed. Verify subject completion counts update.
4. On **Study Planner**, set available study days and a daily study window; save the preferences. Add real timetable classes and calendar events if needed to verify scheduling avoids those conflicts.
5. Preview a plan, inspect proposed dates/topics and any unscheduled-topic/assignment-date notices, then confirm. Regenerate after changing availability and verify the review step reports changes and completed/skipped history remains.
6. Edit, complete, skip, and remove a session. Verify session completion does not change topic progress unless you separately update the topic on **Syllabus**.
7. Check **Dashboard** for today's sessions, the nearest exam, and preparation progress. Complete/skip a session there and verify the same record/status appears in **Study Planner**.
8. Add a pending assignment in **Organizer** with a due date in the planning window and confirm that date is disclosed and reserved.
9. Sign in as a second student and verify that the first student's exams, topics, preferences, sessions, and dashboard data are not visible or editable.

### Remaining limitations

- Organizer tasks currently have no reliable subject association or work-duration estimate. Pending assignment due dates are conservatively blocked for the entire day; assignment study sessions are not fabricated. Manual study tasks created in Organizer remain separate from topic-based study sessions.
- The scheduler creates sessions for confirmed, unfinished syllabus topics. Subjects without syllabus topics remain visible and do not block planning, but require a manual Organizer task until real topics are added.
- MongoDB persistence/index rollout and browser flows require local verification; the automated tests use deterministic logic or mocked model operations rather than a running database.

## Submission readiness

### Implemented features verified in the current repository

- secure authentication and route protection
- subject, timetable, exam, syllabus, and calendar management
- attendance tracking with target warnings and safe-miss/recovery guidance
- organizer task management
- study planner and session generation
- rule-based Copilot-style responses

### Partially implemented or environment-dependent features

- live browser validation against a running MongoDB instance
- advanced OCR tuning for difficult academic timetable images

### Incomplete features

- any unverified end-to-end workflow that has not been run with a real database and active web UI
- optional enhancements that are not required for the core presentable workflow

### Tests actually executed

- Backend: `cd backend && node --test test/*.test.js` — passed
- Frontend build: `cd frontend && npm run build` — passed

### Known bugs / risks

- no critical code-level defect was identified in the current repository state
- the app still requires a valid local `.env` setup and MongoDB instance to run successfully
- document OCR remains a heuristic workflow and should be treated as review-assisted rather than fully autonomous

### Documentation created for presentation and viva preparation

- `docs/PROJECT_PRESENTATION.md` — a 10-slide academic presentation with slide content and speaker notes aligned to the actual repository.
- `docs/VIVA_QUESTIONS.md` — viva preparation with technical answers covering architecture, security, calculations, OCR limitations, and project-specific implementation details.
- `docs/PROJECT_DEMO_SCRIPT.md` — a concise, reliable 5-minute demonstration script focused on the working core workflow.

### Submission recommendation

The current project is ready for demonstration and academic submission within the limits of its implemented functionality, provided the evaluator runs it with a local MongoDB instance and the required environment variables. The project should be presented using the currently verified workflow and should not claim unsupported advanced features.

## Timetable OCR local-only revision (2026-10-30)

### Audit and changes

- The timetable preview used bundled Tesseract.js, but sent images to OpenAI Vision when local extraction was incomplete or uncertain. This fallback could not work after API credits were exhausted and was a paid external dependency.
- Coordinate parsing paired time endpoints on the same OCR line only, so vertically stacked start/end labels were missed. Candidate OCR selection also discarded useful high-confidence header words from other local preprocessing passes.
- Replaced the paid fallback with local-only Tesseract.js preview handling. Local extraction errors are shown to the student, who can continue with the existing manual preview or manual timetable form. No document is saved until confirmation.
- Added coordinate-based pairing for stacked time headers, candidate-header word merging, ambiguity rejection when a subject cell is centered between two periods, separate break/lunch detection, and timetable faculty lookup from code/name/faculty tables.
- Faculty is editable in the import preview and is stored on the confirmed timetable entry. The existing manual timetable form also accepts faculty.
- The frontend explicitly states that timetable image OCR is local and does not use a paid vision API. Removed the OpenAI fallback implementation and its provider-specific tests/configuration.

### Free OCR evaluation and local operation

- PaddleOCR was evaluated but not integrated. The current backend is Node.js-only; this environment has no `paddle` or `paddleocr` package installed. Adding PaddleOCR would require provisioning a Python runtime, installing Paddle dependencies, and managing local model files. The existing Tesseract.js 6 engine and English model are already bundled and work offline, so retaining it avoids adding a separately operated service and large model-download lifecycle.
- Existing `sharp` preprocessing is retained: EXIF auto-orientation, bounded resizing, grayscale conversion, contrast normalization, sharpening, and a thresholded candidate. No OpenCV/Paddle packages or paid API dependencies were added. Arbitrary-angle deskewing and adaptive thresholding remain limitations.
- Install and run the OCR path with `cd backend`, `npm install`, and `npm run dev`. There is no separate OCR server. The authenticated `POST /api/imports/timetable/preview` endpoint runs extraction and returns editable rows; the student confirms before rows are saved.
- Backend OCR dependencies already present in `backend/package.json`: `tesseract.js` 6.0.1, `@tesseract.js-data/eng` 1.0.0, and `sharp` 0.35.5. No dependency manifest changes were needed.

### Accuracy evidence (generated test images only)

| Fixture | Weekday detection | Subject extraction | Exact time pairs | Subject-to-time mapping |
|---|---:|---:|---:|---:|
| Clear two-day timetable, 4 cells | 4/4 | 4/4 | 4/4 | 4/4 |
| Low-contrast version, 4 cells | 4/4 | 4/4 | 4/4 | 4/4 |
| Dense five-day timetable, 22 cells | 22/22 | 22/22 | 18/22 | 18/22 |
| 600x450 compressed low-resolution version | No reliable rows; manual review required | — | — | — |

- These figures are regression measurements against generated fixtures, not a claim of accuracy on arbitrary student or college images. Missing dense-table headers remain blank/flagged rather than being assigned to a guessed period. No representative user-provided photo was available.
- Tests also cover stacked time headers, ambiguous column centers, break periods, separate faculty tables, CSV faculty, OCR failure/manual recovery, and local-only preview behavior.

### Validation

- `node --test test/documentImport.test.js test/timetablePreview.test.js` in `backend`: passed (30 tests), including accuracy measurements.
- `node --test test/*.test.js` in `backend`: passed (89 tests).
- `npm.cmd run build` in `frontend`: passed.
- Backend syntax checks for the modified parser, extractor, import/academic controllers, and academic model: passed.

## Universal timetable-to-CSV conversion (2026-10-30)

### Changes

- Added one canonical CSV format (`subject,subject_code,day,start_time,end_time,faculty,location,session_type`) for timetable imports. Serialization uses a UTF-8 BOM, escaped CSV fields, and 24-hour times.
- Added canonical normalization, weekday/header aliases, validation for missing or invalid values, row-level duplicate and overlap warnings, and merging of contiguous laboratory periods so they do not create duplicate attendance sessions.
- Extended extraction to use positioned text for digital PDFs, local OCR for scanned PDFs and images, and worksheet-row conversion for XLSX. Existing CSV uploads are normalized through the same format.
- Routed extracted rows through the existing timetable parser and owner-scoped academic create API; no competing importer, persistence endpoint, or database schema was added.
- Expanded the import preview for original-file review, editable normalized rows, warnings, canonical CSV download, and explicit confirmation before saving. Existing manual timetable entry remains available.
- Corrected a positioned-header regression: fallback time-header grouping now runs only when positioned time headers were not found, avoiding duplicate or guessed period columns.

### Validation and limitations

- `node --test test/*.test.js` in `backend`: passed (101 tests), including existing image OCR fixtures, digital/scanned PDF extraction, XLSX, CSV normalization/round-trip, layout variations, laboratory merging, validation, and preview behavior.
- `npm.cmd run build` in `frontend`: passed.
- Focused positioned-OCR and low-resolution/abbreviated OCR regression tests passed. Accuracy tests use generated fixtures; they do not establish universal accuracy for arbitrary college timetables.
- MongoDB persistence was not exercised against a live database in this work. Students must review and confirm extracted rows before the existing authenticated save flow runs.
- The backend dependency audit still reports unrelated existing advisories in `body-parser`, `mongoose`, and `qs`; these were not changed as part of timetable conversion.

## Senior Developer Continuation & Stabilization (2026-11-14)

### Issues Resolved

1. **Manual Timetable Entry with Empty sessionType**:
   - Resolved schema enum validation failure where empty strings in manual forms became `null`, causing Mongoose enum validation rejections. Added a setter to `sessionType` in `models/Academic.js` and payload normalization in `academicController.js` and `AcademicPage.jsx`.
2. **UTC vs. India Timezone Handling**:
   - Added `timetableWeekdayForDate` and `applicationWeekday` to `applicationDate.js`. Standardized `copilotAssistant.js`, `organizerController.js`, and `attendanceController.js` on `applicationDateString()`.
3. **Copilot Exam NaN Days & Undefined Study-Session End Times**:
   - Fixed `getExamDaysRemaining` to safely extract date components from Mongoose Date objects or ISO strings without double appending `T00:00:00.000Z`.
   - Replaced undefined `session.endTime` with computed end time from `session.startTime` and `session.durationMinutes`.
4. **Copilot Intent Routing Overhaul**:
   - Fixed route precedence so questions like "What classes should I attend today?" route to Timetable instead of Attendance.
   - Fixed greedy `what.*today` regex pattern that was incorrectly routing study queries into timetable.
   - Added clean routing for Notes, Timetable without 'today', Exams, Study Plan, and Syllabus.
5. **Subject Deletion Confirmation**:
   - Added explicit confirmation prompt with warning detailing cascade deletion of classes, attendance records, exams, syllabus, and study sessions.
6. **Study Planner Rescheduling**:
   - Guarded `assertSessionSlot` when `session.exam` is null. Handled E11000 duplicate session slots with HTTP 409 responses. Added `useEffect` in frontend `SessionCard` to keep draft synchronized when props change.
7. **Attendance Duplicate Prevention**:
   - Added unique partial index `{ user: 1, subject: 1, date: 1 }` with `{ timetableEntry: null }` in `models/Attendance.js` to prevent duplicate manual attendance records. Handled E11000 in `createRecord` and `updateRecord`.
8. **Today Dashboard Refinements**:
   - Added faculty display in each class card, using `entry.teacher || subject.teacher`.
   - Prominently styled and formatted the "Today is a College Holiday!" banner, displaying holiday details and showing pending tasks and study actions instead of normal classes.
9. **Timetable CSV Export**:
   - Added an "Export Timetable (CSV)" button in `AcademicPage.jsx` when viewing timetable, allowing instant export of saved timetable rows in the canonical CSV format.
10. **Unified Navigation**:
    - Synchronized main navigation bars across `Dashboard`, `AcademicPage`, `AttendancePage`, `StudyPlannerPage`, `OrganizerPage`, and `CopilotPage`.

### Verification

- `cd backend && node --test`: 108 tests passed (0 failures).
- `cd frontend && node --test test/*.test.js`: 5 tests passed (0 failures).
- `cd frontend && npm.cmd run build`: Vite production build passed (46 modules transformed).

## Timetable Extraction Debugging & Prevention of Corrupted Data (2026-11-14)

### Problem Statement & Root Cause Analysis

When uploading timetable images or scanned documents, the preview previously allowed corrupted strings (e.g., `"or =] | [van smn = T= | wma ||| [| wy on || uu me || de i [seca IE 100 Pw ow [[TORRE]"`) to be treated as valid subject names, with missing codes, start times, end times, faculty, and locations. Furthermore, these incomplete/corrupted rows were allowed to reach the preview and confirmation stages.

Root causes identified and addressed:
1. **Horizontal Clustering Across Table Grid Borders**:
   - OCR token clustering grouped words based on horizontal distance thresholds alone. Table vertical grid lines and borders (`|`, `|||`, `[|`, `---`, `=]`) bridged the gaps between distinct timetable columns, causing horizontal token chains across period boundaries.
2. **Header Fallback Clobbering**:
   - In `parsePositionedWords`, running `rangePattern` line searching unconditionally when `positionedTimeHeaders` had already extracted precise column coordinates caused duplicate, missing, or merged period headers.
3. **Delimiter Detection Collision on Image OCR**:
   - Delimiter detection (`/,|\t/.test(...)`) triggered on ordinary image OCR text containing commas, routing raw image OCR output into the CSV parser, resulting in empty, unmapped rows.
4. **Location Keyword Collision**:
   - The regex `/\b(?:room|rm|lab|classroom)\s*[:#-]?\s*[A-Z0-9-]+/i` lacked a word boundary after `lab`, causing words like `"Laboratory"` to match as a location (`lab` + `oratory`) and strip period end times.
5. **No Strict Import Validation or Garbage Rejection**:
   - OCR garbage strings (low vowel ratios, high symbol ratios, fragmented single-character tokens) were not discarded prior to cell mapping.
   - The UI permitted importing rows with missing subjects, unverified weekdays, or invalid time ranges.

### Technical Solutions & Implementation

1. **OCR Noise & Garbage Filtering (`backend/services/documents/parseTimetable.js`)**:
   - `isBorderArtifact(text)`: Identifies and strips standalone table borders, dividers, and noise symbols (`|`, `|||`, `[|`, `=]`, `==`, `---`).
   - `cleanCellText(text)`: Strips leading/trailing border punctuation while preserving internal quotes and legitimate abbreviations.
   - `isCorruptedOrGarbage(text, words)`: Analyzes symbol-to-alphanumeric ratio, noise tokens, word fragmentation, vowel ratio (< 15% in multi-word text), and OCR confidence (< 35%) to reject hallucinated or garbage text.
2. **Timetable Structure Recognition**:
   - **Transposed Layouts**: Implemented `transposeWordCoordinates(words)` and `parseTransposedLayout(lines, dayRows)` to support timetables with weekdays in columns and period times in rows.
   - **Stacked & Separate Time Headings**: Added `positionedTimeHeaders` reading separate start-time (`startTimeX`) and end-time (`endTimeX`) headers.
   - **Merged Laboratory Periods**: Enhanced cross-column lab detection (`isLabOrPractical || isWideSpan` where width > 1.25x average column width) to merge laboratory blocks across periods without duplicate attendance sessions.
   - **Break/Lunch Filtering**: Dedicated detection for break, lunch, and recess periods with appropriate metadata marking.
3. **Prevention of Incorrect Imports & Strict Validation**:
   - Strict row classification: `status: 'valid' | 'needs-review' | 'invalid'`.
   - A row is classified as `invalid` if it is missing a subject, has an unverified weekday, has invalid start/end times, or has end time earlier than start time.
   - Missing optional fields (`teacher`, `location`, `subjectCode`, `sessionType`) remain allowed and do not invalidate a row.
   - If extraction cannot identify structured rows or only produces garbage, an HTTP 422 error is returned with an actionable message: `"Unable to confidently recognize this timetable. Please correct the information manually or verify the image quality."`
4. **Enhanced Extraction Preview (`frontend/src/components/TimetableImport.jsx`)**:
   - Added confidence pills (`{row.confidence}% confidence`) with high/medium/low visual indicators.
   - Added original detected text display: `Detected text: <code>...</code>`.
   - Added status badges: `Successfully recognized` (green), `Needs review` (amber), and `Invalid · Missing required fields` (red).
   - Added an editable `Subject Code` field.
   - Added a top summary bar displaying valid, needs review, and invalid counts.
   - Added a `"Remove invalid rows ({invalidCount})"` button for one-click cleanup of uncorrectable rows.
   - Blocked `"Confirm and import"` button whenever any invalid rows remain or required fields are missing, with clear instructions explaining what needs correction.
5. **Universal 8-Column CSV Preservation**:
   - Maintained canonical format: `subject,subject_code,day,start_time,end_time,faculty,location,session_type`.
   - Full round-trip support: Preview rows can be exported to canonical CSV and re-imported cleanly.

### Verification & Test Suite

- **Comprehensive Test Suite Added (`backend/test/timetableExtraction.test.js`)**:
  - Tests border artifact detection and cell text cleaning.
  - Tests garbage rejection and noise row dropping.
  - Tests free-text inline subject legends with instructor names.
  - Tests laboratory multi-column merging and break/lunch detection.
  - Tests validation status classification and HTTP 422 rejection on unreadable timetables.
- **Backend Tests**: `cd backend && node --test` -> **133 tests passed, 0 failures** across all test suites.
- **Frontend Unit Tests**: `cd frontend && node --test test/quickTask.test.js` -> **5 tests passed, 0 failures**.
- **Frontend Production Build**: `cd frontend && npm.cmd run build` -> **Built successfully in 341ms** (46 modules transformed, zero errors/warnings).

## Core Engine Development: Backend Connectivity, Academic Calendar Extraction & Timetable Integration (2026-11-15)

### 1. Root Cause of Backend Connectivity Issues & Systemic Fix
**Problem**: The application repeatedly displayed `"Cannot reach the Acadova server. Check your connection and try again."` on Login and Academic Calendar import pages.
**Root Causes Identified**:
1. **Missing Vite Dev Proxy**: `frontend/vite.config.js` lacked an `/api` proxy configuration. Frontend requests defaulted directly to `http://localhost:5000/api`. If the user accessed the frontend via `127.0.0.1` or network IP, cross-origin fetch requests failed due to CORS and browser cookie cross-site blocking.
2. **CORS Restrictions & Header Blocking**: `backend/app.js` CORS origin check strictly checked `CLIENT_URL` (only `http://localhost:5173`), rejecting `127.0.0.1` and alternate dev ports. Custom header `X-File-Name` was missing from explicit `allowedHeaders`.
3. **Payload Limit Conflicts**: File upload limit was hardcoded to 12MB. Multi-page scanned PDFs or high-resolution timetable images caused immediate connection termination or 413 rejections.
4. **Server Startup Crash on Database Connection**: `backend/server.js` terminated with `process.exit(1)` immediately if MongoDB was starting or temporarily disconnected, leaving port 5000 dead.
5. **Error Masking in `api.js`**: `catch` blocks discarded the underlying `Error` object, preventing developers from seeing exact network or CORS failure reasons in console.

**Fixes Applied**:
- Configured Vite reverse proxy in `frontend/vite.config.js` to route `/api` to `http://127.0.0.1:5000`.
- Standardized `frontend/src/lib/api.js` to default `BASE_URL` to `'/api'` in browser environments while supporting `VITE_API_URL`.
- Enhanced CORS in `backend/app.js` with regex `/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/` and explicitly allowed headers (`Content-Type`, `Authorization`, `X-File-Name`, `X-Requested-With`, `Accept`).
- Increased file upload and processing limits from 12MB to 25MB across `importRoutes.js`, `extractText.js`, `AcademicImport.jsx`, and `TimetableImport.jsx`.
- Hardened `backend/server.js`: If MongoDB connection fails at startup, the HTTP server still starts, exposes `/api/health`, and schedules automatic background reconnection retries every 5s.
- Added detailed error diagnostics via `console.error` in `frontend/src/lib/api.js`.

### 2. Academic Calendar Extraction Engine
**Features Added (`parseAcademicDocs.js` & `importController.js`)**:
- Full DSCE UG Calendar of Events format support: August to December 2026, 85 working days, 2-digit years (`26` -> `2026`), date ranges (`12.10.2026 to 14.10.2026`), and onwards dates (`21.12.2026 onwards`).
- Complete event classification across 10 calendar types: `holiday`, `working-saturday`, `special-working-day`, `cancelled-class`, `semester-start`, `semester-end`, `exam` (CIE-1/2/3, Lab CIE, SEE Theory), `deadline`, `college`, and `event`.
- Supported semester selection (`3rd Semester` vs `5th Semester` vs `All Semesters`) in backend parser and frontend `AcademicImport.jsx`.
- Calendar summary metrics detection returning total working days (e.g. 85), holidays count, exams count, working Saturdays count, semester commencement, and semester conclusion dates.
- Enhanced `AcademicImport.jsx` with semester dropdown, detected metrics summary bar, and complete 10-type event dropdown.

### 3. Timetable & Academic Calendar Integration
**Features Added (`attendanceController.js` & `attendanceCalculator.js`)**:
- Connected `getSchedule` with `CalendarEvent`:
  - Suppresses scheduled classes on confirmed college holidays.
  - Excludes classes on cancelled class dates (`cancelled-class`).
  - Enforces semester boundaries: never invents classes prior to `semester-start` or after `semester-end`.
  - Maps working Saturdays (`working-saturday`) and special working days (`special-working-day`) following specified weekday timetables.
- Hardened `attendanceCalculator.js` to ensure working Saturdays and special working days use actual subject mappings without inventing fake attendance classes.

### 4. Verification & Test Suite
- **Added Integration Test Suite (`backend/test/academicCalendarExtraction.test.js`)**:
  - Tests DSCE UG Calendar parsing (85 working days, CIE-1/2/3, SEE, holidays, semester commencement/conclusion).
  - Tests 2-digit year normalization (`15.08.26` -> `2026-08-15`).
  - Tests semester-specific filtering (`3rd Sem` vs `5th Sem`).
  - Tests `getSchedule` calendar integration (holiday suppression and semester boundaries).
- **Backend Tests**: `cd backend && node --test` -> **137 tests passed, 0 failures** across all 12 test suites.
- **Frontend Unit Tests**: `cd frontend && node --test test/quickTask.test.js` -> **5 tests passed, 0 failures**.
- **Frontend Production Build**: `cd frontend && npm.cmd run build` -> **Built successfully in 573ms** (46 modules transformed, zero errors/warnings).


