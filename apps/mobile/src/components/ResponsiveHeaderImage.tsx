import React, { useState, useEffect } from 'react';
import { View, Image, ViewStyle, StyleProp } from 'react-native';
import { CachedImageComponent } from './cachedImage/CachedImageComponent';
import type { BrokenEntityImageType } from '../services/brokenEntityImageReporter';

interface ResponsiveHeaderImageProps {
    imageUrl?: string | null;
    type: 'release' | 'profile';
    containerStyle?: StyleProp<ViewStyle>;
    borderRadius?: number;
    showSpinnerWhenNoImage?: boolean;
    /** Artwork identity, so a dead URL can be re-resolved and swapped in place. */
    entityType?: BrokenEntityImageType;
    entityId?: string;
}

export const ResponsiveHeaderImage: React.FC<ResponsiveHeaderImageProps> = ({
    imageUrl,
    type,
    containerStyle,
    borderRadius = 8,
    showSpinnerWhenNoImage = false,
    entityType,
    entityId,
}) => {
    const [ratio, setRatio] = useState(1);
    const [repairedUrl, setRepairedUrl] = useState<{
        forPropUrl: string | null | undefined;
        url: string | null;
    } | null>(null);
    const activeUrl =
        repairedUrl && repairedUrl.forPropUrl === imageUrl ? repairedUrl.url : imageUrl;

    useEffect(() => {
        setRatio(1);
        if (!activeUrl) return;

        Image.getSize(
            activeUrl,
            (w, h) => {
                if (w > 0 && h > 0) setRatio(w / h);
            },
            () => { }
        );
    }, [activeUrl]);

    return (
        <View style={containerStyle}>
            <CachedImageComponent
                imageUrl={imageUrl}
                type={type}
                showSpinnerWhenNoImage={showSpinnerWhenNoImage}
                entityType={entityType}
                entityId={entityId}
                onEffectiveUrlChange={(url) =>
                    setRepairedUrl({ forPropUrl: imageUrl, url })
                }
                style={{
                    width: '100%',
                    aspectRatio: ratio,
                    borderRadius,
                }}
            />
        </View>
    );
};
