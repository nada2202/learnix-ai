export const ROLE_META = {
  general_admin: {
    labelKey: "adminSpace",
    descriptionKey: "adminSpaceDescription",
    loginPath: "/login",
    level: "Admin",
  },
  student: {
    labelKey: "studentSpace",
    descriptionKey: "studentSpaceDescription",
    loginPath: "/login",
    level: "Student",
  },
  teacher: {
    labelKey: "teacherSpace",
    descriptionKey: "teacherSpaceDescription",
    loginPath: "/login",
    level: "Teacher",
  },
  school_director: {
    labelKey: "directorSpace",
    descriptionKey: "directorSpaceDescription",
    loginPath: "/login",
    level: "Director",
  },
  guest_teacher: {
    labelKey: "guestTeacherSpace",
    descriptionKey: "guestTeacherSpaceDescription",
    loginPath: "/login",
    level: "Guest Teacher",
  },
  guest_student: {
    labelKey: "guestStudentSpace",
    descriptionKey: "guestStudentSpaceDescription",
    loginPath: "/login",
    level: "Guest Student",
  },
};

export const ROLE_OPTIONS = [
  { value: "student", ...ROLE_META.student },
  { value: "teacher", ...ROLE_META.teacher },
  { value: "school_director", ...ROLE_META.school_director },
  { value: "guest_teacher", ...ROLE_META.guest_teacher },
  { value: "guest_student", ...ROLE_META.guest_student },
];

export const LOGIN_ROLE_OPTIONS = [
  { value: "general_admin", ...ROLE_META.general_admin },
  { value: "school_director", ...ROLE_META.school_director },
  { value: "student", ...ROLE_META.student },
  { value: "teacher", ...ROLE_META.teacher },
  { value: "guest_teacher", ...ROLE_META.guest_teacher },
  { value: "guest_student", ...ROLE_META.guest_student },
];

const ROLE_ALIASES = {
  admin: "general_admin",
  administrator: "general_admin",
  "general admin": "general_admin",
  "admin general": "general_admin",
  director: "school_director",
  "school director": "school_director",
  directeur: "school_director",
  "directeur d'ecole": "school_director",
  "directeur d'etablissement": "school_director",
  enseignant: "teacher",
  teacher: "teacher",
  student: "student",
  eleve: "student",
  etudiant: "student",
  "guest teacher": "guest_teacher",
  "free teacher": "guest_teacher",
  "enseignant libre": "guest_teacher",
  "enseignant invite": "guest_teacher",
  "guest student": "guest_student",
  "free student": "guest_student",
  "eleve libre": "guest_student",
  "etudiant libre": "guest_student",
  "eleve invite": "guest_student",
  "etudiant invite": "guest_student",
};

export function normalizeRole(value, fallback = "student") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’`]/g, "'");

  if (Object.hasOwn(ROLE_META, normalized)) {
    return normalized;
  }

  return ROLE_ALIASES[normalized] || fallback;
}

export function roleLabel(role, t) {
  const normalized = normalizeRole(role);
  const meta = ROLE_META[normalized] || ROLE_META.student;
  return t?.[meta.labelKey] || meta.level;
}

export function roleDescription(role, t) {
  const normalized = normalizeRole(role);
  const meta = ROLE_META[normalized] || ROLE_META.student;
  return t?.[meta.descriptionKey] || "";
}

export function roleLevel(role) {
  const normalized = normalizeRole(role);
  return (ROLE_META[normalized] || ROLE_META.student).level;
}

export function roleFromLoginPath(pathname) {
  return LOGIN_ROLE_OPTIONS.find((option) => option.loginPath === pathname)?.value || "student";
}

export function dashboardPathForRole(role) {
  const normalized = normalizeRole(role);

  if (["school_director", "general_admin", "guest_teacher", "guest_student"].includes(normalized)) {
    return "/platform";
  }

  return normalized === "teacher" ? "/teacher-dashboard" : "/student-dashboard";
}

export function loginPathForRole(role) {
  const normalized = normalizeRole(role);
  return (ROLE_META[normalized] || ROLE_META.student).loginPath;
}

export function isTeacherSideRole(role) {
  return ["teacher", "school_director", "general_admin", "guest_teacher"].includes(normalizeRole(role));
}

export function getStoredUser() {
  const teacherUser = readStoredObject("teacherUser");
  const studentUser = readStoredObject("studentUser");
  return teacherUser.email ? teacherUser : studentUser;
}

export function readStoredObject(key, fallback = {}) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return fallback;
    const value = storage.getItem(key);
    if (!value || value === "undefined" || value === "null") return fallback;
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore storage cleanup failures during browser hydration.
    }
    return fallback;
  }
}

export function currentUserRole() {
  const user = getStoredUser();
  return normalizeRole(user.role || user.level);
}

export function isManagementRole(role) {
  return ["school_director", "general_admin"].includes(normalizeRole(role));
}

export function isStudentRole(role) {
  return ["student", "guest_student"].includes(normalizeRole(role));
}

export function routeAllowedForRole(pathname, role) {
  const normalized = normalizeRole(role);
  const publicRoutes = [
    "/",
    "/login",
    "/admin-login",
    "/student-login",
    "/teacher-login",
    "/director-login",
    "/guest-teacher-login",
    "/guest-student-login",
    "/register",
    "/forgot-password",
    "/guest",
  ];

  if (publicRoutes.includes(pathname) || pathname.startsWith("/shared-quiz") || pathname.startsWith("/retake-quiz")) {
    return true;
  }

  if (isManagementRole(normalized)) {
    return ["/platform", "/messages", "/settings", "/profile"].includes(pathname);
  }

  if (normalized === "teacher") {
    return ["/teacher-dashboard", "/teacher-courses", "/teacher-quizzes", "/teacher-students", "/teacher-availability", "/platform", "/messages", "/settings", "/profile"].includes(pathname);
  }

  if (normalized === "guest_teacher") {
    return ["/platform", "/messages", "/settings", "/profile"].includes(pathname);
  }

  if (normalized === "guest_student") {
    return ["/platform", "/chatbot", "/history", "/settings", "/profile"].includes(pathname);
  }

  if (normalized === "student") {
    return ["/student-dashboard", "/student-modules", "/student-courses", "/assessment", "/chatbot", "/history", "/messages", "/settings", "/profile", "/platform"].includes(pathname);
  }

  return false;
}

export function navItemsForRole(role, t) {
  const normalized = normalizeRole(role);

  if (isManagementRole(normalized)) {
    if (normalized === "general_admin") {
      return [
        { group: "MAIN", label: "Tableau de bord", path: "/platform#overview", icon: "dashboard" },
        { group: "GESTION", label: "Gestion des utilisateurs", path: "/platform#users", icon: "users" },
        { group: "GESTION", label: "Gestion des établissements", path: "/platform#assignments", icon: "buildings", highlight: false },
        { group: "GESTION", label: "Gestion des classes", path: "/platform#classes", icon: "classes", highlight: false },
        { group: "GESTION", label: "Gestion des modules", path: "/platform#modules", icon: "modules", highlight: false },
        { group: "GESTION", label: "Gestion des enseignants", path: "/platform#teachers", icon: "teachers", highlight: false },
        { group: "GESTION", label: "Gestion des élèves", path: "/platform#students", icon: "students", highlight: false },
        { group: "GESTION", label: "Gestion des affectations", path: "/platform#assignments", icon: "assignments" },
        { group: "GESTION", label: "Gestion des emplois du temps", path: "/platform#overview", icon: "schedule", highlight: false },
        { group: "ADMINISTRATION", label: "Demandes de rattachement", path: "/platform#attachmentRequests", icon: "requests", highlight: false },
        { group: "ADMINISTRATION", label: "Rapports et statistiques", path: "/platform#reports", icon: "reports" },
        { group: "ADMINISTRATION", label: "Journal d'audit", path: "/platform#audit", icon: "audit" },
        { group: "ADMINISTRATION", label: "Messagerie", path: "/messages", icon: "messages" },
        { group: "ADMINISTRATION", label: "Paramètres système", path: "/settings", icon: "settings" },
      ];
    }
    return [
      { label: t.dashboard, path: "/platform#overview", icon: "dashboard" },
      { label: t.schools, path: "/platform#schools", icon: "school" },
      { label: t.validationRequests, path: "/platform#requests", icon: "history" },
      { label: "Affectations", path: "/platform#assignments", icon: "school" },
      { label: "Affectation des étudiants", path: "/platform#studentAssignments", icon: "students" },
      { label: t.classes, path: "/platform#classes", icon: "exercises" },
      { label: t.modules, path: "/platform#modules", icon: "resources" },
      { label: t.scheduleGenerator, path: "/platform#schedule", icon: "resources" },
      { label: t.reports, path: "/platform#reports", icon: "history" },
      { label: "IA & Analytics", path: "/platform#ai", icon: "chat" },
      { label: t.messages, path: "/messages", icon: "messages" },
      { label: t.settings, path: "/settings", icon: "settings" },
    ];
  }

  if (normalized === "teacher") {
    return [
      { label: t.dashboard, path: "/teacher-dashboard", icon: "dashboard" },
      { label: t.courses, path: "/teacher-courses", icon: "resources" },
      { label: t.studentResults, path: "/teacher-students", icon: "school" },
      { label: "Emploi du temps", path: "/teacher-availability", icon: "schedule" },
      { label: t.messages, path: "/messages", icon: "messages" },
      { label: t.settings, path: "/settings", icon: "settings" },
    ];
  }

  if (normalized === "guest_teacher") {
    return [
      { label: t.teachingManagement, path: "/platform#overview", icon: "school" },
      { label: t.reports, path: "/platform#reports", icon: "history" },
      { label: t.messages, path: "/messages", icon: "messages" },
      { label: t.settings, path: "/settings", icon: "settings" },
    ];
  }

  return [
    ...(normalized === "student"
      ? [
        { label: t.dashboard, path: "/student-dashboard", icon: "dashboard" },
      ]
      : []),
    { label: t.chatbot, path: "/chatbot", icon: "chat" },
    { label: t.history, path: "/history", icon: "history" },
    ...(normalized === "student" ? [{ label: "Modules", path: "/student-modules", icon: "modules" }] : []),
    ...(normalized === "student" ? [{ label: "Cours", path: "/student-courses", icon: "resources" }] : []),
    { label: t.aiProfile, path: "/platform", icon: "school" },
    ...(normalized === "student" ? [{ label: t.messages, path: "/messages", icon: "messages" }] : []),
    { label: t.settings, path: "/settings", icon: "settings" },
  ];
}

export function panelLabelForRole(role, t) {
  const normalized = normalizeRole(role);

  if (normalized === "general_admin") {
    return t.adminPanel;
  }

  if (normalized === "school_director") {
    return t.directorPanel;
  }

  if (["teacher", "guest_teacher"].includes(normalized)) {
    return t.teacherPanel;
  }

  return t.studentPanel;
}

export function storageKeyForRole(role) {
  return isTeacherSideRole(role) ? "teacherUser" : "studentUser";
}
