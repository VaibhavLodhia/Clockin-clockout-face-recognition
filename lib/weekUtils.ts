// Week utility functions for admin dashboard
// Week runs Sunday to Saturday

export function getCurrentWeek(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const diff = now.getDate() - day; // Days to subtract to get to Sunday
  
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

export function getWeekForDate(date: Date): { start: Date; end: Date } {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const diff = date.getDate() - day;
  
  const start = new Date(date);
  start.setDate(diff);
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

export function getDayOfWeek(date: Date): number {
  return date.getDay(); // 0 = Sunday, 6 = Saturday
}

export function getDayName(dayIndex: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayIndex];
}

export function getDayAbbr(dayIndex: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex];
}


