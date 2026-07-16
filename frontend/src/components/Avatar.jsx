import { useEffect, useState } from "react";
import { apiUrl } from "../services/api";

function initialsFromName(name) {
  const parts = String(name || "Utilisateur")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function avatarSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : apiUrl(raw);
}

function Avatar({
  user,
  name,
  src,
  size = 44,
  status,
  clickable = false,
  className = "",
  title,
}) {
  const displayName = name || user?.name || user?.fullName || user?.email || "Utilisateur";
  const resolvedSrc = avatarSrc(src || user?.avatar_url || user?.avatarUrl);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const showImage = resolvedSrc && !failed;

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  const avatar = (
    <span
      className={`learnix-avatar ${className} ${showImage ? "has-image" : "has-initials"} ${status ? `is-${status}` : ""}`}
      style={{ "--avatar-size": `${size}px` }}
      title={title || displayName}
      aria-label={displayName}
      role={clickable && showImage ? "button" : "img"}
      tabIndex={clickable && showImage ? 0 : undefined}
      onClick={() => clickable && showImage && setPreviewOpen(true)}
      onKeyDown={(event) => {
        if (clickable && showImage && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setPreviewOpen(true);
        }
      }}
    >
      {showImage ? <img src={resolvedSrc} alt="" onError={() => setFailed(true)} /> : <b>{initialsFromName(displayName)}</b>}
      {status && <i aria-label={status === "online" ? "En ligne" : "Hors ligne"} />}
    </span>
  );

  return (
    <>
      {avatar}
      {previewOpen && showImage && (
        <div className="avatar-preview-backdrop" role="presentation" onMouseDown={() => setPreviewOpen(false)}>
          <section className="avatar-preview-modal" role="dialog" aria-modal="true" aria-label={`Photo de ${displayName}`} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Fermer" onClick={() => setPreviewOpen(false)}>×</button>
            <img src={resolvedSrc} alt={displayName} />
          </section>
        </div>
      )}
    </>
  );
}

export default Avatar;
