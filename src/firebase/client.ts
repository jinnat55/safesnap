import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';

const env = import.meta.env;

export function isFirebaseConfigured(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

let cached: { app: FirebaseApp; ai: AI } | null = null;

/** Initializes Firebase, App Check and Firebase AI Logic once. All inference goes through `ai`. */
export function getAi(): AI {
  if (cached) return cached.ai;
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Copy .env.example to .env and fill it in.');
  }
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const siteKey = env.VITE_APPCHECK_SITE_KEY;
  if (siteKey) {
    if (import.meta.env.DEV && env.VITE_APPCHECK_DEBUG === 'true') {
      // Local development and registered judge-demo sessions only. Never ship a debug build.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: env.VITE_APPCHECK_PROVIDER === 'v3' ? new ReCaptchaV3Provider(siteKey) : new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn('App Check site key missing: Firebase AI Logic requests may be rejected.');
  }
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  cached = { app, ai };
  return ai;
}
