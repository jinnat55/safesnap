# SafeSnap architecture (STRUCTURE)

SafeSnap is an accessibility-first visual privacy checkpoint. Before a photo is shared with an
AI describer, a small on-device model (Gemini Nano in Chrome, through Firebase AI Logic) reports
which kinds of private things it may contain. The user then decides where the photo goes.

## Hard rules (do not change without a recorded decision)

1. ALL AI inference goes through Firebase AI Logic (`firebase/ai`). No other model library, no OCR,
   no direct `LanguageModel` inference calls. (Hackathon FAQ.)
2. The scan runs in `ONLY_ON_DEVICE` mode. If Nano is missing it throws `DeviceUnavailableError`.
   The app never falls back to the cloud silently. The cloud is used only after an explicit
   per-photo consent click (`ONLY_IN_CLOUD`).
3. The scan returns categories only (see `ScanResult`). It never reads or returns text, numbers or names.
4. The UI never says a photo is "safe". See `src/report/report.ts` and its tests.
5. Positions come from a fixed 3x3 grid and are labelled as the model's estimate.
6. The UI always shows which engine produced a result (`inferenceSource`).
7. Mock scanning exists for development only and is impossible in a production build
   (`scannerMode()`); the UI must show a visible banner when it runs.
8. Nothing is stored by SafeSnap: no photo, no scan result, no history.

## Flow

```
upload -> prepareImage (JPEG/PNG, max edge 1568) -> runDeviceScan (ONLY_ON_DEVICE)
   |-- ok --> buildReport -> user chooses:
   |            1. Keep private  -> describeOnDevice (short, ONLY_ON_DEVICE)
   |            2. Send to cloud -> consent -> describeInCloud (ONLY_IN_CLOUD)
   |            3. Retake / crop
   `-- DeviceUnavailableError --> honest message -> consent -> runCloudScan (ONLY_IN_CLOUD)
```

## File tree

```
src/
  types.ts                 domain types, error classes (stable interface)
  image.ts                 JPEG/PNG preparation, inline-data part
  firebase/client.ts       Firebase app, App Check, getAI()  (single place that initializes)
  firebase/models.ts       cloud model name
  scanner/schema.ts        ONE schema used for both inference paths
  scanner/prompt.ts        scan and describe prompts
  scanner/validate.ts      model text -> trusted ScanResult (drops, never repairs)
  scanner/firebaseScanner.ts  on-device and cloud scans
  scanner/mockScanner.ts   development stand-in
  scanner/index.ts         scannerMode(), runDeviceScan(), runCloudScan()
  describe/describe.ts     short on-device and detailed cloud descriptions
  report/report.ts         ScanOutcome -> honest sentences (templates, English)
  ui/                      screens, announcer (ARIA live), styles   [next]
  eval/                    evaluation harness and results           [next]
tests/                     vitest unit tests
```

## Interfaces others depend on

- `ScanResult { findings: Finding[]; imageQuality }`, `Finding { category, cell, size, confidence }`
- `runDeviceScan(file, onProgress?) -> ScanOutcome` (throws `DeviceUnavailableError`, `ScanParseError`)
- `runCloudScan(file) -> ScanOutcome`
- `describeOnDevice(file)`, `describeInCloud(file) -> DescribeOutcome`
- `buildReport(outcome) -> Report`

## Open risks

- Nano image accuracy for small cards/documents has no independent benchmark. The evaluation
  harness (30-50 seeded photos) measures it and the result is shown in the product.
- Chrome downscales image input (prompt-api issue #133), so small items may be missed. The report
  says so and advises a retake.
- Judges' machines may not run Nano (22 GB free disk, 16 GB RAM or a GPU with >4 GB VRAM).
  The consent-based cloud path must work end to end.

## Firebase products used
- **Firebase AI Logic** (hybrid inference): every model call. Gemini Nano on device, a Gemini cloud model only after per-photo consent.
- **App Check** (reCAPTCHA Enterprise / Fraud Defense): required by AI Logic.
- **Remote Config**: optional `cloud_model` parameter to change the cloud model without a redeploy. Built-in default, 3 s timeout, never blocks a scan (`src/firebase/remote.ts`).
- **Hosting**: the public test link for judges.
