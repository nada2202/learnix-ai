import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookAiLogo } from "../components/LearnixLayout";
import { AlertMessage } from "../components/ui";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";
import { apiErrorMessage, apiFetch, readApiJson } from "../services/api";
import { localizedCategory } from "../utils/localizedLabels";

function GuestQuiz() {
  const navigate = useNavigate();
  const { language, setLanguage, t, dir } = useLanguage();
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
  const [message, setMessage] = useState("");

  const generateQuiz = async () => {
    if (!file) {
      setMessage(t.selectPdf);
      return;
    }

    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("numQuestions", numQuestions);
    formData.append("difficulty", difficulty);
    formData.append("language", language);

    try {
      setLoading(true);
      const response = await apiFetch("/generate-exercises", {
        method: "POST",
        body: formData,
      });
      const data = await readApiJson(response, t.generationFailed);

      if (data.success) {
        setMessage("");
        setCategory(data.category);
        setQuestions(data.exercises);
        setAnswers(Array(data.exercises.length).fill(""));
        setCurrentQuestion(0);
        setResult(null);
        setStartedAt(new Date().getTime());
        setView("quiz");
      } else {
        setMessage(data.message || t.noExercisesGenerated);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t) || t.generationFailed);
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
      const response = await apiFetch("/correct-quiz", {
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
      const data = await readApiJson(response, t.correctionFailed);

      if (data.success) {
        setMessage("");
        setResult(data.result);
        setStartedAt(null);
        setView("result");
      } else {
        setMessage(data.message || t.correctionFailed);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t) || t.correctionFailed);
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
      const response = await apiFetch("/download-correction-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          studentName: t.studentFallback,
          studentEmail: "",
          category,
          difficulty,
          result,
        }),
      });

      if (!response.ok) {
        setMessage(t.pdfFailed);
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
      setMessage(t.pdfFailed);
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
    <div className="shared-page guest-quiz-page" dir={dir}>
      <header className="shared-header">
        <button className="learnix-brand guest-brand-link" type="button" onClick={() => navigate("/guest")}>
          <BookAiLogo />
          <h2>Learnix<span>IA</span></h2>
        </button>
        <div className="shared-actions">
          <label className="guest-language-select">
            <span aria-hidden="true"><GuestUploadIcon type="globe" /></span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t.language}>
              <option value="en">{t.english}</option>
              <option value="fr">{t.french}</option>
              <option value="ar">{t.arabic}</option>
            </select>
          </label>
        </div>
      </header>

      <main className="shared-main">
        <section className="shared-hero">
          <span className="badge">Mode invité</span>
          <h1>Quiz invité</h1>
          <p>Importez un PDF de cours, générez un quiz et obtenez une correction instantanée sans connexion.</p>
        </section>

        {message && <AlertMessage tone="warning">{message}</AlertMessage>}

        {view === "setup" && (
          <div className="guest-setup-grid">
            <div className="dash-card quiz-card shared-quiz-card guest-create-card">
            <div className="guest-form-head">
              <span aria-hidden="true"><GuestUploadIcon type="spark" /></span>
              <div>
                <h3>Créer un quiz</h3>
                <p>Préparez votre questionnaire à partir d'un support PDF.</p>
              </div>
            </div>

            <div className="form-group guest-upload-group">
              <label>Support de cours PDF</label>
              <label className="guest-upload-zone">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    setFile(event.target.files[0]);
                    setMessage("");
                  }}
                />
                <span className="guest-upload-icon" aria-hidden="true"><GuestUploadIcon type="pdf" /></span>
                <strong>Déposez votre fichier PDF ici</strong>
                <em>ou cliquez pour parcourir</em>
                <b>Choisir un fichier</b>
              </label>
              <p className="guest-file-name">{file?.name || "Aucun fichier sélectionné"}</p>
            </div>

            <div className="form-group">
              <label>Nombre de questions</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numQuestions}
                onChange={(event) => setNumQuestions(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Niveau de difficulté</label>
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

            <aside className="guest-side-column">

            <section className="guest-how-card" aria-label="Comment ça marche ?">
              <h4>Comment ça marche ?</h4>
              <ol>
                <li><span>1</span>Importez votre PDF</li>
                <li><span>2</span>Choisissez le nombre de questions</li>
                <li><span>3</span>Lancez le quiz et consultez la correction</li>
              </ol>
            </section>
              <section className="guest-privacy-card">
                <div className="guest-privacy-icon" aria-hidden="true"><GuestUploadIcon type="shield" /></div>
                <div>
                  <h4>Confidentialité garantie</h4>
                  <p>Aucun fichier n'est stocké. Vos données restent privées et sécurisées.</p>
                </div>
              </section>
            </aside>
          </div>
        )}

        {view === "quiz" && question && (
          <div className="dash-card quiz-card shared-quiz-card guest-question-card" key={`guest-question-${currentQuestion}`}>
            <div className="quiz-topline">
              <p>
                {t.question} {currentQuestion + 1} / {questions.length}
              </p>
              <span>{t.detectedCategory}: {localizedCategory(category, language)}</span>
            </div>
            <div className="progress-track" aria-label={t.quizProgressLabel}>
              <div className="progress-fill" style={{ width: `${progress}%` }} key={`guest-progress-${currentQuestion}`} />
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
                onClick={() => setCurrentQuestion((index) => Math.max(0, index - 1))}
                disabled={currentQuestion === 0}
              >
                {t.back}
              </button>
              {currentQuestion < questions.length - 1 ? (
                <button onClick={() => setCurrentQuestion((index) => Math.min(questions.length - 1, index + 1))}>
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
                <button className="restricted-download" onClick={downloadCorrectionPdf} disabled={downloading}>
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
      <footer className="guest-footer">© 2026 Learnix IA. Tous droits réservés.</footer>
    </div>
  );
}

function GuestUploadIcon({ type }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "2.1", strokeLinecap: "round", strokeLinejoin: "round" };

  if (type === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        <path {...common} d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      </svg>
    );
  }

  if (type === "globe") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="9" />
        <path {...common} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }

  if (type === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3l7 3v5c0 4.6-2.9 8.4-7 10-4.1-1.6-7-5.4-7-10V6z" />
        <path {...common} d="M9 12l2 2 4-4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M7 3h7l4 4v14H7z" />
      <path {...common} d="M14 3v5h4" />
      <path {...common} d="M9 15h6M12 18v-6" />
      <path {...common} d="M9 10h2" />
    </svg>
  );
}

export default GuestQuiz;
