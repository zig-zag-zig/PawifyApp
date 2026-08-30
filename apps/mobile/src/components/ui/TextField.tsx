import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { getStyles } from '../../styles/styles';
import { theme } from '../../styles/theme';

interface TextFieldProps extends TextInputProps {
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

export const TextField = ({
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
}: TextFieldProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const styles = getStyles();

  const handleTextChange = (text: string) => {
    if (!numberOnly) {
      onChangeText(text);
      return;
    }

    const filteredText = text.replace(/[^0-9]/g, '');
    onChangeText(filteredText.slice(0, maxDigits));
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
          placeholderTextColor={theme.colors.textSoft}
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
            color={theme.colors.iconMuted}
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
            color={theme.colors.text}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const localStyles = StyleSheet.create({
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
