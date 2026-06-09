import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const handleReset = async () => {
    if (!email || !password) {
      alert(t.requiredReset);
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("http://127.0.0.1:5000/forgot-password", {
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

      alert(data.message);

      if (data.success) {
        navigate("/student-login");
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

        <h1>{t.resetTitle}</h1>
        <p>{t.resetSubtitle}</p>

        <input
          type="email"
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder={t.newPassword}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={handleReset} disabled={loading}>
          {loading ? t.updating : t.updatePassword}
        </button>

        <p className="register-text">
          {t.remembered} <Link to="/student-login">{t.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
