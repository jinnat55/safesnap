import { Schema } from 'firebase/ai';
import { CATEGORIES, CONFIDENCES, GRID_CELLS, IMAGE_QUALITIES, SIZES } from '../types';

/**
 * One schema, passed to BOTH inference paths:
 * - on-device: onDeviceParams.promptOptions.responseConstraint
 * - cloud: inCloudParams.generationConfig.responseSchema
 * Valid JSON does not mean a correct detection; see validate.ts and the evaluation harness.
 */
export const SCAN_SCHEMA = Schema.object({
  properties: {
    findings: Schema.array({
      items: Schema.object({
        properties: {
          category: Schema.enumString({ enum: [...CATEGORIES] }),
          cell: Schema.enumString({ enum: [...GRID_CELLS] }),
          size: Schema.enumString({ enum: [...SIZES] }),
          confidence: Schema.enumString({ enum: [...CONFIDENCES] }),
        },
      }),
    }),
    imageQuality: Schema.enumString({ enum: [...IMAGE_QUALITIES] }),
  },
});
