# SafeSnap

An accessibility-first visual privacy checkpoint for photos. Built for #BuildHybridAI 2026.

SafeSnap helps people, first of all blind and low-vision users, understand what private things a
photo may contain **before** it is shared with an AI describer. A small model runs on the device
(Gemini Nano in Chrome, via Firebase AI Logic) and reports categories only. It never reads
text or numbers, and it never claims a photo is safe. You then choose: keep it private, send it
to the cloud with consent, or retake it.

> Work in progress. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Develop

```bash
npm install
cp .env.example .env   # fill in Firebase values; or set VITE_SCANNER_MODE=mock for UI work
npm run dev
npm test
```

## License

MIT
