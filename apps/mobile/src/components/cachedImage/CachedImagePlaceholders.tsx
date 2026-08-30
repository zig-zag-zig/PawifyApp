import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, Text, TextStyle, View, ImageStyle } from 'react-native';

interface PulsingPlaceholderProps {
  style?: StyleProp<ImageStyle>;
}

export const PulsingPlaceholder: React.FC<PulsingPlaceholderProps> = ({ style }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      })
    );

    animation.start();
    return () => animation.stop();
  }, [progress]);

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.24, 0.66, 0.24],
  });

  return (
    <View
      pointerEvents="none"
      style={[
        style,
        imagePlaceholderStyles.cachedImageWrapper,
        { backgroundColor: '#20252d' },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: overlayOpacity,
            backgroundColor: '#6d7d90',
          },
        ]}
      />
    </View>
  );
};

interface LoadingTextProps {
  label: string;
  style?: StyleProp<TextStyle>;
  dotCount?: number;
}

export const LoadingText: React.FC<LoadingTextProps> = ({
  label,
  style,
  dotCount = 3,
}) => {
  const [activeDotIndex, setActiveDotIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveDotIndex(currentDotIndex =>
        currentDotIndex >= dotCount - 1 ? 0 : currentDotIndex + 1
      );
    }, 450);

    return () => clearInterval(interval);
  }, [dotCount]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 650,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.Text style={[{ color: '#eef6ff', opacity: pulse }, style]}>
      {label}
      {Array.from({ length: dotCount }).map((_, index) => (
        <Text key={`loading-dot-${index}`} style={{ opacity: index <= activeDotIndex ? 1 : 0.06 }}>
          .
        </Text>
      ))}
    </Animated.Text>
  );
};

const imagePlaceholderStyles = StyleSheet.create({
  cachedImageWrapper: {
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
