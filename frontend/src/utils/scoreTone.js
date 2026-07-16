export function scoreTone(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  if (score < 40) return "red";
  if (score < 60) return "orange";
  if (score < 75) return "yellow";
  if (score < 90) return "green";
  return "blue";
}

export function scoreToneClass(value, prefix = "score-tone") {
  return `${prefix}-${scoreTone(value)}`;
}
