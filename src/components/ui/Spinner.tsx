import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

type SpinnerProps = {
  isLoading: boolean;
  size?: 'small' | 'large';
  backdropVariant?: 'subtle' | 'medium' | 'strong';
};

export const Spinner = ({
  isLoading,
  size = 'large',
  backdropVariant = 'medium',
}: SpinnerProps) => {
  const [isVisible, setIsVisible] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      return;
    }

    if (!isVisible) {
      return;
    }

    // Keep the overlay through a painted content frame before revealing the screen.
    let frameId = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(() => {
        setIsVisible(false);
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [isLoading, isVisible]);

  if (!isLoading && !isVisible) return null;

  const spinnerBackdropColor = (() => {
    if (backdropVariant === 'strong') {
      return '#121212';
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
});
