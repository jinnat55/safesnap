import './styles.css';
import { buildReport } from './report/report';
import { runCloudScan, runDeviceScan } from './scanner';
import { describeInCloud, describeOnDevice } from './describe/describe';
import { DeviceUnavailableError, type ScanOutcome } from './types';
import { announce } from './ui/announcer';
import { renderMeasured } from './ui/measured';
import { actionButton, buildGrid, el, litCells, renderReport } from './ui/render';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const stageInner = $('stage-inner');
const preview = $<HTMLImageElement>('preview');
const empty = $('empty');
const grid = $('grid');
const fileInput = $<HTMLInputElement>('file');
const sampleBtn = $<HTMLButtonElement>('sample');
const scanBtn = $<HTMLButtonElement>('scan');
const panel = $('result');
const engine = $('engine');
const engineText = $('engine-text');
const title = $('result-title');
const body = $('result-body');
const actions = $('actions');
const description = $('description');
const consent = $<HTMLDialogElement>('consent');

let current: File | null = null;
let busy = false;

buildGrid(grid);

function setState(state: 'idle' | 'ready' | 'scanning' | 'result'): void {
  stage.dataset.state = state;
}
function setEngine(source: 'none' | ScanOutcome['source'], text: string): void {
  engine.dataset.source = source;
  engineText.textContent = text;
}
function clearOutcome(): void {
  actions.hidden = true;
  actions.replaceChildren();
  description.hidden = true;
  description.replaceChildren();
  litCells(grid, []);
}
function focusResult(): void {
  panel.focus({ preventScroll: false });
}

function loadFile(file: File): void {
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  current = file;
  preview.src = URL.createObjectURL(file);
  preview.alt = 'The photo you chose. SafeSnap has not checked it yet.';
  preview.hidden = false;
  empty.hidden = true;
  clearOutcome();
  setState('ready');
  scanBtn.hidden = false;
  scanBtn.disabled = false;
  setEngine('none', 'Not checked yet');
  title.textContent = 'Ready to check';
  body.replaceChildren(el('p', { className: 'muted', text: 'Press “Check this photo”. The first check may download the on-device model, which takes a few minutes once.' }));
  announce('Photo chosen. Press Check this photo to scan it.');
  scanBtn.focus();
}

function resetToChoose(): void {
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  current = null;
  preview.removeAttribute('src');
  preview.hidden = true;
  empty.hidden = false;
  clearOutcome();
  scanBtn.hidden = true;
  setState('idle');
  setEngine('none', 'No photo checked yet');
  title.textContent = 'Waiting for a photo';
  body.replaceChildren(el('p', { className: 'muted', text: 'Retake the photo closer, or crop it, then choose it again. Nothing was kept.' }));
  announce('Cleared. Choose a new photo when you are ready.');
  $('choose').focus();
}

function askConsent(text: string): Promise<boolean> {
  $('consent-text').textContent = text;
  return new Promise((resolve) => {
    consent.addEventListener('close', () => resolve(consent.returnValue === 'ok'), { once: true });
    consent.returnValue = 'cancel';
    consent.showModal();
  });
}

async function scan(): Promise<void> {
  if (!current || busy) return;
  busy = true;
  scanBtn.disabled = true;
  clearOutcome();
  setState('scanning');
  setEngine('none', 'Checking on this device…');
  title.textContent = 'Checking your photo…';
  const bar = el('i');
  const progress = el('div', { className: 'progress' }, [bar]);
  body.replaceChildren(el('p', { className: 'muted', text: 'The photo stays on this device while it is checked.' }), progress);
  announce('Checking your photo on this device. This can take a moment.');
  try {
    const outcome = await runDeviceScan(current, (f) => {
      bar.style.width = `${Math.round(f * 100)}%`;
      if (f > 0 && f < 1) announce(`Downloading the on-device model, ${Math.round(f * 100)} percent.`);
    });
    showResult(outcome);
  } catch (error) {
    if (error instanceof DeviceUnavailableError) showDeviceUnavailable(error);
    else showError(error);
  } finally {
    busy = false;
    scanBtn.disabled = false;
  }
}

function showResult(outcome: ScanOutcome): void {
  const report = buildReport(outcome);
  setState('result');
  litCells(grid, outcome.result.findings);
  setEngine(outcome.source, outcome.source === 'ON_DEVICE' ? 'Checked on this device' : outcome.source === 'IN_CLOUD' ? 'Checked in the cloud, with your OK' : 'Development mock');
  title.textContent = report.headline;
  renderReport(body, report);
  const spoken = [report.headline, ...report.items.map((i) => i.sentence), ...report.advice, report.engineLine].join(' ');
  announce(spoken);
  buildActions();
  focusResult();
}

function buildActions(): void {
  actions.replaceChildren(
    actionButton('Keep it private', 'Get a short description made on this device.', () => void keepPrivate()),
    actionButton('Send to the cloud', 'Get a more detailed description. You confirm first.', () => void sendToCloud()),
    actionButton('Retake or crop', 'Clear this photo and start again.', resetToChoose),
  );
  actions.hidden = false;
}

function showDeviceUnavailable(error: DeviceUnavailableError): void {
  setState('ready');
  setEngine('none', 'On-device model not available');
  title.textContent = 'This browser can’t check on the device';
  body.replaceChildren(
    el('p', { text: 'The on-device model (Gemini Nano) isn’t ready here, so nothing was checked. SafeSnap will not quietly use the cloud instead.' }),
    el('p', { className: 'muted', text: `Reason: ${error.reason}` }),
    el('p', { text: 'You can still choose to check this one photo in the cloud.' }),
  );
  actions.replaceChildren(
    actionButton('Check in the cloud', 'Send this photo to Google through Firebase AI Logic. You confirm first.', () => void cloudScan()),
    actionButton('Choose another photo', 'Nothing has left this device.', resetToChoose),
  );
  actions.hidden = false;
  announce('This browser can’t check on the device, so nothing was checked. You can choose to check this photo in the cloud, or choose another photo.');
  focusResult();
}

function showError(error: unknown): void {
  setState('ready');
  setEngine('none', 'Something went wrong');
  title.textContent = 'The check didn’t finish';
  const msg = error instanceof Error ? error.message : 'Unknown error';
  body.replaceChildren(
    el('p', { text: 'Nothing was kept and nothing was shared. Check your connection, then try again.' }),
    el('p', { className: 'muted', text: msg }),
  );
  announce('The check didn’t finish. Nothing was kept and nothing was shared. You can try again.');
  focusResult();
}

async function cloudScan(): Promise<void> {
  if (!current || busy) return;
  const ok = await askConsent('This sends the photo to the cloud so a larger model can check it. It leaves your device.');
  if (!ok) {
    announce('Cancelled. The photo stayed on this device.');
    return;
  }
  busy = true;
  setState('scanning');
  actions.hidden = true;
  setEngine('IN_CLOUD', 'Checking in the cloud…');
  title.textContent = 'Checking in the cloud…';
  body.replaceChildren(el('p', { className: 'muted' }, [el('span', { className: 'spinner' }), document.createTextNode('Sending this photo, once.')]));
  announce('Checking this photo in the cloud, with your permission.');
  try {
    showResult(await runCloudScan(current));
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
  }
}

function showDescription(heading: string, text: string, sourceNote: string): void {
  description.replaceChildren(el('h3', { text: heading }), el('p', { text }), el('p', { className: 'muted', text: sourceNote }));
  description.hidden = false;
  announce(`${heading}. ${text} ${sourceNote}`);
}

async function keepPrivate(): Promise<void> {
  if (!current || busy) return;
  busy = true;
  description.hidden = false;
  description.replaceChildren(el('p', { className: 'muted' }, [el('span', { className: 'spinner' }), document.createTextNode('Describing on this device…')]));
  announce('Describing the photo on this device.');
  try {
    const d = await describeOnDevice(current);
    showDescription('Short description, made on this device', d.text, `Took ${(d.elapsedMs / 1000).toFixed(1)} seconds. The photo did not leave your computer.`);
  } catch (error) {
    description.hidden = false;
    const text = error instanceof DeviceUnavailableError ? 'The on-device model isn’t available, so no description was made. Nothing was sent anywhere.' : 'The description didn’t finish. Nothing was sent anywhere.';
    description.replaceChildren(el('p', { text }));
    announce(text);
  } finally {
    busy = false;
  }
}

async function sendToCloud(): Promise<void> {
  if (!current || busy) return;
  const ok = await askConsent('This sends the photo to the cloud to write a more detailed description. It leaves your device.');
  if (!ok) {
    announce('Cancelled. The photo stayed on this device.');
    return;
  }
  busy = true;
  description.hidden = false;
  description.replaceChildren(el('p', { className: 'muted' }, [el('span', { className: 'spinner' }), document.createTextNode('Describing in the cloud…')]));
  announce('Describing the photo in the cloud, with your permission.');
  try {
    const d = await describeInCloud(current);
    showDescription('Detailed description, made in the cloud', d.text, `Took ${(d.elapsedMs / 1000).toFixed(1)} seconds. Sent once, with your OK.`);
  } catch (error) {
    const text = 'The cloud description didn’t finish. Check your connection and try again.';
    description.replaceChildren(el('p', { text }));
    announce(text);
    if (error instanceof Error) console.warn(error.message);
  } finally {
    busy = false;
  }
}

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) loadFile(f);
  fileInput.value = '';
});
sampleBtn.addEventListener('click', async () => {
  const res = await fetch('/samples/sample-desk.svg');
  const blob = await res.blob();
  loadFile(new File([blob], 'sample-desk.svg', { type: 'image/svg+xml' }));
});
scanBtn.addEventListener('click', () => void scan());

// Subtle 3D tilt on the viewfinder. Off for people who prefer reduced motion.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    stageInner.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
    stageInner.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
  });
  stage.addEventListener('pointerleave', () => {
    stageInner.style.setProperty('--ry', '0deg');
    stageInner.style.setProperty('--rx', '0deg');
  });
}

void renderMeasured();
