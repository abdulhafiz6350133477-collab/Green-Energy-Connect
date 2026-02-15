import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, withSequence, Easing } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { hasSeenWelcome, setHasSeenWelcome } = useApp();

  const glowOpacity = useSharedValue(0);
  const taglineOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0.8);
  const tapOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const outerGlowScale = useSharedValue(0.5);
  const outerGlowOpacity = useSharedValue(0);

  useEffect(() => {
    if (hasSeenWelcome) {
      router.replace('/(tabs)');
      return;
    }

    outerGlowOpacity.value = withDelay(200, withTiming(1, { duration: 1500 }));
    outerGlowScale.value = withDelay(200, withTiming(1, { duration: 1500 }));
    glowOpacity.value = withDelay(500, withTiming(1, { duration: 1200 }));
    taglineOpacity.value = withDelay(1200, withTiming(1, { duration: 1000 }));
    titleOpacity.value = withDelay(2000, withTiming(1, { duration: 800 }));
    titleScale.value = withDelay(2000, withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) }));
    tapOpacity.value = withDelay(3000, withTiming(1, { duration: 800 }));
    pulseScale.value = withDelay(3200, withRepeat(
      withSequence(
        withTiming(1.15, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));
  }, [hasSeenWelcome]);

  const outerGlowStyle = useAnimatedStyle(() => ({
    opacity: outerGlowOpacity.value * 0.6,
    transform: [{ scale: outerGlowScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));

  const tapStyle = useAnimatedStyle(() => ({
    opacity: tapOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const handleEnter = () => {
    setHasSeenWelcome(true);
    router.replace('/(tabs)');
  };

  if (hasSeenWelcome) return null;

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  return (
    <Pressable style={styles.container} onPress={handleEnter}>
      <View style={[styles.content, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.glowContainer}>
          <Animated.View style={[styles.outerGlow, outerGlowStyle]} />
          <Animated.View style={[styles.innerGlow, glowStyle]} />
        </View>

        <View style={styles.textContainer}>
          <Animated.Text style={[styles.tagline, taglineStyle]}>
            Where Energy Connects.
          </Animated.Text>
          <Animated.View style={titleStyle}>
            <Text style={styles.title}>GREEN GANG</Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.tapContainer, tapStyle, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 40 }]}>
          <Text style={styles.tapText}>Tap to enter</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.dark.greenGlowSubtle,
  },
  innerGlow: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.dark.greenGlow,
  },
  textContainer: {
    alignItems: 'center',
    gap: 16,
    zIndex: 2,
  },
  tagline: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 18,
    color: Colors.dark.textSecondary,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 42,
    color: Colors.dark.green,
    letterSpacing: 6,
  },
  tapContainer: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  tapText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textMuted,
    letterSpacing: 2,
  },
});
