import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { AlertMessage } from "../components/ui";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { apiErrorMessage, apiFetch, readApiJson } from "../services/api";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState("request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const requestResetToken = async () => {
    if (!email) {
      setMessage(t.email);
      return;
    }

    try {
      setMessage("");
      setLoading(true);

      const response = await apiFetch("/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        setMessage(data.resetToken ? `${data.message} Token: ${data.resetToken}` : data.message);
        if (data.resetToken) {
          setToken(data.resetToken);
        }
        setStep("confirm");
      } else {
        setMessage(data.message || t.serverError);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email || !token || !password) {
      setMessage(t.requiredReset || "Email, reset token and new password are required.");
      return;
    }

    try {
      setMessage("");
      setLoading(true);

      const response = await apiFetch("/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          token,
          password,
        }),
      });

      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        navigate("/login");
      } else {
        setMessage(data.message || t.serverError);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t));
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
        {message && <AlertMessage tone="warning">{message}</AlertMessage>}

        <input
          type="email"
          placeholder={t.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {step === "confirm" && (
          <>
            <input
              type="text"
              placeholder="Reset token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />

            <input
              type="password"
              placeholder={t.newPassword}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        <button onClick={step === "request" ? requestResetToken : handleReset} disabled={loading}>
          {loading ? t.updating : step === "request" ? "Request reset token" : t.updatePassword}
        </button>

        <p className="register-text">
          {t.remembered} <Link to="/login">{t.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
