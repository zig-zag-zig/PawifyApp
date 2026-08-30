import { useMemo, useRef } from 'react';
import { Animated } from 'react-native';

type WithId = { id: string };

export function useAnimatedDelete<T extends WithId>(
    items: T[],
    deleteMethod: (ids: string[]) => void
) {
    const animationRefs = useRef<{ [key: string]: Animated.Value }>({});
    const itemIds = useMemo(() => new Set(items.map(item => item.id)), [items]);

    const handleRemoveSelected = (
        ids: Set<string>,
        onRemovalComplete: () => void
    ) => {
        const idsArray = Array.from(ids);
        const idsToAnimate = idsArray.filter(id => itemIds.has(id));

        if (idsToAnimate.length === 0) {
            deleteMethod(idsArray);
            onRemovalComplete();
            return;
        }

        let finished = 0;
        idsToAnimate.forEach(id => {
            animationRefs.current[id] = animationRefs.current[id] || new Animated.Value(1);
            Animated.timing(animationRefs.current[id], {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => {
                finished++;
                if (finished === idsToAnimate.length) {
                    deleteMethod(idsArray);
                    onRemovalComplete();
                }
            });
        });
    };

    return {
        animationRefs,
        handleRemoveSelected,
    };
}
