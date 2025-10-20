import type { Request } from 'express';

export interface AuditLogEntry {
  timestamp: Date;
  eventType: 'ACCESS_DENIED' | 'UNAUTHORIZED_ACCESS_ATTEMPT' | 'CROSS_TENANT_ACCESS_ATTEMPT';
  userId?: string;
  username?: string;
  userFacilityId?: string;
  userFacilityName?: string;
  requestedPath: string;
  requestedFacilityId?: string;
  requestedFacilityName?: string;
  requestedCompanyId?: string;
  requestedCompanyName?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  reason: string;
}

/**
 * Audit logger for security events
 */
export class AuditLogger {
  /**
   * Log a 403 access denied event
   */
  static logAccessDenied(req: Request, reason: string, details?: Partial<AuditLogEntry>): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'ACCESS_DENIED',
      userId: (req as any).user?.id,
      username: (req as any).user?.username,
      userFacilityId: (req as any).user?.facilityId,
      userFacilityName: (req as any).user?.facility?.name,
      requestedPath: req.path,
      requestedFacilityId: (req as any).facility?.id,
      requestedFacilityName: (req as any).facility?.name,
      requestedCompanyId: (req as any).company?.id,
      requestedCompanyName: (req as any).company?.name,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      sessionId: req.sessionID,
      reason,
      ...details,
    };

    // Log to console with structured format
    console.warn('[AUDIT] ACCESS DENIED', JSON.stringify(logEntry, null, 2));

    // TODO: In production, send to a dedicated audit log storage (e.g., database, log aggregation service)
    // await db.insert(auditLogs).values(logEntry);
  }

  /**
   * Log an unauthorized access attempt (no valid session)
   */
  static logUnauthorizedAttempt(req: Request, reason: string): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      requestedPath: req.path,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      sessionId: req.sessionID,
      reason,
    };

    console.warn('[AUDIT] UNAUTHORIZED ACCESS', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Log a cross-tenant access attempt
   */
  static logCrossTenantAttempt(
    req: Request,
    userFacility: { id: string; name: string },
    requestedFacility: { id: string; name: string },
    reason: string
  ): void {
    const logEntry: AuditLogEntry = {
      timestamp: new Date(),
      eventType: 'CROSS_TENANT_ACCESS_ATTEMPT',
      userId: (req as any).user?.id,
      username: (req as any).user?.username,
      userFacilityId: userFacility.id,
      userFacilityName: userFacility.name,
      requestedPath: req.path,
      requestedFacilityId: requestedFacility.id,
      requestedFacilityName: requestedFacility.name,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      sessionId: req.sessionID,
      reason,
    };

    console.error('[AUDIT] CROSS-TENANT ACCESS ATTEMPT', JSON.stringify(logEntry, null, 2));
  }
}
