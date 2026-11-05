import { describe, expect, it } from '@jest/globals';
import { RESOURCE_TYPE_LABEL_MESSAGES } from './resourceTypeLabels';
import { RESOURCE_TYPES, RESOURCE_TYPE_LABELS } from './types';

describe('resource type labels', () => {
  it('keeps the English default message aligned with RESOURCE_TYPE_LABELS', () => {
    for (const resourceType of RESOURCE_TYPES) {
      expect(RESOURCE_TYPE_LABEL_MESSAGES[resourceType].defaultMessage).toBe(RESOURCE_TYPE_LABELS[resourceType]);
    }
  });
});
