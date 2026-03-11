import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform,
  FlatList, KeyboardAvoidingView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { getApiUrl } from '@/lib/query-client';

const API_BASE = getApiUrl();

interface AIMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

const SUGGESTIONS = [
  'What should we build as a gang?',
  'Give me a creative project idea',
  'What are some good icebreaker questions?',
  'How can we make this community more active?',
];

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isMounted = useRef(true);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const sendScale = useSharedValue(1);
  const sendAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendScale.value = withSpring(0.85, {}, () => { sendScale.value = withSpring(1); });

    const userMsg: AIMessage = {
      id: Date.now().toString() + '_u',
      role: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const history = updatedMessages.map(m => ({ role: m.role, text: m.text }));
      const res = await fetch(`${API_BASE}api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Request failed');
      }

      const data = await res.json();
      if (!isMounted.current) return;

      const aiMsg: AIMessage = {
        id: Date.now().toString() + '_ai',
        role: 'model',
        text: data.reply || 'No response',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: any) {
      if (!isMounted.current) return;
      const errorMsg: AIMessage = {
        id: Date.now().toString() + '_err',
        role: 'model',
        text: `Error: ${err?.message || 'Something went wrong. Please try again.'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [messages, isLoading]);

  const renderMessage = useCallback(({ item }: { item: AIMessage }) => {
    const isUser = item.role === 'user';
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
        {!isUser && (
          <View style={styles.aiAvatarSlot}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={14} color={Colors.dark.green} />
            </View>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextAI]}>
            {item.text}
          </Text>
          <Text style={[styles.msgTime, isUser ? styles.msgTimeUser : styles.msgTimeAI]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
        {isUser && <View style={{ width: 8 }} />}
      </Animated.View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 10 }]}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={18} color={Colors.dark.green} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Gang AI</Text>
          <Text style={styles.headerSub}>Powered by Gemini</Text>
        </View>
        {messages.length > 0 && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMessages([]); }}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="refresh" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Messages or empty state */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="sparkles" size={36} color={Colors.dark.green} />
          </View>
          <Text style={styles.emptyTitle}>Ask GangAI anything</Text>
          <Text style={styles.emptySub}>Your AI crew member is ready to help</Text>
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => sendMessage(s)}
                style={({ pressed }) => [styles.suggestionChip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* Typing indicator */}
      {isLoading && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.typingRow}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={14} color={Colors.dark.green} />
          </View>
          <View style={styles.typingBubble}>
            <ActivityIndicator size="small" color={Colors.dark.green} />
            <Text style={styles.typingText}>GangAI is thinking...</Text>
          </View>
        </Animated.View>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 8 }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask GangAI..."
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={Platform.OS !== 'web' ? () => sendMessage(input) : undefined}
          />
          <Animated.View style={sendAnimStyle}>
            <Pressable
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              style={[styles.sendBtn, !!input.trim() && !isLoading && styles.sendBtnActive]}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={input.trim() && !isLoading ? Colors.dark.background : Colors.dark.textMuted}
              />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },
  headerText: { flex: 1 },
  headerTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: Colors.dark.text },
  headerSub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 12, color: Colors.dark.green, marginTop: 1 },
  clearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dark.surfaceElevated, borderWidth: 1, borderColor: Colors.dark.border },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: Colors.dark.text, marginBottom: 6, textAlign: 'center' },
  emptySub: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textSecondary, marginBottom: 28, textAlign: 'center' },
  suggestions: { width: '100%', gap: 10 },
  suggestionChip: {
    backgroundColor: Colors.dark.surface, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  suggestionText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 14, color: Colors.dark.textSecondary },

  // Messages
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexGrow: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI: { justifyContent: 'flex-start' },

  aiAvatarSlot: { width: 32, marginRight: 8, alignItems: 'center' },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: Colors.dark.greenGlowSubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.dark.greenGlow,
  },

  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  bubbleUser: { backgroundColor: Colors.dark.green, borderBottomRightRadius: 5 },
  bubbleAI: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderBottomLeftRadius: 5,
    borderWidth: 1, borderColor: Colors.dark.border,
  },

  msgText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, lineHeight: 22 },
  msgTextUser: { color: '#0A0A0A' },
  msgTextAI: { color: Colors.dark.text },

  msgTime: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  msgTimeUser: { color: 'rgba(0,0,0,0.45)' },
  msgTimeAI: { color: Colors.dark.textMuted },

  // Typing
  typingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border,
  },
  typingText: { fontFamily: 'SpaceGrotesk_400Regular', fontSize: 13, color: Colors.dark.textSecondary },

  // Input
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
  input: { flex: 1, fontFamily: 'SpaceGrotesk_400Regular', fontSize: 15, color: Colors.dark.text, maxHeight: 100, paddingVertical: 6 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.dark.border, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: Colors.dark.green },
});
