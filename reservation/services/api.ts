import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Get the API URL based on the environment
 * - Uses expo config if available, but converts localhost to 10.0.2.2 for Android
 * - For Android emulator: uses 10.0.2.2 (special IP that maps to host machine's localhost)
 * - For iOS simulator: uses localhost
 * - For physical devices: should use your machine's local IP address
 */
const getApiUrl = (): string => {
  // First, check if API URL is configured in expo config
  const configUrl = Constants.expoConfig?.extra?.apiUrl;
  
  if (configUrl) {
    // If on Android and URL contains localhost, replace with 10.0.2.2
    if (Platform.OS === 'android' && configUrl.includes('localhost')) {
      return configUrl.replace('localhost', '10.0.2.2');
    }
    return configUrl;
  }

  // Default based on platform
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to access host machine's localhost
    return 'http://10.0.2.2:3000';
  } else if (Platform.OS === 'ios') {
    // iOS simulator can use localhost
    return 'http://localhost:3000';
  } else {
    // Web or other platforms
    return 'http://localhost:3000';
  }
};

const API_URL = getApiUrl();

// Log the API URL being used (helpful for debugging)
console.log(`🌐 [API] Using API URL: ${API_URL} (Platform: ${Platform.OS})`);

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging and auth tokens
apiClient.interceptors.request.use(
  async (config) => {
    const fullUrl = `${config.baseURL}${config.url}`;
    const method = config.method?.toUpperCase() || 'GET';
    
    // Inject auth token if available (skip for login endpoint)
    if (config.url !== '/auth') {
      const { getToken } = await import('./auth');
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    console.log('🚀 [API] Request:', method, fullUrl);
    console.log('   - Endpoint:', config.url);
    if (config.params && Object.keys(config.params).length > 0) {
      console.log('   - Params:', config.params);
    }
    if (config.data) {
      console.log('   - Data:', config.data);
    }

    return config;
  },
  (error) => {
    console.error('❌ [API] Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    const fullUrl = `${response.config.baseURL}${response.config.url}`;
    const method = response.config.method?.toUpperCase() || 'GET';
    
    console.log('✅ [API] Response Success:', method, fullUrl);
    console.log('   - Status:', response.status, response.statusText);
    if (response.data) {
      console.log('   - Data:', JSON.stringify(response.data, null, 2));
    }

    return response;
  },
  async (error) => {
    // Skip logging canceled requests (normal behavior when React Query cancels stale requests)
    if (error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }
    
    const fullUrl = error.config ? `${error.config.baseURL}${error.config.url}` : 'Unknown URL';
    const method = error.config?.method?.toUpperCase() || 'Unknown Method';
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const errorCode = error.code;
    const errorMessage = error.message;
    
    console.error('❌ [API] Response Error:', method, fullUrl);
    console.error('   - Status:', status, statusText);
    console.error('   - Error Code:', errorCode);
    console.error('   - Error Message:', errorMessage);
    
    if (error.response?.data) {
      console.error('   - Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (errorCode === 'NETWORK_ERROR' || errorCode === 'ECONNREFUSED' || errorCode === 'ERR_NETWORK') {
      console.error('   - Network Error: Cannot connect to server');
      console.error(`   - API URL: ${API_URL}`);
      console.error('   - Make sure the server is running');
      if (Platform.OS === 'android') {
        console.error('   - Android emulator: Using 10.0.2.2 to access host machine');
      } else if (Platform.OS === 'ios') {
        console.error('   - iOS simulator: Using localhost');
      } else {
        console.error('   - For physical devices, use your machine\'s IP address in app.json extra.apiUrl');
      }
    }

    // Handle 401 Unauthorized
    if (status === 401) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔒 [API] 401 Unauthorized - Token expired or invalid');
      console.log('   - User may need to re-authenticate');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      // Clear tokens on 401 (token expired or invalid)
      // Skip for login endpoint to avoid clearing tokens during login
      if (error.config?.url !== '/auth') {
        const { logout } = await import('./auth');
        await logout().catch(() => {
          // Ignore errors during logout
        });
      }
    }

    return Promise.reject(error);
  }
);

// Export customInstance for potential code generation tools
export const customInstance = apiClient;

