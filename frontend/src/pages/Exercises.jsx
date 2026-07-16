import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import { AlertMessage } from "../components/ui";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";
import { apiErrorMessage, apiFetch, readApiJson } from "../services/api";
import { localizedCategory } from "../utils/localizedLabels";

function cleanQuestionText(value) {
  return String(value || "")
    .replace(/^\s*(?:question\s*)?\d+\s*[).:-]\s*/i, "")
    .trim();
}

function Exercises() {
  const location = useLocation();
  const [assessmentType, setAssessmentType] = useState(location.state?.assessmentType || "quiz");
  const [file, setFile] = useState(null);
  const [numQuestions, setNumQuestions] = useState(3);
  const [difficulty, setDifficulty] = useState("Easy");
  const [category, setCategory] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [view, setView] = useState("setup");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [message, setMessage] = useState("");
  const [assessmentModule, setAssessmentModule] = useState(null);
  const { language, t } = useLanguage();
  const user = JSON.parse(localStorage.getItem("studentUser") || "{}");
  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => String(teacher.id) === String(selectedTeacherId)) || (
      assessmentModule?.teacherId || assessmentModule?.teacherName ? {
        id: assessmentModule.teacherId || "",
        name: assessmentModule.teacherName || "",
        email: "",
        subjects: assessmentModule.moduleName || category,
        subject: assessmentModule.moduleName || category,
        availability: "available",
      } : null
    ),
    [assessmentModule, category, selectedTeacherId, teachers]
  );

  useEffect(() => {
    apiFetch("/api/student/teachers")
      .then((response) => readApiJson(response, ""))
      .then((data) => setTeachers(data.success ? data.teachers || [] : []))
      .catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    let generated = location.state?.generatedQuiz;
    if (!generated) {
      try {
        generated = JSON.parse(sessionStorage.getItem("learnixGeneratedQuiz") || "null");
      } catch {
        generated = null;
      }
    }
    if (!generated?.exercises?.length) return undefined;
    const timer = window.setTimeout(() => {
      const moduleContext = generated.moduleId || generated.moduleName || generated.teacherId || generated.teacherName ? {
        moduleId: generated.moduleId || "",
        moduleName: generated.moduleName || generated.category || "",
        teacherId: generated.teacherId || "",
        teacherName: generated.teacherName || "",
        classId: generated.classId || "",
        schoolId: generated.schoolId || "",
      } : null;
      setAssessmentModule(moduleContext);
      setCategory(moduleContext?.moduleName || generated.category || generated.sourcePrompt || "General");
      setDifficulty(generated.difficulty || "Medium");
      setAssessmentType(generated.assessmentType || location.state?.assessmentType || "quiz");
      setExercises(generated.exercises);
      setAnswers(Array(generated.exercises.length).fill(""));
      setSelectedTeacherId(moduleContext?.teacherId || "");
      setView("choice");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location.state, teachers]);
  const resetQuiz = () => {
    setMessage("");
    setView("setup");
    setResult(null);
    setExercises([]);
    setAnswers([]);
    setCurrentQuestion(0);
    setSelectedTeacherId("");
    setCategory("");
    setAssessmentModule(null);
    setQuizStartedAt(null);
  };

  const handleGenerate = async () => {
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

      if (data.success && Array.isArray(data.exercises) && data.exercises.length > 0) {
        setCategory(data.category);
        setSelectedTeacherId(teachers[0]?.id || "");
        setAssessmentModule(null);
        setExercises(data.exercises);
        setAnswers(Array(data.exercises.length).fill(""));
        setCurrentQuestion(0);
        setResult(null);
        setView("choice");
      } else {
        setMessage(data.message || t.noExercisesGenerated);
      }
    } catch (error) {
      console.error(error);
      setMessage(apiErrorMessage(error, t) || t.generationFailed);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = () => {
    const teacher = teachers.find((item) => String(item.id) === String(selectedTeacherId));

    setMessage("");
    if (!assessmentModule && category === "General" && teacher) {
      setCategory(teacher.subjects || teacher.subject || category);
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
      const teacher = selectedTeacher;
      const assignedCategory = assessmentModule?.moduleName || (category === "General" && teacher ? teacher.subject : category);

      const response = await apiFetch("/correct-quiz", {
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
          teacherId: assessmentModule?.teacherId || teacher?.id || "",
          teacherName: assessmentModule?.teacherName || teacher?.name || "",
          teacherEmail: teacher?.email || "",
          teacherSubject: assessmentModule?.moduleName || teacher?.subjects || assignedCategory,
          exercises,
          answers,
          timeSpentSeconds,
          language,
        }),
      });

      const data = await readApiJson(response, t.correctionFailed);

      if (data.success) {
        setMessage("");
        setResult(data.result);
        setQuizStartedAt(null);
        setView("result");
        localStorage.setItem("dashboardStatsRefresh", String(new Date().getTime()));
        window.dispatchEvent(new Event("quizResultUpdated"));
      } else {
        setMessage(data.message || t.correctionFailed);
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, t) || t.correctionFailed);
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

      const response = await apiFetch("/download-correction-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
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

  const question = exercises[currentQuestion];
  const displayedQuestionNumber = exercises.length
    ? Math.min(currentQuestion + 1, exercises.length)
    : 0;
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
    <LearnixLayout
      title={assessmentType === "exam" ? "Examen généré par IA" : t.quizTitle}
      subtitle={assessmentType === "exam" ? "Répondez aux questions puis soumettez votre examen pour une correction sémantique." : t.quizSubtitle}
    >
        {message && <AlertMessage tone="warning">{message}</AlertMessage>}

        {view === "setup" && (
          <div className="dash-card quiz-card">
            <h3>{t.createQuiz}</h3>

            <div className="form-group">
              <label>{t.uploadLessonPdf}</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  setFile(e.target.files[0]);
                  setMessage("");
                }}
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
              {t.detectedCategory}: {localizedCategory(category, language)}
            </span>
            {selectedTeacher ? (
              <div className="teacher-assignment-card">
                <strong>{t.assignedTeacher}</strong>
                <p>{selectedTeacher.name} / {localizedCategory(selectedTeacher.subjects || category, language)} / {selectedTeacher.availability}</p>
              </div>
            ) : (
              <div className="form-group teacher-assignment-card">
                <label>{t.chooseSubjectTeacher} ({language === "fr" ? "facultatif" : "optional"})</label>
                <select
                  value={selectedTeacherId}
                  onChange={(event) => setSelectedTeacherId(event.target.value)}
                >
                  <option value="">{language === "fr" ? "Continuer sans enseignant" : "Continue without a teacher"}</option>
                  {teachers.map((teacher) => (
                    <option value={teacher.id} key={teacher.id}>
                      {localizedCategory(teacher.subjects || category, language)} - {teacher.name} - {teacher.availability}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <h2>{assessmentType === "exam" ? "Votre examen est prêt" : t.quizReady}</h2>
            <p>{language === "fr" ? "Lancez le quiz lorsque vous êtes prêt." : "Start the quiz when you are ready."}</p>
            <div className="choice-actions">
              <button onClick={startQuiz}>{assessmentType === "exam" ? "Commencer l'examen" : t.startQuiz}</button>
            </div>
          </div>
        )}

        {view === "quiz" && question && (
          <div className="dash-card quiz-card" key={`quiz-question-${currentQuestion}`}>
            <div className="quiz-topline">
              <p>
                {t.question} {displayedQuestionNumber} / {exercises.length}
              </p>
              {category && (
                <span>
                  {t.detectedCategory}: {localizedCategory(category, language)}
                </span>
              )}
            </div>

            <div className="progress-track" aria-label={t.quizProgressLabel}>
              <div className="progress-fill" style={{ width: `${progress}%` }} key={`quiz-progress-${currentQuestion}`} />
            </div>

            <h2>{cleanQuestionText(question.question)}</h2>

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
                onClick={() => setCurrentQuestion((index) => Math.max(0, index - 1))}
                disabled={currentQuestion === 0}
              >
                {t.back}
              </button>

              {currentQuestion < exercises.length - 1 ? (
                <button onClick={() => setCurrentQuestion((index) => Math.min(exercises.length - 1, index + 1))}>
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
                <button className="restricted-download" onClick={downloadCorrectionPdf} disabled={downloading}>
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

    </LearnixLayout>
  );
}

export default Exercises;
