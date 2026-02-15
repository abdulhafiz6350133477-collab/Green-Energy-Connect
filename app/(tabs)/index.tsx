import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

function PulseIndicator({ intensity }: { intensity: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value * intensity,
  }));

  return (
    <Animated.View style={[styles.pulseRing, animatedStyle]} />
  );
}

function RoomCard({ room, onPress, index }: { room: any; onPress: () => void; index: number }) {
  const getIcon = () => {
    if (room.iconFamily === 'MaterialIcons') {
      return <MaterialIcons name={room.icon as any} size={24} color={Colors.dark.green} />;
    }
    return <Ionicons name={room.icon as any} size={24} color={Colors.dark.green} />;
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.roomCard,
        pressed && styles.roomCardPressed,
      ]}
    >
      <View style={styles.roomIconContainer}>
        {getIcon()}
      </View>
      <View style={styles.roomInfo}>
        <Text style={styles.roomName}>{room.name}</Text>
        <Text style={styles.roomDescription} numberOfLines={1}>{room.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.dark.textMuted} />
    </Pressable>
  );
}

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const { rooms, activeMembers, pulseIntensity, getMessagesForRoom } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleRoomPress = (roomId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/room/[id]', params: { id: roomId } });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + webTopInset + 16,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Rooms</Text>
            <View style={styles.pulseContainer}>
              <PulseIndicator intensity={pulseIntensity} />
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{activeMembers} active</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>Jump in and connect with the gang</Text>
        </View>

        <View style={styles.greenPulseBar}>
          <View style={[styles.greenPulseFill, { width: `${pulseIntensity * 100}%` as any }]} />
          <View style={styles.greenPulseContent}>
            <Ionicons name="pulse" size={16} color={Colors.dark.green} />
            <Text style={styles.greenPulseText}>Green Pulse</Text>
            <Text style={styles.greenPulseLevel}>
              {pulseIntensity > 0.7 ? 'High Energy' : pulseIntensity > 0.4 ? 'Vibing' : 'Warming Up'}
            </Text>
          </View>
        </View>

        <View style={styles.roomsList}>
          {rooms.map((room, index) => {
            const roomMessages = getMessagesForRoom(room.id);
            const lastMsg = roomMessages[roomMessages.length - 1];
            return (
              <RoomCard
                key={room.id}
                room={{
                  ...room,
                  lastMessage: lastMsg?.text,
                  lastMessageTime: lastMsg?.timestamp,
                }}
                onPress={() => handleRoomPress(room.id)}
                index={index}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  pulseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.greenGlowSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.greenGlow,
    overflow: 'hidden',
  },
  pulseRing: {
    position: 'absolute',
    left: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.greenGlow,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.green,
  },
  activeText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: Colors.dark.green,
  },
  greenPulseBar: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  greenPulseFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.dark.greenGlowSubtle,
  },
  greenPulseContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  greenPulseText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: Colors.dark.text,
    flex: 1,
  },
  greenPulseLevel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: Colors.dark.green,
  },
  roomsList: {
    gap: 10,
  },
  roomCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  roomCardPressed: {
    backgroundColor: Colors.dark.cardHover,
    borderColor: Colors.dark.greenGlow,
  },
  roomIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 3,
  },
  roomName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  roomDescription: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
});
