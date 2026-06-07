import type { ReactNode } from 'react';
import { View } from 'react-native';
import { getStyles } from '../../styles/styles';

type ScreenContainerProps = {
  children: ReactNode;
};

export const ScreenContainer = ({ children }: ScreenContainerProps) => {
  const styles = getStyles();

  return (
    <View style={styles.container}>
      {children}
    </View>
  );
};
