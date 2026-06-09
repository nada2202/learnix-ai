import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import QuizResultModal from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { teacherForUser } from "../data/demoTeachers";
import { formatDuration } from "../utils/duration";

const copy = {
  en: {
    panel: "Teacher Panel",
    title: "Teacher Dashboard",
    subtitle: "Organize courses, assign quizzes, review results, and keep students supported with Learnix AI.",
    courses: "Courses",
    messages: "Messages",
    totalStudents: "Total students",
    assignedQuizzes: "Assigned quizzes",
    pendingCorrections: "Pending corrections",
    averageScore: "Average score",
    resources: "Course Progress / Resources",
    quizManagement: "Quiz Management",
    studentResults: "Student Results",
    analytics: "Analytics",
    createQuiz: "Create quiz",
    generateFromPdf: "Generate quiz from PDF",
    assignQuiz: "Assign quiz to students",
    assignedTo: "Assigned to",
    pdfName: "PDF name",
    saveResource: "Save resource",
    openMessages: "Open messages",
    subject: "Subject",
    section: "Grade / Section",
    difficulty: "Difficulty",
    titleLabel: "Course or quiz title",
    uploadDate: "Upload date",
    studentName: "Student name",
    email: "Email",
    score: "Score",
    date: "Date",
    duration: "Duration",
    viewDetails: "View details",
    noResults: "No student submissions yet.",
    noMessages: "No messages for this teacher yet.",
    bestScore: "Best score",
    supportNeeded: "Students needing support",
    completionStatus: "Completion status",
    completed: "completed",
    fallbackStudent: "Student",
    fallbackTeacher: "Teacher",
    search: "Search students, courses, quizzes...",
  },
  fr: {
    panel: "Espace enseignant",
    title: "Tableau de bord enseignant",
    subtitle: "Organisez les cours, attribuez les quiz, analysez les résultats et accompagnez chaque élève avec Learnix AI.",
    courses: "Cours",
    messages: "Messages",
    totalStudents: "Etudiants",
    assignedQuizzes: "Quiz assignes",
    pendingCorrections: "Corrections en attente",
    averageScore: "Score moyen",
    resources: "Progression / Ressources",
    quizManagement: "Gestion des quiz",
    studentResults: "Résultats des élèves",
    analytics: "Analyse",
    createQuiz: "Créer un quiz",
    generateFromPdf: "Générer depuis un PDF",
    assignQuiz: "Attribuer aux élèves",
    assignedTo: "Attribué à",
    pdfName: "Nom du PDF",
    saveResource: "Enregistrer la ressource",
    openMessages: "Ouvrir les messages",
    subject: "Matiere",
    section: "Classe / Section",
    difficulty: "Difficulte",
    titleLabel: "Titre du cours ou du quiz",
    uploadDate: "Date d'importation",
    studentName: "Nom",
    email: "Email",
    score: "Score",
    date: "Date",
    viewDetails: "Voir les détails",
    noResults: "Aucune soumission pour le moment.",
    noMessages: "Aucun message pour cet enseignant.",
    bestScore: "Meilleur score",
    supportNeeded: "Élèves à accompagner",
    completionStatus: "État d'avancement",
    completed: "terminé",
    fallbackStudent: "Élève",
    fallbackTeacher: "Enseignant",
    search: "Rechercher des élèves, cours ou quiz...",
    duration: "Durée",
  },
  ar: {
    panel: "لوحة المعلم",
    title: "لوحة تحكم المعلم",
    subtitle: "نظم الدروس والاختبارات والنتائج ورسائل الطلاب داخل Learnix AI.",
    courses: "الدروس",
    messages: "الرسائل",
    totalStudents: "إجمالي الطلاب",
    assignedQuizzes: "الاختبارات المعينة",
    pendingCorrections: "تصحيحات معلقة",
    averageScore: "متوسط الدرجة",
    resources: "الدروس والموارد",
    quizManagement: "إدارة الاختبارات",
    studentResults: "نتائج الطلاب",
    analytics: "التحليلات",
    createQuiz: "إنشاء اختبار",
    generateFromPdf: "إنشاء اختبار من PDF",
    assignQuiz: "تعيين الاختبار للطلاب",
    assignedTo: "معين إلى",
    pdfName: "اسم ملف PDF",
    saveResource: "حفظ المورد",
    openMessages: "فتح الرسائل",
    subject: "المادة",
    section: "الصف / القسم",
    difficulty: "الصعوبة",
    titleLabel: "عنوان الدرس أو الاختبار",
    uploadDate: "تاريخ الرفع",
    studentName: "اسم الطالب",
    email: "البريد الإلكتروني",
    score: "الدرجة",
    date: "التاريخ",
    viewDetails: "عرض التفاصيل",
    noResults: "لا توجد تسليمات طلاب حتى الآن.",
    noMessages: "لا توجد رسائل لهذا المعلم حتى الآن.",
    bestScore: "أفضل درجة",
    supportNeeded: "طلاب يحتاجون دعما",
    completionStatus: "حالة الإكمال",
    completed: "مكتمل",
    fallbackStudent: "طالب",
    fallbackTeacher: "معلم",
    search: "ابحث عن الطلاب والدروس والاختبارات...",
  },
};

const defaultResources = [
  { id: "res-algebra", title: "Linear Equations Pack", subject: "Mathematics", section: "Grade 9 / Section A", pdfName: "linear-equations.pdf", teacherEmail: "math.teacher@learnix.ai", uploadDate: "2026-05-18" },
  { id: "res-logic", title: "Programming Logic Notes", subject: "Programming", section: "Grade 9 / Section B", pdfName: "programming-logic.pdf", teacherEmail: "programming.teacher@learnix.ai", uploadDate: "2026-05-20" },
  { id: "res-motion", title: "Forces and Motion PDF", subject: "Physics", section: "Grade 10 / Section A", pdfName: "forces-motion.pdf", teacherEmail: "physics.teacher@learnix.ai", uploadDate: "2026-05-22" },
];

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value || fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function newestTimestamp(result) {
  return result.createdAt ? new Date(result.createdAt).getTime() || 0 : 0;
}

function TeacherDashboard() {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const text = copy[language] || copy.en;
  const teacher = readStorage("teacherUser", {});
  const activeTeacher = teacherForUser(teacher);
  const teacherProfile = {
    name: teacher.name || activeTeacher.name,
    email: teacher.email || activeTeacher.email,
    subject: teacher.subject || activeTeacher.subject,
    section: teacher.section || activeTeacher.section,
  };
  const [assignedResults, setAssignedResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [messages, setMessages] = useState(() => readStorage("learnixMessages", []));
  const [courseResources, setCourseResources] = useState(() =>
    readStorage("learnixCourseResources", defaultResources)
  );
  const [resourceForm, setResourceForm] = useState({
    title: "",
    subject: teacherProfile.subject,
    section: teacherProfile.section,
    pdfName: "",
  });
  const [assignForm, setAssignForm] = useState({
    title: "Weekly Learnix AI Quiz",
    subject: teacherProfile.subject,
    section: teacherProfile.section,
    difficulty: "Medium",
    assignedTo: "",
  });
  const [assignedDemoQuizzes, setAssignedDemoQuizzes] = useState(() =>
    readStorage("learnixTeacherAssignedQuizzes", [])
  );

  useEffect(() => {
    const loadAssignedResults = async () => {
      try {
        const response = await fetch("http://127.0.0.1:5000/quiz-results");
        const data = await response.json();

        if (data.success) {
          const teacherSubject = normalizeText(teacherProfile.subject);
          const teacherEmail = normalizeText(teacherProfile.email);
          const results = data.results.filter((result) => {
            const resultSubject = normalizeText(result.teacherSubject || result.category);
            const resultEmail = normalizeText(result.teacherEmail);
            return resultSubject === teacherSubject || resultEmail === teacherEmail;
          });

          setAssignedResults(results);
        }
      } catch {
        setAssignedResults([]);
      }
    };

    loadAssignedResults();
    window.addEventListener("quizResultUpdated", loadAssignedResults);
    window.addEventListener("focus", loadAssignedResults);

    return () => {
      window.removeEventListener("quizResultUpdated", loadAssignedResults);
      window.removeEventListener("focus", loadAssignedResults);
    };
  }, [teacherProfile.email, teacherProfile.subject]);

  useEffect(() => {
    const refreshMessages = () => setMessages(readStorage("learnixMessages", []));
    window.addEventListener("storage", refreshMessages);
    window.addEventListener("learnixMessagesUpdated", refreshMessages);
    return () => {
      window.removeEventListener("storage", refreshMessages);
      window.removeEventListener("learnixMessagesUpdated", refreshMessages);
    };
  }, []);

  const teacherMessages = useMemo(() => (
    messages.filter((message) => normalizeText(message.teacherEmail) === normalizeText(teacherProfile.email))
  ), [messages, teacherProfile.email]);

  const unreadMessageCount = teacherMessages.filter(
    (message) => message.recipientRole === "teacher" && !message.read
  ).length;

  const scopedAssignedQuizzes = useMemo(() => (
    assignedDemoQuizzes.filter((quiz) => (
      normalizeText(quiz.teacherEmail) === normalizeText(teacherProfile.email) ||
      (
        normalizeText(quiz.subject) === normalizeText(teacherProfile.subject) &&
        normalizeText(quiz.section) === normalizeText(teacherProfile.section)
      )
    ))
  ), [assignedDemoQuizzes, teacherProfile.email, teacherProfile.section, teacherProfile.subject]);

  const stats = useMemo(() => {
    const totalQuizzes = assignedResults.length + scopedAssignedQuizzes.length;
    const studentIds = assignedResults
      .map((result) => result.email || result.studentEmail || result.studentName)
      .filter(Boolean);
    const totalStudents = new Set(studentIds).size || Math.max(teacherMessages.length ? 1 : 0, 0);
    const averageScore = assignedResults.length
      ? Math.round(assignedResults.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / assignedResults.length)
      : 0;
    const pendingCorrections = assignedResults.filter((result) => Number(result.percentage || 0) < 60).length;
    const bestScore = assignedResults.length
      ? Math.max(...assignedResults.map((result) => Math.round(Number(result.percentage || 0))))
      : 0;
    return { totalQuizzes, totalStudents, averageScore, pendingCorrections, bestScore };
  }, [assignedResults, scopedAssignedQuizzes.length, teacherMessages.length]);

  const resources = useMemo(() => {
    return courseResources.filter((resource) => (
      normalizeText(resource.teacherEmail) === normalizeText(teacherProfile.email) ||
      (
        normalizeText(resource.subject) === normalizeText(teacherProfile.subject) &&
        normalizeText(resource.section) === normalizeText(teacherProfile.section)
      )
    ));
  }, [courseResources, teacherProfile.email, teacherProfile.section, teacherProfile.subject]);

  const studentRows = useMemo(() => (
    [...assignedResults].sort((a, b) => newestTimestamp(b) - newestTimestamp(a))
  ), [assignedResults]);

  const supportCount = assignedResults.filter((result) => Number(result.percentage || 0) < 60).length;
  const completionStatus = stats.totalQuizzes
    ? Math.round((assignedResults.length / stats.totalQuizzes) * 100)
    : 0;

  const navItems = [
    { label: t.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
    { label: text.courses, path: "/teacher-dashboard#courses", icon: "resources" },
    { label: text.quizManagement, path: "/teacher-dashboard#quizzes", icon: "exercises" },
    { label: text.studentResults, path: "/teacher-dashboard#students", icon: "history" },
    { label: text.messages, path: "/messages", icon: "messages" },
    { label: t.settings, path: "/settings", icon: "settings" },
  ];

  const displayDifficulty = (value) => ({
    Easy: t.difficultyEasy,
    Medium: t.difficultyMedium,
    Hard: t.difficultyHard,
  })[value] || value;

  const loadResult = async (quiz) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/quiz-result/${quiz.id}`);
      const data = await response.json();
      setSelectedResult(data.success ? data.result : quiz);
    } catch {
      setSelectedResult(quiz);
    }
  };

  const downloadCorrectionPdf = async () => {
    if (!selectedResult) {
      return;
    }

    const response = await fetch("http://127.0.0.1:5000/download-correction-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: selectedResult.studentName || text.fallbackStudent,
        studentEmail: selectedResult.email || selectedResult.studentEmail || "",
        category: selectedResult.category,
        difficulty: selectedResult.difficulty,
        result: selectedResult,
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

  const assignQuiz = (event) => {
    event.preventDefault();
    const nextQuiz = {
      id: `assigned-${Date.now()}`,
      ...assignForm,
      teacherEmail: teacherProfile.email,
      teacherName: teacherProfile.name,
      createdAt: new Date().toISOString(),
    };
    const updated = [nextQuiz, ...assignedDemoQuizzes];
    setAssignedDemoQuizzes(updated);
    localStorage.setItem("learnixTeacherAssignedQuizzes", JSON.stringify(updated));
  };

  const saveResource = (event) => {
    event.preventDefault();
    if (!resourceForm.title.trim()) {
      return;
    }

    const nextResource = {
      id: `resource-${Date.now()}`,
      title: resourceForm.title.trim(),
      subject: resourceForm.subject,
      section: resourceForm.section,
      pdfName: resourceForm.pdfName.trim() || `${resourceForm.title.trim().toLowerCase().replace(/\s+/g, "-")}.pdf`,
      teacherEmail: teacherProfile.email,
      teacherName: teacherProfile.name,
      uploadDate: new Date().toISOString().slice(0, 10),
    };
    const updated = [nextResource, ...courseResources];
    setCourseResources(updated);
    localStorage.setItem("learnixCourseResources", JSON.stringify(updated));
    setResourceForm({
      title: "",
      subject: teacherProfile.subject,
      section: teacherProfile.section,
      pdfName: "",
    });
  };

  const messageThreads = useMemo(() => {
    const groups = new Map();
    teacherMessages.forEach((message) => {
      const key = normalizeText(message.studentEmail);
      groups.set(key, [...(groups.get(key) || []), message]);
    });
    return [...groups.entries()].map(([studentEmail, thread]) => ({
      studentEmail,
      thread: thread.sort((a, b) => newestTimestamp(a) - newestTimestamp(b)),
    }));
  }, [teacherMessages]);

  return (
    <LearnixLayout
      className="teacher-dashboard-page"
      title={text.title}
      subtitle={text.subtitle}
      navItems={navItems}
      panelLabel={text.panel}
      profileUser={teacherProfile}
      fallbackInitial="T"
      fallbackName={text.fallbackTeacher}
      logoutPath="/teacher-login"
      hidePremiumCard
      notificationCount={unreadMessageCount}
      searchPlaceholder={text.search}
    >
      <section className="teacher-overview-grid">
        <MetricCard value={stats.totalStudents} label={text.totalStudents} />
        <MetricCard value={stats.totalQuizzes} label={text.assignedQuizzes} />
        <MetricCard value={stats.pendingCorrections} label={text.pendingCorrections} />
        <MetricCard value={`${stats.averageScore}%`} label={text.averageScore} />
      </section>

      <section className="teacher-dashboard-grid">
        <article className="dash-card teacher-card teacher-profile-panel">
          <span className="badge">{text.panel}</span>
          <div className="teacher-profile-hero">
            <div className="teacher-avatar">{teacherProfile.name.charAt(0).toUpperCase()}</div>
            <div>
              <h3>{teacherProfile.name}</h3>
              <p>{teacherProfile.subject} / {teacherProfile.section}</p>
              <small>{teacherProfile.email}</small>
            </div>
          </div>
        </article>

        <article className="dash-card teacher-card teacher-resources-panel" id="courses">
          <div className="teacher-card-head">
            <div>
              <span className="badge">{text.resources}</span>
              <h3>{text.courses}</h3>
            </div>
            <button className="primary-action" type="button" onClick={() => navigate("/exercises")}>
              {text.generateFromPdf}
            </button>
          </div>
          <form className="teacher-quiz-form" onSubmit={saveResource}>
            <label>
              <span>{text.titleLabel}</span>
              <input value={resourceForm.title} onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })} />
            </label>
            <label>
              <span>{text.subject}</span>
              <input value={resourceForm.subject} onChange={(event) => setResourceForm({ ...resourceForm, subject: event.target.value })} />
            </label>
            <label>
              <span>{text.section}</span>
              <input value={resourceForm.section} onChange={(event) => setResourceForm({ ...resourceForm, section: event.target.value })} />
            </label>
            <label>
              <span>{text.pdfName}</span>
              <input value={resourceForm.pdfName} onChange={(event) => setResourceForm({ ...resourceForm, pdfName: event.target.value })} />
            </label>
            <button className="primary-action" type="submit">{text.saveResource}</button>
          </form>
          <div className="teacher-table">
            {resources.map((resource) => (
              <div className="teacher-table-row" key={resource.id}>
                <strong>{resource.title}</strong>
                <span>{resource.subject}</span>
                <span>{resource.section}</span>
                <span>{resource.pdfName}</span>
                <span>{resource.uploadDate}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-quiz-panel" id="quizzes">
          <div className="teacher-card-head">
            <div>
              <span className="badge">{text.quizManagement}</span>
              <h3>{text.assignQuiz}</h3>
            </div>
            <button className="primary-action" type="button" onClick={() => navigate("/exercises")}>
              {text.createQuiz}
            </button>
          </div>
          <form className="teacher-quiz-form" onSubmit={assignQuiz}>
            <label>
              <span>{text.titleLabel}</span>
              <input value={assignForm.title} onChange={(event) => setAssignForm({ ...assignForm, title: event.target.value })} />
            </label>
            <label>
              <span>{text.subject}</span>
              <select value={assignForm.subject} onChange={(event) => setAssignForm({ ...assignForm, subject: event.target.value })}>
                {["Mathematics", "Programming", "Physics", "English", "French", "History"].map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.section}</span>
              <input value={assignForm.section} onChange={(event) => setAssignForm({ ...assignForm, section: event.target.value })} />
            </label>
            <label>
              <span>{text.assignedTo}</span>
              <input value={assignForm.assignedTo} onChange={(event) => setAssignForm({ ...assignForm, assignedTo: event.target.value })} />
            </label>
            <label>
              <span>{text.difficulty}</span>
              <select value={assignForm.difficulty} onChange={(event) => setAssignForm({ ...assignForm, difficulty: event.target.value })}>
                {["Easy", "Medium", "Hard"].map((difficulty) => (
                  <option key={difficulty} value={difficulty}>{displayDifficulty(difficulty)}</option>
                ))}
              </select>
            </label>
            <button className="primary-action" type="submit">{text.assignQuiz}</button>
          </form>
          <div className="teacher-chip-list">
            {scopedAssignedQuizzes.slice(0, 6).map((quiz) => (
              <span key={quiz.id}>{quiz.title} / {quiz.subject} / {displayDifficulty(quiz.difficulty)} / {quiz.assignedTo || teacherProfile.section}</span>
            ))}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-results-panel" id="students">
          <div className="teacher-card-head">
            <div>
              <span className="badge">{text.studentResults}</span>
              <h3>{text.studentResults}</h3>
            </div>
          </div>
          <div className="teacher-table teacher-results-table">
            {studentRows.map((quiz) => (
              <div className="teacher-table-row" key={quiz.id}>
                <strong>{quiz.studentName || text.fallbackStudent}</strong>
                <span>{quiz.email || quiz.studentEmail || "-"}</span>
                <span>{quiz.category || quiz.teacherSubject || teacherProfile.subject}</span>
                <span>{Math.round(Number(quiz.percentage || 0))}%</span>
                <span>{displayDifficulty(quiz.difficulty)}</span>
                <span>{formatDuration(quiz.timeSpentSeconds)}</span>
                <span>{quiz.createdAt?.slice(0, 10) || "-"}</span>
                <button type="button" onClick={() => loadResult(quiz)}>{text.viewDetails}</button>
              </div>
            ))}
            {studentRows.length === 0 && <p className="teacher-empty">{text.noResults}</p>}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-analytics-panel" id="analytics">
          <span className="badge">{text.analytics}</span>
          <div className="teacher-analytics-grid">
            <div><strong>{stats.averageScore}%</strong><span>{text.averageScore}</span></div>
            <div><strong>{stats.bestScore}%</strong><span>{text.bestScore}</span></div>
            <div><strong>{supportCount}</strong><span>{text.supportNeeded}</span></div>
            <div><strong>{completionStatus}%</strong><span>{text.completionStatus}</span></div>
          </div>
        </article>

        <article className="dash-card teacher-card teacher-messages-panel" id="messages">
          <div className="teacher-card-head">
            <div>
              <span className="badge">{unreadMessageCount} {text.messages}</span>
              <h3>{text.messages}</h3>
            </div>
            <button className="primary-action" type="button" onClick={() => navigate("/messages")}>
              {text.openMessages}
            </button>
          </div>
          <div className="teacher-message-list">
            {messageThreads.map(({ studentEmail, thread }) => (
              <div className="teacher-message-thread" key={studentEmail}>
                <strong>{thread[0]?.studentName || text.fallbackStudent}</strong>
                <small>{studentEmail}</small>
                <div className="teacher-message-bubbles">
                  {thread.slice(-2).map((message) => (
                    <p className={message.senderRole === "teacher" ? "from-teacher" : ""} key={message.id}>
                      {message.body}
                    </p>
                  ))}
                </div>
                <button type="button" onClick={() => navigate("/messages")}>{text.openMessages}</button>
              </div>
            ))}
            {messageThreads.length === 0 && <p className="teacher-empty">{text.noMessages}</p>}
          </div>
        </article>
      </section>

      <QuizResultModal
        mode="correction"
        result={selectedResult}
        t={t}
        onBack={() => setSelectedResult(null)}
        onDownload={downloadCorrectionPdf}
      />
    </LearnixLayout>
  );
}

function MetricCard({ value, label }) {
  return (
    <article className="dash-card teacher-metric-card">
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

export default TeacherDashboard;
