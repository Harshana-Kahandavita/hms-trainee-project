import { Request } from 'express';

/**
 * User context interface
 */
export interface UserContext {
  id?: string;
  email?: string;
  roles?: string[];
  [key: string]: any;
}

/**
 * Get user context from request
 * This is populated by the authMiddleware after token validation
 */
export function getUserContext(req: Request): UserContext | null {
  return req.user || null;
}

/**
 * Check if user has a specific role
 */
export function hasRole(req: Request, role: string): boolean {
  const user = getUserContext(req);
  if (!user || !user.roles) {
    return false;
  }
  return Array.isArray(user.roles) && user.roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(req: Request, roles: string[]): boolean {
  const user = getUserContext(req);
  if (!user || !user.roles) {
    return false;
  }
  return roles.some(role => hasRole(req, role));
}

/**
 * Check if user is an admin
 */
export function isAdmin(req: Request): boolean {
  return hasRole(req, 'admin');
}

/**
 * Get user ID from context
 */
export function getUserId(req: Request): string | null {
  const user = getUserContext(req);
  return user?.id || null;
}

/**
 * Get user email from context
 */
export function getUserEmail(req: Request): string | null {
  const user = getUserContext(req);
  return user?.email || null;
}

/**
 * Get user roles from context
 */
export function getUserRoles(req: Request): string[] {
  const user = getUserContext(req);
  return user?.roles || [];
}

