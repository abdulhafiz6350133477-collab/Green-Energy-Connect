import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, TextInput,
  FlatList, KeyboardAvoidingView, ActivityIndicator, Alert, Image, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, FadeIn,
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

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, uri }: { name: string; uri?: string }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.avatar} />;
  }
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
interface BubbleProps {
  message: Message;
  isMe: boolean;
  showAvatar: boolean;
  showName: boolean;
  onLongPress: (msg: Message) => void;
}

function MessageBubble({ message, isMe, showAvatar, showName, onLongPress }: BubbleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleLongPress = () => {
    if (!isMe) return;
    scale.value = withSpring(0.96, {}, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(message);
  };

  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
      {/* Avatar placeholder for alignment (other side) */}
      {!isMe && (
        <View style={styles.avatarSlot}>
          {showAvatar && <Avatar name={message.userName} />}
        </View>
      )}

      <View style={[styles.msgGroup, isMe ? styles.msgGroupMe : styles.msgGroupThem]}>
        {/* Sender name above bubble (only for others, first in group) */}
        {!isMe && showName && (
          <Text style={styles.senderName}>{message.userName}</Text>
        )}

        <Animated.View style={animStyle}>
          <Pressable
            onLongPress={isMe ? handleLongPress : undefined}
            delayLongPress={450}
            style={({ pressed }) => [
              styles.bubble,
              isMe ? styles.bubbleMe : styles.bubbleThem,
              pressed && isMe && { opacity: 0.82 },
            ]}
          >
            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextThem]}>
              {message.text}
            </Text>
            <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeThem]}>
              {formatTime(message.timestamp)}
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {isMe && <View style={styles.avatarSlotRight} />}
    </View>
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

  const flatListRef = useRef<FlatList>(null);
  const lastTimestampRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const room = rooms.find(r => r.id === id);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const sendScale = useSharedValue(1);
  const sendAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

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

  const removeMessage = useCallback((messageId: string) => {
    if (!isMounted.current) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  const fetchMessages = useCallback(async (since = 0) => {
    if (!id || !isMounted.current) return;
    try {
      const url = `${API_BASE}api/messages/${encodeURIComponent(id)}?since=${since}&t=${Date.now()}`;
      const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, cache: 'no-store' as RequestCache });
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      const incoming: Message[] = (data.messages || []).map((m: any) => ({ ...m, timestamp: toNum(m.timestamp) }));
      mergeMessages(incoming);
    } catch { /* silent */ }
  }, [id, mergeMessages]);

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
    const onConnect = () => { if (isMounted.current) { setConnected(true); joinRoom(id); } };
    const onDisconnect = () => { if (isMounted.current) setConnected(false); };
    const onNewMessage = (msg: any) => { if (!isMounted.current) return; mergeMessages([{ ...msg, timestamp: toNum(msg.timestamp) }]); };
    const onDeleteMessage = ({ messageId }: { messageId: string }) => { if (!isMounted.current) return; removeMessage(messageId); };

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

  const handleLongPress = useCallback((msg: Message) => {
    Alert.alert(
      'Delete Message',
      'Remove this message for everyone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE}api/messages/message/${encodeURIComponent(msg.id)}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
              });
              if (res.ok) {
                removeMessage(msg.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                const e = await res.json().catch(() => ({}));
                Alert.alert('Error', (e as any).error || 'Could not delete');
              }
            } catch {
              Alert.alert('Error', 'Could not delete message');
            }
          },
        },
      ]
    );
  }, [user.id, removeMessage]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMe = item.userId === user.id;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

    const sameUserAsPrev = prevMsg?.userId === item.userId;
    const sameUserAsNext = nextMsg?.userId === item.userId;

    // Show avatar on the last message of a group from the same user
    const showAvatar = !sameUserAsNext;
    // Show name on the first message of a group
    const showName = !isMe && !sameUserAsPrev;

    return (
      <MessageBubble
        message={item}
        isMe={isMe}
        showAvatar={showAvatar}
        showName={showName}
        onLongPress={handleLongPress}
      />
    );
  }, [user.id, messages, handleLongPress]);

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
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 10 }]}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerRoomIcon}>
            <Ionicons name={room.icon as any} size={16} color={Colors.dark.green} />
          </View>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{room.name}</Text>
            <View style={styles.headerStatus}>
              <View style={[styles.dot, { backgroundColor: connected ? Colors.dark.green : Colors.dark.textMuted }]} />
              <Text style={[styles.headerSub, { color: connected ? Colors.dark.green : Colors.dark.textMuted }]}>
                {connected ? `${members.length} members · live` : 'connecting...'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const roomSlug = `GreenGang-${id?.replace(/[^a-zA-Z0-9]/g, '-') ?? 'general'}`;
            const url = `https://meet.jit.si/${roomSlug}`;
            Alert.alert(
              'Start Video Call',
              `Join a live video call for "${room?.name}"? All gang members with the link can join.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Join Call',
                  onPress: async () => {
                    try {
                      await WebBrowser.openBrowserAsync(url, {
                        toolbarColor: Colors.dark.background,
                        controlsColor: Colors.dark.green,
                      });
                    } catch {
                      Linking.openURL(url);
                    }
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => [styles.videoBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="videocam" size={20} color={Colors.dark.green} />
        </Pressable>
      </View>

      {/* Messages */}
      {loadingMessages ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.dark.green} size="large" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>Be the first to say something</Text>
            </View>
          }
        />
      )}

      {/* Error banner */}
      {sendError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={15} color="#FF5252" />
          <Text style={styles.errorBannerText} numberOfLines={1}>{sendError}</Text>
          <Pressable onPress={() => setSendError(null)}>
            <Ionicons name="close" size={15} color={Colors.dark.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 8 }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={t => { setSendError(null); setInputText(t); }}
            placeholder="Message..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={Platform.OS !== 'web' ? handleSend : undefined}
          />
          <Animated.View style={sendAnimStyle}>
            <Pressable
              onPress={handleSend}
              testID="send-button"
              disabled={!inputText.trim() || isSending}
              style={[styles.sendBtn, !!inputText.trim() && !isSending && styles.sendBtnActive]}
            >
              {isSending
                ? <ActivityIndicator size="small" color={Colors.dark.background} />
                : <Ionicons name="arrow-up" size={18} color={inputText.trim() ? Colors.dark.background : Colors.dark.textMuted} />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: 6,
  },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRoomIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },
  headerTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 15, color: Colors.dark.text },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  headerSub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 11 },

  // Loading
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textSecondary },

  // Messages list
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexGrow: 1 },

  // Message row layout
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  // Avatar
  avatarSlot: { width: 32, marginRight: 6, alignItems: 'center', justifyContent: 'flex-end' },
  avatarSlotRight: { width: 8 },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },
  avatarText: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 11, color: Colors.dark.green },

  // Message group
  msgGroup: { maxWidth: '72%' },
  msgGroupMe: { alignItems: 'flex-end' },
  msgGroupThem: { alignItems: 'flex-start' },

  senderName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: Colors.dark.green,
    marginBottom: 3,
    marginLeft: 12,
  },

  // Bubble
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 7,
    maxWidth: '100%',
  },
  bubbleMe: {
    backgroundColor: Colors.dark.green,
    borderBottomRightRadius: 5,
  },
  bubbleThem: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },

  msgText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  msgTextMe: { color: '#0A0A0A' },
  msgTextThem: { color: Colors.dark.text },

  msgTime: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  msgTimeMe: { color: 'rgba(0,0,0,0.45)' },
  msgTimeThem: { color: Colors.dark.textMuted },

  // Empty
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 16, color: Colors.dark.textSecondary },
  emptySub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 13, color: Colors.dark.textMuted },

  // Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: 'rgba(255,82,82,0.1)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,82,82,0.25)',
  },
  errorBannerText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 13, color: '#FF5252', flex: 1 },

  // Input bar
  inputBar: {
    paddingHorizontal: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 24, paddingLeft: 16, paddingRight: 5, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  input: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15, color: Colors.dark.text,
    maxHeight: 100, paddingVertical: 6,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: Colors.dark.green },

  // Error state
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 16, color: Colors.dark.textMuted },
  backBtn: { backgroundColor: Colors.dark.surface, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, marginTop: 8 },
  backBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 14, color: Colors.dark.text },
  videoBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },
});
