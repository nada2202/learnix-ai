/* eslint-disable react-refresh/only-export-components */
function QuizResultModal({ mode, result, t, onBack, onDownload }) {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`result-modal result-${level}`}>
        <div className="modal-header">
          <div>
            <span className="modal-kicker">{result.category} / {result.difficulty}</span>
            <h2>{mode === "results" ? t.scoreSummary : t.correctionDetails}</h2>
            <p>{t.completedOn}: {formatDate(result.createdAt)}</p>
            <p>{t.duration}: {duration}</p>
          </div>
          <button className="modal-close" onClick={onBack} aria-label={t.back}>
            x
          </button>
        </div>

        {mode === "results" ? (
          <div className="modal-result-summary">
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
          </div>
        ) : (
          <>
            <div className="modal-toolbar">
              <button onClick={onDownload}>{t.downloadPdf}</button>
            </div>

            <div className="correction-list">
              {details.map((item, index) => (
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
                      {item.isCorrect ? "✓" : "✗"} {item.isCorrect ? t.correct : t.incorrect}
                    </span>
                  </div>

                  <div className="answer-columns">
                    <div className="answer-block">
                      <span>{t.yourAnswer}</span>
                      <p>{item.studentAnswer || t.noAnswer}</p>
                    </div>
                    <div className="answer-block">
                      <span>{t.correctAnswer}</span>
                      <p>{item.correctAnswer}</p>
                    </div>
                    <div className="answer-block feedback">
                      <span>{t.aiFeedback}</span>
                      <p>{item.explanation}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
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
