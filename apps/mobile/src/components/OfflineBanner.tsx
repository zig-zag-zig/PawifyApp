import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsOffline } from '../hooks/useIsOffline';

/**
 * Slim banner shown on every screen (rendered by ScreenContainer) when NetInfo
 * reports the device is offline — explains empty content instead of leaving
 * the user staring at a blank list.
 */
const OfflineBanner = () => {
    const isOffline = useIsOffline();

    if (!isOffline) {
        return null;
    }

    return (
        <View style={styles.banner} accessibilityLiveRegion="polite">
            <MaterialIcons name="cloud-off" size={16} color="#FCA5A5" />
            <Text style={styles.text}>No internet connection</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(127, 29, 29, 0.55)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(252, 165, 165, 0.35)',
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    text: {
        color: '#FCA5A5',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default OfflineBanner;
