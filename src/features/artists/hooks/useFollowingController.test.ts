// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventService } from '../../../services/eventService';

type Task = {
    id: string;
    run: () => Promise<unknown>;
    name: string;
    result?: unknown;
    error?: unknown;
};

const mocks = vi.hoisted(() => {
    let nextTaskId = 0;

    const state: {
        setTasks: ((updater: Task[] | ((prev: Task[]) => Task[])) => void) | null;
    } = {
        setTasks: null,
    };

    return {
        auth: { user: { uid: 'user-1' } as { uid: string } | null },
        getFollowing: vi.fn(),
        waitForTaskResult: vi.fn(),
        setArtistProfileImages: vi.fn(),
        artistProfileImages: {} as Record<string, string | null | undefined>,
        state,
        addTask: vi.fn((run: () => Promise<unknown>, name: string) => {
            nextTaskId += 1;
            return {
                id: `following-task-${nextTaskId}`,
                run,
                name,
                result: undefined,
                error: undefined,
            } satisfies Task;
        }),
        executeTask: vi.fn((task: Task) => {
            state.setTasks?.((prev) => {
                if (prev.some((existing) => existing.id === task.id)) {
                    return prev;
                }
                return [...prev, { ...task, result: undefined, error: undefined }];
            });
        }),
        removeTask: vi.fn((taskId: string) => {
            state.setTasks?.((prev) => prev.filter((task) => task.id !== taskId));
        }),
        completeTask(taskId: string, result?: unknown, error?: unknown) {
            state.setTasks?.((prev) =>
                prev.map((task) => (
                    task.id === taskId
                        ? { ...task, result, error }
                        : task
                )),
            );
        },
        resetTaskIds() {
            nextTaskId = 0;
        },

        // Stable across renders: the controller's fetchArtists depends on the
        // artistsApi object identity, and the real hook memoizes it.
        artistsApi: {
            getFollowing: vi.fn(),
            waitForTaskResult: vi.fn(),
        },
    };
});

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: { OS: 'android' },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: mocks.auth.user }),
}));

vi.mock('../../../contexts/CacheContext', () => ({
    useCache: () => ({
        artistProfileImages: mocks.artistProfileImages,
        setArtistProfileImages: mocks.setArtistProfileImages,
    }),
}));

vi.mock('../api/artistsApi', () => ({
    useArtistsApi: () => mocks.artistsApi,
}));

vi.mock('../../../hooks/useOnAppForeground', () => ({
    useOnAppForeground: () => undefined,
}));

vi.mock('../../../hooks/useTaskManager', () => ({
    default: () => {
        const { useState } = require('react') as typeof import('react');
        const [tasks, setTasks] = useState<Task[]>([]);
        mocks.state.setTasks = setTasks;
        return {
            tasks,
            addTask: mocks.addTask,
            removeTask: mocks.removeTask,
            executeTask: mocks.executeTask,
        };
    },
}));

import { useFollowingController } from './useFollowingController';

const artistA = { id: 'artist-a', name: 'Artist A' };
const artistB = { id: 'artist-b', name: 'Artist B' };

async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

function lastTaskId() {
    const result = mocks.addTask.mock.results.at(-1);
    expect(result?.value?.id).toEqual(expect.any(String));
    return result!.value.id as string;
}

async function renderFollowing() {
    const hook = renderHook(() => useFollowingController());
    await flush();
    return hook;
}

async function completeCurrentTask(result: unknown, error?: unknown) {
    const taskId = lastTaskId();
    await act(async () => {
        mocks.completeTask(taskId, result, error);
        await Promise.resolve();
    });
    return taskId;
}

describe('useFollowingController (characterization)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resetTaskIds();
        mocks.state.setTasks = null;
        mocks.auth.user = { uid: 'user-1' };
        mocks.artistProfileImages = {};
        mocks.artistsApi.getFollowing.mockReset();
        mocks.artistsApi.waitForTaskResult.mockReset();
        EventService.resetForTesting();
    });

    it('fetches following on user-change and applies a successful result', async () => {
        const { result } = await renderFollowing();

        expect(mocks.addTask).toHaveBeenCalledTimes(1);
        expect(result.current.isLoadingFollowing).toBe(true);

        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        expect(result.current.followingArtists).toEqual([artistA, artistB]);
        expect(result.current.hasLoadedFollowingOnce).toBe(true);
        expect(result.current.isLoadingFollowing).toBe(false);
    });

    it('optimistically removes an artist and keeps that override on the next fetch', async () => {
        const { result } = await renderFollowing();
        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        act(() => {
            result.current.setFollowedArtist(artistA, false);
        });
        expect(result.current.followingArtists).toEqual([artistB]);

        act(() => {
            result.current.refreshFollowing();
        });
        await flush();

        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        expect(result.current.followingArtists).toEqual([artistB]);
    });

    it('clears overrides after the first completed fetch, so a queued fetch can restore a stale unfollow', async () => {
        const { result } = await renderFollowing();
        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        act(() => {
            result.current.refreshFollowing();
        });
        await flush();
        expect(mocks.addTask).toHaveBeenCalledTimes(2);

        act(() => {
            result.current.refreshFollowing();
        });
        act(() => {
            result.current.setFollowedArtist(artistA, false);
        });
        expect(result.current.followingArtists).toEqual([artistB]);
        expect(mocks.addTask).toHaveBeenCalledTimes(2);

        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });
        expect(result.current.followingArtists).toEqual([artistB]);
        await flush();
        expect(mocks.addTask).toHaveBeenCalledTimes(3);

        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        // Current bug: the queued response is applied with an empty override map.
        expect(result.current.followingArtists).toEqual([artistA, artistB]);
    });

    it('retriggers a user-change fetch when the user object identity changes but uid does not', async () => {
        const { rerender } = await renderFollowing();
        await completeCurrentTask({
            artists: [artistA],
            profileImageTaskId: null,
            profileImages: {},
        });
        expect(mocks.addTask).toHaveBeenCalledTimes(1);

        mocks.auth.user = { uid: 'user-1' };
        rerender();
        await flush();

        // Current bug: fetchArtists depends on `user`, not `userId`.
        expect(mocks.addTask).toHaveBeenCalledTimes(2);
    });

    it('clears following state when the user logs out', async () => {
        const { result, rerender } = await renderFollowing();
        await completeCurrentTask({
            artists: [artistA, artistB],
            profileImageTaskId: null,
            profileImages: {},
        });

        mocks.auth.user = null;
        rerender();
        await flush();

        expect(result.current.followingArtists).toEqual([]);
        expect(result.current.hasLoadedFollowingOnce).toBe(false);
        expect(result.current.pendingArtistImageIds).toEqual([]);
        expect(result.current.isLoadingFollowing).toBe(false);
    });
});
