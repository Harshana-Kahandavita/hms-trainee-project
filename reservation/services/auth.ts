import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

// Storage keys
const TOKEN_KEY = '@auth_token';
const REFRESH_TOKEN_KEY = '@auth_refresh_token';
const USER_ID_KEY = '@auth_user_id';
const USER_ROLES_KEY = '@auth_user_roles';

// Types
export interface LoginCredentials {
  email_id: string;
  user_password: string;
}

export interface LoginResponse {
  message: string;
  status: boolean;
  access_token: string | null;
  refresh_token: string | null;
  user_id: string | null;
  role: string[] | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  userId?: string;
  roles?: string[];
}

/**
 * Login user and save token to local storage
 */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  try {
    const response = await apiClient.post<LoginResponse>('/auth', credentials);
    
    if (response.data.status && response.data.access_token) {
      // Save tokens to local storage
      await saveTokens({
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || undefined,
        userId: response.data.user_id || undefined,
        roles: response.data.role || undefined,
      });
    }
    
    return response.data;
  } catch (error: any) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Save authentication tokens to local storage
 */
export async function saveTokens(tokens: AuthTokens): Promise<void> {
  try {
    const items: [string, string][] = [
      [TOKEN_KEY, tokens.accessToken],
    ];
    
    if (tokens.refreshToken) {
      items.push([REFRESH_TOKEN_KEY, tokens.refreshToken]);
    }
    
    if (tokens.userId) {
      items.push([USER_ID_KEY, tokens.userId]);
    }
    
    if (tokens.roles) {
      items.push([USER_ROLES_KEY, JSON.stringify(tokens.roles)]);
    }
    
    await AsyncStorage.multiSet(items);
    console.log('✅ [Auth] Tokens saved to local storage');
  } catch (error) {
    console.error('❌ [Auth] Error saving tokens:', error);
    throw error;
  }
}

/**
 * Get access token from local storage
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('❌ [Auth] Error getting token:', error);
    return null;
  }
}

/**
 * Get refresh token from local storage
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    return refreshToken;
  } catch (error) {
    console.error('❌ [Auth] Error getting refresh token:', error);
    return null;
  }
}

/**
 * Get user ID from local storage
 */
export async function getUserId(): Promise<string | null> {
  try {
    const userId = await AsyncStorage.getItem(USER_ID_KEY);
    return userId;
  } catch (error) {
    console.error('❌ [Auth] Error getting user ID:', error);
    return null;
  }
}

/**
 * Get user roles from local storage
 */
export async function getUserRoles(): Promise<string[]> {
  try {
    const rolesJson = await AsyncStorage.getItem(USER_ROLES_KEY);
    if (rolesJson) {
      return JSON.parse(rolesJson);
    }
    return [];
  } catch (error) {
    console.error('❌ [Auth] Error getting user roles:', error);
    return [];
  }
}

/**
 * Get all authentication data from local storage
 */
export async function getAuthData(): Promise<AuthTokens | null> {
  try {
    const [accessToken, refreshToken, userId, rolesJson] = await AsyncStorage.multiGet([
      TOKEN_KEY,
      REFRESH_TOKEN_KEY,
      USER_ID_KEY,
      USER_ROLES_KEY,
    ]);

    if (!accessToken[1]) {
      return null;
    }

    return {
      accessToken: accessToken[1],
      refreshToken: refreshToken[1] || undefined,
      userId: userId[1] || undefined,
      roles: rolesJson[1] ? JSON.parse(rolesJson[1]) : undefined,
    };
  } catch (error) {
    console.error('❌ [Auth] Error getting auth data:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (has valid token)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await getToken();
    return token !== null && token.length > 0;
  } catch (error) {
    console.error('❌ [Auth] Error checking authentication:', error);
    return false;
  }
}

/**
 * Clear all authentication data from local storage (logout)
 */
export async function logout(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      TOKEN_KEY,
      REFRESH_TOKEN_KEY,
      USER_ID_KEY,
      USER_ROLES_KEY,
    ]);
    console.log('✅ [Auth] Tokens cleared from local storage');
  } catch (error) {
    console.error('❌ [Auth] Error clearing tokens:', error);
    throw error;
  }
}

/**
 * Restore authentication state from local storage
 * This should be called on app startup to restore user session
 */
export async function restoreAuth(): Promise<AuthTokens | null> {
  try {
    const authData = await getAuthData();
    
    if (authData && authData.accessToken) {
      console.log('✅ [Auth] Authentication restored from local storage');
      return authData;
    }
    
    console.log('ℹ️ [Auth] No authentication data found in local storage');
    return null;
  } catch (error) {
    console.error('❌ [Auth] Error restoring authentication:', error);
    return null;
  }
}

