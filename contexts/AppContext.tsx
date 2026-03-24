import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';
import { getSocket } from '@/lib/socket';

const API_BASE = getApiUrl();

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
  avatarUri?: string;
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
  { id: '1', title: 'Weekly Vibe Check', description: 'Share your week, wins, and what you learned.', type: 'discussion', date: 'Every Friday', time: '8:00 PM', attendees: 0, maxAttendees: 30, joined: false },
  { id: '2', title: 'Game Night', description: 'Trivia, word games, and good energy.', type: 'game', date: 'Saturday', time: '9:00 PM', attendees: 0, maxAttendees: 20, joined: false },
  { id: '3', title: 'Open Mic Call', description: 'Jump on a live group call. Talk projects or hang out.', type: 'call', date: 'Wednesday', time: '7:00 PM', attendees: 0, maxAttendees: 15, joined: false },
  { id: '4', title: 'Friendly Debate', description: 'Pick a topic, pick a side. Keep it real.', type: 'debate', date: 'Sunday', time: '6:00 PM', attendees: 0, maxAttendees: 25, joined: false },
];

interface AppContextValue {
  user: UserProfile;
  rooms: Room[];
  messages: Message[];
  projects: Project[];
  events: GangEvent[];
  members: Member[];
  isAdmin: boolean;
  adminName: string | null;
  activeMembers: number;
  pulseIntensity: number;
  hasSeenWelcome: boolean;
  notification: string | null;
  clearNotification: () => void;
  setHasSeenWelcome: (v: boolean) => void;
  sendMessage: (roomId: string, text: string) => void;
  addProject: (project: Omit<Project, 'id' | 'timestamp'>) => void;
  joinProject: (projectId: string) => void;
  joinEvent: (eventId: string) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  getMessagesForRoom: (roomId: string) => Message[];
  addSelectedMembers: (selected: { id: string; name: string; phone?: string; avatar: string }[]) => Promise<number>;
  removeMember: (memberId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>({
    id: 'device_init',
    name: 'You',
    status: 'Vibing with the gang',
    interests: ['Tech', 'Music', 'Design'],
    streak: 1,
    joinDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    avatar: 'Y',
    avatarUri: undefined,
  });
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [messages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<GangEvent[]>(DEFAULT_EVENTS);
  const [members, setMembers] = useState<Member[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [adminDeviceId, setAdminDeviceId] = useState<string | null>(null);
  const [hasSeenWelcome, setHasSeenWelcomeState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const isMounted = useRef(true);

  const activeMembers = useMemo(() => members.length, [members]);
  const pulseIntensity = useMemo(() => Math.min(1, members.length / 15), [members]);

  const clearNotification = useCallback(() => setNotification(null), []);

  useEffect(() => {
    isMounted.current = true;
    loadData();
    return () => { isMounted.current = false; };
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}api/members`, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      if (isMounted.current) setMembers(data.members || []);
    } catch { /* silent */ }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}api/projects`, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok || !isMounted.current) return;
      const data = await res.json();
      if (isMounted.current) setProjects(data.projects || []);
    } catch { /* silent */ }
  }, []);

  const claimOrCheckAdmin = useCallback(async (deviceId: string, name: string) => {
    try {
      const res = await fetch(`${API_BASE}api/admin/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current) {
        const adminStatus = data.isAdmin === true;
        setIsAdmin(adminStatus);
        setAdminName(data.adminName || null);
        setAdminDeviceId(data.adminDeviceId || null);
        // Persist admin status so it survives network failures
        await AsyncStorage.setItem('gg_is_admin', adminStatus ? 'true' : 'false');
        if (data.adminName) await AsyncStorage.setItem('gg_admin_name', data.adminName);
      }
    } catch (err) {
      console.error('claimOrCheckAdmin failed:', err);
    }
  }, []);

  const loadData = async () => {
    try {
      const [savedEvents, savedProfile, savedWelcome, savedDeviceId, savedIsAdmin, savedAdminName] = await Promise.all([
        AsyncStorage.getItem('gg_events'),
        AsyncStorage.getItem('gg_profile'),
        AsyncStorage.getItem('gg_welcome_seen'),
        AsyncStorage.getItem('gg_device_id'),
        AsyncStorage.getItem('gg_is_admin'),
        AsyncStorage.getItem('gg_admin_name'),
      ]);
      // Restore admin state from cache immediately (before network call)
      if (savedIsAdmin === 'true') setIsAdmin(true);
      if (savedAdminName) setAdminName(savedAdminName);

      let deviceId = savedDeviceId;
      if (!deviceId) {
        deviceId = 'device_' + Crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        await AsyncStorage.setItem('gg_device_id', deviceId);
      }

      let currentName = 'You';
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        currentName = profile.name || 'You';
        setUser({ ...profile, id: deviceId });
      } else {
        setUser(prev => ({ ...prev, id: deviceId! }));
      }

      if (savedEvents) setEvents(JSON.parse(savedEvents));
      if (savedWelcome === 'true') setHasSeenWelcomeState(true);

      await Promise.all([
        fetchMembers(),
        fetchProjects(),
        claimOrCheckAdmin(deviceId, currentName),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    if (isMounted.current) setIsLoaded(true);
  };

  // Socket listeners for global broadcasts
  useEffect(() => {
    const socket = getSocket();

    const onMembersUpdated = (data: {
      action: string;
      members?: Member[];
      memberId?: string;
      notification?: string;
    }) => {
      if (!isMounted.current) return;
      if (data.action === 'added' && data.members) {
        setMembers(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOnes = (data.members || []).filter(m => !existingIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        if (data.notification) {
          setNotification(data.notification);
        }
      } else if (data.action === 'removed' && data.memberId) {
        setMembers(prev => prev.filter(m => m.id !== data.memberId));
      }
    };

    const onProjectsUpdated = (data: { action: string; project?: Project }) => {
      if (!isMounted.current) return;
      if (data.action === 'created' && data.project) {
        setProjects(prev => prev.find(p => p.id === data.project!.id) ? prev : [data.project!, ...prev]);
      } else if (data.action === 'updated' && data.project) {
        setProjects(prev => prev.map(p => p.id === data.project!.id ? data.project! : p));
      }
    };

    const onAdminSet = (data: { adminDeviceId: string; adminName: string }) => {
      if (!isMounted.current) return;
      setAdminName(data.adminName);
    };

    socket.on('members_updated', onMembersUpdated);
    socket.on('projects_updated', onProjectsUpdated);
    socket.on('admin_set', onAdminSet);

    return () => {
      socket.off('members_updated', onMembersUpdated);
      socket.off('projects_updated', onProjectsUpdated);
      socket.off('admin_set', onAdminSet);
    };
  }, []);

  const saveEvents = async (evts: GangEvent[]) => {
    try { await AsyncStorage.setItem('gg_events', JSON.stringify(evts)); } catch {}
  };

  const setHasSeenWelcome = async (v: boolean) => {
    setHasSeenWelcomeState(v);
    try { await AsyncStorage.setItem('gg_welcome_seen', String(v)); } catch {}
  };

  const sendMessage = useCallback((roomId: string, text: string) => {
    setRooms(prev => prev.map(r =>
      r.id === roomId
        ? { ...r, lastMessage: text, lastMessageTime: Date.now(), messageCount: r.messageCount + 1 }
        : r
    ));
  }, []);

  const addProject = useCallback(async (project: Omit<Project, 'id' | 'timestamp'>) => {
    const id = Crypto.randomUUID();
    try {
      const res = await fetch(`${API_BASE}api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...project, id }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current) {
        setProjects(prev => prev.find(p => p.id === data.project.id) ? prev : [data.project, ...prev]);
      }
    } catch (err) {
      console.error('addProject error:', err);
    }
  }, []);

  const joinProject = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE}api/projects/${encodeURIComponent(projectId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: user.name }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current) {
        setProjects(prev => prev.map(p => p.id === projectId ? data.project : p));
      }
    } catch (err) {
      console.error('joinProject error:', err);
    }
  }, [user.name]);

  const joinEvent = useCallback((eventId: string) => {
    setEvents(prev => {
      const updated = prev.map(e =>
        e.id === eventId
          ? { ...e, joined: !e.joined, attendees: e.joined ? e.attendees - 1 : e.attendees + 1 }
          : e
      );
      saveEvents(updated);
      return updated;
    });
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem('gg_profile', JSON.stringify(updated)).catch(() => {});
      // Also re-check admin with new name
      if (updates.name && updates.name !== prev.name) {
        fetch(`${API_BASE}api/admin/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: prev.id, name: updates.name }),
        }).catch(() => {});
      }
      return updated;
    });
  }, []);

  const getMessagesForRoom = useCallback((roomId: string) => {
    return messages.filter(m => m.roomId === roomId);
  }, [messages]);

  const addSelectedMembers = useCallback(async (
    selected: { id: string; name: string; phone?: string; avatar: string }[]
  ): Promise<number> => {
    try {
      const res = await fetch(`${API_BASE}api/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: selected,
          adminDeviceId: user.id,
          adminName: user.name,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('addSelectedMembers error:', err);
        return 0;
      }
      const result = await res.json();
      const added = result.added?.length || 0;
      if (added > 0 && isMounted.current) {
        setMembers(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOnes = result.added.filter((m: Member) => !existingIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      }
      return added;
    } catch {
      return 0;
    }
  }, [user.id, user.name]);

  const removeMember = useCallback(async (memberId: string) => {
    try {
      await fetch(`${API_BASE}api/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminDeviceId: user.id }),
      });
      if (isMounted.current) setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      console.error('removeMember error:', err);
    }
  }, [user.id]);

  const value = useMemo(() => ({
    user, rooms, messages, projects, events, members,
    isAdmin, adminName, activeMembers, pulseIntensity,
    hasSeenWelcome, notification, clearNotification,
    setHasSeenWelcome, sendMessage, addProject, joinProject,
    joinEvent, updateProfile, getMessagesForRoom,
    addSelectedMembers, removeMember,
  }), [
    user, rooms, messages, projects, events, members,
    isAdmin, adminName, activeMembers, pulseIntensity,
    hasSeenWelcome, notification, clearNotification,
    sendMessage, addProject, joinProject, joinEvent, updateProfile,
    getMessagesForRoom, addSelectedMembers, removeMember,
  ]);

  if (!isLoaded) return null;

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
