import type { Session } from '../../data/models';

export function renderHeatmap(sessions: Session[]): string {
  const endedSessions = sessions.filter(s => s.endedAt);

  // Build date map (count of workouts per day)
  const dateMap = new Map<string, number>();
  endedSessions.forEach(session => {
    const date = new Date(session.endedAt!);
    // Use local date string so it matches the user's timezone
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
  });

  // Generate last 182 days oldest→newest (so newest ends up rightmost)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = 182;
  const days: Array<{ dateStr: string; count: number }> = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    days.push({ dateStr, count: dateMap.get(dateStr) || 0 });
  }

  // The first day in `days` — what day of the week is it?
  // We need to pad the start so Sunday (0) is always at the top of a column.
  const firstDate = new Date(today);
  firstDate.setDate(firstDate.getDate() - (totalDays - 1));
  const startPad = firstDate.getDay(); // 0=Sun … 6=Sat

  // Build the flat cell list: leading empties + all days + trailing empties to fill last column
  const cells: Array<{ dateStr: string; count: number } | null> = [
    ...Array(startPad).fill(null),
    ...days,
  ];
  // Pad end so total length is a multiple of 7
  while (cells.length % 7 !== 0) cells.push(null);

  // Render — CSS grid with 7 rows, auto-flow column does the rest
  const cellHtml = cells.map(cell => {
    if (!cell || !cell.dateStr) {
      return `<div style="width:13px;height:13px;"></div>`;
    }
    const intensity = Math.min(cell.count, 3);
    const color = getHeatmapColor(intensity);
    const label = cell.count > 0
      ? `${cell.dateStr}: ${cell.count} workout${cell.count !== 1 ? 's' : ''}`
      : cell.dateStr;
    return `<div title="${label}" style="width:13px;height:13px;background:${color};border-radius:2px;"></div>`;
  }).join('');

  return `
    <div style="overflow-x:auto;padding:0.25rem 0;">
      <div style="display:grid;grid-template-rows:repeat(7,13px);grid-auto-flow:column;gap:3px;width:max-content;">
        ${cellHtml}
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;font-size:0.75rem;color:var(--text-secondary);">
        <span>Less</span>
        <div style="width:13px;height:13px;background:${getHeatmapColor(0)};border-radius:2px;"></div>
        <div style="width:13px;height:13px;background:${getHeatmapColor(1)};border-radius:2px;"></div>
        <div style="width:13px;height:13px;background:${getHeatmapColor(2)};border-radius:2px;"></div>
        <div style="width:13px;height:13px;background:${getHeatmapColor(3)};border-radius:2px;"></div>
        <span>More</span>
      </div>
    </div>
  `;
}

function getHeatmapColor(intensity: number): string {
  if (intensity === 0) return 'var(--bg-tertiary)';
  if (intensity === 1) return '#0e4429';
  if (intensity === 2) return '#006d32';
  return '#26a641';
}
