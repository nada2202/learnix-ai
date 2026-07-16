import { useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { LOGIN_ROLE_OPTIONS, roleDescription, roleLabel } from "../services/roles";

function Home() {
  const navigate = useNavigate();
  const { language, setLanguage, supportedLanguages, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const titleParts = {
    fr: ["Assistant", "pédagogique", "intelligent"],
    en: ["Smart", "Educational", "Assistant"],
    ar: [t.homeTitle, "", ""],
  }[language] || ["Assistant", "pédagogique", "intelligent"];

  return (
    <div className="home-page" dir={dir}>
      <div className="learnix-ambient learnix-ambient-left" aria-hidden="true" />
      <div className="learnix-ambient learnix-ambient-right" aria-hidden="true" />

      <div className="home-toolbar">
        <select
          className="auth-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label={t.language}
        >
          {supportedLanguages.map((item) => (
            <option key={item.value} value={item.value}>
              {t[item.labelKey]}
            </option>
          ))}
        </select>
        <button className="auth-theme-toggle" onClick={toggleTheme} type="button">
          {theme === "dark" ? t.lightMode : t.darkMode}
        </button>
      </div>

      <main className="home-card">
        <div className="home-brand-mark">
          <span className="home-logo-halo" aria-hidden="true" />
          <BookAiLogo />
        </div>

        <div className="home-brand-copy">
          <strong>Learnix <span>AI</span></strong>
          <small>{t.workspaceKicker}</small>
        </div>

        <span className="badge home-status-badge"><i />{t.homeBadge}</span>

        <h1>
          {titleParts[0]}
          {titleParts[1] && <span className="cyan-gradient-text"> {titleParts[1]}</span>}
          {titleParts[2] && <em>{titleParts[2]}</em>}
        </h1>

        <p>{t.homeSubtitle}</p>

        <div className="home-role-grid">
          {LOGIN_ROLE_OPTIONS.map((option, index) => (
            <button
              className={`home-role-tile ${index === 0 ? "primary" : ""}`}
              key={option.value}
              onClick={() => navigate(option.loginPath)}
              style={{ "--tile-index": index }}
              type="button"
            >
              <strong>{roleLabel(option.value, t)}</strong>
              <span>{roleDescription(option.value, t)}</span>
            </button>
          ))}
        </div>
      </main>

      <footer className="home-footer">
        © {t.brandTagline || "Learnix AI — éducation augmentée"}
      </footer>
    </div>
  );
}

export default Home;
