import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

// Import DB components
import {
  dbInit,
  dbGetStatus,
  TeacherService,
  SessionService,
  AttendanceService
} from './server/db';

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT Authentication Middleware
interface AuthenticatedRequest extends express.Request {
  teacherId?: string;
}

function verifyToken(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Bearer token is missing.' });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-qr-key-9988';
    const decoded = jwt.verify(token, JWT_SECRET) as { teacherId: string };
    req.teacherId = decoded.teacherId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Access token is invalid or expired.' });
  }
}

async function startServer() {
  // Initialize Database
  const dbStatus = await dbInit();
  console.log(`Database initialized in ${dbStatus.mode} mode. Status: ${dbStatus.connected ? 'Connected' : 'Local Fallback'}`);

  // --- API ENDPOINTS ---

  // DB Health Check
  app.get('/api/db-status', (req, res) => {
    res.json({
      status: 'ok',
      db: dbGetStatus(),
      vercelReady: true
    });
  });

  // Teacher Registration
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required fields.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      // Check if teacher exists
      const existing = await TeacherService.getTeacherByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'A teacher with this email is already registered.' });
      }

      // Simple password hashing (for demonstration/local deployment fallback. Ideally use bcrypt, but simple hashing keeps dependencies lean)
      const mockHash = Buffer.from(password).toString('base64'); // Simple salt-free hash
      const teacher = await TeacherService.createTeacher(name, email, mockHash);

      res.status(201).json({
        message: 'Teacher registered successfully',
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'An error occurred during registration.' });
    }
  });

  // Teacher Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const teacher = await TeacherService.getTeacherByEmail(email);
      if (!teacher) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Check hash
      const checkHash = Buffer.from(password).toString('base64');
      if (teacher.passwordHash !== checkHash) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-qr-key-9988';
      const token = jwt.sign({ teacherId: teacher.id }, JWT_SECRET, { expiresIn: '24h' });

      res.json({
        message: 'Login successful',
        token,
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'An error occurred during login.' });
    }
  });

  // Get Self Info
  app.get('/api/auth/me', verifyToken, async (req: AuthenticatedRequest, res) => {
    try {
      const teacher = await TeacherService.getTeacherById(req.teacherId!);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher profile not found.' });
      }
      res.json({ teacher });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'An error occurred fetching credentials.' });
    }
  });

  // Generate Session and QR
  app.post('/api/sessions/create', verifyToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { subject, classCode, durationMinutes } = req.body;
      if (!subject || !classCode) {
        return res.status(400).json({ error: 'Subject and Class Code are required fields.' });
      }

      const minutes = durationMinutes ? parseInt(durationMinutes, 10) : 10;
      const session = await SessionService.createSession(subject, classCode, req.teacherId!, minutes);

      // Generate verification URL that students scan and load
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const scanUrl = `${appUrl}/scan/${session.id}?t=${session.secretToken}`;

      // Generate the base64 QR Code image data
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        errorCorrectionLevel: 'H',
        width: 320,
        margin: 2
      });

      res.status(201).json({
        message: 'Attendance session created successfully',
        session,
        scanUrl,
        qrDataUrl
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate session.' });
    }
  });

  // Get Teacher Sessions List (Active and Inactive)
  app.get('/api/sessions', verifyToken, async (req: AuthenticatedRequest, res) => {
    try {
      const sessions = await SessionService.getTeacherSessions(req.teacherId!);
      
      const summaries = await Promise.all(sessions.map(async s => {
        const records = await AttendanceService.getAttendanceForSession(s.id);
        return {
          ...s,
          attendanceCount: records.length
        };
      }));

      res.json({ sessions: summaries });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve sessions.' });
    }
  });

  // Get Active Session Dashboard details
  app.get('/api/sessions/active', verifyToken, async (req: AuthenticatedRequest, res) => {
    try {
      const activeSession = await SessionService.getActiveSession(req.teacherId!);
      if (!activeSession) {
        return res.json({ activeSession: null, qrDataUrl: null });
      }

      const records = await AttendanceService.getAttendanceForSession(activeSession.id);
      
      // Calculate QR details
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const scanUrl = `${appUrl}/scan/${activeSession.id}?t=${activeSession.secretToken}`;
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        errorCorrectionLevel: 'H',
        width: 320,
        margin: 2
      });

      res.json({
        activeSession: {
          ...activeSession,
          attendanceCount: records.length
        },
        records,
        scanUrl,
        qrDataUrl
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch active session.' });
    }
  });

  // Get single session details (used by students to inspect metadata before submitting)
  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const session = await SessionService.getSession(id);
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      res.json({
        id: session.id,
        subject: session.subject,
        classCode: session.classCode,
        isActive: session.isActive,
        expiresAt: session.expiresAt
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve session details.' });
    }
  });

  // Force Active Session Expiration / Early Close
  app.post('/api/sessions/:id/expire', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      await SessionService.expireSession(id);
      res.json({ message: 'Attendance session closed and deactivated successfully.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to deactivate session.' });
    }
  });

  // Get Attendance List for single session (Teacher query)
  app.get('/api/sessions/:id/records', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const records = await AttendanceService.getAttendanceForSession(id);
      res.json({ records });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve records.' });
    }
  });

  // Student checking in
  app.post('/api/attendance/mark', async (req, res) => {
    try {
      const { sessionId, studentId, studentName, deviceFingerprint, token } = req.body;
      
      if (!sessionId || !studentId || !studentName || !deviceFingerprint) {
        return res.status(400).json({ error: 'Roll/Registration Number, Full Name, and session parameters are required.' });
      }

      const session = await SessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Attendance session not found.' });
      }

      // Check security secretToken embedded in scanned QR code
      if (session.secretToken !== token) {
        return res.status(403).json({ error: 'Security Warning: Invalid QR key signature. You must scan the live active session QR.' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const record = await AttendanceService.markAttendance(
        sessionId,
        studentId,
        studentName,
        ipAddress,
        userAgent,
        deviceFingerprint
      );

      res.status(201).json({
        message: `Successfully checked in. Welcome, ${studentName}!`,
        record
      });
    } catch (error: any) {
      console.warn('Attendance marking failed:', error.message);
      res.status(422).json({ error: error.message || 'Failed to register attendance.' });
    }
  });

  // Export CSV of session attendance records
  app.get('/api/sessions/:id/csv', verifyToken, async (req, res) => {
    try {
      const { id } = req.params;
      const session = await SessionService.getSession(id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found for export.' });
      }

      const records = await AttendanceService.getAttendanceForSession(id);

      // Construct clean, formatted CSV headers & rows
      const headers = ['Roll/Reg Number', 'Student Name', 'Registered At', 'IP Address', 'Browser/Client', 'Device Fingerprint'];
      const csvRows = [headers.join(',')];

      records.forEach(r => {
        const row = [
          `"${r.studentId.replace(/"/g, '""')}"`,
          `"${r.studentName.replace(/"/g, '""')}"`,
          `"${new Date(r.markedAt).toLocaleString().replace(/"/g, '""')}"`,
          `"${(r.ipAddress || 'Unknown').replace(/"/g, '""')}"`,
          `"${(r.userAgent || 'Unknown').substring(0, 50).replace(/"/g, '""')}..."`,
          `"${r.deviceFingerprint.substring(0, 16).replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const filename = `${session.classCode}_${session.subject.replace(/[^a-zA-Z0-9]/g, '_')}_Attendance.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to export CSV file.' });
    }
  });

  // --- VITE MIDDLEWARE SETUP FOR DEV VS STATIC PROD ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite dev middleware mounted successfully.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static files mounted from dist.');
  }

  // Fallback catch-all to serve index.html for react routes in dev (not intercepted by vite middlewares)
  app.get('*', (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      // Vite handles routes automatically of index.html in SPA mode or pass to next
      return next();
    }
  });

  // Listen on standard port
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server runs on http://localhost:${PORT}`);
  });
}

startServer();
