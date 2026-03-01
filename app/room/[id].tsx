import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, TextInput, FlatList, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { getApiUrl } from '@/lib/query-client';

interface Message {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

const API_BASE = getApiUrl();

async function apiFetch(path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    cache: 'no-store' as RequestCache,
  });
}

function MessageBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
      {!isMe && (
        <View style={styles.messageSenderAvatar}>
          <Text style={styles.messageSenderAvatarText}>{message.userName[0]?.toUpperCase() || '?'}</Text>
        </View>
      )}
      <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
        {!isMe && <Text style={styles.messageSender}>{message.userName}</Text>}
        <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{message.text}</Text>
        <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{timeStr}</Text>
      </View>
    </View>
  );
}

export default function RoomScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, user, members } = useApp();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  // Track the timestamp of the LAST message we've confirmed from the server
  // Start at 0 so the first poll fetches everything
  const lastTimestampRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const room = rooms.find(r => r.id === id);

  const sendScale = useSharedValue(1);
  const sendAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  // Merge new messages into state, deduplicating by id
  const mergeMessages = useCallback((incoming: Message[]) => {
    if (!isMounted.current || incoming.length === 0) return;
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const toAdd = incoming.filter(m => !existingIds.has(m.id));
      if (toAdd.length === 0) return prev;
      const merged = [...prev, ...toAdd].sort((a, b) => a.timestamp - b.timestamp);
      // Update lastTimestamp to the highest timestamp we know about
      lastTimestampRef.current = Math.max(
        lastTimestampRef.current,
        merged[merged.length - 1].timestamp
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      return merged;
    });
  }, []);

  // Poll for messages since lastTimestamp (or all messages if 0)
  const pollMessages = useCallback(async () => {
    if (!id || !isMounted.current) return;
    try {
      // We fetch since (lastTimestamp - 1) to ensure we never miss a message
      // due to timestamp boundary edge cases
      const since = lastTimestampRef.current > 0 ? lastTimestampRef.current - 1 : 0;
      const res = await apiFetch(`api/messages/${encodeURIComponent(id)}?since=${since}&t=${Date.now()}`);
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      const incoming: Message[] = (data.messages || []).map((m: any) => ({
        ...m,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : parseInt(m.timestamp, 10),
      }));
      mergeMessages(incoming);
    } catch (err) {
      // Silent fail — next poll will retry
    }
  }, [id, mergeMessages]);

  useEffect(() => {
    isMounted.current = true;
    lastTimestampRef.current = 0;

    // Initial load
    const init = async () => {
      setLoadingMessages(true);
      await pollMessages();
      if (isMounted.current) setLoadingMessages(false);
    };
    init();

    // Poll every 2 seconds for new messages from other devices
    pollIntervalRef.current = setInterval(pollMessages, 2000);

    return () => {
      isMounted.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [id]);  // Only re-run when room id changes

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
      const serverMsg: Message = {
        ...data.message,
        timestamp: typeof data.message.timestamp === 'number'
          ? data.message.timestamp
          : parseInt(data.message.timestamp, 10),
      };

      // Add the confirmed server message immediately
      mergeMessages([serverMsg]);
      // Scroll after message appears
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setSendError(msg);
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  }, [inputText, id, isSending, user, mergeMessages]);

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <MessageBubble message={item} isMe={item.userId === user.id} />
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
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 8 }]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{room.name}</Text>
          <View style={styles.headerMeta}>
            <View style={styles.headerDot} />
            <Text style={styles.headerSubtitle}>
              {members.length} member{members.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

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

      {sendError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#FF5252" />
          <Text style={styles.errorBannerText}>{sendError}</Text>
          <Pressable onPress={() => setSendError(null)}>
            <Ionicons name="close" size={16} color={Colors.dark.textMuted} />
          </Pressable>
        </View>
      )}

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 8 }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
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
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 17,
    color: Colors.dark.text,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.green,
  },
  headerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.green,
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
    flexGrow: 1,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageSenderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  messageSenderAvatarText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: Colors.dark.green,
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  messageBubbleMe: {
    backgroundColor: Colors.dark.green,
    borderBottomRightRadius: 6,
  },
  messageBubbleOther: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderBottomLeftRadius: 6,
  },
  messageSender: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: Colors.dark.green,
    marginBottom: 2,
  },
  messageText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.text,
    lineHeight: 21,
  },
  messageTextMe: {
    color: Colors.dark.background,
  },
  messageTime: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    color: Colors.dark.textMuted,
    alignSelf: 'flex-end',
  },
  messageTimeMe: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyChatText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  emptyChatSubtext: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorBannerText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: '#FF5252',
    flex: 1,
  },
  inputContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  input: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.text,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: Colors.dark.green,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 16,
    color: Colors.dark.textMuted,
  },
  backBtn: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: 8,
  },
  backBtnText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Colors.dark.text,
  },
});
