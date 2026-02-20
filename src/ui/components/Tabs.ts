import { navigate } from '../../router';

type Route = 'workout' | 'templates' | 'progress' | 'stats';

const tabs: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'workout', label: 'Workout', icon: '💪' },
  { route: 'templates', label: 'Templates', icon: '📋' },
  { route: 'progress', label: 'Progress', icon: '📈' },
  { route: 'stats', label: 'Stats', icon: '📊' },
];

export function renderTabs(activeRoute: Route) {
  const container = document.getElementById('tabs');
  if (!container) return;

  container.innerHTML = tabs.map(tab => `
    <button
      class="tab-button ${tab.route === activeRoute ? 'active' : ''}"
      data-route="${tab.route}"
    >
      <span class="tab-icon">${tab.icon}</span>
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
