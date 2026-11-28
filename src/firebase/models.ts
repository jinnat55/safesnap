/** Default cloud model for Firebase AI Logic. Remote Config can override it (key `cloud_model`) without a redeploy. */
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

let current = DEFAULT_CLOUD_MODEL;

/** The cloud model to use for consented cloud checks and descriptions. */
export function cloudModel(): string {
  return current;
}

/** Accepts only plain Gemini model ids, so a bad remote value can never break the app. */
export function setCloudModel(value: string): boolean {
  if (!/^gemini-[a-z0-9.-]{3,60}$/.test(value)) return false;
  current = value;
  return true;
}
