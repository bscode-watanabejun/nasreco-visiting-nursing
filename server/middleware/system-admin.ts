import type { Request, Response, NextFunction } from "express";

/**
 * Extended Request interface to include authenticated user
 */
export interface SystemAdminRequest extends Request {
  user?: any;
}

/**
 * Middleware to require system administrator privileges
 *
 * System administrators have the highest level of access and can:
 * - Manage all companies across the system
 * - Create new companies with headquarters and initial admin users
 * - View and modify system-wide settings
 *
 * This middleware ensures only users with role 'system_admin' can access protected routes.
 */
export const requireSystemAdmin = (
  req: SystemAdminRequest,
  res: Response,
  next: NextFunction
) => {
  // Check if user is authenticated
  if (!req.user) {
    console.warn('[SystemAdmin] Access denied: User not authenticated');
    return res.status(401).json({ error: "認証が必要です" });
  }

  // Check if user has system_admin role
  if (req.user.role !== 'system_admin') {
    console.warn(
      `[SystemAdmin] Access denied: User ${req.user.username} (role: ${req.user.role}) attempted to access system admin route`
    );
    return res.status(403).json({
      error: "システム管理者権限が必要です",
      details: "この機能にアクセスするにはシステム管理者権限が必要です"
    });
  }

  console.log(`[SystemAdmin] Access granted: ${req.user.username} (${req.user.email})`);
  next();
};
