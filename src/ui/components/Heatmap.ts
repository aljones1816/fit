import type { Session } from '../../data/models';

export function renderHeatmap(sessions: Session[]): string {
  const endedSessions = sessions.filter(s => s.endedAt);

  // Build date map (count of workouts per day)
  const dateMap = new Map<string, number>();
  endedSessions.forEach(session => {
    const date = new Date(session.endedAt!);
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
  });

  // Generate last 182 days oldest→newest
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

  // Pad start so the first cell lands on the right day-of-week column
  const firstDate = new Date(today);
  firstDate.setDate(firstDate.getDate() - (totalDays - 1));
  const startPad = firstDate.getDay(); // 0=Sun … 6=Sat

  const cells: Array<{ dateStr: string; count: number } | null> = [
    ...Array(startPad).fill(null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const numCols = cells.length / 7;

  const cellHtml = cells.map(cell => {
    if (!cell) return `<div></div>`;
    const intensity = Math.min(cell.count, 3);
    const color = getHeatmapColor(intensity);
    const label = cell.count > 0
      ? `${cell.dateStr}: ${cell.count} workout${cell.count !== 1 ? 's' : ''}`
      : cell.dateStr;
    return `<div title="${label}" style="background:${color};border-radius:2px;"></div>`;
  }).join('');

  // Use 1fr columns + aspect-ratio so the grid always fits the container width.
  // grid-auto-flow:column fills top→bottom then left→right, matching our cell ordering.
  return `
    <div style="padding:0.25rem 0;">
      <div style="
        display:grid;
        grid-template-columns:repeat(${numCols}, 1fr);
        grid-template-rows:repeat(7, 1fr);
        grid-auto-flow:column;
        gap:3px;
        width:100%;
        aspect-ratio:${numCols} / 7;
      ">
        ${cellHtml}
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.5rem;font-size:0.75rem;color:var(--text-secondary);">
        <span>Less</span>
        <div style="width:10px;height:10px;background:${getHeatmapColor(0)};border-radius:2px;flex-shrink:0;"></div>
        <div style="width:10px;height:10px;background:${getHeatmapColor(1)};border-radius:2px;flex-shrink:0;"></div>
        <div style="width:10px;height:10px;background:${getHeatmapColor(2)};border-radius:2px;flex-shrink:0;"></div>
        <div style="width:10px;height:10px;background:${getHeatmapColor(3)};border-radius:2px;flex-shrink:0;"></div>
        <span>More</span>
      </div>
    </div>
  `;
}

function getHeatmapColor(intensity: number): string {
  const darkGreen = '48, 209, 88';
  const lightGreen = '52, 199, 89';

  let isDark = false;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'system') {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  const green = isDark ? darkGreen : lightGreen;

  if (intensity === 0) return 'var(--bg-tertiary)';
  if (intensity === 1) return `rgba(${green}, 0.25)`;
  if (intensity === 2) return `rgba(${green}, 0.5)`;
  return `rgba(${green}, 1)`;
}
