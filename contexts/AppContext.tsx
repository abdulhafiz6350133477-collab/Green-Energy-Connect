import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export interface Room {
  id: string;
  name: string;
  icon: string;
  iconFamily: string;
  description: string;
  lastMessage?: string;
  lastMessageTime?: number;
  messageCount: number;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  creator: string;
  creatorId: string;
  tags: string[];
  teammates: string[];
  maxTeam: number;
  timestamp: number;
  status: 'open' | 'in-progress' | 'completed';
}

export interface GangEvent {
  id: string;
  title: string;
  description: string;
  type: 'discussion' | 'game' | 'call' | 'debate';
  date: string;
  time: string;
  attendees: number;
  maxAttendees: number;
  joined: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  status: string;
  interests: string[];
  streak: number;
  joinDate: string;
  avatar: string;
}

export interface Member {
  id: string;
  name: string;
  phone?: string;
  avatar: string;
  addedAt: number;
}

const DEFAULT_ROOMS: Room[] = [
  { id: 'general', name: 'General Chat', icon: 'chatbubbles', iconFamily: 'Ionicons', description: 'Talk about anything', messageCount: 0 },
  { id: 'ideas', name: 'Ideas Room', icon: 'lightbulb', iconFamily: 'MaterialIcons', description: 'Share your ideas', messageCount: 0 },
  { id: 'tech', name: 'Tech Talk', icon: 'code-slash', iconFamily: 'Ionicons', description: 'Discuss tech & code', messageCount: 0 },
  { id: 'fun', name: 'Fun Zone', icon: 'game-controller', iconFamily: 'Ionicons', description: 'Games & laughs', messageCount: 0 },
  { id: 'projects', name: 'Projects Space', icon: 'rocket', iconFamily: 'Ionicons', description: 'Build together', messageCount: 0 },
];

const DEFAULT_EVENTS: GangEvent[] = [
  { id: '1', title: 'Weekly Vibe Check', description: 'Share your week, wins, and what you learned. No pressure, just vibes.', type: 'discussion', date: 'Every Friday', time: '8:00 PM', attendees: 0, maxAttendees: 30, joined: false },
  { id: '2', title: 'Game Night', description: 'Trivia, word games, and good energy. Bring your competitive spirit.', type: 'game', date: 'Saturday', time: '9:00 PM', attendees: 0, maxAttendees: 20, joined: false },
  { id: '3', title: 'Open Mic Call', description: 'Jump on a live group call. Talk projects, ideas, or just hang out.', type: 'call', date: 'Wednesday', time: '7:00 PM', attendees: 0, maxAttendees: 15, joined: false },
  { id: '4', title: 'Friendly Debate', description: 'Pick a topic, pick a side. Keep it respectful, keep it real.', type: 'debate', date: 'Sunday', time: '6:00 PM', attendees: 0, maxAttendees: 25, joined: false },
];

interface AppContextValue {
  user: UserProfile;
  rooms: Room[];
  messages: Message[];
  projects: Project[];
  events: GangEvent[];
  members: Member[];
  activeMembers: number;
  pulseIntensity: number;
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (v: boolean) => void;
  sendMessage: (roomId: string, text: string) => void;
  addProject: (project: Omit<Project, 'id' | 'timestamp'>) => void;
  joinProject: (projectId: string) => void;
  joinEvent: (eventId: string) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  getMessagesForRoom: (roomId: string) => Message[];
  addMembersFromContacts: () => Promise<{ added: number; denied: boolean }>;
  removeMember: (memberId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>({
    id: 'me',
    name: 'You',
    status: 'Vibing with the gang',
    interests: ['Tech', 'Music', 'Design'],
    streak: 1,
    joinDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    avatar: 'Y',
  });
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<GangEvent[]>(DEFAULT_EVENTS);
  const [members, setMembers] = useState<Member[]>([]);
  const [hasSeenWelcome, setHasSeenWelcomeState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const activeMembers = useMemo(() => {
    return members.length;
  }, [members]);

  const pulseIntensity = useMemo(() => {
    if (members.length === 0) return 0;
    return Math.min(1, members.length / 15);
  }, [members]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [savedMessages, savedProjects, savedEvents, savedProfile, savedWelcome, savedMembers] = await Promise.all([
        AsyncStorage.getItem('gg_messages'),
        AsyncStorage.getItem('gg_projects'),
        AsyncStorage.getItem('gg_events'),
        AsyncStorage.getItem('gg_profile'),
        AsyncStorage.getItem('gg_welcome_seen'),
        AsyncStorage.getItem('gg_members'),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedProjects) setProjects(JSON.parse(savedProjects));
      if (savedEvents) setEvents(JSON.parse(savedEvents));
      if (savedProfile) setUser(JSON.parse(savedProfile));
      if (savedWelcome === 'true') setHasSeenWelcomeState(true);
      if (savedMembers) setMembers(JSON.parse(savedMembers));
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    setIsLoaded(true);
  };

  const saveMessages = async (msgs: Message[]) => {
    try { await AsyncStorage.setItem('gg_messages', JSON.stringify(msgs)); } catch {}
  };
  const saveProjects = async (projs: Project[]) => {
    try { await AsyncStorage.setItem('gg_projects', JSON.stringify(projs)); } catch {}
  };
  const saveEvents = async (evts: GangEvent[]) => {
    try { await AsyncStorage.setItem('gg_events', JSON.stringify(evts)); } catch {}
  };
  const saveMembers = async (mems: Member[]) => {
    try { await AsyncStorage.setItem('gg_members', JSON.stringify(mems)); } catch {}
  };

  const setHasSeenWelcome = async (v: boolean) => {
    setHasSeenWelcomeState(v);
    try { await AsyncStorage.setItem('gg_welcome_seen', String(v)); } catch {}
  };

  const sendMessage = useCallback((roomId: string, text: string) => {
    const newMsg: Message = {
      id: Crypto.randomUUID(),
      roomId,
      userId: user.id,
      userName: user.name,
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      saveMessages(updated);
      return updated;
    });
    setRooms(prev => prev.map(r =>
      r.id === roomId ? { ...r, lastMessage: text, lastMessageTime: Date.now(), messageCount: r.messageCount + 1 } : r
    ));
  }, [user]);

  const addProject = useCallback((project: Omit<Project, 'id' | 'timestamp'>) => {
    const newProj: Project = {
      ...project,
      id: Crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setProjects(prev => {
      const updated = [newProj, ...prev];
      saveProjects(updated);
      return updated;
    });
  }, []);

  const joinProject = useCallback((projectId: string) => {
    setProjects(prev => {
      const updated = prev.map(p =>
        p.id === projectId && !p.teammates.includes(user.name) && p.teammates.length < p.maxTeam
          ? { ...p, teammates: [...p.teammates, user.name] }
          : p
      );
      saveProjects(updated);
      return updated;
    });
  }, [user.name]);

  const joinEvent = useCallback((eventId: string) => {
    setEvents(prev => {
      const updated = prev.map(e =>
        e.id === eventId ? { ...e, joined: !e.joined, attendees: e.joined ? e.attendees - 1 : e.attendees + 1 } : e
      );
      saveEvents(updated);
      return updated;
    });
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem('gg_profile', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const getMessagesForRoom = useCallback((roomId: string) => {
    return messages.filter(m => m.roomId === roomId);
  }, [messages]);

  const addMembersFromContacts = useCallback(async (): Promise<{ added: number; denied: boolean }> => {
    if (Platform.OS === 'web') {
      return { added: 0, denied: true };
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        return { added: 0, denied: true };
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      if (!data || data.length === 0) {
        return { added: 0, denied: false };
      }

      const existingIds = new Set(members.map(m => m.id));
      let addedCount = 0;

      const newMembers: Member[] = [];
      for (const contact of data) {
        const contactName = contact.name;
        if (!contactName) continue;

        const contactId = `contact_${contact.id}`;
        if (existingIds.has(contactId)) continue;

        const phone = contact.phoneNumbers?.[0]?.number;

        newMembers.push({
          id: contactId,
          name: contactName,
          phone: phone || undefined,
          avatar: contactName[0]?.toUpperCase() || '?',
          addedAt: Date.now(),
        });
        addedCount++;
      }

      if (newMembers.length > 0) {
        setMembers(prev => {
          const updated = [...prev, ...newMembers];
          saveMembers(updated);
          return updated;
        });
      }

      return { added: addedCount, denied: false };
    } catch (error) {
      console.error('Failed to access contacts:', error);
      return { added: 0, denied: false };
    }
  }, [members]);

  const removeMember = useCallback((memberId: string) => {
    setMembers(prev => {
      const updated = prev.filter(m => m.id !== memberId);
      saveMembers(updated);
      return updated;
    });
  }, []);

  const value = useMemo(() => ({
    user, rooms, messages, projects, events, members, activeMembers, pulseIntensity,
    hasSeenWelcome, setHasSeenWelcome, sendMessage, addProject, joinProject,
    joinEvent, updateProfile, getMessagesForRoom, addMembersFromContacts, removeMember,
  }), [user, rooms, messages, projects, events, members, activeMembers, pulseIntensity,
    hasSeenWelcome, sendMessage, addProject, joinProject, joinEvent, updateProfile,
    getMessagesForRoom, addMembersFromContacts, removeMember]);

  if (!isLoaded) return null;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
