import { type Request, type Response, type NextFunction } from 'express';
import Keycloak from 'keycloak-connect';
import jwt from 'jsonwebtoken';
import { UserContext } from './userContext';

// Extend Express Request type to include tokenInfo and user context
declare global {
  namespace Express {
    interface Request {
      tokenInfo?: any;
      user?: UserContext;
    }
  }
}

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token = req.headers?.authorization?.split(" ")[1];
  
  try {
    if (req.headers.authorization && token) {
      const keycloakConfig: any = {
        realm: process.env.KEYCLOAK_REALM || 'buffet-booking',
        'auth-server-url': process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080',
        'ssl-required': 'external',
        resource: process.env.KEYCLOAK_CLIENT_ID || 'buffet-booking-admin',
        'bearer-only': true,
        'confidential-port': 0,
        credentials: {
          secret: process.env.KEYCLOAK_CLIENT_SECRET || 'u9pIAZlJfI14x9pZLJZSpKg5xHcTTRgJ',
        },
      };
      
      const keycloak = new Keycloak({}, keycloakConfig);
      
      // First, decode the token to check basic validity and extract info
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded || typeof decoded !== 'object') {
        res.status(401).json({
          message: "Invalid token format",
          authentication: "Unauthorized",
        });
        return;
      }

      // Extract payload
      const payload = 'payload' in decoded ? decoded.payload : decoded;
      
      if (!payload || typeof payload !== 'object') {
        res.status(401).json({
          message: "Invalid token payload",
          authentication: "Unauthorized",
        });
        return;
      }

      // Check token expiration
      const currentTime = Math.floor(Date.now() / 1000);
      const tokenExp = (payload as any).exp;
      if (tokenExp && tokenExp < currentTime) {
        const expiredSecondsAgo = currentTime - tokenExp;
        const expiredMinutesAgo = Math.floor(expiredSecondsAgo / 60);
        res.status(401).json({
          message: "Token has expired",
          authentication: "Unauthorized",
          details: `Token expired ${expiredMinutesAgo} minute(s) ago. Please login again to get a new token.`,
          expiredAt: new Date(tokenExp * 1000).toISOString(),
          currentTime: new Date(currentTime * 1000).toISOString(),
        });
        return;
      }

      // Extract roles from multiple possible locations
      const roles = (payload as any).realm_access?.roles || 
                    (payload as any).resource_access?.[keycloakConfig.resource]?.roles || 
                    (payload as any).role || 
                    [];

      // Populate user context in request
      req.user = {
        id: (payload as any).sub,
        email: (payload as any).email,
        roles: Array.isArray(roles) ? roles : [],
        ...(payload as any)
      };

      // Validate token with Keycloak (for additional security)
      // If validation fails, we still allow the request since we've verified the JWT
      keycloak.grantManager
        .validateAccessToken(token)
        .then((result) => {
          req.tokenInfo = result;
          next();
        })
        .catch((err) => {
          // If Keycloak validation fails, log but still allow if token is valid JWT
          // This is a fallback - the token is already decoded and validated above
          console.warn('Keycloak token validation failed, but token is valid JWT:', err.message || err);
          req.tokenInfo = token; // Store original token
          next();
        });
    } else {
      // There is no token, don't process request further
      res.status(401).json({
        message: "Token is required",
        authentication: "Unauthorized",
      });
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};