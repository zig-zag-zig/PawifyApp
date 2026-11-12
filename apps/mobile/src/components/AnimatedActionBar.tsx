import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

interface AnimatedActionBarProps {
    selectedCount: number;
    totalCount?: number;
    onSelectAll: () => void;
    onDelete: () => void;
    onCancel: () => void;
    visible: boolean;
}

const AnimatedActionBar: React.FC<AnimatedActionBarProps> = ({
    selectedCount,
    totalCount,
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

    const allSelected = typeof totalCount === 'number' && totalCount > 0 && selectedCount >= totalCount;
    const countLabel =
        typeof totalCount === 'number' && totalCount > 0
            ? `${selectedCount}/${totalCount}`
            : String(selectedCount);

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
                                outputRange: [24, 0],
                            }),
                        },
                    ],
                },
            ]}
            pointerEvents="auto"
        >
            <Text style={styles.counterText}>{countLabel}</Text>
            <View style={styles.actionsRow}>
                <TouchableOpacity
                    onPress={onSelectAll}
                    style={[styles.iconButton, allSelected && styles.iconButtonActive]}
                    accessibilityLabel="Select all"
                >
                    <Ionicons
                        name="checkmark-done"
                        size={21}
                        color={allSelected ? theme.colors.selectionAccent : '#CBD5E1'}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onDelete}
                    style={styles.iconButton}
                    accessibilityLabel="Delete selected"
                >
                    <Ionicons name="trash-outline" size={20} color="#FF707A" />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={onCancel}
                    style={styles.iconButton}
                    accessibilityLabel="Cancel"
                >
                    <Ionicons name="close" size={21} color="#A4A8B1" />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        position: 'absolute',
        bottom: 10,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 6,
        minHeight: 52,
        backgroundColor: '#111317',
        borderWidth: 1,
        borderColor: 'rgba(154, 160, 170, 0.24)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 10,
        zIndex: 100,
    },
    counterText: {
        color: '#F5F6F7',
        fontWeight: '600',
        fontSize: 15,
        lineHeight: 18,
        minWidth: 38,
        textAlign: 'center',
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(154, 160, 170, 0.22)',
    },
    iconButtonActive: {
        borderColor: theme.colors.selectionBorder,
        backgroundColor: theme.colors.selectionBackground,
    },
});

export default AnimatedActionBar;
