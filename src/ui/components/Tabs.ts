import { navigate } from '../../router';

type Route = 'workout' | 'templates' | 'progress' | 'history' | 'stats';

const tabs: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'workout', label: 'Workout', icon: 'ti-barbell' },
  { route: 'templates', label: 'Templates', icon: 'ti-clipboard-list' },
  { route: 'progress', label: 'Progress', icon: 'ti-trending-up' },
  { route: 'history', label: 'History', icon: 'ti-history' },
  { route: 'stats', label: 'Stats', icon: 'ti-chart-bar' },
];

export function renderTabs(activeRoute: Route) {
  const container = document.getElementById('tabs');
  if (!container) return;

  container.innerHTML = tabs.map(tab => `
    <button
      class="tab-button ${tab.route === activeRoute ? 'active' : ''}"
      data-route="${tab.route}"
    >
      <span class="tab-icon"><i class="ti ${tab.icon}"></i></span>
      <span>${tab.label}</span>
    </button>
  `).join('');

  // Attach event listeners
  container.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const route = (e.currentTarget as HTMLElement).dataset.route as Route;
      navigate(route);
    });
  });
}
