const CATEGORY_LABELS = {
  history: { fr: "Histoire", en: "History", ar: "التاريخ" },
  histoire: { fr: "Histoire", en: "History", ar: "التاريخ" },
  mathematics: { fr: "Mathématiques", en: "Mathematics", ar: "الرياضيات" },
  math: { fr: "Mathématiques", en: "Mathematics", ar: "الرياضيات" },
  mathématiques: { fr: "Mathématiques", en: "Mathematics", ar: "الرياضيات" },
  science: { fr: "Sciences", en: "Science", ar: "العلوم" },
  sciences: { fr: "Sciences", en: "Science", ar: "العلوم" },
  physics: { fr: "Physique", en: "Physics", ar: "الفيزياء" },
  "physique-chimie": { fr: "Physique-Chimie", en: "Physics-Chemistry", ar: "الفيزياء والكيمياء" },
  chemistry: { fr: "Chimie", en: "Chemistry", ar: "الكيمياء" },
  english: { fr: "Anglais", en: "English", ar: "الإنجليزية" },
  anglais: { fr: "Anglais", en: "English", ar: "الإنجليزية" },
  programming: { fr: "Programmation", en: "Programming", ar: "البرمجة" },
  programmation: { fr: "Programmation", en: "Programming", ar: "البرمجة" },
  informatique: { fr: "Informatique", en: "Computer Science", ar: "المعلوميات" },
  computer: { fr: "Informatique", en: "Computer Science", ar: "المعلوميات" },
  svt: { fr: "SVT", en: "Life and Earth Sciences", ar: "علوم الحياة والأرض" },
};

const DIFFICULTY_LABELS = {
  easy: { fr: "Facile", en: "Easy", ar: "سهل" },
  medium: { fr: "Moyen", en: "Medium", ar: "متوسط" },
  hard: { fr: "Difficile", en: "Hard", ar: "صعب" },
};

export function localizedCategory(value, language = "fr") {
  const original = String(value || "").trim();
  if (!original) return language === "fr" ? "Quiz" : "Quiz";
  const normalized = original.toLowerCase();
  const direct = CATEGORY_LABELS[normalized];
  if (direct) return direct[language] || direct.fr || original;
  const partial = Object.entries(CATEGORY_LABELS).find(([key]) => normalized.includes(key));
  if (partial) return partial[1][language] || partial[1].fr || original;
  return original;
}

export function localizedDifficulty(value, language = "fr") {
  const original = String(value || "").trim();
  if (!original) return "";
  const normalized = original.toLowerCase();
  const labels = DIFFICULTY_LABELS[normalized];
  return labels ? labels[language] || labels.fr || original : original;
}

export function localizedQuizLabel(value, language = "fr") {
  return localizedCategory(value, language);
}
