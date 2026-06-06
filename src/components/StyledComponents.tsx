import { MaterialIcons } from '@expo/vector-icons';
import React, { ReactNode, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextProps, TextStyle, TouchableOpacity, View } from 'react-native';
import { getStyles } from '../styles/styles';

interface ContainerProps {
  children: ReactNode;
}

export const Container: React.FC<ContainerProps> = ({ children }) => {
  const styles = getStyles();

  return (
    <View style={styles.container}>
      {children}
    </View>
  );
};

interface CustomButtonProps {
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export const CustomButton: React.FC<CustomButtonProps> = ({
  onPress,
  disabled = false,
  children
}) => {
  const styles = getStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.65 }]}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </TouchableOpacity>
  )
}

interface TouchableTextProps {
  onPress: () => void;
  children: ReactNode;
  centered?: boolean;
  style?: StyleProp<TextStyle>;
};

export const TouchableText: React.FC<TouchableTextProps> = ({
  onPress,
  children,
  centered = true,
  style,
}) => {
  const styles = getStyles();

  return (
    <TouchableOpacity onPress={onPress} style={[styles.TouchableText, centered && { alignItems: 'center' }]}>
      <Text style={[styles.TextOfTouchableText, style]}>{children}</Text>
    </TouchableOpacity>
  );
};

export const SelectableText: React.FC<TextProps> = ({ style, children, selectable = true, ...props }) => {
  const styles = getStyles();

  return (
    <Text
      {...props}
      style={[{ color: styles.text.color }, style]}
      selectable={selectable}
    >
      {children}
    </Text>
  );
};

export {
  CachedImageComponent,
} from './cachedImage/CachedImageComponent';

export {
  LoadingText,
  PulsingPlaceholder,
} from './cachedImage/CachedImagePlaceholders';

interface CustomInputProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  style?: StyleProp<TextStyle>;
  secureText?: boolean;
  email?: boolean;
  capitalize?: boolean;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  returnKeyType?: 'done' | 'next' | 'search' | 'go' | 'send';
  showPasswordToggle?: boolean;
  showClearButton?: boolean;
  numberOnly?: boolean;
  maxDigits?: number;
}

export const CustomInput: React.FC<CustomInputProps> = ({
  value,
  onChangeText,
  placeholder,
  style,
  secureText = false,
  email = false,
  capitalize = false,
  onSubmitEditing,
  returnKeyType = 'done',
  showPasswordToggle = false,
  showClearButton = false,
  numberOnly = false,
  maxDigits = 6,
  maxLength,
  ...textInputProps
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const styles = getStyles();

  const handleTextChange = (text: string) => {
    if (numberOnly) {
      const filteredText = text.replace(/[^0-9]/g, '');
      const truncatedText = filteredText.slice(0, maxDigits);
      onChangeText(truncatedText);
    } else {
      onChangeText(text);
    }
  };

  const hasClearButton = showClearButton && value.length > 0;
  const inputRightPadding = showPasswordToggle && showClearButton
    ? 84
    : (showPasswordToggle || showClearButton ? 48 : 10);

  return (
    <View style={styles.inputContainer}>
      <View style={styles.inputWrapper}>
        <TextInput
          {...textInputProps}
          autoCapitalize={capitalize ? 'sentences' : 'none'}
          keyboardType={numberOnly ? 'number-pad' : email ? 'email-address' : 'default'}
          style={[
            styles.input,
            { paddingRight: inputRightPadding },
            style,
          ]}
          value={value}
          onChangeText={handleTextChange}
          maxLength={numberOnly ? maxDigits : maxLength}
          placeholder={placeholder}
          placeholderTextColor="#BBB"
          secureTextEntry={showPasswordToggle ? !showPassword : secureText}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          autoComplete="off"
        />
      </View>
      {hasClearButton && (
        <TouchableOpacity
          style={[
            localStyles.inputIconButton,
            {
              right: showPasswordToggle ? 38 : 0,
            },
          ]}
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear input"
          hitSlop={4}
        >
          <MaterialIcons
            name="close"
            size={22}
            color="#D1D5DB"
          />
        </TouchableOpacity>
      )}
      {showPasswordToggle && (
        <TouchableOpacity
          style={[localStyles.inputIconButton, { right: 0 }]}
          onPress={() => setShowPassword(!showPassword)}
        >
          <MaterialIcons
            name={showPassword ? 'visibility' : 'visibility-off'}
            size={24}
            color="#FFF"
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

interface SpinnerProps {
  isLoading: boolean;
  size?: 'small' | 'large';
  backdropVariant?: 'subtle' | 'medium' | 'strong';
}

export const Spinner: React.FC<SpinnerProps> = ({
  isLoading,
  size = 'large',
  backdropVariant = 'medium',
}) => {
  if (!isLoading) return null;

  const spinnerBackdropColor = (() => {
    if (backdropVariant === 'strong') {
      return 'rgba(0, 0, 0, 0.46)';
    }

    if (backdropVariant === 'subtle') {
      return 'rgba(255, 255, 255, 0.08)';
    }

    return 'rgba(0, 0, 0, 0.34)';
  })();

  return (
    <View
      pointerEvents="none"
      style={[
        localStyles.spinnerBackdrop,
        { backgroundColor: spinnerBackdropColor },
      ]}
    >
      <ActivityIndicator size={size} color="#FFF" />
    </View>
  );
};

const localStyles = StyleSheet.create({
  spinnerBackdrop: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  inputIconButton: {
    position: 'absolute',
    top: '50%',
    width: 44,
    height: 44,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
