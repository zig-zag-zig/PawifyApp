import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { CustomButton, CustomInput } from '../StyledComponents';
import { getModalStyles } from './menuStyles';

export function LinkPasswordModal({
  visible,
  email,
  password,
  confirmPassword,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onConfirm,
  onCancel
}: {
  visible: boolean;
  email: string;
  password: string;
  confirmPassword: string;
  onEmailChange: (text: string) => void;
  onPasswordChange: (text: string) => void;
  onConfirmPasswordChange: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = getModalStyles();

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

  if (!visible) return null;

  return (
    <View style={[styles.overlay, localStyles.overlay]}>
      <View style={styles.modal}>
        <Text style={styles.title}>Link Password Sign-In</Text>
        <Text style={styles.subtitle}>Add email and password sign-in to your account</Text>

        <CustomInput
          placeholder="Email"
          value={email}
          onChangeText={onEmailChange}
          email={true}
        />

        <CustomInput
          placeholder="Password"
          value={password}
          onChangeText={onPasswordChange}
          secureText
          showPasswordToggle
        />

        <CustomInput
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={onConfirmPasswordChange}
          secureText
          showPasswordToggle
        />

        <View style={styles.buttonContainer}>
          <CustomButton onPress={onCancel}>
            Cancel
          </CustomButton>
          <CustomButton onPress={onConfirm}>
            Link Password
          </CustomButton>
        </View>
      </View>
    </View>
  );
}

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
