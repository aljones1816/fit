import {
  getDisplayUnit,
  getGoalWeightLbs,
  setGoalWeightLbs,
  clearGoalWeightLbs,
} from '../../data/queries';
import { lbsToKg } from '../../data/units';
import { showToast } from '../components/Toast';
import { navigate } from '../../router';

export async function renderProfileScreen() {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const [displayUnit, goalLbs] = await Promise.all([
    getDisplayUnit(),
    getGoalWeightLbs(),
  ]);

  const goalDisplay = goalLbs != null
    ? (displayUnit === 'kg' ? lbsToKg(goalLbs).toFixed(1) : goalLbs.toFixed(1))
    : '';

  screen.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <button id="profile-back-btn" class="btn btn-secondary btn-small" style="display:flex;align-items:center;gap:0.25rem;padding:0.4rem 0.75rem;">
          <i class="ti ti-chevron-left" style="font-size:1rem;"></i> More
        </button>
        <h1 style="font-size:1.5rem;font-weight:700;">Profile</h1>
      </div>

      <div class="card mb-2">
        <h3 class="card-title mb-1">Goal Weight</h3>
        <p class="text-muted" style="font-size:0.875rem;margin-bottom:1rem;">
          Set a goal to visualize your progress on the bodyweight chart.
        </p>

        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
          <input
            type="number"
            inputmode="decimal"
            id="goal-weight-input"
            placeholder="0"
            value="${goalDisplay}"
            step="${displayUnit === 'kg' ? '0.1' : '0.5'}"
            style="flex:1;padding:0.75rem;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);font-size:1.25rem;text-align:center;"
          />
          <span style="font-size:1rem;color:var(--text-secondary);font-weight:500;">${displayUnit}</span>
        </div>

        <div style="display:flex;gap:0.75rem;">
          ${goalLbs != null ? `
          <button id="goal-clear-btn" class="btn btn-secondary" style="flex:1;">
            <i class="ti ti-x" style="font-size:0.9rem;margin-right:0.25rem;"></i>Clear
          </button>
          ` : ''}
          <button id="goal-save-btn" class="btn btn-primary" style="flex:2;">Save Goal</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('profile-back-btn')?.addEventListener('click', () => navigate('more'));

  document.getElementById('goal-save-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('goal-weight-input') as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!val || val <= 0) {
      showToast('Enter a valid weight', 'error');
      return;
    }
    const weightLbs = displayUnit === 'kg' ? val / 0.45359237 : val;
    await setGoalWeightLbs(weightLbs);
    showToast('Goal saved', 'success');
    navigate('more');
  });

  document.getElementById('goal-clear-btn')?.addEventListener('click', async () => {
    await clearGoalWeightLbs();
    showToast('Goal cleared', 'success');
    navigate('more');
  });

  setTimeout(() => {
    const input = document.getElementById('goal-weight-input') as HTMLInputElement;
    input?.focus();
    if (goalDisplay) input?.select();
  }, 100);
}
