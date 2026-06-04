import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Teacher, AttendanceSession, AttendanceRecord } from '../src/types.js';

// Define DB Connection Status
let isMongoDbActive = false;
let isMongoDbConnected = false;

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists for local fallback storage
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Local File Database Helper Functions
async function readLocalFile<T>(filename: string, defaultValue: T[] = []): Promise<T[]> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T[];
  } catch (error) {
    console.error(`Error reading local database file ${filename}:`, error);
    return defaultValue;
  }
}

async function writeLocalFile<T>(filename: string, data: T[]): Promise<void> {
  const filePath = path.join(DATA_DIR, filename);
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing local database file ${filename}:`, error);
  }
}

// --- MONGOOSE SCHEMAS & MODELS ---
const TeacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const AttendanceSessionSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  classCode: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  durationMinutes: { type: Number, required: true },
  secretToken: { type: String, required: true },
  isActive: { type: Boolean, default: true }
});

const AttendanceRecordSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  markedAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String },
  deviceFingerprint: { type: String, required: true }
});

// Avoid re-compiling model if it already exists
const MongoTeacher = (mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema)) as any;
const MongoSession = (mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', AttendanceSessionSchema)) as any;
const MongoRecord = (mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', AttendanceRecordSchema)) as any;

// --- UNIFIED DATABASE INITIALIZATION ---
export async function dbInit(): Promise<{ mode: 'mongodb' | 'local-json'; connected: boolean }> {
  const uri = process.env.MONGODB_URI;
  if (uri && uri.trim() !== '' && !uri.includes('MY_MONGODB_URI')) {
    try {
      console.log('Attempting to connect to MongoDB...');
      mongoose.set('strictQuery', false);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      isMongoDbActive = true;
      isMongoDbConnected = true;
      console.log('Successfully connected to MongoDB!');
      return { mode: 'mongodb', connected: true };
    } catch (err) {
      console.error('Failed to connect to MongoDB, falling back to local JSON files:', err);
      isMongoDbActive = false;
      isMongoDbConnected = false;
    }
  } else {
    console.log('No MONGODB_URI configured. Working in Local Disk SQL/JSON Storage mode.');
  }
  return { mode: 'local-json', connected: false };
}

export function dbGetStatus() {
  return {
    mode: isMongoDbActive ? 'mongodb' : 'local-json',
    connected: isMongoDbConnected,
  };
}

// --- TEACHER SERVICES ---
export const TeacherService = {
  async createTeacher(name: string, email: string, passwordHash: string) {
    if (isMongoDbActive) {
      const teacher = new MongoTeacher({ name, email, passwordHash });
      const saved = await teacher.save();
      return {
        id: saved._id.toString(),
        name: saved.name,
        email: saved.email,
        createdAt: saved.createdAt.toISOString()
      };
    } else {
      const teachers = await readLocalFile<any>('teachers.json');
      // Check duplicate
      const duplicated = teachers.find(t => t.email.toLowerCase() === email.toLowerCase());
      if (duplicated) {
        throw new Error('Email already registered');
      }

      const id = 't_' + Math.random().toString(36).substr(2, 9);
      const createdAt = new Date().toISOString();
      const newTeacher = { id, name, email, passwordHash, createdAt };
      teachers.push(newTeacher);
      await writeLocalFile('teachers.json', teachers);
      return { id, name, email, createdAt };
    }
  },

  async getTeacherByEmail(email: string) {
    if (isMongoDbActive) {
      const teacher = await MongoTeacher.findOne({ email });
      if (!teacher) return null;
      return {
        id: teacher._id.toString(),
        name: teacher.name,
        email: teacher.email,
        passwordHash: teacher.passwordHash,
        createdAt: teacher.createdAt.toISOString()
      };
    } else {
      const teachers = await readLocalFile<any>('teachers.json');
      const teacher = teachers.find(t => t.email.toLowerCase() === email.toLowerCase());
      return teacher || null;
    }
  },

  async getTeacherById(id: string) {
    if (isMongoDbActive) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const teacher = await MongoTeacher.findById(id);
      if (!teacher) return null;
      return {
        id: teacher._id.toString(),
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.createdAt.toISOString()
      };
    } else {
      const teachers = await readLocalFile<any>('teachers.json');
      const teacher = teachers.find(t => t.id === id);
      if (!teacher) return null;
      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.createdAt
      };
    }
  }
};

// --- SESSION SERVICES ---
export const SessionService = {
  async createSession(subject: string, classCode: string, teacherId: string, durationMinutes: number = 10) {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    const secretToken = 'sec_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // Ensure we expire old active sessions first
    await this.expireAllActiveSessions(teacherId);

    if (isMongoDbActive) {
      const session = new MongoSession({
        subject,
        classCode,
        createdBy: new mongoose.Types.ObjectId(teacherId),
        expiresAt,
        durationMinutes,
        secretToken,
        isActive: true
      });
      const saved = await session.save();
      return {
        id: saved._id.toString(),
        subject: saved.subject,
        classCode: saved.classCode,
        createdBy: saved.createdBy.toString(),
        createdAt: saved.createdAt.toISOString(),
        expiresAt: saved.expiresAt.toISOString(),
        durationMinutes: saved.durationMinutes,
        secretToken: saved.secretToken,
        isActive: saved.isActive
      };
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const id = 's_' + Math.random().toString(36).substr(2, 9);
      const createdAt = new Date().toISOString();
      const newSession: AttendanceSession = {
        id,
        subject,
        classCode,
        createdBy: teacherId,
        createdAt,
        expiresAt: expiresAt.toISOString(),
        durationMinutes,
        secretToken,
        isActive: true
      };
      sessions.push(newSession);
      await writeLocalFile('sessions.json', sessions);
      return newSession;
    }
  },

  async expireAllActiveSessions(teacherId: string) {
    if (isMongoDbActive) {
      await MongoSession.updateMany(
        { createdBy: new mongoose.Types.ObjectId(teacherId), isActive: true },
        { isActive: false }
      );
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const updated = sessions.map(s => {
        if (s.createdBy === teacherId && s.isActive) {
          s.isActive = false;
        }
        return s;
      });
      await writeLocalFile('sessions.json', updated);
    }
  },

  async getSession(id: string): Promise<AttendanceSession | null> {
    if (isMongoDbActive) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      const session = await MongoSession.findById(id);
      if (!session) return null;

      // Auto-expire check
      const now = new Date();
      const expired = new Date(session.expiresAt) <= now;
      if (expired && session.isActive) {
        session.isActive = false;
        await session.save();
      }

      return {
        id: session._id.toString(),
        subject: session.subject,
        classCode: session.classCode,
        createdBy: session.createdBy.toString(),
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        durationMinutes: session.durationMinutes,
        secretToken: session.secretToken,
        isActive: session.isActive
      };
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const session = sessions.find(s => s.id === id);
      if (!session) return null;

      const now = new Date();
      const expired = new Date(session.expiresAt) <= now;
      if (expired && session.isActive) {
        session.isActive = false;
        await writeLocalFile('sessions.json', sessions);
      }

      return session;
    }
  },

  async getTeacherSessions(teacherId: string): Promise<AttendanceSession[]> {
    if (isMongoDbActive) {
      const sessions = await MongoSession.find({ createdBy: new mongoose.Types.ObjectId(teacherId) }).sort({ createdAt: -1 });
      const now = new Date();
      
      const results: AttendanceSession[] = [];
      for (const s of sessions) {
        const expired = new Date(s.expiresAt) <= now;
        if (expired && s.isActive) {
          s.isActive = false;
          await s.save();
        }
        results.push({
          id: s._id.toString(),
          subject: s.subject,
          classCode: s.classCode,
          createdBy: s.createdBy.toString(),
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          durationMinutes: s.durationMinutes,
          secretToken: s.secretToken,
          isActive: s.isActive
        });
      }
      return results;
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const list = sessions.filter(s => s.createdBy === teacherId).reverse();
      const now = new Date();
      
      const results = list.map(s => {
        const expired = new Date(s.expiresAt) <= now;
        if (expired && s.isActive) {
          s.isActive = false;
        }
        return s;
      });
      
      if (results.some((s, idx) => s.isActive !== list[idx].isActive)) {
        await writeLocalFile('sessions.json', sessions);
      }
      return results;
    }
  },

  async getActiveSession(teacherId: string): Promise<AttendanceSession | null> {
    if (isMongoDbActive) {
      const session = await MongoSession.findOne({
        createdBy: new mongoose.Types.ObjectId(teacherId),
        isActive: true
      });
      if (!session) return null;

      const now = new Date();
      const expired = new Date(session.expiresAt) <= now;
      if (expired) {
        session.isActive = false;
        await session.save();
        return null;
      }

      return {
        id: session._id.toString(),
        subject: session.subject,
        classCode: session.classCode,
        createdBy: session.createdBy.toString(),
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        durationMinutes: session.durationMinutes,
        secretToken: session.secretToken,
        isActive: session.isActive
      };
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const session = sessions.find(s => s.createdBy === teacherId && s.isActive);
      if (!session) return null;

      const now = new Date();
      const expired = new Date(session.expiresAt) <= now;
      if (expired) {
        session.isActive = false;
        await writeLocalFile('sessions.json', sessions);
        return null;
      }

      return session;
    }
  },

  async expireSession(id: string): Promise<void> {
    if (isMongoDbActive) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await MongoSession.findByIdAndUpdate(id, { isActive: false });
      }
    } else {
      const sessions = await readLocalFile<AttendanceSession>('sessions.json');
      const updated = sessions.map(s => {
        if (s.id === id) {
          s.isActive = false;
        }
        return s;
      });
      await writeLocalFile('sessions.json', updated);
    }
  }
};

// --- ATTENDANCE RECORDS SERVICES ---
export const AttendanceService = {
  async markAttendance(
    sessionId: string,
    studentId: string,
    studentName: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    deviceFingerprint: string
  ): Promise<AttendanceRecord> {
    // 1. Verify session exists and is active
    const session = await SessionService.getSession(sessionId);
    if (!session) {
      throw new Error('Attendance session not found');
    }
    if (!session.isActive) {
      throw new Error('This attendance session has expired or been closed by the instructor');
    }

    // Double check temporal validity
    const now = new Date();
    if (new Date(session.expiresAt) <= now) {
      await SessionService.expireSession(sessionId);
      throw new Error('This attendance session has expired (exceeded 10-minute limit)');
    }

    // 2. Prevent Duplicate ID
    const alreadyMarkedId = await this.hasStudentMarked(sessionId, studentId);
    if (alreadyMarkedId) {
      throw new Error(`Attendance already captured for roll/registration: ${studentId}`);
    }

    // 3. Prevent Duplicate Device fingerprint
    const alreadyMarkedDev = await this.hasFingerprintMarked(sessionId, deviceFingerprint);
    if (alreadyMarkedDev) {
      throw new Error('Your device has already registered attendance for this session.');
    }

    // 4. Save record
    if (isMongoDbActive) {
      const record = new MongoRecord({
        sessionId: new mongoose.Types.ObjectId(sessionId),
        studentId,
        studentName,
        ipAddress,
        userAgent,
        deviceFingerprint
      });
      const saved = await record.save();
      return {
        id: saved._id.toString(),
        sessionId: saved.sessionId.toString(),
        studentId: saved.studentId,
        studentName: saved.studentName,
        markedAt: saved.markedAt.toISOString(),
        ipAddress: saved.ipAddress,
        userAgent: saved.userAgent,
        deviceFingerprint: saved.deviceFingerprint
      };
    } else {
      const records = await readLocalFile<AttendanceRecord>('records.json');
      const id = 'r_' + Math.random().toString(36).substr(2, 9);
      const newRecord: AttendanceRecord = {
        id,
        sessionId,
        studentId,
        studentName,
        markedAt: new Date().toISOString(),
        ipAddress,
        userAgent,
        deviceFingerprint
      };
      records.push(newRecord);
      await writeLocalFile('records.json', records);
      return newRecord;
    }
  },

  async getAttendanceForSession(sessionId: string): Promise<AttendanceRecord[]> {
    if (isMongoDbActive) {
      if (!mongoose.Types.ObjectId.isValid(sessionId)) return [];
      const records = await MongoRecord.find({ sessionId: new mongoose.Types.ObjectId(sessionId) }).sort({ markedAt: -1 });
      return records.map(r => ({
        id: r._id.toString(),
        sessionId: r.sessionId.toString(),
        studentId: r.studentId,
        studentName: r.studentName,
        markedAt: r.markedAt.toISOString(),
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        deviceFingerprint: r.deviceFingerprint
      }));
    } else {
      const records = await readLocalFile<AttendanceRecord>('records.json');
      return records.filter(r => r.sessionId === sessionId).reverse();
    }
  },

  async hasStudentMarked(sessionId: string, studentId: string): Promise<boolean> {
    if (isMongoDbActive) {
      if (!mongoose.Types.ObjectId.isValid(sessionId)) return false;
      const count = await MongoRecord.countDocuments({
        sessionId: new mongoose.Types.ObjectId(sessionId),
        studentId: studentId.trim()
      });
      return count > 0;
    } else {
      const records = await readLocalFile<AttendanceRecord>('records.json');
      return records.some(r => r.sessionId === sessionId && r.studentId.trim().toLowerCase() === studentId.trim().toLowerCase());
    }
  },

  async hasFingerprintMarked(sessionId: string, deviceFingerprint: string): Promise<boolean> {
    if (!deviceFingerprint) return false;
    if (isMongoDbActive) {
      if (!mongoose.Types.ObjectId.isValid(sessionId)) return false;
      const count = await MongoRecord.countDocuments({
        sessionId: new mongoose.Types.ObjectId(sessionId),
        deviceFingerprint
      });
      return count > 0;
    } else {
      const records = await readLocalFile<AttendanceRecord>('records.json');
      return records.some(r => r.sessionId === sessionId && r.deviceFingerprint === deviceFingerprint);
    }
  }
};
