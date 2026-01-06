// Time utility functions for formatting and calculations

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Ensure we have a valid date
  if (isNaN(d.getTime())) {
    return 'Invalid Time';
  }
  
  // Manually format to 12-hour format to ensure consistency
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  
  // Convert to 12-hour format
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  
  // Format with leading zeros
  const hoursStr = hours.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');
  
  return `${hoursStr}:${minutesStr} ${period}`;
}

export function formatTimeRange(start: Date | string, end: Date | string | null): string {
  const startTime = formatTime(start);
  if (!end) {
    return `${startTime} - (In Progress)`;
  }
  const endTime = formatTime(end);
  return `${startTime} - ${endTime}`;
}

export function calculateHours(start: Date | string, end: Date | string | null, currentTime?: Date): number {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = end ? (typeof end === 'string' ? new Date(end) : end) : (currentTime || new Date());
  
  const diffMs = endDate.getTime() - startDate.getTime();
  return diffMs / (1000 * 60 * 60); // Convert to hours
}

export function formatHours(hours: number): string {
  if (hours < 0) return '0 hours';
  return `${hours.toFixed(1)} hours`;
}

// Generate time options for 15-minute intervals
export function generateTimeOptions(): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const time = new Date();
      time.setHours(hour, minute, 0, 0);
      const timeStr = time.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      options.push(timeStr);
    }
  }
  return options;
}

// Convert time string (e.g., "9:00 AM") to Date object for a given date
export function timeStringToDate(date: Date, timeString: string): Date {
  const [time, period] = timeString.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  
  let hour24 = hours;
  if (period === 'PM' && hours !== 12) {
    hour24 = hours + 12;
  } else if (period === 'AM' && hours === 12) {
    hour24 = 0;
  }
  
  const result = new Date(date);
  result.setHours(hour24, minutes, 0, 0);
  return result;
}

// Check if two time ranges overlap
export function timeRangesOverlap(
  start1: Date,
  end1: Date | null,
  start2: Date,
  end2: Date | null
): boolean {
  const end1Actual = end1 || new Date();
  const end2Actual = end2 || new Date();
  
  return start1 < end2Actual && start2 < end1Actual;
}

// Split time log that spans multiple days
export function splitMultiDayTimeLog(clockIn: Date, clockOut: Date): Array<{
  date: Date;
  start: Date;
  end: Date;
  isPartial: boolean;
}> {
  const result: Array<{ date: Date; start: Date; end: Date; isPartial: boolean }> = [];
  
  const clockInDate = new Date(clockIn);
  clockInDate.setHours(0, 0, 0, 0);
  
  const clockOutDate = new Date(clockOut);
  clockOutDate.setHours(0, 0, 0, 0);
  
  let currentDate = new Date(clockInDate);
  
  while (currentDate <= clockOutDate) {
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    // Determine the actual start time for this day
    const isFirstDay = currentDate.getTime() === clockInDate.getTime();
    const logStart = isFirstDay ? clockIn : dayStart;
    
    // Determine the actual end time for this day
    const isLastDay = currentDate.getTime() === clockOutDate.getTime();
    const logEnd = isLastDay ? clockOut : dayEnd;
    
    result.push({
      date: new Date(currentDate),
      start: logStart,
      end: logEnd,
      isPartial: !isFirstDay || !isLastDay
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return result;
}

