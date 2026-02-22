import { renderWorkoutScreen } from './ui/screens/WorkoutScreen';
import { renderTemplatesScreen } from './ui/screens/TemplatesScreen';
import { renderProgressScreen } from './ui/screens/ProgressScreen';
import { renderStatsScreen } from './ui/screens/StatsScreen';
import { renderMoreScreen } from './ui/screens/MoreScreen';
import { renderProfileScreen } from './ui/screens/ProfileScreen';
import { renderTabs } from './ui/components/Tabs';

export type Route = 'workout' | 'templates' | 'progress' | 'stats' | 'more' | 'profile';
export type TabRoute = 'workout' | 'templates' | 'progress' | 'stats' | 'more';

let currentRoute: Route = 'workout';

const routes: Record<Route, () => void> = {
  workout: renderWorkoutScreen,
  templates: renderTemplatesScreen,
  progress: renderProgressScreen,
  stats: renderStatsScreen,
  more: renderMoreScreen,
  profile: renderProfileScreen,
};

// Sub-routes that live under a parent tab
const parentTab: Partial<Record<Route, TabRoute>> = {
  profile: 'more',
};

export function navigate(route: Route) {
  currentRoute = route;
  const render = routes[route];
  if (render) render();
  renderTabs(parentTab[route] ?? (route as TabRoute));
}

export function initRouter() {
  renderTabs('workout');
  navigate('workout');
}

export function getCurrentRoute(): Route {
  return currentRoute;
}
