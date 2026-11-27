# Research update, Nov 27 2026

Sources: Devpost hackathon page, /rules, /updates, /resources, /project-gallery (read Nov 27).

## New: the Official Rules are published
- Stage one is pass/fail on requirements. Stage two scores four equal criteria 1-5 and averages them. Ties go to the criterion order, then judge vote.
- Criterion wording: Technological Implementation (includes effective use of hybrid inference); Design (a complete product experience, not a proof of concept); Potential Impact (credible case for a real problem and audience); **Quality of the Idea (a creative, non-obvious use of Firebase AI Logic)**.
- A **hosted or test-build link is required**, free and unrestricted through judging (Dec 10-16). A repository alone does not satisfy it. Judges are not required to test, so the video and text carry weight.
- The repo must show Firebase AI Logic imported and actually called at runtime. License must be visible in the repo About section (Apache preferred, any open source accepted). No production keys or PII in the repo.
- Video: up to 3 minutes (only the first 3 are evaluated), English or English subtitles, shows the project working. Commits after the deadline are not evaluated.
- Best Web/Chrome prize ($3,000) is separate; a project can win one grand prize plus one Best-of prize.
- "A started draft isn't submitted": the Devpost submission itself must be completed.
- Gallery is still unpublished (5,680 participants listed). Rules page names model `gemini-3.5-flash-lite` in the resources, which matches our `CLOUD_MODEL`.

## What this changes for SafeSnap
1. **Deploy to Firebase Hosting and put the link in the submission.** Without it the project may fail stage one. The hosted app must work for a judge without Gemini Nano, so the consent-based cloud path is the main judge path and must be tested end to end.
2. Explain in the description why we use `ONLY_ON_DEVICE` plus a user-consented `ONLY_IN_CLOUD` call instead of `PREFER_ON_DEVICE`: a privacy tool must not move a photo to the cloud silently. That is our answer to "creative, non-obvious use" and to "effective use of hybrid inference".
3. Show both paths in the first 3 minutes of the video.

## Past winners (Gemini API Developer Competition 2024, Google I/O challenge pages)
- Most Impactful App and People's Choice: Vite Vere (helps people with cognitive disabilities with step-by-step visual guidance). Best Android app: Gaze Link (ALS communication). An assistant for blind users was an honorable mention. Accessibility projects scored well on impact.
- Best Firebase app: Trippy, which used six Firebase services and covered a whole trip end to end. Lesson: complete journey, context-grounded prompts, careful prompt design.
- Gemini Live Agent Challenge 2026: grand prize ORION (a focused, domain-specific co-pilot). No winner was labelled a privacy project, so privacy is an open lane, but winners had vivid demos.
- No past winners exist for a Firebase AI Logic *hybrid* hackathon; this is the first one. Chrome Built-in AI Challenge 2025 winners were read earlier.

## Docs re-read (Nov 27) - confirmed
- Firebase hybrid web docs: SDK 12.5.0+, desktop Chrome 139+, flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, JPEG/PNG only, 9,216 tokens, inline data, structured output supported, `initializeDeviceModel()` after a user gesture, `ONLY_ON_DEVICE` waits for the download, default cloud model `gemini-3.5-flash-lite`. All match the code.
- Chrome guide says cloud fallback with sensitive data needs user-facing terms and consent. This supports our no-silent-fallback design.
- App Check: docs say enforced Nov 2 2026 (the Chrome guide says early July 2026). Never add localhost to reCAPTCHA domains; keep debug tokens out of production. Code now ignores the debug flag outside `npm run dev`.
- AI monitoring in the Firebase console shows nothing for on-device runs. Hybrid inference is in preview.
- The hybrid blog lists offline image captioning for accessibility as an example scenario. Our twist (privacy gate before sharing, no silent cloud) is the non-obvious part.
