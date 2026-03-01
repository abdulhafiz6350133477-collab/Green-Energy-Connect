import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput,
  Modal, ActivityIndicator, Alert, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  avatar: string;
  selected: boolean;
}

interface ContactPickerProps {
  visible: boolean;
  existingIds: Set<string>;
  onClose: () => void;
  onConfirm: (contacts: { id: string; name: string; phone?: string; avatar: string }[]) => void;
}

export function ContactPicker({ visible, existingIds, onClose, onConfirm }: ContactPickerProps) {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [filtered, setFiltered] = useState<ContactItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (visible) {
      loadContacts();
    } else {
      setSearch('');
      setContacts([]);
      setFiltered([]);
      setPermissionDenied(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(contacts);
    } else {
      const q = search.toLowerCase();
      setFiltered(contacts.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
      ));
    }
  }, [search, contacts]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      const items: ContactItem[] = (data || [])
        .filter(c => c.name)
        .map(c => ({
          id: `contact_${c.id}`,
          name: c.name!,
          phone: c.phoneNumbers?.[0]?.number,
          avatar: c.name![0]?.toUpperCase() || '?',
          selected: false,
        }));

      setContacts(items);
      setFiltered(items);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      Alert.alert('Error', 'Could not load contacts. Please try again.');
    }
    setLoading(false);
  };

  const toggleContact = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
    setFiltered(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  }, []);

  const selectedCount = contacts.filter(c => c.selected).length;

  const handleConfirm = () => {
    const selected = contacts.filter(c => c.selected);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selected.map(c => ({ id: c.id, name: c.name, phone: c.phone, avatar: c.avatar })));
  };

  const renderContact = useCallback(({ item }: { item: ContactItem }) => {
    const alreadyAdded = existingIds.has(item.id);
    return (
      <Pressable
        onPress={() => !alreadyAdded && toggleContact(item.id)}
        style={({ pressed }) => [
          styles.contactRow,
          item.selected && styles.contactRowSelected,
          pressed && !alreadyAdded && { opacity: 0.7 },
          alreadyAdded && { opacity: 0.45 },
        ]}
      >
        <View style={[styles.contactAvatar, item.selected && styles.contactAvatarSelected]}>
          <Text style={styles.contactAvatarText}>{item.avatar}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.phone && <Text style={styles.contactPhone}>{item.phone}</Text>}
          {alreadyAdded && <Text style={styles.alreadyAdded}>Already in gang</Text>}
        </View>
        {!alreadyAdded && (
          <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
            {item.selected && <Ionicons name="checkmark" size={14} color={Colors.dark.background} />}
          </View>
        )}
      </Pressable>
    );
  }, [existingIds, toggleContact]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={22} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Add Members</Text>
          <Pressable
            onPress={handleConfirm}
            disabled={selectedCount === 0}
            style={({ pressed }) => [
              styles.confirmBtn,
              selectedCount === 0 && styles.confirmBtnDisabled,
              pressed && selectedCount > 0 && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.confirmBtnText, selectedCount === 0 && styles.confirmBtnTextDisabled]}>
              Add{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Text>
          </Pressable>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={Colors.dark.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts..."
            placeholderTextColor={Colors.dark.textMuted}
            clearButtonMode="while-editing"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.dark.green} size="large" />
            <Text style={styles.loadingText}>Loading contacts...</Text>
          </View>
        ) : permissionDenied ? (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.permText}>Contacts Access Denied</Text>
            <Text style={styles.permSubtext}>Enable contacts access in your device settings to add members.</Text>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.permText}>No contacts found</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderContact}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.permText}>No contacts match "{search}"</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 18,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 18,
    color: Colors.dark.text,
  },
  confirmBtn: {
    backgroundColor: Colors.dark.green,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.dark.surface,
  },
  confirmBtnText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: Colors.dark.background,
  },
  confirmBtnTextDisabled: {
    color: Colors.dark.textMuted,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.text,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginTop: 12,
  },
  permText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  permSubtext: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  contactRowSelected: {
    backgroundColor: Colors.dark.greenGlowSubtle,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  contactAvatarSelected: {
    borderColor: Colors.dark.green,
    backgroundColor: Colors.dark.greenGlowSubtle,
  },
  contactAvatarText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 17,
    color: Colors.dark.green,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: Colors.dark.text,
  },
  contactPhone: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  alreadyAdded: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: Colors.dark.green,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.dark.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.green,
    borderColor: Colors.dark.green,
  },
});
