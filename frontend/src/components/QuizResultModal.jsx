/* eslint-disable react-refresh/only-export-components */
import { useEffect } from "react";
import { scoreToneClass } from "../utils/scoreTone";
import { useLanguage } from "../context/LanguageContext";
import { localizedCategory, localizedDifficulty } from "../utils/localizedLabels";
function QuizResultModal({ mode, result, t, onBack, onDownload, showDownload = false }) {
  const { language } = useLanguage();

  useEffect(() => {
    if (!result) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [result]);

  if (!result) {
    return null;
  }

  const details = result.details || [];
  const correctCount = result.correctCount ?? result.score;
  const incorrectCount = result.incorrectCount ?? Math.max(0, result.totalQuestions - result.score);
  const duration = formatDuration(result.timeSpentSeconds);
  const level = result.percentage >= 80 ? "high" : result.percentage >= 50 ? "medium" : "low";
  const message = level === "high"
    ? t.excellentWork
    : level === "medium"
      ? t.mediumMessage
      : t.lowMessage;

  return (
    <div className={`modal-backdrop ${mode !== "results" ? "modal-backdrop-correction" : ""}`} role="dialog" aria-modal="true">
      <div className={`result-modal result-${level} result-modal-mode-${mode} ${mode !== "results" ? correctionScoreTone(result.percentage) : resultScoreTone(result.percentage)} ${scoreToneClass(result.percentage)}`}>
        <div className="modal-header">
          <div>
            <span className="modal-kicker">{localizedCategory(result.category, language)} / {localizedDifficulty(result.difficulty, language)}</span>
            <h2>{mode === "results" ? t.scoreSummary : t.correctionDetails}</h2>
            <div className="correction-hero-meta">
              <span>{t.completedOn}: {formatDate(result.createdAt)}</span>
              <span>{t.duration}: {duration}</span>
            </div>
          </div>
          {mode !== "results" && (
            <div className="correction-hero-score" aria-label={`${Math.round(result.percentage)}%`}>
              <span>{Math.round(result.percentage)}%</span>
            </div>
          )}
          <button className="modal-close" onClick={onBack} aria-label={t.back}>
            x
          </button>
        </div>

        <div className="modal-scroll-region">
          {mode === "results" && <div className="modal-result-summary">
            <div className="modal-score">
            <div className="percent-circle">
              <span>{Math.round(result.percentage)}%</span>
            </div>
            <h3>{message}</h3>
            <p>{result.feedback}</p>
          </div>

          <div className="modal-stat-grid">
            <div className="modal-stat-card">
              <strong>{correctCount}</strong>
              <span>{t.correct}</span>
            </div>
            <div className="modal-stat-card">
              <strong>{incorrectCount}</strong>
              <span>{t.incorrect}</span>
            </div>
            <div className="modal-stat-card">
              <strong>{result.totalQuestions}</strong>
              <span>{t.question}</span>
            </div>
            <div className="modal-stat-card">
              <strong>{duration}</strong>
              <span>{t.duration}</span>
            </div>
          </div>
          </div>}
            {mode !== "results" && showDownload && <div className="modal-toolbar"><button onClick={onDownload}>{t.downloadPdf}</button></div>}

            {mode !== "results" && <div className="correction-list">
              {details.length ? details.map((item, index) => (
                <article
                  className={`correction-card ${item.isCorrect ? "correct" : "wrong"}`}
                  key={`${item.question}-${index}`}
                >
                  <div className="correction-card-head">
                    <div>
                      <span className="question-index">{t.question} {index + 1}</span>
                      <h3>{item.question}</h3>
                    </div>
                    <span className="status-chip">
                      {item.isCorrect ? "✓" : "×"} {item.isCorrect ? t.correct : "À revoir"}
                    </span>
                  </div>

                  <div className="answer-columns">
                    <div className={`answer-block answer-student ${item.isCorrect ? "answer-student-correct" : "answer-student-wrong"}`}>
                      <span><PanelIcon type={item.isCorrect ? "student-correct" : "student"} />{t.yourAnswer}</span>
                      <p>{item.studentAnswer || t.noAnswer}</p>
                    </div>
                    <div className="answer-block answer-expected">
                      <span><PanelIcon type="expected" />{t.correctAnswer}</span>
                      <p>{item.correctAnswer}</p>
                    </div>
                    <div className="answer-block feedback answer-ai">
                      <span><PanelIcon type="ai" />{t.aiFeedback}</span>
                      <p>{item.explanation}</p>
                    </div>
                  </div>
                </article>
              )) : (
                <article className="correction-card">
                  <p>{t.noQuestionDetails || "Aucun détail par question n'est disponible pour ce résultat."}</p>
                </article>
              )}
            </div>}
        </div>
      </div>
    </div>
  );
}

function correctionScoreTone(value) {
  const score = Number(value || 0);
  if (score >= 70) return "correction-score-green";
  if (score >= 40) return "correction-score-yellow";
  return "correction-score-red";
}

function resultScoreTone(value) {
  const score = Number(value || 0);
  if (score >= 70) return "result-score-green";
  if (score >= 40) return "result-score-yellow";
  return "result-score-red";
}

function PanelIcon({ type }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" };
  if (type === "student-correct") {
    return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.2 2.2 4.8-5.4" /></svg>;
  }
  if (type === "expected") {
    return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.2 2.2 4.8-5.4" /></svg>;
  }
  if (type === "ai") {
    return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="11" rx="4" /><path d="M12 7V4M9 13h.01M15 13h.01M9 18l-2 2M15 18l2 2" /></svg>;
  }
  return <svg {...common} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
}

export function formatDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes < 60) {
    return remainingSeconds ? `${minutes}min ${remainingSeconds}s` : `${minutes}min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
}

export default QuizResultModal;
