import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import Avatar from "../components/Avatar";
import { AlertMessage, Badge, Button, Card, LoadingSpinner, ProgressBar, StatCard, Tabs } from "../components/ui";
import { useLanguage } from "../context/LanguageContext";
import { apiFetch, apiUrl } from "../services/api";
import { getStoredUser, normalizeRole } from "../services/roles";
import { addScheduleDays, formatScheduleWeekRange, getScheduleWeekStartForDate, scheduleDayLabel, scheduleSlotDateLabel, scheduleWeekDays as buildScheduleWeekDays, scheduleWeekStartFromSchedule, scheduleWeekStartIso } from "../utils/scheduleDates";
import { scoreToneClass, scoreTone } from "../utils/scoreTone";
import "../admin-dashboard.css";

const REPORTS_REFERENCE_TIME = Date.now();

const emptySchool = {
  name: "",
  schoolType: "",
  address: "",
  city: "",
  country: "Morocco",
  phone: "",
  officialEmail: "",
  logoUrl: "",
  directorName: "",
  directorEmail: "",
  legalDocuments: "",
};

function ChipMultiSelect({ label, options, values, onChange, placeholder = "Selectionner..." }) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => values.map(String).includes(String(option.id)));

  const toggleValue = (id) => {
    const stringId = String(id);
    onChange(values.map(String).includes(stringId)
      ? values.filter((value) => String(value) !== stringId)
      : [...values, id]);
  };

  return (
    <label className="reference-chip-field">
      <span>{label}</span>
      <div className={`reference-chip-select ${open ? "open" : ""}`}>
        <button type="button" className="reference-chip-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          <span className="reference-chip-values">
            {selected.map((option) => (
              <span className="reference-chip" key={option.id}>
                {option.name}
                <i role="button" tabIndex="0" aria-label={`Retirer ${option.name}`} onClick={(event) => { event.stopPropagation(); toggleValue(option.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleValue(option.id); }}>x</i>
              </span>
            ))}
            {!selected.length && <em>{placeholder}</em>}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </button>
        {open && (
          <div className="reference-chip-menu">
            {options.map((option) => (
              <button type="button" key={option.id} onClick={() => toggleValue(option.id)}>
                <span className={values.map(String).includes(String(option.id)) ? "checked" : ""}>{values.map(String).includes(String(option.id)) ? "✓" : ""}</span>
                {option.name}
              </button>
            ))}
            {!options.length && <small>Aucune option disponible.</small>}
          </div>
        )}
      </div>
    </label>
  );
}

function formatAdminDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function auditUserLabel(entry) {
  return entry.userName || entry.username || entry.user || entry.actorName || entry.actor || entry.email || "Learnix Admin";
}

function auditUserInitials(name) {
  const parts = String(name || "Utilisateur")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : String(parts[0] || "U").slice(0, 2);
  return initials.toUpperCase();
}

function auditEntityLabel(entry) {
  const raw = entry.entity || entry.entityName || entry.entityType || entry.resource || entry.target || entry.action || entry.event || "Plateforme";
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("attachment") || normalized.includes("rattachement")) return "Demande de rattachement";
  if (normalized.includes("school") || normalized.includes("établissement") || normalized.includes("etablissement")) return "Établissement";
  if (normalized.includes("class") || normalized.includes("classe")) return "Classe";
  if (normalized.includes("module")) return "Module";
  if (normalized.includes("teacher") || normalized.includes("enseignant")) return "Enseignant";
  if (normalized.includes("student") || normalized.includes("élève") || normalized.includes("eleve")) return "Élève";
  if (normalized.includes("user") || normalized.includes("utilisateur")) return "Utilisateur";
  if (normalized.includes("report") || normalized.includes("rapport")) return "Rapport";
  return String(raw).replaceAll("_", " ");
}

function auditDescriptionLabel(entry) {
  const raw = entry.description || entry.details || entry.message || entry.action || "";
  const normalized = String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const exactLabels = {
    managed_user_created: "Utilisateur créé",
    managed_school_created: "Établissement créé",
    managed_module_created: "Module créé",
    managed_teacher_assigned: "Enseignant affecté",
  };
  if (exactLabels[normalized]) return exactLabels[normalized];
  if (normalized.includes("user") && normalized.includes("created")) return "Utilisateur créé";
  if (normalized.includes("school") && normalized.includes("created")) return "Établissement créé";
  if (normalized.includes("module") && normalized.includes("created")) return "Module créé";
  if (normalized.includes("teacher") && (normalized.includes("assigned") || normalized.includes("affect"))) return "Enseignant affecté";
  return raw ? String(raw).replaceAll("_", " ") : "Opération enregistrée";
}

function auditIpLabel(entry) {
  return entry.ip || entry.ipAddress || entry.ip_address || entry.remoteAddress || "N/A";
}

function auditActionLabel(entry) {
  const raw = entry.action || entry.event || entry.type || "Action";
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("login") || normalized.includes("connexion")) return normalized.includes("fail") || normalized.includes("échec") || normalized.includes("echec") ? "Échec de connexion" : "Connexion";
  if (normalized.includes("create") || normalized.includes("création") || normalized.includes("creation") || normalized.includes("created")) return "Création";
  if (normalized.includes("update") || normalized.includes("modify") || normalized.includes("modification") || normalized.includes("modified")) return "Modification";
  if (normalized.includes("delete") || normalized.includes("suppression") || normalized.includes("remove")) return "Suppression";
  if (normalized.includes("assign") || normalized.includes("affect")) return "Affectation";
  if (normalized.includes("approve") || normalized.includes("validate") || normalized.includes("validation")) return "Validation";
  if (normalized.includes("reject") || normalized.includes("refus")) return "Refus";
  return String(raw).replaceAll("_", " ");
}

function auditStatusMeta(entry) {
  const normalized = String(entry.status || entry.result || entry.level || "success").toLowerCase();
  if (["failed", "fail", "error", "echec", "échec", "danger"].includes(normalized)) return { label: "Échec", tone: "failed" };
  if (["pending", "waiting", "en attente"].includes(normalized)) return { label: "En attente", tone: "warning" };
  if (["open", "opened", "ouvert"].includes(normalized)) return { label: "Ouvert", tone: "info" };
  if (["closed", "close", "fermé", "ferme"].includes(normalized)) return { label: "Fermé", tone: "success" };
  if (["active", "actif"].includes(normalized)) return { label: "Actif", tone: "success" };
  if (["inactive", "inactif", "disabled"].includes(normalized)) return { label: "Inactif", tone: "failed" };
  if (["warning", "warn", "attention"].includes(normalized)) return { label: "Avertissement", tone: "warning" };
  if (["info", "information"].includes(normalized)) return { label: "Info", tone: "info" };
  return { label: "Succès", tone: "success" };
}

function userDisplayName(user) {
  return user.name || user.fullName || user.username || user.email || "Utilisateur";
}

function userInitial(user) {
  return userDisplayName(user).trim().charAt(0).toUpperCase() || "U";
}

function userStatusMeta(user) {
  const normalized = String(user.status || "").toLowerCase();
  const inactive = ["inactive", "inactif", "disabled", "blocked", "suspended"].includes(normalized);
  return inactive ? { label: "Inactif", tone: "inactive" } : { label: "Actif", tone: "active" };
}

function userRoleLabel(user) {
  const normalized = normalizeRole(user.role || user.level || user.accessLevel || user.access_level, "");
  const labels = {
    student: "Étudiant",
    guest_student: "Étudiant",
    teacher: "Enseignant",
    guest_teacher: "Enseignant",
    school_director: "Directeur",
    general_admin: "Administrateur",
  };
  return labels[normalized] || "Utilisateur";
}

function userAccessLabel(user) {
  const raw = user.accessLevel || user.access_level || user.level || user.role || "";
  const normalized = normalizeRole(raw, "");
  const labels = {
    student: "Étudiant",
    guest_student: "Étudiant",
    teacher: "Enseignant",
    guest_teacher: "Enseignant",
    school_director: "Directeur",
    general_admin: "Administrateur",
  };
  return labels[normalized] || (raw ? String(raw).replaceAll("_", " ") : "Standard");
}

function userCreatedLabel(user) {
  const value = user.createdAt || user.created_at || user.createdOn || user.created_on;
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function translateAiProfileText(value) {
  const raw = String(value || "").trim();
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const labels = {
    "review recent corrections before generating a new quiz": "Consultez les corrections récentes avant de générer un nouveau quiz.",
    "increase difficulty only after two strong attempts in the same module": "Augmentez le niveau de difficulté uniquement après deux bonnes tentatives consécutives dans le même module.",
    beginner: "Débutant",
    intermediate: "Intermédiaire",
    advanced: "Avancé",
    general: "Général",
    "pending data": "Données en attente",
    "no data": "Aucune donnée",
  };
  if (labels[normalized]) return labels[normalized];
  return raw
    .replace(/Review recent corrections before generating a new quiz/gi, "Consultez les corrections récentes avant de générer un nouveau quiz.")
    .replace(/Increase difficulty only after two strong attempts in the same module/gi, "Augmentez le niveau de difficulté uniquement après deux bonnes tentatives consécutives dans le même module.")
    .replace(/\bBeginner\b/gi, "Débutant")
    .replace(/\bIntermediate\b/gi, "Intermédiaire")
    .replace(/\bAdvanced\b/gi, "Avancé")
    .replace(/\bGeneral\b/gi, "Général");
}

function teacherSchoolLabel(teacher) {
  return teacher.schoolName || teacher.establishmentName || teacher.school || teacher.establishment || "Non renseigné";
}

function teacherCodeLabel(teacher) {
  return teacher.code || teacher.teacherCode || teacher.reference || teacher.matricule || teacher.id || "Non renseigné";
}

function teacherModuleCount(teacher) {
  if (Array.isArray(teacher.modules)) return teacher.modules.length;
  if (Array.isArray(teacher.assignedModules)) return teacher.assignedModules.length;
  return Number(teacher.moduleCount || teacher.modulesCount || teacher.assignedModuleCount || 0);
}

function studentSchoolLabel(student) {
  return student.schoolName || student.establishmentName || student.school || student.establishment || "Non renseigné";
}

function studentClassLabel(student) {
  return student.className || student.class || student.levelName || student.level || "Non renseigné";
}

function studentCodeLabel(student) {
  return student.code || student.studentCode || student.reference || student.matricule || student.id || "Non renseigné";
}

function listFromValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,;/]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function schoolDisplayName(school) {
  return school.name || school.schoolName || "Établissement";
}

function schoolLocationLabel(school) {
  return [school.city, school.country].filter(Boolean).join(" / ") || "Non renseigné";
}

function schoolTypeLabel(school) {
  const rawType = school.schoolType || school.type || "";
  if (rawType === "Priv?e") return "Privée";
  if (rawType === "Ecole Privé") return "École Privée";
  return rawType || "Non renseigné";
}

function schoolDirectorLabel(school) {
  return school.directorName || school.director?.name || school.director || "Non assigné";
}

function schoolCodeLabel(school) {
  return school.code || school.reference || school.slug || (school.id ? `ID-${school.id}` : "");
}

function schoolEmailLabel(school) {
  return school.officialEmail || school.email || school.directorEmail || "Non renseigné";
}

function schoolStatusMeta(school) {
  const normalized = String(school.status || "").toLowerCase();
  if (["approved", "approuvé", "approuve", "active"].includes(normalized)) return { label: "Approuvé", tone: "approved" };
  if (["rejected", "refusé", "refuse", "refused"].includes(normalized)) return { label: "Refusé", tone: "rejected" };
  return { label: "En attente", tone: "pending" };
}

function schoolCreatedLabel(school) {
  const value = school.createdAt || school.created_at || school.createdOn || school.created_on;
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function schoolLegalDocuments(school) {
  const raw = school.legalDocuments ?? school.legal_documents_json ?? school.legalDocumentsJson;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    return raw.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function schoolDocumentLabel(document, index) {
  if (typeof document === "string") return document;
  return document?.name || document?.label || document?.title || `Document ${index + 1}`;
}

function schoolDocumentUrl(document) {
  const rawUrl = typeof document === "string" ? document : document?.url || document?.href || "";
  if (!rawUrl) return "";
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : apiUrl(rawUrl);
}

function schoolDocumentFetchPath(document) {
  return typeof document === "string" ? document : document?.url || document?.href || "";
}

function isProtectedSchoolDocument(document) {
  return schoolDocumentFetchPath(document).includes("/api/school-documents/");
}

function schoolLogoValue(school) {
  const logoUrl = typeof school === "string" ? school : school?.logoUrl || school?.logo_url || "";
  const trimmed = String(logoUrl || "").trim();
  if (!trimmed || /School_icon\.svg/i.test(trimmed)) return "";
  return trimmed;
}

function schoolLogoSrc(school) {
  const logoUrl = schoolLogoValue(school);
  if (!logoUrl) return "";
  if (logoUrl.startsWith("/school-logos/")) return logoUrl;
  return /^https?:\/\//i.test(logoUrl) ? logoUrl : apiUrl(logoUrl);
}

async function readSchoolApiResponse(response, fallbackMessage) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!response.ok || data.success === false) {
    const detail = data.message || text || response.statusText || fallbackMessage;
    throw new Error(`${fallbackMessage} (${response.status || "network"}): ${detail}`);
  }
  return data;
}

function splitSchoolLegalDocuments(school) {
  const documents = schoolLegalDocuments(school);
  return {
    uploadedDocuments: documents.filter((document) => typeof document !== "string"),
    complementaryLinks: documents.filter((document) => typeof document === "string"),
  };
}

function schoolToForm(school) {
  const { complementaryLinks } = splitSchoolLegalDocuments(school);
  return {
    ...emptySchool,
    name: school.name || "",
    schoolType: schoolTypeLabel({ schoolType: school.schoolType || school.school_type || "" }) === "Non renseigné" ? "" : schoolTypeLabel({ schoolType: school.schoolType || school.school_type || "" }),
    address: school.address || "",
    city: school.city || "",
    country: school.country || "Morocco",
    phone: school.phone || "",
    officialEmail: school.officialEmail || school.official_email || "",
    logoUrl: school.logoUrl || school.logo_url || "",
    directorName: school.directorName || school.director_name || school.director?.name || "",
    directorEmail: school.directorEmail || school.director_email || school.director?.email || "",
    legalDocuments: complementaryLinks.join("\n"),
  };
}

function attachmentRequestStatusMeta(item) {
  const normalized = String(item.status || "pending").toLowerCase();
  if (["approved", "approuvé", "approuve", "accepted", "active"].includes(normalized)) return { label: "Approuvée", tone: "approved" };
  if (["rejected", "refusé", "refuse", "refused", "declined"].includes(normalized)) return { label: "Refusée", tone: "rejected" };
  return { label: "En attente", tone: "pending" };
}

function classStatusMeta(item) {
  const normalized = String(item.status || "").toLowerCase();
  const inactive = ["inactive", "inactif", "archived", "archivé", "archive", "disabled"].includes(normalized);
  return inactive ? { label: "Inactif", tone: "inactive" } : { label: "Actif", tone: "active" };
}

function classStudentCount(item) {
  return Number(item.studentCount ?? item.studentsCount ?? item.students ?? item.student_total ?? 0);
}

function moduleStatusMeta(item) {
  const normalized = String(item.status || "").toLowerCase();
  const inactive = ["inactive", "inactif", "archived", "archivé", "archive", "disabled"].includes(normalized);
  return inactive ? { label: "Inactif", tone: "inactive" } : { label: "Actif", tone: "active" };
}

function moduleCourseCount(item) {
  return Number(item.courseCount ?? item.coursesCount ?? item.courses ?? item.course_total ?? 0);
}

function moduleCodeLabel(item) {
  return item.code || item.reference || (item.id ? `MOD-${String(item.id).padStart(3, "0")}` : "MOD-000");
}

function moduleClassLabel(item) {
  const classNames = Array.isArray(item.classNames)
    ? item.classNames
    : Array.isArray(item.classes)
      ? item.classes.map((entry) => typeof entry === "string" ? entry : entry.name)
      : listFromValue(item.classNames || item.classes || item.className);
  return classNames.filter(Boolean).join(", ") || "Non renseigné";
}

function UserInfoIcon({ type }) {
  const paths = {
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.2-2.8 7.2-7 9-4.2-1.8-7-4.8-7-9V6l7-3Z" /><path d="m9 12 2 2 4-5" /></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    cap: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v4c2.7 2 7.3 2 10 0v-4" /></>,
    mail: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" /></>,
    id: <><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></>,
    building: <><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-7h6v7M8 9h.01M12 8h.01M16 9h.01" /></>,
    phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2Z" /></>,
    map: <><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
    modules: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>,
    courses: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z" /><path d="M4 5.5v13" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type] || paths.user}</svg>;
}

function AdminDashboard({
  users,
  schools,
  classes,
  modules,
  directors,
  unassignedSchools,
  reports,
  auditLogs,
  dashboard,
  navigate,
  viewProfile,
}) {
  const teachers = users.filter((entry) => ["teacher", "guest_teacher"].includes(normalizeRole(entry.role || entry.level)));
  const students = users.filter((entry) => ["student", "guest_student"].includes(normalizeRole(entry.role || entry.level)));
  const administrators = users.filter((entry) => ["general_admin", "school_director"].includes(normalizeRole(entry.role || entry.level)));
  const directorRoleFields = (entry) => [
    entry.role,
    entry.level,
    entry.accessLevel,
    entry.access_level,
    entry.roleName,
    entry.role_name,
    entry.userRole,
    entry.user_role,
    entry.type,
    entry.accountType,
    entry.account_type,
  ].filter(Boolean);
  const hasDirectorRole = (entry) => directorRoleFields(entry).some((value) => normalizeRole(value, "") === "school_director");
  const hasRoleMetadata = (entry) => directorRoleFields(entry).length > 0;
  const isActiveAccount = (entry) => !["inactive", "inactif", "disabled", "blocked", "suspended"].includes(String(entry.status || "").toLowerCase());
  const directorPriorityText = (entry) => `${entry.name || ""} ${entry.fullName || ""} ${entry.email || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const availableDirectors = Array.from(
    [...users.filter(hasDirectorRole), ...directors.filter((entry) => !hasRoleMetadata(entry) || hasDirectorRole(entry))]
      .filter(isActiveAccount)
      .reduce((map, entry) => {
        const key = String(entry.id || entry.email || entry.name || "");
        if (key && !map.has(key)) map.set(key, entry);
        return map;
      }, new Map())
      .values(),
  ).sort((first, second) => {
    const firstIsAhmed = directorPriorityText(first).includes("ahmed benali") ? 0 : 1;
    const secondIsAhmed = directorPriorityText(second).includes("ahmed benali") ? 0 : 1;
    if (firstIsAhmed !== secondIsAhmed) return firstIsAhmed - secondIsAhmed;
    return String(first.name || first.email || "").localeCompare(String(second.name || second.email || ""), "fr");
  });
  const pendingSchools = schools.filter((entry) => entry.status === "pending");
  const activeUsers = users.filter((entry) => entry.status === "active").length;
  const activityRate = users.length ? Math.round((activeUsers / users.length) * 100) : 0;
  const totalDistribution = Math.max(1, students.length + teachers.length + administrators.length);
  const studentShare = (students.length / totalDistribution) * 100;
  const teacherShare = (teachers.length / totalDistribution) * 100;
  const recentActions = auditLogs.length
    ? auditLogs.slice(0, 5).map((entry) => ({
      id: entry.id || `${entry.action}-${entry.createdAt}`,
      title: entry.action,
      detail: entry.entityType || "Plateforme",
      date: entry.createdAt,
      tone: "blue",
      icon: String(entry.entityType || entry.action || "").toLowerCase().includes("user") ? "users"
        : String(entry.entityType || entry.action || "").toLowerCase().includes("school") ? "school"
          : String(entry.entityType || entry.action || "").toLowerCase().includes("report") ? "reports"
            : "activity",
    }))
    : reports.slice(0, 5).map((entry) => ({
      id: `report-${entry.id}`,
      title: entry.title,
      detail: entry.status,
      date: entry.createdAt || entry.created_at,
      tone: "purple",
      icon: "reports",
    }));
  const governance = [
    ...auditLogs.slice(0, 4).map((entry) => ({
      id: entry.id || `${entry.action}-${entry.createdAt}`,
      title: entry.action,
      date: entry.createdAt,
    })),
    ...reports.slice(0, Math.max(0, 4 - auditLogs.length)).map((entry) => ({
      id: `governance-${entry.id}`,
      title: entry.title,
      date: entry.createdAt || entry.created_at,
    })),
  ].slice(0, 4);
  const statistics = [
    { label: "Utilisateurs", value: users.length, tone: "blue", icon: "users", detail: `${activeUsers} actifs` },
    { label: "Enseignants", value: teachers.length, tone: "green", icon: "teacher", detail: `${teachers.filter((entry) => entry.status === "active").length} actifs` },
    { label: "Élèves", value: students.length, tone: "orange", icon: "students", detail: `${students.filter((entry) => entry.status === "active").length} actifs` },
    { label: "Établissements", value: schools.length, tone: "purple", icon: "school", detail: `${pendingSchools.length} en attente` },
    { label: "Classes", value: classes.length, tone: "cyan", icon: "classes", detail: "Données synchronisées" },
    { label: "Modules", value: modules.length, tone: "amber", icon: "modules", detail: "Données synchronisées" },
  ];
  const quickStats = [
    { label: "Taux d'activité", value: `${activityRate}%`, detail: `${activeUsers} comptes actifs`, tone: "blue", icon: "activity" },
    { label: "Cours créés", value: Number(dashboard?.stats?.courses || dashboard?.analytics?.content?.courses || 0), detail: "Total plateforme", tone: "orange", icon: "courses" },
    { label: "Quiz générés", value: Number(dashboard?.stats?.quizzes || dashboard?.analytics?.content?.quizzes || 0), detail: "Total plateforme", tone: "green", icon: "quiz" },
    { label: "Rapports", value: reports.length, detail: `${reports.filter((entry) => entry.status === "open").length} ouverts`, tone: "yellow", icon: "reports" },
  ];

  return (
    <div className="admin-dashboard">
      <section className="admin-kpi-grid" aria-label="Statistiques administrateur">
        {statistics.map((stat) => (
          <article className={`admin-kpi-card tone-${stat.tone}`} key={stat.label}>
            <span className="admin-kpi-icon"><DashboardIcon type={stat.icon} /></span>
            <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
          </article>
        ))}
      </section>

      <section className="admin-bottom-grid">
        <article className="admin-dashboard-card admin-distribution-card">
          <header><h2>Répartition des utilisateurs</h2></header>
          <div className="admin-distribution-content">
            <div className="admin-donut" style={{ background: `conic-gradient(#2563eb 0 ${studentShare}%, #17b7c8 ${studentShare}% ${studentShare + teacherShare}%, #f4b400 ${studentShare + teacherShare}% 100%)` }}><span><strong>{users.length}</strong><small>Utilisateurs</small></span></div>
            <div className="admin-distribution-legend">
              <p className="students"><span>Élèves</span><b>{students.length}</b></p>
              <p className="teachers"><span>Enseignants</span><b>{teachers.length}</b></p>
              <p className="administrators"><span>Administrateurs</span><b>{administrators.length}</b></p>
            </div>
          </div>
        </article>

        <article className="admin-dashboard-card admin-quick-card">
          <header><h2>Statistiques rapides</h2></header>
          <div className="admin-quick-grid">
            {quickStats.map((stat) => (
              <div className={`tone-${stat.tone}`} key={stat.label}>
                <i><DashboardIcon type={stat.icon} /></i><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-directors-row">
        <article className="admin-dashboard-card admin-directors-card">
          <header><h2>Directeurs disponibles</h2><p>Comptes actifs pouvant recevoir une école.</p></header>
          <div className="admin-director-list">
            {availableDirectors.slice(0, 6).map((director) => (
              <button type="button" key={director.id} onClick={() => viewProfile(director.id)}>
                <Avatar user={director} name={director.name} size={46} clickable className="admin-director-avatar" />
                <span><strong>{director.name}</strong><small>{director.email}</small></span><b>Disponible</b>
              </button>
            ))}
            {!availableDirectors.length && <p className="admin-empty-copy">Aucun directeur disponible.</p>}
          </div>
          <button className="admin-card-link" type="button" onClick={() => navigate("/platform#users")}>Voir tous les directeurs <b>→</b></button>
        </article>
      </section>
    </div>
  );
}

function reportTypeLabel(report) {
  const raw = report.type || report.reportType || report.target_type || report.targetType || "Autre";
  const labels = { school: "École", class: "Classe", module: "Module", technical: "Technique", access: "Accès", content: "Contenu", feature: "Fonctionnalité" };
  return labels[String(raw).toLowerCase()] || String(raw).replaceAll("_", " ");
}

function reportTargetLabel(report) {
  return report.targetName || report.target_name || report.schoolName || report.target || report.targetId || "Plateforme générale";
}

function reportStatusMeta(report) {
  const status = String(report.status || "open").toLowerCase();
  if (status === "resolved") return { label: "Résolu", tone: "resolved" };
  if (status === "reviewing") return { label: "En cours", tone: "reviewing" };
  if (status === "rejected") return { label: "Refusé", tone: "rejected" };
  return { label: "Ouvert", tone: "open" };
}

function reportPriorityMeta(report) {
  const priority = String(report.priority || report.priorite || "medium").toLowerCase();
  if (["high", "haute", "urgent"].includes(priority)) return { label: "Haute", tone: "high" };
  if (["low", "basse"].includes(priority)) return { label: "Basse", tone: "low" };
  return { label: "Moyenne", tone: "medium" };
}

function ReportStatsCards({ reports, averageResolutionLabel }) {
  const openCount = reports.filter((item) => reportStatusMeta(item).tone === "open").length;
  const reviewingCount = reports.filter((item) => reportStatusMeta(item).tone === "reviewing").length;
  const resolvedCount = reports.filter((item) => reportStatusMeta(item).tone === "resolved").length;
  const cards = [
    { label: "Rapports ouverts", value: openCount, detail: `${openCount} ouverts`, tone: "blue", icon: "reports" },
    { label: "En cours", value: reviewingCount, detail: `${reviewingCount} en traitement`, tone: "yellow", icon: "calendar" },
    { label: "Résolus", value: resolvedCount, detail: `${resolvedCount} clôturés`, tone: "green", icon: "activity" },
    { label: "Temps moyen de résolution", value: averageResolutionLabel, detail: "Données réelles", tone: "purple", icon: "modules" },
  ];
  return (
    <section className="reports-kpi-grid" aria-label="Statistiques des rapports">
      {cards.map((card) => (
        <article className={`reports-kpi-card tone-${card.tone}`} key={card.label}>
          <span><DashboardIcon type={card.icon} /></span>
          <div><small>{card.label}</small><strong>{card.value}</strong><p>{card.detail}</p></div>
        </article>
      ))}
    </section>
  );
}

function ReportFilters({ draft, onDraftChange, onApply, onReset, onExport, sort, onSort }) {
  return (
    <div className="reports-filter-row">
      <input value={draft.search} onChange={(event) => onDraftChange({ ...draft, search: event.target.value })} placeholder="Rechercher un rapport..." />
      <select value={draft.status} onChange={(event) => onDraftChange({ ...draft, status: event.target.value })}>
        <option value="all">Tous les statuts</option>
        <option value="open">Ouvert</option>
        <option value="reviewing">En cours</option>
        <option value="resolved">Résolu</option>
        <option value="rejected">Refusé</option>
      </select>
      <select value={draft.priority} onChange={(event) => onDraftChange({ ...draft, priority: event.target.value })}>
        <option value="all">Toutes les priorités</option>
        <option value="high">Haute</option>
        <option value="medium">Moyenne</option>
        <option value="low">Basse</option>
      </select>
      <select value={sort} onChange={(event) => onSort(event.target.value)}>
        <option value="newest">Plus récent</option>
        <option value="oldest">Plus ancien</option>
        <option value="title">Titre A-Z</option>
        <option value="status">Statut</option>
      </select>
      <button type="button" className="secondary" onClick={onReset}>Réinitialiser</button>
      <button type="button" onClick={onApply}>Filtres</button>
      <button type="button" className="export" onClick={onExport}>Exporter</button>
    </div>
  );
}

function ReportCharts({ reports, period, onPeriodChange, onExport }) {
  const periodMonths = Number(period);
  const visibleReports = reports.filter((report) => {
    const createdAt = new Date(report.createdAt || report.created_at || report.date || 0);
    if (Number.isNaN(createdAt.getTime())) return true;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - periodMonths);
    return createdAt >= cutoff;
  });
  const typeItems = Object.entries(visibleReports.reduce((acc, report) => {
    const key = reportTypeLabel(report);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).slice(0, 5);
  const targetItems = Object.entries(visibleReports.reduce((acc, report) => {
    const key = reportTargetLabel(report);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).slice(0, 5);
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const monthItems = Array.from({ length: Math.min(periodMonths, 12) }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (Math.min(periodMonths, 12) - 1 - index));
    return {
      label: monthFormatter.format(date),
      value: visibleReports.filter((report) => {
        const createdAt = new Date(report.createdAt || report.created_at || report.date || 0);
        return createdAt.getMonth() === date.getMonth() && createdAt.getFullYear() === date.getFullYear();
      }).length,
    };
  });
  const totalType = Math.max(1, typeItems.reduce((sum, item) => sum + item.value, 0));
  const maxTarget = Math.max(1, ...targetItems.map((item) => item.value));
  const maxMonth = Math.max(1, ...monthItems.map((item) => item.value));
  const first = (typeItems[0]?.value || 0) / totalType * 100;
  const second = first + (typeItems[1]?.value || 0) / totalType * 100;
  const third = second + (typeItems[2]?.value || 0) / totalType * 100;

  return (
    <section className="reports-stats-panel">
      <header>
        <h2>Statistiques</h2>
        <div><span>Période</span><select value={period} onChange={(event) => onPeriodChange(event.target.value)}><option value="6">6 derniers mois</option><option value="12">12 derniers mois</option></select><button type="button" onClick={onExport}>Exporter</button></div>
      </header>
      <div className="reports-chart-grid">
        <article>
          <h3>Rapports par type</h3>
          <div className="reports-donut" style={{ background: `conic-gradient(#2563eb 0 ${first}%, #10b981 ${first}% ${second}%, #f4b400 ${second}% ${third}%, #7c3aed ${third}% 100%)` }}><span>{visibleReports.length}</span></div>
          <div className="reports-chart-legend">{(typeItems.length ? typeItems : [{ label: "Aucun rapport", value: 0 }]).map((item, index) => <p key={item.label}><i className={`tone-${index + 1}`} />{item.label}<b>{item.value}</b></p>)}</div>
        </article>
        <article>
          <h3>Rapports par établissement</h3>
          <div className="reports-bars">{(targetItems.length ? targetItems : [{ label: "Aucune donnée", value: 0 }]).map((item) => <span key={item.label}><i style={{ height: `${Math.max(8, item.value / maxTarget * 100)}%` }} /><small>{item.label}</small><b>{item.value}</b></span>)}</div>
        </article>
        <article>
          <h3>Rapports par mois</h3>
          <svg className="reports-line-chart" viewBox="0 0 100 58" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8H100M0 24H100M0 40H100M0 56H100" /><polyline points={monthItems.map((item, index) => `${(index / Math.max(1, monthItems.length - 1)) * 100},${56 - item.value / maxMonth * 48}`).join(" ")} /></svg>
          <div className="reports-months">{monthItems.map((item) => <span key={item.label}>{item.label}</span>)}</div>
        </article>
      </div>
    </section>
  );
}

function ReportForm({ schools, classes, modules, onSubmit }) {
  const [form, setForm] = useState({ title: "", targetType: "school", targetId: "", priority: "medium", body: "" });
  const targetsByType = {
    school: schools.map((item) => ({ id: item.id, name: item.name || schoolDisplayName(item) })),
    class: classes.map((item) => ({ id: item.id, name: item.name || "Classe" })),
    module: modules.map((item) => ({ id: item.id, name: item.name || "Module" })),
    technical: [],
  };
  const targetOptions = targetsByType[form.targetType] || [];
  const submit = async (event) => {
    event.preventDefault();
    const ok = await onSubmit(form);
    if (ok) setForm({ title: "", targetType: "school", targetId: "", priority: "medium", body: "" });
  };
  return (
    <form className="reports-form-card" onSubmit={submit}>
      <h2>Créer un rapport</h2>
      <label><span>Titre</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex: Problème de connexion" /></label>
      <label><span>Type</span><select value={form.targetType} onChange={(event) => setForm({ ...form, targetType: event.target.value, targetId: "" })}><option value="school">École</option><option value="class">Classe</option><option value="module">Module</option><option value="technical">Technique</option></select></label>
      <label><span>Priorité</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label>
      <label><span>Cible</span><select value={form.targetId} onChange={(event) => setForm({ ...form, targetId: event.target.value })}><option value="">Plateforme générale</option>{targetOptions.map((item) => <option key={`${form.targetType}-${item.id}`} value={item.id}>{item.name}</option>)}</select></label>
      <label className="wide"><span>Description</span><textarea required value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Décrivez le problème en détail..." /></label>
      <button type="submit">Envoyer le rapport</button>
    </form>
  );
}

function ReportTable({ reports, sort, onSort, onView, onEdit, onDelete, onExportRow }) {
  const sortButton = (key, label) => <button type="button" onClick={() => onSort(key)}>{label}{sort === key ? " ↑" : ""}</button>;
  return (
    <div className="reports-table" role="table" aria-label="Rapports">
      <div className="reports-row reports-head" role="row">
        <span>{sortButton("title", "Titre")}</span><span>Type</span><span>Cible</span><span>{sortButton("newest", "Date")}</span><span>{sortButton("status", "Statut")}</span><span>Priorité</span><span>Actions</span>
      </div>
      {reports.map((report) => {
        const status = reportStatusMeta(report);
        const priority = reportPriorityMeta(report);
        return (
          <div className="reports-row" role="row" key={report.id}>
            <span title={report.title || ""}>{report.title || "Sans titre"}</span>
            <span>{reportTypeLabel(report)}</span>
            <span title={reportTargetLabel(report)}>{reportTargetLabel(report)}</span>
            <span>{formatAdminDate(report.createdAt || report.created_at || report.date) || "Non renseignée"}</span>
            <span><em className={`reports-badge status-${status.tone}`}>{status.label}</em></span>
            <span><em className={`reports-badge priority-${priority.tone}`}>{priority.label}</em></span>
            <span className="reports-actions"><button type="button" onClick={() => onView(report)}>Voir</button><button type="button" onClick={() => onEdit(report)}>Modifier</button><button type="button" className="danger" onClick={() => onDelete(report)}>Supprimer</button><button type="button" onClick={() => onExportRow(report)}>Exporter</button></span>
          </div>
        );
      })}
      {!reports.length && <div className="reports-empty">Aucun rapport ne correspond aux critères.</div>}
    </div>
  );
}

function ReportPagination({ page, totalPages, total, pageSize, onPage }) {
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1);
  return (
    <div className="reports-pagination">
      <p>Affichage de {first} à {last} sur {total} rapports</p>
      <div><button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>Précédent</button>{pages.map((item, index) => <Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span>...</span>}<button type="button" className={item === page ? "active" : ""} onClick={() => onPage(item)}>{item}</button></Fragment>)}<button type="button" disabled={page === totalPages} onClick={() => onPage(page + 1)}>Suivant</button></div>
    </div>
  );
}

function ReportsModule({ reports, schools, classes, modules, averageResolutionLabel, onCreate, onView, onEdit, onDelete, onExport }) {
  const [filters, setFilters] = useState({ search: "", status: "all", priority: "all" });
  const [draftFilters, setDraftFilters] = useState(filters);
  const [period, setPeriod] = useState("6");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const updateFilters = (nextFilters) => {
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
    setPage(1);
  };
  const filtered = reports.filter((report) => {
    const searchable = [report.title, reportTypeLabel(report), reportTargetLabel(report), reportStatusMeta(report).label, reportPriorityMeta(report).label].join(" ").toLowerCase();
    return searchable.includes(filters.search.toLowerCase())
      && (filters.status === "all" || reportStatusMeta(report).tone === filters.status)
      && (filters.priority === "all" || reportPriorityMeta(report).tone === filters.priority);
  }).sort((left, right) => {
    if (sort === "oldest") return new Date(left.createdAt || left.created_at || 0) - new Date(right.createdAt || right.created_at || 0);
    if (sort === "title") return String(left.title || "").localeCompare(String(right.title || ""));
    if (sort === "status") return reportStatusMeta(left).label.localeCompare(reportStatusMeta(right).label);
    return new Date(right.createdAt || right.created_at || 0) - new Date(left.createdAt || left.created_at || 0);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const exportRows = (rows) => onExport(rows.map((report) => ({
    Titre: report.title || "",
    Type: reportTypeLabel(report),
    Cible: reportTargetLabel(report),
    Date: formatAdminDate(report.createdAt || report.created_at || report.date),
    Statut: reportStatusMeta(report).label,
    Priorite: reportPriorityMeta(report).label,
  })));

  return (
    <section className="reports-module-page">
      <header className="reports-module-hero"><span><DashboardIcon type="reports" /></span><div><h2>Rapports et statistiques</h2><p>Analysez les rapports et suivez les statistiques de la plateforme.</p></div></header>
      <ReportStatsCards reports={reports} averageResolutionLabel={averageResolutionLabel} />
      <div className="reports-module-layout">
        <ReportForm schools={schools} classes={classes} modules={modules} onSubmit={onCreate} />
        <section className="reports-module-main">
          <ReportCharts reports={reports} period={period} onPeriodChange={setPeriod} onExport={() => exportRows(filtered)} />
          <ReportFilters draft={draftFilters} onDraftChange={updateFilters} onApply={() => { setFilters(draftFilters); setPage(1); }} onReset={() => { const reset = { search: "", status: "all", priority: "all" }; setDraftFilters(reset); setFilters(reset); setPage(1); }} onExport={() => exportRows(filtered)} sort={sort} onSort={(value) => { setSort(value); setPage(1); }} />
          <ReportTable reports={pageRows} sort={sort} onSort={(value) => { setSort(value); setPage(1); }} onView={onView} onEdit={onEdit} onDelete={onDelete} onExportRow={(report) => exportRows([report])} />
          <ReportPagination page={currentPage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage} />
        </section>
      </div>
    </section>
  );
}

function PlatformManagement() {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();
  const role = normalizeRole(user.role || user.level);
  const [levels, setLevels] = useState([]);
  const [schools, setSchools] = useState([]);
  const [classes, setClasses] = useState([]);
  const [modules, setModules] = useState([]);
  const [aiProfile, setAiProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [architecture, setArchitecture] = useState(null);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [reports, setReports] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [validationRequests, setValidationRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [schoolForm, setSchoolForm] = useState(emptySchool);
  const [schoolWizardStep, setSchoolWizardStep] = useState(1);
  const [classForm, setClassForm] = useState({
    schoolId: "",
    name: "",
    levelName: "",
    academicYear: "2026-2027",
    pedagogicalStructure: "",
  });
  const [moduleForm, setModuleForm] = useState({
    name: "",
    description: "",
    levelName: "",
    weeklyHours: 2,
    pedagogicalObjectives: "",
    classIds: [],
  });
  const [scheduleForm, setScheduleForm] = useState({ schoolId: "", classId: "" });
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [schedulePreviewEntries, setSchedulePreviewEntries] = useState([]);
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [scheduleId, setScheduleId] = useState(null);
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => scheduleWeekStartIso());
  const [scheduleHasUnsavedChanges, setScheduleHasUnsavedChanges] = useState(false);
  const [studentPlan, setStudentPlan] = useState([]);
  const [studentPlanWeekStart, setStudentPlanWeekStart] = useState(() => scheduleWeekStartIso());
  const [directors, setDirectors] = useState([]);
  const [unassignedSchools, setUnassignedSchools] = useState([]);
  const [directorAssignment, setDirectorAssignment] = useState({ schoolId: "", directorId: "" });
  const [schoolTeachers, setSchoolTeachers] = useState([]);
  const [teacherAssignment, setTeacherAssignment] = useState({ teacherId: "", classIds: [], moduleIds: [] });
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [schoolStudents, setSchoolStudents] = useState([]);
  const [studentAssignments, setStudentAssignments] = useState([]);
  const [studentAssignment, setStudentAssignment] = useState({ studentId: "", classId: "", moduleIds: [] });
  const [editingStudentAssignmentId, setEditingStudentAssignmentId] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    accessLevel: "",
    schoolId: "",
    status: "active",
  });
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [previewSchool, setPreviewSchool] = useState(null);
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [addSchoolForm, setAddSchoolForm] = useState(emptySchool);
  const [selectedClass, setSelectedClass] = useState(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null);
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [schoolFiles, setSchoolFiles] = useState([]);
  const [schoolLogoFile, setSchoolLogoFile] = useState(null);
  const [editingSchoolId, setEditingSchoolId] = useState(null);
  const [existingSchoolDocuments, setExistingSchoolDocuments] = useState([]);
  const [uploadingSchoolFiles, setUploadingSchoolFiles] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatus, setRequestStatus] = useState("all");
  const [requestType, setRequestType] = useState("all");
  const [requestSchool, setRequestSchool] = useState("all");
  const [requestClass, setRequestClass] = useState("all");
  const [requestPeriod, setRequestPeriod] = useState("all");
  const [requestSort, setRequestSort] = useState("newest");
  const [appliedRequestFilters, setAppliedRequestFilters] = useState({
    search: "", status: "all", type: "all", school: "all", classId: "all", cutoff: null, sort: "newest",
  });
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherSchoolFilter, setTeacherSchoolFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSchoolFilter, setStudentSchoolFilter] = useState("all");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSchoolFilter, setAssignmentSchoolFilter] = useState("all");
  const [assignmentClassFilter, setAssignmentClassFilter] = useState("all");
  const [assignmentModuleFilter, setAssignmentModuleFilter] = useState("all");
  const [adminScheduleSchoolFilter, setAdminScheduleSchoolFilter] = useState("all");
  const [adminScheduleClassFilter, setAdminScheduleClassFilter] = useState("all");
  const [adminScheduleTeacherFilter, setAdminScheduleTeacherFilter] = useState("all");
  const [adminSchedulePeriodStart, setAdminSchedulePeriodStart] = useState(() => getScheduleWeekStartForDate(new Date()));
  const [classSearch, setClassSearch] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleSchoolFilter, setModuleSchoolFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditUserFilter, setAuditUserFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditDateFilter, setAuditDateFilter] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const schoolFileInputRef = useRef(null);
  const [selectedMetric, setSelectedMetric] = useState("users");
  const [selectedDistribution, setSelectedDistribution] = useState("teachers");
  const [selectedContent, setSelectedContent] = useState("modules");
  const [adminMenuOverride, setAdminMenuOverride] = useState("");

  const canApproveSchools = role === "general_admin";
  const canCreateSchool = role === "school_director";
  const canManageTeaching = role === "school_director";
  const canGenerateSchedule = role === "school_director";

  const tabs = useMemo(() => {
    const base = ["overview"];

    if (role === "general_admin") {
      return [...base, "assignments", "attachmentRequests", "users", "classes", "modules", "teachers", "students", "reports", "audit"];
    }

    if (role === "school_director") {
      return [...base, "schools", "requests", "assignments", "studentAssignments", "classes", "modules", "schedule", "reports", "ai"];
    }

    if (["teacher", "guest_teacher"].includes(role)) {
      return [...base, "assignments", "reports", "ai"];
    }

    return [...base, "ai"];
  }, [role]);

  const tabLabels = {
    overview: t.dashboard,
    schools: t.schools,
    assignments: "Affectations",
    studentAssignments: "Affectation des étudiants",
    attachmentRequests: "Demandes de rattachement",
    users: t.userManagement,
    requests: t.validationRequests,
    classes: t.classes,
    modules: t.modules,
    schedule: t.scheduleGenerator,
    reports: t.reports,
    audit: t.auditLogs,
    ai: t.aiProfile,
  };
  const tabItems = tabs.map((tab) => ({ id: tab, label: tabLabels[tab] || tab }));
  const hashTab = location.hash.replace("#", "");
  const routedTab = tabs.includes(hashTab) ? hashTab : "overview";
  const activeTab = role === "general_admin" && adminMenuOverride ? adminMenuOverride : routedTab;
  const isAdminPeoplePage = role === "general_admin" && ["users", "teachers", "students"].includes(activeTab);
  const isAdminSchoolsPage = role === "general_admin" && activeTab === "assignments";
  const isDirectorSchoolsPage = role === "school_director" && activeTab === "schools";
  const isEditingSchool = Boolean(editingSchoolId);
  const adminEstablishments = useMemo(() => {
    const byId = new Map();
    [...schools, ...unassignedSchools].forEach((school, index) => {
      const key = school.id || `${school.name}-${school.city}-${index}`;
      byId.set(key, school);
    });
    return [...byId.values()];
  }, [schools, unassignedSchools]);
  const adminSchoolStats = useMemo(() => {
    const approved = adminEstablishments.filter((school) => schoolStatusMeta(school).tone === "approved").length;
    const pending = adminEstablishments.filter((school) => schoolStatusMeta(school).tone === "pending").length;
    const directorsAssigned = adminEstablishments.filter((school) => schoolDirectorLabel(school) !== "Non assigné").length;
    const total = Math.max(adminEstablishments.length, Number(dashboard?.stats?.schools || 0));
    return [
      { label: "Total établissements", value: total, detail: "+2 ce mois", tone: "blue", icon: "school" },
      { label: "Établissements approuvés", value: approved, detail: "+1 ce mois", tone: "green", icon: "activity" },
      { label: "Établissements en attente", value: pending, detail: "0 ce mois", tone: "yellow", icon: "calendar" },
      { label: "Directeurs affectés", value: directorsAssigned, detail: "+2 ce mois", tone: "purple", icon: "users" },
    ];
  }, [adminEstablishments, dashboard]);
  const schoolPreviewSource = isEditingSchool ? schoolForm : previewSchool || schools[0] || schoolForm;

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const readJson = async (response) => {
        try {
          return await response.json();
        } catch {
          return {};
        }
      };
      const optionalJson = async (path) => {
        try {
          const response = await apiFetch(path);
          return readJson(response);
        } catch {
          return {};
        }
      };

      const dashboardResponse = await apiFetch("/api/platform/dashboard");
      const dashboardData = await readJson(dashboardResponse);
      if (!dashboardResponse.ok || !dashboardData.success) {
        throw new Error(dashboardData.message || "Unable to load platform dashboard");
      }

      const architectureData = await optionalJson("/api/platform/architecture");

      setDashboard(dashboardData);
      if (architectureData.success) {
        setArchitecture(architectureData.architecture);
      }

      if (role === "general_admin") {
        const [usersData, auditData, assignmentsData, teacherAssignmentsData] = await Promise.all([
          optionalJson("/api/admin/users"),
          optionalJson("/api/admin/audit-logs"),
          optionalJson("/api/admin/director-assignments"),
          optionalJson("/api/director/teacher-assignments"),
        ]);
        if (usersData.success) {
          setUsers(usersData.users);
        }
        if (teacherAssignmentsData.success) {
          setAssignments(teacherAssignmentsData.assignments || []);
        }
        if (auditData.success) {
          setAuditLogs(auditData.auditLogs);
        }
        if (assignmentsData.success) {
          setDirectors(assignmentsData.directors || []);
          setUnassignedSchools(assignmentsData.schools || []);
        }
      }

      if (role === "school_director") {
        const [teachersData, assignmentsData, studentsData, studentAssignmentsData] = await Promise.all([
          optionalJson("/api/director/teachers"),
          optionalJson("/api/director/teacher-assignments"),
          optionalJson("/api/director/students"),
          optionalJson("/api/director/student-assignments"),
        ]);
        if (teachersData.success) setSchoolTeachers(teachersData.teachers || []);
        if (assignmentsData.success) setAssignments(assignmentsData.assignments || []);
        if (studentsData.success) setSchoolStudents(studentsData.students || []);
        if (studentAssignmentsData.success) setStudentAssignments(studentAssignmentsData.assignments || []);
      }

      if (role === "school_director") {
        const requestsData = await optionalJson("/api/validation-requests");
        if (requestsData.success) {
          setValidationRequests(requestsData.requests);
        }
      }

      const reportsData = await optionalJson("/api/reports");
      if (reportsData.success) {
        setReports(reportsData.reports);
      }

      if (role !== "general_admin") {
        const aiData = await optionalJson("/api/ai-learning-profile");
        if (aiData.success) setAiProfile(aiData.profile);
      }

      if (["student", "guest_student"].includes(role)) {
        const [profileData, aiData] = await Promise.all([
          optionalJson("/api/student/profile"),
          optionalJson("/api/ai-learning-profile"),
        ]);
        if (aiData.success) setAiProfile(aiData.profile);
        if (profileData.success && profileData.profile?.classId) {
          const schedulesData = await optionalJson(`/api/schedules?classId=${profileData.profile.classId}`);
          if (schedulesData.success) {
            const studentSchedule = schedulesData.schedules?.[0] || null;
            setStudentPlan(studentSchedule?.entries || []);
            setStudentPlanWeekStart(studentSchedule ? scheduleWeekStartFromSchedule(studentSchedule) : scheduleWeekStartIso());
          }
        }
      }
    } finally {
      setLoadingOverview(false);
    }
  }, [role]);

  const loadPlatform = useCallback(async () => {
      if (role === "general_admin" && !["users", "teachers", "students", "classes", "modules", "affectations", "scheduleAdmin"].includes(adminMenuOverride)) return;
    const [levelsResponse, schoolsResponse, classesResponse, modulesResponse] = await Promise.all([
      apiFetch("/api/levels"),
      apiFetch("/api/schools"),
      apiFetch("/api/classes"),
      apiFetch("/api/modules"),
    ]);
    const [levelsData, schoolsData, classesData, modulesData] = await Promise.all([
      levelsResponse.json(),
      schoolsResponse.json(),
      classesResponse.json(),
      modulesResponse.json(),
    ]);

    if (levelsData.success) {
      setLevels(levelsData.levels);
    }
    if (schoolsData.success) {
      setSchools(schoolsData.schools);
    }
    if (classesData.success) {
      setClasses(classesData.classes);
    }
    if (modulesData.success) {
      setModules(modulesData.modules);
    }
  }, [adminMenuOverride, role, setClasses, setLevels, setModules, setSchools]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadOverview().catch(() => setMessage(t.overviewLoadError));
      loadPlatform().catch(() => setMessage(t.platformLoadError));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview, loadPlatform, t.overviewLoadError, t.platformLoadError]);

  useEffect(() => {
    const refresh = () => { loadOverview().catch(() => {}); loadPlatform().catch(() => {}); };
    window.addEventListener("learnix:data-updated", refresh);
    return () => window.removeEventListener("learnix:data-updated", refresh);
  }, [loadOverview, loadPlatform]);

  useEffect(() => {
    if (role !== "general_admin") return undefined;
    const handleAdminNavClick = (event) => {
      const button = event.target.closest?.(".learnix-nav button");
      if (!button) return;
      const label = button.textContent || "";
      const lowerLabel = label.toLowerCase();
      const adminTarget = [
        { view: "classes", matches: lowerLabel.includes("gestion des classes") },
        { view: "modules", matches: lowerLabel.includes("gestion des modules") },
        { view: "teachers", matches: lowerLabel.includes("gestion des enseignants") },
        { view: "students", matches: lowerLabel.includes("gestion des") && lowerLabel.includes("ves") },
        { view: "affectations", hash: "assignments", matches: lowerLabel.includes("gestion des affectations") },
        { view: "attachmentRequests", matches: lowerLabel.includes("demandes de rattachement") },
        { view: "scheduleAdmin", hash: "overview", matches: lowerLabel.includes("gestion des emplois du temps") },
      ].find((item) => item.matches);
      if (adminTarget) {
        event.preventDefault();
        event.stopPropagation();
        setAdminMenuOverride(adminTarget.view);
        navigate(`/platform#${adminTarget.hash || adminTarget.view}`);
        return;
      }
      setAdminMenuOverride("");
    };
    document.addEventListener("click", handleAdminNavClick, true);
    return () => document.removeEventListener("click", handleAdminNavClick, true);
  }, [navigate, role]);

  const uploadSchoolDocuments = async () => {
    if (!schoolFiles.length) return [];
    setUploadingSchoolFiles(true);
    try {
      const formData = new FormData();
      schoolFiles.forEach((file) => formData.append("files", file));
      const response = await apiFetch("/api/school-documents", { method: "POST", body: formData });
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
      return data.documents || [];
    } finally {
      setUploadingSchoolFiles(false);
    }
  };

  const uploadSchoolLogo = async () => {
    if (!schoolLogoFile) return "";
    setUploadingSchoolFiles(true);
    try {
      const formData = new FormData();
      formData.append("file", schoolLogoFile);
      const response = await apiFetch("/api/school-logo", { method: "POST", body: formData });
      const data = await readSchoolApiResponse(response, "Echec de l'importation du logo");
      return data.logo?.url || "";
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Echec de l'importation du logo: impossible de joindre ${apiUrl("/api/school-logo")}`);
      }
      throw error;
    } finally {
      setUploadingSchoolFiles(false);
    }
  };

  const openSchoolDocument = async (schoolDocument, index = 0) => {
    const label = schoolDocumentLabel(schoolDocument, index);
    const fetchPath = schoolDocumentFetchPath(schoolDocument);
    if (!fetchPath) {
      setMessage("Document indisponible");
      return;
    }

    if (!isProtectedSchoolDocument(schoolDocument)) {
      window.open(schoolDocumentUrl(schoolDocument), "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const response = await apiFetch(fetchPath);
      if (!response.ok) {
        let detail = "";
        try {
          const data = await response.json();
          detail = data.message || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || "Accès au document refusé");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = label;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    } catch (error) {
      setMessage(error.message || "Impossible d'ouvrir le document");
    }
  };

  const resetSchoolEditor = () => {
    setSchoolForm(emptySchool);
    setSchoolFiles([]);
    setSchoolLogoFile(null);
    setEditingSchoolId(null);
    setExistingSchoolDocuments([]);
    setSchoolWizardStep(1);
    if (schoolFileInputRef.current) {
      schoolFileInputRef.current.value = "";
    }
  };

  const editSchool = (school) => {
    const { uploadedDocuments } = splitSchoolLegalDocuments(school);
    setPreviewSchool(school);
    setSchoolForm(schoolToForm(school));
    setExistingSchoolDocuments(uploadedDocuments);
    setSchoolFiles([]);
    setSchoolLogoFile(null);
    setEditingSchoolId(school.id);
    setSchoolWizardStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateSchoolWizardStep = (step) => {
    const requiredByStep = {
      1: [
        ["name", t.schoolName],
        ["schoolType", t.schoolType],
        ["city", t.city],
        ["officialEmail", t.officialEmail],
      ],
      2: [
        ["directorName", t.directorName],
        ["directorEmail", t.directorEmail],
      ],
    };
    const missing = (requiredByStep[step] || []).filter(([key]) => !String(schoolForm[key] || "").trim());
    if (missing.length) {
      setMessage(`Champ requis: ${missing.map(([, label]) => label).join(", ")}`);
      return false;
    }
    return true;
  };

  const nextSchoolWizardStep = () => {
    if (!validateSchoolWizardStep(schoolWizardStep)) return;
    setSchoolWizardStep((step) => Math.min(3, step + 1));
  };

  const submitSchool = async (event) => {
    event.preventDefault();
    if (schoolWizardStep < 3) {
      nextSchoolWizardStep();
      return;
    }
    let uploadedDocuments;
    let uploadedLogoUrl = "";
    try {
      uploadedLogoUrl = await uploadSchoolLogo();
      uploadedDocuments = await uploadSchoolDocuments();
    } catch (error) {
      setMessage(error.message || "Échec de l'importation des documents");
      return;
    }
    const payload = {
      ...schoolForm,
      logoUrl: uploadedLogoUrl || schoolForm.logoUrl,
      legalDocuments: [
        ...(isEditingSchool ? existingSchoolDocuments : []),
        ...uploadedDocuments,
        ...schoolForm.legalDocuments
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      ],
    };
    let data;
    try {
      const savePath = isEditingSchool ? `/api/schools/${editingSchoolId}` : "/api/schools";
      const response = await apiFetch(savePath, {
        method: isEditingSchool ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      data = await readSchoolApiResponse(response, isEditingSchool ? "Echec de l'enregistrement de l'ecole" : "Echec de la demande de validation");
    } catch (error) {
      if (error instanceof TypeError) {
        const savePath = isEditingSchool ? `/api/schools/${editingSchoolId}` : "/api/schools";
        setMessage(`Echec de l'enregistrement de l'ecole: impossible de joindre ${apiUrl(savePath)}`);
      } else {
        setMessage(error.message || "Echec de l'enregistrement de l'ecole");
      }
      return;
    }
    setMessage(data.message);
    if (data.success) {
      resetSchoolEditor();
      loadPlatform();
      loadOverview();
    }
  };

  const exportCsv = (filename, rows) => {
    if (!rows.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }
    const keys = Object.keys(rows[0]);
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [keys.map(escapeCell).join(","), ...rows.map((row) => keys.map((key) => escapeCell(row[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportVisibleClasses = () => {
    if (!filteredClasses.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("classes.csv", filteredClasses.map((item) => ({
      Classe: item.name || "",
      Établissement: item.schoolName || schools.find((school) => String(school.id) === String(item.schoolId))?.name || "Non renseigné",
      Niveau: item.levelName || "Non renseigné",
      "Nombre d'élèves": classStudentCount(item),
      Statut: classStatusMeta(item).label,
    })));
  };

  const exportVisibleModules = () => {
    if (!filteredModules.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("modules.csv", filteredModules.map((item) => ({
      Module: item.name || "",
      Code: moduleCodeLabel(item),
      "Etablissement": item.schoolName || item.establishmentName || "Non renseigné",
      Classes: moduleClassLabel(item),
      "Nombre de cours": moduleCourseCount(item),
      Statut: moduleStatusMeta(item).label,
    })));
  };

  const exportVisibleTeachers = () => {
    if (!filteredAdminTeachers.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("enseignants.csv", filteredAdminTeachers.map((teacher) => ({
      Enseignant: userDisplayName(teacher),
      Email: teacher.email || "",
      Etablissement: teacherSchoolLabel(teacher),
      Modules: teacherAssignedModuleCount(teacher),
      Statut: userStatusMeta(teacher).label,
    })));
  };

  const exportVisibleStudents = () => {
    if (!filteredAdminStudents.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("eleves.csv", filteredAdminStudents.map((student) => ({
      Eleve: userDisplayName(student),
      Email: student.email || "",
      Classe: studentClassLabel(student),
      Etablissement: studentSchoolLabel(student),
      Statut: userStatusMeta(student).label,
    })));
  };

  const exportVisibleAssignments = () => {
    if (!filteredAdminAssignments.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("affectations.csv", filteredAdminAssignments.map((item) => ({
      Enseignant: item.teacherName,
      Module: item.moduleName,
      Classe: item.className,
      Etablissement: item.schoolName,
      Statut: item.status.label,
      Periode: item.period,
    })));
  };

  const decideSchool = async (schoolId, status) => {
    const reason = status === "rejected" ? window.prompt(t.rejectionReason) || "" : "";
    const response = await apiFetch(`/api/schools/${schoolId}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    });
    const data = await response.json();
    setMessage(data.message);
    if (data.success) {
      loadPlatform();
      loadOverview();
    }
  };

  const submitClass = async (event) => {
    event.preventDefault();
    const response = await apiFetch("/api/classes", {
      method: "POST",
      body: JSON.stringify(classForm),
    });
    const data = await response.json();
    setMessage(data.success ? `${t.className}: ${data.status}` : data.message);
    if (data.success) {
      setClassForm({ ...classForm, name: "", pedagogicalStructure: "" });
      loadPlatform();
      loadOverview();
    }
  };

  const submitModule = async (event) => {
    event.preventDefault();
    const response = await apiFetch("/api/modules", {
      method: "POST",
      body: JSON.stringify(moduleForm),
    });
    const data = await response.json();
    setMessage(data.success ? t.createModule : data.message);
    if (data.success) {
      setModuleForm({ ...moduleForm, name: "", description: "", pedagogicalObjectives: "", classIds: [] });
      loadPlatform();
      loadOverview();
    }
  };

  const loadScheduleForClass = useCallback(async (classId, weekStart) => {
    if (!classId) {
      setScheduleEntries([]);
      setSchedulePreviewEntries([]);
      setScheduleId(null);
      setScheduleHasUnsavedChanges(false);
      return;
    }
    const selectedWeekStart = scheduleWeekStartIso(weekStart || new Date());
    const response = await apiFetch(`/api/schedules?classId=${classId}&weekStartDate=${selectedWeekStart}`);
    const data = await response.json();
    if (data.success) {
      const existingSchedule = data.schedules?.[0] || null;
      setScheduleId(existingSchedule?.id || null);
      setScheduleEntries(existingSchedule?.entries || []);
      setSchedulePreviewEntries([]);
      setScheduleHasUnsavedChanges(false);
    } else {
      setMessage(data.message || "Impossible de charger l'emploi du temps");
    }
  }, []);

  const loadSavedSchedules = useCallback(async () => {
    const response = await apiFetch("/api/schedules");
    const data = await response.json();
    if (data.success) {
      const schedules = data.schedules || [];
      setSavedSchedules(schedules);
    } else {
      setMessage(data.message || "Impossible de charger les emplois du temps enregistrés");
    }
  }, []);

  useEffect(() => {
    if (role !== "school_director" || activeTab !== "schedule") return;
    loadScheduleForClass(scheduleForm.classId, scheduleWeekStart).catch(() => setMessage("Impossible de charger l'emploi du temps"));
    loadSavedSchedules().catch(() => setMessage("Impossible de charger les emplois du temps enregistrés"));
  }, [activeTab, loadSavedSchedules, loadScheduleForClass, role, scheduleForm.classId, scheduleWeekStart]);

  useEffect(() => {
    if (role !== "general_admin" || activeTab !== "scheduleAdmin") return;
    loadSavedSchedules().catch(() => setMessage("Impossible de charger les emplois du temps enregistrés"));
  }, [activeTab, loadSavedSchedules, role]);

  const generateSchedule = async (event) => {
    event.preventDefault();
    const response = await apiFetch("/api/schedules/generate", {
      method: "POST",
      body: JSON.stringify(scheduleForm),
    });
    const data = await response.json();
    setMessage(data.success ? t.generateSchedule : data.message);
    if (data.success) {
      setSchedulePreviewEntries((data.entries || []).map((entry) => ({
        ...entry,
        classId: scheduleForm.classId,
        schoolId: scheduleForm.schoolId,
      })));
      setScheduleHasUnsavedChanges(true);
    }
  };

  const saveSchedule = async () => {
    if (!scheduleForm.classId || !schedulePreviewEntries.length) {
      setMessage("Aucun emploi du temps à enregistrer");
      return;
    }
    const response = await apiFetch("/api/schedules", {
      method: "POST",
      body: JSON.stringify({ classId: scheduleForm.classId, entries: schedulePreviewEntries, weekStartDate: scheduleWeekStart }),
    });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Emploi du temps enregistré" : "Impossible d'enregistrer l'emploi du temps"));
    if (data.success) {
      await loadScheduleForClass(scheduleForm.classId, scheduleWeekStart);
      await loadSavedSchedules();
    }
  };

  const editScheduleEntry = async (entry) => {
    const dayOfWeek = window.prompt("Jour (1-7)", entry.dayOfWeek);
    if (dayOfWeek === null) return;
    const startTime = window.prompt("Heure de début (HH:MM)", String(entry.startTime || "").slice(0, 5));
    if (startTime === null) return;
    const endTime = window.prompt("Heure de fin (HH:MM)", String(entry.endTime || "").slice(0, 5));
    if (endTime === null) return;
    const moduleId = window.prompt("ID du module", entry.moduleId || "");
    if (moduleId === null) return;
    const teacherId = window.prompt("ID de l'enseignant", entry.teacherId || "");
    if (teacherId === null) return;
    const roomName = window.prompt("Salle", entry.roomName || entry.room || "");
    if (roomName === null) return;
    const selectedModule = modules.find((module) => String(module.id) === String(moduleId));
    const selectedTeacher = [...schoolTeachers, ...users].find((teacher) => String(teacher.id) === String(teacherId));
    const updatedEntry = {
      ...entry,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      moduleId: moduleId || null,
      moduleName: selectedModule?.name || entry.moduleName,
      teacherId: teacherId || null,
      teacherName: selectedTeacher ? userDisplayName(selectedTeacher) : entry.teacherName,
      roomName,
    };
    if (scheduleHasUnsavedChanges) {
      setSchedulePreviewEntries((items) => items.map((item) => item === entry ? updatedEntry : item));
      setScheduleHasUnsavedChanges(true);
      return;
    }
    if (!entry.id || !scheduleId) {
      setScheduleEntries((items) => items.map((item) => item === entry ? updatedEntry : item));
      return;
    }
    const response = await apiFetch(`/api/schedules/${scheduleId}/items/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify(updatedEntry),
    });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Créneau modifié" : "Impossible de modifier le créneau"));
    if (data.success) {
      await loadScheduleForClass(scheduleForm.classId, scheduleWeekStart);
      await loadSavedSchedules();
    }
  };

  const deleteScheduleEntry = async (entry) => {
    if (!window.confirm("Supprimer ce créneau ?")) return;
    if (scheduleHasUnsavedChanges) {
      setSchedulePreviewEntries((items) => items.filter((item) => item !== entry));
      setScheduleHasUnsavedChanges(true);
      return;
    }
    if (!entry.id || !scheduleId) {
      setScheduleEntries((items) => items.filter((item) => item !== entry));
      return;
    }
    const response = await apiFetch(`/api/schedules/${scheduleId}/items/${entry.id}`, { method: "DELETE" });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Créneau supprimé" : "Impossible de supprimer le créneau"));
    if (data.success) {
      await loadScheduleForClass(scheduleForm.classId, scheduleWeekStart);
      await loadSavedSchedules();
    }
  };

  const deleteCurrentSchedule = async () => {
    const activeEntries = scheduleHasUnsavedChanges ? schedulePreviewEntries : scheduleEntries;
    if (!activeEntries.length) return;
    if (!window.confirm("Supprimer tout l'emploi du temps de cette classe ?")) return;
    if (scheduleHasUnsavedChanges) {
      setSchedulePreviewEntries([]);
      setScheduleHasUnsavedChanges(false);
      return;
    }
    if (!scheduleId) {
      setScheduleEntries([]);
      setScheduleHasUnsavedChanges(false);
      return;
    }
    const response = await apiFetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Emploi du temps supprimé" : "Impossible de supprimer l'emploi du temps"));
    if (data.success) {
      await loadScheduleForClass(scheduleForm.classId, scheduleWeekStart);
      await loadSavedSchedules();
    }
  };

  const openSavedSchedule = async (schedule, mode = "view") => {
    setScheduleForm({
      schoolId: schedule.schoolId || "",
      classId: schedule.classId || "",
    });
    setScheduleWeekStart(scheduleWeekStartFromSchedule(schedule));
    await loadScheduleForClass(schedule.classId, scheduleWeekStartFromSchedule(schedule));
    setMessage(mode === "edit" ? "Emploi du temps chargé en mode modification" : "Emploi du temps chargé");
  };

  const deleteSavedSchedule = async (schedule) => {
    if (!schedule?.id) return;
    if (!window.confirm(`Supprimer l'emploi du temps de ${schedule.className || "cette classe"} ?`)) return;
    const response = await apiFetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Emploi du temps supprimé" : "Impossible de supprimer l'emploi du temps"));
    if (data.success) {
      if (String(scheduleForm.classId) === String(schedule.classId)) {
        setScheduleEntries([]);
        setSchedulePreviewEntries([]);
        setScheduleId(null);
        setScheduleHasUnsavedChanges(false);
      }
      await loadSavedSchedules();
    }
  };

  async function loadAiProfile() {
    const response = await apiFetch("/api/ai-learning-profile");
    const data = await response.json();
    if (data.success) {
      setAiProfile(data.profile);
      navigate("/platform#ai", { replace: true });
    } else {
      setMessage(data.message);
    }
  }

  const assignDirector = async (event) => {
    event.preventDefault();
    const response = await apiFetch(`/api/admin/schools/${directorAssignment.schoolId}/director`, {
      method: "PATCH",
      body: JSON.stringify({ directorId: directorAssignment.directorId }),
    });
    const data = await response.json();
    setMessage(data.message);
    if (data.success) loadOverview();
  };

  const assignTeacher = async (event) => {
    event.preventDefault();
    const isEditingAssignment = Boolean(editingAssignmentId);
    const response = await apiFetch(
      isEditingAssignment ? `/api/director/teacher-assignments/${editingAssignmentId}` : "/api/director/teacher-assignments",
      {
        method: isEditingAssignment ? "PATCH" : "POST",
        body: JSON.stringify(teacherAssignment),
      },
    );
    const data = await response.json();
    setMessage(data.message);
    if (data.success) {
      setEditingAssignmentId(null);
      setTeacherAssignment({ teacherId: "", classIds: [], moduleIds: [] });
      await Promise.all([loadOverview(), loadPlatform()]);
    }
  };

  const editTeacherAssignment = (assignment) => {
    setEditingAssignmentId(assignment.id);
    setTeacherAssignment({
      teacherId: assignment.teacherId,
      classIds: [assignment.classId],
      moduleIds: [assignment.moduleId],
    });
  };

  const cancelTeacherAssignmentEdit = () => {
    setEditingAssignmentId(null);
    setTeacherAssignment({ teacherId: "", classIds: [], moduleIds: [] });
  };

  const deleteTeacherAssignment = async (assignment) => {
    if (!window.confirm(`Supprimer l'affectation de ${assignment.teacherName} ?`)) return;
    const response = await apiFetch(`/api/director/teacher-assignments/${assignment.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    setMessage(data.message);
    if (data.success) {
      if (String(editingAssignmentId) === String(assignment.id)) {
        cancelTeacherAssignmentEdit();
      }
      await Promise.all([loadOverview(), loadPlatform()]);
    }
  };

  const assignStudent = async (event) => {
    event.preventDefault();
    const isEditingStudentAssignment = Boolean(editingStudentAssignmentId);
    const response = await apiFetch(
      isEditingStudentAssignment ? `/api/director/student-assignments/${editingStudentAssignmentId}` : "/api/director/student-assignments",
      {
        method: isEditingStudentAssignment ? "PATCH" : "POST",
        body: JSON.stringify(studentAssignment),
      },
    );
    const data = await response.json();
    setMessage(data.message);
    if (data.success) {
      setEditingStudentAssignmentId(null);
      setStudentAssignment({ studentId: "", classId: "", moduleIds: [] });
      await Promise.all([loadOverview(), loadPlatform()]);
    }
  };

  const editStudentAssignment = (assignment) => {
    setEditingStudentAssignmentId(assignment.id);
    setStudentAssignment({
      studentId: assignment.studentId,
      classId: assignment.classId,
      moduleIds: assignment.moduleIds || [],
    });
  };

  const cancelStudentAssignmentEdit = () => {
    setEditingStudentAssignmentId(null);
    setStudentAssignment({ studentId: "", classId: "", moduleIds: [] });
  };

  const deleteStudentAssignment = async (assignment) => {
    if (!window.confirm(`Supprimer l'affectation de ${assignment.studentName} ?`)) return;
    const response = await apiFetch(`/api/director/student-assignments/${assignment.id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    setMessage(data.message);
    if (data.success) {
      if (String(editingStudentAssignmentId) === String(assignment.id)) {
        cancelStudentAssignmentEdit();
      }
      await Promise.all([loadOverview(), loadPlatform()]);
    }
  };

  const decideRequest = async (requestItem, status) => {
    const response = await apiFetch(`/api/validation-requests/${requestItem.type}/${requestItem.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    setMessage(data.message);
    if (data.success) loadOverview();
  };

  const viewProfile = async (userId) => {
    const response = await apiFetch(`/api/users/${userId}/profile`);
    const data = await response.json();
    setSelectedProfile(data.success ? data.profile : null);
    if (!data.success) setMessage(data.message);
  };

  const closeAddUserPanel = () => {
    setAddUserOpen(false);
    setAddUserForm({ name: "", email: "", password: "", role: "", accessLevel: "", schoolId: "", status: "active" });
  };

  const submitAddUserPanel = async (event) => {
    event.preventDefault();
    const response = await apiFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(addUserForm),
    });
    const data = await response.json();
    setMessage(data.message || (data.success ? "Utilisateur créé" : "Impossible de créer l'utilisateur"));
    if (data.success) {
      closeAddUserPanel();
      await Promise.all([loadOverview(), loadPlatform()]);
    }
  };

  const closeAddSchoolPanel = () => {
    setAddSchoolOpen(false);
    setAddSchoolForm(emptySchool);
  };

  const submitAddSchoolPanel = (event) => {
    event.preventDefault();
    closeAddSchoolPanel();
  };

  const editClass = async (item) => {
    const name = window.prompt("Nom de la classe", item.name);
    if (!name) return;
    const response = await apiFetch(`/api/classes/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    const data = await response.json(); setMessage(data.message); if (data.success) loadPlatform();
  };

  const archiveClass = async (item) => {
    if (!window.confirm(`Archiver ${item.name} ?`)) return;
    const response = await apiFetch(`/api/classes/${item.id}`, { method: "DELETE" });
    const data = await response.json(); setMessage(data.message); if (data.success) loadPlatform();
  };

  const editModule = async (item) => {
    const name = window.prompt("Nom du module", item.name);
    if (!name) return;
    const response = await apiFetch(`/api/modules/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    const data = await response.json(); setMessage(data.message); if (data.success) loadPlatform();
  };

  const deleteModule = async (item) => {
    if (!window.confirm(`Supprimer ${item.name} ?`)) return;
    const response = await apiFetch(`/api/modules/${item.id}`, { method: "DELETE" });
    const data = await response.json(); setMessage(data.message); if (data.success) loadPlatform();
  };

  const requestTeacherSchool = async (event) => {
    event.preventDefault();
    const schoolId = event.currentTarget.elements.schoolId.value;
    const response = await apiFetch("/api/teacher-school-requests", {
      method: "POST",
      body: JSON.stringify({ schoolId }),
    });
    const data = await response.json();
    setMessage(data.success ? "Demande envoyée à la direction" : data.message);
  };

  const submitReport = async (payload) => {
    try {
      const response = await apiFetch("/api/reports", { method: "POST", body: JSON.stringify(payload) });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) {
        loadOverview();
        return true;
      }
    } catch {
      setMessage("Impossible d'enregistrer le rapport pour le moment.");
    }
    return false;
  };

  const viewReport = (report) => {
    const details = [
      `Titre: ${report.title || "Non renseigné"}`,
      `Type: ${report.type || report.reportType || report.target_type || report.targetType || "Non renseigné"}`,
      `Cible: ${report.targetName || report.target_name || report.target || report.targetId || "Plateforme générale"}`,
      `Statut: ${report.status || "open"}`,
      `Priorité: ${report.priority || report.priorite || "medium"}`,
      "",
      report.body || report.description || "Aucune description.",
    ].join("\n");
    window.alert(details);
  };

  const editReport = async (report) => {
    const title = window.prompt("Modifier le titre du rapport", report.title || "");
    if (title === null) return;
    const body = window.prompt("Modifier la description", report.body || report.description || "");
    if (body === null) return;
    const priority = window.prompt("Priorité (low, medium, high)", report.priority || report.priorite || "medium");
    if (priority === null) return;
    try {
      const response = await apiFetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body, priority }),
      });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) loadOverview();
    } catch {
      setMessage("Impossible de modifier le rapport pour le moment.");
    }
  };

  const deleteReport = async (report) => {
    if (!window.confirm(`Supprimer le rapport "${report.title || "sans titre"}" ?`)) return;
    try {
      const response = await apiFetch(`/api/reports/${report.id}`, { method: "DELETE" });
      const data = await response.json();
      setMessage(data.message);
      if (data.success) loadOverview();
    } catch {
      setMessage("Impossible de supprimer le rapport pour le moment.");
    }
  };

  const directorMetrics = [
    { key: "schools", label: t.schools, value: dashboard?.stats?.schools ?? schools.length, tone: "blue", icon: "school" },
    { key: "classes", label: t.classes, value: dashboard?.stats?.classes ?? classes.length, tone: "green", icon: "classes" },
    { key: "users", label: "Utilisateurs", value: Number(dashboard?.stats?.students || 0) + Number(dashboard?.stats?.teachers || schoolTeachers.length) + 1, tone: "purple", icon: "users" },
    { key: "modules", label: t.modules, value: dashboard?.stats?.modules ?? modules.length, tone: "yellow", icon: "modules" },
    { key: "courses", label: t.courses, value: dashboard?.stats?.courses ?? 0, tone: "red", icon: "courses" },
  ];
  const distribution = dashboard?.analytics?.distribution || { students: 0, teachers: schoolTeachers.length, directors: 1 };
  const distributionTotal = Math.max(1, Number(distribution.students || 0) + Number(distribution.teachers || 0) + Number(distribution.directors || 0));
  const studentShare = (Number(distribution.students || 0) / distributionTotal) * 100;
  const teacherShare = (Number(distribution.teachers || 0) / distributionTotal) * 100;
  const contentStats = dashboard?.analytics?.content || {};
  const distributionItems = [
    { key: "students", label: "Etudiants", value: Number(distribution.students || 0), tone: "blue" },
    { key: "teachers", label: "Enseignants", value: Number(distribution.teachers || 0), tone: "green" },
    { key: "directors", label: "Direction", value: Number(distribution.directors || 0), tone: "purple" },
  ];
  const activeUserSummary = [
    { key: "teachers", label: "Enseignants actifs", value: Number(distribution.teachers || 0), tone: "green" },
    { key: "students", label: "Étudiants actifs", value: Number(distribution.students || 0), tone: "blue" },
  ];
  const contentItems = [
    { key: "classes", label: t.classes, value: Number(contentStats.classes || 0) },
    { key: "modules", label: t.modules, value: Number(contentStats.modules || 0) },
    { key: "courses", label: t.courses, value: Number(contentStats.courses || 0) },
    { key: "quizzes", label: t.quizzes, value: Number(contentStats.quizzes || 0) },
  ];
  const recentActivities = dashboard?.analytics?.recentActivities || [];
  const pendingTeacherRequests = Number(dashboard?.stats?.pendingTeacherRequests || 0);
  const pendingStudentRequests = Number(dashboard?.stats?.pendingStudentRequests || 0);
  const pageMeta = {
    overview: role === "general_admin"
      ? ["Espace administrateur", "Gérez tous les aspects de la plateforme Learnix AI"]
      : [role === "school_director" ? `Bonjour, ${user.name || "Directeur"}` : t.platformTitle, role === "school_director" ? "Voici un aperçu global de votre établissement." : t.platformSubtitle],
    schools: ["Créer une demande d'école", "Remplissez les informations pour soumettre une nouvelle demande d'école."],
    requests: ["Demandes de validation", "Consultez et gérez les demandes en attente de validation."],
    assignments: ["Affectations", "Affectez des enseignants aux classes et modules."],
    studentAssignments: ["Affectation des étudiants", "Affectez des étudiants aux classes et modules."],
    attachmentRequests: ["Demandes de rattachement", "Consultez, acceptez ou refusez les demandes de rattachement."],
    classes: ["Gestion des classes", "Gérez vos classes, ajoutez, modifiez ou archivez."],
    modules: ["Gestion des modules", "Créez et gérez les modules de votre établissement."],
    schedule: ["Générateur d'emploi du temps", "Générez automatiquement l'emploi du temps de vos classes."],
    reports: ["Rapports et signalements", "Consultez les rapports et signalez un problème."],
    audit: ["Journal d'activité", "Consultez les opérations récentes de la plateforme."],
    users: ["Gestion des utilisateurs", "Consultez et gérez les comptes de la plateforme."],
    ai: ["Profil d'apprentissage IA", "Aperçu des performances et recommandations basées sur l'IA."],
  };
  const [pageTitle, pageSubtitle] = pageMeta[activeTab] || pageMeta.overview;
  const filteredRequests = validationRequests.filter((item) => {
    const createdAt = new Date(item.createdAt || 0);
    const cutoff = appliedRequestFilters.cutoff ? new Date(appliedRequestFilters.cutoff) : null;
    const searchable = `${item.userName || ""} ${item.targetName || ""} ${item.message || ""}`.toLowerCase();
    const matchesSearch = searchable.includes(appliedRequestFilters.search.toLowerCase());
    const matchesStatus = appliedRequestFilters.status === "all" || (item.status || "pending") === appliedRequestFilters.status;
    const matchesType = appliedRequestFilters.type === "all" || item.type === appliedRequestFilters.type;
    const matchesSchool = appliedRequestFilters.school === "all" || String(item.schoolId || item.targetId || "") === appliedRequestFilters.school || searchable.includes((schools.find((school) => String(school.id) === appliedRequestFilters.school)?.name || "").toLowerCase());
    const matchesClass = appliedRequestFilters.classId === "all" || String(item.classId || item.targetId || "") === appliedRequestFilters.classId || searchable.includes((classes.find((entry) => String(entry.id) === appliedRequestFilters.classId)?.name || "").toLowerCase());
    return matchesSearch && matchesStatus && matchesType && matchesSchool && matchesClass && (!cutoff || createdAt >= cutoff);
  }).sort((left, right) => {
    const difference = new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    return appliedRequestFilters.sort === "oldest" ? -difference : difference;
  });
  const adminAttachmentRequests = [...validationRequests].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  const adminAttachmentStats = [
    { label: "Total demandes", value: adminAttachmentRequests.length, detail: "Toutes les demandes", tone: "blue", icon: "requests" },
    { label: "En attente", value: adminAttachmentRequests.filter((item) => attachmentRequestStatusMeta(item).tone === "pending").length, detail: "À traiter", tone: "yellow", icon: "calendar" },
    { label: "Approuvées", value: adminAttachmentRequests.filter((item) => attachmentRequestStatusMeta(item).tone === "approved").length, detail: "Validées", tone: "green", icon: "activity" },
    { label: "Refusées", value: adminAttachmentRequests.filter((item) => attachmentRequestStatusMeta(item).tone === "rejected").length, detail: "Clôturées", tone: "red", icon: "reports" },
  ];
  const auditUserOptions = Array.from(new Set(auditLogs.map(auditUserLabel).filter(Boolean)));
  const auditActionOptions = Array.from(new Set(auditLogs.map(auditActionLabel).filter(Boolean)));
  const filteredAuditLogs = auditLogs.filter((item) => {
    const createdAt = item.createdAt || item.created_at || item.date || "";
    const createdDate = createdAt ? new Date(createdAt) : null;
    const dateValue = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toISOString().slice(0, 10) : "";
    const searchable = [
      auditUserLabel(item),
      auditActionLabel(item),
      auditEntityLabel(item),
      auditDescriptionLabel(item),
      auditIpLabel(item),
      auditStatusMeta(item).label,
      formatAdminDate(createdAt),
    ].join(" ").toLowerCase();

    return searchable.includes(auditSearch.toLowerCase())
      && (auditUserFilter === "all" || auditUserLabel(item) === auditUserFilter)
      && (auditActionFilter === "all" || auditActionLabel(item) === auditActionFilter)
      && (!auditDateFilter || dateValue === auditDateFilter);
  });
  const auditPageSize = 8;
  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
  const currentAuditPage = Math.min(auditPage, auditTotalPages);
  const paginatedAuditLogs = filteredAuditLogs.slice((currentAuditPage - 1) * auditPageSize, currentAuditPage * auditPageSize);
  const auditPaginationItems = Array.from({ length: auditTotalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === auditTotalPages || Math.abs(page - currentAuditPage) <= 1);
  const exportVisibleAuditLogs = () => {
    exportCsv("journal-audit.csv", filteredAuditLogs.map((item) => ({
      Date: formatAdminDate(item.createdAt || item.created_at || item.date),
      Utilisateur: auditUserLabel(item),
      Action: auditActionLabel(item),
      Entite: auditEntityLabel(item),
      Description: auditDescriptionLabel(item),
      IP: auditIpLabel(item),
      Statut: auditStatusMeta(item).label,
    })));
  };
  const resolvedDurations = reports
    .map((item) => {
      if (item.resolutionHours || item.resolution_time_hours) return Number(item.resolutionHours || item.resolution_time_hours);
      const start = new Date(item.createdAt || item.created_at || 0);
      const end = new Date(item.resolvedAt || item.resolved_at || item.closedAt || item.closed_at || 0);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
      return (end - start) / 3600000;
    })
    .filter((value) => Number.isFinite(value));
  const averageResolutionHours = resolvedDurations.length ? resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length : null;
  const averageResolutionLabel = averageResolutionHours === null
    ? "—"
    : averageResolutionHours >= 24
      ? `${(averageResolutionHours / 24).toFixed(1)} jours`
      : `${averageResolutionHours.toFixed(1)} h`;
  const adminTeachers = users.filter((entry) => ["teacher", "guest_teacher"].includes(normalizeRole(entry.role || entry.level)));
  const teacherAssignedModuleCount = (teacher) => {
    const teacherKeys = [teacher.id, teacher.userId, teacher.email, userDisplayName(teacher)]
      .filter(Boolean)
      .map(String);
    const assignedModules = new Set();

    assignments.forEach((assignment) => {
      const assignmentTeacherKeys = [
        assignment.teacherId,
        assignment.teacher_id,
        assignment.teacher?.id,
        assignment.teacherEmail,
        assignment.teacher_email,
        assignment.teacher?.email,
        assignment.teacherName,
        assignment.teacher_name,
        assignment.teacher?.name,
      ].filter(Boolean).map(String);
      if (!teacherKeys.some((key) => assignmentTeacherKeys.includes(key))) return;

      const moduleValues = [
        ...(Array.isArray(assignment.moduleIds) ? assignment.moduleIds : []),
        ...(Array.isArray(assignment.modules) ? assignment.modules.map((module) => module.id || module.name) : []),
        assignment.moduleId,
        assignment.module_id,
        assignment.moduleName,
        assignment.module_name,
      ].filter(Boolean);
      moduleValues.forEach((value) => assignedModules.add(String(value)));
    });

    return assignedModules.size || teacherModuleCount(teacher);
  };
  const teacherSchoolOptions = Array.from(new Set(adminTeachers.map((teacher) => teacherSchoolLabel(teacher)).filter((name) => name && name !== "Non renseigné")));
  const filteredAdminTeachers = adminTeachers.filter((teacher) => {
    const schoolName = teacherSchoolLabel(teacher);
    const searchable = `${userDisplayName(teacher)} ${teacher.email || ""} ${teacher.subject || ""} ${teacher.specialty || ""} ${teacherCodeLabel(teacher)} ${schoolName}`.toLowerCase();
    return searchable.includes(teacherSearch.toLowerCase()) && (teacherSchoolFilter === "all" || schoolName === teacherSchoolFilter);
  });
  const adminStudents = users.filter((entry) => ["student", "guest_student"].includes(normalizeRole(entry.role || entry.level)));
  const studentSchoolOptions = Array.from(new Set(adminStudents.map((student) => studentSchoolLabel(student)).filter((name) => name && name !== "Non renseigné")));
  const filteredAdminStudents = adminStudents.filter((student) => {
    const schoolName = studentSchoolLabel(student);
    const searchable = `${userDisplayName(student)} ${student.email || ""} ${studentClassLabel(student)} ${studentCodeLabel(student)} ${schoolName}`.toLowerCase();
    return searchable.includes(studentSearch.toLowerCase()) && (studentSchoolFilter === "all" || schoolName === studentSchoolFilter);
  });
  const adminAssignments = assignments.map((assignment) => ({
    ...assignment,
    teacher: { id: assignment.teacherId, name: assignment.teacherName, email: assignment.teacherEmail, avatar_url: assignment.teacherAvatarUrl || assignment.teacher_avatar_url },
    teacherCode: assignment.teacherId || "Non renseigné",
    status: userStatusMeta(assignment),
    period: assignment.createdAt ? new Date(assignment.createdAt).getFullYear() : "En cours",
  }));
  const assignmentSchoolOptions = Array.from(new Set(adminAssignments.map((item) => item.schoolName).filter((name) => name && name !== "Non renseigné")));
  const assignmentClassOptions = Array.from(new Set(adminAssignments.map((item) => item.className).filter((name) => name && name !== "Non renseigné")));
  const assignmentModuleOptions = Array.from(new Set(adminAssignments.map((item) => item.moduleName).filter((name) => name && name !== "Non renseigné")));
  const filteredAdminAssignments = adminAssignments.filter((item) => {
    const searchable = `${item.teacherName} ${item.teacherCode} ${item.moduleName} ${item.className} ${item.schoolName} ${item.period}`.toLowerCase();
    return searchable.includes(assignmentSearch.toLowerCase())
      && (assignmentSchoolFilter === "all" || item.schoolName === assignmentSchoolFilter)
      && (assignmentClassFilter === "all" || item.className === assignmentClassFilter)
      && (assignmentModuleFilter === "all" || item.moduleName === assignmentModuleFilter);
  });
  const selectedStudentClassId = studentAssignment.classId;
  const studentAssignmentModuleOptions = selectedStudentClassId
    ? modules.filter((module) => (module.classIds || []).map(String).includes(String(selectedStudentClassId)))
    : modules;
  const studentAssignmentRows = studentAssignments.map((assignment) => ({
    ...assignment,
    student: { id: assignment.studentId, name: assignment.studentName, email: assignment.studentEmail, avatar_url: assignment.studentAvatarUrl || assignment.student_avatar_url },
    moduleNames: assignment.moduleNames || "",
    status: userStatusMeta(assignment),
  }));
  const scheduleSlots = [
    ["08:00", "09:00"],
    ["09:00", "10:00"],
    ["10:00", "11:00"],
    ["11:00", "12:00"],
    ["12:00", "13:00"],
    ["13:00", "14:00"],
    ["14:00", "15:00"],
    ["15:00", "16:00"],
    ["16:00", "17:00"],
  ];
  const displayedScheduleEntries = scheduleHasUnsavedChanges ? schedulePreviewEntries : scheduleEntries;
  const directorScheduleDays = buildScheduleWeekDays(scheduleWeekStart);
  const directorScheduleWeekLabel = formatScheduleWeekRange(scheduleWeekStart);
  const scheduleWeekDayLabel = (dayOfWeek) => scheduleDayLabel(dayOfWeek, scheduleWeekStart);
  const scheduleRoomLabel = (entry) => entry?.roomName || entry?.room || "Salle non définie";
  const scheduleModuleTone = (entry) => {
    const name = String(entry?.moduleName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (name.includes("algorithmique")) return "module-blue";
    if (name.includes("base de donnees") || name.includes("database")) return "module-green";
    if (name.includes("math")) return "module-yellow";
    if (name.includes("reseau")) return "module-purple";
    if (name.includes("genie logiciel") || name.includes("logiciel")) return "module-orange";
    if (name.includes("intelligence artificielle") || name.includes("ia")) return "module-pink";
    const tones = ["module-blue", "module-green", "module-yellow", "module-purple", "module-orange", "module-pink"];
    return tones[Math.abs(Number(entry?.moduleId || 0)) % tones.length];
  };
  const formatSavedScheduleDate = (value) => {
    if (!value) return "Non renseignée";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Non renseignée";
    return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const teacherNameById = new Map([...users, ...schoolTeachers].map((teacher) => [String(teacher.id), userDisplayName(teacher)]));
  const adminScheduleWeekStartIso = scheduleWeekStartIso(adminSchedulePeriodStart);
  const allSavedScheduleEntries = savedSchedules.flatMap((schedule) => (schedule.entries || []).map((entry) => ({
    ...entry,
    scheduleId: schedule.id,
    schoolId: schedule.schoolId,
    schoolName: schedule.schoolName,
    classId: entry.classId || schedule.classId,
    className: entry.className || schedule.className,
    weekStartDate: scheduleWeekStartFromSchedule(schedule),
  })));
  const adminScheduleTeacherOptions = Array.from(new Map(allSavedScheduleEntries
    .filter((entry) => entry.teacherId || entry.teacherName)
    .map((entry) => [String(entry.teacherId || entry.teacherName), {
      id: entry.teacherId || entry.teacherName,
      name: teacherNameById.get(String(entry.teacherId)) || entry.teacherName || "Enseignant non renseigné",
    }])).values());
  const filteredAdminSchedules = savedSchedules.filter((schedule) => (
    scheduleWeekStartFromSchedule(schedule) === adminScheduleWeekStartIso
    && (adminScheduleClassFilter === "all" || String(schedule.classId || "") === String(adminScheduleClassFilter))
    && (adminScheduleSchoolFilter === "all" || String(schedule.schoolId || "") === String(adminScheduleSchoolFilter))
    && (adminScheduleTeacherFilter === "all" || (schedule.entries || []).some((entry) => String(entry.teacherId || "") === String(adminScheduleTeacherFilter)))
  ));
  const schedulePeriodLabel = formatScheduleWeekRange(adminScheduleWeekStartIso);
  const scheduleDays = buildScheduleWeekDays(adminScheduleWeekStartIso);
  const filteredScheduleEntries = allSavedScheduleEntries.filter((entry) => (
    entry.weekStartDate === adminScheduleWeekStartIso
    && (adminScheduleClassFilter === "all" || String(entry.classId || "") === String(adminScheduleClassFilter))
    && (adminScheduleSchoolFilter === "all" || String(entry.schoolId || "") === String(adminScheduleSchoolFilter))
    && (adminScheduleTeacherFilter === "all" || String(entry.teacherId || "") === String(adminScheduleTeacherFilter))
  ));
  const adminScheduleStats = {
    schedules: filteredAdminSchedules.length,
    classes: new Set(filteredScheduleEntries.map((entry) => entry.classId).filter(Boolean)).size,
    slots: filteredScheduleEntries.length,
    teachers: new Set(filteredScheduleEntries.map((entry) => entry.teacherId || entry.teacherName).filter(Boolean)).size,
    rooms: new Set(filteredScheduleEntries.map((entry) => entry.roomName || entry.room).filter(Boolean)).size,
  };
  const scheduleEntryFor = (day, startTime, endTime) => filteredScheduleEntries.find((entry) => (
    Number(entry.dayOfWeek) === day.dayOfWeek
    && String(entry.startTime || "").slice(0, 5) === startTime
    && String(entry.endTime || "").slice(0, 5) === endTime
  ));
  const scheduleTeachersCount = new Set(filteredScheduleEntries.map((entry) => (
    teacherNameById.get(String(entry.teacherId)) || entry.teacherName
  )).filter(Boolean)).size;
  const scheduleRoomsCount = new Set(filteredScheduleEntries.map((entry) => entry.roomName || entry.room).filter(Boolean)).size;
  const exportVisibleSchedule = () => {
    if (!filteredScheduleEntries.length) {
      setMessage("Aucune donnée à exporter");
      return;
    }

    exportCsv("emplois-du-temps.csv", filteredScheduleEntries.map((entry) => ({
      Jour: scheduleDays.find((day) => day.dayOfWeek === Number(entry.dayOfWeek))?.fullDate || entry.dayOfWeek || "",
      Heure: `${entry.startTime || ""}-${entry.endTime || ""}`,
      Module: entry.moduleName || `Module ${entry.moduleId || ""}`,
      Enseignant: teacherNameById.get(String(entry.teacherId)) || entry.teacherName || "Non renseigné",
      Salle: entry.roomName || entry.room || "Non renseignée",
    })));
  };
  const filteredTeachers = schoolTeachers.filter((teacher) => `${teacher.name || ""} ${teacher.email || ""} ${teacher.subject || ""}`.toLowerCase().includes(teacherSearch.toLowerCase()));
  const filteredClasses = classes.filter((item) => `${item.name || ""} ${item.levelName || ""} ${item.academicYear || ""}`.toLowerCase().includes(classSearch.toLowerCase()));
  const approvedSchoolOptions = schools.filter((school) => ["approved", "active", "approuvé", "approuve"].includes(String(school.status || "approved").toLowerCase()));
  const moduleSchoolOptions = Array.from(new Set(modules.map((item) => item.schoolName || item.establishmentName).filter(Boolean)));
  const filteredModules = modules.filter((item) => {
    const schoolName = item.schoolName || item.establishmentName || "";
    const searchable = `${item.name || ""} ${moduleCodeLabel(item)} ${item.levelName || ""} ${item.description || ""} ${schoolName} ${moduleClassLabel(item)}`.toLowerCase();
    return searchable.includes(moduleSearch.toLowerCase()) && (moduleSchoolFilter === "all" || schoolName === moduleSchoolFilter);
  });

  return (
    <LearnixLayout
      className={`platform-page role-${role} platform-view-${activeTab} ${activeTab === "studentAssignments" ? "platform-view-assignments" : ""}`}
      title={["classes", "modules", "teachers", "students", "affectations", "scheduleAdmin", "attachmentRequests", "reports", "audit"].includes(activeTab) ? "" : pageTitle}
      subtitle={["classes", "modules", "teachers", "students", "affectations", "scheduleAdmin", "attachmentRequests", "reports", "audit"].includes(activeTab) ? "" : pageSubtitle}
      panelLabel={role === "general_admin" ? t.adminPanel : t.platformPanel}
      profileUser={user}
      hidePremiumCard
    >
      {!["general_admin", "school_director"].includes(role) && <Tabs
        items={tabItems}
        active={activeTab}
        onChange={(tab) => {
          navigate(`/platform#${tab}`, { replace: true });
          if (tab === "ai") {
            loadAiProfile();
          }
        }}
      />}

      {message && <AlertMessage>{message}</AlertMessage>}

      {activeTab === "overview" && (
        <section className="platform-overview">
          {loadingOverview && <LoadingSpinner />}
          {role === "school_director" && <>
            <div className="reference-stat-grid">
              {directorMetrics.map((metric) => (
                <button className={`reference-stat-card tone-${metric.tone} ${selectedMetric === metric.key ? "is-selected" : ""}`} key={metric.label} type="button" onClick={() => setSelectedMetric(metric.key)}>
                  <span className="reference-stat-icon"><DashboardIcon type={metric.icon} /></span>
                  <div><small>{metric.label}</small><strong>{metric.value}</strong><p>Total {String(metric.label).toLowerCase()}</p></div>
                  <em className="reference-real-growth">{Number(dashboard?.statGrowth?.[metric.key] || 0) >= 0 ? "↑" : "↓"} {Math.abs(Number(dashboard?.statGrowth?.[metric.key] || 0))}%</em>
                </button>
              ))}
            </div>
            <p className="reference-metric-context">Vue sélectionnée : <strong>{directorMetrics.find((item) => item.key === selectedMetric)?.label}</strong>. Données synchronisées avec votre établissement.</p>
            <div className="reference-analytics-grid">
              <article className="reference-panel reference-activity-chart">
                <div className="reference-panel-heading"><h2>Activité des utilisateurs</h2></div>
                <div className="reference-activity-summary" aria-label="Utilisateurs actifs actuels">
                  {activeUserSummary.map((item) => (
                    <article className={`reference-activity-total is-${item.tone}`} key={item.key}>
                      <span aria-hidden="true" />
                      <div>
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                        <p>Donnée réelle actuelle</p>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
              <article className="reference-panel reference-distribution">
                <h2>Répartition des utilisateurs</h2>
                <div className="reference-donut-wrap">
                  <button className={`reference-donut is-${selectedDistribution}`} type="button" aria-label="User distribution" style={{ background: `conic-gradient(var(--lx-blue) 0 ${studentShare}%, var(--lx-green) ${studentShare}% ${studentShare + teacherShare}%, var(--lx-purple) ${studentShare + teacherShare}% 100%)` }} onClick={() => setSelectedDistribution((current) => current === "students" ? "teachers" : current === "teachers" ? "directors" : "students")}>
                    <span><strong>{distributionItems.find((item) => item.key === selectedDistribution)?.value}</strong><small>{distributionItems.find((item) => item.key === selectedDistribution)?.label}</small></span>
                  </button>
                  <div className="reference-donut-legend">
                    {distributionItems.map((item) => <button className={`is-${item.tone} ${selectedDistribution === item.key ? "active" : ""}`} type="button" key={item.key} onMouseEnter={() => setSelectedDistribution(item.key)} onFocus={() => setSelectedDistribution(item.key)} onClick={() => setSelectedDistribution(item.key)}>{item.label}<b>{item.value}</b></button>)}
                  </div>
                </div>
              </article>
            </div>
            <div className="reference-bottom-grid">
              <article className="reference-panel reference-recent-activity">
                <h2>Dernières activités</h2>
                <div>
                  {recentActivities.map((item, index) => (
                    <p key={`${item.title}-${index}`}><i className={`tone-${item.tone}`}>{index + 1}</i><span><strong>{item.title}</strong><small>{item.detail}</small></span></p>
                  ))}
                  {!recentActivities.length && <p className="reference-empty">Aucune activité récente</p>}
                </div>
              </article>
              <article className="reference-panel reference-content-stats">
                <h2>Statistiques des contenus</h2>
                <div className="reference-bars">
                  {contentItems.map((item) => (
                    <button className={selectedContent === item.key ? "active" : ""} type="button" key={item.label} onMouseEnter={() => setSelectedContent(item.key)} onFocus={() => setSelectedContent(item.key)} onClick={() => setSelectedContent(item.key)}><span style={{ height: `${Math.max(8, (Number(item.value || 0) / Math.max(...Object.values(contentStats).map(Number), 1)) * 100)}%` }} /><b>{item.value}</b><small>{item.label}</small></button>
                  ))}
                </div>
              </article>
              <article className="reference-panel reference-pending">
                <h2>Demandes en attente</h2>
                <button type="button" onClick={() => navigate("/platform#requests")}><i className="tone-yellow">T</i><span><strong>Validation enseignant</strong><small>{pendingTeacherRequests} demande(s)</small></span><b>›</b></button>
                <button type="button" onClick={() => navigate("/platform#requests")}><i className="tone-blue">E</i><span><strong>Validation étudiant</strong><small>{pendingStudentRequests} demande(s)</small></span><b>›</b></button>
                <button type="button" onClick={() => navigate("/platform#schools")}><i className="tone-green">S</i><span><strong>Validation école</strong><small>{schools.filter((item) => item.status === "pending").length} demande(s)</small></span><b>›</b></button>
              </article>
            </div>
          </>}
          {role === "general_admin" && (
            <AdminDashboard
              users={users}
              schools={schools}
              classes={classes}
              modules={modules}
              directors={directors}
              unassignedSchools={unassignedSchools}
              reports={reports}
              auditLogs={auditLogs}
              dashboard={dashboard}
              navigate={navigate}
              viewProfile={viewProfile}
            />
          )}
          {role !== "general_admin" && role !== "school_director" && <div className="platform-stat-grid">
            {role === "guest_teacher" ? <>
              <StatCard tone="blue" label={t.schools} value={schools.length} />
              <StatCard tone="green" label={t.classes} value={classes.length} />
              <StatCard tone="yellow" label={t.modules} value={modules.length} />
              <StatCard tone="red" label={t.reports} value={dashboard?.stats?.reports ?? reports.length} />
            </> : <>
              {dashboard?.stats?.schools > 0 && <StatCard tone="blue" label={t.schools} value={dashboard.stats.schools} />}
              {dashboard?.stats?.classes > 0 && <StatCard tone="green" label={t.classes} value={dashboard.stats.classes} />}
              {dashboard?.stats?.modules > 0 && <StatCard tone="yellow" label={t.modules} value={dashboard.stats.modules} />}
              {dashboard?.stats?.courses > 0 && <StatCard tone="orange" label={t.courses} value={dashboard.stats.courses} />}
              {dashboard?.stats?.quizzes > 0 && <StatCard tone="blue" label={t.quizzes} value={dashboard.stats.quizzes} />}
            </>}
            {role !== "guest_teacher" && <StatCard tone="red" label={t.reports} value={dashboard?.stats?.reports ?? 0} />}
          </div>}

          {role !== "general_admin" && role !== "school_director" && <div className="platform-grid">
            <Card className="platform-panel">
              <h2>{role === "guest_teacher" ? "Périmètre pédagogique" : "Votre planification"}</h2>
              {role === "guest_teacher" ? <div className="student-plan-list">
                <div className="student-plan-item"><strong>{classes.length}</strong><span>classe(s) accessible(s)</span><b>{modules.length} module(s)</b></div>
                <div className="student-plan-item"><strong>{schools.length}</strong><span>école(s) disponible(s)</span><b>{reports.length} rapport(s)</b></div>
              </div> : <div className="student-plan-list">
                {studentPlan.length ? studentPlan.map((entry, index) => (
                  <div className="student-plan-item" key={`${entry.dayOfWeek}-${entry.startTime}-${index}`}>
                    <strong>{scheduleDayLabel(entry.dayOfWeek, studentPlanWeekStart)}</strong>
                    <span>{scheduleSlotDateLabel(entry.dayOfWeek, studentPlanWeekStart)}</span>
                    <span>{entry.startTime} - {entry.endTime}</span>
                    <b>{entry.moduleName || `Module ${entry.moduleId}`}</b>
                    <small>{entry.teacherName || teacherNameById.get(String(entry.teacherId)) || "Enseignant non renseigné"}</small>
                    <em>Salle : {scheduleRoomLabel(entry)}</em>
                  </div>
                )) : <p>Aucun emploi du temps publié pour votre classe.</p>}
              </div>}
            </Card>
            <Card className="platform-panel">
              <h2>{t.adaptiveAi}</h2>
              <p>{architecture?.aiEngine || t.adaptiveAiDescription}</p>
              <p><strong>{aiProfile?.scope?.trainedDocuments || 0}</strong> document(s) et <strong>{aiProfile?.scope?.trainedModules || 0}</strong> module(s) intégrés au profil.</p>
              <ProgressBar value={aiProfile?.averageScore || 0} />
            </Card>
          </div>}
        </section>
      )}

      {activeTab === "assignments" && role !== "general_admin" && <div className="reference-mini-stats reference-assignment-stats">
        <StatCard tone="blue" label="Enseignants" value={schoolTeachers.length || directors.length} detail="+1 ce mois" />
        <StatCard tone="green" label="Classes" value={classes.length} detail="+0 ce mois" />
        <StatCard tone="yellow" label="Modules" value={modules.length} detail="+0 ce mois" />
        <StatCard tone="green" label="Affectations" value={Number(dashboard?.stats?.assignments ?? assignments.length)} detail="Données réelles" />
      </div>}

      {activeTab === "assignments" && role === "general_admin" && (
        <section className="admin-schools-page" aria-labelledby="admin-schools-title">
          <div className="admin-schools-hero">
            <span className="admin-schools-hero-icon"><DashboardIcon type="school" /></span>
            <div>
              <h2 id="admin-schools-title">Gestion des établissements</h2>
              <p>Consultez et gérez les établissements de la plateforme.</p>
            </div>
            <button className="admin-schools-add" type="button" aria-label="Ajouter un établissement" onClick={() => setAddSchoolOpen(true)}>
              <span aria-hidden="true">+</span>
              Ajouter un établissement
            </button>
          </div>

          <section className="admin-school-stats" aria-label="Statistiques des établissements">
            {adminSchoolStats.map((stat) => (
              <article className={`admin-school-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div>
                  <small>{stat.label}</small>
                  <strong>{stat.value}</strong>
                  <p>{stat.detail}</p>
                </div>
              </article>
            ))}
          </section>

          <Card className="admin-schools-card">
            <div className="admin-schools-card-head">
              <div>
                <h3>Liste des établissements</h3>
                <p>{adminEstablishments.length} établissement(s) synchronisé(s)</p>
              </div>
              <span>{adminSchoolStats[1]?.value || 0} approuvé(s)</span>
            </div>
            {adminEstablishments.length > 0 ? (
              <>
                <div className="admin-schools-table" role="table" aria-label="Gestion des établissements">
                  <div className="admin-schools-row admin-schools-head" role="row">
                    <span role="columnheader">Établissement</span>
                    <span role="columnheader">Ville</span>
                    <span role="columnheader">Type</span>
                    <span role="columnheader">Directeur</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {adminEstablishments.map((school, index) => {
                    const status = schoolStatusMeta(school);
                    return (
                      <div className="admin-schools-row" role="row" key={school.id || `${school.name}-${index}`}>
                        <span className="admin-school-name" role="cell">
                          <i aria-hidden="true">
                            {schoolLogoSrc(school) ? <img alt="" src={schoolLogoSrc(school)} /> : <DashboardIcon type="school" />}
                          </i>
                          <span>
                            <strong>{schoolDisplayName(school)}</strong>
                            {schoolCodeLabel(school) && <small>{schoolCodeLabel(school)}</small>}
                          </span>
                        </span>
                        <span className="admin-school-location" role="cell"><strong>{school.city || "Non renseigné"}</strong><small>{school.country || ""}</small></span>
                        <span className="admin-school-muted" role="cell">{schoolTypeLabel(school)}</span>
                        <span className="admin-school-muted" role="cell">{schoolDirectorLabel(school)}</span>
                        <span role="cell"><em className={`admin-school-status is-${status.tone}`}>{status.label}</em></span>
                        <span role="cell">
                          <button className="admin-schools-view" type="button" onClick={() => setSelectedSchool(school)}>
                            Consulter
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-schools-pagination">
                  <p>Affichage de 1 à {adminEstablishments.length} sur {adminEstablishments.length} établissements</p>
                  <div><button type="button" disabled>‹</button><button className="active" type="button">1</button><button type="button" disabled>›</button></div>
                </div>
              </>
            ) : (
              <div className="admin-schools-empty">
                <span><DashboardIcon type="school" /></span>
                <strong>Aucun établissement trouvé</strong>
                <p>Aucun établissement n’est disponible pour le moment. Ajoutez un établissement pour commencer à structurer la plateforme.</p>
                <button type="button" onClick={() => setAddSchoolOpen(true)}>Ajouter un établissement</button>
              </div>
            )}
          </Card>
        </section>
      )}

      {activeTab === "assignments" && role === "general_admin_legacy" && (
        <form className="platform-panel platform-wide-panel" onSubmit={assignDirector}>
          <h2>Affecter une école à un directeur</h2>
          <p>Seuls les établissements approuvés sans directeur et les directeurs encore libres sont proposés.</p>
          <div className="platform-form-grid">
            <label><span>École disponible</span><select required value={directorAssignment.schoolId} onChange={(event) => setDirectorAssignment({ ...directorAssignment, schoolId: event.target.value })}><option value="">Choisir</option>{unassignedSchools.map((school) => <option key={school.id} value={school.id}>{school.name} - {school.city}</option>)}</select></label>
            <label><span>Directeur disponible</span><select required value={directorAssignment.directorId} onChange={(event) => setDirectorAssignment({ ...directorAssignment, directorId: event.target.value })}><option value="">Choisir</option>{directors.map((director) => <option key={director.id} value={director.id}>{director.name} - {director.email}</option>)}</select></label>
          </div>
          <button type="submit">Enregistrer l'affectation</button>
        </form>
      )}

      {activeTab === "assignments" && role === "school_director" && (
        <section className="reference-assignment-workspace">
          <aside className="platform-panel reference-teacher-list">
            <h2>Liste des enseignants</h2>
            <input value={teacherSearch} onChange={(event) => setTeacherSearch(event.target.value)} placeholder="Rechercher un enseignant..." />
            <div>{filteredTeachers.map((teacher) => <button className={String(teacherAssignment.teacherId) === String(teacher.id) ? "active" : ""} type="button" key={teacher.id} onClick={() => setTeacherAssignment({ ...teacherAssignment, teacherId: teacher.id })}><Avatar user={teacher} name={teacher.name} size={44} clickable /><span><strong>{teacher.name}</strong><small>{teacher.email ? String(teacher.email).toLowerCase() : teacher.subject}</small></span></button>)}</div>
          </aside>
          <div className="director-assignment-main">
            <form className="platform-panel reference-assignment-form director-assignment-form-card" onSubmit={assignTeacher}>
              <h2>Affecter un enseignant</h2>
              <p>Un enseignant peut intervenir dans plusieurs classes et modules de votre établissement.</p>
              <label><span>Enseignant</span><select required value={teacherAssignment.teacherId} onChange={(event) => setTeacherAssignment({ ...teacherAssignment, teacherId: event.target.value })}><option value="">Choisir un enseignant</option>{schoolTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
              <ChipMultiSelect label="Classes" options={classes} values={teacherAssignment.classIds} onChange={(classIds) => setTeacherAssignment({ ...teacherAssignment, classIds })} placeholder="Choisir une ou plusieurs classes" />
              <ChipMultiSelect label="Modules" options={modules} values={teacherAssignment.moduleIds} onChange={(moduleIds) => setTeacherAssignment({ ...teacherAssignment, moduleIds })} placeholder="Choisir un ou plusieurs modules" />
              <button type="submit">{editingAssignmentId ? "Mettre à jour l’affectation" : "Enregistrer les affectations"}</button>
              {editingAssignmentId && <button type="button" onClick={cancelTeacherAssignmentEdit}>Annuler</button>}
            </form>
            <Card className="admin-affectations-card director-assignment-table-card">
              <div className="admin-affectations-card-head">
                <div><h3>Affectations enregistrées</h3><p>{filteredAdminAssignments.length} affectation(s)</p></div>
              </div>
              {filteredAdminAssignments.length > 0 ? (
                <div className="director-assignment-table-shell">
                  <div className="admin-affectations-table" role="table" aria-label="Affectations des enseignants">
                    <div className="admin-affectations-row admin-affectations-head" role="row">
                      <span role="columnheader">Enseignant</span>
                      <span role="columnheader">Module</span>
                      <span role="columnheader">Classe</span>
                      <span role="columnheader">Établissement</span>
                      <span role="columnheader">Statut</span>
                      <span role="columnheader">Actions</span>
                    </div>
                    {filteredAdminAssignments.map((item) => (
                      <div className="admin-affectations-row" role="row" key={item.id}>
                        <span className="admin-affectation-name" role="cell">
                          <Avatar user={item.teacher} name={item.teacherName} size={44} clickable />
                          <span><strong>{item.teacherName}</strong><small>{item.teacherEmail ? String(item.teacherEmail).toLowerCase() : ""}</small></span>
                        </span>
                        <span className="admin-affectation-muted" role="cell">{item.moduleName}</span>
                        <span className="admin-affectation-muted" role="cell">{item.className}</span>
                        <span className="admin-affectation-muted" role="cell">{item.schoolName}</span>
                        <span role="cell"><em className={`admin-affectation-status is-${item.status.tone}`}>{item.status.label}</em></span>
                        <span className="admin-affectations-actions" role="cell">
                          <button className="admin-affectations-view" type="button" onClick={() => editTeacherAssignment(item)}>Modifier</button>
                          <button className="admin-affectations-more" type="button" onClick={() => deleteTeacherAssignment(item)}>Supprimer</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="admin-affectations-empty">
                  <span><DashboardIcon type="assignments" /></span>
                  <strong>Aucune affectation trouvée</strong>
                  <p>Les affectations créées depuis le formulaire apparaîtront ici.</p>
                </div>
              )}
            </Card>
          </div>
        </section>
      )}

      {activeTab === "studentAssignments" && role === "school_director" && (
        <section className="reference-assignment-workspace reference-student-assignment-workspace">
          <div className="director-assignment-main">
            <form className="platform-panel reference-assignment-form director-assignment-form-card" onSubmit={assignStudent}>
              <h2>Affecter un étudiant</h2>
              <p>Un étudiant peut être affecté à une classe et à un ou plusieurs modules de votre établissement.</p>
              <label>
                <span>Étudiant</span>
                <select required value={studentAssignment.studentId} onChange={(event) => setStudentAssignment({ ...studentAssignment, studentId: event.target.value })}>
                  <option value="">Choisir un étudiant</option>
                  {schoolStudents.map((student) => <option key={student.id} value={student.id}>{student.name} - {student.email}</option>)}
                </select>
              </label>
              <label>
                <span>Classe</span>
                <select required value={studentAssignment.classId} onChange={(event) => setStudentAssignment({ ...studentAssignment, classId: event.target.value, moduleIds: [] })}>
                  <option value="">Choisir une classe</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.schoolName || "Établissement"}</option>)}
                </select>
              </label>
              <ChipMultiSelect
                label="Modules"
                options={studentAssignmentModuleOptions}
                values={studentAssignment.moduleIds}
                onChange={(moduleIds) => setStudentAssignment({ ...studentAssignment, moduleIds })}
                placeholder={studentAssignment.classId ? "Choisir un ou plusieurs modules" : "Choisissez d'abord une classe"}
              />
              <button type="submit">{editingStudentAssignmentId ? "Mettre à jour l’affectation" : "Enregistrer l'affectation"}</button>
              {editingStudentAssignmentId && <button type="button" onClick={cancelStudentAssignmentEdit}>Annuler</button>}
            </form>

            <Card className="admin-affectations-card director-assignment-table-card">
              <div className="admin-affectations-card-head">
                <div><h3>Affectations enregistrées</h3><p>{studentAssignmentRows.length} affectation(s)</p></div>
              </div>
              {studentAssignmentRows.length > 0 ? (
                <div className="director-assignment-table-shell">
                  <div className="admin-affectations-table" role="table" aria-label="Affectations des étudiants">
                    <div className="admin-affectations-row admin-affectations-head" role="row">
                      <span role="columnheader">Étudiant</span>
                      <span role="columnheader">Classe</span>
                      <span role="columnheader">Modules</span>
                      <span role="columnheader">Établissement</span>
                      <span role="columnheader">Statut</span>
                      <span role="columnheader">Actions</span>
                    </div>
                    {studentAssignmentRows.map((item) => (
                      <div className="admin-affectations-row" role="row" key={item.id}>
                        <span className="admin-affectation-name" role="cell">
                          <Avatar user={item.student} name={item.studentName} size={44} clickable />
                          <span><strong>{item.studentName}</strong><small>{item.studentEmail ? String(item.studentEmail).toLowerCase() : ""}</small></span>
                        </span>
                        <span className="admin-affectation-muted" role="cell">{item.className}</span>
                        <span className="admin-affectation-muted" role="cell">{item.moduleNames}</span>
                        <span className="admin-affectation-muted" role="cell">{item.schoolName}</span>
                        <span role="cell"><em className={`admin-affectation-status is-${item.status.tone}`}>{item.status.label}</em></span>
                        <span className="admin-affectations-actions" role="cell">
                          <button className="admin-affectations-view" type="button" onClick={() => editStudentAssignment(item)}>Modifier</button>
                          <button className="admin-affectations-more" type="button" onClick={() => deleteStudentAssignment(item)}>Supprimer</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="admin-affectations-empty">
                  <span><DashboardIcon type="students" /></span>
                  <strong>Aucune affectation trouvée</strong>
                  <p>Les affectations créées depuis le formulaire apparaîtront ici.</p>
                </div>
              )}
            </Card>
          </div>
        </section>
      )}

      {activeTab === "assignments" && ["teacher", "guest_teacher"].includes(role) && (
        <form className="platform-panel platform-wide-panel" onSubmit={requestTeacherSchool}>
          <h2>Demander à rejoindre une école</h2>
          <p>La demande sera transmise au directeur de l'établissement.</p>
          <label><span>École</span><select name="schoolId" required><option value="">Choisir une école</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} - {school.city}</option>)}</select></label>
          <button type="submit">Envoyer la demande</button>
        </form>
      )}

      {activeTab === "schools" && (
        <section className="reference-school-page">
          <div className="reference-stepper"><span className={schoolWizardStep === 1 ? "active" : ""}><b>1</b>Informations générales</span><span className={schoolWizardStep === 2 ? "active" : ""}><b>2</b>Responsable</span><span className={schoolWizardStep === 3 ? "active" : ""}><b>3</b>Documents</span></div>
          <div className="platform-grid reference-school-grid">
          {canCreateSchool && (
            <form className="platform-panel reference-school-form" onSubmit={submitSchool}>
              <h2>{schoolWizardStep === 1 ? "Informations générales" : schoolWizardStep === 2 ? "Responsable" : "Documents"}</h2>
              <div className="platform-form-grid">
                {(schoolWizardStep === 1 ? [
                  ["name", t.schoolName],
                  ["schoolType", t.schoolType],
                  ["city", t.city],
                  ["country", t.country],
                  ["phone", t.phone],
                  ["officialEmail", t.officialEmail],
                  ["logoUrl", t.logoUrl],
                ] : schoolWizardStep === 2 ? [
                  ["directorName", t.directorName],
                  ["directorEmail", t.directorEmail],
                ] : []).map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input required={["name", "schoolType", "city", "officialEmail", "directorName", "directorEmail"].includes(key)} value={schoolForm[key]} onChange={(event) => setSchoolForm({ ...schoolForm, [key]: event.target.value })} />
                  </label>
                ))}
              </div>
              {schoolWizardStep === 1 && (
                <>
                  <label>
                    <span>Logo</span>
                    <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(event) => setSchoolLogoFile(event.target.files?.[0] || null)} />
                    {schoolLogoValue(schoolForm) && <small>Logo actuel: {schoolForm.logoUrl}</small>}
                    {schoolLogoFile && <small>Nouveau logo: {schoolLogoFile.name}</small>}
                  </label>
                  <label>
                    <span>{t.address}</span>
                    <textarea value={schoolForm.address} onChange={(event) => setSchoolForm({ ...schoolForm, address: event.target.value })} />
                  </label>
                </>
              )}
              {schoolWizardStep === 3 && (
              <label>
                <span>{t.legalDocuments}</span>
                <div
                  className="reference-file-drop"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    setSchoolFiles(Array.from(event.dataTransfer.files).filter((file) => /\.(pdf|png|jpe?g)$/i.test(file.name)));
                  }}
                >
                  <input ref={schoolFileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple hidden onChange={(event) => setSchoolFiles(Array.from(event.target.files || []))} />
                  <strong>Glissez-déposez vos fichiers ici</strong><small>PDF, JPG, PNG (Max 10Mo)</small>
                  <button type="button" onClick={() => schoolFileInputRef.current?.click()}>Choisir des fichiers</button>
                  {existingSchoolDocuments.length > 0 && (
                    <ul>
                      {existingSchoolDocuments.map((document, index) => (
                        <li key={`${schoolDocumentLabel(document, index)}-${index}`}>
                          <span>{schoolDocumentLabel(document, index)}</span>
                          <button type="button" onClick={() => setExistingSchoolDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {schoolFiles.length > 0 && <ul>{schoolFiles.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{Math.ceil(file.size / 1024)} Ko</small><button type="button" onClick={() => setSchoolFiles((current) => current.filter((item) => item !== file))}>×</button></li>)}</ul>}
                  <textarea value={schoolForm.legalDocuments} onChange={(event) => setSchoolForm({ ...schoolForm, legalDocuments: event.target.value })} placeholder="Liens ou références complémentaires" />
                </div>
              </label>
              )}
              {schoolWizardStep === 1 && (
                <div className="reference-form-actions"><button type="button" onClick={nextSchoolWizardStep}>Suivant</button></div>
              )}
              {schoolWizardStep === 2 && (
                <div className="reference-form-actions"><button className="secondary-action" type="button" onClick={() => setSchoolWizardStep(1)}>Précédent</button><button type="button" onClick={nextSchoolWizardStep}>Suivant</button></div>
              )}
              {schoolWizardStep === 3 && (
                <div className="reference-form-actions"><button className="secondary-action" type="button" onClick={() => setSchoolWizardStep(2)}>Précédent</button><button type="submit" disabled={uploadingSchoolFiles}>{uploadingSchoolFiles ? "Importation..." : isEditingSchool ? "Enregistrer les modifications" : t.submitForApproval}</button></div>
              )}
            </form>
          )}

          <div className="platform-panel reference-school-preview">
            <h2>Aperçu de l'école</h2>
            <div className="reference-school-mark">{schoolLogoSrc(schoolPreviewSource) ? <img alt="" src={schoolLogoSrc(schoolPreviewSource)} /> : <DashboardIcon type="school" />}</div>
            <h3>{schoolDisplayName(schoolPreviewSource) || "Nom de l'école"}</h3>
            <p>{schoolEmailLabel(schoolPreviewSource)}</p>
            <dl><div><dt>Ville</dt><dd>{schoolPreviewSource.city || "—"}</dd></div><div><dt>Type</dt><dd>{schoolTypeLabel(schoolPreviewSource) || "—"}</dd></div><div><dt>Pays</dt><dd>{schoolPreviewSource.country || "—"}</dd></div><div><dt>Directeur</dt><dd>{schoolDirectorLabel(schoolPreviewSource)}</dd></div><div><dt>Statut</dt><dd><Badge tone={schoolStatusMeta(schoolPreviewSource).tone === "approved" ? "success" : "warning"}>{schoolStatusMeta(schoolPreviewSource).label}</Badge></dd></div></dl>
            <div className="reference-existing-schools">
            <h2>{t.schoolApproval}</h2>
            <div className="platform-table">
              {schools.map((school) => (
                <div className="platform-row" key={school.id}>
                  <div>
                    <strong>{school.name}</strong>
                    <span>{school.city} / {schoolTypeLabel(school)} / {schoolStatusMeta(school).label}</span>
                  </div>
                  {canApproveSchools && school.status === "pending" && (
                    <div className="platform-row-actions">
                      <button type="button" onClick={() => decideSchool(school.id, "approved")}>{t.approve}</button>
                      <button type="button" onClick={() => decideSchool(school.id, "rejected")}>{t.reject}</button>
                    </div>
                  )}
                  {isDirectorSchoolsPage && (
                    <div className="platform-row-actions">
                      <button type="button" onClick={() => { setPreviewSchool(school); setSelectedSchool(school); }}>Consulter</button>
                      <button type="button" onClick={() => editSchool(school)}>Modifier</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </div>
          </div>
          </div>
        </section>
      )}

      {activeTab === "users" && role === "general_admin" && (
        <section className="admin-users-page" aria-labelledby="admin-users-title">
          <div className="admin-users-hero">
            <span className="admin-users-hero-icon"><DashboardIcon type="users" /></span>
            <div>
              <h2 id="admin-users-title">Gestion des utilisateurs</h2>
              <p>Consultez et gérez les comptes de la plateforme.</p>
            </div>
            <button className="admin-users-add" type="button" aria-label="Ajouter un utilisateur" onClick={() => setAddUserOpen(true)}>
              <span aria-hidden="true">+</span>
              Ajouter un utilisateur
            </button>
          </div>

          <Card className="admin-users-card">
            {users.length > 0 ? (
              <>
                <div className="admin-users-table" role="table" aria-label="Gestion des utilisateurs">
                  <div className="admin-users-row admin-users-head" role="row">
                    <span role="columnheader">NOM</span>
                    <span role="columnheader">STATUT</span>
                    <span role="columnheader">ADRESSE E-MAIL</span>
                    <span role="columnheader">RÔLE</span>
                    <span role="columnheader">ACTION</span>
                  </div>
                  {users.map((user, index) => {
                    const status = userStatusMeta(user);
                    return (
                      <div className="admin-users-row" role="row" key={user.id || user.email || index}>
                        <span className="admin-users-name" role="cell">
                          <Avatar user={user} name={userDisplayName(user)} size={42} clickable />
                          <strong>{userDisplayName(user)}</strong>
                        </span>
                        <span role="cell">
                          <em className={`admin-user-status is-${status.tone}`}>
                            <b aria-hidden="true" />
                            {status.label}
                          </em>
                        </span>
                        <span className="admin-users-email" role="cell">{user.email || "Non renseigné"}</span>
                        <span role="cell"><em className="admin-user-role">{userRoleLabel(user)}</em></span>
                        <span role="cell">
                          <button className="admin-users-view" type="button" onClick={() => viewProfile(user.id)}>
                            Consulter
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-users-pagination">
                  <p>Affichage de 1 à {users.length} sur {users.length} utilisateurs</p>
                  <div>
                    <button type="button" aria-label="Page précédente" disabled>‹</button>
                    <button className="active" type="button">1</button>
                    <button type="button" aria-label="Page suivante" disabled>›</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="admin-users-empty">
                <strong>{t.noUsersFound}</strong>
              </div>
            )}
          </Card>
        </section>
      )}

      {activeTab === "teachers" && role === "general_admin" && (
        <section className="admin-teachers-page" aria-labelledby="admin-teachers-title">
          <div className="admin-teachers-hero">
            <span className="admin-teachers-hero-icon"><DashboardIcon type="teacher" /></span>
            <div>
              <h2 id="admin-teachers-title">Gestion des enseignants</h2>
              <p>Consultez et gerez les enseignants de la plateforme.</p>
            </div>
            <button className="admin-teachers-add" type="button" onClick={() => {
              setAddUserForm({ name: "", email: "", password: "", role: "teacher", accessLevel: "teacher", schoolId: "", status: "active" });
              setAddUserOpen(true);
            }}>
              <span aria-hidden="true">+</span>
              Ajouter un enseignant
            </button>
          </div>

          <section className="admin-teacher-stats" aria-label="Statistiques des enseignants">
            {[
              { label: "Total enseignants", value: adminTeachers.length, detail: "+4 ce mois", tone: "blue", icon: "teacher" },
              { label: "Enseignants actifs", value: adminTeachers.filter((teacher) => userStatusMeta(teacher).tone === "active").length, detail: "+3 ce mois", tone: "green", icon: "activity" },
              { label: "Enseignants inactifs", value: adminTeachers.filter((teacher) => userStatusMeta(teacher).tone === "inactive").length, detail: "+1 ce mois", tone: "yellow", icon: "users" },
              { label: "Modules assignés", value: adminTeachers.reduce((sum, teacher) => sum + teacherAssignedModuleCount(teacher), 0), detail: "Données réelles", tone: "purple", icon: "modules" },
            ].map((stat) => (
              <article className={`admin-teacher-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
              </article>
            ))}
          </section>

          <Card className="admin-teachers-card">
            <div className="admin-teachers-card-head">
              <div className="admin-teachers-tools">
                <label className="admin-teachers-search">
                  <UserInfoIcon type="search" />
                  <input value={teacherSearch} onChange={(event) => setTeacherSearch(event.target.value)} placeholder="Rechercher un enseignant..." />
                </label>
                <select value={teacherSchoolFilter} onChange={(event) => setTeacherSchoolFilter(event.target.value)} aria-label="Filtrer par etablissement">
                  <option value="all">Tous les etablissements</option>
                  {teacherSchoolOptions.map((schoolName) => <option value={schoolName} key={schoolName}>{schoolName}</option>)}
                </select>
                <button className="admin-teachers-export" type="button" onClick={exportVisibleTeachers}>
                  <UserInfoIcon type="download" />
                  Exporter
                </button>
              </div>
            </div>

            {filteredAdminTeachers.length > 0 ? (
              <>
                <div className="admin-teachers-table" role="table" aria-label="Gestion des enseignants">
                  <div className="admin-teachers-row admin-teachers-head" role="row">
                    <span role="columnheader">Enseignant</span>
                    <span role="columnheader">Email</span>
                    <span role="columnheader">Etablissement</span>
                    <span role="columnheader">Modules</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {filteredAdminTeachers.map((teacher, index) => {
                    const status = userStatusMeta(teacher);
                    return (
                      <div className="admin-teachers-row" role="row" key={teacher.id || teacher.email || index}>
                        <span className="admin-teacher-name" role="cell">
                          <Avatar user={teacher} name={userDisplayName(teacher)} size={44} clickable />
                          <span><strong>{userDisplayName(teacher)}</strong><small>{teacherCodeLabel(teacher)}</small></span>
                        </span>
                        <span className="admin-teacher-muted" role="cell">{teacher.email || "Non renseigne"}</span>
                        <span className="admin-teacher-muted" role="cell">{teacherSchoolLabel(teacher)}</span>
                        <span className="admin-teacher-muted" role="cell">{teacherAssignedModuleCount(teacher)}</span>
                        <span role="cell"><em className={`admin-teacher-status is-${status.tone}`}>{status.label}</em></span>
                        <span className="admin-teachers-actions" role="cell">
                          <button className="admin-teachers-view" type="button" onClick={() => viewProfile(teacher.id)}>Consulter</button>
                          <button className="admin-teachers-more" type="button" aria-label={`Actions pour ${userDisplayName(teacher)}`}>...</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-teachers-pagination">
                  <p>Affichage de 1 a {filteredAdminTeachers.length} sur {adminTeachers.length} enseignants</p>
                  <div><button type="button" disabled>&lt;</button><button className="active" type="button">1</button><button type="button" disabled>&gt;</button></div>
                </div>
              </>
            ) : (
              <div className="admin-teachers-empty">
                <span><DashboardIcon type="teacher" /></span>
                <strong>Aucun enseignant trouve</strong>
                <p>Aucun enseignant ne correspond aux donnees disponibles ou a votre recherche.</p>
                <button type="button" onClick={() => {
                  setAddUserForm({ name: "", email: "", password: "", role: "teacher", accessLevel: "teacher", schoolId: "", status: "active" });
                  setAddUserOpen(true);
                }}>Ajouter un enseignant</button>
              </div>
            )}
          </Card>

          <aside className="admin-teachers-about" aria-label="A propos des enseignants">
            <span><UserInfoIcon type="info" /></span>
            <div>
              <strong>A propos des enseignants</strong>
              <p>Les enseignants peuvent etre assignes a plusieurs modules et classes selon leur specialite.</p>
            </div>
            <button type="button" aria-label="Fermer l'information">x</button>
          </aside>
        </section>
      )}

      {activeTab === "students" && role === "general_admin" && (
        <section className="admin-students-page" aria-labelledby="admin-students-title">
          <div className="admin-students-hero">
            <span className="admin-students-hero-icon"><DashboardIcon type="students" /></span>
            <div>
              <h2 id="admin-students-title">Gestion des élèves</h2>
              <p>Consultez et gérez les élèves de la plateforme.</p>
            </div>
            <button className="admin-students-add" type="button" onClick={() => {
              setAddUserForm({ name: "", email: "", password: "", role: "student", accessLevel: "student", schoolId: "", status: "active" });
              setAddUserOpen(true);
            }}>
              <span aria-hidden="true">+</span>
              Ajouter un élève
            </button>
          </div>

          <section className="admin-student-stats" aria-label="Statistiques des élèves">
            {[
              { label: "Total élèves", value: adminStudents.length, detail: "+10 ce mois", tone: "blue", icon: "students" },
              { label: "Élèves actifs", value: adminStudents.filter((student) => userStatusMeta(student).tone === "active").length, detail: "+15 ce mois", tone: "green", icon: "users" },
              { label: "Élèves inactifs", value: adminStudents.filter((student) => userStatusMeta(student).tone === "inactive").length, detail: "-3 ce mois", tone: "yellow", icon: "users" },
              { label: "Classes", value: classes.length || Number(dashboard?.stats?.classes || 0), detail: "+2 ce mois", tone: "purple", icon: "classes" },
            ].map((stat) => (
              <article className={`admin-student-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
              </article>
            ))}
          </section>

          <Card className="admin-students-card">
            <div className="admin-students-card-head">
              <div className="admin-students-tools">
                <label className="admin-students-search">
                  <UserInfoIcon type="search" />
                  <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Rechercher un élève..." />
                </label>
                <select value={studentSchoolFilter} onChange={(event) => setStudentSchoolFilter(event.target.value)} aria-label="Filtrer par établissement">
                  <option value="all">Tous les établissements</option>
                  {studentSchoolOptions.map((schoolName) => <option value={schoolName} key={schoolName}>{schoolName}</option>)}
                </select>
                <button className="admin-students-export" type="button" onClick={exportVisibleStudents}>
                  <UserInfoIcon type="download" />
                  Exporter
                </button>
              </div>
            </div>

            {filteredAdminStudents.length > 0 ? (
              <>
                <div className="admin-students-table" role="table" aria-label="Gestion des élèves">
                  <div className="admin-students-row admin-students-head" role="row">
                    <span role="columnheader">Élève</span>
                    <span role="columnheader">Email</span>
                    <span role="columnheader">Classe</span>
                    <span role="columnheader">Établissement</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {filteredAdminStudents.map((student, index) => {
                    const status = userStatusMeta(student);
                    return (
                      <div className="admin-students-row" role="row" key={student.id || student.email || index}>
                        <span className="admin-student-name" role="cell">
                          <Avatar user={student} name={userDisplayName(student)} size={44} clickable />
                          <span><strong>{userDisplayName(student)}</strong><small>{studentCodeLabel(student)}</small></span>
                        </span>
                        <span className="admin-student-muted" role="cell">{student.email || "Non renseigne"}</span>
                        <span className="admin-student-muted" role="cell">{studentClassLabel(student)}</span>
                        <span className="admin-student-muted" role="cell">{studentSchoolLabel(student)}</span>
                        <span role="cell"><em className={`admin-student-status is-${status.tone}`}>{status.label}</em></span>
                        <span className="admin-students-actions" role="cell">
                          <button className="admin-students-view" type="button" onClick={() => viewProfile(student.id)}>Consulter</button>
                          <button className="admin-students-more" type="button" aria-label={`Actions pour ${userDisplayName(student)}`}>...</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-students-pagination">
                  <p>Affichage de 1 à {filteredAdminStudents.length} sur {adminStudents.length} élèves</p>
                  <div><button type="button" disabled>&lt;</button><button className="active" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button" disabled>&gt;</button></div>
                </div>
              </>
            ) : (
              <div className="admin-students-empty">
                <span><DashboardIcon type="students" /></span>
                <strong>Aucun élève trouvé</strong>
                <p>Aucun élève ne correspond aux données disponibles ou à votre recherche.</p>
                <button type="button" onClick={() => {
                  setAddUserForm({ name: "", email: "", password: "", role: "student", accessLevel: "student", schoolId: "", status: "active" });
                  setAddUserOpen(true);
                }}>Ajouter un élève</button>
              </div>
            )}
          </Card>

          <aside className="admin-students-about" aria-label="À propos des élèves">
            <span><UserInfoIcon type="info" /></span>
            <div>
              <strong>À propos des élèves</strong>
              <p>Les élèves sont répartis par classes dans les établissements. Vous pouvez consulter leurs informations et leurs affectations.</p>
            </div>
            <button type="button" aria-label="Fermer l'information">x</button>
          </aside>
        </section>
      )}

      {activeTab === "affectations" && role === "general_admin" && (
        <section className="admin-affectations-page" aria-labelledby="admin-affectations-title">
          <div className="admin-affectations-hero">
            <span className="admin-affectations-hero-icon"><DashboardIcon type="assignments" /></span>
            <div>
              <h2 id="admin-affectations-title">Gestion des affectations</h2>
              <p>Consultez et gérez les affectations entre enseignants, modules et classes.</p>
            </div>
            <button className="admin-affectations-add" type="button" onClick={() => setMessage("Nouvelle affectation: utilisez les actions existantes de la plateforme.")}>
              <span aria-hidden="true">+</span>
              Nouvelle affectation
            </button>
          </div>

          <section className="admin-affectation-stats" aria-label="Statistiques des affectations">
            {[
              { label: "Total affectations", value: adminAssignments.length, detail: "+8 ce mois", tone: "blue", icon: "assignments" },
              { label: "Affectations actives", value: adminAssignments.filter((item) => item.status.tone === "active").length, detail: "+7 ce mois", tone: "green", icon: "activity" },
              { label: "Affectations inactives", value: adminAssignments.filter((item) => item.status.tone === "inactive").length, detail: "+1 ce mois", tone: "red", icon: "users" },
              { label: "Enseignants affectés", value: new Set(adminAssignments.map((item) => item.teacher?.id || item.teacher?.email || item.teacherName)).size, detail: "+4 ce mois", tone: "purple", icon: "teacher" },
              { label: "Classes concernées", value: assignmentClassOptions.length || classes.length, detail: "+2 ce mois", tone: "orange", icon: "classes" },
            ].map((stat) => (
              <article className={`admin-affectation-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
              </article>
            ))}
          </section>

          <Card className="admin-affectations-card">
            <div className="admin-affectations-card-head">
              <div className="admin-affectations-tools">
                <label className="admin-affectations-search">
                  <UserInfoIcon type="search" />
                  <input value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Rechercher une affectation..." />
                </label>
                <select value={assignmentSchoolFilter} onChange={(event) => setAssignmentSchoolFilter(event.target.value)} aria-label="Filtrer par établissement">
                  <option value="all">Tous les établissements</option>
                  {assignmentSchoolOptions.map((schoolName) => <option value={schoolName} key={schoolName}>{schoolName}</option>)}
                </select>
                <select value={assignmentClassFilter} onChange={(event) => setAssignmentClassFilter(event.target.value)} aria-label="Filtrer par classe">
                  <option value="all">Toutes les classes</option>
                  {assignmentClassOptions.map((className) => <option value={className} key={className}>{className}</option>)}
                </select>
                <select value={assignmentModuleFilter} onChange={(event) => setAssignmentModuleFilter(event.target.value)} aria-label="Filtrer par module">
                  <option value="all">Tous les modules</option>
                  {assignmentModuleOptions.map((moduleName) => <option value={moduleName} key={moduleName}>{moduleName}</option>)}
                </select>
                <button className="admin-affectations-export" type="button" onClick={exportVisibleAssignments}>
                  <UserInfoIcon type="download" />
                  Exporter
                </button>
              </div>
            </div>

            {filteredAdminAssignments.length > 0 ? (
              <>
                <div className="admin-affectations-table" role="table" aria-label="Gestion des affectations">
                  <div className="admin-affectations-row admin-affectations-head" role="row">
                    <span role="columnheader">Enseignant</span>
                    <span role="columnheader">Module</span>
                    <span role="columnheader">Classe</span>
                    <span role="columnheader">Établissement</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Période</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {filteredAdminAssignments.map((item) => (
                    <div className="admin-affectations-row" role="row" key={item.id}>
                      <span className="admin-affectation-name" role="cell">
                        <Avatar user={item.teacher} name={item.teacherName} size={44} clickable />
                        <span><strong>{item.teacherName}</strong><small>{item.teacherCode}</small></span>
                      </span>
                      <span className="admin-affectation-muted" role="cell">{item.moduleName}</span>
                      <span className="admin-affectation-muted" role="cell">{item.className}</span>
                      <span className="admin-affectation-muted" role="cell">{item.schoolName}</span>
                      <span role="cell"><em className={`admin-affectation-status is-${item.status.tone}`}>{item.status.label}</em></span>
                      <span className="admin-affectation-muted" role="cell">{item.period}</span>
                      <span className="admin-affectations-actions" role="cell">
                        <button className="admin-affectations-view" type="button" onClick={() => editTeacherAssignment(item)}>Modifier</button>
                        <button className="admin-affectations-more" type="button" onClick={() => deleteTeacherAssignment(item)}>Supprimer</button>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="admin-affectations-pagination">
                  <p>Affichage de 1 à {filteredAdminAssignments.length} sur {adminAssignments.length} affectations</p>
                  <div><button type="button" disabled>&lt;</button><button className="active" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button" disabled>&gt;</button></div>
                </div>
              </>
            ) : (
              <div className="admin-affectations-empty">
                <span><DashboardIcon type="assignments" /></span>
                <strong>Aucune affectation trouvée</strong>
                <p>Aucune affectation ne correspond aux données disponibles ou à votre recherche.</p>
                <button type="button" onClick={() => setMessage("Aucune affectation disponible à créer depuis cette vue.")}>Nouvelle affectation</button>
              </div>
            )}
          </Card>

          <aside className="admin-affectations-about" aria-label="À propos des affectations">
            <span><UserInfoIcon type="info" /></span>
            <div>
              <strong>À propos des affectations</strong>
              <p>Les affectations permettent d’assigner les enseignants aux modules et classes. Vous pouvez gérer, modifier ou supprimer les affectations selon les besoins.</p>
            </div>
            <button type="button" aria-label="Fermer l'information">x</button>
          </aside>
        </section>
      )}

      {activeTab === "scheduleAdmin" && role === "general_admin" && (
        <section className="admin-schedule-page" aria-labelledby="admin-schedule-title">
          <div className="admin-schedule-hero">
            <span className="admin-schedule-hero-icon"><DashboardIcon type="calendar" /></span>
            <div>
              <h2 id="admin-schedule-title">Gestion des emplois du temps</h2>
              <p>Créez, consultez et gérez les emplois du temps des classes.</p>
            </div>
            <button className="admin-schedule-add" type="button" onClick={() => setMessage("Création d'emploi du temps disponible depuis le générateur existant.")}>
              <span aria-hidden="true">+</span>
              Créer un emploi du temps
            </button>
          </div>

          <section className="admin-schedule-stats" aria-label="Statistiques des emplois du temps">
            {[
              { label: "Emplois du temps", value: adminScheduleStats.schedules, tone: "blue", icon: "calendar" },
              { label: "Classes planifiées", value: adminScheduleStats.classes, tone: "green", icon: "classes" },
              { label: "Cours planifiés", value: adminScheduleStats.slots, tone: "purple", icon: "courses" },
              { label: "Enseignants impliqués", value: adminScheduleStats.teachers, tone: "orange", icon: "teacher" },
              { label: "Salles utilisées", value: adminScheduleStats.rooms, tone: "pink", icon: "school" },
            ].map((stat) => (
              <article className={`admin-schedule-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong></div>
              </article>
            ))}
          </section>

          <Card className="admin-schedule-card">
            <div className="admin-schedule-tools">
              <select value={adminScheduleSchoolFilter} onChange={(event) => setAdminScheduleSchoolFilter(event.target.value)} aria-label="Filtrer par établissement">
                <option value="all">Tous les établissements</option>
                {adminEstablishments.map((school) => <option key={school.id || school.name} value={school.id || school.name}>{schoolDisplayName(school)}</option>)}
              </select>
              <select value={adminScheduleClassFilter} onChange={(event) => setAdminScheduleClassFilter(event.target.value)} aria-label="Filtrer par classe">
                <option value="all">Toutes les classes</option>
                {classes.map((entry) => <option key={entry.id || entry.name} value={entry.id || entry.name}>{entry.name}</option>)}
              </select>
              <select value={adminScheduleTeacherFilter} onChange={(event) => setAdminScheduleTeacherFilter(event.target.value)} aria-label="Filtrer par enseignant">
                <option value="all">Tous les enseignants</option>
                {adminScheduleTeacherOptions.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
              <div className="admin-schedule-period-control" aria-label="Navigation des périodes">
                <button type="button" aria-label="Semaine précédente" onClick={() => setAdminSchedulePeriodStart((current) => addScheduleDays(current, -7))}>←</button>
                <span className="admin-schedule-week"><DashboardIcon type="calendar" />
                <span>{schedulePeriodLabel}</span>
                </span>
                <button type="button" aria-label="Semaine suivante" onClick={() => setAdminSchedulePeriodStart((current) => addScheduleDays(current, 7))}>→</button>
              </div>
              <button className="admin-schedule-today" type="button" onClick={() => setAdminSchedulePeriodStart(getScheduleWeekStartForDate(new Date()))}>Aujourd'hui</button>
              <button className="admin-schedule-export" type="button" onClick={exportVisibleSchedule}>
                <UserInfoIcon type="download" />
                Exporter
              </button>
            </div>

            <div className="admin-schedule-grid" role="table" aria-label="Emploi du temps">
              <div className="admin-schedule-grid-head" role="row">
                <span role="columnheader">Heure</span>
                {scheduleDays.map((day) => (
                  <span role="columnheader" key={day.index}>
                    <strong>{day.label}</strong>
                    <small>{day.dateLabel}</small>
                  </span>
                ))}
              </div>
              {scheduleSlots.map(([startTime, endTime], slotIndex) => (
                <div className="admin-schedule-grid-row" role="row" key={`${startTime}-${endTime}`}>
                  <span className="admin-schedule-time" role="cell"><strong>{startTime}</strong><small>{endTime}</small></span>
                  {scheduleDays.map((day, dayIndex) => {
                    const entry = scheduleEntryFor(day, startTime, endTime);
                    return (
                      <span className="admin-schedule-cell" role="cell" key={`${day.index}-${startTime}`}>
                        {entry ? (
                          <article className={`admin-schedule-lesson tone-${((dayIndex + slotIndex) % 5) + 1}`}>
                            <strong>{entry.moduleName || `Module ${entry.moduleId || ""}`}</strong>
                            <small>{teacherNameById.get(String(entry.teacherId)) || entry.teacherName || "Enseignant non renseigné"}</small>
                            <em>{entry.roomName || entry.room || "Salle non renseignée"}</em>
                          </article>
                        ) : <i aria-label="Aucun cours">—</i>}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="admin-schedule-pagination">
              <p>Affichage de 1 à {scheduleSlots.length} sur {scheduleSlots.length} créneaux horaires</p>
            </div>
          </Card>

          <aside className="admin-schedule-about" aria-label="À propos des emplois du temps">
            <span><UserInfoIcon type="info" /></span>
            <div>
              <strong>À propos des emplois du temps</strong>
              <p>Les emplois du temps permettent d'organiser les cours par classe, enseignant et salle. Vous pouvez créer, modifier ou supprimer les emplois du temps selon les besoins.</p>
            </div>
            <button type="button" aria-label="Fermer l'information">x</button>
          </aside>
        </section>
      )}

      {activeTab === "attachmentRequests" && role === "general_admin" && (
        <section className="admin-attachments-page" aria-labelledby="admin-attachments-title">
          <div className="admin-attachments-hero">
            <span className="admin-attachments-hero-icon"><DashboardIcon type="requests" /></span>
            <div>
              <h2 id="admin-attachments-title">Demandes de rattachement</h2>
              <p>Consultez, acceptez ou refusez les demandes de rattachement.</p>
            </div>
          </div>

          <section className="admin-attachment-stats" aria-label="Statistiques des demandes de rattachement">
            {adminAttachmentStats.map((stat) => (
              <article className={`admin-attachment-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div>
                  <small>{stat.label}</small>
                  <strong>{stat.value}</strong>
                  <p>{stat.detail}</p>
                </div>
              </article>
            ))}
          </section>

          <Card className="admin-attachments-card">
            {adminAttachmentRequests.length > 0 ? (
              <>
                <div className="admin-attachments-table" role="table" aria-label="Demandes de rattachement">
                  <div className="admin-attachments-row admin-attachments-head" role="row">
                    <span role="columnheader">Enseignant</span>
                    <span role="columnheader">Établissement demandé</span>
                    <span role="columnheader">Date de la demande</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Actions</span>
                  </div>
                  {adminAttachmentRequests.map((item) => {
                    const status = attachmentRequestStatusMeta(item);
                    const isPending = status.tone === "pending";
                    return (
                      <div className="admin-attachments-row" role="row" key={`${item.type}-${item.id}`}>
                        <span className="admin-attachment-teacher" role="cell">
                          <i aria-hidden="true">{(item.userName || item.userEmail || "E").trim().charAt(0).toUpperCase()}</i>
                          <span>
                            <strong>{item.userName || "Enseignant"}</strong>
                            <small>{item.userEmail || item.email || "Email non renseigné"}</small>
                          </span>
                        </span>
                        <span className="admin-attachment-school" role="cell">
                          <strong>{item.targetName || item.schoolName || "Établissement non renseigné"}</strong>
                          {item.message && <small>{item.message}</small>}
                        </span>
                        <span className="admin-attachment-date" role="cell">{formatAdminDate(item.createdAt || item.created_at)}</span>
                        <span role="cell"><em className={`admin-attachment-status is-${status.tone}`}>{status.label}</em></span>
                        <span className="admin-attachment-actions" role="cell">
                          {isPending ? (
                            <>
                              <button className="accept" type="button" onClick={() => decideRequest(item, "approved")}>Accepter</button>
                              <button className="reject" type="button" onClick={() => decideRequest(item, "rejected")}>Refuser</button>
                            </>
                          ) : (
                            <button className="view" type="button" onClick={() => viewProfile(item.userId)}>Consulter</button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-attachments-pagination">
                  <p>Affichage de 1 à {adminAttachmentRequests.length} sur {adminAttachmentRequests.length} demandes</p>
                  <div><button type="button" disabled>‹</button><button className="active" type="button">1</button><button type="button" disabled>›</button></div>
                </div>
              </>
            ) : (
              <div className="admin-attachments-empty">
                <span><DashboardIcon type="requests" /></span>
                <strong>Aucune demande de rattachement</strong>
                <p>Aucune demande de rattachement n'est disponible pour le moment.</p>
              </div>
            )}
          </Card>
        </section>
      )}

      {activeTab === "requests" && role === "school_director" && (
        <section className="reference-data-page">
        <div className="reference-mini-stats">
          <StatCard tone="yellow" label="En attente" value={validationRequests.length} detail="+2 ce mois" />
          <StatCard tone="green" label="Approuvées" value={validationRequests.filter((item) => item.status === "approved").length} detail="+4 ce mois" />
          <StatCard tone="red" label="Refusées" value={validationRequests.filter((item) => item.status === "rejected").length} detail="+0 ce mois" />
          <StatCard tone="blue" label="Total" value={validationRequests.length} detail="100%" />
        </div>
        <Card className="platform-panel platform-wide-panel request-management-panel">
          <div className="reference-filter-panel">
            <h2>Filtres</h2>
            <div className="reference-filter-grid">
              <label className="filter-search"><span>Recherche</span><input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Rechercher..." /></label>
              <label><span>Période</span><select value={requestPeriod} onChange={(event) => setRequestPeriod(event.target.value)}><option value="all">Toutes les périodes</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select></label>
              <label><span>Statut</span><select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="pending">En attente</option><option value="approved">Approuvé</option><option value="rejected">Refusé</option></select></label>
              <label><span>Type de demande</span><select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="all">Tous les types</option>{[...new Set(validationRequests.map((item) => item.type))].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
              <label><span>École</span><select value={requestSchool} onChange={(event) => setRequestSchool(event.target.value)}><option value="all">Toutes les écoles</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
              <label><span>Classe</span><select value={requestClass} onChange={(event) => setRequestClass(event.target.value)}><option value="all">Toutes les classes</option>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            </div>
            <div className="reference-filter-actions">
              <button type="button" className="filter-reset" onClick={() => {
                setRequestSearch(""); setRequestStatus("all"); setRequestType("all"); setRequestSchool("all"); setRequestClass("all"); setRequestPeriod("all"); setRequestSort("newest");
                setAppliedRequestFilters({ search: "", status: "all", type: "all", school: "all", classId: "all", cutoff: null, sort: "newest" });
              }}>Réinitialiser les filtres</button>
              <button type="button" className="filter-apply" onClick={() => setAppliedRequestFilters({
                search: requestSearch,
                status: requestStatus,
                type: requestType,
                school: requestSchool,
                classId: requestClass,
                cutoff: requestPeriod === "all" ? null : new Date(Date.now() - Number(requestPeriod) * 86400000).toISOString(),
                sort: requestSort,
              })}>Appliquer les filtres</button>
            </div>
          </div>
          <div className="reference-results-toolbar">
            <button type="button" onClick={() => exportCsv("demandes-validation.csv", filteredRequests)}>Exporter</button>
            <label><span>Trier par</span><select value={requestSort} onChange={(event) => { const sort = event.target.value; setRequestSort(sort); setAppliedRequestFilters((current) => ({ ...current, sort })); }}><option value="newest">Plus récent</option><option value="oldest">Plus ancien</option></select></label>
          </div>
          <div className="request-card-grid">
            {filteredRequests.map((item) => <article className="request-card" key={`${item.type}-${item.id}`}>
              <div><Badge tone="warning">{item.type.replaceAll("_", " ")}</Badge><small>{new Date(item.createdAt).toLocaleString()}</small></div>
              <h3>{item.userName}</h3><p>Demande pour <strong>{item.targetName}</strong></p>
              <blockquote>{item.message || "Aucun message ajouté."}</blockquote>
              <div className="request-card-actions"><Button variant="secondary" onClick={() => viewProfile(item.userId)}>Voir le profil</Button><Button onClick={() => decideRequest(item, "approved")}>{t.approve}</Button><Button variant="secondary" onClick={() => decideRequest(item, "rejected")}>{t.reject}</Button></div>
            </article>)}
            {!filteredRequests.length && <div className="reference-empty-state"><span>□</span><strong>Aucune demande trouvée</strong><p>Aucune demande ne correspond à vos critères de recherche.</p></div>}
          </div>
        </Card>
        </section>
      )}

      {activeTab === "classes" && (canManageTeaching || role === "general_admin") && (
        <section className="admin-classes-page" aria-labelledby="admin-classes-title">
          <div className="admin-classes-hero">
            <span className="admin-classes-hero-icon"><DashboardIcon type="classes" /></span>
            <div>
              <h2 id="admin-classes-title">Gestion des classes</h2>
              <p>Consultez et gérez les classes de la plateforme.</p>
            </div>
            <button className="admin-classes-add" type="button" onClick={() => setAddClassOpen(true)}>
              <span aria-hidden="true">+</span>
              Ajouter une classe
            </button>
          </div>

          <section className="admin-class-stats" aria-label="Statistiques des classes">
            {[
              { label: "Total classes", value: classes.length, detail: "+3 ce mois", tone: "blue", icon: "classes" },
              { label: "Classes actives", value: classes.filter((item) => classStatusMeta(item).tone === "active").length, detail: "+2 ce mois", tone: "green", icon: "activity" },
              { label: "Classes inactives", value: classes.filter((item) => classStatusMeta(item).tone === "inactive").length, detail: "+1 ce mois", tone: "yellow", icon: "users" },
              { label: "Élèves inscrits", value: Number(dashboard?.stats?.students || classes.reduce((sum, item) => sum + classStudentCount(item), 0)), detail: "+10 ce mois", tone: "purple", icon: "students" },
            ].map((stat) => (
              <article className={`admin-class-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
              </article>
            ))}
          </section>

          <Card className="admin-classes-card">
            <div className="admin-classes-card-head">
              <div><h3>Liste des classes</h3><p>{filteredClasses.length} classe(s) affichée(s)</p></div>
              <div className="admin-classes-tools">
                <input value={classSearch} onChange={(event) => setClassSearch(event.target.value)} placeholder="Rechercher une classe..." />
                <button type="button" onClick={exportVisibleClasses}>Exporter</button>
              </div>
            </div>
            {filteredClasses.length > 0 ? (
              <>
                <div className="admin-classes-table" role="table" aria-label="Gestion des classes">
                  <div className="admin-classes-row admin-classes-head" role="row">
                    <span role="columnheader">Classe</span>
                    <span role="columnheader">Établissement</span>
                    <span role="columnheader">Niveau</span>
                    <span role="columnheader">Nombre d’élèves</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {filteredClasses.map((item) => {
                    const status = classStatusMeta(item);
                    return (
                      <div className="admin-classes-row" role="row" key={item.id}>
                        <span className="admin-class-name" role="cell"><i>{String(item.name || "C").slice(0, 2).toUpperCase()}</i><span><strong>{item.name}</strong><small>{item.academicYear || "Année non renseignée"}</small></span></span>
                        <span className="admin-class-muted" role="cell">{item.schoolName || schools.find((school) => String(school.id) === String(item.schoolId))?.name || "Non renseigné"}</span>
                        <span className="admin-class-muted" role="cell">{item.levelName || "Non renseigné"}</span>
                        <span className="admin-class-muted" role="cell">{classStudentCount(item)}</span>
                        <span role="cell"><em className={`admin-class-status is-${status.tone}`}>{status.label}</em></span>
                        <span role="cell"><button className="admin-classes-view" type="button" onClick={() => setSelectedClass(item)}>Consulter</button></span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-classes-pagination">
                  <p>Affichage de 1 à {filteredClasses.length} sur {classes.length} classes</p>
                  <div><button type="button" disabled>‹</button><button className="active" type="button">1</button><button type="button" disabled>›</button></div>
                </div>
              </>
            ) : (
              <div className="admin-classes-empty">
                <span><DashboardIcon type="classes" /></span>
                <strong>Aucune classe trouvée</strong>
                <p>Aucune classe ne correspond aux données disponibles ou à votre recherche.</p>
                <button type="button" onClick={() => setAddClassOpen(true)}>Ajouter une classe</button>
              </div>
            )}
          </Card>
        </section>
      )}

      {activeTab === "classes" && canManageTeaching && role === "school_director_legacy" && (
        <section className="reference-management-page">
          <div className="reference-mini-stats">
            <StatCard tone="blue" label="Classes" value={classes.length} detail="+0 ce mois" />
            <StatCard tone="green" label="Élèves" value={dashboard?.stats?.students || 0} detail="+5 ce mois" />
            <StatCard tone="green" label="Enseignants" value={schoolTeachers.length} detail="+1 ce mois" />
            <StatCard tone="yellow" label="Modules" value={modules.length} detail="+0 ce mois" />
          </div>
          <div className="platform-grid reference-management-grid">
          <form className="platform-panel" onSubmit={submitClass}>
            <h2>{t.classManagement}</h2>
            <label>
              <span>{t.school}</span>
              <select required value={classForm.schoolId} onChange={(event) => setClassForm({ ...classForm, schoolId: event.target.value })}>
                <option value="">{t.noSchool}</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </label>
            <label><span>{t.className}</span><input required value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} /></label>
            <label>
              <span>{t.moroccanLevel}</span>
              <select required value={classForm.levelName} onChange={(event) => setClassForm({ ...classForm, levelName: event.target.value })}>
                <option value="">{t.selectLevel}</option>
                {levels.map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
              </select>
            </label>
            <label><span>{t.academicYear}</span><input required value={classForm.academicYear} onChange={(event) => setClassForm({ ...classForm, academicYear: event.target.value })} /></label>
            <label><span>{t.pedagogicalStructure}</span><textarea value={classForm.pedagogicalStructure} onChange={(event) => setClassForm({ ...classForm, pedagogicalStructure: event.target.value })} /></label>
            <button type="submit">{t.createClass}</button>
          </form>

          <div className="platform-panel">
            <h2>{t.classes}</h2>
            <div className="reference-table-toolbar"><input value={classSearch} onChange={(event) => setClassSearch(event.target.value)} placeholder="Rechercher une classe..." /><button type="button" onClick={() => exportCsv("classes.csv", filteredClasses)}>Exporter</button></div>
            <div className="platform-table">
              {filteredClasses.map((item) => (
                <div className="platform-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.levelName} / {item.academicYear} / {item.status}</span>
                  </div>
                  <div className="platform-row-actions"><button type="button" onClick={() => editClass(item)}>Modifier</button><button type="button" onClick={() => archiveClass(item)}>Archiver</button></div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </section>
      )}

      {activeTab === "modules" && (canManageTeaching || role === "general_admin") && (
        <section className="admin-modules-page" aria-labelledby="admin-modules-title">
          <div className="admin-modules-hero">
            <span className="admin-modules-hero-icon"><DashboardIcon type="modules" /></span>
            <div>
              <h2 id="admin-modules-title">Gestion des modules</h2>
              <p>Consultez et gérez les modules de la plateforme.</p>
            </div>
            <button className="admin-modules-add" type="button" onClick={() => setAddModuleOpen(true)}>
              <span aria-hidden="true">+</span>
              Ajouter un module
            </button>
          </div>

          <section className="admin-module-stats" aria-label="Statistiques des modules">
            {[
              { label: "Total modules", value: modules.length, detail: "+6 ce mois", tone: "blue", icon: "modules" },
              { label: "Modules actifs", value: modules.filter((item) => moduleStatusMeta(item).tone === "active").length, detail: "+5 ce mois", tone: "green", icon: "activity" },
              { label: "Modules inactifs", value: modules.filter((item) => moduleStatusMeta(item).tone === "inactive").length, detail: "+1 ce mois", tone: "yellow", icon: "users" },
              { label: "Cours associés", value: Number(dashboard?.stats?.courses || modules.reduce((sum, item) => sum + moduleCourseCount(item), 0)), detail: "+12 ce mois", tone: "purple", icon: "courses" },
            ].map((stat) => (
              <article className={`admin-module-stat tone-${stat.tone}`} key={stat.label}>
                <span><DashboardIcon type={stat.icon} /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.detail}</p></div>
              </article>
            ))}
          </section>

          <Card className="admin-modules-card">
            <div className="admin-modules-card-head">
              <div><h3>Liste des modules</h3><p>{filteredModules.length} module(s) affiché(s)</p></div>
              <div className="admin-modules-tools">
                <label className="admin-modules-search">
                  <UserInfoIcon type="search" />
                  <input value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)} placeholder="Rechercher un module..." />
                </label>
                <select value={moduleSchoolFilter} onChange={(event) => setModuleSchoolFilter(event.target.value)} aria-label="Filtrer par etablissement">
                  <option value="all">Tous les etablissements</option>
                  {moduleSchoolOptions.map((schoolName) => <option value={schoolName} key={schoolName}>{schoolName}</option>)}
                </select>
                <button className="admin-modules-export" type="button" onClick={exportVisibleModules}>
                  <UserInfoIcon type="download" />
                  Exporter
                </button>
              </div>
            </div>
            {filteredModules.length > 0 ? (
              <>
                <div className="admin-modules-table" role="table" aria-label="Gestion des modules">
                  <div className="admin-modules-row admin-modules-head" role="row">
                    <span role="columnheader">Module</span>
                    <span role="columnheader">Code</span>
                    <span role="columnheader">Établissement</span>
                    <span role="columnheader">Classes</span>
                    <span role="columnheader">Nombre de cours</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Action</span>
                  </div>
                  {filteredModules.map((item) => {
                    const status = moduleStatusMeta(item);
                    return (
                      <div className="admin-modules-row" role="row" key={item.id}>
                        <span className="admin-module-name" role="cell"><i><DashboardIcon type="modules" /></i><span><strong>{item.name}</strong><small>{item.levelName || t.allLevels}</small></span></span>
                        <span className="admin-module-muted" role="cell">{moduleCodeLabel(item)}</span>
                        <span className="admin-module-muted" role="cell">{item.schoolName || item.establishmentName || "Non renseigné"}</span>
                        <span className="admin-module-muted" role="cell">{moduleClassLabel(item)}</span>
                        <span className="admin-module-muted" role="cell">{moduleCourseCount(item)}</span>
                        <span role="cell"><em className={`admin-module-status is-${status.tone}`}>{status.label}</em></span>
                        <span className="admin-modules-actions" role="cell">
                          <button className="admin-modules-view" type="button" onClick={() => setSelectedModule(item)}>Consulter</button>
                          <button className="admin-modules-more" type="button" aria-label={`Actions pour ${item.name || "module"}`}>...</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="admin-modules-pagination">
                  <p>Affichage de 1 à {filteredModules.length} sur {modules.length} modules</p>
                  <div><button type="button" disabled>‹</button><button className="active" type="button">1</button><button type="button" disabled>›</button></div>
                </div>
              </>
            ) : (
              <div className="admin-modules-empty">
                <span><DashboardIcon type="modules" /></span>
                <strong>Aucun module trouvé</strong>
                <p>Aucun module ne correspond aux données disponibles ou à votre recherche.</p>
                <button type="button" onClick={() => setAddModuleOpen(true)}>Ajouter un module</button>
              </div>
            )}
          </Card>
          <aside className="admin-modules-about" aria-label="A propos des modules">
            <span><UserInfoIcon type="info" /></span>
            <div>
              <strong>A propos des modules</strong>
              <p>Les modules permettent d'organiser les cours par matiere ou domaine d'enseignement.</p>
            </div>
            <button type="button" aria-label="Fermer l'information">x</button>
          </aside>
        </section>
      )}

      {activeTab === "modules" && canManageTeaching && role === "school_director_legacy" && (
        <section className="reference-management-page">
          <div className="reference-mini-stats">
            <StatCard tone="blue" label="Modules" value={modules.length} detail="+1 ce mois" />
            <StatCard tone="green" label="Heures / semaine" value={`${modules.reduce((sum, item) => sum + Number(item.weeklyHours || 0), 0)}h`} detail="+2h ce mois" />
            <StatCard tone="green" label="Enseignants" value={schoolTeachers.length} detail="+1 ce mois" />
            <StatCard tone="yellow" label="Élèves concernés" value={dashboard?.stats?.students || 0} detail="+5 ce mois" />
          </div>
          <div className="platform-grid reference-management-grid">
          <form className="platform-panel" onSubmit={submitModule}>
            <h2>{t.moduleManagement}</h2>
            <label><span>{t.name}</span><input required value={moduleForm.name} onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })} /></label>
            <label><span>{t.description}</span><textarea value={moduleForm.description} onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })} /></label>
            <label>
              <span>{t.level}</span>
              <select value={moduleForm.levelName} onChange={(event) => setModuleForm({ ...moduleForm, levelName: event.target.value })}>
                <option value="">{t.allLevels}</option>
                {levels.map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
              </select>
            </label>
            <label><span>{t.weeklyHours}</span><input type="number" min="1" max="12" value={moduleForm.weeklyHours} onChange={(event) => setModuleForm({ ...moduleForm, weeklyHours: event.target.value })} /></label>
            <ChipMultiSelect label={t.classes} options={classes} values={moduleForm.classIds} onChange={(classIds) => setModuleForm({ ...moduleForm, classIds })} placeholder="Sélectionner les classes concernées" />
            <label><span>{t.pedagogicalObjectives}</span><textarea value={moduleForm.pedagogicalObjectives} onChange={(event) => setModuleForm({ ...moduleForm, pedagogicalObjectives: event.target.value })} /></label>
            <button type="submit">{t.createModule}</button>
          </form>

          <div className="platform-panel">
            <h2>{t.modules}</h2>
            <div className="reference-table-toolbar"><input value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)} placeholder="Rechercher un module..." /><button type="button" onClick={() => exportCsv("modules.csv", filteredModules)}>Exporter</button></div>
            <div className="platform-table">
              {filteredModules.map((item) => (
                <div className="platform-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.levelName || t.allLevels} / {item.weeklyHours}h</span>
                  </div>
                  <div className="platform-row-actions"><button type="button" onClick={() => editModule(item)}>Modifier</button><button type="button" onClick={() => deleteModule(item)}>Supprimer</button></div>
                </div>
              ))}
            </div>
          </div>
          </div>
        </section>
      )}

      {activeTab === "schedule" && canGenerateSchedule && (
        <section className="reference-schedule-page">
          <div className="reference-stepper"><span className="active"><b>1</b>Choisir la classe</span><span><b>2</b>Sélectionner les modules</span><span><b>3</b>Générer</span></div>
          <div className="platform-panel reference-schedule-weekbar">
            <button type="button" aria-label="Semaine précédente" onClick={() => setScheduleWeekStart(scheduleWeekStartIso(addScheduleDays(scheduleWeekStart, -7)))}>←</button>
            <span>{directorScheduleWeekLabel}</span>
            <button type="button" aria-label="Semaine suivante" onClick={() => setScheduleWeekStart(scheduleWeekStartIso(addScheduleDays(scheduleWeekStart, 7)))}>→</button>
            <button type="button" onClick={() => setScheduleWeekStart(scheduleWeekStartIso())}>Aujourd'hui</button>
          </div>
          <div className="reference-schedule-grid">
          <form className="platform-panel" onSubmit={generateSchedule}>
            <h2>{t.scheduleGenerator}</h2>
            <label>
              <span>{t.school}</span>
              <select required value={scheduleForm.schoolId} onChange={(event) => setScheduleForm({ ...scheduleForm, schoolId: event.target.value })}>
                <option value="">{t.noSchool}</option>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </label>
            <label>
              <span>{t.className}</span>
              <select required value={scheduleForm.classId} onChange={(event) => {
                const selectedClass = classes.find((item) => String(item.id) === String(event.target.value));
                setScheduleForm({
                  ...scheduleForm,
                  classId: event.target.value,
                  schoolId: selectedClass?.schoolId || scheduleForm.schoolId,
                });
              }}>
                <option value="">{t.selectClass}</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button type="submit">Générer l'emploi du temps</button>
            {scheduleHasUnsavedChanges && schedulePreviewEntries.length > 0 && <button type="button" onClick={saveSchedule}>Enregistrer l'emploi du temps</button>}
            {displayedScheduleEntries.length > 0 && <button type="button" onClick={deleteCurrentSchedule}>Supprimer l'emploi du temps</button>}
          </form>
          <div className="platform-panel">
            <h2>{scheduleHasUnsavedChanges ? "Aperçu de l'emploi du temps" : scheduleId ? "Emploi du temps enregistré" : "Créneaux générés"}</h2>
            <p className="reference-timetable-week">{directorScheduleWeekLabel}</p>
            <div className="reference-timetable">
              <div className="reference-time-head"><b>Heure</b>{directorScheduleDays.map((day) => <b key={day.value}><strong>{day.label}</strong><small>{day.dateLabel}</small></b>)}</div>
              {[...new Set(displayedScheduleEntries.map((entry) => `${String(entry.startTime || "").slice(0, 5)}-${String(entry.endTime || "").slice(0, 5)}`))].map((slot) => <div className="reference-time-row" key={slot}><strong>{slot}</strong>{directorScheduleDays.map((day) => { const entry = displayedScheduleEntries.find((item) => Number(item.dayOfWeek) === day.value && `${String(item.startTime || "").slice(0, 5)}-${String(item.endTime || "").slice(0, 5)}` === slot); return <span key={day.value} className={entry ? scheduleModuleTone(entry) : "is-empty"}>{entry ? <article className="schedule-slot-card"><strong>{entry.moduleName || "Module"}</strong><small>{entry.teacherName || teacherNameById.get(String(entry.teacherId)) || "Enseignant non renseigné"}</small><em>Salle : {scheduleRoomLabel(entry)}</em><div className="schedule-slot-actions"><button type="button" onClick={() => editScheduleEntry(entry)} aria-label="Modifier le créneau">✏ Modifier</button><button type="button" onClick={() => deleteScheduleEntry(entry)} aria-label="Supprimer le créneau">🗑 Supprimer</button></div></article> : <em>—</em>}</span>; })}</div>)}
              {!displayedScheduleEntries.length && <div className="reference-timetable-empty">Sélectionnez une classe puis générez un emploi du temps.</div>}
            </div>
          </div>
          </div>
          <div className="platform-panel">
            <h2>Emplois du temps enregistrés</h2>
            <div className="platform-list">
              {savedSchedules.map((schedule) => (
                <div className="platform-row" key={`${schedule.classId}-${schedule.id}`}>
                  <div>
                    <strong>{schedule.className || "Classe non renseignée"}</strong>
                    <span>{schedule.schoolName || "Établissement non renseigné"}</span>
                  </div>
                  <div>
                    <strong>{(schedule.entries || []).length}</strong>
                    <span>créneau(x)</span>
                  </div>
                  <div>
                    <strong>Enregistré</strong>
                    <span>{formatSavedScheduleDate(schedule.updatedAt || schedule.createdAt)}</span>
                  </div>
                  <div className="platform-row-actions">
                    <button type="button" onClick={() => openSavedSchedule(schedule, "view")}>Voir</button>
                    <button type="button" onClick={() => openSavedSchedule(schedule, "edit")}>Modifier</button>
                    <button type="button" onClick={() => deleteSavedSchedule(schedule)}>Supprimer</button>
                  </div>
                </div>
              ))}
              {!savedSchedules.length && <div className="reference-timetable-empty">Aucun emploi du temps enregistré pour vos classes.</div>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "reports" && (
        <ReportsModule
          reports={reports}
          schools={schools}
          classes={classes}
          modules={modules}
          averageResolutionLabel={averageResolutionLabel}
          onCreate={submitReport}
          onView={viewReport}
          onEdit={editReport}
          onDelete={deleteReport}
          onExport={(rows) => exportCsv("rapports.csv", rows)}
        />
      )}

      {activeTab === "audit" && role === "general_admin" && (
        <section className="reference-data-page admin-audit-page">
          <div className="admin-audit-hero">
            <span className="admin-audit-hero-icon"><DashboardIcon type="reports" /></span>
            <div>
              <h2>Journal d'audit</h2>
              <p>Consultez les opérations récentes effectuées sur la plateforme.</p>
            </div>
          </div>
          <div className="reference-mini-stats">
            <StatCard tone="blue" label="Total événements" value={auditLogs.length} detail="Toutes les entrées" />
            <StatCard tone="green" label="Aujourd'hui" value={auditLogs.filter((item) => new Date(item.createdAt).toDateString() === new Date().toDateString()).length} detail="Ce jour" />
            <StatCard tone="yellow" label="Cette semaine" value={auditLogs.filter((item) => REPORTS_REFERENCE_TIME - new Date(item.createdAt).getTime() <= 7 * 86400000).length} detail="7 derniers jours" />
            <StatCard tone="red" label="Actions critiques" value={auditLogs.filter((item) => String(item.action || "").toLowerCase().includes("delete") || String(item.action || "").toLowerCase().includes("suppression") || String(item.action || "").toLowerCase().includes("reject")).length} detail="Surveillance" />
          </div>
          <Card className="admin-audit-table-card">
            <div className="admin-audit-filterbar">
              <input type="search" value={auditSearch} onChange={(event) => { setAuditSearch(event.target.value); setAuditPage(1); }} placeholder="Rechercher un événement..." />
              <select value={auditUserFilter} onChange={(event) => { setAuditUserFilter(event.target.value); setAuditPage(1); }} aria-label="Utilisateur">
                <option value="all">Tous les utilisateurs</option>
                {auditUserOptions.map((user) => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
              <select value={auditActionFilter} onChange={(event) => { setAuditActionFilter(event.target.value); setAuditPage(1); }} aria-label="Action">
                <option value="all">Toutes les actions</option>
                {auditActionOptions.map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
              <input type="date" value={auditDateFilter} onChange={(event) => { setAuditDateFilter(event.target.value); setAuditPage(1); }} aria-label="Sélectionner une période" />
              <button type="button" className="admin-audit-filter-button" onClick={() => setAuditPage(1)}>Filtres</button>
              <button type="button" className="admin-audit-export-button" onClick={exportVisibleAuditLogs}>Exporter</button>
            </div>
            {filteredAuditLogs.length > 0 ? (
              <>
                <div className="admin-audit-table" role="table" aria-label="Journal d'audit">
                  <div className="admin-audit-row admin-audit-head" role="row">
                    <span role="columnheader">Date</span>
                    <span role="columnheader">Utilisateur</span>
                    <span role="columnheader">Action</span>
                    <span role="columnheader">Entité</span>
                    <span role="columnheader">Description</span>
                    <span role="columnheader">Statut</span>
                    <span role="columnheader">Actions</span>
                  </div>
                  {paginatedAuditLogs.map((row, index) => {
                    const userName = auditUserLabel(row);
                    const actionLabel = auditActionLabel(row);
                    const entityLabel = auditEntityLabel(row);
                    const description = auditDescriptionLabel(row);
                    const status = auditStatusMeta(row);
                    return (
                    <div className="admin-audit-row" role="row" key={row.id || `${row.action}-${row.createdAt}-${index}`}>
                      <span className="admin-audit-date" role="cell" title={formatAdminDate(row.createdAt || row.created_at || row.date) || "Non renseignée"}>{formatAdminDate(row.createdAt || row.created_at || row.date) || "Non renseignée"}</span>
                      <span className="admin-audit-user" role="cell" title={userName}><i>{auditUserInitials(userName)}</i><b>{userName}</b></span>
                      <span role="cell" title={actionLabel}><em className={`admin-audit-action is-${status.tone}`}>{actionLabel}</em></span>
                      <span role="cell" title={entityLabel}><em className={`admin-audit-entity is-${entityLabel.toLowerCase().replaceAll(" ", "-")}`}>{entityLabel}</em></span>
                      <span className="admin-audit-description" role="cell" title={description}>{description}</span>
                      <span role="cell"><em className={`admin-audit-status is-${status.tone}`}>{status.label}</em></span>
                      <span className="admin-audit-actions-cell" role="cell">
                        <details className="admin-audit-menu">
                          <summary aria-label={`Actions pour ${actionLabel}`}>⋮</summary>
                          <div>
                            <button type="button" onClick={() => setMessage(description)}>Consulter</button>
                            <button type="button" onClick={() => exportCsv("journal-audit-ligne.csv", [{ Date: formatAdminDate(row.createdAt || row.created_at || row.date), Utilisateur: userName, Action: actionLabel, Entite: entityLabel, Description: description, IP: auditIpLabel(row), Statut: status.label }])}>Exporter</button>
                          </div>
                        </details>
                      </span>
                    </div>
                    );
                  })}
                </div>
                <div className="admin-audit-pagination">
                  <p>Affichage de {(currentAuditPage - 1) * auditPageSize + 1} à {Math.min(currentAuditPage * auditPageSize, filteredAuditLogs.length)} sur {filteredAuditLogs.length} événements</p>
                  <div>
                    <button type="button" disabled={currentAuditPage === 1} onClick={() => setAuditPage((page) => Math.max(1, page - 1))}>Précédent</button>
                    {auditPaginationItems.map((page, index) => (
                      <Fragment key={page}>
                        {index > 0 && page - auditPaginationItems[index - 1] > 1 && <span>...</span>}
                        <button className={page === currentAuditPage ? "active" : ""} type="button" onClick={() => setAuditPage(page)}>{page}</button>
                      </Fragment>
                    ))}
                    <button type="button" disabled={currentAuditPage === auditTotalPages} onClick={() => setAuditPage((page) => Math.min(auditTotalPages, page + 1))}>Suivant</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="admin-audit-empty">
                <span><DashboardIcon type="reports" /></span>
                <strong>Aucun événement d'audit</strong>
                <p>Aucune opération récente n'est disponible pour le moment.</p>
              </div>
            )}
          </Card>
        </section>
      )}

      {activeTab === "ai" && (
        <section className="platform-panel reference-ai-page">
          <h2>{t.aiLearningProfile}</h2>
          {aiProfile ? (
            <div className={`ai-profile-grid ${scoreToneClass(aiProfile.averageScore)}`}>
              <div><span>{t.estimatedLevel}</span><strong>{translateAiProfileText(aiProfile.estimatedLevel)}</strong></div>
              <div className={`metric-tone-${scoreTone(aiProfile.averageScore)}`}><span>{t.averageScoreLabel}</span><strong>{aiProfile.averageScore}%</strong><ProgressBar value={aiProfile.averageScore} /></div>
              <div><span>{t.strengths}</span><strong>{(aiProfile.strengths || []).map(translateAiProfileText).join(", ") || t.pendingData}</strong></div>
              <div><span>{t.weaknesses}</span><strong>{(aiProfile.weaknesses || []).map(translateAiProfileText).join(", ") || t.pendingData}</strong></div>
              <div><span>{t.recommendations}</span><strong>{(aiProfile.recommendations || []).map(translateAiProfileText).join(" / ")}</strong></div>
              <div><span>Contexte entraîné</span><strong>{aiProfile.scope?.trainedDocuments || 0} document(s), {aiProfile.scope?.trainedModules || 0} module(s)</strong></div>
              <div><span>Périmètre</span><strong>{[aiProfile.scope?.schoolName, aiProfile.scope?.className, aiProfile.scope?.educationLevel].filter(Boolean).join(" / ") || "Profil personnel"}</strong></div>
              <div className="ai-profile-sources"><span>Sources récentes</span><strong>{aiProfile.sources?.map((source) => source.fileName).join(" / ") || "Aucun PDF envoyé"}</strong></div>
            </div>
          ) : (
            <Button onClick={loadAiProfile}>{t.analyzeLearningHistory}</Button>
          )}
        </section>
      )}
      {selectedClass && (
        <div className="admin-class-modal-backdrop" role="presentation">
          <section className="admin-class-modal" role="dialog" aria-modal="true" aria-labelledby="admin-class-modal-title">
            <button className="admin-class-modal-close" type="button" aria-label="Fermer" onClick={() => setSelectedClass(null)}>×</button>
            <header className="admin-class-modal-head">
              <span className="admin-class-modal-avatar">{String(selectedClass.name || "C").slice(0, 2).toUpperCase()}</span>
              <div>
                <h2 id="admin-class-modal-title">{selectedClass.name}</h2>
                <p>{selectedClass.schoolName || schools.find((school) => String(school.id) === String(selectedClass.schoolId))?.name || "Établissement non renseigné"}</p>
                <em className={`admin-class-status is-${classStatusMeta(selectedClass).tone}`}>{classStatusMeta(selectedClass).label}</em>
              </div>
            </header>
            <div className="admin-class-info-grid">
              {[
                { icon: "classes", label: "Classe", value: selectedClass.name || "Non renseigné" },
                { icon: "building", label: "Établissement", value: selectedClass.schoolName || schools.find((school) => String(school.id) === String(selectedClass.schoolId))?.name || "Non renseigné" },
                { icon: "cap", label: "Niveau", value: selectedClass.levelName || "Non renseigné" },
                { icon: "calendar", label: "Année scolaire", value: selectedClass.academicYear || "Non renseigné" },
                { icon: "students", label: "Élèves inscrits", value: classStudentCount(selectedClass) },
                { icon: "shield", label: "Statut", value: classStatusMeta(selectedClass).label },
              ].map((item) => (
                <article className="admin-class-info-card" key={item.label}>
                  <i><UserInfoIcon type={item.icon} /></i>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <footer className="admin-class-modal-footer">
              <button type="button" onClick={() => setSelectedClass(null)}>Fermer</button>
              <button type="button" onClick={() => editClass(selectedClass)}>Modifier</button>
              <button type="button" onClick={() => archiveClass(selectedClass)}>Archiver</button>
            </footer>
          </section>
        </div>
      )}
      {addClassOpen && (
        <div className="admin-add-class-backdrop" role="presentation">
          <aside className="admin-add-class-panel" role="dialog" aria-modal="true" aria-labelledby="admin-add-class-title">
            <header>
              <h2 id="admin-add-class-title">Ajouter une classe</h2>
              <button type="button" aria-label="Fermer" onClick={() => setAddClassOpen(false)}>×</button>
            </header>
            <form onSubmit={submitClass}>
              <label>
                <span>{t.school}</span>
                <select required value={classForm.schoolId} onChange={(event) => setClassForm({ ...classForm, schoolId: event.target.value })}>
                  <option value="">{t.noSchool}</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              </label>
              <label><span>{t.className}</span><input required value={classForm.name} onChange={(event) => setClassForm({ ...classForm, name: event.target.value })} /></label>
              <label>
                <span>{t.moroccanLevel}</span>
                <select required value={classForm.levelName} onChange={(event) => setClassForm({ ...classForm, levelName: event.target.value })}>
                  <option value="">{t.selectLevel}</option>
                  {levels.map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
                </select>
              </label>
              <label><span>{t.academicYear}</span><input required value={classForm.academicYear} onChange={(event) => setClassForm({ ...classForm, academicYear: event.target.value })} /></label>
              <label><span>{t.pedagogicalStructure}</span><textarea value={classForm.pedagogicalStructure} onChange={(event) => setClassForm({ ...classForm, pedagogicalStructure: event.target.value })} /></label>
              <footer>
                <button type="button" onClick={() => setAddClassOpen(false)}>Annuler</button>
                <button type="submit">{t.createClass}</button>
              </footer>
            </form>
          </aside>
        </div>
      )}
      {selectedModule && (
        <div className="admin-module-modal-backdrop" role="presentation">
          <section className="admin-module-modal" role="dialog" aria-modal="true" aria-labelledby="admin-module-modal-title">
            <button className="admin-module-modal-close" type="button" aria-label="Fermer" onClick={() => setSelectedModule(null)}>×</button>
            <header className="admin-module-modal-head">
              <span className="admin-module-modal-avatar"><DashboardIcon type="modules" /></span>
              <div>
                <h2 id="admin-module-modal-title">{selectedModule.name}</h2>
                <p>{moduleCodeLabel(selectedModule)} • {selectedModule.levelName || t.allLevels}</p>
                <em className={`admin-module-status is-${moduleStatusMeta(selectedModule).tone}`}>{moduleStatusMeta(selectedModule).label}</em>
              </div>
            </header>
            <div className="admin-module-info-grid">
              {[
                { icon: "modules", label: "Module", value: selectedModule.name || "Non renseigné" },
                { icon: "id", label: "Code", value: moduleCodeLabel(selectedModule) },
                { icon: "building", label: "Établissement", value: selectedModule.schoolName || selectedModule.establishmentName || "Non renseigné" },
                { icon: "classes", label: "Classes associées", value: moduleClassLabel(selectedModule) },
                { icon: "courses", label: "Nombre de cours", value: moduleCourseCount(selectedModule) },
                { icon: "cap", label: "Niveau", value: selectedModule.levelName || t.allLevels },
                { icon: "calendar", label: "Heures / semaine", value: `${selectedModule.weeklyHours || 0}h` },
              ].map((item) => (
                <article className="admin-module-info-card" key={item.label}>
                  <i><UserInfoIcon type={item.icon} /></i>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <footer className="admin-module-modal-footer">
              <button type="button" onClick={() => setSelectedModule(null)}>Fermer</button>
              <button type="button" onClick={() => editModule(selectedModule)}>Modifier</button>
              <button type="button" onClick={() => deleteModule(selectedModule)}>Supprimer</button>
            </footer>
          </section>
        </div>
      )}
      {addModuleOpen && (
        <div className="admin-add-module-backdrop" role="presentation">
          <aside className="admin-add-module-panel" role="dialog" aria-modal="true" aria-labelledby="admin-add-module-title">
            <header>
              <h2 id="admin-add-module-title">Ajouter un module</h2>
              <button type="button" aria-label="Fermer" onClick={() => setAddModuleOpen(false)}>×</button>
            </header>
            <form onSubmit={submitModule}>
              <label><span>{t.name}</span><input required value={moduleForm.name} onChange={(event) => setModuleForm({ ...moduleForm, name: event.target.value })} /></label>
              <label><span>{t.description}</span><textarea value={moduleForm.description} onChange={(event) => setModuleForm({ ...moduleForm, description: event.target.value })} /></label>
              <label>
                <span>{t.level}</span>
                <select value={moduleForm.levelName} onChange={(event) => setModuleForm({ ...moduleForm, levelName: event.target.value })}>
                  <option value="">{t.allLevels}</option>
                  {levels.map((level) => <option key={level.name} value={level.name}>{level.name}</option>)}
                </select>
              </label>
              <label><span>{t.weeklyHours}</span><input type="number" min="1" max="12" value={moduleForm.weeklyHours} onChange={(event) => setModuleForm({ ...moduleForm, weeklyHours: event.target.value })} /></label>
              <ChipMultiSelect label={t.classes} options={classes} values={moduleForm.classIds} onChange={(classIds) => setModuleForm({ ...moduleForm, classIds })} placeholder="Sélectionner les classes concernées" />
              <label><span>{t.pedagogicalObjectives}</span><textarea value={moduleForm.pedagogicalObjectives} onChange={(event) => setModuleForm({ ...moduleForm, pedagogicalObjectives: event.target.value })} /></label>
              <footer>
                <button type="button" onClick={() => setAddModuleOpen(false)}>Annuler</button>
                <button type="submit">{t.createModule}</button>
              </footer>
            </form>
          </aside>
        </div>
      )}
      {selectedSchool && (isAdminSchoolsPage || isDirectorSchoolsPage) && (
        <div className="admin-school-modal-backdrop" role="presentation">
          <section className="admin-school-modal" role="dialog" aria-modal="true" aria-labelledby="admin-school-modal-title">
            <button className="admin-school-modal-close" type="button" aria-label="Fermer" onClick={() => setSelectedSchool(null)}>×</button>
            <header className="admin-school-modal-head">
              <span className="admin-school-modal-avatar">
                {schoolLogoSrc(selectedSchool) ? <img alt="" src={schoolLogoSrc(selectedSchool)} /> : <DashboardIcon type="school" />}
              </span>
              <div>
                <h2 id="admin-school-modal-title">{schoolDisplayName(selectedSchool)}</h2>
                <p>{schoolLocationLabel(selectedSchool)}</p>
                <em className={`admin-school-status is-${schoolStatusMeta(selectedSchool).tone}`}>{schoolStatusMeta(selectedSchool).label}</em>
              </div>
            </header>
            <div className="admin-school-info-grid">
              {[
                { icon: "building", label: "Nom", value: schoolDisplayName(selectedSchool) },
                { icon: "map", label: "Ville", value: selectedSchool.city || "Non renseigné" },
                { icon: "map", label: "Pays", value: selectedSchool.country || "Non renseigné" },
                { icon: "mail", label: "Email directeur", value: selectedSchool.directorEmail || selectedSchool.director?.email || "Non renseigné" },
                { icon: "building", label: "Logo", value: selectedSchool.logoUrl || "Non renseigné" },
                { icon: "info", label: "Statut", value: schoolStatusMeta(selectedSchool).label },
                { icon: "building", label: "Type d’école", value: schoolTypeLabel(selectedSchool) },
                { icon: "user", label: "Directeur", value: schoolDirectorLabel(selectedSchool) },
                { icon: "mail", label: "Email officiel", value: schoolEmailLabel(selectedSchool) },
                { icon: "phone", label: "Téléphone", value: selectedSchool.phone || "Non renseigné" },
                { icon: "map", label: "Adresse", value: selectedSchool.address || "Non renseigné" },
                { icon: "calendar", label: "Date de création", value: schoolCreatedLabel(selectedSchool) },
              ].map((item) => (
                <article className="admin-school-info-card" key={item.label}>
                  <i><UserInfoIcon type={item.icon} /></i>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
              <article className="admin-school-info-card">
                <i><UserInfoIcon type="modules" /></i>
                <span>Documents et liens</span>
                <strong>
                  {schoolLegalDocuments(selectedSchool).length ? schoolLegalDocuments(selectedSchool).map((document, index) => {
                    const documents = schoolLegalDocuments(selectedSchool);
                    const url = schoolDocumentUrl(document);
                    const label = schoolDocumentLabel(document, index);
                    return url ? (
                      <Fragment key={`${label}-${index}`}>
                        {isProtectedSchoolDocument(document) ? (
                          <a href={url} onClick={(event) => { event.preventDefault(); openSchoolDocument(document, index); }}>{label}</a>
                        ) : (
                          <a href={url} target="_blank" rel="noreferrer">{label}</a>
                        )}
                        {index < documents.length - 1 ? " / " : ""}
                      </Fragment>
                    ) : (
                      <Fragment key={`${label}-${index}`}>
                        {label}
                        {index < documents.length - 1 ? " / " : ""}
                      </Fragment>
                    );
                  }) : "Aucun document"}
                </strong>
              </article>
            </div>
            <footer className="admin-school-modal-footer">
              <button type="button" onClick={() => setSelectedSchool(null)}>Fermer</button>
              {isAdminSchoolsPage && schoolStatusMeta(selectedSchool).tone === "pending" ? (
                <>
                  <button type="button" onClick={() => { decideSchool(selectedSchool.id, "approved"); setSelectedSchool(null); }}>Approuver</button>
                  <button type="button" onClick={() => { decideSchool(selectedSchool.id, "rejected"); setSelectedSchool(null); }}>Refuser</button>
                </>
              ) : isDirectorSchoolsPage ? (
                <button type="button" onClick={() => { editSchool(selectedSchool); setSelectedSchool(null); }}>Modifier</button>
              ) : (
                <button type="button">Modifier</button>
              )}
            </footer>
          </section>
        </div>
      )}
      {selectedProfile && isAdminPeoplePage && (
        <div className="admin-user-modal-backdrop" role="presentation">
          <section className="admin-user-profile-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-profile-title">
            <button className="admin-user-modal-close" type="button" aria-label="Fermer" onClick={() => setSelectedProfile(null)}>×</button>
            <header className="admin-user-modal-head">
                      <Avatar user={selectedProfile} name={userDisplayName(selectedProfile)} size={74} clickable className="admin-user-modal-avatar" />
              <div>
                <h2 id="admin-user-profile-title">{userDisplayName(selectedProfile)}</h2>
                <p>{selectedProfile.email || "Non renseigné"}</p>
                <em className="admin-user-role">{userRoleLabel(selectedProfile)}</em>
              </div>
            </header>
            <div className="admin-user-info-grid">
              {[
                { icon: "calendar", label: "Créé le", value: userCreatedLabel(selectedProfile) },
                { icon: "shield", label: "Rôle", value: userRoleLabel(selectedProfile) },
                { icon: "user", label: "Statut", status: userStatusMeta(selectedProfile) },
                { icon: "cap", label: "Niveau d’accès", value: userAccessLabel(selectedProfile) },
                { icon: "mail", label: "Email", value: selectedProfile.email || "Non renseigné" },
                { icon: "id", label: "ID Utilisateur", value: selectedProfile.id || selectedProfile.userId || "Non renseigné" },
              ].map((item) => (
                <article className="admin-user-info-card" key={item.label}>
                  <i><UserInfoIcon type={item.icon} /></i>
                  <span>{item.label}</span>
                  {item.status ? (
                    <em className={`admin-user-status is-${item.status.tone}`}>
                      <b aria-hidden="true" />
                      {item.status.label}
                    </em>
                  ) : (
                    <strong>{item.value}</strong>
                  )}
                </article>
              ))}
            </div>
            <footer className="admin-user-modal-footer">
              <button type="button" onClick={() => setSelectedProfile(null)}>Fermer</button>
            </footer>
          </section>
        </div>
      )}
      {selectedProfile && !isAdminPeoplePage && <div className="profile-modal-backdrop" role="dialog" aria-modal="true"><section className="managed-profile-modal"><button className="modal-close" type="button" onClick={() => setSelectedProfile(null)}>×</button><div className="managed-profile-head"><span>{selectedProfile.name?.charAt(0)}</span><div><h2>{selectedProfile.name}</h2><p>{selectedProfile.email}</p><Badge>{selectedProfile.role}</Badge></div></div><div className="managed-profile-grid">{Object.entries(selectedProfile).filter(([key, value]) => !["id", "name", "email", "role"].includes(key) && value !== null && value !== "").map(([key, value]) => <div key={key}><small>{key.replace(/([A-Z])/g, " $1")}</small><strong>{String(value)}</strong></div>)}</div></section></div>}
      {addUserOpen && isAdminPeoplePage && (
        <div className="admin-add-user-backdrop" role="presentation">
          <aside className="admin-add-user-panel" role="dialog" aria-modal="true" aria-labelledby="admin-add-user-title">
            <header>
              <h2 id="admin-add-user-title">Ajouter un utilisateur</h2>
              <button type="button" aria-label="Fermer" onClick={closeAddUserPanel}>×</button>
            </header>
            <form onSubmit={submitAddUserPanel}>
              <label>
                <span>Nom complet</span>
                <input required value={addUserForm.name} onChange={(event) => setAddUserForm({ ...addUserForm, name: event.target.value })} placeholder="Entrez le nom complet" />
              </label>
              <label>
                <span>Adresse e-mail</span>
                <input required type="email" value={addUserForm.email} onChange={(event) => setAddUserForm({ ...addUserForm, email: event.target.value })} placeholder="Entrez l’adresse e-mail" />
              </label>
              <label>
                <span>Mot de passe</span>
                <input required type="password" minLength={8} value={addUserForm.password} onChange={(event) => setAddUserForm({ ...addUserForm, password: event.target.value })} placeholder="8 caractères minimum" />
              </label>
              <label>
                <span>Rôle</span>
                <select required value={addUserForm.role} onChange={(event) => setAddUserForm({ ...addUserForm, role: event.target.value, accessLevel: event.target.value })}>
                  <option value="">Sélectionnez un rôle</option>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
              </label>
              <label>
                <span>Établissement</span>
                <select required value={addUserForm.schoolId} onChange={(event) => setAddUserForm({ ...addUserForm, schoolId: event.target.value })}>
                  <option value="">Sélectionnez un établissement</option>
                  {approvedSchoolOptions.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              </label>
              <label>
                <span>Statut</span>
                <select value={addUserForm.status} onChange={(event) => setAddUserForm({ ...addUserForm, status: event.target.value })}>
                  <option value="active">Actif</option>
                  <option value="disabled">Inactif</option>
                </select>
              </label>
              <footer>
                <button type="button" onClick={closeAddUserPanel}>Annuler</button>
                <button type="submit">Enregistrer</button>
              </footer>
            </form>
          </aside>
        </div>
      )}
      {addSchoolOpen && isAdminSchoolsPage && (
        <div className="admin-add-school-backdrop" role="presentation">
          <aside className="admin-add-school-panel" role="dialog" aria-modal="true" aria-labelledby="admin-add-school-title">
            <header>
              <h2 id="admin-add-school-title">Ajouter un établissement</h2>
              <button type="button" aria-label="Fermer" onClick={closeAddSchoolPanel}>×</button>
            </header>
            <form onSubmit={submitAddSchoolPanel}>
              {[
                ["name", "Nom de l’établissement"],
                ["schoolType", "Type d’école"],
                ["city", "Ville"],
                ["country", "Pays"],
                ["phone", "Téléphone"],
                ["officialEmail", "Email officiel"],
                ["directorName", "Nom du directeur"],
                ["directorEmail", "Email du directeur"],
                ["address", "Adresse"],
                ["logoUrl", "URL du logo"],
              ].map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type={key.toLowerCase().includes("email") ? "email" : "text"}
                    value={addSchoolForm[key]}
                    onChange={(event) => setAddSchoolForm({ ...addSchoolForm, [key]: event.target.value })}
                    placeholder={label}
                  />
                </label>
              ))}
              <footer>
                <button type="button" onClick={closeAddSchoolPanel}>Annuler</button>
                <button type="submit">Enregistrer</button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </LearnixLayout>
  );
}

function DashboardIcon({ type }) {
  const paths = {
    school: <><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M6 13v6M10 15v4M14 15v4M18 13v6M4 19h16" /></>,
    classes: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M17 11a4 4 0 0 1 4 4v2" /></>,
    teacher: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v4c2.5 2 7.5 2 10 0v-4M21 9v6" /></>,
    students: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4.5" /></>,
    assignments: <><path d="M7 7a3 3 0 1 0 0.01 0M17 17a3 3 0 1 0 0.01 0" /><path d="M10 7h4a3 3 0 0 1 3 3v4M14 17h-4a3 3 0 0 1-3-3v-4M15 5l2 2-2 2M9 19l-2-2 2-2" /></>,
    requests: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h4" /><path d="m14 18 1.5 1.5L19 16" /></>,
    modules: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>,
    courses: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z" /><path d="M4 5.5v13" /></>,
    activity: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 19h22" /></>,
    quiz: <><path d="M6 3h12v18H6zM9 8h6M9 12h3" /><path d="m14 15 1.5 1.5L19 13" /></>,
    reports: <><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[type] || paths.modules}</svg>;
}

export default PlatformManagement;


