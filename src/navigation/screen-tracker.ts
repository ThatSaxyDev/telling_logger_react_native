import type { NavigationContainerRef, NavigationState } from '@react-navigation/native';
import { TellingLogger } from '../telling';

function getActiveRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;

  const route = state.routes[state.index];
  if (route.state) {
    return getActiveRouteName(route.state as NavigationState);
  }
  return route.name;
}

/**
 * Creates a screen tracker for React Navigation
 */
export function createScreenTracker(
  navigationRef: React.RefObject<NavigationContainerRef<Record<string, unknown>>>
) {
  let previousRouteName: string | undefined;

  return {
    onReady: () => {
      previousRouteName = getActiveRouteName(navigationRef.current?.getRootState());
    },

    onStateChange: () => {
      const currentRouteName = getActiveRouteName(navigationRef.current?.getRootState());

      if (currentRouteName && previousRouteName !== currentRouteName) {
        TellingLogger.instance.handleScreenView(currentRouteName, previousRouteName);
        previousRouteName = currentRouteName;
      }
    },
  };
}
