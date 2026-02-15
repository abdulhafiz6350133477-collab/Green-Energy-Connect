import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

const EVENT_ICONS: Record<string, { name: string; color: string }> = {
  discussion: { name: 'chatbubble-ellipses', color: Colors.dark.green },
  game: { name: 'game-controller', color: '#FF6B6B' },
  call: { name: 'call', color: '#40C4FF' },
  debate: { name: 'megaphone', color: '#FFB74D' },
};

function EventCard({ event, onToggleJoin }: { event: any; onToggleJoin: () => void }) {
  const iconConfig = EVENT_ICONS[event.type] || EVENT_ICONS.discussion;
  const spotsLeft = event.maxAttendees - event.attendees;
  const isAlmostFull = spotsLeft <= 3;

  return (
    <View style={[styles.eventCard, event.joined && styles.eventCardJoined]}>
      <View style={styles.eventHeader}>
        <View style={[styles.eventIconContainer, { backgroundColor: iconConfig.color + '20' }]}>
          <Ionicons name={iconConfig.name as any} size={22} color={iconConfig.color} />
        </View>
        <View style={styles.eventMeta}>
          <Text style={styles.eventDate}>{event.date}</Text>
          <Text style={styles.eventTime}>{event.time}</Text>
        </View>
      </View>

      <Text style={styles.eventTitle}>{event.title}</Text>
      <Text style={styles.eventDescription}>{event.description}</Text>

      <View style={styles.eventFooter}>
        <View style={styles.attendeesInfo}>
          <Ionicons name="people" size={16} color={Colors.dark.textSecondary} />
          <Text style={styles.attendeesText}>{event.attendees}/{event.maxAttendees}</Text>
          {isAlmostFull && !event.joined && (
            <Text style={styles.spotsText}>{spotsLeft} spots left</Text>
          )}
        </View>
        <Pressable
          onPress={onToggleJoin}
          style={({ pressed }) => [
            styles.eventButton,
            event.joined ? styles.eventButtonJoined : styles.eventButtonDefault,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Ionicons
            name={event.joined ? 'checkmark' : 'add'}
            size={16}
            color={event.joined ? Colors.dark.green : Colors.dark.background}
          />
          <Text style={[
            styles.eventButtonText,
            event.joined ? styles.eventButtonTextJoined : styles.eventButtonTextDefault,
          ]}>
            {event.joined ? 'Joined' : 'Join'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { events, joinEvent } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleToggleJoin = (eventId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    joinEvent(eventId);
  };

  const upcomingEvents = events.filter(e => !e.joined);
  const joinedEvents = events.filter(e => e.joined);

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
          <Text style={styles.headerTitle}>Events</Text>
          <Text style={styles.headerSubtitle}>What's happening in the gang</Text>
        </View>

        {joinedEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.dark.green} />
              <Text style={styles.sectionTitle}>You're In</Text>
            </View>
            <View style={styles.eventsList}>
              {joinedEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onToggleJoin={() => handleToggleJoin(event.id)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={18} color={Colors.dark.textSecondary} />
            <Text style={styles.sectionTitle}>
              {joinedEvents.length > 0 ? 'More Events' : 'Upcoming'}
            </Text>
          </View>
          <View style={styles.eventsList}>
            {(joinedEvents.length > 0 ? upcomingEvents : events).map(event => (
              <EventCard
                key={event.id}
                event={event}
                onToggleJoin={() => handleToggleJoin(event.id)}
              />
            ))}
          </View>
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
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  eventsList: {
    gap: 14,
  },
  eventCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 10,
  },
  eventCardJoined: {
    borderColor: Colors.dark.greenGlow,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMeta: {
    alignItems: 'flex-end',
  },
  eventDate: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: Colors.dark.text,
  },
  eventTime: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  eventTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 18,
    color: Colors.dark.text,
  },
  eventDescription: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  attendeesInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendeesText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  spotsText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: Colors.dark.warning,
  },
  eventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  eventButtonDefault: {
    backgroundColor: Colors.dark.green,
  },
  eventButtonJoined: {
    backgroundColor: Colors.dark.greenGlowSubtle,
    borderWidth: 1,
    borderColor: Colors.dark.greenGlow,
  },
  eventButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
  },
  eventButtonTextDefault: {
    color: Colors.dark.background,
  },
  eventButtonTextJoined: {
    color: Colors.dark.green,
  },
});
