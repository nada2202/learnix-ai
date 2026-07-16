import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import learnixBookReference from "../assets/learnix-book-reference.png";
import learnixLogoReference from "../assets/learnix-logo-reference.png";
import { AlertMessage } from "../components/ui";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { demoTeacherForLogin } from "../data/demoTeachers";
import { apiErrorMessage, apiFetch, readApiJson, setAuthSession } from "../services/api";
import { dashboardPathForRole, normalizeRole, roleLevel } from "../services/roles";

const REGISTER_ROLE_OPTIONS = [
  { value: "student", label: "Étudiant" },
  { value: "teacher", label: "Enseignant" },
  { value: "school_director", label: "Directeur" },
  { value: "guest_student", label: "Invité" },
];

function Login({ initialMode = "login" }) {
  const [authMode, setAuthMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false);
  const [role, setRole] = useState("student");
  const [publicStats, setPublicStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { language, setLanguage, supportedLanguages, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    apiFetch("/api/public-stats")
      .then((response) => readApiJson(response, ""))
      .then((data) => setPublicStats(data.success ? data.stats : null))
      .catch(() => setPublicStats(null));
  }, []);

  const switchMode = (mode) => {
    setAuthMode(mode);
    setMessage("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setMessage(t.requiredLogin);
      return;
    }

    setMessage("");
    setLoading(true);
    const demoTeacher = demoTeacherForLogin(email, password);
    if (demoTeacher) {
      const teacherUser = { ...demoTeacher, role: "teacher", level: "Teacher" };
      localStorage.removeItem("studentUser");
      localStorage.setItem("teacherUser", JSON.stringify(teacherUser));
      navigate(dashboardPathForRole("teacher"));
      return;
    }

    try {
      const response = await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await readApiJson(response, t.serverError);
      if (!data.success) {
        setMessage(data.message || t.serverError);
        return;
      }

      const storedRole = localStorage.getItem(`registeredUserRole:${email.toLowerCase()}`);
      const roleFromApi = normalizeRole(data.user?.role || data.user?.level || storedRole || "student");
      const userWithRole = { ...data.user, role: roleFromApi, level: data.user?.level || roleFromApi };
      setAuthSession(data.token, userWithRole, roleFromApi);
      if (remember) localStorage.setItem("learnixRememberedEmail", email);
      else localStorage.removeItem("learnixRememberedEmail");
      navigate(dashboardPathForRole(roleFromApi));
    } catch (error) {
      setMessage(apiErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (!registerName || !registerEmail || !registerPassword || !registerPasswordConfirm) {
      setMessage(t.requiredAll);
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setMessage(language === "fr" ? "Les mots de passe ne correspondent pas." : "Passwords do not match.");
      return;
    }

    try {
      setMessage("");
      setLoading(true);

      const response = await apiFetch("/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
          role,
          level: roleLevel(role),
        }),
      });

      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        const userWithRole = {
          ...(data.user || {}),
          name: registerName,
          email: registerEmail,
          role,
          level: roleLevel(role),
        };
        localStorage.setItem(`registeredUserRole:${registerEmail.toLowerCase()}`, role);
        setAuthSession(data.token, userWithRole, role);
        navigate(dashboardPathForRole(role));
      } else {
        setMessage(data.message || t.serverError);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  const isRegister = authMode === "register";
  const cardTitle = isRegister ? t.registerTitle : t.loginTitle;
  const cardSubtitle = isRegister
    ? (language === "fr" ? "Créez votre espace Learnix AI sans quitter l'écran." : t.registerSubtitle)
    : t.loginSubtitle;

  return (
    <main className="premium-login-page learnix-auth-redesign" dir={dir}>
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />

      <header className="premium-auth-header">
        <span className="premium-auth-brand-placeholder" aria-hidden="true" />
        <button className="premium-theme-toggle" onClick={toggleTheme} type="button">
          <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
          {theme === "dark" ? t.lightMode : t.darkMode}
        </button>
      </header>

      <div className="premium-hero-brand-centered">
        <div className="premium-hero-brand">
          <ReferenceLearnixMark />
          <div>
            <strong>Learnix <span>AI</span></strong>
            <small>Apprenez plus vite, retenez pour de bon.</small>
          </div>
        </div>
        <span className="premium-auth-kicker premium-auth-kicker-centered">✦ {language === "fr" ? "Espace d'étude propulsé par l'IA" : "AI-powered study workspace"}</span>
      </div>

      <section className="premium-login-layout">
        <div className="premium-login-hero">
          <span className="premium-hero-brand-spacer" aria-hidden="true" />
          <span className="premium-auth-kicker-spacer" aria-hidden="true" />
          <h1>
            {language === "fr" ? "Apprenez plus vite," : "Learn faster,"}
            <span>{language === "fr" ? " retenez pour de bon." : " remember for good."}</span>
          </h1>
          <p>{language === "fr" ? "Plans personnalisés, fiches générées par IA et révisions intelligentes pour transformer chaque session d'étude en progrès mesurable." : "Personalized plans, AI-generated study material, and intelligent revision that turn study time into measurable progress."}</p>

          <ReferenceBookScene />

          <div className="premium-auth-stats">
            <div className="premium-stat-card">
              <span className="premium-stat-icon"><AuthIcon type="users" /></span>
              <span className="premium-stat-copy">
                <strong>{publicStats ? publicStats.students.toLocaleString() : "-"}</strong>
                <b>Élèves inscrits</b>
                <small>Rejoignez la communauté</small>
              </span>
            </div>
            <div className="premium-stat-card">
              <span className="premium-stat-icon"><AuthIcon type="check" /></span>
              <span className="premium-stat-copy">
                <strong>{publicStats ? publicStats.completedQuizzes.toLocaleString() : "-"}</strong>
                <b>Quiz terminés</b>
                <small>Continuez sur votre lancée</small>
              </span>
            </div>
            <div className="premium-stat-card">
              <span className="premium-stat-icon"><AuthIcon type="trend" /></span>
              <span className="premium-stat-copy">
                <strong>{publicStats ? `${Math.round(publicStats.averageScore)}%` : "-"}</strong>
                <b>Score moyen</b>
                <small>Progressez chaque jour</small>
              </span>
            </div>
          </div>
          <p className="premium-security-note"><AuthIcon type="lock" /> Vos données sont sécurisées et confidentielles.</p>
        </div>

        <form className={`premium-auth-card ${isRegister ? "is-register" : ""}`} onSubmit={isRegister ? handleRegister : handleLogin}>
          <div className="auth-mode-tabs" role="tablist" aria-label="Authentification">
            <button className={!isRegister ? "active" : ""} onClick={() => switchMode("login")} type="button">Connexion</button>
            <button className={isRegister ? "active" : ""} onClick={() => switchMode("register")} type="button">Créer un compte</button>
          </div>

          <div className="auth-form-panel" key={authMode}>
            <h2>{cardTitle}</h2>
            <p>{cardSubtitle}</p>
            {message && <AlertMessage tone="warning">{message}</AlertMessage>}

            <label className="premium-field">
              <span>{t.language}</span>
              <div className="premium-language-select">
                <i className={`premium-language-flag is-${language}`} aria-hidden="true" />
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {supportedLanguages.map((item) => (
                    <option key={item.value} value={item.value}>{t[item.labelKey]}</option>
                  ))}
                </select>
              </div>
            </label>

            {isRegister ? (
              <>
                <label className="premium-field">
                  <span>{t.fullName}</span>
                  <div className="premium-input-wrap"><AuthIcon type="user" /><input autoComplete="name" type="text" placeholder={t.fullName} value={registerName} onChange={(event) => setRegisterName(event.target.value)} /></div>
                </label>

                <label className="premium-field">
                  <span>{t.email}</span>
                  <div className="premium-input-wrap"><AuthIcon type="mail" /><input autoComplete="email" type="email" placeholder="vous@learnix.ai" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} /></div>
                </label>

                <label className="premium-field">
                  <span>{t.password}</span>
                  <div className="premium-input-wrap"><AuthIcon type="lock" /><input autoComplete="new-password" type={registerPasswordVisible ? "text" : "password"} placeholder="••••••••" value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} /><button aria-label={registerPasswordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setRegisterPasswordVisible((value) => !value)} type="button">{registerPasswordVisible ? "○" : "◉"}</button></div>
                </label>

                <label className="premium-field">
                  <span>{language === "fr" ? "Confirmer le mot de passe" : "Confirm password"}</span>
                  <div className="premium-input-wrap"><AuthIcon type="lock" /><input autoComplete="new-password" type={registerPasswordVisible ? "text" : "password"} placeholder="••••••••" value={registerPasswordConfirm} onChange={(event) => setRegisterPasswordConfirm(event.target.value)} /><span aria-hidden="true" /></div>
                </label>

                <label className="premium-field">
                  <span>{language === "fr" ? "Rôle" : "Role"}</span>
                  <select value={role} onChange={(event) => setRole(event.target.value)}>
                    {REGISTER_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="premium-field">
                  <span>{t.email}</span>
                  <div className="premium-input-wrap"><AuthIcon type="mail" /><input autoComplete="email" type="email" placeholder="vous@exemple.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
                </label>

                <label className="premium-field">
                  <span>{t.password}</span>
                  <div className="premium-input-wrap"><AuthIcon type="lock" /><input autoComplete="current-password" type={passwordVisible ? "text" : "password"} placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} /><button aria-label={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setPasswordVisible((value) => !value)} type="button">{passwordVisible ? "○" : "◉"}</button></div>
                </label>

                <div className="premium-auth-options">
                  <label><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /> {language === "fr" ? "Se souvenir de moi" : "Remember me"}</label>
                  <Link to="/forgot-password">{t.forgotPassword}</Link>
                </div>
              </>
            )}

            <button className="premium-login-submit" disabled={loading} type="submit">
              <span>{loading ? (isRegister ? t.creating : "Connexion...") : (isRegister ? t.register : "Connexion")}</span>
              <b aria-hidden="true">→</b>
            </button>

            <p className="premium-register-link">
              {isRegister ? "Vous avez déjà un compte ?" : "Pas encore de compte ?"}{" "}
              <button onClick={() => switchMode(isRegister ? "login" : "register")} type="button">
                {isRegister ? "Se connecter" : "Créer un compte"}
              </button>
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}

function ReferenceLearnixMark() {
  return (
    <div className="reference-logo-mark" aria-hidden="true">
      <img alt="" src={learnixLogoReference} />
    </div>
  );
}

function ReferenceBookScene() {
  return (
    <div className="premium-ai-book-illustration reference-book-scene" aria-hidden="true">
      <img alt="" src={learnixBookReference} />
    </div>
  );
}

function AuthIcon({ type }) {
  const paths = {
    mail: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
    lock: <path d="M7 10h10v10H7zM9 10V7a3 3 0 0 1 6 0v3" />,
    user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" />,
    users: <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M17 10a2.5 2.5 0 1 0 0-5M16 15a5 5 0 0 1 5 5" />,
    trend: <path d="M4 17h16M7 14l4-4 3 3 5-7M19 6v5h-5" />,
    check: <path d="M20 6 9 17l-5-5" />,
  };

  return <svg viewBox="0 0 24 24">{paths[type] || paths.mail}</svg>;
}

export default Login;
