import { useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

function Home() {
  const navigate = useNavigate();
  const { t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="home-page" dir={dir}>
      <button className="auth-theme-toggle" onClick={toggleTheme} type="button">
        {theme === "dark" ? t.lightMode : t.darkMode}
      </button>
      <div className="home-card">
        <div className="auth-brand">
          <BookAiLogo />
          <div>
            <strong>Learnix AI</strong>
            <span>{t.workspaceKicker}</span>
          </div>
        </div>
        <span className="badge">{t.homeBadge}</span>

        <h1>{t.homeTitle}</h1>

        <p>{t.homeSubtitle}</p>

        <div className="home-actions">
          <button onClick={() => navigate("/student-login")}>
            {t.studentSpace}
          </button>

          <button
            className="secondary"
            onClick={() => navigate("/teacher-login")}
          >
            {t.teacherSpace}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
