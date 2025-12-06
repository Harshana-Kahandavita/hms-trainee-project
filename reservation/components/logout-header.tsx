import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function LogoutHeader() {
  const { setAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const handleLogout = () => {
    setAuthenticated(false);
    router.replace('/auth/login');
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.logoutButton,
        { backgroundColor: colors.tint },
        pressed && styles.logoutButtonPressed,
      ]}
      onPress={handleLogout}
    >
      <Text style={styles.logoutText}>Logout</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    marginRight: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  logoutButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  logoutText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});












