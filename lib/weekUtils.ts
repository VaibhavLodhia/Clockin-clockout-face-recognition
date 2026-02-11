// Week utility functions for admin and employee dashboards
// Week runs Monday to Sunday (ISO-style)

/** Days back from today to the Monday of the current week. Sunday = go back 6 days. */
function daysToMonday(date: Date): number {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return day === 0 ? 6 : day - 1;
}

export function getCurrentWeek(): { start: Date; end: Date } {
  const now = new Date();
  const diff = daysToMonday(now);

  const start = new Date(now);
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Sunday
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getWeekForDate(date: Date): { start: Date; end: Date } {
  const diff = daysToMonday(date);

  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getPreviousWeek(currentWeekStart: Date): { start: Date; end: Date } {
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getNextWeek(currentWeekStart: Date): { start: Date; end: Date } {
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() + 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function formatWeekRange(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

/** Returns 0 = Monday, 1 = Tuesday, ... 6 = Sunday (for Monday-first week display). */
export function getDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function getDayName(dayIndex: number): string {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days[dayIndex];
}

export function getDayAbbr(dayIndex: number): string {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days[dayIndex];
}
