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
      activeOpacity={1}
      style={[styles.inlineLink, centered && localStyles.centered]}
    >
      {/* The spinner is positioned outside the text's layout box, so the label stays
          exactly where it is whether or not a page is being fetched. Appending it to
          the row pushed the centred label left. */}
      <View style={localStyles.row}>
        <Text style={[styles.inlineLinkText, style]}>{children}</Text>
        {isLoading && (
          <View style={localStyles.spinnerSlot} pointerEvents="none">
            <ActivityIndicator size="small" color={inlineLinkColor} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const localStyles = StyleSheet.create({
  centered: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinnerSlot: {
    position: 'absolute',
    left: '100%',
    top: 0,
    bottom: 0,
    marginLeft: 8,
    justifyContent: 'center',
  },
});
