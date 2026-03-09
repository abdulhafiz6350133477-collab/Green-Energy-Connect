import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, TextInput,
  FlatList, KeyboardAvoidingView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, FadeIn, FadeOut,
} from 'react-native-reanimated';
import { getApiUrl } from '@/lib/query-client';
import { getSocket, joinRoom, leaveRoom } from '@/lib/socket';

interface Message {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

const API_BASE = getApiUrl();

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10);
  return 0;
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
interface BubbleProps {
  message: Message;
  isMe: boolean;
  onLongPress: (message: Message) => void;
}

function MessageBubble({ message, isMe, onLongPress }: BubbleProps) {
  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleLongPress = () => {
    if (!isMe) return; // Only own messages can be deleted
    scale.value = withSpring(0.96, {}, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(message);
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.messageRow, isMe && styles.messageRowMe]}>
      {!isMe && (
        <View style={styles.messageSenderAvatar}>
          <Text style={styles.messageSenderAvatarText}>
            {message.userName[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <Animated.View style={animStyle}>
        <Pressable
          onLongPress={isMe ? handleLongPress : undefined}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.messageBubble,
            isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
            pressed && isMe && { opacity: 0.85 },
          ]}
        >
          {!isMe && <Text style={styles.messageSender}>{message.userName}</Text>}
          <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{message.text}</Text>
          <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{timeStr}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Delete Action Sheet ──────────────────────────────────────────────────────
interface DeleteSheetProps {
  message: Message | null;
  visible: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onCancel: () => void;
}

function DeleteSheet({ message, visible, isDeleting, onDelete, onCancel }: DeleteSheetProps) {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const preview = message.text.length > 60
    ? message.text.slice(0, 60) + '…'
    : message.text;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetPreview}>
            <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textMuted} />
            <Text style={styles.sheetPreviewText} numberOfLines={2}>{preview}</Text>
          </View>

          <View style={styles.sheetDivider} />

          <Pressable
            onPress={onDelete}
            disabled={isDeleting}
            style={({ pressed }) => [styles.sheetAction, styles.sheetActionDelete, pressed && { opacity: 0.7 }]}
          >
            {isDeleting
              ? <ActivityIndicator size="small" color="#FF5252" />
              : <Ionicons name="trash-outline" size={20} color="#FF5252" />
            }
            <Text style={styles.sheetActionDeleteText}>
              {isDeleting ? 'Deleting...' : 'Delete Message'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.sheetAction, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.sheetActionCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RoomScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, user, members } = useApp();

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastTimestampRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const room = rooms.find(r => r.id === id);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const sendScale = useSharedValue(1);
  const sendAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

  // Merge new messages, deduplicated by id
  const mergeMessages = useCallback((incoming: Message[]) => {
    if (!isMounted.current || incoming.length === 0) return;
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const toAdd = incoming.filter(m => !existingIds.has(m.id));
      if (toAdd.length === 0) return prev;
      const merged = [...prev, ...toAdd].sort((a, b) => a.timestamp - b.timestamp);
      lastTimestampRef.current = Math.max(lastTimestampRef.current, ...merged.map(m => m.timestamp));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      return merged;
    });
  }, []);

  // Remove a message by id
  const removeMessage = useCallback((messageId: string) => {
    if (!isMounted.current) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  // Fetch from REST API
  const fetchMessages = useCallback(async (since = 0) => {
    if (!id || !isMounted.current) return;
    try {
      const url = `${API_BASE}api/messages/${encodeURIComponent(id)}?since=${since}&t=${Date.now()}`;
      const res = await fetch(url, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        cache: 'no-store' as RequestCache,
      });
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      const incoming: Message[] = (data.messages || []).map((m: any) => ({
        ...m,
        timestamp: toNum(m.timestamp),
      }));
      mergeMessages(incoming);
    } catch { /* silent */ }
  }, [id, mergeMessages]);

  // Socket.IO + polling setup
  useEffect(() => {
    if (!id) return;
    isMounted.current = true;
    lastTimestampRef.current = 0;

    const init = async () => {
      setLoadingMessages(true);
      await fetchMessages(0);
      if (isMounted.current) setLoadingMessages(false);
    };
    init();

    const socket = getSocket();

    const onConnect = () => {
      if (isMounted.current) { setConnected(true); joinRoom(id); }
    };
    const onDisconnect = () => { if (isMounted.current) setConnected(false); };
    const onNewMessage = (msg: any) => {
      if (!isMounted.current) return;
      mergeMessages([{ ...msg, timestamp: toNum(msg.timestamp) }]);
    };
    const onDeleteMessage = ({ messageId }: { messageId: string }) => {
      if (!isMounted.current) return;
      removeMessage(messageId);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_message', onNewMessage);
    socket.on('delete_message', onDeleteMessage);

    if (socket.connected) { setConnected(true); joinRoom(id); }

    pollIntervalRef.current = setInterval(() => {
      const since = lastTimestampRef.current > 0 ? lastTimestampRef.current - 1 : 0;
      fetchMessages(since);
    }, 3000);

    return () => {
      isMounted.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_message', onNewMessage);
      socket.off('delete_message', onDeleteMessage);
      leaveRoom(id);
    };
  }, [id]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !id || isSending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendScale.value = withSpring(0.85, {}, () => { sendScale.value = withSpring(1); });
    setSendError(null);
    setIsSending(true);
    setInputText('');

    try {
      const res = await fetch(`${API_BASE}api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: id, userId: user.id, userName: user.name, text }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || 'Send failed');
      }
      const data = await res.json();
      mergeMessages([{ ...data.message, timestamp: toNum(data.message.timestamp) }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send';
      setSendError(msg);
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }, [inputText, id, isSending, user, mergeMessages]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedMessage) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}api/messages/message/${encodeURIComponent(selectedMessage.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error || 'Delete failed');
      }
      // Remove from local state immediately
      removeMessage(selectedMessage.id);
      setSelectedMessage(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not delete message';
      Alert.alert('Delete Failed', msg);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedMessage, user.id, removeMessage]);

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <MessageBubble
      message={item}
      isMe={item.userId === user.id}
      onLongPress={setSelectedMessage}
    />
  ), [user.id]);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  if (!room) {
    return (
      <View style={styles.container}>
        <View style={styles.errorState}>
          <Ionicons name="warning-outline" size={36} color={Colors.dark.textMuted} />
          <Text style={styles.errorText}>Room not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Delete sheet */}
      <DeleteSheet
        message={selectedMessage}
        visible={!!selectedMessage}
        isDeleting={isDeleting}
        onDelete={handleDeleteConfirm}
        onCancel={() => setSelectedMessage(null)}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 8 }]}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{room.name}</Text>
          <View style={styles.headerMeta}>
            <View style={[styles.headerDot, { backgroundColor: connected ? Colors.dark.green : Colors.dark.textMuted }]} />
            <Text style={[styles.headerSubtitle, { color: connected ? Colors.dark.green : Colors.dark.textMuted }]}>
              {connected
                ? `${members.length} member${members.length !== 1 ? 's' : ''} · live`
                : 'connecting...'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Messages */}
      {loadingMessages ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.green} size="large" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-outline" size={40} color={Colors.dark.textMuted} />
              <Text style={styles.emptyChatText}>No messages yet</Text>
              <Text style={styles.emptyChatSubtext}>Be the first to say something</Text>
            </View>
          }
        />
      )}

      {/* Send error */}
      {sendError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#FF5252" />
          <Text style={styles.errorBannerText}>{sendError}</Text>
          <Pressable onPress={() => setSendError(null)}>
            <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 8 }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={(t) => { setSendError(null); setInputText(t); }}
            placeholder="Say something..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <Animated.View style={sendAnimStyle}>
            <Pressable
              onPress={handleSend}
              testID="send-button"
              style={[
                styles.sendButton,
                !!inputText.trim() && !isSending && styles.sendButtonActive,
              ]}
              disabled={!inputText.trim() || isSending}
            >
              {isSending
                ? <ActivityIndicator size="small" color={Colors.dark.background} />
                : <Ionicons
                    name="arrow-up"
                    size={20}
                    color={inputText.trim() ? Colors.dark.background : Colors.dark.textMuted}
                  />
              }
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 17, color: Colors.dark.text },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerDot: { width: 6, height: 6, borderRadius: 3 },
  headerSubtitle: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12 },
  headerRight: { width: 40 },

  // Loading
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textSecondary },

  // Messages
  messagesList: { paddingHorizontal: 16, paddingVertical: 16, gap: 6, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  messageRowMe: { justifyContent: 'flex-end' },
  messageSenderAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  messageSenderAvatarText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: Colors.dark.green },
  messageBubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  messageBubbleMe: { backgroundColor: Colors.dark.green, borderBottomRightRadius: 6 },
  messageBubbleOther: { backgroundColor: Colors.dark.surfaceElevated, borderBottomLeftRadius: 6 },
  messageSender: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 12, color: Colors.dark.green, marginBottom: 2 },
  messageText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, color: Colors.dark.text, lineHeight: 21 },
  messageTextMe: { color: Colors.dark.background },
  messageTime: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 10, color: Colors.dark.textMuted, alignSelf: 'flex-end' },
  messageTimeMe: { color: 'rgba(0, 0, 0, 0.5)' },

  // Empty
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyChatText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: Colors.dark.textSecondary },
  emptyChatSubtext: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textMuted },

  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderTopWidth: 1, borderTopColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorBannerText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 13, color: '#FF5252', flex: 1 },

  // Input
  inputContainer: {
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 22, paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  input: { flex: 1, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, color: Colors.dark.text, maxHeight: 100, paddingVertical: 6 },
  sendButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.dark.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  sendButtonActive: { backgroundColor: Colors.dark.green },

  // Error state
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 16, color: Colors.dark.textMuted },
  backBtn: { backgroundColor: Colors.dark.surface, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, marginTop: 8 },
  backBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, color: Colors.dark.text },

  // Delete sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border, alignSelf: 'center', marginBottom: 16 },
  sheetPreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.dark.border,
    marginBottom: 16,
  },
  sheetPreviewText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textSecondary, flex: 1, lineHeight: 20 },
  sheetDivider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: 12 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 4 },
  sheetActionDelete: { gap: 12 },
  sheetActionDeleteText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: '#FF5252' },
  sheetActionCancelText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, color: Colors.dark.textSecondary, textAlign: 'center', flex: 1 },
});
