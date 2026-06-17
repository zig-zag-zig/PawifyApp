import type { Artist, Member, ArtistReleaseGroup } from '../shared/music';
import type { TaskResultResponse } from '../types/apiTypes';

// ------- Artists -------

export function createMockArtist(overrides: Partial<Artist> & { id: string; name: string }): Artist {
    return {
        type: 'Person',
        disambiguation: null,
        aliases: [],
        members: [],
        externalLinks: [],
        lifeSpan: {
            begin: null,
            end: null,
            ended: false,
        },
        beginArea: {
            name: null,
        },
        ...overrides,
    };
}

// ------- Members -------

export function createMockMember(
    overrides: Partial<Member> & Pick<Member, 'id' | 'name'>,
): Member {
    return {
        begin: null,
        end: null,
        artistType: 'Person',
        type: 'member of band',
        direction: 'backward',
        ...overrides,
    };
}

// ------- Release Groups -------

export function createMockReleaseGroup(
    overrides: Partial<ArtistReleaseGroup> & { id: string; title: string },
): ArtistReleaseGroup {
    return {
        date: null,
        disambiguation: null,
        'primary-type': null,
        releaseIds: [],
        ...overrides,
    };
}

// ------- Task Results -------

export function createMockTaskResult<T>(
    overrides: Partial<TaskResultResponse<T>> & { taskId: string },
): TaskResultResponse<T> {
    return {
        type: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

export function createCompletedTaskResult<T>(result: T): TaskResultResponse<T> {
    return {
        taskId: 'task-1',
        type: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        result,
    };
}

// ------- Fetch Response -------

export function createMockFetchResponse(status: number, data: unknown = null): Response {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => {
            if (typeof data === 'string') {
                throw new Error('not json');
            }
            return data;
        }),
        text: vi.fn(async () => text),
        clone: vi.fn(() => createMockFetchResponse(status, data)),
    } as unknown as Response;
}

// vi is needed by factories at runtime
import { vi } from 'vitest';
