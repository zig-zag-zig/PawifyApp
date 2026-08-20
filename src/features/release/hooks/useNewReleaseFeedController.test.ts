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
        getNewReleases: vi.fn(),
        waitForTaskResult: vi.fn(),
        removeNewReleases: vi.fn(),
        showToast: vi.fn(),
        state,
        addTask: vi.fn((run: () => Promise<unknown>, name: string) => {
            nextTaskId += 1;
            return {
                id: `releases-task-${nextTaskId}`,
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

        // Stable across renders: the controller's fetchNewReleases depends on the
        // releaseApi object identity, and the real hook memoizes it.
        releaseApi: {
            getNewReleases: vi.fn(),
            waitForTaskResult: vi.fn(),
            removeNewReleases: vi.fn(),
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

vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('../api/releaseApi', () => ({
    useReleaseApi: () => mocks.releaseApi,
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

import { useNewReleaseFeedController } from './useNewReleaseFeedController';

const releaseA = { id: 'release-a', title: 'Release A' };
const releaseB = { id: 'release-b', title: 'Release B' };

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

async function renderFeed() {
    const hook = renderHook(() => useNewReleaseFeedController());
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

async function loadInitialReleases(
    hook: Awaited<ReturnType<typeof renderFeed>>,
    releases = [releaseA, releaseB],
) {
    act(() => {
        hook.result.current.ensureNewReleasesLoaded();
    });
    await flush();
    await completeCurrentTask({
        releases,
        releaseCoverTaskId: null,
        releaseCovers: {},
    });
}

describe('useNewReleaseFeedController (characterization)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resetTaskIds();
        mocks.state.setTasks = null;
        mocks.auth.user = { uid: 'user-1' };
        mocks.releaseApi.getNewReleases.mockReset();
        mocks.releaseApi.waitForTaskResult.mockReset();
        mocks.releaseApi.removeNewReleases.mockReset().mockResolvedValue(undefined);
        EventService.resetForTesting();
    });

    it('does not fetch until ensureNewReleasesLoaded, then applies a successful result', async () => {
        const { result } = await renderFeed();

        expect(mocks.addTask).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasLoadedOnce).toBe(false);

        act(() => {
            result.current.ensureNewReleasesLoaded();
        });
        await flush();

        expect(mocks.addTask).toHaveBeenCalledTimes(1);
        expect(result.current.isLoading).toBe(true);

        await completeCurrentTask({
            releases: [releaseA, releaseB],
            releaseCoverTaskId: null,
            releaseCovers: {},
        });

        expect(result.current.newReleases).toEqual([
            { ...releaseA, cover_url: undefined },
            { ...releaseB, cover_url: undefined },
        ]);
        expect(result.current.hasLoadedOnce).toBe(true);
        expect(result.current.isLoading).toBe(false);
    });

    it('does not start a second initial fetch after ensureNewReleasesLoaded has already requested one', async () => {
        const { result } = await renderFeed();

        act(() => {
            result.current.ensureNewReleasesLoaded();
            result.current.ensureNewReleasesLoaded();
        });
        await flush();

        expect(mocks.addTask).toHaveBeenCalledTimes(1);
    });

    it('optimistically removes releases and keeps them gone when the API succeeds', async () => {
        const hook = await renderFeed();
        await loadInitialReleases(hook);

        await act(async () => {
            await hook.result.current.removeNewReleases([releaseA.id]);
        });

        expect(mocks.releaseApi.removeNewReleases).toHaveBeenCalledWith([releaseA.id]);
        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([releaseB.id]);
        expect(mocks.showToast).not.toHaveBeenCalled();
    });

    it('rolls a failed remove back onto the list and shows an error toast', async () => {
        mocks.releaseApi.removeNewReleases.mockRejectedValueOnce(new Error('network'));
        const hook = await renderFeed();
        await loadInitialReleases(hook);

        await act(async () => {
            await hook.result.current.removeNewReleases([releaseA.id]);
        });

        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([
            releaseA.id,
            releaseB.id,
        ]);
        expect(mocks.showToast).toHaveBeenCalledWith('Removing new release failed.', 'error');
    });

    it('keeps an optimistically-removed release out of an in-flight refetch result', async () => {
        const hook = await renderFeed();
        await loadInitialReleases(hook);

        await act(async () => {
            EventService.addEvent('releases');
        });
        await flush();
        expect(mocks.addTask).toHaveBeenCalledTimes(2);

        await act(async () => {
            await hook.result.current.removeNewReleases([releaseA.id]);
        });
        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([releaseB.id]);

        await completeCurrentTask({
            releases: [releaseA, releaseB],
            releaseCoverTaskId: null,
            releaseCovers: {},
        });

        // Fixed behavior: the removed-release overlay survives the refetch
        // (the refetch started before the remove API resolved).
        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([releaseB.id]);

        // A fetch started AFTER the remove succeeded reflects it: the overlay
        // is confirmed and dropped.
        await act(async () => {
            EventService.addEvent('releases');
        });
        await flush();
        await completeCurrentTask({
            releases: [releaseB],
            releaseCoverTaskId: null,
            releaseCovers: {},
        });
        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([releaseB.id]);
    });

    it('does not reset loaded releases when the user object identity changes but uid does not', async () => {
        const hook = await renderFeed();
        await loadInitialReleases(hook);
        expect(mocks.addTask).toHaveBeenCalledTimes(1);

        mocks.auth.user = { uid: 'user-1' };
        hook.rerender();
        await flush();

        expect(hook.result.current.newReleases.map((release) => release.id)).toEqual([
            releaseA.id,
            releaseB.id,
        ]);
        expect(hook.result.current.hasLoadedOnce).toBe(true);
        expect(mocks.addTask).toHaveBeenCalledTimes(1);
    });

    it('clears release state when the user logs out', async () => {
        const hook = await renderFeed();
        await loadInitialReleases(hook);

        mocks.auth.user = null;
        hook.rerender();
        await flush();

        expect(hook.result.current.newReleases).toEqual([]);
        expect(hook.result.current.hasLoadedOnce).toBe(false);
        expect(hook.result.current.pendingReleaseCoverIds).toEqual([]);
        expect(hook.result.current.isLoading).toBe(false);
    });
});
