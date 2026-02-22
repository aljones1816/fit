import { getAllSessions, getEndedSessions } from '../../data/queries';
import { renderHeatmap } from '../components/Heatmap';

export async function renderStatsScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const [sessions, endedSessions] = await Promise.all([
    getAllSessions(),
    getEndedSessions(),
  ]);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = endedSessions.filter(
    s => s.endedAt && s.endedAt >= thisMonthStart.getTime()
  ).length;

  screen.innerHTML = `
    <div>
      <h1 class="mb-2">Stats</h1>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Workout Stats</h3>
        <div class="mb-2">
          <div style="font-size:2rem;font-weight:600;">${endedSessions.length}</div>
          <div class="text-muted" style="font-size:0.875rem;">Total Workouts</div>
        </div>
        <div>
          <div style="font-size:1.5rem;font-weight:600;">${thisMonthCount}</div>
          <div class="text-muted" style="font-size:0.875rem;">This Month</div>
        </div>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-2">Activity Calendar</h3>
        ${renderHeatmap(sessions)}
      </div>
    </div>
  `;
}
