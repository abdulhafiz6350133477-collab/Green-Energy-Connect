import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, TextInput, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, Member } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactPicker } from '@/components/ContactPicker';

const INTEREST_OPTIONS = [
  'Tech', 'Music', 'Design', 'Gaming', 'Art', 'Writing',
  'Fitness', 'Coding', 'Photography', 'Business', 'Science', 'Film',
];

function MemberRow({ member, onRemove }: { member: Member; onRemove: () => void }) {
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{member.avatar}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name}</Text>
        {member.phone && <Text style={styles.memberPhone}>{member.phone}</Text>}
      </View>
      <Pressable
        onPress={onRemove}
        style={({ pressed }) => [styles.removeMemberBtn, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
      </Pressable>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, members, setHasSeenWelcome, addSelectedMembers, removeMember } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editStatus, setEditStatus] = useState(user.status);
  const [editInterests, setEditInterests] = useState<string[]>(user.interests);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const existingMemberIds = new Set(members.map(m => m.id));

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

  const handleAddFromContacts = () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Contact access is only available on mobile devices. Open the app on your phone to add members from your contacts.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowContactPicker(true);
  };

  const handleContactsConfirm = (selected: { id: string; name: string; phone?: string; avatar: string }[]) => {
    setShowContactPicker(false);
    const added = addSelectedMembers(selected);
    if (added > 0) {
      Alert.alert('Members Added', `${added} member${added !== 1 ? 's' : ''} added to the gang!`);
    }
  };

  const handleRemoveMember = (member: Member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} from the gang?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeMember(member.id);
          },
        },
      ]
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
      <ContactPicker
        visible={showContactPicker}
        existingIds={existingMemberIds}
        onClose={() => setShowContactPicker(false)}
        onConfirm={handleContactsConfirm}
      />
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
              <Text style={styles.statValue}>{members.length}</Text>
              <Text style={styles.statLabel}>members</Text>
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
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Members</Text>
            <Pressable
              onPress={handleAddFromContacts}
              style={({ pressed }) => [styles.addContactsBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="person-add" size={16} color={Colors.dark.background} />
              <Text style={styles.addContactsBtnText}>Add from Contacts</Text>
            </Pressable>
          </View>

          {members.length > 0 ? (
            <View style={styles.membersContainer}>
              {members.map(member => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onRemove={() => handleRemoveMember(member)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyMembers}>
              <Ionicons name="people-outline" size={36} color={Colors.dark.textMuted} />
              <Text style={styles.emptyMembersText}>No members yet</Text>
              <Text style={styles.emptyMembersSubtext}>
                {Platform.OS === 'web'
                  ? 'Open on your phone to add contacts'
                  : 'Tap "Add from Contacts" to bring in your people'}
              </Text>
            </View>
          )}
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 18,
    color: Colors.dark.text,
    marginBottom: 14,
  },
  addContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.green,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
  },
  addContactsBtnText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: Colors.dark.background,
  },
  membersContainer: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.greenGlow,
  },
  memberAvatarText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.green,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: Colors.dark.text,
  },
  memberPhone: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  removeMemberBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMembers: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyMembersText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  emptyMembersSubtext: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: 'center',
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
