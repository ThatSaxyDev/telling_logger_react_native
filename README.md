# @telling/react-native

Production-ready crash reporting, error tracking, and analytics SDK for React Native.

## Installation

```bash
npm install @telling/react-native
# or
yarn add @telling/react-native
```

### Peer Dependencies

```bash
npm install @react-native-async-storage/async-storage react-native-device-info react-native-exception-handler
```

## Quick Start

### Initialize

```typescript
import { TellingLogger } from '@telling/react-native';

await TellingLogger.instance.init('YOUR_API_KEY', {
  enableDebugLogs: __DEV__,
});

TellingLogger.instance.enableCrashReporting();
```

### Log Events

```typescript
// Simple log
TellingLogger.instance.log('User completed onboarding');

// Analytics event
TellingLogger.instance.event('button_clicked', {
  button_name: 'Sign Up',
  screen: 'Landing Page',
});

// Funnel tracking
TellingLogger.instance.trackFunnel({
  funnelName: 'checkout',
  stepName: 'cart_viewed',
  step: 1,
  properties: { item_count: 3 },
});

// Exception capture
try {
  await riskyOperation();
} catch (error) {
  TellingLogger.instance.captureException({
    error,
    context: 'payment_processing',
  });
}
```

### User Context

```typescript
// After login
TellingLogger.instance.setUser({
  userId: 'user_123',
  userName: 'Jane Doe',
  userEmail: 'jane@example.com',
});

// After logout
TellingLogger.instance.clearUser();

// User properties
TellingLogger.instance.setUserProperty('subscription_tier', 'premium');
```

### Screen Tracking

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createScreenTracker } from '@telling/react-native';

const navigationRef = useRef(null);
const screenTracker = createScreenTracker(navigationRef);

<NavigationContainer
  ref={navigationRef}
  onReady={screenTracker.onReady}
  onStateChange={screenTracker.onStateChange}
>
  {/* navigators */}
</NavigationContainer>
```

### View Tracking

```typescript
import { useTelling, withTelling } from '@telling/react-native';

// Hook
function ProductCard({ product }) {
  useTelling('Product Card Viewed', {
    metadata: { productId: product.id },
  });
  return <View>...</View>;
}

// HOC
const TrackedBanner = withTelling(AdBanner, {
  name: 'Ad Banner',
  trackOnce: false,
});
```

### Try-Catch Helpers

```typescript
import { tryRun, tryRunVoid, tryRunSync } from '@telling/react-native';

const result = await tryRun({
  context: 'fetch_user_data',
  func: async () => await api.getUser(),
  onError: (error) => showToast('Failed to load user'),
});
```

## API Reference

| Method | Description |
|--------|-------------|
| `init(apiKey, options?)` | Initialize SDK |
| `enableCrashReporting()` | Enable automatic crash capture |
| `log(message, options?)` | Log a message |
| `event(name, properties?)` | Track analytics event |
| `trackFunnel(options)` | Track funnel step |
| `captureException(options)` | Capture exception |
| `setUser(options)` | Set user context |
| `clearUser()` | Clear user context |
| `setUserProperty(key, value)` | Set user property |
| `handleScreenView(name, prev?)` | Track screen view |
| `dispose()` | Clean up resources |

## License

MIT
