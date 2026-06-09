import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import Exercises from "./pages/Exercises";
import History from "./pages/History";
import Chatbot from "./pages/Chatbot";
import SavedQuizPage from "./pages/SavedQuizPage";
import GuestQuiz from "./pages/GuestQuiz";
import Settings from "./pages/Settings";
import Messages from "./pages/Messages";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/student-login" element={<Login />} />
        <Route path="/teacher-login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/history" element={<History />} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/guest" element={<GuestQuiz />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/shared-quiz/:id" element={<SavedQuizPage mode="shared" />} />
        <Route path="/retake-quiz/:id" element={<SavedQuizPage mode="retake" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
