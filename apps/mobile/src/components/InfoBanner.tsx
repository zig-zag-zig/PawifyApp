import React, { useEffect } from 'react';
import { Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InfoBannerProps {
    message: string;
    type: 'error' | 'success' | 'info';
    position?: 'top' | 'bottom';
    onDismiss?: () => void;
    visible?: boolean;
}

export const InfoBanner: React.FC<InfoBannerProps> = ({
    message,
    type,
    position = 'top',
    onDismiss,
    visible = true,
}) => {
    const insets = useSafeAreaInsets();
    const styles = createStyles();
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const [internalVisible, setInternalVisible] = React.useState(!!message && visible);
    const safeAreaOffset = position === 'top' ? insets.top + 12 : insets.bottom + 16;

    const getBackgroundColor = () => {
        switch (type) {
            case 'success': return '#4CAF50';
            case 'info': return '#2196F3';
            default: return '#F44336';
        }
    };

    const animateBanner = (show: boolean) => {
        Animated.timing(fadeAnim, {
            toValue: show ? 1 : 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => !show && setInternalVisible(false));
    };

    useEffect(() => {
        if (message && visible) {
            setInternalVisible(true);
            animateBanner(true);
        }
    }, [message, visible]);

    if (!internalVisible) return null;

    return (
        <Animated.View style={[
            styles.banner,
            {
                backgroundColor: getBackgroundColor(),
                [position]: safeAreaOffset,
                opacity: fadeAnim,
                transform: [{
                    translateY: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [position === 'top' ? -50 : 50, 0]
                    })
                }],
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 6,
                zIndex: 10000,
                elevation: 10000,
            }
        ]}>
            <Text style={styles.message}>{message}</Text>

            <TouchableOpacity
                onPress={() => {
                    animateBanner(false);
                    onDismiss?.();
                }}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
        </Animated.View>
    );
};

const createStyles = () => StyleSheet.create({
    banner: {
        position: 'absolute',
        left: 16,
        right: 16,
        padding: 14,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10000,
        elevation: 10000,
    },
    message: {
        color: 'white',
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
        marginRight: 8,
        fontWeight: '500',
    },
});
