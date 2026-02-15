import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

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

const DEFAULT_ROOMS: Room[] = [
  { id: 'general', name: 'General Chat', icon: 'chatbubbles', iconFamily: 'Ionicons', description: 'Talk about anything', messageCount: 0 },
  { id: 'ideas', name: 'Ideas Room', icon: 'lightbulb', iconFamily: 'MaterialIcons', description: 'Share your ideas', messageCount: 0 },
  { id: 'tech', name: 'Tech Talk', icon: 'code-slash', iconFamily: 'Ionicons', description: 'Discuss tech & code', messageCount: 0 },
  { id: 'fun', name: 'Fun Zone', icon: 'game-controller', iconFamily: 'Ionicons', description: 'Games & laughs', messageCount: 0 },
  { id: 'projects', name: 'Projects Space', icon: 'rocket', iconFamily: 'Ionicons', description: 'Build together', messageCount: 0 },
];

const DEFAULT_EVENTS: GangEvent[] = [
  { id: '1', title: 'Weekly Vibe Check', description: 'Share your week, wins, and what you learned. No pressure, just vibes.', type: 'discussion', date: 'Every Friday', time: '8:00 PM', attendees: 12, maxAttendees: 30, joined: false },
  { id: '2', title: 'Game Night', description: 'Trivia, word games, and good energy. Bring your competitive spirit.', type: 'game', date: 'Saturday', time: '9:00 PM', attendees: 8, maxAttendees: 20, joined: false },
  { id: '3', title: 'Open Mic Call', description: 'Jump on a live group call. Talk projects, ideas, or just hang out.', type: 'call', date: 'Wednesday', time: '7:00 PM', attendees: 5, maxAttendees: 15, joined: false },
  { id: '4', title: 'Friendly Debate', description: 'Pick a topic, pick a side. Keep it respectful, keep it real.', type: 'debate', date: 'Sunday', time: '6:00 PM', attendees: 10, maxAttendees: 25, joined: false },
];

const SAMPLE_MESSAGES: Message[] = [
  { id: '1', roomId: 'general', userId: 'bot', userName: 'GreenBot', text: 'Welcome to Green Gang! This is where the real ones connect.', timestamp: Date.now() - 300000 },
  { id: '2', roomId: 'general', userId: 'alex', userName: 'Alex', text: 'Hey everyone! Excited to be here.', timestamp: Date.now() - 240000 },
  { id: '3', roomId: 'general', userId: 'jordan', userName: 'Jordan', text: 'The energy in here is unmatched.', timestamp: Date.now() - 180000 },
  { id: '4', roomId: 'ideas', userId: 'sam', userName: 'Sam', text: 'What if we built a community playlist feature?', timestamp: Date.now() - 120000 },
  { id: '5', roomId: 'tech', userId: 'morgan', userName: 'Morgan', text: 'Anyone working with React Native? Looking for tips on animations.', timestamp: Date.now() - 60000 },
  { id: '6', roomId: 'fun', userId: 'casey', userName: 'Casey', text: 'Movie night this weekend? Drop your picks!', timestamp: Date.now() - 30000 },
  { id: '7', roomId: 'projects', userId: 'taylor', userName: 'Taylor', text: 'Starting a new open source project. Who wants in?', timestamp: Date.now() - 15000 },
];

const SAMPLE_PROJECTS: Project[] = [
  { id: '1', title: 'Community Playlist App', description: 'Build a shared music playlist where members can add songs and vote on what plays next.', creator: 'Sam', creatorId: 'sam', tags: ['music', 'react-native', 'api'], teammates: ['Sam', 'Alex'], maxTeam: 5, timestamp: Date.now() - 86400000, status: 'open' },
  { id: '2', title: 'Green Gang Bot', description: 'An AI-powered bot that helps moderate rooms and answers community questions.', creator: 'Morgan', creatorId: 'morgan', tags: ['ai', 'python', 'bot'], teammates: ['Morgan'], maxTeam: 3, timestamp: Date.now() - 172800000, status: 'in-progress' },
  { id: '3', title: 'Event Planner Tool', description: 'A mini tool to help organize and RSVP for community events right from the app.', creator: 'Taylor', creatorId: 'taylor', tags: ['productivity', 'typescript'], teammates: ['Taylor', 'Jordan', 'Casey'], maxTeam: 4, timestamp: Date.now() - 259200000, status: 'open' },
];

const MEMBER_NAMES = ['Alex', 'Jordan', 'Sam', 'Morgan', 'Casey', 'Taylor', 'Riley', 'Avery', 'Quinn', 'Reese', 'Dakota', 'Skyler'];

interface AppContextValue {
  user: UserProfile;
  rooms: Room[];
  messages: Message[];
  projects: Project[];
  events: GangEvent[];
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
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>({
    id: 'me',
    name: 'You',
    status: 'Vibing with the gang',
    interests: ['Tech', 'Music', 'Design'],
    streak: 7,
    joinDate: 'Feb 2026',
    avatar: 'Y',
  });
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [projects, setProjects] = useState<Project[]>(SAMPLE_PROJECTS);
  const [events, setEvents] = useState<GangEvent[]>(DEFAULT_EVENTS);
  const [hasSeenWelcome, setHasSeenWelcomeState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const activeMembers = useMemo(() => {
    const hour = new Date().getHours();
    const base = hour >= 9 && hour <= 23 ? 8 : 3;
    return base + Math.floor(Math.random() * 5);
  }, []);

  const pulseIntensity = useMemo(() => {
    return Math.min(1, activeMembers / 15);
  }, [activeMembers]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [savedMessages, savedProjects, savedEvents, savedProfile, savedWelcome] = await Promise.all([
        AsyncStorage.getItem('gg_messages'),
        AsyncStorage.getItem('gg_projects'),
        AsyncStorage.getItem('gg_events'),
        AsyncStorage.getItem('gg_profile'),
        AsyncStorage.getItem('gg_welcome_seen'),
      ]);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedProjects) setProjects(JSON.parse(savedProjects));
      if (savedEvents) setEvents(JSON.parse(savedEvents));
      if (savedProfile) setUser(JSON.parse(savedProfile));
      if (savedWelcome === 'true') setHasSeenWelcomeState(true);
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

    setTimeout(() => {
      const botName = MEMBER_NAMES[Math.floor(Math.random() * MEMBER_NAMES.length)];
      const replies = [
        'Facts!', 'Love that energy.', 'Real talk.', 'Let\'s go!',
        'Big moves.', 'I\'m with you on that.', 'That\'s fire.',
        'Respect.', 'Count me in.', 'This is why I\'m here.',
      ];
      const replyMsg: Message = {
        id: Crypto.randomUUID(),
        roomId,
        userId: botName.toLowerCase(),
        userName: botName,
        text: replies[Math.floor(Math.random() * replies.length)],
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const updated = [...prev, replyMsg];
        saveMessages(updated);
        return updated;
      });
    }, 1500 + Math.random() * 2000);
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

  const value = useMemo(() => ({
    user, rooms, messages, projects, events, activeMembers, pulseIntensity,
    hasSeenWelcome, setHasSeenWelcome, sendMessage, addProject, joinProject,
    joinEvent, updateProfile, getMessagesForRoom,
  }), [user, rooms, messages, projects, events, activeMembers, pulseIntensity,
    hasSeenWelcome, sendMessage, addProject, joinProject, joinEvent, updateProfile, getMessagesForRoom]);

  if (!isLoaded) return null;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
