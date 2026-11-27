import '../styles.css';
import { runCloudScan, runDeviceScan } from '../scanner';
import { DeviceUnavailableError } from '../types';
import { pct, summarize, type EvalResults, type ImageRun, type ManifestImage } from './metrics';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('eval-status');
let last: EvalResults | null = null;

async function load(): Promise<ManifestImage[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}eval/manifest.json`);
  return ((await res.json()) as { images: ManifestImage[] }).images;
}

async function run(mode: 'device' | 'cloud'): Promise<void> {
  if (mode === 'cloud' && !window.confirm('This sends 40 synthetic images to the cloud through Firebase AI Logic. Continue?')) return;
  const images = await load();
  const runs: ImageRun[] = [];
  let source: EvalResults['engine'] = mode === 'device' ? 'ON_DEVICE' : 'IN_CLOUD';
  for (const [i, img] of images.entries()) {
    status.textContent = `Running ${i + 1} of ${images.length}…`;
    const blob = await (await fetch(`${import.meta.env.BASE_URL}eval/${img.file}`)).blob();
    const file = new File([blob], `${img.id}.png`, { type: 'image/png' });
    try {
      const outcome = mode === 'device' ? await runDeviceScan(file) : await runCloudScan(file);
      source = outcome.source;
      runs.push({ id: img.id, truth: img.truth, findings: outcome.result.findings, elapsedMs: outcome.elapsedMs });
    } catch (error) {
      if (error instanceof DeviceUnavailableError && mode === 'device') {
        status.textContent = `Stopped: the on-device model is not available (${error.reason}).`;
        return;
      }
      runs.push({ id: img.id, truth: img.truth, findings: [], elapsedMs: 0, error: error instanceof Error ? error.message : 'error' });
    }
  }
  last = { engine: source, runAt: new Date().toISOString(), imageSet: 'synthetic-40', summary: summarize(runs), runs };
  status.textContent = source === 'MOCK' ? 'Done. This was the development mock, so it is NOT a real measurement.' : `Done. Engine: ${source}.`;
  render(last);
  $('download').hidden = false;
}

function render(r: EvalResults): void {
  const s = r.summary;
  $('eval-summary').innerHTML = `<ul class="found">
    <li>Detected (right kind of item): <strong>${pct(s.detected)}</strong> (${s.detected.hits} of ${s.detected.total}). Missed: ${s.missed}.</li>
    <li>Exact grid cell: ${pct(s.exactCell)}. Within one cell: ${pct(s.nearCell)}.</li>
    <li>Small ${pct(s.bySize.small)}, medium ${pct(s.bySize.medium)}, large ${pct(s.bySize.large)}.</li>
    <li>False findings: ${s.falseFindings}. Clean images flagged: ${pct(s.cleanImages)}. Median time: ${s.medianMs ?? 'n/a'} ms. Failed runs: ${s.failedRuns}.</li></ul>`;
  const rows = r.runs.map((x) => {
    const t = x.truth.map((i) => `${i.category} (${i.cell}, ${i.size})`).join('; ') || 'nothing private';
    const f = x.error ? `error: ${x.error}` : x.findings.map((i) => `${i.category} (${i.cell})`).join('; ') || 'nothing found';
    return `<tr><td>${x.id}</td><td>${t}</td><td>${f}</td><td>${x.elapsedMs} ms</td></tr>`;
  }).join('');
  $('eval-table').innerHTML = `<table class="eval-table"><thead><tr><th>Scene</th><th>Truth</th><th>SafeSnap said</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
}

$('run-device').addEventListener('click', () => void run('device'));
$('run-cloud').addEventListener('click', () => void run('cloud'));
$('download').addEventListener('click', () => {
  if (!last) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(last, null, 2)], { type: 'application/json' }));
  a.download = 'results.json';
  a.click();
});
