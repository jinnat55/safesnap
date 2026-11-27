import { isFirebaseConfigured } from '../firebase/client';
import type { ScanOutcome } from '../types';
import { scanInCloud, scanOnDevice, type ModelProgress } from './firebaseScanner';
import { mockScan } from './mockScanner';

export type ScannerMode = 'firebase' | 'mock';

/**
 * Mock is allowed only in development builds, so a production build can never fake a scan.
 * The one exception is a design-preview build made with VITE_DESIGN_PREVIEW=true. It is never
 * set in .env files, and the UI labels every result "Development mock".
 */
export function scannerMode(): ScannerMode {
  const wantsMock = import.meta.env.VITE_SCANNER_MODE === 'mock';
  const preview = import.meta.env.VITE_DESIGN_PREVIEW === 'true';
  if (preview || (import.meta.env.DEV && (wantsMock || !isFirebaseConfigured()))) return 'mock';
  return 'firebase';
}

export function runDeviceScan(file: File, onProgress?: ModelProgress): Promise<ScanOutcome> {
  return scannerMode() === 'mock' ? mockScan(file) : scanOnDevice(file, onProgress);
}

export function runCloudScan(file: File): Promise<ScanOutcome> {
  return scannerMode() === 'mock' ? mockScan(file) : scanInCloud(file);
}
