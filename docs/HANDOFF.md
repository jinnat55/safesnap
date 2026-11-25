# Handoff (read this first in a new chat or model)

Single source of truth for the idea is the Decision Brief doc. This file tracks the build.

## Done
- Foundation: types, shared schema, prompts, strict validator, Firebase scanner (on-device + cloud), mock scanner (dev only), image prep, never-"safe" report builder.
- UI: Viewfinder hero, scan beam, 3×3 grid, engine badge, consent dialog, all states, ARIA live announcer, focus management, reduced motion, phone layout.
- Evaluation: 40 synthetic scenes with ground truth, metrics module, `/eval.html` runner, measured-results section on the home page (hidden until a real run is published; mock runs are never shown).
- Repo: MIT, README, SETUP, firebase.json, CI, 16 tests.

## Not verified yet (needs the user's Firebase project and a Nano laptop)
- Real Firebase AI Logic calls on-device and in the cloud (SDK 13.4.0 types compile; runtime untested).
- Gemini Nano detection quality, image downscaling effect on small items, response time.
- NVDA screen-reader test.
- Whether the Devpost name "SafeSnap" is free; official rules and gallery (unpublished on Nov 26, re-read ~Nov 28).

## Next three tasks
1. After Firebase config: run `/eval.html` on the Nano laptop, publish `public/eval/results.json`, fix the prompt only where measured misses show a pattern.
2. Real-photo test set (10–15 photos with fake data, taken by the user) to report beside the synthetic numbers.
3. Demo video (≤3 min): show both paths, one honest miss, the engine badge.

## Open issues
- Large synthetic items sometimes overlap neighbours, which blurs ground truth. Acceptable, disclosed as a weak proxy.
- Bengali labels are not started (Nano does not support Bengali, so output stays English).

## Rules Sonnet must not change
See `docs/ARCHITECTURE.md` hard rules: all AI through Firebase AI Logic, no silent cloud fallback, never say "safe", never read or repeat text, store nothing, show the engine used.

## Self-assessed judge view (skeptical, evidence in repo)
- Technological implementation: 3/5 until real runtime is verified; hybrid logic and consent design are solid.
- Design: 4/5 (distinct visual identity, accessible); motion is restrained.
- Potential impact: 3/5 (narrow audience, desktop only, honest about it).
- Quality of idea: 4/5 (privacy gate before sharing, measured honesty). Prior art exists (a course project), so we do not claim "first".
