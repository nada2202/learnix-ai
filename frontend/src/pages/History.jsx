import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import QuizResultModal, { formatDate } from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";

function History() {
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [detailMode, setDetailMode] = useState(null);
  const [toast, setToast] = useState("");
  const navigate = useNavigate();
  const { t } = useLanguage();
  const user = JSON.parse(localStorage.getItem("studentUser") || "{}");

  const fetchResults = useCallback(async () => {
    const params = new URLSearchParams();

    if (user.id) {
      params.append("userId", user.id);
    } else if (user.email) {
      params.append("email", user.email);
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:5000/quiz-results?${params.toString()}`
      );
      const data = await response.json();

      if (data.success) {
        setResults(data.results);
      }
    } catch {
      setResults([]);
    }
  }, [user.email, user.id]);

  useEffect(() => {
    const timer = setTimeout(fetchResults, 0);
    return () => clearTimeout(timer);
  }, [fetchResults]);

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

  return (
    <LearnixLayout title={t.historyTitle} subtitle={t.historySubtitle}>
        {results.length === 0 ? (
          <div className="dash-card empty-card">
            <p>{t.noQuizzesYet}</p>
          </div>
        ) : (
          <div className="history-list">
            {results.map((quiz) => (
              <div className="dash-card history-item" key={quiz.id}>
                <div>
                  <small>{formatDate(quiz.createdAt)}</small>
                  <h3>{quiz.category}</h3>
                  <p>{quiz.difficulty}</p>
                </div>
                <div className="history-metrics">
                  <strong>{Math.round(quiz.percentage)}%</strong>
                  <span>
                    {quiz.correctCount} {t.correct} / {quiz.incorrectCount} {t.incorrect}
                  </span>
                  <span>{t.duration}: {formatDuration(quiz.timeSpentSeconds)}</span>
                  <span>{t.completed}</span>
                </div>
                <div className="quiz-card-actions">
                  <button onClick={() => loadResult(quiz.id, "correction")}>{t.viewDetails}</button>
                  <button onClick={() => loadResult(quiz.id, "results")}>{t.resultsAction}</button>
                  <button onClick={() => navigate(`/retake-quiz/${quiz.id}`)}>{t.retakeQuizAction}</button>
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
    </LearnixLayout>
  );
}

export default History;
