/** Display helpers shared by the dashboard, history table and charts. */

/** `8100` -> `"2h 15m"`, `2700` -> `"45m"`, `42` -> `"42s"`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

/** `3725` -> `"1:02:05"`, `125` -> `"2:05"`. Used for video positions. */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** `0.7` -> `"70%"`. */
export function formatPercentage(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

/** Local `YYYY-MM-DD` — deliberately not `toISOString`, which shifts to UTC. */
export function localDateKey(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The seven `YYYY-MM-DD` keys ending today, Monday first. */
export function currentWeekDates(today = new Date()): string[] {
  const monday = new Date(today);
  // getDay(): 0 = Sunday. Shift so Monday is the first column.
  const offset = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - offset);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return localDateKey(day);
  });
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
