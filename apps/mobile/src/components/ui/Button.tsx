import type { ReactNode } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { getStyles } from '../../styles/styles';

type ButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export const Button = ({
  onPress,
  disabled = false,
  children,
}: ButtonProps) => {
  const styles = getStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.65 }]}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </TouchableOpacity>
  );
};
