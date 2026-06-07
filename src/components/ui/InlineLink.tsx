import type { ReactNode } from 'react';
import { Text, TouchableOpacity, type StyleProp, type TextStyle } from 'react-native';
import { getStyles } from '../../styles/styles';

type InlineLinkProps = {
  onPress: () => void;
  children: ReactNode;
  centered?: boolean;
  style?: StyleProp<TextStyle>;
};

export const InlineLink = ({
  onPress,
  children,
  centered = true,
  style,
}: InlineLinkProps) => {
  const styles = getStyles();

  return (
    <TouchableOpacity onPress={onPress} style={[styles.inlineLink, centered && { alignItems: 'center' }]}>
      <Text style={[styles.inlineLinkText, style]}>{children}</Text>
    </TouchableOpacity>
  );
};
