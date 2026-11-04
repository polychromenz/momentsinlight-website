import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor copies the Vite build (dist/) into the Android project and serves it from
// https://localhost inside a WebView (the same set-up as Check90). The app talks to the studio at
// https://www.momentsinlight.co.nz/api/app/* with the phone's own key (see src/api.ts).
const config: CapacitorConfig = {
  appId: 'nz.co.momentsinlight.studio',
  appName: 'Moments Studio',
  webDir: 'dist',
  backgroundColor: '#f6f1ea',
  android: {
    // Lets the app talk to `wrangler pages dev` over plain http during local testing.
    allowMixedContent: true,
  },
};

export default config;
