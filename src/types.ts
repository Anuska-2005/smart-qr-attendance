export interface Teacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AttendanceSession {
  id: string; // matches MongoDB _id or local string ID
  subject: string;
  classCode: string;
  createdBy: string; // Teacher ID
  createdAt: string;
  expiresAt: string;
  durationMinutes: number;
  secretToken: string; // Unique session QR seed
  isActive: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string; // e.g., Roll number / registration number
  studentName: string;
  markedAt: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint: string;
}

export interface SessionStats {
  totalCount: number;
  records: AttendanceRecord[];
}

export interface DashboardSummary {
  activeSession: AttendanceSession | null;
  previousSessions: (AttendanceSession & { attendanceCount: number })[];
}
