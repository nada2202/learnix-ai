import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import StudentDashboard from "./pages/StudentDashboard";
import StudentModules from "./pages/StudentModules";
import StudentCourses from "./pages/StudentCourses";
import TeacherDashboard from "./pages/TeacherDashboard";
import Exercises from "./pages/Exercises";
import History from "./pages/History";
import Chatbot from "./pages/Chatbot";
import SavedQuizPage from "./pages/SavedQuizPage";
import GuestQuiz from "./pages/GuestQuiz";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";
import PlatformManagement from "./pages/PlatformManagement";
import ProtectedRoute from "./components/ProtectedRoute";

import "./App.css";
import "./reference-theme.css";
import "./suite.css";

function StudentModulesRoute() {
  const location = useLocation();
  return <StudentModules key={location.key} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<Navigate to="/login" replace />} />
        <Route path="/student-login" element={<Navigate to="/login" replace />} />
        <Route path="/teacher-login" element={<Navigate to="/login" replace />} />
        <Route path="/director-login" element={<Navigate to="/login" replace />} />
        <Route path="/guest-teacher-login" element={<Navigate to="/login" replace />} />
        <Route path="/guest-student-login" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/student-dashboard" element={<ProtectedRoute><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student-modules" element={<ProtectedRoute><StudentModulesRoute /></ProtectedRoute>} />
        <Route path="/student-courses" element={<ProtectedRoute><StudentCourses /></ProtectedRoute>} />
        <Route path="/teacher-dashboard" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
        <Route path="/teacher-courses" element={<ProtectedRoute><TeacherDashboard section="courses" /></ProtectedRoute>} />
        <Route path="/teacher-quizzes" element={<ProtectedRoute><Navigate to="/teacher-courses" replace /></ProtectedRoute>} />
        <Route path="/teacher-students" element={<ProtectedRoute><TeacherDashboard section="students" /></ProtectedRoute>} />
        <Route path="/teacher-availability" element={<ProtectedRoute><TeacherDashboard section="availability" /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Navigate to="/platform" replace /></ProtectedRoute>} />
        <Route path="/director" element={<ProtectedRoute><Navigate to="/platform" replace /></ProtectedRoute>} />
        <Route path="/teacher" element={<ProtectedRoute><Navigate to="/teacher-dashboard" replace /></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute><Navigate to="/student-dashboard" replace /></ProtectedRoute>} />
        <Route path="/guest-teacher" element={<ProtectedRoute><Navigate to="/platform" replace /></ProtectedRoute>} />
        <Route path="/guest-student" element={<ProtectedRoute><Navigate to="/platform" replace /></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
        <Route path="/exercises" element={<ProtectedRoute><Navigate to="/chatbot" replace /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/platform" element={<ProtectedRoute><PlatformManagement /></ProtectedRoute>} />
        <Route path="/guest" element={<GuestQuiz />} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/shared-quiz/:id" element={<SavedQuizPage mode="shared" />} />
        <Route path="/retake-quiz/:id" element={<SavedQuizPage mode="retake" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
