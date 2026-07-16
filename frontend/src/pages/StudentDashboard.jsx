import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import QuizResultModal, { formatDate } from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";
import { apiFetch, frontendUrl, readApiJson } from "../services/api";
import { getStoredUser } from "../services/roles";
import { scoreToneClass } from "../utils/scoreTone";
import { localizedCategory, localizedDifficulty } from "../utils/localizedLabels";
import studentRobotReference from "../assets/student-robot-reference.png";
import studentBooksReference from "../assets/student-books-reference.png";

function StudentDashboard() {
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    averageScore: 0,
    bestScore: 0,
    totalTimeSpent: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailMode, setDetailMode] = useState(null);
  const [toast, setToast] = useState("");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentModules, setStudentModules] = useState([]);
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const user = getStoredUser();

  const fetchStats = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    try {
      setLoadingStats(true);
      const response = await apiFetch(`/dashboard-stats?${params.toString()}`);
      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        setStats(data.stats);
      } else {
        setToast(data.message || t.serverError);
      }
    } catch {
      setStats({
        totalQuizzes: 0,
        averageScore: 0,
        bestScore: 0,
        totalTimeSpent: 0,
      });
    } finally {
      setLoadingStats(false);
    }
  }, [t.serverError, user.email, user.id]);

  const fetchRecentQuizzes = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    params.append("limit", "4");

    try {
      const response = await apiFetch(`/quiz-results?${params.toString()}`);
      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        const latestResults = [...(data.results || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setRecentQuizzes(latestResults);
      } else {
        setToast(data.message || t.serverError);
      }
    } catch {
      setRecentQuizzes([]);
    }
  }, [t.serverError, user.email, user.id]);

  useEffect(() => {
    apiFetch("/api/student/profile")
      .then((response) => readApiJson(response, ""))
      .then((data) => {
        if (data.success) {
          setStudentProfile(data.profile);
          setStudentModules(data.modules || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refresh = () => {
      fetchStats();
      fetchRecentQuizzes();
    };
    const timer = setTimeout(refresh, 0);
    window.addEventListener("quizResultUpdated", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("quizResultUpdated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [fetchRecentQuizzes, fetchStats]);

  useEffect(() => {
    const refreshMessages = () => {
      apiFetch("/api/messages/contacts")
        .then((response) => readApiJson(response, ""))
        .then((data) => setUnreadMessageCount(
          data.success ? (data.contacts || []).reduce((total, contact) => total + Number(contact.unreadCount || 0), 0) : 0
        ))
        .catch(() => setUnreadMessageCount(0));
    };
    refreshMessages();
    window.addEventListener("storage", refreshMessages);
    window.addEventListener("learnixMessagesUpdated", refreshMessages);
    return () => {
      window.removeEventListener("storage", refreshMessages);
      window.removeEventListener("learnixMessagesUpdated", refreshMessages);
    };
  }, []);

  const loadResult = async (id, mode) => {
    const response = await apiFetch(`/quiz-result/${id}`);
    const data = await readApiJson(response, t.serverError);

    if (data.success) {
      setSelectedResult(data.result);
      setDetailMode(mode);
    } else {
      setToast(data.message || t.serverError);
    }
  };

  const downloadCorrectionPdf = async () => {
    if (!selectedResult) {
      return;
    }

    const response = await apiFetch("/download-correction-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language,
        studentName: user.name || t.studentFallback,
        studentEmail: user.email || selectedResult.email || "",
        category: selectedResult.category,
        difficulty: selectedResult.difficulty,
        result: {
          score: selectedResult.score,
          totalQuestions: selectedResult.totalQuestions,
          percentage: selectedResult.percentage,
          timeSpentSeconds: selectedResult.timeSpentSeconds,
          feedback: selectedResult.feedback,
          details: selectedResult.details || [],
        },
      }),
    });

    if (!response.ok) {
      const data = await readApiJson(response, t.pdfFailed);
      setToast(data.message || t.pdfFailed);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "correction-report.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const shareResult = async () => {
    const shareUrl = frontendUrl("/guest");

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
    setToast(t.shareLinkCopied);
    setTimeout(() => setToast(""), 2200);
  };

  const studentName = studentProfile?.name || user.name || t.studentFallback;
  const studentFirstName = String(studentName).split(" ")[0] || t.studentFallback;
  const bestQuiz = recentQuizzes.reduce((best, quiz) => (
    Number(quiz.percentage || 0) > Number(best?.percentage || 0) ? quiz : best
  ), null);
  const progressItems = useMemo(() => [...recentQuizzes].reverse().slice(-4), [recentQuizzes]);
  const progressCoordinates = progressItems.map((quiz, index) => {
    const x = progressItems.length === 1 ? 50 : (index / Math.max(1, progressItems.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, Number(quiz.percentage || 0)));
    return { x, y, id: quiz.id };
  });
  const progressPath = buildSmoothPath(progressCoordinates);
  const progressFillPath = progressCoordinates.length
    ? `${progressPath} L ${progressCoordinates.at(-1).x} 100 L ${progressCoordinates[0].x} 100 Z`
    : "";
  const progressAverage = progressItems.length
    ? Math.round(progressItems.reduce((total, quiz) => total + Number(quiz.percentage || 0), 0) / progressItems.length)
    : 0;
  const moduleProgress = studentModules.slice(0, 4).map((module, index) => {
    const moduleName = String(module.name || "");
    const match = recentQuizzes.find((quiz) => String(quiz.category || "").toLowerCase().includes(moduleName.toLowerCase()));
    return {
      ...module,
      tone: ["blue", "purple", "green", "orange"][index % 4],
      progress: match ? Math.round(match.percentage || 0) : null,
      subtitle: module.levelName || studentProfile?.className || studentProfile?.educationLevel || "Module actif",
    };
  });
  const activityItems = [
    ...recentQuizzes.slice(0, 3).map((quiz) => ({
      id: `quiz-${quiz.id}`,
      tone: "green",
      title: `Quiz ${localizedCategory(quiz.category, language)} terminé`,
      meta: `Score : ${Math.round(quiz.percentage || 0)}%`,
      time: formatDate(quiz.createdAt),
    })),
    unreadMessageCount > 0 ? {
      id: "messages",
      tone: "purple",
      title: "Nouveaux messages",
      meta: `${unreadMessageCount} message${unreadMessageCount > 1 ? "s" : ""} non lu${unreadMessageCount > 1 ? "s" : ""}`,
      time: "Messagerie",
    } : null,
    studentModules.length > 0 ? {
      id: "modules",
      tone: "blue",
      title: "Modules affectés",
      meta: `${studentModules.length} module${studentModules.length > 1 ? "s" : ""} disponible${studentModules.length > 1 ? "s" : ""}`,
      time: "Aujourd'hui",
    } : null,
  ].filter(Boolean).slice(0, 4);

  return (
    <LearnixLayout
      className="student-dashboard-page"
      title={`Bienvenue, ${studentFirstName}`}
      subtitle="Ravi de te revoir ! Prêt(e) à continuer ton apprentissage aujourd'hui ?"
      notificationCount={unreadMessageCount}
    >
      <div className="student-dashboard-shell">
        <div className="student-kpi-grid">
          <article className="student-kpi-card student-kpi-blue">
            <span className="student-kpi-icon" aria-hidden="true"><StudentIcon type="cap" /></span>
            <strong>{loadingStats ? "..." : stats.totalQuizzes}</strong>
            <p>Quiz terminés</p>
            <small>Ce mois-ci</small>
          </article>
          <article className="student-kpi-card student-kpi-green">
            <span className="student-kpi-icon" aria-hidden="true"><StudentIcon type="trend" /></span>
            <strong>{loadingStats ? "..." : `${Math.round(stats.averageScore)}%`}</strong>
            <p>Score moyen</p>
            <small>Ce mois-ci</small>
          </article>
          <article className="student-kpi-card student-kpi-purple">
            <span className="student-kpi-icon" aria-hidden="true"><StudentIcon type="star" /></span>
            <strong>{loadingStats ? "..." : `${Math.round(stats.bestScore)}%`}</strong>
            <p>Meilleur score</p>
            <small>{bestQuiz ? localizedCategory(bestQuiz.category, language) : "Aucun quiz"}</small>
          </article>
          <article className="student-kpi-card student-kpi-orange">
            <span className="student-kpi-icon" aria-hidden="true"><StudentIcon type="clock" /></span>
            <strong>{loadingStats ? "..." : formatDuration(stats.totalTimeSpent)}</strong>
            <p>Temps de travail</p>
            <small>Aujourd'hui</small>
          </article>
        </div>

        <div className="student-action-gallery">
          <button className="student-feature-card student-feature-pdf" onClick={() => navigate("/chatbot")} type="button">
            <span className="student-feature-copy">
              <h3>{t.uploadPdfCard}</h3>
              <p>{t.uploadPdfText}</p>
              <b>Importer un PDF</b>
            </span>
            <PdfIllustration />
          </button>

          <button className="student-feature-card student-feature-ai" onClick={() => navigate("/chatbot")} type="button">
            <span className="student-feature-copy">
              <h3>{t.aiChatbot}</h3>
              <p>{t.aiChatbotText}</p>
              <b>Discuter avec l'IA</b>
            </span>
            <RobotIllustration />
          </button>

          <button className="student-feature-card student-feature-modules" onClick={() => navigate("/student-modules")} type="button">
            <span className="student-feature-copy">
              <h3>Modules affectés</h3>
              <p>{studentModules.length ? "Consultez les modules et cours qui vous sont assignés." : "Aucun module assigné pour le moment."}</p>
              <b>Voir mes modules</b>
            </span>
            <BooksIllustration />
          </button>
        </div>

        <section className="student-analytics-grid">
          <article className="student-panel student-progress-card">
            <div className="student-panel-heading">
              <div>
                <h3>Progression récente</h3>
                <p>Vos scores des derniers quiz terminés</p>
              </div>
              <strong>{progressItems.length ? `${progressAverage}%` : "0%"}</strong>
            </div>
            {progressItems.length ? (
              <div className="student-line-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="studentProgressFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="student-progress-fill" d={progressFillPath} />
                  <path className="student-progress-line" d={progressPath} />
                  {progressCoordinates.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="2.1" />)}
                </svg>
                <div className="student-chart-labels">
                  {progressItems.map((quiz) => (
                    <button key={quiz.id} type="button" onClick={() => loadResult(quiz.id, "results")}>
                      <strong>{Math.round(quiz.percentage || 0)}%</strong>
                      <span>{localizedCategory(quiz.category, language)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="student-empty-state">{t.noQuizzesYet}</div>
            )}
          </article>

          <article className="student-panel student-modules-card">
            <div className="student-panel-heading">
              <div>
                <h3>Derniers modules étudiés</h3>
                <p>{studentModules.length ? "Vos modules assignés" : "Aucun module disponible"}</p>
              </div>
              <button type="button" onClick={() => navigate("/student-modules")}>Voir tout</button>
            </div>
            <div className="student-module-progress-list">
              {moduleProgress.map((module) => (
                <button type="button" key={module.id || module.name} onClick={() => navigate("/chatbot")}>
                  <i className={`tone-${module.tone}`} aria-hidden="true">{String(module.name || "M").charAt(0).toUpperCase()}</i>
                  <span>
                    <strong>{localizedCategory(module.name, language)}</strong>
                    <small>{module.subtitle}</small>
                  </span>
                  <em>{module.progress === null ? "0%" : `${module.progress}%`}</em>
                  <b><span style={{ width: `${module.progress || 0}%` }} /></b>
                </button>
              ))}
              {!moduleProgress.length && <div className="student-empty-state">Aucun module assigné.</div>}
            </div>
          </article>
        </section>

        <section className="student-bottom-grid">
          <article className="student-panel student-quiz-card">
            <div className="student-panel-heading">
              <div>
                <h3>Quiz récents</h3>
                <p>{t.recentQuizzes}</p>
              </div>
              <button type="button" onClick={() => navigate("/history")}>Voir tout</button>
            </div>

            {recentQuizzes.length === 0 ? (
              <div className="student-empty-state">{t.noQuizzesYet}</div>
            ) : (
              <div className="student-recent-quiz-grid">
                {recentQuizzes.map((quiz) => (
                  <div className={`student-mini-quiz ${scoreToneClass(quiz.percentage)}`} key={quiz.id}>
                    <i aria-hidden="true">{String(quiz.category || "Q").charAt(0).toUpperCase()}</i>
                    <strong>{localizedCategory(quiz.category, language)}</strong>
                    <span>{localizedDifficulty(quiz.difficulty, language)}</span>
                    <em>{Math.round(quiz.percentage)}%</em>
                    <b><span style={{ width: `${Math.max(0, Math.min(100, Number(quiz.percentage || 0)))}%` }} /></b>
                    <small>{formatDate(quiz.createdAt)}</small>
                    <div>
                      <button type="button" onClick={() => loadResult(quiz.id, "results")}>{t.resultsAction}</button>
                      <button type="button" onClick={() => navigate(`/retake-quiz/${quiz.id}`)}>{t.retakeQuizAction}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="student-panel student-activity-card">
            <div className="student-panel-heading">
              <div>
                <h3>Activité récente</h3>
                <p>Vos dernières interactions Learnix</p>
              </div>
              <button type="button" onClick={() => navigate("/history")}>Voir tout</button>
            </div>
            <div className="student-activity-list">
              {activityItems.map((item) => (
                <button type="button" key={item.id} onClick={() => item.id.startsWith("quiz-") ? navigate("/history") : item.id === "messages" ? navigate("/messages") : navigate("/student-modules")}>
                  <i className={`tone-${item.tone}`} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <em>{item.time}</em>
                </button>
              ))}
              {!activityItems.length && <div className="student-empty-state">Aucune activité récente.</div>}
            </div>
          </article>
        </section>
      </div>

      <QuizResultModal
        mode={detailMode}
        result={selectedResult}
        t={t}
        onBack={() => {
          setSelectedResult(null);
          setDetailMode(null);
        }}
        onDownload={downloadCorrectionPdf}
      />

      {toast && <div className="toast-notification">{toast}</div>}
    </LearnixLayout>
  );
}

function buildSmoothPath(points) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function StudentIcon({ type }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round" };

  if (type === "trend") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 17h16" />
        <path {...common} d="M6 14l4-4 3 3 5-7" />
        <path {...common} d="M15 6h3v3" />
      </svg>
    );
  }

  if (type === "star") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.5z" />
      </svg>
    );
  }

  if (type === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M12 8v5l3 2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M3 9l9-4 9 4-9 4-9-4z" />
      <path {...common} d="M7 11v5c2.8 2 7.2 2 10 0v-5" />
      <path {...common} d="M21 9v6" />
    </svg>
  );
}

function PdfIllustration() {
  return (
    <svg className="student-feature-art student-pdf-art" viewBox="0 0 190 150" aria-hidden="true">
      <defs>
        <linearGradient id="studentPdfPaper" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dbe8ff" />
        </linearGradient>
        <linearGradient id="studentPdfCloud" x1="0" x2="1">
          <stop offset="0%" stopColor="#4a8bff" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M66 18h54l28 28v78a13 13 0 0 1-13 13H66a13 13 0 0 1-13-13V31a13 13 0 0 1 13-13z" fill="url(#studentPdfPaper)" />
      <path d="M120 18v26a7 7 0 0 0 7 7h21" fill="#c7d8ff" />
      <rect x="70" y="54" width="35" height="18" rx="5" fill="#e3ecff" />
      <text x="78" y="67" fill="#91a3ca" fontSize="11" fontWeight="800">PDF</text>
      <rect x="70" y="84" width="54" height="8" rx="4" fill="#d6e1f7" />
      <rect x="70" y="102" width="64" height="8" rx="4" fill="#d6e1f7" />
      <rect x="70" y="120" width="42" height="8" rx="4" fill="#d6e1f7" />
      <path d="M123 118c2.5-12 13.2-20.5 25.6-20.5 12.1 0 22.3 8.1 25.3 19.2 8.8 1.7 15.1 9.1 15.1 18 0 10.2-8.3 18.5-18.5 18.5h-43.8c-10.9 0-19.7-8.7-19.7-19.5 0-8.2 5.1-15.3 12.4-18.2 1.2-.5 2.4-.9 3.6-1.1z" fill="url(#studentPdfCloud)" />
      <path d="M148 136v-20m0 0l-9 9m9-9l9 9" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RobotIllustration() {
  return <img className="student-feature-art student-bot-art" src={studentRobotReference} alt="" aria-hidden="true" />;
}

function BooksIllustration() {
  return <img className="student-feature-art student-book-art" src={studentBooksReference} alt="" aria-hidden="true" />;
}

export default StudentDashboard;
