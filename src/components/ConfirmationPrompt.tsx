import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { getStyles } from '../styles/styles';

interface ConfirmationPromptProps {
    visible: boolean;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger: boolean;
}

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
    visible,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
    danger,
}) => {
    const styles = getStyles();

    useEffect(() => {
        if (!visible) {
            return;
        }

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            onCancel();
            return true;
        });

        return () => subscription.remove();
    }, [onCancel, visible]);

    if (!visible) {
        return null;
    }

    return (
        <View style={[styles.modalOverlay, localStyles.overlay]}>
            <View style={[styles.modalContainer, { width: '90%', padding: 28 }]}>
                <Text style={[styles.modalTitle, { fontSize: 20, marginBottom: 18 }]}>{message}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 }}>
                    <TouchableOpacity
                        style={[
                            styles.button,
                            {
                                backgroundColor: '#444',
                                minWidth: 120,
                                marginRight: 16,
                                paddingVertical: 12,
                            }
                        ]}
                        onPress={onCancel}
                    >
                        <Text style={[styles.buttonText, { color: '#FFF', fontSize: 16 }]}>{cancelText}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.button,
                            {
                                backgroundColor: danger ? '#D32F2F' : '#007AFF',
                                minWidth: 120,
                                paddingVertical: 12,
                            }
                        ]}
                        onPress={onConfirm}
                    >
                        <Text style={[styles.buttonText, { color: '#FFF', fontSize: 16 }]}>{confirmText}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const localStyles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9000,
        elevation: 9000,
    },
});
