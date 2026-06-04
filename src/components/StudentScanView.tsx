import React, { useState, useEffect } from 'react';
import { getDeviceFingerprint } from '../utils/fingerprint';
import { CheckCircle2, AlertTriangle, Clock, GraduationCap, ArrowRight, Laptop, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StudentScanViewProps {
  sessionId: string;
  token: string | null;
}

export default function StudentScanView({ sessionId, token }: StudentScanViewProps) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successRecord, setSuccessRecord] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Fetch session details on mount
  useEffect(() => {
    async function loadSession() {
      try {
        setLoading(true);
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to locate attendance session.');
        }
        const data = await res.json();
        setSession(data);
      } catch (err: any) {
        setError(err.message || 'Unable to load QR session.');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [sessionId]);

  // Handle countdown
  useEffect(() => {
    if (!session || !session.isActive) return;

    const timer = setInterval(() => {
      const expiresAt = new Date(session.expiresAt).getTime();
      const now = new Date().getTime();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        setSession((prev: any) => ({ ...prev, isActive: false }));
        clearInterval(timer);
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim() || !studentName.trim()) {
      setError('Please specify both your Roll/Registration Number and Full Name.');
      return;
    }

    if (!token) {
      setError('Security Error: Token is missing. You MUST scan a valid live QR code.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const fingerprint = getDeviceFingerprint();

      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          studentId: studentId.trim(),
          studentName: studentName.trim(),
          deviceFingerprint: fingerprint,
          token
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check in.');
      }

      setSuccessRecord(data.record);
    } catch (err: any) {
      setError(err.message || 'Failed to mark attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] text-slate-400">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
        <p className="mt-4 text-slate-500 font-medium font-sans">Validating security constraints...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4 py-12 md:py-16 text-slate-300 selection:bg-indigo-500/30 selection:text-indigo-250">
      <div className="w-full max-w-md bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.3)]">
        {/* Subtle top indicator strip */}
        <div className="h-1.5 bg-indigo-500" />

        <AnimatePresence mode="wait">
          {successRecord ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center"
            >
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-6">
                <CheckCircle2 className="h-10 w-10 animate-bounce" />
              </div>
              <h2 className="text-2xl font-serif italic text-white mb-2 tracking-tight">Check-in Confirmed!</h2>
              <p className="text-slate-400 text-sm mb-6">Your attendance has been registered successfully for this session.</p>

              <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80 text-left space-y-3 mb-8">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-widest">Subject</span>
                  <span className="text-white font-medium text-sm">{session?.subject || 'Lecture'}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-widest">Course Code</span>
                    <span className="text-indigo-400 font-mono text-sm font-semibold">{session?.classCode}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-widest">Time Stamp</span>
                    <span className="text-slate-300 text-sm font-medium">
                      {new Date(successRecord.markedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <hr className="border-slate-800/50 my-2" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-widest">Roll Number</span>
                    <span className="text-white font-medium text-sm">{successRecord.studentId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-widest">Student Name</span>
                    <span className="text-white font-medium text-sm">{successRecord.studentName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center space-x-2 text-xs text-slate-500 font-medium">
                <Laptop className="h-3.5 w-3.5" />
                <span className="font-mono">Device Verification: {successRecord.deviceFingerprint.substring(0, 12)}</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 md:p-8"
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="h-10 w-10 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl flex items-center justify-center">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif italic text-white leading-snug">Student Check-in</h2>
                  <p className="text-xs uppercase tracking-widest text-slate-500">QR Secure Attendance Logging</p>
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-start space-x-2.5 text-sm mb-6 font-sans">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {session && !session.isActive ? (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-serif italic text-white mb-1">Session Expired</h3>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto mb-4 font-sans">
                    This attendance session has ended. QR codes expire exactly 10 minutes after generation. Please ask your teacher to generate a new QR.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-serif italic text-white text-md">{session?.subject}</h3>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-1">
                        <span className="font-mono bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 px-1.5 py-0.5 rounded text-[11px] font-semibold">{session?.classCode}</span>
                        <span>•</span>
                        <span className="text-slate-500 uppercase tracking-widest text-[10px]">Active Room</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center space-x-1 justify-end text-rose-400 text-[10px] font-bold uppercase tracking-widest">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Expires In</span>
                      </div>
                      <span className="text-slate-300 font-bold font-mono text-xs block mt-1 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        {timeLeft || 'Calculating...'}
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="studentId" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                        Roll / Registration Number
                      </label>
                      <input
                        id="studentId"
                        type="text"
                        placeholder="e.g. 2026/CS/084"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        disabled={submitting}
                        className="w-full px-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="studentName" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                        Full Name
                      </label>
                      <input
                        id="studentName"
                        type="text"
                        placeholder="e.g. Julian Casablancas"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        disabled={submitting}
                        className="w-full px-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                        required
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-850 text-white py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-md active:shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>Confirming Location...</span>
                          </>
                        ) : (
                          <>
                            <span>Register Attendance</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
