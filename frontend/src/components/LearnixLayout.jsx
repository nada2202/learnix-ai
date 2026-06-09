import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

function LearnixLayout({
  title,
  subtitle,
  children,
  className = "",
  navItems: customNavItems,
  panelLabel,
  profileUser,
  searchPlaceholder,
  notificationCount = 0,
  fallbackInitial = "S",
  fallbackName,
  logoutPath = "/student-login",
  hidePremiumCard = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const teacherUser = JSON.parse(localStorage.getItem("teacherUser") || "{}");
  const studentUser = JSON.parse(localStorage.getItem("studentUser") || "{}");
  const isTeacherSession = Boolean(teacherUser.email) && !studentUser.email;
  const user = profileUser || (isTeacherSession ? teacherUser : studentUser);
  const resolvedLogoutPath = logoutPath === "/student-login" && isTeacherSession
    ? "/teacher-login"
    : logoutPath;
  const isTeacherLayout = isTeacherSession || resolvedLogoutPath === "/teacher-login";
  const showPremiumCard = !hidePremiumCard && !isTeacherLayout;

  const logout = () => {
    if (resolvedLogoutPath === "/teacher-login") {
      localStorage.removeItem("teacherUser");
    } else {
      localStorage.removeItem("studentUser");
    }
    navigate(resolvedLogoutPath);
  };

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [location.hash, location.pathname]);

  const navItems = customNavItems || (isTeacherSession
    ? [
      { label: t.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
      { label: "Courses", path: "/teacher-dashboard#courses", icon: "resources" },
      { label: t.quizManagement, path: "/teacher-dashboard#quizzes", icon: "exercises" },
      { label: t.studentResults, path: "/teacher-dashboard#students", icon: "history" },
      { label: "Messages", path: "/messages", icon: "messages" },
      { label: t.settings, path: "/settings", icon: "settings" },
    ]
    : [
      { label: t.dashboard, path: "/student-dashboard", icon: "dashboard" },
      { label: t.exercises, path: "/exercises", icon: "exercises" },
      { label: t.chatbot, path: "/chatbot", icon: "chat" },
      { label: t.history, path: "/history", icon: "history" },
      { label: "Messages", path: "/messages", icon: "messages" },
      { label: t.settings, path: "/settings", icon: "settings" },
    ]);
  const isActiveNavItem = (path) => {
    const [pathname, hash = ""] = path.split("#");
    const itemHash = hash ? `#${hash}` : "";

    if (itemHash) {
      return location.pathname === pathname && location.hash === itemHash;
    }

    return location.pathname === pathname && !location.hash;
  };

  return (
    <div className={`learnix-app-page ${className}`} dir={dir}>
      <aside className="learnix-sidebar">
        <div className="learnix-brand">
          <BookAiLogo />
          <div>
            <h2>Learnix AI</h2>
            <p>{panelLabel || (isTeacherSession ? t.teacherPanel : t.studentPanel)}</p>
          </div>
        </div>

        <nav className="learnix-nav">
          {navItems.map((item) => {
            const showMessagesBadge = item.icon === "messages" && notificationCount > 0;

            return (
              <button
                className={isActiveNavItem(item.path) ? "active" : ""}
                key={item.path}
                onClick={() => navigate(item.path)}
                type="button"
              >
                <span aria-hidden="true">{navIcon(item.icon)}</span>
                <b>{item.label}</b>
                {showMessagesBadge && <strong className="learnix-nav-badge">{notificationCount}</strong>}
              </button>
            );
          })}
        </nav>

        <button className="learnix-sidebar-logout" onClick={logout} type="button">
          <span aria-hidden="true">{navIcon("logout")}</span>
          {t.logout}
        </button>

        <div className="learnix-sidebar-extra">
          {showPremiumCard && (
            <div className="learnix-premium-card">
              <DiamondIcon />
              <h3>{t.premiumTitle}</h3>
              <p>{t.premiumSubtitle}</p>
              <button type="button" onClick={() => setPremiumOpen(true)}>
                {t.upgradePremium}
              </button>
            </div>
          )}

          <div className="learnix-profile-card">
            <div className="learnix-profile-main">
              <span>{(user.name || fallbackInitial).charAt(0).toUpperCase()}</span>
              <div>
                <small>{t.profile}</small>
                <strong>{user.name || user.email || fallbackName || t.studentFallback}</strong>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="learnix-workspace">
        <section className="learnix-main-panel">
          <div className="learnix-dashboard-topbar" aria-label={t.displayControls}>
            <label className="learnix-search-box">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder={searchPlaceholder || "Search courses, quizzes, students..."}
              />
            </label>

            <div className="learnix-top-controls">
              <button className="learnix-notification-button" type="button" aria-label="Notifications">
                <span aria-hidden="true">!</span>
                {notificationCount > 0 && <strong>{notificationCount}</strong>}
              </button>
              <label>
                <span>{t.language}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="en">{t.english}</option>
                  <option value="fr">{t.french}</option>
                  <option value="ar">{t.arabic}</option>
                </select>
              </label>
              <button className="theme-toggle" onClick={toggleTheme} type="button">
                {theme === "dark" ? t.lightMode : t.darkMode}
              </button>
            </div>
          </div>
          {(title || subtitle) && (
            <header className="learnix-page-header">
              <span className="learnix-kicker">{t.workspaceKicker}</span>
              {title && <h1>{title}</h1>}
              {subtitle && <p>{subtitle}</p>}
            </header>
          )}
          {children}
        </section>
      </main>

      {showPremiumCard && premiumOpen && <PremiumModal onClose={() => setPremiumOpen(false)} />}
    </div>
  );
}

export function BookAiLogo() {
  return (
    <span className="learnix-logo" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path d="M10 12.5c5.2-2.2 9.8-1.7 14 1.4 4.2-3.1 8.8-3.6 14-1.4v23.2c-5.2-2.2-9.8-1.7-14 1.4-4.2-3.1-8.8-3.6-14-1.4z" />
        <path d="M24 13.9v23.2" />
        <path d="M15 18.3c2.2-.4 4.1 0 5.7 1.1M15 24c2.2-.4 4.1 0 5.7 1.1" />
        <path d="M29 19.5h5M31.5 17v5M29.7 27.8l1.3-2.8 1.3 2.8 2.9.4-2.1 2.1.5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2.1z" />
      </svg>
    </span>
  );
}

function DiamondIcon() {
  return (
    <span className="premium-diamond" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7 3h10l4 5-9 13L3 8z" />
        <path d="M3 8h18M8 8l4 13 4-13M7 3l1 5M17 3l-1 5" />
      </svg>
    </span>
  );
}

export function PremiumModal({ onClose }) {
  const { t } = useLanguage();
  const [demoActivated, setDemoActivated] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("monthly");

  return (
    <div className="premium-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="premium-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="premium-modal-close" type="button" onClick={onClose} aria-label={t.close}>
          X
        </button>
        {demoActivated ? (
          <div className="premium-demo-message" id="premium-modal-title">
            {t.premiumDemoActivated}
          </div>
        ) : (
          <>
            <div className="premium-modal-hero">
              <DiamondIcon />
              <span>{t.premiumTitle}</span>
              <h2 id="premium-modal-title">{t.premiumModalTitle}</h2>
              <p>{t.premiumModalBody}</p>
            </div>

            <div className="premium-pricing-grid" role="group" aria-label={t.premiumPricing}>
              <button
                className={selectedPlan === "monthly" ? "active" : ""}
                type="button"
                onClick={() => setSelectedPlan("monthly")}
              >
                <span>{t.monthly}</span>
                <strong>$9.99</strong>
              </button>
              <button
                className={selectedPlan === "yearly" ? "active" : ""}
                type="button"
                onClick={() => setSelectedPlan("yearly")}
              >
                <span>{t.yearly}</span>
                <strong>$79.99</strong>
              </button>
            </div>

            <form
              className="premium-payment-form"
              onSubmit={(event) => {
                event.preventDefault();
                setDemoActivated(true);
              }}
            >
              <label>
                <span>{t.cardholderName}</span>
                <input autoComplete="cc-name" placeholder={t.cardholderName} />
              </label>
              <label>
                <span>{t.cardNumber}</span>
                <input
                  autoComplete="cc-number"
                  inputMode="numeric"
                  placeholder="0000 0000 0000 0000"
                />
              </label>
              <div className="premium-payment-row">
                <label>
                  <span>{t.expiryDate}</span>
                  <input autoComplete="cc-exp" placeholder="MM/YY" />
                </label>
                <label>
                  <span>{t.cvv}</span>
                  <input autoComplete="cc-csc" inputMode="numeric" placeholder="123" />
                </label>
              </div>
              <div className="premium-modal-actions">
                <button className="premium-secondary-button" type="button" onClick={onClose}>
                  {t.maybeLater}
                </button>
                <button className="premium-primary-button" type="submit">
                  {t.pay}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function navIcon(type) {
  const icons = {
    dashboard: "⌂",
    exercises: "◫",
    chat: "✦",
    history: "◷",
    settings: "⚙",
    logout: "↗",
    resources: "PDF",
    messages: "@",
  };
  return icons[type] || "•";
}

export default LearnixLayout;
