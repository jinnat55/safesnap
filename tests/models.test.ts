import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOUD_MODEL, cloudModel, setCloudModel } from '../src/firebase/models';

describe('cloud model override', () => {
  it('starts with the built-in default', () => {
    expect(cloudModel()).toBe(DEFAULT_CLOUD_MODEL);
  });
  it('accepts plain Gemini ids and rejects anything else', () => {
    expect(setCloudModel('gemini-3.8-flash')).toBe(true);
    expect(cloudModel()).toBe('gemini-3.8-flash');
    expect(setCloudModel('not a model; drop table')).toBe(false);
    expect(setCloudModel('')).toBe(false);
    expect(cloudModel()).toBe('gemini-3.8-flash');
  });
});
