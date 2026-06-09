import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import QuizResultModal, { formatDate } from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";

const sidebarCopy = {
  en: { aiAssistant: "AI Assistant", messages: "Messages" },
  fr: { aiAssistant: "Assistant IA", messages: "Messages" },
  ar: { aiAssistant: "المساعد الذكي", messages: "الرسائل" },
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

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
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const navText = sidebarCopy[language] || sidebarCopy.en;
  const user = JSON.parse(localStorage.getItem("studentUser") || "{}");

  const fetchStats = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    try {
      setLoadingStats(true);
      const response = await fetch(
        `http://127.0.0.1:5000/dashboard-stats?${params.toString()}`
      );
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
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
  }, [user.email, user.id]);

  const fetchRecentQuizzes = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    params.append("limit", "4");

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/quiz-results?${params.toString()}`
      );
      const data = await response.json();

      if (data.success) {
        setRecentQuizzes(data.results);
      }
    } catch {
      setRecentQuizzes([]);
    }
  }, [user.email, user.id]);

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
      const studentEmail = String(user.email || "student@learnix.ai").trim().toLowerCase();
      const messages = readStorage("learnixMessages", []);
      setUnreadMessageCount(messages.filter((message) => (
        String(message.studentEmail || "").trim().toLowerCase() === studentEmail &&
        message.recipientRole === "student" &&
        !message.read
      )).length);
    };
    refreshMessages();
    window.addEventListener("storage", refreshMessages);
    window.addEventListener("learnixMessagesUpdated", refreshMessages);
    return () => {
      window.removeEventListener("storage", refreshMessages);
      window.removeEventListener("learnixMessagesUpdated", refreshMessages);
    };
  }, [user.email]);

  const loadResult = async (id, mode) => {
    const response = await fetch(`http://127.0.0.1:5000/quiz-result/${id}`);
    const data = await response.json();

    if (data.success) {
      setSelectedResult(data.result);
      setDetailMode(mode);
    }
  };

  const downloadCorrectionPdf = async () => {
    if (!selectedResult) {
      return;
    }

    const response = await fetch("http://127.0.0.1:5000/download-correction-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
    const shareUrl = "http://localhost:5173/guest";

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
    setToast(t.shareLinkCopied);
    setTimeout(() => setToast(""), 2200);
  };

  const navItems = [
    { label: t.dashboard, path: "/student-dashboard", icon: "dashboard" },
    { label: t.exercises, path: "/exercises", icon: "exercises" },
    { label: navText.aiAssistant, path: "/chatbot", icon: "chat" },
    { label: t.history, path: "/history", icon: "history" },
    { label: navText.messages, path: "/messages", icon: "messages" },
    { label: t.settings, path: "/settings", icon: "settings" },
  ];

  return (
    <LearnixLayout
      title={t.dashboardWelcome}
      subtitle={t.dashboardSubtitle}
      navItems={navItems}
      notificationCount={unreadMessageCount}
    >
        <div className="stats-grid">
          <div className="dash-card stat-card">
            <h3>{loadingStats ? "..." : stats.totalQuizzes}</h3>
            <p>{t.totalQuizzes}</p>
          </div>
          <div className="dash-card stat-card">
            <h3>{loadingStats ? "..." : `${Math.round(stats.averageScore)}%`}</h3>
            <p>{t.averageScore}</p>
          </div>
          <div className="dash-card stat-card">
            <h3>{loadingStats ? "..." : `${Math.round(stats.bestScore)}%`}</h3>
            <p>{t.bestScore}</p>
          </div>
          <div className="dash-card stat-card">
            <h3>{loadingStats ? "..." : formatDuration(stats.totalTimeSpent)}</h3>
            <p>{t.timeSpent}</p>
          </div>
        </div>

        <div className="dashboard-cards">
          <button className="dash-card dash-action" onClick={() => navigate("/exercises")}>
            <h3>{t.uploadPdfCard}</h3>
            <p>{t.uploadPdfText}</p>
          </button>

          <button className="dash-card dash-action" onClick={() => navigate("/chatbot")}>
            <h3>{t.aiChatbot}</h3>
            <p>{t.aiChatbotText}</p>
          </button>

          <div className="dash-card">
            <h3>{t.scores}</h3>
            <p>
              {stats.totalQuizzes > 0
                ? `${Math.round(stats.averageScore)}%`
                : t.noStats}
            </p>
          </div>
        </div>

        <section className="quiz-list-section">
          <div className="section-heading">
            <div>
              <h2>{t.yourQuizzes}</h2>
              <p>{t.recentQuizzes}</p>
            </div>
            <button className="secondary-action" onClick={() => navigate("/history")}>
              {t.history}
            </button>
          </div>

          {recentQuizzes.length === 0 ? (
            <div className="dash-card empty-card">
              <p>{t.noQuizzesYet}</p>
            </div>
          ) : (
            <div className="quiz-result-grid">
              {recentQuizzes.map((quiz) => (
                <div className="dash-card quiz-result-card" key={quiz.id}>
                  <div className="quiz-card-top">
                    <div>
                      <h3>{quiz.category}</h3>
                      <p>{quiz.difficulty}</p>
                    </div>
                    <span>{t.completed}</span>
                  </div>
                  <div className="quiz-card-metrics">
                    <strong>{Math.round(quiz.percentage)}%</strong>
                    <p>
                      {quiz.totalQuestions} {t.question}
                    </p>
                    <small>
                      {t.completedDate}: {formatDate(quiz.createdAt)}
                    </small>
                    <small>
                      {t.duration}: {formatDuration(quiz.timeSpentSeconds)}
                    </small>
                  </div>
                  <div className="quiz-card-actions">
                    <button onClick={() => navigate(`/retake-quiz/${quiz.id}`)}>{t.retakeQuizAction}</button>
                    <button onClick={() => loadResult(quiz.id, "correction")}>{t.viewCorrection}</button>
                    <button onClick={() => loadResult(quiz.id, "results")}>{t.resultsAction}</button>
                    <button onClick={shareResult}>{t.share}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

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
        </section>
    </LearnixLayout>
  );
}

export default StudentDashboard;
