import { useCallback, useMemo, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { demoTeachers, teacherForSubject } from "../data/demoTeachers";
import { formatDuration } from "../utils/duration";

function Exercises() {
  const [file, setFile] = useState(null);
  const [numQuestions, setNumQuestions] = useState(3);
  const [difficulty, setDifficulty] = useState("Easy");
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState("");
  const [summary, setSummary] = useState("");
  const [generatedKeyConcepts, setGeneratedKeyConcepts] = useState([]);
  const [importantNotes, setImportantNotes] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [exercises, setExercises] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [view, setView] = useState("setup");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const { language, t } = useLanguage();
  const user = JSON.parse(localStorage.getItem("studentUser") || "{}");
  const selectedTeacher = useMemo(
    () => demoTeachers.find((teacher) => teacher.id === selectedTeacherId) || null,
    [selectedTeacherId]
  );
  const difficultyLabel = useCallback((value) => ({
    Easy: t.difficultyEasy,
    Medium: t.difficultyMedium,
    Hard: t.difficultyHard,
  })[value] || value, [t.difficultyEasy, t.difficultyHard, t.difficultyMedium]);

  const lessonSummary = useMemo(() => {
    const sourceText = summary || preview;
    const compact = sourceText.replace(/\s+/g, " ").trim();
    return compact.length > 520 ? `${compact.slice(0, 520)}...` : compact;
  }, [preview, summary]);

  const keyConcepts = useMemo(() => {
    if (generatedKeyConcepts.length > 0) {
      return generatedKeyConcepts;
    }

    const words = preview
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 5);
    const counts = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});

    const concepts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word]) => word);

    return concepts.length ? concepts : [category || t.lessonFallback, difficultyLabel(difficulty)];
  }, [category, difficulty, difficultyLabel, generatedKeyConcepts, preview, t.lessonFallback]);

  const resetQuiz = () => {
    setView("setup");
    setResult(null);
    setExercises([]);
    setAnswers([]);
    setCurrentQuestion(0);
    setPreview("");
    setSummary("");
    setGeneratedKeyConcepts([]);
    setImportantNotes([]);
    setSelectedTeacherId("");
    setCategory("");
    setQuizStartedAt(null);
  };

  const handleGenerate = async () => {
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

      if (data.success && Array.isArray(data.exercises) && data.exercises.length > 0) {
        setPreview(data.preview);
        setSummary(data.summary || "");
        setGeneratedKeyConcepts(Array.isArray(data.keyConcepts) ? data.keyConcepts : []);
        setImportantNotes(Array.isArray(data.importantNotes) ? data.importantNotes : []);
        setCategory(data.category);
        setSelectedTeacherId(teacherForSubject(data.category)?.id || "");
        setExercises(data.exercises);
        setAnswers(Array(data.exercises.length).fill(""));
        setCurrentQuestion(0);
        setResult(null);
        setView("choice");
      } else {
        alert(data.message || t.noExercisesGenerated);
      }
    } catch (error) {
      console.error(error);
      alert(t.generationFailed);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = () => {
    const teacher = demoTeachers.find((item) => item.id === selectedTeacherId);

    if (!teacher) {
      alert(t.chooseSubjectTeacherBeforeStart);
      return;
    }

    if (category === "General") {
      setCategory(teacher.subject);
    }

    setCurrentQuestion(0);
    setAnswers(Array(exercises.length).fill(""));
    setQuizStartedAt(new Date().getTime());
    setView("quiz");
  };

  const handleAnswerChange = (value) => {
    const updatedAnswers = [...answers];
    updatedAnswers[currentQuestion] = value;
    setAnswers(updatedAnswers);
  };

  const finishQuiz = async () => {
    const timeSpentSeconds = quizStartedAt
      ? Math.max(1, Math.round((new Date().getTime() - quizStartedAt) / 1000))
      : 0;

    try {
      setSavingResult(true);
      const teacher = selectedTeacher || teacherForSubject(category);
      const assignedCategory = category === "General" && teacher ? teacher.subject : category;

      const response = await fetch("http://127.0.0.1:5000/correct-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id || null,
          studentName: user.name || t.studentFallback,
          studentEmail: user.email || null,
          category: assignedCategory,
          difficulty,
          teacherId: teacher?.id || "",
          teacherName: teacher?.name || "",
          teacherEmail: teacher?.email || "",
          teacherSubject: teacher?.subject || assignedCategory,
          exercises,
          answers,
          timeSpentSeconds,
          language,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data.result);
        setQuizStartedAt(null);
        setView("result");
        localStorage.setItem("dashboardStatsRefresh", String(new Date().getTime()));
        window.dispatchEvent(new Event("quizResultUpdated"));
      } else {
        alert(data.message || t.correctionFailed);
      }
    } catch {
      alert(t.correctionFailed);
    } finally {
      setSavingResult(false);
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
          studentName: user.name || t.studentFallback,
          studentEmail: user.email || "",
          category,
          difficulty,
          result: {
            ...result,
            timeSpentSeconds: result.timeSpentSeconds || 0,
          },
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

  const question = exercises[currentQuestion];
  const progress = exercises.length
    ? ((currentQuestion + 1) / exercises.length) * 100
    : 0;
  const incorrect = result ? result.totalQuestions - result.score : 0;
  const resultLevel = result?.percentage >= 80
    ? "high"
    : result?.percentage >= 50
      ? "medium"
      : "low";
  const resultMessage = resultLevel === "high"
    ? t.excellentWork
    : resultLevel === "medium"
      ? t.goodProgress
      : t.keepImproving;

  return (
    <LearnixLayout title={t.quizTitle} subtitle={t.quizSubtitle}>
        {view === "setup" && (
          <div className="dash-card quiz-card">
            <h3>{t.createQuiz}</h3>

            <div className="form-group">
              <label>{t.uploadLessonPdf}</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </div>

            <div className="form-group">
              <label>{t.questionCount}</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>{t.difficulty}</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="Easy">{t.difficultyEasy}</option>
                <option value="Medium">{t.difficultyMedium}</option>
                <option value="Hard">{t.difficultyHard}</option>
              </select>
            </div>

            <button className="primary-action" onClick={handleGenerate} disabled={loading}>
              {loading ? t.generating : t.generateQuiz}
            </button>
          </div>
        )}

        {view === "choice" && (
          <div className="dash-card quiz-card choice-card">
            <span className="badge">
              {t.detectedCategory}: {category}
            </span>
            {selectedTeacher ? (
              <div className="teacher-assignment-card">
                <strong>{t.assignedTeacher}</strong>
                <p>{selectedTeacher.name} / {selectedTeacher.subject} / {selectedTeacher.section}</p>
              </div>
            ) : (
              <div className="form-group teacher-assignment-card">
                <label>{t.chooseSubjectTeacher}</label>
                <select
                  value={selectedTeacherId}
                  onChange={(event) => setSelectedTeacherId(event.target.value)}
                >
                  <option value="">{t.chooseSubjectTeacher}</option>
                  {demoTeachers.map((teacher) => (
                    <option value={teacher.id} key={teacher.id}>
                      {teacher.subject} - {teacher.name} - {teacher.section}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <h2>{t.quizReady}</h2>
            <p>{t.quizReadyText}</p>
            <div className="choice-actions">
              <button onClick={startQuiz}>{t.startQuiz}</button>
              <button className="secondary-action" onClick={() => setView("summary")}>
                {t.lessonSummary}
              </button>
            </div>
          </div>
        )}

        {view === "summary" && (
          <div className="dash-card result-card">
            <div className="result-header">
              <div>
                <p>
                  {t.detectedCategory}: {category}
                </p>
                <h2>{t.summaryTitle}</h2>
              </div>
              <button className="secondary-action" onClick={() => setView("choice")}>
                {t.backToChoices}
              </button>
            </div>

            <div className="summary-grid">
              <div className="feedback-box">
                <h3>{t.lessonSummary}</h3>
                <p>{lessonSummary}</p>
              </div>

              <div className="feedback-box">
                <h3>{t.keyConcepts}</h3>
                <div className="concept-list">
                  {keyConcepts.map((concept) => (
                    <span key={concept}>{concept}</span>
                  ))}
                </div>
              </div>

              <div className="feedback-box">
                <h3>{t.importantNotes}</h3>
                <p>
                  {category} - {difficultyLabel(difficulty)}. {t.importantNoteBody}
                </p>
                {importantNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "quiz" && question && (
          <div className="dash-card quiz-card">
            <div className="quiz-topline">
              <p>
                {t.question} {currentQuestion + 1} / {exercises.length}
              </p>
              {category && (
                <span>
                  {t.detectedCategory}: {category}
                </span>
              )}
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
              onChange={(e) => handleAnswerChange(e.target.value)}
            />

            <div className="quiz-actions">
              <button
                onClick={() => setCurrentQuestion(currentQuestion - 1)}
                disabled={currentQuestion === 0}
              >
                {t.back}
              </button>

              {currentQuestion < exercises.length - 1 ? (
                <button onClick={() => setCurrentQuestion(currentQuestion + 1)}>
                  {t.next}
                </button>
              ) : (
                <button onClick={finishQuiz} disabled={savingResult}>
                  {savingResult ? t.saving : t.finishQuiz}
                </button>
              )}

              <button className="secondary-action" onClick={() => setView("choice")}>
                {t.backToChoices}
              </button>
            </div>
          </div>
        )}

        {view === "result" && result && (
          <div className={`result-layout result-${resultLevel}`}>
            {resultLevel === "high" && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 24 }).map((_, index) => (
                  <span key={index} style={{ "--i": index }} />
                ))}
              </div>
            )}

            <div className="dash-card score-card">
              <div className="percent-circle">
                <span>{Math.round(result.percentage)}%</span>
              </div>
              <h2>{resultMessage}</h2>
              <p>
                {result.score} / {result.totalQuestions}
              </p>
              <small>{result.saved ? t.resultSaved : t.saving}</small>
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
                <p>
                  {resultLevel === "high"
                    ? t.excellentWork
                    : resultLevel === "medium"
                      ? t.mediumMessage
                      : t.lowMessage}
                </p>
                <p>{result.feedback}</p>
              </div>

              <div className="quiz-actions">
                <button onClick={downloadCorrectionPdf} disabled={downloading}>
                  {downloading ? t.downloading : t.downloadPdf}
                </button>
                <button className="secondary-action" onClick={resetQuiz}>
                  {t.retakeQuiz}
                </button>
              </div>

              <div className="answer-review">
                {result.details.map((item, index) => (
                  <div
                    className={`review-item ${item.isCorrect ? "correct" : "wrong"}`}
                    key={`${item.question}-${index}`}
                  >
                    <div className="review-title">
                      <h3>
                        {t.question} {index + 1}
                      </h3>
                      <span>{item.isCorrect ? t.correct : t.incorrect}</span>
                    </div>

                    <p className="review-question">{item.question}</p>
                    <p>
                      <strong>{t.yourAnswer}:</strong>{" "}
                      {item.studentAnswer || t.noAnswer}
                    </p>
                    <p>
                      <strong>{t.correctAnswer}:</strong> {item.correctAnswer}
                    </p>
                    <p>
                      <strong>{t.aiFeedback}:</strong> {item.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {preview && view !== "result" && view !== "summary" && (
          <div className="dash-card preview-card">
            <h3>{t.lessonPreview}</h3>
            <p>{preview}</p>
          </div>
        )}
    </LearnixLayout>
  );
}

export default Exercises;
