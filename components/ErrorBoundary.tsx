import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reloadAppAsync } from 'expo';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

function ErrorFallback({ errorMessage }: { errorMessage: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.card}>
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>The app ran into an issue. Tap below to restart.</Text>
        {__DEV__ && (
          <View style={styles.devErrorBox}>
            <Text style={styles.devErrorText}>{errorMessage}</Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          onPress={() => reloadAppAsync()}
        >
          <Text style={styles.buttonText}>Restart App</Text>
        </Pressable>
      </View>
    </View>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback errorMessage={this.state.errorMessage} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#161616',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  devErrorBox: {
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  devErrorText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: '#FF5252',
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#00E676',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  buttonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: '#0A0A0A',
  },
});
