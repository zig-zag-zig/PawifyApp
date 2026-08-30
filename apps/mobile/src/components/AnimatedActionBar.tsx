import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AnimatedActionBarProps {
    selectedCount: number;
    onSelectAll: () => void;
    onDelete: () => void;
    onCancel: () => void;
    visible: boolean;
}

const AnimatedActionBar: React.FC<AnimatedActionBarProps> = ({
    selectedCount,
    onSelectAll,
    onDelete,
    onCancel,
    visible,
}) => {
    const animValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(animValue, {
            toValue: visible ? 1 : 0,
            useNativeDriver: true,
            speed: 20,
        }).start();
    }, [visible]);

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.bar,
                {
                    opacity: animValue,
                    transform: [
                        {
                            translateY: animValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-40, 0],
                            }),
                        },
                    ],
                    backgroundColor: 'rgba(30,30,30,0.75)',
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 8,
                    alignSelf: 'center',
                    width: undefined,
                    maxWidth: '90%',
                },
            ]}
            pointerEvents="auto"
        >
            <TouchableOpacity onPress={onSelectAll} style={styles.iconButton} accessibilityLabel="Select all">
                <Ionicons name="checkbox-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
            <View style={styles.countBadge}>
                <Text style={styles.countText}>{selectedCount}</Text>
            </View>
            <TouchableOpacity onPress={onDelete} style={styles.iconButton} accessibilityLabel="Delete selected">
                <Ionicons name="trash-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={styles.iconButton} accessibilityLabel="Cancel">
                <Ionicons name="close-outline" size={24} color="#888" />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        position: 'absolute',
        alignItems: 'center',
        marginTop: Platform.OS === 'ios' ? 60 : 40,
        marginBottom: 10,
        borderRadius: 18,
        paddingHorizontal: 18,
        paddingVertical: 8,
        minHeight: 44,
        minWidth: 200,
        zIndex: 100,
    },
    iconButton: {
        padding: 8,
        marginHorizontal: 2,
    },
    countBadge: {
        backgroundColor: '#007AFF',
        borderRadius: 12,
        minWidth: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 8,
    },
    countText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
});

export default AnimatedActionBar;
