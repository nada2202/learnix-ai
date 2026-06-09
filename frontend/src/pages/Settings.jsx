import { useState } from "react";
import LearnixLayout, { PremiumModal } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const storedTeacher = JSON.parse(localStorage.getItem("teacherUser") || "{}");
  const isTeacher = Boolean(storedTeacher.email);
  const user = isTeacher ? storedTeacher : JSON.parse(localStorage.getItem("studentUser") || "{}");
  const [profile, setProfile] = useState({
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
  });

  const updateProfile = (field, value) => {
    const nextProfile = { ...profile, [field]: value };
    setProfile(nextProfile);
    localStorage.setItem(
      isTeacher ? "teacherUser" : "studentUser",
      JSON.stringify({ ...user, ...nextProfile })
    );
  };

  const savePassword = () => {
    setPasswordMessage(t.passwordSaved);
    window.setTimeout(() => setPasswordMessage(""), 2400);
  };

  return (
    <LearnixLayout
      title={t.settings}
      subtitle={t.settingsSubtitle}
      profileUser={user}
      panelLabel={isTeacher ? t.teacherPanel : undefined}
      fallbackInitial={isTeacher ? "T" : "S"}
      fallbackName={isTeacher ? t.teacherFallback : undefined}
      logoutPath={isTeacher ? "/teacher-login" : "/student-login"}
      navItems={isTeacher ? [
        { label: t.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
        { label: t.quizManagement, path: "/teacher-dashboard#quizzes", icon: "exercises" },
        { label: t.studentResults, path: "/teacher-dashboard#students", icon: "history" },
        { label: t.settings, path: "/settings", icon: "settings" },
      ] : undefined}
    >
      <div className="settings-page">
        <section className="dash-card settings-card settings-profile-card">
          <div className="settings-card-head">
            <span className="badge">{t.profileSettings}</span>
            <p>{t.profileSettingsText}</p>
          </div>

          <div className="settings-profile-row">
            <div className="settings-avatar" aria-hidden="true">
              {(profile.name || profile.email || "S").charAt(0).toUpperCase()}
            </div>
            <div>
              <h3>{profile.name || (isTeacher ? t.teacherFallback : t.studentFallback)}</h3>
              <p>{profile.email || t.noEmailSaved}</p>
            </div>
          </div>

          <div className="settings-form-grid">
            <label>
              <span>{t.name}</span>
              <input
                value={profile.name}
                onChange={(event) => updateProfile("name", event.target.value)}
                placeholder={t.studentName}
              />
            </label>
            <label>
              <span>{t.email}</span>
              <input
                type="email"
                value={profile.email}
                onChange={(event) => updateProfile("email", event.target.value)}
                placeholder="student@example.com"
              />
            </label>
            <label>
              <span>{t.phone}</span>
              <input
                value={profile.phone}
                onChange={(event) => updateProfile("phone", event.target.value)}
                placeholder="+973 0000 0000"
              />
            </label>
          </div>
        </section>

        <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.languageSettings}</span>
            <h3>{t.interfaceLanguage}</h3>
            <p>{t.languageSettingsText}</p>
          </div>
          <div className="settings-segmented" role="group" aria-label={t.language}>
            {[
              ["en", t.english],
              ["fr", t.french],
              ["ar", t.arabic],
            ].map(([value, label]) => (
              <button
                className={language === value ? "active" : ""}
                key={value}
                type="button"
                onClick={() => setLanguage(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.themeSettings}</span>
            <h3>{t.displayMode}</h3>
            <p>{t.themeSettingsText}</p>
          </div>
          <div className="settings-segmented" role="group" aria-label={t.themeSettings}>
            {["light", "dark"].map((value) => (
              <button
                className={theme === value ? "active" : ""}
                key={value}
                type="button"
                onClick={() => setTheme(value)}
              >
                {value === "light" ? t.lightMode : t.darkMode}
              </button>
            ))}
          </div>
        </section>

        <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.security}</span>
            <h3>{t.changePassword}</h3>
            <p>{t.passwordText}</p>
          </div>
          <div className="settings-form-grid single">
            <label>
              <span>{t.currentPassword}</span>
              <input type="password" placeholder={t.enterCurrentPassword} />
            </label>
            <label>
              <span>{t.newPassword}</span>
              <input type="password" placeholder={t.enterNewPassword} />
            </label>
          </div>
          <button className="primary-action settings-action" type="button" onClick={savePassword}>
            {t.savePassword}
          </button>
          {passwordMessage && <div className="toast-notification">{passwordMessage}</div>}
        </section>

        <section className="dash-card settings-card">
          <div className="settings-card-head">
            <span className="badge">{t.aiPreferences}</span>
            <h3>{t.preferredAiLanguage}</h3>
            <p>{t.preferredAiLanguageText}</p>
          </div>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en">{t.english}</option>
            <option value="fr">{t.french}</option>
            <option value="ar">{t.arabic}</option>
          </select>
        </section>

        {!isTeacher && (
          <section className="dash-card settings-card settings-premium-panel">
            <div className="settings-card-head">
              <span className="badge">Premium</span>
              <h3>{t.premiumTitle}</h3>
              <p>{t.premiumSettingsText}</p>
            </div>
            <ul className="settings-benefits-list">
              <li>{t.unlimitedQuizzes}</li>
              <li>{t.unlimitedChatbot}</li>
              <li>{t.uploadSupport}</li>
              <li>{t.priorityCorrections}</li>
            </ul>
            <button className="primary-action settings-action" type="button" onClick={() => setPremiumOpen(true)}>
              {t.upgradePremium}
            </button>
          </section>
        )}
      </div>

      {!isTeacher && premiumOpen && <PremiumModal onClose={() => setPremiumOpen(false)} />}
    </LearnixLayout>
  );
}

export default Settings;
