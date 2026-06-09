import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { demoTeacherForLogin } from "../data/demoTeachers";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isTeacherLogin = location.pathname === "/teacher-login";
  const requestedRole = isTeacherLogin ? "teacher" : "student";

  const normalizeRole = (value) => {
    const normalized = String(value || "").toLowerCase();
    return normalized === "teacher" ? "teacher" : "student";
  };

  const handleLogin = async () => {
    if (!email || !password) {
      alert(t.requiredLogin);
      return;
    }

    if (isTeacherLogin) {
      const demoTeacher = demoTeacherForLogin(email, password);

      if (demoTeacher) {
        const teacherUser = {
          id: demoTeacher.id,
          name: demoTeacher.name,
          email: demoTeacher.email,
          subject: demoTeacher.subject,
          section: demoTeacher.section,
          role: "teacher",
          level: "Teacher",
        };

        localStorage.removeItem("studentUser");
        localStorage.setItem("teacherUser", JSON.stringify(teacherUser));
        navigate("/teacher-dashboard");
        return;
      }
    }

    try {
      const response = await fetch("http://127.0.0.1:5000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const storedRole = localStorage.getItem(`registeredUserRole:${email.toLowerCase()}`);
        const role = normalizeRole(data.user?.role || data.user?.level || storedRole || requestedRole);
        const userWithRole = {
          ...data.user,
          role,
          level: role === "teacher" ? "Teacher" : "Student",
        };

        if (role === "teacher") {
          localStorage.removeItem("studentUser");
          localStorage.setItem("teacherUser", JSON.stringify(userWithRole));
          navigate("/teacher-dashboard");
        } else {
          localStorage.removeItem("teacherUser");
          localStorage.setItem("studentUser", JSON.stringify(userWithRole));
          navigate("/student-dashboard");
        }
      } else {
        alert(data.message);
      }

    } catch {
      alert(t.serverError);
    }
  };

  return (
    <div className="login-page" dir={dir}>
      <button className="auth-theme-toggle" onClick={toggleTheme} type="button">
        {theme === "dark" ? t.lightMode : t.darkMode}
      </button>
      <div className="login-card">
        <div className="auth-brand">
          <BookAiLogo />
          <div>
            <strong>Learnix AI</strong>
            <span>{t.workspaceKicker}</span>
          </div>
        </div>

        <select
          className="auth-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">{t.english}</option>
          <option value="fr">{t.french}</option>
          <option value="ar">{t.arabic}</option>
        </select>

        <h1>{t.loginTitle}</h1>
        <p>{t.loginSubtitle}</p>

        <input
          type="email"
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder={t.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={handleLogin}>
          {t.login}
        </button>

        <div className="auth-links">
          <Link to={`/register?role=${requestedRole}`}>{t.createAccount}</Link>
          <Link to="/forgot-password">{t.forgotPassword}</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
