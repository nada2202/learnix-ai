import { useState } from "react";
import { BookAiLogo } from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { formatDuration } from "../utils/duration";

function GuestQuiz() {
  const { language, setLanguage, t, dir } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [file, setFile] = useState(null);
  const [numQuestions, setNumQuestions] = useState(3);
  const [difficulty, setDifficulty] = useState("Easy");
  const [category, setCategory] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [view, setView] = useState("setup");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const generateQuiz = async () => {
    if (!file) {
      alert(t.selectPdf);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("numQuestions", numQuestions);
    formData.append("difficulty", difficulty);
    formData.append("language", language);

    try {
      setLoading(true);
      const response = await fetch("http://127.0.0.1:5000/generate-exercises", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        setCategory(data.category);
        setQuestions(data.exercises);
        setAnswers(Array(data.exercises.length).fill(""));
        setCurrentQuestion(0);
        setResult(null);
        setStartedAt(new Date().getTime());
        setView("quiz");
      } else {
        alert(data.message || t.noExercisesGenerated);
      }
    } catch {
      alert(t.generationFailed);
    } finally {
      setLoading(false);
    }
  };

  const updateAnswer = (value) => {
    const nextAnswers = [...answers];
    nextAnswers[currentQuestion] = value;
    setAnswers(nextAnswers);
  };

  const finishQuiz = async () => {
    const timeSpentSeconds = startedAt
      ? Math.max(1, Math.round((new Date().getTime() - startedAt) / 1000))
      : 0;

    try {
      setSubmitting(true);
      const response = await fetch("http://127.0.0.1:5000/correct-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          difficulty,
          exercises: questions,
          answers,
          language,
          timeSpentSeconds,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setResult(data.result);
        setStartedAt(null);
        setView("result");
      } else {
        alert(data.message || t.correctionFailed);
      }
    } catch {
      alert(t.correctionFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadCorrectionPdf = async () => {
    if (!result) {
      return;
    }

    try {
      setDownloading(true);
      const response = await fetch("http://127.0.0.1:5000/download-correction-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentName: t.studentFallback,
          studentEmail: "",
          category,
          difficulty,
          result,
        }),
      });

      if (!response.ok) {
        alert(t.pdfFailed);
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
    } catch {
      alert(t.pdfFailed);
    } finally {
      setDownloading(false);
    }
  };

  const question = questions[currentQuestion];
  const progress = questions.length ? ((currentQuestion + 1) / questions.length) * 100 : 0;
  const incorrect = result ? result.totalQuestions - result.score : 0;
  const resultLevel = result?.percentage >= 80
    ? "high"
    : result?.percentage >= 50
      ? "medium"
      : "low";

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
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">{t.english}</option>
            <option value="fr">{t.french}</option>
            <option value="ar">{t.arabic}</option>
          </select>
        </div>
      </header>

      <main className="shared-main">
        <section className="shared-hero">
          <span className="badge">{t.guestMode}</span>
          <h1>{t.guestQuizTitle}</h1>
          <p>{t.guestQuizSubtitle}</p>
        </section>

        {view === "setup" && (
          <div className="dash-card quiz-card shared-quiz-card">
            <h3>{t.createQuiz}</h3>
            <div className="form-group">
              <label>{t.uploadLessonPdf}</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files[0])}
              />
            </div>
            <div className="form-group">
              <label>{t.questionCount}</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numQuestions}
                onChange={(event) => setNumQuestions(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{t.difficulty}</label>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="Easy">{t.difficultyEasy}</option>
                <option value="Medium">{t.difficultyMedium}</option>
                <option value="Hard">{t.difficultyHard}</option>
              </select>
            </div>
            <button className="primary-action" onClick={generateQuiz} disabled={loading}>
              {loading ? t.generating : t.generateQuiz}
            </button>
          </div>
        )}

        {view === "quiz" && question && (
          <div className="dash-card quiz-card shared-quiz-card">
            <div className="quiz-topline">
              <p>
                {t.question} {currentQuestion + 1} / {questions.length}
              </p>
              <span>{t.detectedCategory}: {category}</span>
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
              onChange={(event) => updateAnswer(event.target.value)}
            />
            <div className="quiz-actions">
              <button
                onClick={() => setCurrentQuestion(currentQuestion - 1)}
                disabled={currentQuestion === 0}
              >
                {t.back}
              </button>
              {currentQuestion < questions.length - 1 ? (
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

        {view === "result" && result && (
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
                <button onClick={downloadCorrectionPdf} disabled={downloading}>
                  {downloading ? t.downloading : t.downloadPdf}
                </button>
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
      </main>
    </div>
  );
}

export default GuestQuiz;
