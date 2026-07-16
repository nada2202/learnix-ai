import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LearnixLayout from "../components/LearnixLayout";
import { useLanguage } from "../context/LanguageContext";
import { apiFetch, readApiJson } from "../services/api";
import { localizedCategory } from "../utils/localizedLabels";
import studentBooksReference from "../assets/student-books-reference.png";

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function moduleInitial(name) {
  return safeText(name).trim().charAt(0).toUpperCase() || "?";
}

function normalizeStudentModule(module, index) {
  if (!module || typeof module !== "object") return null;
  const name = safeText(module.name, "Module sans nom").trim() || "Module sans nom";
  const progress = Math.max(0, Math.min(100, safeNumber(module.progress ?? module.progressPercentage, 0)));

  return {
    id: module.id ?? `module-${index}`,
    name,
    description: safeText(module.description || module.pedagogicalObjectives, "Aucune description disponible pour ce module."),
    classId: module.classId || module.class_id || "",
    schoolId: module.schoolId || module.school_id || "",
    className: safeText(module.className, ""),
    teacherId: module.teacherId || module.teacher_id || "",
    teacherName: safeText(module.teacherName || module.teacher, ""),
    schoolName: safeText(module.schoolName, ""),
    progress,
    quizCount: safeNumber(module.quizCount || module.quizzesCount || module.totalQuizzes, 0),
    courseCount: safeNumber(module.pdfCount || module.courseCount || module.coursesCount || module.totalCourses, 0),
  };
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function normalizeModulesResponse(data) {
  return firstArray(
    data?.modules,
    data?.assignedModules,
    data?.profile?.modules,
    data?.student?.modules,
    data?.data?.modules,
    data?.data?.assignedModules,
  ).map(normalizeStudentModule).filter(Boolean);
}

function StudentModules() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const requestIdRef = useRef(0);
  const [modules, setModules] = useState([]);
  const [profile, setProfile] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadModules = useCallback(async ({ resetLoading = true, signal } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (resetLoading) setLoading(true);
    setError("");

    try {
      const response = await apiFetch("/api/student/profile", { signal });
      const data = await readApiJson(response, "Impossible de charger vos modules.");
      if (requestIdRef.current !== requestId) return;

      if (data?.success === false) {
        setError(data?.message || "Impossible de charger vos modules.");
        return;
      }

      setProfile(data?.profile || null);
      setModules(normalizeModulesResponse(data));
    } catch (loadError) {
      if (requestIdRef.current !== requestId) return;
      if (loadError?.name === "AbortError") return;
      setError(loadError?.message || "Impossible de charger vos modules.");
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadModules({ resetLoading: true, signal: controller.signal });
    return () => {
      controller.abort();
      requestIdRef.current += 1;
    };
  }, [loadModules]);

  useEffect(() => {
    const refreshOnStatsChange = (event) => {
      if (event.key === "dashboardStatsRefresh") {
        loadModules({ resetLoading: false });
      }
    };
    const refreshOnFocus = () => loadModules({ resetLoading: false });
    window.addEventListener("storage", refreshOnStatsChange);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("storage", refreshOnStatsChange);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [loadModules]);

  const filteredModules = useMemo(() => {
    const safeModules = Array.isArray(modules) ? modules : [];
    const query = search.trim().toLowerCase();
    if (!query) return safeModules;
    return safeModules.filter((module) => [
      module?.name,
      module?.description,
      module?.className,
      module?.teacherName,
      module?.schoolName,
    ].some((value) => safeText(value).toLowerCase().includes(query)));
  }, [modules, search]);

  const renderEmptyState = (title, body, showImage = false, action = null) => (
    <section className="student-modules-empty">
      {showImage ? <img src={studentBooksReference} alt="" aria-hidden="true" /> : <span><StudentModulesIcon type="modules" /></span>}
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );

  return (
    <LearnixLayout
      className="student-dashboard-page student-modules-page"
      title="Modules concernés"
      subtitle="Consultez tous les modules qui vous sont attribués."
      searchPlaceholder="Rechercher des modules, cours, notions..."
    >
      <div className="student-modules-shell">
        <section className="student-modules-toolbar" aria-label="Recherche des modules">
          <label>
            <span aria-hidden="true"><StudentModulesIcon type="search" /></span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un module..."
            />
          </label>
          <p>{filteredModules.length} module{filteredModules.length > 1 ? "s" : ""} affiché{filteredModules.length > 1 ? "s" : ""}</p>
        </section>

        {loading ? (
          renderEmptyState("Chargement des modules...", "Nous récupérons les modules attribués à votre compte.")
        ) : error && !filteredModules.length ? (
          renderEmptyState(
            "Modules indisponibles",
            error,
            false,
            <button type="button" onClick={loadModules}>Réessayer</button>,
          )
        ) : filteredModules.length ? (
          <section className="student-modules-grid" aria-label="Modules attribués">
            {filteredModules.map((module, index) => {
              const moduleName = safeText(module?.name, "Module sans nom");
              const moduleTitle = localizedCategory(moduleName, language) || "Module sans nom";
              const teacherLabel = safeText(module?.teacherName, "Non assigné") || "Non assigné";
              const progress = Math.max(0, Math.min(100, safeNumber(module?.progress, 0)));
              const initial = moduleInitial(moduleName);

              return (
                <article className="student-module-card" key={module?.id || `${moduleName}-${index}`}>
                  <div className={`student-module-cover student-module-cover-${index % 4}`} aria-hidden="true">
                    <span>{initial}</span>
                    <StudentModulesIcon type="modules" />
                  </div>

                  <div className="student-module-card-head">
                    <span className={`student-module-avatar tone-${["blue", "purple", "green", "orange"][index % 4]}`} aria-hidden="true">
                      {initial}
                    </span>
                    <div>
                      <h2>{moduleTitle}</h2>
                      <p>{teacherLabel}</p>
                    </div>
                  </div>

                  <p className="student-module-description">
                    {module?.description || "Aucune description disponible pour ce module."}
                  </p>

                  <dl className="student-module-meta">
                    <div>
                      <dt>Classe</dt>
                      <dd>{module?.className || profile?.className || "Classe non assignée"}</dd>
                    </div>
                    <div>
                      <dt>Quiz</dt>
                      <dd>{module?.quizCount || 0}</dd>
                    </div>
                    <div>
                      <dt>Cours PDF</dt>
                      <dd>{module?.courseCount || 0}</dd>
                    </div>
                  </dl>

                  <div className="student-module-progress">
                    <span>
                      <b>Progression</b>
                      <strong>{progress}%</strong>
                    </span>
                    <i><em style={{ width: `${progress}%` }} /></i>
                  </div>

                  <button type="button" onClick={() => navigate(`/chatbot?moduleId=${encodeURIComponent(module?.id || "")}`)}>Continuer</button>
                </article>
              );
            })}
          </section>
        ) : (
          renderEmptyState("Aucun module attribué.", "Votre enseignant vous attribuera bientôt des modules.", true)
        )}
      </div>
    </LearnixLayout>
  );
}

function StudentModulesIcon({ type }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" };

  if (type === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M10.5 5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
        <path {...common} d="M15 15l4 4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
      <path {...common} d="M8 4v13a3 3 0 0 0-3 3M11 9h5M11 13h5" />
    </svg>
  );
}

export default StudentModules;
