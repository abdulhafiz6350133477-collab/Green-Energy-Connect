import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INTEREST_OPTIONS = [
  'Tech', 'Music', 'Design', 'Gaming', 'Art', 'Writing',
  'Fitness', 'Coding', 'Photography', 'Business', 'Science', 'Film',
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, activeMembers, setHasSeenWelcome } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editStatus, setEditStatus] = useState(user.status);
  const [editInterests, setEditInterests] = useState<string[]>(user.interests);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateProfile({
      name: editName.trim() || user.name,
      status: editStatus.trim() || user.status,
      interests: editInterests,
      avatar: (editName.trim() || user.name)[0].toUpperCase(),
    });
    setIsEditing(false);
  };

  const toggleInterest = (interest: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleReset = () => {
    Alert.alert(
      'Reset App',
      'This will clear all your data and show the welcome screen again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            setHasSeenWelcome(false);
          },
        },
      ]
    );
  };

  const streakFire = user.streak >= 7 ? Colors.dark.green : user.streak >= 3 ? Colors.dark.warning : Colors.dark.textMuted;

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
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable
            onPress={() => {
              if (isEditing) handleSave();
              else {
                setEditName(user.name);
                setEditStatus(user.status);
                setEditInterests(user.interests);
                setIsEditing(true);
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons
              name={isEditing ? 'checkmark' : 'create-outline'}
              size={20}
              color={isEditing ? Colors.dark.green : Colors.dark.text}
            />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.avatar}</Text>
            </View>
            <View style={styles.onlineDot} />
          </View>

          {isEditing ? (
            <View style={styles.editFields}>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor={Colors.dark.textMuted}
                autoFocus
              />
              <TextInput
                style={[styles.editInput, styles.editInputSmall]}
                value={editStatus}
                onChangeText={setEditStatus}
                placeholder="Your status line"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name}</Text>
              <Text style={styles.profileStatus}>{user.status}</Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={20} color={streakFire} />
              <Text style={styles.statValue}>{user.streak}</Text>
              <Text style={styles.statLabel}>day streak</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="calendar-outline" size={20} color={Colors.dark.textSecondary} />
              <Text style={styles.statValue}>{user.joinDate}</Text>
              <Text style={styles.statLabel}>joined</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color={Colors.dark.green} />
              <Text style={styles.statValue}>{activeMembers}</Text>
              <Text style={styles.statLabel}>online</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.interestsGrid}>
            {(isEditing ? INTEREST_OPTIONS : user.interests).map(interest => {
              const isSelected = isEditing ? editInterests.includes(interest) : true;
              return (
                <Pressable
                  key={interest}
                  onPress={isEditing ? () => toggleInterest(interest) : undefined}
                  style={[
                    styles.interestChip,
                    isSelected ? styles.interestChipSelected : styles.interestChipUnselected,
                  ]}
                >
                  <Text style={[
                    styles.interestText,
                    isSelected ? styles.interestTextSelected : styles.interestTextUnselected,
                  ]}>{interest}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsContainer}>
            <Pressable style={({ pressed }) => [styles.actionItem, pressed && { opacity: 0.7 }]} onPress={handleReset}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(255, 82, 82, 0.15)' }]}>
                <Ionicons name="refresh" size={20} color={Colors.dark.danger} />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Reset App</Text>
                <Text style={styles.actionSubtitle}>Clear data and start fresh</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.brandFooter}>
          <Text style={styles.brandText}>GREEN GANG</Text>
          <Text style={styles.brandTagline}>The Real Ones</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: Colors.dark.text,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  profileCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 24,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.dark.greenGlow,
    top: -4,
    left: -4,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.green,
  },
  avatarText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: Colors.dark.green,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.green,
    borderWidth: 3,
    borderColor: Colors.dark.surface,
  },
  editFields: {
    width: '100%',
    gap: 10,
  },
  editInput: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: Colors.dark.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  editInputSmall: {
    fontSize: 14,
  },
  profileInfo: {
    alignItems: 'center',
    gap: 4,
  },
  profileName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
    color: Colors.dark.text,
  },
  profileStatus: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  statLabel: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.dark.border,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 18,
    color: Colors.dark.text,
    marginBottom: 14,
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  interestChipSelected: {
    backgroundColor: Colors.dark.greenGlowSubtle,
    borderWidth: 1,
    borderColor: Colors.dark.greenGlow,
  },
  interestChipUnselected: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  interestText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
  },
  interestTextSelected: {
    color: Colors.dark.green,
  },
  interestTextUnselected: {
    color: Colors.dark.textMuted,
  },
  actionsContainer: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: Colors.dark.text,
  },
  actionSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  brandFooter: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 4,
  },
  brandText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: Colors.dark.green,
    letterSpacing: 4,
    opacity: 0.5,
  },
  brandTagline: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.textMuted,
    letterSpacing: 2,
  },
});
