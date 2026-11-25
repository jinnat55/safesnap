import { getGenerativeModel, InferenceMode } from 'firebase/ai';
import { getAi } from '../firebase/client';
import { imagePart, prepareImage } from '../image';
import { CLOUD_MODEL } from '../firebase/models';
import { DeviceUnavailableError, type DescribeOutcome } from '../types';
import { DESCRIBE_DETAILED_PROMPT, DESCRIBE_SHORT_PROMPT } from '../scanner/prompt';
import { scannerMode } from '../scanner';

/** Short description that stays on this device. Throws DeviceUnavailableError if Nano is missing. */
export async function describeOnDevice(file: File): Promise<DescribeOutcome> {
  const started = performance.now();
  if (scannerMode() === 'mock') return mockDescribe('short', started);
  try {
    const model = getGenerativeModel(getAi(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        } as any,
      },
    });
    const image = await prepareImage(file);
    const response = await model.generateContent([
      DESCRIBE_SHORT_PROMPT,
      imagePart(image),
    ]);
    return {
      text: response.response.text().trim(),
      source: 'ON_DEVICE',
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    throw new DeviceUnavailableError(error instanceof Error ? error.message : 'unknown error', error);
  }
}

/** Detailed description in the cloud. Call only after the user consented for this photo. */
export async function describeInCloud(file: File): Promise<DescribeOutcome> {
  const started = performance.now();
  if (scannerMode() === 'mock') return mockDescribe('detailed', started);
  const model = getGenerativeModel(getAi(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CLOUD_MODEL },
  });
  const image = await prepareImage(file);
  const response = await model.generateContent([
    DESCRIBE_DETAILED_PROMPT,
    imagePart(image),
  ]);
  return {
    text: response.response.text().trim(),
    source: 'IN_CLOUD',
    elapsedMs: Math.round(performance.now() - started),
  };
}

async function mockDescribe(kind: 'short' | 'detailed', started: number): Promise<DescribeOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return {
    text:
      kind === 'short'
        ? 'Development mock: a short description would appear here.'
        : 'Development mock: a detailed description from the cloud model would appear here.',
    source: 'MOCK',
    elapsedMs: Math.round(performance.now() - started),
  };
}
