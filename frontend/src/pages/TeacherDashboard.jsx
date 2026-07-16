import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import Avatar from "../components/Avatar";
import QuizResultModal from "../components/QuizResultModal";
import { useLanguage } from "../context/LanguageContext";
import { formatDuration } from "../utils/duration";
import { scheduleDayLabel, scheduleSlotDateLabel, scheduleWeekStartFromSchedule } from "../utils/scheduleDates";
import { apiFetch, readApiJson } from "../services/api";

const copy = {
  en: {
    panel: "Teacher Panel",
    title: "Teacher Dashboard",
    subtitle: "Organize courses, assign quizzes, review results, and keep students supported with Learnix AI.",
    courses: "Courses",
    messages: "Messages",
    totalStudents: "Total students",
    assignedQuizzes: "Completed quizzes",
    averageScore: "Average score",
    resources: "Course Progress / Resources",
    studentResults: "Student Results",
    analytics: "Analytics",
    createQuiz: "Create quiz",
    generateFromPdf: "Generate quiz from PDF",
    assignQuiz: "Assign quiz to students",
    assignedTo: "Assigned to",
    pdfName: "PDF name",
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
    assignedQuizzes: "Quiz complétés",
    averageScore: "Score moyen",
    resources: "Progression / Ressources",
    studentResults: "Résultats des élèves",
    analytics: "Analyse",
    createQuiz: "Créer un quiz",
    generateFromPdf: "Générer depuis un PDF",
    assignQuiz: "Attribuer aux élèves",
    assignedTo: "Attribué à",
    pdfName: "Nom du PDF",
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
    averageScore: "متوسط الدرجة",
    resources: "الدروس والموارد",
    studentResults: "نتائج الطلاب",
    analytics: "التحليلات",
    createQuiz: "إنشاء اختبار",
    generateFromPdf: "إنشاء اختبار من PDF",
    assignQuiz: "تعيين الاختبار للطلاب",
    assignedTo: "معين إلى",
    pdfName: "اسم ملف PDF",
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function TeacherDashboard({ section = "overview" }) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const text = copy[language] || copy.en;
  const [teacherAccount, setTeacherAccount] = useState({
    name: "",
    email: "",
    schoolName: "",
    role: "teacher",
    level: "Teacher",
    avatar_url: "",
  });
  const teacherNavItems = [
    { label: t.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
    { label: text.courses, path: "/teacher-courses", icon: "resources" },
    { label: text.studentResults, path: "/teacher-students", icon: "school" },
    { label: "Emploi du temps", path: "/teacher-availability", icon: "schedule" },
    { label: t.messages, path: "/messages", icon: "messages" },
    { label: t.settings, path: "/settings", icon: "settings" },
  ];
  const [assignedResults, setAssignedResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [messages, setMessages] = useState(() => readStorage("learnixMessages", []));
  const [courseResources, setCourseResources] = useState([]);
  const [workspaceClasses, setWorkspaceClasses] = useState([]);
  const [workspaceModules, setWorkspaceModules] = useState([]);
  const [showPdfResourceFlow, setShowPdfResourceFlow] = useState(false);
  const [pdfResourceFile, setPdfResourceFile] = useState(null);
  const [pdfResourceForm, setPdfResourceForm] = useState({
    title: "",
    moduleId: "",
    classId: "",
    pdfName: "",
  });
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [teacherTimetableSlots, setTeacherTimetableSlots] = useState([]);
  const [teacherTimetableLoading, setTeacherTimetableLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const assignedModuleNames = useMemo(
    () => workspaceModules.map((module) => module.name).filter(Boolean).join(", "),
    [workspaceModules]
  );
  const assignedClassNames = useMemo(
    () => workspaceClasses.map((item) => item.name).filter(Boolean).join(", "),
    [workspaceClasses]
  );
  const assignedSchoolNames = useMemo(() => {
    const names = workspaceClasses.map((item) => item.schoolName).filter(Boolean);
    return [...new Set(names)].join(", ");
  }, [workspaceClasses]);
  const teacherProfile = useMemo(() => ({
    name: teacherAccount.name || "",
    email: teacherAccount.email || "",
    schoolName: teacherAccount.schoolName || assignedSchoolNames || "",
    modules: assignedModuleNames,
    classes: assignedClassNames,
    role: teacherAccount.role || "teacher",
    level: teacherAccount.level || "Teacher",
    avatar_url: teacherAccount.avatar_url || teacherAccount.avatarUrl || "",
  }), [assignedClassNames, assignedModuleNames, assignedSchoolNames, teacherAccount]);

  const loadTeacherProfile = useCallback(async () => {
    const response = await apiFetch("/api/me");
    const data = await readApiJson(response, t.serverError);
    if (data.success && data.user) {
      setTeacherAccount({
        name: data.user.name || "",
        email: data.user.email || "",
        schoolName: data.user.schoolName || "",
        role: data.user.role || "teacher",
        level: data.user.level || "Teacher",
        avatar_url: data.user.avatar_url || data.user.avatarUrl || "",
      });
      return;
    }
    setStatusMessage(data.message || t.serverError);
  }, [t.serverError]);

  const loadTeacherWorkspace = useCallback(async () => {
    const response = await apiFetch("/api/teacher/workspace");
    const data = await readApiJson(response, t.serverError);
    if (!data.success) {
      setStatusMessage(data.message || t.serverError);
      return;
    }
    const classes = data.classes || [];
    const modules = data.modules || [];
    setWorkspaceClasses(classes);
    setWorkspaceModules(modules);
    setCourseResources(data.courses || []);
    setAssignedStudents(data.students || []);
    setPdfResourceForm((current) => ({
      ...current,
      classId: current.classId || (classes[0]?.id ? String(classes[0].id) : ""),
      moduleId: current.moduleId || (modules[0]?.id ? String(modules[0].id) : ""),
    }));
  }, [t.serverError]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadTeacherWorkspace().catch(() => {}), 0);
    return () => window.clearTimeout(timer);
  }, [loadTeacherWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadTeacherProfile().catch(() => {}), 0);
    return () => window.clearTimeout(timer);
  }, [loadTeacherProfile]);

  const loadTeacherTimetable = useCallback(async () => {
    setTeacherTimetableLoading(true);
    try {
      const response = await apiFetch("/api/schedules");
      const data = await readApiJson(response, t.serverError);
      if (!data.success) {
        setStatusMessage(data.message || t.serverError);
        setTeacherTimetableSlots([]);
        return;
      }
      const slots = (Array.isArray(data.schedules) ? data.schedules : []).flatMap((schedule) => (
        (Array.isArray(schedule.entries) ? schedule.entries : []).map((entry) => ({
          ...entry,
          className: entry.className || schedule.className || "",
          schoolName: entry.schoolName || schedule.schoolName || "",
          weekStartDate: scheduleWeekStartFromSchedule(schedule),
        }))
      ));
      slots.sort((a, b) => (
        Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0)
        || String(a.startTime || "").localeCompare(String(b.startTime || ""))
        || String(a.className || "").localeCompare(String(b.className || ""))
      ));
      setTeacherTimetableSlots(slots);
    } catch {
      setTeacherTimetableSlots([]);
      setStatusMessage(t.serverError);
    } finally {
      setTeacherTimetableLoading(false);
    }
  }, [t.serverError]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadTeacherTimetable().catch(() => {}), 0);
    return () => window.clearTimeout(timer);
  }, [loadTeacherTimetable]);

  useEffect(() => {
    const loadAssignedResults = async () => {
      try {
        const response = await apiFetch("/quiz-results");
        const data = await readApiJson(response, t.serverError);

        if (data.success) {
          const teacherEmail = normalizeText(teacherProfile.email);
          const moduleNames = workspaceModules.map((module) => normalizeText(module.name)).filter(Boolean);
          const results = data.results.filter((result) => {
            const resultSubject = normalizeText(result.teacherSubject || result.category);
            const resultEmail = normalizeText(result.teacherEmail);
            return (teacherEmail && resultEmail === teacherEmail) || (resultSubject && moduleNames.includes(resultSubject));
          });

          setAssignedResults(results);
        } else {
          setStatusMessage(data.message || t.serverError);
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
  }, [t.serverError, teacherProfile.email, workspaceModules]);

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

  const stats = useMemo(() => {
    const totalQuizzes = assignedResults.length;
    const studentIds = assignedResults
      .map((result) => result.email || result.studentEmail || result.studentName)
      .filter(Boolean);
    const totalStudents = new Set(studentIds).size || Math.max(teacherMessages.length ? 1 : 0, 0);
    const averageScore = assignedResults.length
      ? Math.round(assignedResults.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / assignedResults.length)
      : 0;
    const bestScore = assignedResults.length
      ? Math.max(...assignedResults.map((result) => Math.round(Number(result.percentage || 0))))
      : 0;
    return { totalQuizzes, totalStudents, averageScore, bestScore };
  }, [assignedResults, teacherMessages.length]);

  const resources = courseResources;

  const studentRows = useMemo(() => (
    [...assignedResults].sort((a, b) => newestTimestamp(b) - newestTimestamp(a))
  ), [assignedResults]);

  const supportCount = assignedResults.filter((result) => Number(result.percentage || 0) < 60).length;
  const completionStatus = stats.totalQuizzes
    ? Math.round((assignedResults.length / stats.totalQuizzes) * 100)
    : 0;

  const displayDifficulty = (value) => ({
    Easy: t.difficultyEasy,
    Medium: t.difficultyMedium,
    Hard: t.difficultyHard,
  })[value] || value;

  const displayCourseDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
  };

  const loadResult = async (quiz) => {
    try {
      const response = await apiFetch(`/quiz-result/${quiz.id}`);
      const data = await readApiJson(response, t.serverError);
      setSelectedResult(data.success ? data.result : quiz);
      if (!data.success) setStatusMessage(data.message || t.serverError);
    } catch {
      setSelectedResult(quiz);
    }
  };

  const downloadCorrectionPdf = async () => {
    if (!selectedResult) {
      return;
    }

    const response = await apiFetch("/download-correction-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        studentName: selectedResult.studentName || text.fallbackStudent,
        studentEmail: selectedResult.email || selectedResult.studentEmail || "",
        category: selectedResult.category,
        difficulty: selectedResult.difficulty,
        result: selectedResult,
      }),
    });

    if (!response.ok) {
      const data = await readApiJson(response, t.pdfFailed);
      setStatusMessage(data.message || t.pdfFailed);
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

  const savePdfResource = async (event) => {
    event.preventDefault();
    if (!pdfResourceFile) {
      setStatusMessage("Veuillez choisir un fichier PDF.");
      return;
    }
    if (!pdfResourceForm.moduleId || !pdfResourceForm.classId) {
      setStatusMessage("Veuillez choisir une matiere et une classe assignees.");
      return;
    }
    const title = pdfResourceForm.title.trim() || pdfResourceFile.name.replace(/\.pdf$/i, "");
    const payload = {
      title,
      moduleId: pdfResourceForm.moduleId,
      classId: pdfResourceForm.classId,
      pdfName: pdfResourceForm.pdfName.trim() || pdfResourceFile.name,
      content: await readFileAsDataUrl(pdfResourceFile),
    };
    const response = await apiFetch("/api/teacher/courses", { method: "POST", body: JSON.stringify(payload) });
    const data = await readApiJson(response, t.serverError);
    if (!data.success) {
      setStatusMessage(data.message || t.serverError);
      return;
    }
    await loadTeacherWorkspace();
    setPdfResourceFile(null);
    setPdfResourceForm({
      title: "",
      moduleId: workspaceModules[0]?.id ? String(workspaceModules[0].id) : "",
      classId: workspaceClasses[0]?.id ? String(workspaceClasses[0].id) : "",
      pdfName: "",
    });
    setShowPdfResourceFlow(false);
  };

  const updateCourse = async (course) => {
    const title = window.prompt(text.titleLabel, course.title); if (!title) return;
    const response = await apiFetch(`/api/teacher/courses/${course.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    const data = await readApiJson(response, t.serverError);
    if (data.success) await loadTeacherWorkspace();
    else setStatusMessage(data.message || t.serverError);
  };
  const deleteCourse = async (course) => {
    if (!window.confirm(`${course.title} ?`)) return;
    const response = await apiFetch(`/api/teacher/courses/${course.id}`, { method: "DELETE" });
    const data = await readApiJson(response, t.serverError);
    if (data.success) await loadTeacherWorkspace();
    else setStatusMessage(data.message || t.serverError);
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

  const pageTitles = {
    overview: [text.title, text.subtitle],
    courses: [text.courses, text.resources],
    students: [text.studentResults, "Suivez les élèves affectés et consultez leurs corrections."],
    availability: ["Emploi du temps", "Consultez vos créneaux enregistrés par la direction."],
  };
  const [pageTitle, pageSubtitle] = pageTitles[section] || pageTitles.overview;

  return (
    <LearnixLayout
      className={`teacher-dashboard-page teacher-section-${section}`}
      title={pageTitle}
      subtitle={pageSubtitle}
      panelLabel={text.panel}
      profileUser={teacherProfile}
      navItems={teacherNavItems}
      fallbackInitial="T"
      fallbackName={text.fallbackTeacher}
      hidePremiumCard
      notificationCount={unreadMessageCount}
      searchPlaceholder={text.search}
    >
      {statusMessage && <div className="toast-notification warning-toast">{statusMessage}</div>}
      <section className="teacher-overview-grid reference-mini-stats">
        <MetricCard value={stats.totalStudents} label={text.totalStudents} tone="blue" icon="graduation" />
        <MetricCard value={stats.totalQuizzes} label={text.assignedQuizzes} tone="green" icon="bookCheck" />
        <MetricCard value={`${stats.averageScore}%`} label={text.averageScore} tone="purple" icon="barChart" />
      </section>
      <section className="teacher-dashboard-grid">
        <article className="dash-card teacher-card teacher-profile-panel">
          <span className="badge">{text.panel}</span>
          <div className="teacher-profile-hero">
            <Avatar user={teacherProfile} name={teacherProfile.name || teacherProfile.email} size={70} clickable className="teacher-avatar" />
            <div>
              <h3>{teacherProfile.name || "Enseignant"}</h3>
              <p>{teacherProfile.modules || "Aucun module assigné"}</p>
              <p>{teacherProfile.classes || "Aucune classe assignée"}</p>
              <small>{teacherProfile.schoolName || "Aucun établissement assigné"}</small>
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
            <button className="primary-action" type="button" onClick={() => setShowPdfResourceFlow((value) => !value)}>
              {text.generateFromPdf}
            </button>
          </div>
          {showPdfResourceFlow && (
            <form className="teacher-quiz-form teacher-pdf-resource-flow" onSubmit={savePdfResource}>
              <label>
                <span>Titre du cours</span>
                <input required value={pdfResourceForm.title} placeholder="Titre du cours" onChange={(event) => setPdfResourceForm({ ...pdfResourceForm, title: event.target.value })} />
              </label>
              <label>
                <span>{text.subject}</span>
                <select required value={pdfResourceForm.moduleId} onChange={(event) => setPdfResourceForm({ ...pdfResourceForm, moduleId: event.target.value })}>
                  <option value="" disabled>{workspaceModules.length ? "Choisir une matiere" : "Aucun module assigne"}</option>
                  {workspaceModules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                </select>
              </label>
              <label>
                <span>{text.section}</span>
                <select required value={pdfResourceForm.classId} onChange={(event) => setPdfResourceForm({ ...pdfResourceForm, classId: event.target.value })}>
                  <option value="" disabled>{workspaceClasses.length ? "Choisir une classe" : "Aucune classe assignee"}</option>
                  {workspaceClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                <span>{text.pdfName}</span>
                <input value={pdfResourceForm.pdfName} placeholder={pdfResourceFile?.name || "Nom du fichier PDF"} onChange={(event) => setPdfResourceForm({ ...pdfResourceForm, pdfName: event.target.value })} />
              </label>
              <label className="teacher-pdf-file-field">
                <span>Fichier PDF</span>
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => setPdfResourceFile(event.target.files?.[0] || null)} />
                <small>{pdfResourceFile?.name || "Aucun fichier selectionne"}</small>
              </label>
              <div className="teacher-pdf-flow-actions">
                <button className="secondary-action" type="button" onClick={() => { setShowPdfResourceFlow(false); setPdfResourceFile(null); }}>
                  Annuler
                </button>
                <button className="primary-action" type="submit">
                  Générer et publier le cours
                </button>
              </div>
            </form>
          )}
          <div className="teacher-data-table-wrap teacher-courses-table-wrap">
            <table className="teacher-data-table teacher-courses-data-table">
              <thead>
                <tr><th>Cours</th><th>Module</th><th>Classe</th><th>Date</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {resources.map((resource) => (
                  <tr key={resource.id}>
                    <td><strong>{resource.title}</strong></td>
                    <td>{resource.subject || "-"}</td>
                    <td>{resource.section || "-"}</td>
                    <td>{displayCourseDate(resource.createdAt || resource.uploadDate)}</td>
                    <td><span className="teacher-row-actions"><button type="button" onClick={() => updateCourse(resource)}>Modifier</button><button type="button" onClick={() => deleteCourse(resource)}>Supprimer</button></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!resources.length && <p className="teacher-empty">Aucun cours publié.</p>}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-students-panel">
          <div className="teacher-card-head"><div><span className="badge">Classes affectées</span><h3>Mes élèves</h3></div></div>
          <div className="teacher-data-table-wrap">
            <table className="teacher-data-table teacher-students-table">
              <thead>
                <tr><th>Étudiant</th><th>Email</th><th>Classe</th><th>Action</th></tr>
              </thead>
              <tbody>
                {assignedStudents.map((student) => (
                  <tr key={student.id}>
                    <td><strong>{student.name}</strong></td>
                    <td>{student.email || "-"}</td>
                    <td>{student.className || "-"}</td>
                    <td><button type="button" onClick={() => navigate("/messages")}>Contacter</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!assignedStudents.length && <p className="teacher-empty">Aucun élève affecté.</p>}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-availability-panel teacher-schedule-panel">
          <div className="teacher-card-head"><div><span className="badge">Emploi du temps</span><h3>Mes créneaux enregistrés</h3></div><button className="primary-action teacher-schedule-contact" type="button" onClick={() => navigate("/messages")}>Contacter la direction</button></div>
          <p className="teacher-schedule-note">Pour toute demande de modification de votre emploi du temps, veuillez contacter la direction via la messagerie.</p>
          {teacherTimetableLoading ? <p className="teacher-empty">Chargement de l'emploi du temps...</p> : teacherTimetableSlots.length ? <div className="teacher-schedule-list" aria-label="Emploi du temps enseignant">{teacherTimetableSlots.map((slot, index) => <article className="teacher-schedule-slot" key={`${slot.scheduleId || "schedule"}-${slot.id || index}`}><div className="teacher-schedule-day"><strong>{scheduleDayLabel(slot.dayOfWeek, slot.weekStartDate)}</strong><small>{scheduleSlotDateLabel(slot.dayOfWeek, slot.weekStartDate)}</small><span>{String(slot.startTime || "").slice(0, 5)} - {String(slot.endTime || "").slice(0, 5)}</span></div><div className="teacher-schedule-main"><strong>{slot.moduleName || `Module ${slot.moduleId || ""}`}</strong><span>{slot.className || "Classe non renseignée"}</span></div><div className="teacher-schedule-meta"><span>{slot.schoolName || "Établissement non renseigné"}</span><b>Salle : {slot.roomName || slot.room || "Salle non définie"}</b></div></article>)}</div> : <p className="teacher-empty">Aucun emploi du temps enregistré pour le moment.</p>}
        </article>

        <article className="dash-card teacher-card teacher-results-panel" id="students">
          <div className="teacher-card-head">
            <div>
              <span className="badge">{text.studentResults}</span>
              <h3>{text.studentResults}</h3>
            </div>
          </div>
          <div className="teacher-data-table-wrap">
            <table className="teacher-data-table teacher-results-data-table">
              <thead>
                <tr><th>Étudiant</th><th>Module</th><th>Score</th><th>Difficulté</th><th>Durée</th><th>Date</th></tr>
              </thead>
              <tbody>
                {studentRows.map((quiz) => (
                  <tr key={quiz.id}>
                    <td><strong>{quiz.studentName || text.fallbackStudent}</strong><small>{quiz.email || quiz.studentEmail || "-"}</small></td>
                    <td>{quiz.category || quiz.teacherSubject || "-"}</td>
                    <td><span className="teacher-score-pill">{Math.round(Number(quiz.percentage || 0))}%</span></td>
                    <td>{displayDifficulty(quiz.difficulty)}</td>
                    <td>{formatDuration(quiz.timeSpentSeconds)}</td>
                    <td>{quiz.createdAt?.slice(0, 10) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {studentRows.length === 0 && <p className="teacher-empty">{text.noResults}</p>}
          </div>
        </article>

        <article className="dash-card teacher-card teacher-analytics-panel" id="analytics">
          <span className="badge">{text.analytics}</span>
          <div className="teacher-analytics-grid">
            <AnalyticsMetric value={`${stats.averageScore}%`} label={text.averageScore} tone="purple" icon="barChart" />
            <AnalyticsMetric value={`${stats.bestScore}%`} label={text.bestScore} tone="gold" icon="trophy" />
            <AnalyticsMetric value={supportCount} label={text.supportNeeded} tone="cyan" icon="usersPlus" />
            <AnalyticsMetric value={`${completionStatus}%`} label={text.completionStatus} tone="indigo" icon="activity" />
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

function MetricCard({ value, label, tone = "blue", icon = "quiz" }) {
  return (
    <article className={`dash-card teacher-metric-card teacher-metric-${tone}`}>
      <span className="teacher-metric-icon" aria-hidden="true"><TeacherMetricIcon type={icon} /></span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}

function AnalyticsMetric({ value, label, tone = "blue", icon = "barChart" }) {
  return (
    <div className={`teacher-analytics-item teacher-metric-${tone}`}>
      <span className="teacher-metric-icon teacher-analytics-icon" aria-hidden="true"><TeacherMetricIcon type={icon} /></span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TeacherMetricIcon({ type }) {
  const icons = {
    graduation: <><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /><path d="M22 10v6" /></>,
    bookCheck: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" /><path d="m9 11 2 2 4-4" /></>,
    clockCheck: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="m8.5 15.5 1.5 1.5 3-3" /></>,
    barChart: <><path d="M3 3v18h18" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-3" /></>,
    trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M5 5H3v3a4 4 0 0 0 4 4" /><path d="M19 5h2v3a4 4 0 0 1-4 4" /></>,
    usersPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {icons[type] || icons.bookCheck}
    </svg>
  );
}

export default TeacherDashboard;
