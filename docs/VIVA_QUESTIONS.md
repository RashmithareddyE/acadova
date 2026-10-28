# Viva Questions and Answers: Acadova

## Project understanding

### Q1. What is Acadova?
A: Acadova is a student academic-management system designed to help learners organise subjects, timetables, attendance, examinations, assignments, and study planning in a single application.

### Q2. What problem does it solve?
A: It addresses the common problem of scattered academic information across separate tools and manual records, which makes it difficult to monitor attendance targets, class schedules, deadlines, and revision work.

### Q3. Why did you choose this project?
A: Because it addresses a practical student problem and is aligned with a real academic workflow. It also gives a good balance of backend, frontend, data, and security concepts that are relevant to software engineering.

### Q4. What are its major objectives?
A: To centralise academic data, protect student-specific records, support attendance and timetable management, and provide a structured way to manage assignments, exams, and study preparation.

### Q5. Who are its intended users?
A: The application is intended for students who need a reliable academic dashboard to manage their classes and study workload.

## Architecture

### Q6. Why was React used?
A: React was chosen for the frontend because it supports component-based UI development and is suitable for a modular academic dashboard and route-based application structure.

### Q7. What is the role of Node.js and Express?
A: Node.js and Express provide the backend server and API endpoints. They handle authentication, request validation, data retrieval, business logic, and ownership checks.

### Q8. Why use MongoDB?
A: MongoDB is a suitable NoSQL choice for storing student records, academic data, and related collections with flexible document structures. In this project, it is used with Mongoose models to maintain schema-based validation and persistence.

### Q9. How does the frontend communicate with the backend?
A: The frontend sends HTTP requests to the backend API endpoints. The backend validates the request, checks authentication, and returns JSON responses used by the UI.

### Q10. What happens when a student logs in?
A: The frontend submits login credentials. The backend validates them, checks the user record, and issues a session or token. After that, protected pages and API calls become available to the authenticated student.

### Q11. How is authenticated access enforced?
A: Protected routes and backend middleware verify that the user is logged in before allowing access, and user-scoped queries ensure that a student only sees their own academic data.

## Database and security

### Q12. What are the main database models?
A: The repository contains models for `User`, `Subject`, `TimetableEntry`, `CalendarEvent`, `Exam`, `SyllabusTopic`, `Attendance`, `ClassIntention`, `OrganizerTask`, and study-planner-related models.

### Q13. How are academic records associated with students?
A: Most records include a `user` field referencing the owning `User` document. Queries filter by `user` to ensure each student sees only their own data.

### Q14. How is another student’s data protected?
A: The backend checks the authenticated user before reading or mutating records. If a student attempts to access another student’s data, the query returns no record or the request is rejected.

### Q15. What is API validation?
A: API validation ensures that inputs are in the correct format, required values are present, and business constraints are respected before data is saved. Examples include date validation, time range checks, and attendance-status validation.

### Q16. Why should secrets not be stored in frontend code?
A: Frontend code is visible to the browser and cannot be trusted for secrets. Authentication secrets, JWT signing secrets, and database credentials must remain on the backend or in secure environment configuration.

## Attendance intelligence

### Q17. How is attendance percentage calculated?
A: The attendance calculator in the backend uses confirmed attendance records: percentage is calculated as attended classes divided by conducted classes, where `conducted = present + absent` for confirmed classes. If there are zero conducted classes, the percentage is treated as `null`.

### Q18. How is the 75% requirement handled?
A: The project stores a target value on the user, and the calculation service evaluates whether the current attendance is below, at, or above the target. If a student is below 75%, the system can suggest how many classes must be attended to recover.

### Q19. How many classes can a student miss?
A: The exact answer depends on the current attendance ratio and the configured target. The backend calculates safe-miss and recovery guidance dynamically rather than using a fixed universal number.

### Q20. How are zero conducted classes handled?
A: Zero conducted classes produce no percentage value and no safe-miss allowance. This prevents division-by-zero errors and avoids incorrect performance messaging.

### Q21. Why must planned attendance be distinguished from confirmed attendance?
A: Future planned absences or intentions are not treated as actual attendance. Only confirmed attendance records with a final status count toward the percentage. This prevents the system from counting future plans as completed attendance.

## Timetable and document processing

### Q22. How does timetable entry work?
A: Students add timetable entries with a subject, weekday, start time, end time, and location. The records are stored against the authenticated user and can be displayed by weekday or dashboard view.

### Q23. What OCR technology is currently implemented?
A: The project uses Tesseract.js for local OCR-based document interpretation where supported. It also includes document parsing logic for text, CSV/TSV, and searchable PDFs, depending on the input format.

### Q24. What are the limitations of the existing OCR implementation?
A: OCR quality depends on the quality, clarity, and format of the uploaded schedules. Low-quality, rotated, or complex timetable images may not be parsed correctly and may require manual review.

### Q25. Why might a timetable image be difficult to recognize?
A: Variations in layout, text size, skew, low contrast, or complex timetable structures can reduce the accuracy of OCR and table mapping.

### Q26. What happens when extraction fails?
A: The system should fall back to manual entry or require the user to review and correct the extracted data before saving. The current project is honest that OCR is not always fully reliable.

## Testing and limitations

### Q27. How was the project tested?
A: The repository includes backend tests for attendance and academic logic. The project was also validated by a production frontend build. The exact verified commands are documented in the project progress and setup guides.

### Q28. What features are working?
A: The implemented working features include authentication, educational data management, attendance tracking, organizer tasks, study planning, and the core academic dashboard flow.

### Q29. What problems were encountered?
A: The main issues are environment dependency, local MongoDB setup requirements, and the fact that OCR quality for complex documents remains limited.

### Q30. What are the main limitations?
A: The project is a working academic MVP, but it is not a complete enterprise-grade platform. OCR accuracy, real-browser verification with a live database, and optional advanced features remain subject to human validation.

### Q31. What improvements would you implement next?
A: I would improve OCR reliability, expand end-to-end validation, refine dashboard insights, and add stronger production-readiness features where needed.

### Q32. How could the application be deployed?
A: The application would require a hosted MongoDB instance, backend deployment, frontend deployment, and environment variables for the API URL, JWT secret, and database connection. The repository includes environment examples, but the exact deployment target is not fixed here.

## Project-specific questions

### Q33. What is the purpose of the `User` model?
A: It stores the student profile, authentication details, and the configured attendance target.

### Q34. What is the role of the `Subject` model?
A: It stores the student’s subject records, including name, code, teacher, credits, and description.

### Q35. Why is `Subject` unique per user by code?
A: This prevents duplicate subject codes within the same student’s academic records while allowing different students to have the same subject code.

### Q36. What is the purpose of `TimetableEntry`?
A: It stores the scheduled class details such as weekday, start time, end time, session type, and location for a specific subject.

### Q37. What validation is present in `TimetableEntry`?
A: The end time must be after the start time, and the schema enforces valid time formats.

### Q38. What does `Attendance` store?
A: It stores the confirmed attendance record for a class, including date, subject, optional timetable entry, status, and notes.

### Q39. Why is `Attendance` unique by `user + timetableEntry + date` when a timetable entry exists?
A: To avoid duplicate attendance records for the same scheduled class and date, which could otherwise inflate the attendance percentage.

### Q40. What is the purpose of `ClassIntention`?
A: It records whether the student intends to attend or miss a class in the future without counting the plan as actual attendance.

### Q41. What is the purpose of `OrganizerTask`?
A: It stores assignment or personal academic tasks with due dates, priority, and status.

### Q42. How does `StudyPlanner` relate to the rest of the project?
A: It generates study sessions based on available time, subject priorities, exam data, syllabus progress, and timetable constraints.

### Q43. Why are ownership checks important?
A: They ensure that a logged-in student can access only their own academic content and cannot modify another student’s records.

### Q44. What is the relationship between `Exam` and `SyllabusTopic`?
A: Exams and syllabus topics are both associated with a student and subject, and they help form the planning and revision context for the study planner and dashboard.

### Q45. What does the dashboard do?
A: It aggregates the student’s day-specific timetable, holiday or calendar context, upcoming exams, and attendance summary to help the student view the most relevant information quickly.

### Q46. What is the difference between planned and confirmed attendance?
A: Planned attendance only records intent; confirmed attendance is an actual recorded class outcome. Only confirmed attendance contributes to attendance percentage.

### Q47. Why is the frontend not trusted with sensitive secrets?
A: The browser environment is not a secure place for secrets or fine-grained authorization decisions. The backend owns those responsibilities.

### Q48. What is meant by user-scoped data access?
A: It means every major academic query is logically tied to the currently authenticated user, so records are filtered based on ownership before being returned or updated.

## Final viva note

If a detail is not explicitly confirmed by the repository, state it as something to verify instead of making assumptions. The best viva responses are specific to the implementation that actually exists in the project.
