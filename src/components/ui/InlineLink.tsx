import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { getStyles } from '../../styles/styles';
import { theme } from '../../styles/theme';

const inlineLinkColor = theme.colors.inlineLink;

type InlineLinkProps = {
  onPress: () => void;
  children: ReactNode;
  centered?: boolean;
  isLoading?: boolean;
  style?: StyleProp<TextStyle>;
};

export const InlineLink = ({
  onPress,
  children,
  centered = true,
  isLoading = false,
  style,
}: InlineLinkProps) => {
  const styles = getStyles();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.inlineLink,
        centered && { alignItems: 'center' },
        isLoading && localStyles.loading,
      ]}
    >
      <Text style={[styles.inlineLinkText, style, isLoading && localStyles.loadingText]}>
        {children}
      </Text>
      {isLoading && <ActivityIndicator size="small" color={inlineLinkColor} />}
    </TouchableOpacity>
  );
};

const localStyles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 14,
    marginRight: 8,
  },
});
