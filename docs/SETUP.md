# Setup

SafeSnap is a static web app (Vite + TypeScript). All AI calls go through **Firebase AI Logic**.

## 1. Run it locally without Firebase (development mock)

```bash
npm install
npm run dev
```

With no Firebase config, the dev server uses a **mock scanner** so you can see every screen. The engine badge says "Development mock". A production build never uses the mock.

## 2. Connect Firebase

1. Create a Firebase project and add a **Web app**.
2. Open **AI Logic** in the console and enable the **Gemini Developer API**.
3. Open **App Check**, register the web app with **reCAPTCHA Enterprise** (or classic **reCAPTCHA v3**, then set `VITE_APPCHECK_PROVIDER=v3`), and copy the site key.
4. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values and `VITE_APPCHECK_SITE_KEY`. Never commit `.env`.
5. Do not add `localhost` to the reCAPTCHA allowed domains. Debug tokens work only in `npm run dev` (the code ignores `VITE_APPCHECK_DEBUG` in production builds). For local development, set `VITE_APPCHECK_DEBUG=true`, run the app once, copy the debug token printed in the browser console, and register it under App Check > Apps > Manage debug tokens.

## 3. On-device model (Gemini Nano)

- Desktop Chrome 139 or newer, with enough disk space (about 22 GB free) and a capable GPU or CPU.
- Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, then restart Chrome.
- The first scan downloads the model once. The app shows progress and asks for a click first, because Chrome requires a user gesture.
- If the model is not available, SafeSnap says so and offers a cloud check **per photo, with consent**. It never falls back silently.

## 4. Deploy

```bash
cp .firebaserc.example .firebaserc   # put your project ID inside
npm run build
npx firebase-tools deploy --only hosting
```

## 5. Measure it

Open `/eval.html`, press **Run on this device**, and download `results.json`. Put it at `public/eval/results.json` and rebuild. The home page then shows the measured numbers. A mock run is never displayed.

Regenerate the synthetic scenes (optional): `node scripts/make-eval-set.mjs` (needs Google Chrome).

## Design preview build (optional)

`VITE_DESIGN_PREVIEW=true npx vite build` makes a static build that uses the mock scanner, for sharing the look of the app before Firebase is set up. Every result is labelled "Development mock". Never set this variable in `.env` or for a real deploy.
