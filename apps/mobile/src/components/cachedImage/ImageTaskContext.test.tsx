// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-community/netinfo', () => ({
    fetch: vi.fn(async () => ({ isConnected: true })),
    addEventListener: vi.fn(() => vi.fn()),
}));

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
}));

vi.mock('react-native-uuid', () => ({
    default: {
        v4: vi.fn(() => 'image-task-uuid-1'),
    },
}));

import { ImageTaskProvider, useImageTaskManager } from './ImageTaskContext';

type ProbeProps = {
    taskId: string;
    runResult: string;
};

const ImageProbe = ({ taskId, runResult }: ProbeProps) => {
    const manager = useImageTaskManager();
    const [settledUri, setSettledUri] = useState<string | null>(null);

    useEffect(() => {
        const task = manager.addTask(
            async () => runResult,
            'downloadAndCacheImage',
            { taskId, replayPolicy: 'both' },
        );
        void manager.executeTask(task);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const task = manager.tasks.find(item => item.id === taskId);
        if (task?.result !== undefined && typeof task.result === 'string') {
            setSettledUri(task.result);
            // Mirrors CachedImageComponent: consumers remove the task once
            // they have consumed its result.
            manager.removeTask(taskId);
        }
    }, [manager.tasks, taskId]);

    return <div>{settledUri ? `settled:${settledUri}` : 'pending'}</div>;
};

const QueueSizeProbe = () => {
    const manager = useImageTaskManager();
    return <div data-testid="queue-size">{manager.tasks.length}</div>;
};

describe('ImageTaskContext', () => {
    it('dedupes concurrent downloads of the same cache key and shares the result', async () => {
        render(
            <ImageTaskProvider>
                <ImageProbe taskId="img-cache-key" runResult="file://cached/a" />
                <ImageProbe taskId="img-cache-key" runResult="file://cached/b" />
                <QueueSizeProbe />
            </ImageTaskProvider>,
        );

        await waitFor(() => {
            expect(screen.getAllByText('settled:file://cached/a')).toHaveLength(2);
        });

        // Both watchers consumed the same single task; after removal the
        // shared queue drains back to zero entries.
        await waitFor(() => {
            expect(screen.getByTestId('queue-size').textContent).toBe('0');
        });
    });

    it('throws when used outside the provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<ImageProbe taskId="k" runResult="r" />)).toThrow(
            'useImageTaskManager must be used within an ImageTaskProvider',
        );
        spy.mockRestore();
    });
});
