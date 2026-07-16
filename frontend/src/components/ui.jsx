import { scoreTone } from "../utils/scoreTone";

export function Button({ children, className = "", variant = "primary", ...props }) {
  return (
    <button className={`ui-button ui-button-${variant} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`ui-card ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "info" }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

function StatIcon({ label }) {
  const normalized = String(label || "").toLowerCase();
  let path = <path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5" />;

  if (normalized.includes("école") || normalized.includes("ecole")) path = <path d="m3 10 9-5 9 5M5 10v8h14v-8M9 18v-5h6v5" />;
  else if (normalized.includes("classe")) path = <path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14M9 13h6M9 16h4" />;
  else if (normalized.includes("enseign") || normalized.includes("utilisateur") || normalized.includes("élève") || normalized.includes("eleve")) path = <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0M18 8a3 3 0 0 1 2.5 4.7M20 16a5 5 0 0 1 2 4" />;
  else if (normalized.includes("module") || normalized.includes("cours")) path = <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm3 0v13a3 3 0 0 0-3 3" />;
  else if (normalized.includes("heure") || normalized.includes("attente") || normalized.includes("cours")) path = <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" />;
  else if (normalized.includes("approuv")) path = <path d="m5 12 4 4L19 6" />;
  else if (normalized.includes("refus")) path = <path d="m6 6 12 12M18 6 6 18" />;
  else if (normalized.includes("affect")) path = <path d="M8 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 13a5 5 0 0 1 10 0M16 10h5M18.5 7.5v5M14 19l2 2 5-6" />;
  else if (normalized.includes("rapport") || normalized.includes("résolu") || normalized.includes("resolu")) path = <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6M9 18h4" />;
  else if (normalized.includes("total")) path = <path d="M12 3v9h9A9 9 0 1 1 12 3Zm3 0a6 6 0 0 1 6 6h-6V3Z" />;

  return <svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg>;
}

export function StatCard({ label, value, detail, tone = "neutral" }) {
  return (
    <Card className={`ui-stat-card metric-tone-${tone}`}>
      <span className="ui-stat-icon"><StatIcon label={label} /></span>
      <span className="ui-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </Card>
  );
}

export function Tabs({ items, active, onChange }) {
  return (
    <div className="platform-tabs" role="tablist">
      {items.map((item) => {
        const value = typeof item === "string" ? item : item.id;
        const label = typeof item === "string" ? item : item.label;

        return (
        <button
          className={active === value ? "active" : ""}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {label}
        </button>
        );
      })}
    </div>
  );
}

export function AlertMessage({ children, tone = "info" }) {
  return <div className={`platform-message ui-alert-${tone}`}>{children}</div>;
}

export function EmptyState({ title, body }) {
  return (
    <div className="ui-empty-state">
      <strong>{title}</strong>
      {body && <p>{body}</p>}
    </div>
  );
}

export function LoadingSpinner({ label = "Loading..." }) {
  return <div className="ui-loading-spinner">{label}</div>;
}

export function ProgressBar({ value = 0 }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`ui-progress-bar score-tone-${scoreTone(percent)}`} aria-label="Progress">
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Table({ columns, rows, emptyText = "No data yet." }) {
  if (!rows.length) {
    return <EmptyState title={emptyText} />;
  }

  return (
    <div className="ui-table" role="table">
      <div className="ui-table-row ui-table-head" role="row">
        {columns.map((column) => <span key={column.key} role="columnheader">{column.label}</span>)}
      </div>
      {rows.map((row, index) => (
        <div className="ui-table-row" key={row.id || index} role="row">
          {columns.map((column) => (
            <span key={column.key} role="cell">
              {column.render ? column.render(row) : row[column.key]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
