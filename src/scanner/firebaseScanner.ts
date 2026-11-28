import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { getAi } from '../firebase/client';
import { imagePart, prepareImage } from '../image';
import { cloudModel } from '../firebase/models';
import { DeviceUnavailableError, type InferenceSource, type ScanOutcome } from '../types';
import { SCAN_PROMPT } from './prompt';
import { SCAN_SCHEMA } from './schema';
import { parseScanResult } from './validate';

const DEVICE_CREATE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
} as const;

/** Never falls back to the cloud by itself: if Nano is missing this throws DeviceUnavailableError. */
export function createOnDeviceScanModel() {
  return getGenerativeModel(getAi(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createOptions: DEVICE_CREATE_OPTIONS as any,
      promptOptions: { responseConstraint: SCAN_SCHEMA },
    },
  });
}

/** Used only after the user explicitly agreed to send the photo to the cloud. */
export function createCloudScanModel() {
  return getGenerativeModel(getAi(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel(),
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCAN_SCHEMA },
    },
  });
}

export type ModelProgress = (fraction: number) => void;

/** Must be called from a user action (click), because Chrome requires a gesture to start the download. */
export async function scanOnDevice(file: File, onProgress?: ModelProgress): Promise<ScanOutcome> {
  const started = performance.now();
  try {
    const model = createOnDeviceScanModel();
    await model.initializeDeviceModel((p: number) => onProgress?.(p));
    const image = await prepareImage(file);
    const response = await model.generateContent([
      SCAN_PROMPT,
      imagePart(image),
    ]);
    return {
      result: parseScanResult(response.response.text()),
      source: toSource(response.response.inferenceSource),
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'ScanParseError') throw error;
    throw new DeviceUnavailableError(error instanceof Error ? error.message : 'unknown error', error);
  }
}

export async function scanInCloud(file: File): Promise<ScanOutcome> {
  const started = performance.now();
  const model = createCloudScanModel();
  const image = await prepareImage(file);
  const response = await model.generateContent([
    SCAN_PROMPT,
    imagePart(image),
  ]);
  return {
    result: parseScanResult(response.response.text()),
    source: toSource(response.response.inferenceSource),
    elapsedMs: Math.round(performance.now() - started),
  };
}

function toSource(value: unknown): InferenceSource {
  return value === 'ON_DEVICE' ? 'ON_DEVICE' : 'IN_CLOUD';
}
