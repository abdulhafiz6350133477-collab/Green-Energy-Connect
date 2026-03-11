import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ScrollView,
  TextInput, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, Member } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ContactPicker } from '@/components/ContactPicker';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const INTEREST_OPTIONS = [
  'Tech', 'Music', 'Design', 'Gaming', 'Art', 'Writing',
  'Fitness', 'Coding', 'Photography', 'Business', 'Science', 'Film',
];

// ─── Member Row ───────────────────────────────────────────────────────────────
function MemberRow({ member, onRemove, canRemove }: { member: Member; onRemove: () => void; canRemove: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{member.avatar?.[0]?.toUpperCase() || '?'}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.name}</Text>
        {member.phone && <Text style={styles.memberPhone}>{member.phone}</Text>}
      </View>
      {canRemove && (
        <Pressable onPress={onRemove} style={({ pressed }) => [styles.removeMemberBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="close-circle" size={20} color={Colors.dark.textMuted} />
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, members, setHasSeenWelcome, addSelectedMembers, removeMember, isAdmin, adminName, notification, clearNotification } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editStatus, setEditStatus] = useState(user.status);
  const [editInterests, setEditInterests] = useState<string[]>(user.interests);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const existingMemberIds = new Set(members.map(m => m.id));

  const avatarScale = useSharedValue(1);
  const avatarAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: avatarScale.value }] }));

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

  const handlePickPhoto = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Photo picking is only available on mobile.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    avatarScale.value = withSpring(0.92, {}, () => { avatarScale.value = withSpring(1); });

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      updateProfile({ avatarUri: result.assets[0].uri });
    }
  };

  const toggleInterest = (interest: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const handleAddFromContacts = () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Contact access is only available on mobile.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowContactPicker(true);
  };

  const handleContactsConfirm = async (selected: { id: string; name: string; phone?: string; avatar: string }[]) => {
    setShowContactPicker(false);
    const added = await addSelectedMembers(selected);
    if (added > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Members Added', `${added} member${added !== 1 ? 's' : ''} added to the gang!`);
    }
  };

  const handleRemoveMember = (member: Member) => {
    if (!isAdmin) return;
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
      'This will clear your local data and show the welcome screen.',
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

  const streakColor = user.streak >= 7 ? Colors.dark.green : user.streak >= 3 ? Colors.dark.warning : Colors.dark.textMuted;

  return (
    <View style={styles.container}>
      <ContactPicker
        visible={showContactPicker}
        existingIds={existingMemberIds}
        onClose={() => setShowContactPicker(false)}
        onConfirm={handleContactsConfirm}
      />

      {/* Admin notification banner */}
      {notification && (
        <Animated.View entering={FadeIn.duration(300)} style={[styles.notifBanner, { marginTop: insets.top + webTopInset }]}>
          <Ionicons name="person-add" size={16} color={Colors.dark.green} />
          <Text style={styles.notifText}>{notification}</Text>
          <Pressable onPress={clearNotification}>
            <Ionicons name="close" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
        </Animated.View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: notification ? 8 : insets.top + webTopInset + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable
            onPress={() => {
              if (isEditing) handleSave();
              else { setEditName(user.name); setEditStatus(user.status); setEditInterests(user.interests); setIsEditing(true); }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name={isEditing ? 'checkmark' : 'create-outline'} size={20} color={isEditing ? Colors.dark.green : Colors.dark.text} />
          </Pressable>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          {/* Avatar with tap-to-change */}
          <Pressable onPress={isEditing ? handlePickPhoto : undefined} style={styles.avatarContainer}>
            <Animated.View style={avatarAnimStyle}>
              <View style={styles.avatarGlow} />
              {user.avatarUri ? (
                <Image source={{ uri: user.avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{user.avatar}</Text>
                </View>
              )}
              <View style={styles.onlineDot} />
              {isEditing && (
                <View style={styles.editPhotoOverlay}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              )}
            </Animated.View>
          </Pressable>

          {/* Admin badge */}
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.dark.background} />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}

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
                style={[styles.editInput, styles.editInputSm]}
                value={editStatus}
                onChangeText={setEditStatus}
                placeholder="Status line"
                placeholderTextColor={Colors.dark.textMuted}
              />
              {isEditing && Platform.OS !== 'web' && (
                <Pressable onPress={handlePickPhoto} style={({ pressed }) => [styles.changePhotoBtn, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="image" size={16} color={Colors.dark.green} />
                  <Text style={styles.changePhotoBtnText}>
                    {user.avatarUri ? 'Change Photo' : 'Set Profile Photo'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name}</Text>
              <Text style={styles.profileStatus}>{user.status}</Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={20} color={streakColor} />
              <Text style={styles.statValue}>{user.streak}</Text>
              <Text style={styles.statLabel}>streak</Text>
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

        {/* Interests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.interestsGrid}>
            {(isEditing ? INTEREST_OPTIONS : user.interests).map(interest => {
              const selected = isEditing ? editInterests.includes(interest) : true;
              return (
                <Pressable
                  key={interest}
                  onPress={isEditing ? () => toggleInterest(interest) : undefined}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextUnselected]}>
                    {interest}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Members section */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.sectionTitle}>Members</Text>
              {!isAdmin && adminName && (
                <Text style={styles.adminHint}>Managed by {adminName}</Text>
              )}
            </View>
            {isAdmin && (
              <Pressable
                onPress={handleAddFromContacts}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.75 }]}
              >
                <Ionicons name="person-add" size={15} color={Colors.dark.background} />
                <Text style={styles.addBtnText}>Add Members</Text>
              </Pressable>
            )}
          </View>

          {members.length > 0 ? (
            <View style={styles.membersContainer}>
              {members.map(member => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onRemove={() => handleRemoveMember(member)}
                  canRemove={isAdmin}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyMembers}>
              <Ionicons name="people-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No members yet</Text>
              <Text style={styles.emptySub}>
                {isAdmin
                  ? 'Tap "Add Members" to bring in your people'
                  : adminName
                    ? `${adminName} (admin) can add members`
                    : 'The admin can add members from contacts'}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.actionsCard}>
            <Pressable style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.7 }]} onPress={handleReset}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,82,82,0.12)' }]}>
                <Ionicons name="refresh" size={18} color={Colors.dark.danger} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Reset App</Text>
                <Text style={styles.actionSub}>Clear local data and restart</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>GREEN GANG</Text>
          <Text style={styles.footerTagline}>The Real Ones</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Notification banner
  notifBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.dark.greenGlowSubtle,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.greenGlow,
  },
  notifText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, color: Colors.dark.green, flex: 1 },

  // Header
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  pageTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, color: Colors.dark.text },
  editButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.dark.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.dark.border },

  // Profile card
  profileCard: {
    backgroundColor: Colors.dark.surface, borderRadius: 22,
    padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.dark.border,
    marginBottom: 24, gap: 14,
  },
  avatarContainer: { position: 'relative', marginBottom: 2 },
  avatarGlow: { position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.dark.greenGlow, top: -4, left: -4 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.dark.greenGlowSubtle, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.dark.green },
  avatarImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: Colors.dark.green },
  avatarText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, color: Colors.dark.green },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.dark.green, borderWidth: 3, borderColor: Colors.dark.surface },
  editPhotoOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.dark.green,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.dark.surface,
  },

  // Admin badge
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.dark.green,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginTop: -6,
  },
  adminBadgeText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 11, color: Colors.dark.background, letterSpacing: 0.5 },

  editFields: { width: '100%', gap: 10 },
  editInput: {
    backgroundColor: Colors.dark.surfaceElevated, borderRadius: 12, padding: 14,
    fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, color: Colors.dark.text,
    textAlign: 'center', borderWidth: 1, borderColor: Colors.dark.border,
  },
  editInputSm: { fontSize: 14 },
  changePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.dark.greenGlowSubtle, borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },
  changePhotoBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, color: Colors.dark.green },

  profileInfo: { alignItems: 'center', gap: 4 },
  profileName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 24, color: Colors.dark.text },
  profileStatus: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, color: Colors.dark.textSecondary },

  statsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-around', paddingTop: 6 },
  statItem: { alignItems: 'center', gap: 3 },
  statValue: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: Colors.dark.text },
  statLabel: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 11, color: Colors.dark.textMuted },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.dark.border },

  // Section
  section: { marginBottom: 24 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 18, color: Colors.dark.text, marginBottom: 14 },
  adminHint: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12, color: Colors.dark.textMuted, marginTop: -10, marginBottom: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.green, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, marginBottom: 14,
  },
  addBtnText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 13, color: Colors.dark.background },

  // Interests
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  chipSelected: { backgroundColor: Colors.dark.greenGlowSubtle, borderWidth: 1, borderColor: Colors.dark.greenGlow },
  chipUnselected: { backgroundColor: Colors.dark.surfaceElevated, borderWidth: 1, borderColor: Colors.dark.border },
  chipText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14 },
  chipTextSelected: { color: Colors.dark.green },
  chipTextUnselected: { color: Colors.dark.textMuted },

  // Members
  membersContainer: { backgroundColor: Colors.dark.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border, overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.greenGlowSubtle, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.dark.greenGlow },
  memberAvatarText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: Colors.dark.green },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.dark.text },
  memberPhone: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12, color: Colors.dark.textMuted },
  removeMemberBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emptyMembers: { backgroundColor: Colors.dark.surface, borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.dark.border },
  emptyTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: Colors.dark.textSecondary },
  emptySub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 13, color: Colors.dark.textMuted, textAlign: 'center' },

  // Actions
  actionsCard: { backgroundColor: Colors.dark.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border, overflow: 'hidden' },
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1 },
  actionTitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.dark.text },
  actionSub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12, color: Colors.dark.textMuted },

  footer: { alignItems: 'center', paddingVertical: 28, gap: 4 },
  footerBrand: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, color: Colors.dark.green, letterSpacing: 4, opacity: 0.5 },
  footerTagline: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 11, color: Colors.dark.textMuted, letterSpacing: 2 },
});
