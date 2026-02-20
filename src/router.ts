import { renderWorkoutScreen } from './ui/screens/WorkoutScreen';
import { renderTemplatesScreen } from './ui/screens/TemplatesScreen';
import { renderProgressScreen } from './ui/screens/ProgressScreen';
import { renderStatsScreen } from './ui/screens/StatsScreen';
import { renderTabs } from './ui/components/Tabs';

type Route = 'workout' | 'templates' | 'progress' | 'stats';

let currentRoute: Route = 'workout';

const routes: Record<Route, () => void> = {
  workout: renderWorkoutScreen,
  templates: renderTemplatesScreen,
  progress: renderProgressScreen,
  stats: renderStatsScreen,
};

export function navigate(route: Route) {
  currentRoute = route;
  const render = routes[route];
  if (render) {
    render();
  }
  renderTabs(currentRoute);
}

export function initRouter() {
  renderTabs(currentRoute);
  navigate('workout');
}

export function getCurrentRoute(): Route {
  return currentRoute;
}
