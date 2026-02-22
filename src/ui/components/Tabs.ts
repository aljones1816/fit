import { navigate } from '../../router';
import type { TabRoute } from '../../router';

const tabs: Array<{ route: TabRoute; label: string; icon: string }> = [
  { route: 'workout',   label: 'Workout',   icon: 'ti-barbell' },
  { route: 'templates', label: 'Templates', icon: 'ti-clipboard-list' },
  { route: 'progress',  label: 'Progress',  icon: 'ti-chart-line' },
  { route: 'stats',     label: 'Stats',     icon: 'ti-chart-bar' },
  { route: 'more',      label: 'More',      icon: 'ti-dots' },
];

export function renderTabs(activeTab: TabRoute) {
  const container = document.getElementById('tabs');
  if (!container) return;

  container.innerHTML = tabs.map(tab => `
    <button
      class="tab-button ${tab.route === activeTab ? 'active' : ''}"
      data-route="${tab.route}"
    >
      <span class="tab-icon"><i class="ti ${tab.icon}"></i></span>
      <span>${tab.label}</span>
    </button>
  `).join('');

  container.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const route = (e.currentTarget as HTMLElement).dataset.route as TabRoute;
      navigate(route);
    });
  });
}
