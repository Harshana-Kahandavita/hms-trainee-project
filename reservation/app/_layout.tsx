import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  initialRouteName: 'auth/login',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <>
      <ThemeProvider value={theme}>
        <Stack>
          <Stack.Screen name="auth/login" options={{ title: 'Login', headerShown: false }} />
          <Stack.Screen name="auth/signup" options={{ title: 'Sign Up', headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ title: 'Home', headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </>
  );
}
