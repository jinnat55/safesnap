import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getRemoteConfig, getString } from 'firebase/remote-config';
import { DEFAULT_CLOUD_MODEL, setCloudModel } from './models';

/**
 * Loads Firebase Remote Config in the background. The only remote value is `cloud_model`.
 * Defaults are built in, so a failed or slow fetch never blocks a scan.
 */
export async function loadRemoteConfig(app: FirebaseApp): Promise<void> {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.fetchTimeoutMillis = 3000;
    rc.settings.minimumFetchIntervalMillis = 3_600_000;
    rc.defaultConfig = { cloud_model: DEFAULT_CLOUD_MODEL };
    await fetchAndActivate(rc);
    setCloudModel(getString(rc, 'cloud_model'));
  } catch {
    // Keep the built-in default.
  }
}
