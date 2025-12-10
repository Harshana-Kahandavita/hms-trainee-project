import { type Request, type Response } from 'express';
import Keycloak from 'keycloak-connect';

/**
 * Method to Login User
 * @param req - Express request object
 * @param res - Express response object
 */
export const authLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email_id, user_password } = req.body;

    if (!email_id || !user_password) {
      res.status(400).json({
        message: "Email and password are required",
        status: false,
        access_token: null,
        refresh_token: null,
        user_id: null,
      });
      return;
    }

    // Get Keycloak configuration from environment variables with fallbacks
    // Note: Server URL is http://localhost:8080 (Keycloak 26+ doesn't use /auth prefix)
    const keycloakServerUrl = process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080';
    const keycloakRealm = process.env.KEYCLOAK_REALM || 'buffet-booking';
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || 'buffet-booking-admin';
    const keycloakClientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'u9pIAZlJfI14x9pZLJZSpKg5xHcTTRgJ';

    // Ensure the server URL doesn't have a trailing slash
    const authServerUrl = keycloakServerUrl.endsWith('/') 
      ? keycloakServerUrl.slice(0, -1) 
      : keycloakServerUrl;

    const keycloakConfig: any = {
      realm: keycloakRealm,
      'auth-server-url': authServerUrl,
      'ssl-required': 'external',
      resource: keycloakClientId,
      'bearer-only': false,
      'confidential-port': 0,
      credentials: {
        secret: keycloakClientSecret,
      },
    };

    console.log('Keycloak Config:', {
      'auth-server-url': keycloakConfig['auth-server-url'],
      realm: keycloakConfig.realm,
      resource: keycloakConfig.resource,
      'has-secret': !!keycloakConfig.credentials.secret,
    });

    const keycloak = new Keycloak({}, keycloakConfig);
    const username = email_id;
    const password = user_password;

    keycloak.grantManager
      .obtainDirectly(username, password)
      .then((grant: any) => {
        if (!grant || !grant.access_token) {
          res.status(401).json({
            message: "Authentication failed - Invalid grant",
            status: false,
            access_token: null,
            refresh_token: null,
            user_id: null,
          });
          return;
        }
        console.log('Grant:', grant);
        const accessToken = grant.access_token;
        const refreshToken = grant.refresh_token;
        
        res.json({
          message: "User Login Successful",
          status: true,
          access_token: accessToken.token || accessToken,
          refresh_token: refreshToken?.token || refreshToken || null,
          user_id: accessToken.content?.sub || accessToken.sub || null,
          role: accessToken.content?.realm_access?.roles || accessToken.realm_access?.roles || null,
        });
      })
      .catch((err) => {
        // Error occurred during authentication
        console.error("Authentication error:", err);
        
        // Provide more specific error messages
        let errorMessage = "Authentication failed";
        if (err instanceof Error) {
          if (err.message.includes('404')) {
            errorMessage = `Keycloak server not found. Please check if Keycloak is running at ${keycloakConfig['auth-server-url']} and the realm '${keycloakConfig.realm}' exists.`;
          } else if (err.message.includes('401') || err.message.includes('403')) {
            errorMessage = "Invalid credentials or insufficient permissions";
          } else {
            errorMessage = err.message;
          }
        }

        res.status(401).json({
          message: errorMessage,
          status: false,
          access_token: null,
          refresh_token: null,
          user_id: null,
          error: err instanceof Error ? err.message : String(err),
          keycloak_url: keycloakConfig['auth-server-url'],
          realm: keycloakConfig.realm,
        });
      });
  } catch (error) {
    console.error("Error Occurred in User Login:", error);
    res.status(500).json({
      message: "Internal Server error",
      status: false,
      access_token: null,
      refresh_token: null,
      user_id: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};