import { Text, type TextProps } from 'react-native';
import { getStyles } from '../../styles/styles';

export const SelectableText = ({ style, children, selectable = true, ...props }: TextProps) => {
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
