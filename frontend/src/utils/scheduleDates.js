const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long" });
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const dayNumberFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit" });

function toScheduleDate(value = new Date()) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addScheduleDays(date, days) {
  const next = toScheduleDate(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getScheduleWeekStartForDate(value = new Date()) {
  const current = toScheduleDate(value);
  if (Number.isNaN(current.getTime())) return getScheduleWeekStartForDate(new Date());
  current.setHours(0, 0, 0, 0);
  const day = current.getDay() || 7;
  return addScheduleDays(current, 1 - day);
}

export function scheduleWeekStartIso(value = new Date()) {
  return formatLocalIsoDate(getScheduleWeekStartForDate(value));
}

export function scheduleWeekStartFromSchedule(schedule) {
  return scheduleWeekStartIso(schedule?.weekStartDate || schedule?.createdAt || schedule?.updatedAt || new Date());
}

export function formatScheduleWeekRange(weekStart) {
  const start = getScheduleWeekStartForDate(weekStart);
  const end = addScheduleDays(start, 4);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? `Semaine du ${dayNumberFormatter.format(start)} au ${fullDateFormatter.format(end)}`
    : `Semaine du ${dateFormatter.format(start)} au ${fullDateFormatter.format(end)}`;
}

export function scheduleWeekDays(weekStart) {
  const start = getScheduleWeekStartForDate(weekStart);
  return Array.from({ length: 5 }, (_, index) => {
    const date = addScheduleDays(start, index);
    const weekday = dayFormatter.format(date);
    const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
    return {
      index: index + 1,
      value: index + 1,
      dayOfWeek: index + 1,
      label,
      dateLabel: fullDateFormatter.format(date),
      shortDateLabel: dateFormatter.format(date),
      fullDate: fullDateFormatter.format(date),
      year: date.getFullYear(),
      isoDate: date.toISOString().slice(0, 10),
    };
  });
}

export function scheduleDayLabel(dayOfWeek, weekStart) {
  return scheduleWeekDays(weekStart).find((day) => day.dayOfWeek === Number(dayOfWeek))?.label || `Jour ${dayOfWeek}`;
}

export function scheduleSlotDateLabel(dayOfWeek, weekStart) {
  return scheduleWeekDays(weekStart).find((day) => day.dayOfWeek === Number(dayOfWeek))?.dateLabel || "";
}
