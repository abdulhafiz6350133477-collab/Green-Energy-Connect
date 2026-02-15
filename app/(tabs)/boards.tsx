import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

const TAG_COLORS: Record<string, string> = {
  'music': '#FF6B6B',
  'react-native': '#61DAFB',
  'api': '#FFD93D',
  'ai': '#C084FC',
  'python': '#3B82F6',
  'bot': '#34D399',
  'productivity': '#F97316',
  'typescript': '#2563EB',
  'design': '#EC4899',
  'web': '#06B6D4',
};

function ProjectCard({ project, onJoin }: { project: any; onJoin: () => void }) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    'open': { bg: Colors.dark.greenGlowSubtle, text: Colors.dark.green },
    'in-progress': { bg: 'rgba(255, 183, 77, 0.15)', text: Colors.dark.warning },
    'completed': { bg: 'rgba(64, 196, 255, 0.15)', text: Colors.dark.info },
  };
  const sc = statusColors[project.status] || statusColors['open'];
  const isFull = project.teammates.length >= project.maxTeam;

  return (
    <View style={styles.projectCard}>
      <View style={styles.projectHeader}>
        <Text style={styles.projectTitle}>{project.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>
            {project.status === 'in-progress' ? 'In Progress' : project.status === 'open' ? 'Open' : 'Done'}
          </Text>
        </View>
      </View>
      <Text style={styles.projectDescription}>{project.description}</Text>
      <View style={styles.tagsRow}>
        {project.tags.map((tag: string) => (
          <View key={tag} style={[styles.tag, { backgroundColor: (TAG_COLORS[tag] || Colors.dark.green) + '20' }]}>
            <Text style={[styles.tagText, { color: TAG_COLORS[tag] || Colors.dark.green }]}>{tag}</Text>
          </View>
        ))}
      </View>
      <View style={styles.projectFooter}>
        <View style={styles.teamInfo}>
          <View style={styles.avatarStack}>
            {project.teammates.slice(0, 3).map((name: string, i: number) => (
              <View key={name} style={[styles.miniAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
                <Text style={styles.miniAvatarText}>{name[0]}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.teamCount}>{project.teammates.length}/{project.maxTeam}</Text>
        </View>
        {project.status === 'open' && !isFull && (
          <Pressable
            onPress={onJoin}
            style={({ pressed }) => [styles.joinButton, pressed && styles.joinButtonPressed]}
          >
            <Ionicons name="add" size={16} color={Colors.dark.background} />
            <Text style={styles.joinButtonText}>Join</Text>
          </Pressable>
        )}
        {isFull && project.status === 'open' && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullText}>Full</Text>
          </View>
        )}
      </View>
      <Text style={styles.creatorText}>by {project.creator}</Text>
    </View>
  );
}

export default function BoardsScreen() {
  const insets = useSafeAreaInsets();
  const { projects, addProject, joinProject, user } = useApp();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newMaxTeam, setNewMaxTeam] = useState('4');
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleCreateProject = () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addProject({
      title: newTitle.trim(),
      description: newDesc.trim(),
      creator: user.name,
      creatorId: user.id,
      tags: newTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
      teammates: [user.name],
      maxTeam: parseInt(newMaxTeam) || 4,
      status: 'open',
    });
    setNewTitle('');
    setNewDesc('');
    setNewTags('');
    setNewMaxTeam('4');
    setShowNewProject(false);
  };

  const handleJoin = (projectId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    joinProject(projectId);
  };

  return (
    <View style={styles.container}>
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
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Boards</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowNewProject(true);
              }}
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <Ionicons name="add" size={22} color={Colors.dark.background} />
            </Pressable>
          </View>
          <Text style={styles.headerSubtitle}>Collaborate and build together</Text>
        </View>

        <View style={styles.projectsList}>
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onJoin={() => handleJoin(project.id)}
            />
          ))}
        </View>

        {projects.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="rocket-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptySubtitle}>Start a project and find your team</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showNewProject} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContainer, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Project</Text>
              <Pressable onPress={() => setShowNewProject(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Project Name</Text>
                <TextInput
                  style={styles.input}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="What are you building?"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoFocus
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={newDesc}
                  onChangeText={setNewDesc}
                  placeholder="Tell the gang about your idea..."
                  placeholderTextColor={Colors.dark.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tags (comma separated)</Text>
                <TextInput
                  style={styles.input}
                  value={newTags}
                  onChangeText={setNewTags}
                  placeholder="react-native, design, api"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Max Team Size</Text>
                <TextInput
                  style={styles.input}
                  value={newMaxTeam}
                  onChangeText={setNewMaxTeam}
                  placeholder="4"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>

              <Pressable
                onPress={handleCreateProject}
                style={({ pressed }) => [
                  styles.createButton,
                  pressed && styles.createButtonPressed,
                  (!newTitle.trim() || !newDesc.trim()) && styles.createButtonDisabled,
                ]}
                disabled={!newTitle.trim() || !newDesc.trim()}
              >
                <Text style={styles.createButtonText}>Post Project</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    color: Colors.dark.text,
  },
  headerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: {
    backgroundColor: Colors.dark.greenDim,
  },
  projectsList: {
    gap: 14,
  },
  projectCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 10,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  projectTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 17,
    color: Colors.dark.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
  },
  projectDescription: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
  },
  projectFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarStack: {
    flexDirection: 'row',
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.greenGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.surface,
  },
  miniAvatarText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: Colors.dark.green,
  },
  teamCount: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.green,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  joinButtonPressed: {
    backgroundColor: Colors.dark.greenDim,
  },
  joinButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: Colors.dark.background,
  },
  fullBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  fullText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  creatorText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 18,
    color: Colors.dark.textSecondary,
  },
  emptySubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 20,
    color: Colors.dark.text,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: Colors.dark.green,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  createButtonPressed: {
    backgroundColor: Colors.dark.greenDim,
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    color: Colors.dark.background,
  },
});
