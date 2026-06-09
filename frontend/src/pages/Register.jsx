import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const initialRole = new URLSearchParams(location.search).get("role") === "teacher"
    ? "teacher"
    : "student";
  const [role, setRole] = useState(initialRole);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      alert(t.requiredAll);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("http://127.0.0.1:5000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          level: role === "teacher" ? "Teacher" : "Student",
        }),
      });

      const data = await response.json();

      alert(data.message);

      if (data.success) {
        const userWithRole = {
          ...(data.user || {}),
          name,
          email,
          role,
          level: role === "teacher" ? "Teacher" : "Student",
        };
        localStorage.setItem(`registeredUserRole:${email.toLowerCase()}`, role);
        localStorage.setItem(role === "teacher" ? "teacherUser" : "studentUser", JSON.stringify(userWithRole));
        navigate(role === "teacher" ? "/teacher-login" : "/student-login");
      }
    } catch {
      alert(t.serverError);
    } finally {
      setLoading(false);
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

        <h1>{t.registerTitle}</h1>
        <p>{t.registerSubtitle}</p>

        <select
          className="auth-language"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="student">{t.studentSpace}</option>
          <option value="teacher">{t.teacherSpace}</option>
        </select>

        <input
          type="text"
          placeholder={t.fullName}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

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

        <button onClick={handleRegister} disabled={loading}>
          {loading ? t.creating : t.register}
        </button>

        <p className="register-text">
          {t.alreadyAccount} <Link to={role === "teacher" ? "/teacher-login" : "/student-login"}>{t.login}</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
