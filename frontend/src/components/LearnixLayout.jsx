import { Fragment, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { apiFetch, clearAuthSession, updateStoredUser } from "../services/api";
import { getStoredUser, navItemsForRole, normalizeRole, panelLabelForRole } from "../services/roles";
import learnixLogoReference from "../assets/learnix-logo-reference.png";
import Avatar from "./Avatar";

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
  streakActivityDates = [],
  fallbackInitial = "S",
  fallbackName,
  logoutPath = "/login",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, supportedLanguages, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [sessionUser, setSessionUser] = useState(getStoredUser());
  const user = profileUser
    ? {
      ...sessionUser,
      ...profileUser,
      avatar_url: profileUser.avatar_url ?? profileUser.avatarUrl ?? sessionUser.avatar_url ?? sessionUser.avatarUrl,
    }
    : sessionUser;
  const role = normalizeRole(user.role || user.level);
  const roleLabel = panelLabel || panelLabelForRole(role, t);
  const resolvedLogoutPath = logoutPath;
  const navItems = customNavItems || navItemsForRole(role, t);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const streakInfo = null;
  const resolvedSearchPlaceholder = searchPlaceholder || t.searchPlaceholder || "Rechercher des cours, quiz, élèves...";

  const searchMatches = searchQuery.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 6)
    : [];

  const logout = () => {
    clearAuthSession();
    navigate(resolvedLogoutPath);
  };

  const refreshNotifications = useCallback(async () => {
    try {
      const response = await apiFetch("/api/notifications");
      const data = await response.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadNotifications(data.unreadCount || 0);
      }
    } catch {
      // The rest of the workspace remains usable if notifications are unavailable.
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await apiFetch("/api/me");
      const data = await response.json();
      if (data.success && data.user) {
        setSessionUser(data.user);
        updateStoredUser(data.user);
      }
    } catch {
      // Keep the last known profile while offline.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refreshNotifications, 0);
    const profileTimer = window.setTimeout(refreshProfile, 0);
    const interval = window.setInterval(refreshNotifications, 6000);
    window.addEventListener("learnix:data-updated", refreshNotifications);
    window.addEventListener("learnix:data-updated", refreshProfile);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(profileTimer);
      window.clearInterval(interval);
      window.removeEventListener("learnix:data-updated", refreshNotifications);
      window.removeEventListener("learnix:data-updated", refreshProfile);
    };
  }, [refreshNotifications, refreshProfile]);

  const openNotification = async (item) => {
    if (!item.readAt) await apiFetch(`/api/notifications/${item.id}/read`, { method: "PATCH" });
    setNotificationsOpen(false);
    await refreshNotifications();
    if (item.actionPath) navigate(item.actionPath);
  };

  const readAllNotifications = async () => {
    await apiFetch("/api/notifications/read-all", { method: "PATCH" });
    await refreshNotifications();
  };

  const toggleNotifications = async () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening && unreadNotifications > 0) {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" });
      await refreshNotifications();
    }
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

  const isActiveNavItem = (path) => {
    const [pathname, hash = ""] = path.split("#");
    const itemHash = hash ? `#${hash}` : "";
    return itemHash
      ? location.pathname === pathname && location.hash === itemHash
      : location.pathname === pathname && !location.hash;
  };

  const submitGlobalSearch = (event) => {
    event.preventDefault();
    if (searchMatches[0]) {
      navigate(searchMatches[0].path);
      setSearchQuery("");
    }
  };

  return (
    <div className={`learnix-app-page role-${role} ${className}`} dir={dir}>
      <div className="learnix-ambient learnix-ambient-left" aria-hidden="true" />
      <div className="learnix-ambient learnix-ambient-right" aria-hidden="true" />

      <aside className="learnix-sidebar">
        <div className="learnix-brand">
          <BookAiLogo />
          <h2>Learnix <span>AI</span></h2>
        </div>

        <nav className="learnix-nav">
          {navItems.map((item, index) => {
            const itemNotificationCount = item.icon === "messages"
              ? notificationCount
              : item.path.includes("#requests")
                ? notifications.filter((notice) => !notice.readAt && notice.type === "approval").length
                : item.path.includes("#assignments")
                  ? notifications.filter((notice) => !notice.readAt && notice.type === "assignment").length
                  : 0;

            const showGroup = item.group && navItems[index - 1]?.group !== item.group;

            return (
              <Fragment key={`${item.path}-${item.label}`}>
                {showGroup && <span className="learnix-nav-group">{item.group}</span>}
                <button
                  className={item.highlight !== false && isActiveNavItem(item.path) ? "active" : ""}
                  onClick={() => navigate(item.path)}
                  type="button"
                >
                  <span aria-hidden="true">{navIcon(item.icon)}</span>
                  <b>{item.label}</b>
                  {itemNotificationCount > 0 && <strong className="learnix-nav-badge">{itemNotificationCount}</strong>}
                </button>
              </Fragment>
            );
          })}
        </nav>

        <div className="learnix-sidebar-extra">
          {streakInfo && (
            <aside className="learnix-streak-card" aria-label="Série d'apprentissage">
              <p>Continue ta série !</p>
              <strong>7 <span>jours consécutifs</span></strong>
              <div aria-hidden="true">
                {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
                  <span className={index < 5 ? "done" : ""} key={`${day}-${index}`}>
                    <b>{day}</b>
                    <i />
                  </span>
                ))}
              </div>
            </aside>
          )}
          <button className="learnix-sidebar-logout" onClick={logout} type="button">
            <span aria-hidden="true">{navIcon("logout")}</span>
            {t.logout}
          </button>
        </div>
      </aside>

      <main className="learnix-workspace">
        <section className="learnix-main-panel">
          <div className="learnix-dashboard-topbar" aria-label={t.displayControls}>
            <form className="learnix-search-box" onSubmit={submitGlobalSearch}>
              <span aria-hidden="true">{navIcon("search")}</span>
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={resolvedSearchPlaceholder} />
              {searchMatches.length > 0 && <div className="learnix-search-results">{searchMatches.map((item) => <button type="button" key={item.path} onClick={() => { navigate(item.path); setSearchQuery(""); }}><span>{navIcon(item.icon)}</span><b>{item.label}</b></button>)}</div>}
            </form>

            <div className="learnix-top-controls">
              <button className="learnix-notification-button" type="button" aria-label={t.notifications} onClick={toggleNotifications}>
                {navIcon("notification")}
                {unreadNotifications > 0 && <strong>{unreadNotifications}</strong>}
              </button>
              {notificationsOpen && (
                <div className="learnix-notification-popover">
                  <div className="notification-popover-head"><b>{t.notifications}</b><button type="button" onClick={readAllNotifications}>Tout lire</button></div>
                  <div className="notification-list">
                    {notifications.map((item) => (
                      <button className={item.readAt ? "" : "unread"} type="button" key={item.id} onClick={() => openNotification(item)}>
                        <span>{item.title}</span><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString()}</small>
                      </button>
                    ))}
                    {!notifications.length && <p className="notification-empty">Aucune notification.</p>}
                  </div>
                </div>
              )}
              <label className="learnix-language-control">
                <span>{t.language}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {supportedLanguages.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t[item.labelKey]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="theme-toggle" onClick={toggleTheme} type="button" aria-label={theme === "dark" ? t.lightMode : t.darkMode}>
                {navIcon(theme === "dark" ? "sun" : "moon")}
              </button>
              <div className="learnix-top-profile">
                <div>
                  <strong>{user.name || fallbackName || t.studentFallback}</strong>
                  <small>{roleLabel}</small>
                </div>
                <Avatar user={user} name={user.name || fallbackInitial} size={42} clickable />
              </div>
            </div>
          </div>

          {(title || subtitle) && (
            <header className="learnix-page-header">
              <div>
                {title && <h1>{title}</h1>}
                {subtitle && <p>{subtitle}</p>}
              </div>
              <time dateTime={new Date().toISOString().slice(0, 10)}>
                {navIcon("calendar")}
                {new Intl.DateTimeFormat(language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                }).format(new Date())}
              </time>
            </header>
          )}

          {children}
        </section>
      </main>

    </div>
  );
}

export function BookAiLogo() {
  return (
    <span className="learnix-logo" aria-hidden="true">
      <img alt="" src={learnixLogoReference} />
    </span>
  );
}

function navIcon(type) {
  const icons = {
    dashboard: <path d="M4 19.5 12 5l8 14.5H4Z" />,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M17 8a2.5 2.5 0 1 1 0 5M16 15a5 5 0 0 1 5 5" /></>,
    buildings: <><path d="M4 21V7l8-4v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2M2 21h20" /></>,
    classes: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3" /></>,
    modules: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M8 4v13a3 3 0 0 0-3 3M11 9h5M11 13h5" /></>,
    teachers: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v4c2.5 2 7.5 2 10 0v-4M21 9v6" /></>,
    students: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4.5" /></>,
    assignments: <><path d="M4 6h7M4 12h7M4 18h7M15 5h5v5h-5zM15 14h5v5h-5z" /><path d="m16 8 1 1 2-3M16 17l1 1 2-3" /></>,
    schedule: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 14h3M13 14h3M8 18h3" /></>,
    requests: <><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 13v7h14v-7" /></>,
    reports: <><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h6" /></>,
    audit: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M5 5l2 2" /></>,
    exercises: <path d="M5 5h14v14H5zM8 8h8M8 12h8M8 16h4" />,
    chat: <path d="m12 3 2.4 6.2L21 12l-6.6 2.8L12 21l-2.4-6.2L3 12l6.6-2.8L12 3Z" />,
    history: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 5v5h5M12 8v5l3 2" />,
    settings: <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.8-1L12.4 3h-4l-.4 3.1a7.6 7.6 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.8 1l.4 3.1h4l.4-3.1a7.6 7.6 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />,
    logout: <path d="M14 5h5v14h-5M9 8l-4 4 4 4M5 12h10" />,
    resources: <path d="M6 3h8l4 4v14H6zM14 3v5h4M8.5 15h7M8.5 18h5" />,
    messages: <path d="M5 6h14v10H8l-3 3V6Z" />,
    school: <path d="m3 9 9-5 9 5-9 5-9-5ZM6 12v4c2 2 10 2 12 0v-4" />,
    search: <path d="M10.5 5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM15 15l4 4" />,
    notification: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.2-2.4 3.3-5.4 3.3-9S14.2 5.4 12 3m0 18c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3M3.5 9h17M3.5 15h17" />,
    moon: <path d="M20 15.2A8 8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
    calendar: <path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14M9 13h2M13 13h2M9 16h2" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[type] || <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

export default LearnixLayout;
