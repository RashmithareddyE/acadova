import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import AcademicPage from './pages/AcademicPage';
import AttendancePage from './pages/AttendancePage';
import StudyPlannerPage from './pages/StudyPlannerPage';
import OrganizerPage from './pages/OrganizerPage';
import CopilotPage from './pages/CopilotPage';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/subjects" element={<AcademicPage resource="subjects" />} />
        <Route path="/timetable" element={<AcademicPage resource="timetable" />} />
        <Route path="/calendar" element={<AcademicPage resource="calendar" />} />
        <Route path="/exams" element={<AcademicPage resource="exams" />} />
        <Route path="/syllabus" element={<AcademicPage resource="syllabus" />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/study-planner" element={<StudyPlannerPage />} />
        <Route path="/organizer" element={<OrganizerPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
