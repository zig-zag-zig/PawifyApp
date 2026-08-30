import { useEffect, useState } from 'react';

export function useEventDrivenBanner(
    pendingEventUpdateRef: React.RefObject<boolean>,
    eventVersion = 0
) {
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        if (pendingEventUpdateRef.current) {
            setShowBanner(true);
            pendingEventUpdateRef.current = false;
        }
    }, [eventVersion, pendingEventUpdateRef]);

    return [showBanner, setShowBanner] as const;
}
