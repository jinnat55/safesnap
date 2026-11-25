import { isFirebaseConfigured } from '../firebase/client';
import type { ScanOutcome } from '../types';
import { scanInCloud, scanOnDevice, type ModelProgress } from './firebaseScanner';
import { mockScan } from './mockScanner';

export type ScannerMode = 'firebase' | 'mock';

/** Mock is allowed only in development builds, so a production build can never fake a scan. */
export function scannerMode(): ScannerMode {
  const wantsMock = import.meta.env.VITE_SCANNER_MODE === 'mock';
  if (import.meta.env.DEV && (wantsMock || !isFirebaseConfigured())) return 'mock';
  return 'firebase';
}

export function runDeviceScan(file: File, onProgress?: ModelProgress): Promise<ScanOutcome> {
  return scannerMode() === 'mock' ? mockScan(file) : scanOnDevice(file, onProgress);
}

export function runCloudScan(file: File): Promise<ScanOutcome> {
  return scannerMode() === 'mock' ? mockScan(file) : scanInCloud(file);
}
