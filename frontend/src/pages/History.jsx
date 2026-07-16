import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import QuizResultModal, { formatDate } from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";
import { apiFetch, frontendUrl, readApiJson } from "../services/api";
import { readStoredObject } from "../services/roles";
import { scoreToneClass } from "../utils/scoreTone";
import { localizedCategory, localizedDifficulty } from "../utils/localizedLabels";

function History() {
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailMode, setDetailMode] = useState(null);
  const [toast, setToast] = useState("");
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const user = readStoredObject("studentUser");

  const fetchResults = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    try {
      const response = await apiFetch(`/quiz-results?${params.toString()}`);
      const data = await readApiJson(response, t.serverError);

      if (data.success) {
        setResults(data.results);
      } else {
        setToast(data.message || t.serverError);
      }
    } catch {
      setResults([]);
    }
  }, [t.serverError, user.email, user.id]);

  useEffect(() => {
    const timer = setTimeout(fetchResults, 0);
    return () => clearTimeout(timer);
  }, [fetchResults]);

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

  return (
    <LearnixLayout
      className="student-dashboard-page student-history-page"
      title="Historique des quiz"
      subtitle="Retrouvez vos quiz terminés, vos scores et vos corrections."
    >
        {results.length === 0 ? (
          <div className="dash-card empty-card">
            <p>{t.noQuizzesYet}</p>
          </div>
        ) : (
          <div className="history-list">
            {results.map((quiz) => (
              <div className={`dash-card history-item ${scoreToneClass(quiz.percentage)} ${historyScoreTone(quiz.percentage)}`} key={quiz.id}>
                <div className="history-card-head">
                  <span className="history-subject-icon" aria-hidden="true">{subjectIconFor(quiz.category)}</span>
                  <div>
                    <small>{formatDate(quiz.createdAt)}</small>
                    <h3>{localizedCategory(quiz.category, language)}</h3>
                    <p className={`history-difficulty history-difficulty-${String(quiz.difficulty || "").toLowerCase()}`}>{localizedDifficulty(quiz.difficulty, language)}</p>
                  </div>
                  <strong className="history-score-badge">{Math.round(quiz.percentage)}%</strong>
                </div>
                <div className="history-metrics">
                  <div className="score-progress-track"><span style={{ width: `${quiz.percentage}%` }} /></div>
                  <div className="history-info-row">
                    <span><HistoryIcon type="check" />{quiz.correctCount} {t.correct}</span>
                    <span><HistoryIcon type="review" />{quiz.incorrectCount} à revoir</span>
                    <span><HistoryIcon type="clock" />{t.duration}: {formatDuration(quiz.timeSpentSeconds)}</span>
                  </div>
                  <span className="history-status-badge"><HistoryIcon type="check" />{t.completed}</span>
                </div>
                <div className="quiz-card-actions">
                  <button onClick={() => loadResult(quiz.id, "correction")}><HistoryIcon type="eye" />{t.viewDetails}</button>
                  <button onClick={() => loadResult(quiz.id, "results")}><HistoryIcon type="chart" />{t.resultsAction}</button>
                  <button onClick={() => navigate(`/retake-quiz/${quiz.id}`)}><HistoryIcon type="redo" />{t.retakeQuizAction}</button>
                  <button onClick={shareResult}><HistoryIcon type="share" />{t.share}</button>
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
          showDownload
        />

        {toast && <div className="toast-notification">{toast}</div>}
    </LearnixLayout>
  );
}

function subjectIconFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("math")) return "π";
  if (normalized.includes("history") || normalized.includes("histoire")) return "H";
  if (normalized.includes("phys")) return "Φ";
  if (normalized.includes("anglais") || normalized.includes("english")) return "A";
  return String(value || "Q").charAt(0).toUpperCase();
}

function historyScoreTone(value) {
  const score = Number(value || 0);
  if (score >= 70) return "history-score-green";
  if (score >= 40) return "history-score-yellow";
  return "history-score-red";
}

function HistoryIcon({ type }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.2 2.2 4.8-5.4" /></>,
    review: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><rect x="7" y="11" width="3" height="5" rx="1" /><rect x="12" y="8" width="3" height="8" rx="1" /><rect x="17" y="6" width="3" height="10" rx="1" /></>,
    redo: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v6h-6" /></>,
    share: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
  };
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true">{paths[type] || <path d="M12 5v14M5 12h14" />}</svg>;
}

export default History;
