import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import LearnixLayout, { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { formatDuration } from "../utils/duration";

function SavedQuizPage({ mode }) {
  const { id } = useParams();
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const user = JSON.parse(localStorage.getItem("studentUser") || "{}");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const isShared = mode === "shared";

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:5000/shared-quiz/${id}`);
        const data = await response.json();

        if (data.success) {
          setQuiz(data.quiz);
          setAnswers(Array(data.quiz.questions.length).fill(""));
          setStartedAt(new Date().getTime());
        }
      } finally {
        setLoading(false);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [id]);

  const handleAnswerChange = (value) => {
    const updated = [...answers];
    updated[currentQuestion] = value;
    setAnswers(updated);
  };

  const finishQuiz = async () => {
    const timeSpentSeconds = startedAt
      ? Math.max(1, Math.round((new Date().getTime() - startedAt) / 1000))
      : 0;

    try {
      setSubmitting(true);
      const response = await fetch(`http://127.0.0.1:5000/submit-saved-quiz/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers,
          language,
          userId: isShared ? null : user.id || null,
          studentName: isShared ? t.studentFallback : user.name || t.studentFallback,
          studentEmail: isShared ? null : user.email || null,
          timeSpentSeconds,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setResult(data.result);
        setStartedAt(null);
        window.dispatchEvent(new Event("quizResultUpdated"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const question = quiz?.questions[currentQuestion];
  const progress = quiz?.questions.length
    ? ((currentQuestion + 1) / quiz.questions.length) * 100
    : 0;
  const incorrect = result ? result.totalQuestions - result.score : 0;
  const resultLevel = result?.percentage >= 80
    ? "high"
    : result?.percentage >= 50
      ? "medium"
      : "low";
  const pageTitle = mode === "retake" ? t.retakeQuizTitle : t.sharedQuizTitle;

  const downloadCorrectionPdf = async () => {
    if (!result || !quiz) {
      return;
    }

    const response = await fetch("http://127.0.0.1:5000/download-correction-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentName: user.name || t.studentFallback,
        studentEmail: user.email || "",
        category: quiz.category,
          difficulty: quiz.difficulty,
          result,
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

  const content = (
    <>
      {loading && (
        <div className="dash-card quiz-card">
          <p>{t.loadingQuiz}</p>
        </div>
      )}

      {!loading && !quiz && (
        <div className="dash-card quiz-card">
          <p>{t.quizUnavailable}</p>
        </div>
      )}

      {quiz && !result && question && (
        <div className="dash-card quiz-card shared-quiz-card">
          <div className="quiz-topline">
            <p>
              {t.question} {currentQuestion + 1} / {quiz.questions.length}
            </p>
            <span>{t.detectedCategory}: {quiz.category}</span>
          </div>

          <div className="progress-track" aria-label={t.quizProgressLabel}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <h2>{question.question}</h2>
          {question.instructions && (
            <p className="question-instructions">{question.instructions}</p>
          )}

          <textarea
            placeholder={t.yourAnswer}
            value={answers[currentQuestion]}
            onChange={(event) => handleAnswerChange(event.target.value)}
          />

          <div className="quiz-actions">
            <button
              onClick={() => setCurrentQuestion(currentQuestion - 1)}
              disabled={currentQuestion === 0}
            >
              {t.back}
            </button>
            {currentQuestion < quiz.questions.length - 1 ? (
              <button onClick={() => setCurrentQuestion(currentQuestion + 1)}>
                {t.next}
              </button>
            ) : (
              <button onClick={finishQuiz} disabled={submitting}>
                {submitting ? t.saving : t.finishQuiz}
              </button>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className={`result-layout result-${resultLevel} shared-result-layout`}>
          <div className="dash-card score-card">
            <div className="percent-circle">
              <span>{Math.round(result.percentage)}%</span>
            </div>
            <h2>{resultLevel === "high" ? t.excellentWork : resultLevel === "medium" ? t.goodProgress : t.keepImproving}</h2>
            <p>{result.score} / {result.totalQuestions}</p>
            <small>{t.duration}: {formatDuration(result.timeSpentSeconds)}</small>
          </div>

          <div className="result-stats">
            <div className="dash-card stat-card correct-stat">
              <h3>{result.score}</h3>
              <p>{t.correct}</p>
            </div>
            <div className="dash-card stat-card wrong-stat">
              <h3>{incorrect}</h3>
              <p>{t.incorrect}</p>
            </div>
            <div className="dash-card stat-card duration-stat">
              <h3>{formatDuration(result.timeSpentSeconds)}</h3>
              <p>{t.duration}</p>
            </div>
          </div>

          <div className="dash-card result-card result-wide">
            <div className="feedback-box">
              <h3>{t.aiFeedback}</h3>
              <p>{result.feedback}</p>
            </div>

            <div className="quiz-actions">
              <button onClick={downloadCorrectionPdf}>{t.downloadPdf}</button>
            </div>

            <div className="answer-review">
              {result.details.map((item, index) => (
                <div
                  className={`review-item ${item.isCorrect ? "correct" : "wrong"}`}
                  key={`${item.question}-${index}`}
                >
                  <div className="review-title">
                    <h3>{t.question} {index + 1}</h3>
                    <span>{item.isCorrect ? t.correct : t.incorrect}</span>
                  </div>
                  <p className="review-question">{item.question}</p>
                  <p><strong>{t.yourAnswer}:</strong> {item.studentAnswer || t.noAnswer}</p>
                  <p><strong>{t.correctAnswer}:</strong> {item.correctAnswer}</p>
                  <p><strong>{t.aiFeedback}:</strong> {item.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isShared) {
    return (
      <div className="shared-page" dir={dir}>
        <header className="shared-header">
          <div className="shared-brand">
            <BookAiLogo />
            <strong>Learnix AI</strong>
          </div>
          <div className="shared-actions">
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              {theme === "dark" ? t.lightMode : t.darkMode}
            </button>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">{t.english}</option>
              <option value="fr">{t.french}</option>
              <option value="ar">{t.arabic}</option>
            </select>
          </div>
        </header>

        <main className="shared-main">
          <section className="shared-hero">
            <span className="badge">{quiz ? quiz.category : t.sharedQuizTitle}</span>
            <h1>{pageTitle}</h1>
            <p>{quiz ? `${quiz.category} / ${quiz.difficulty}` : t.loadingQuiz}</p>
          </section>
          {content}
        </main>
      </div>
    );
  }

  return (
    <LearnixLayout
      title={pageTitle}
      subtitle={quiz ? `${quiz.category} / ${quiz.difficulty}` : t.loadingQuiz}
    >
      {content}
    </LearnixLayout>
  );
}

export default SavedQuizPage;
