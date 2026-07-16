import { useEffect, useMemo, useState } from "react";
import LearnixLayout from "../components/LearnixLayout";
import { apiFetch, readApiJson } from "../services/api";

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function fileNameForCourse(course) {
  const raw = safeText(course.pdfName || course.title || "cours.pdf", "cours.pdf").trim() || "cours.pdf";
  return raw.toLowerCase().endsWith(".pdf") ? raw : `${raw}.pdf`;
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = String(dataUrl || "").split(",", 2);
  if (!header?.includes("application/pdf") || !base64) return null;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

function formatCourseDate(value) {
  if (!value) return "Non renseignée";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return safeText(value).slice(0, 10);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function StudentCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyPdf, setBusyPdf] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadCourses = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiFetch("/api/student/courses");
        const data = await readApiJson(response, "Impossible de charger vos cours.");
        if (cancelled) return;
        setCourses(Array.isArray(data?.courses) ? data.courses : []);
        if (data?.success === false) setError(data?.message || "Impossible de charger vos cours.");
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Impossible de charger vos cours.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCourses();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) => [
      course.title,
      course.moduleName,
      course.teacherName,
      course.className,
      course.pdfName,
    ].some((value) => safeText(value).toLowerCase().includes(query)));
  }, [courses, search]);

  const preparePdfBlob = (course) => {
    if (course.content && String(course.content).startsWith("data:application/pdf")) {
      return dataUrlToBlob(course.content);
    }
    const content = `Cours: ${safeText(course.title)}\nModule: ${safeText(course.moduleName)}\nEnseignant: ${safeText(course.teacherName)}\nFichier: ${fileNameForCourse(course)}`;
    return new Blob([content], { type: "text/plain;charset=utf-8" });
  };

  const openCourse = async (course) => {
    const tab = window.open("", "_blank", "noopener,noreferrer");
    setBusyPdf({ id: course.id, action: "open" });
    try {
      const blob = preparePdfBlob(course);
      if (!blob) throw new Error("PDF indisponible.");
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (openError) {
      if (tab) tab.close();
      setError(openError?.message || "Impossible d'ouvrir le PDF.");
    } finally {
      setBusyPdf(null);
    }
  };

  const downloadCourse = async (course) => {
    setBusyPdf({ id: course.id, action: "download" });
    try {
      const blob = preparePdfBlob(course);
      if (!blob) throw new Error("PDF indisponible.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameForCourse(course);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError?.message || "Impossible de télécharger le PDF.");
    } finally {
      setBusyPdf(null);
    }
  };

  return (
    <LearnixLayout
      className="student-modules-page student-courses-page"
      title="Cours"
      subtitle="Consultez les cours PDF partagés par vos enseignants."
    >
      <section className="student-courses-shell">
        <div className="student-courses-header-card">
          <label className="student-courses-search">
            <CourseIcon type="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par cours, module ou enseignant..." />
          </label>
          <p>{filteredCourses.length} cours affiché{filteredCourses.length > 1 ? "s" : ""}</p>
        </div>

        {loading ? (
          <div className="student-modules-empty"><h2>Chargement des cours...</h2></div>
        ) : error ? (
          <div className="student-modules-empty"><h2>Cours indisponibles</h2><p>{error}</p></div>
        ) : filteredCourses.length ? (
          <div className="student-courses-list" aria-label="Cours disponibles">
            <div className="student-courses-list-head" aria-hidden="true">
              <span>Cours</span>
              <span>Module</span>
              <span>Enseignant</span>
              <span>Classe</span>
              <span>Date</span>
              <span>Actions</span>
            </div>
            {filteredCourses.map((course) => {
              const isOpening = busyPdf?.id === course.id && busyPdf?.action === "open";
              const isDownloading = busyPdf?.id === course.id && busyPdf?.action === "download";
              return (
                <article className="student-course-row" key={course.id}>
                  <div className="student-course-title-cell">
                    <strong>{course.title || "Cours sans titre"}</strong>
                    <small>{course.schoolName || "Établissement non renseigné"}</small>
                  </div>
                  <span className="student-course-meta"><CourseIcon type="module" />{course.moduleName || "Module non renseigné"}</span>
                  <span className="student-course-meta student-course-teacher"><CourseIcon type="teacher" />{course.teacherName || "Enseignant non renseigné"}</span>
                  <span className="student-course-meta"><CourseIcon type="class" />{course.className || "Classe non renseignée"}</span>
                  <span className="student-course-meta student-course-date"><CourseIcon type="date" />{formatCourseDate(course.createdAt)}</span>
                  <div className="student-course-actions">
                    <button type="button" disabled={isOpening} onClick={() => openCourse(course)}><CourseIcon type="open" />{isOpening ? "Ouverture..." : "Ouvrir le PDF"}</button>
                    <button type="button" disabled={isDownloading} onClick={() => downloadCourse(course)}><CourseIcon type="download" />{isDownloading ? "Téléchargement..." : "Télécharger"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="student-modules-empty">
            <h2>Aucun cours disponible.</h2>
            <p>Les cours partagés par vos enseignants apparaîtront ici.</p>
          </div>
        )}
      </section>
    </LearnixLayout>
  );
}

function CourseIcon({ type }) {
  const icons = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    module: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" /><path d="M8 7h8" /></>,
    teacher: <><circle cx="12" cy="7" r="4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></>,
    class: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
    date: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    open: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[type] || icons.module}</svg>;
}

export default StudentCourses;
