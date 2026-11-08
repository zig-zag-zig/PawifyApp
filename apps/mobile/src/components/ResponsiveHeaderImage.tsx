import React, { useState, useEffect } from 'react';
import { View, Image, ViewStyle, StyleProp } from 'react-native';
import { CachedImageComponent } from './cachedImage/CachedImageComponent';

interface ResponsiveHeaderImageProps {
    imageUrl?: string | null;
    type: 'release' | 'profile';
    containerStyle?: StyleProp<ViewStyle>;
    borderRadius?: number;
    showSpinnerWhenNoImage?: boolean;
    /** Fired when the stored URL no longer loads, so the owner can re-resolve it. */
    onRemoteLoadError?: () => void;
}

export const ResponsiveHeaderImage: React.FC<ResponsiveHeaderImageProps> = ({
    imageUrl,
    type,
    containerStyle,
    borderRadius = 8,
    showSpinnerWhenNoImage = false,
    onRemoteLoadError,
}) => {
    const [ratio, setRatio] = useState(1);

    useEffect(() => {
        setRatio(1);
        if (!imageUrl) return;

        Image.getSize(
            imageUrl,
            (w, h) => {
                if (w > 0 && h > 0) setRatio(w / h);
            },
            () => { }
        );
    }, [imageUrl]);

    return (
        <View style={containerStyle}>
            <CachedImageComponent
                imageUrl={imageUrl}
                type={type}
                showSpinnerWhenNoImage={showSpinnerWhenNoImage}
                onRemoteLoadError={onRemoteLoadError}
                style={{
                    width: '100%',
                    aspectRatio: ratio,
                    borderRadius,
                }}
            />
        </View>
    );
};
