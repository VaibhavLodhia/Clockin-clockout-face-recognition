// Work cycle logic: August 1 → May 30

export function getCurrentWorkCycle(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  let startYear: number;
  let endYear: number;

  // If current month is August (8) or later, cycle started this year
  // If current month is before August, cycle started last year
  if (currentMonth >= 8) {
    startYear = currentYear;
    endYear = currentYear + 1;
  } else {
    startYear = currentYear - 1;
    endYear = currentYear;
  }

  return `${startYear}-${endYear}`;
}

export function isWorkCycleEnded(): boolean {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();

  // Check if it's May 30 or later
  return currentMonth === 5 && currentDay >= 30;
}

export function getPreviousWorkCycle(): string {
  const currentCycle = getCurrentWorkCycle();
  const [startYear, endYear] = currentCycle.split('-').map(Number);
  return `${startYear - 1}-${endYear - 1}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}










