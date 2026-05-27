import React, { useState, useEffect } from 'react';
import { View, Image, ViewStyle, StyleProp } from 'react-native';
import { CachedImageComponent } from './StyledComponents';

interface ResponsiveHeaderImageProps {
    imageUrl?: string | null;
    type: 'release' | 'profile';
    containerStyle?: StyleProp<ViewStyle>;
    borderRadius?: number;
    showSpinnerWhenNoImage?: boolean;
}

export const ResponsiveHeaderImage: React.FC<ResponsiveHeaderImageProps> = ({
    imageUrl,
    type,
    containerStyle,
    borderRadius = 8,
    showSpinnerWhenNoImage = false,
}) => {
    const [parentWidth, setParentWidth] = useState(0);
    const [ratio, setRatio] = useState(1);

    useEffect(() => {
        if (!imageUrl) return;
        Image.getSize(
            imageUrl,
            (w, h) => {
                if (w > 0 && h > 0) setRatio(w / h);
            },
            () => { }
        );
    }, [imageUrl]);

    const height = parentWidth > 0 ? parentWidth / ratio : 0;

    return (
        <View
            style={containerStyle}
            onLayout={e => setParentWidth(e.nativeEvent.layout.width)}
        >
            {parentWidth > 0 && (
                <CachedImageComponent
                    imageUrl={imageUrl}
                    type={type}
                    showSpinnerWhenNoImage={showSpinnerWhenNoImage}
                    style={{
                        width: parentWidth,
                        height,
                        borderRadius,
                    }}
                />
            )}
        </View>
    );
};
