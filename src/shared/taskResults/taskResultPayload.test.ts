import { describe, expect, it, vi } from 'vitest';
import {
  assertCompletedParentHasAllSubtaskIds,
  getTaskSubtaskIds,
  mergeTaskResultPayload,
} from './taskResultPayload';

vi.mock('../../config/env', () => ({
  ENV: {
    artistDiagnosticsEnabled: false,
  },
}));

describe('task result payload helpers', () => {
  it('shallow-merges nested object patches', () => {
    expect(mergeTaskResultPayload({
      covers: {
        a: 'a.jpg',
      },
      lyrics: {
        t1: 'one',
      },
    }, {
      covers: {
        b: 'b.jpg',
      },
    })).toEqual({
      covers: {
        a: 'a.jpg',
        b: 'b.jpg',
      },
      lyrics: {
        t1: 'one',
      },
    });
  });

  it('uses completed subtask ids for partial parent tasks', () => {
    expect(getTaskSubtaskIds({
      taskId: 'parent',
      type: 'parent',
      status: 'running',
      createdAt: '2026-06-07T00:00:00.000Z',
      subtaskIds: ['waiting'],
      completedSubtaskIds: ['done'],
    })).toEqual(['done']);
  });

  it('throws when a completed parent is missing subtask ids', () => {
    expect(() => assertCompletedParentHasAllSubtaskIds({
      taskId: 'parent',
      type: 'parent',
      status: 'completed',
      createdAt: '2026-06-07T00:00:00.000Z',
      subtaskCount: 2,
      subtaskIds: ['only-one'],
    })).toThrow(/missing subtask ids/);
  });
});
