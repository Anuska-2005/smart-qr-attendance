import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Play, Square, Download, RefreshCw, LogOut, Clock, 
  Users, Calendar, GraduationCap, Server, HelpCircle, CheckCircle2,
  ExternalLink, Layers, Award, Trash, Shield, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherDashboardProps {
  token: string;
  teacher: { id: string; name: string; email: string };
  onLogout: () => void;
}

export default function TeacherDashboard({ token, teacher, onLogout }: TeacherDashboardProps) {
  // DB & Connection stats
  const [dbStatus, setDbStatus] = useState<{ mode: string; connected: boolean } | null>(null);

  // Active session details
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeRecords, setActiveRecords] = useState<any[]>([]);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Form states
  const [subject, setSubject] = useState('');
  const [classCode, setClassCode] = useState('');
  const [duration, setDuration] = useState(10); // Standard 10 minutes from prompt (feature 8)

  // Status/error states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Previous Sessions History
  const [previousSessions, setPreviousSessions] = useState<any[]>([]);

  // Polling ref for updating active records in real-time
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial loads
  useEffect(() => {
    fetchDbStatus();
    loadDashboardState();
    loadHistory();

    return () => {
      stopPolling();
    };
  }, []);

  // Poll for records when active session exists
  useEffect(() => {
    if (activeSession && activeSession.isActive) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [activeSession]);

  // Real-time ticking remaining time countdown
  useEffect(() => {
    if (!activeSession || !activeSession.isActive) {
      setTimeRemaining('');
      return;
    }

    const interval = setInterval(() => {
      const expiresAt = new Date(activeSession.expiresAt).getTime();
      const now = new Date().getTime();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        handleLocalExpiration();
        clearInterval(interval);
      } else {
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const startPolling = () => {
    stopPolling();
    // Poll every 3 seconds for new student registers
    pollingTimerRef.current = setInterval(() => {
      pollActiveSessionRecords();
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const fetchDbStatus = async () => {
    try {
      const res = await fetch('/api/db-status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data.db);
      }
    } catch {
      // Ignore background failures
    }
  };

  const loadDashboardState = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/sessions/active', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Stale authorization token. Please relogin.');
      const data = await res.json();
      
      if (data.activeSession) {
        setActiveSession(data.activeSession);
        setActiveRecords(data.records || []);
        setQrCodeData(data.qrDataUrl);
        setScanUrl(data.scanUrl);
      } else {
        setActiveSession(null);
        setActiveRecords([]);
        setQrCodeData(null);
        setScanUrl(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred syncing state.');
    } finally {
      setLoading(false);
    }
  };

  const pollActiveSessionRecords = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`/api/sessions/${activeSession.id}/records`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRecords(data.records || []);
      }
    } catch (e) {
      // Background logging retry
    }
  };

  const handleLocalExpiration = () => {
    setActiveSession((prev: any) => {
      if (!prev) return null;
      return { ...prev, isActive: false };
    });
    loadHistory(); // Refresh histories lists
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviousSessions(data.sessions || []);
      }
    } catch (e) {
      // Quiet fail to preserve layout
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !classCode.trim()) {
      setError('Please provide both the course outline subject and specific course code.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subject: subject.trim(),
          classCode: classCode.trim().toUpperCase(),
          durationMinutes: duration
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize class session.');

      setActiveSession(data.session);
      setQrCodeData(data.qrDataUrl);
      setScanUrl(data.scanUrl);
      setActiveRecords([]);
      
      // Clear form inputs
      setSubject('');
      setClassCode('');
      
      // Update history
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Unable to instantiate campaign.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExpireSession = async () => {
    if (!activeSession) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/sessions/${activeSession.id}/expire`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Unable to deactivate active checkins.');

      setActiveSession((prev: any) => {
        if (!prev) return null;
        return { ...prev, isActive: false };
      });
      
      // Reload states
      loadDashboardState();
      loadHistory();
    } catch (err: any) {
      setError(err.message || 'Error processing termination.');
    } finally {
      setActionLoading(false);
    }
  };

  const downloadCSV = async (sessionId: string, subjectName: string, courseCode: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/csv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Database server error compressing log exports.');
      
      const blob = await res.blob();
      const downloadLink = document.createElement('a');
      downloadLink.href = window.URL.createObjectURL(blob);
      downloadLink.download = `${courseCode}_${subjectName.replace(/\s+/g, '_')}_Attendance.csv`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err: any) {
      alert(err.message || 'Could not download CSV export.');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-350 selection:bg-indigo-500/30 selection:text-indigo-250 font-sans">
      
      {/* Upper Navigation Rail */}
      <nav className="bg-[#020617]/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            
            <div className="flex items-center space-x-3.5">
              <div className="h-10 w-10 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <span className="font-serif italic text-2xl text-white block leading-none">QRSentry</span>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] block mt-1">Attendance System</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-sm font-serif italic text-slate-105 leading-none text-white">{teacher.name}</span>
                <span className="text-[10px] text-slate-500 font-mono mt-1 leading-none">{teacher.email}</span>
              </div>

              {dbStatus && (
                <div className={`hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  dbStatus.connected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  <Server className="h-3.5 w-3.5" />
                  <span className="capitalize">{dbStatus.mode} {dbStatus.connected ? 'Active' : 'Database Offline'}</span>
                </div>
              )}

              <button
                onClick={onLogout}
                className="flex items-center space-x-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* Main body canvas */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {error && (
          <div className="mb-8 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-5 py-4 rounded-2xl flex items-start space-x-3 text-sm font-sans">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Dashboard Notification</p>
              <p className="text-xs text-rose-300 mt-1">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="text-rose-400 hover:text-white text-xs font-bold uppercase tracking-wider transition duration-150 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <RefreshCw className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
            <p className="font-medium text-slate-400">Syncing live dashboards...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT AREA: Active Campaign / Control Panel */}
            <div className="lg:col-span-12 xl:col-span-7 space-y-8">
              
              <AnimatePresence mode="wait">
                {activeSession ? (
                  <motion.div
                    key="active-campaign"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)]"
                  >
                    <div className="p-6 md:p-8 bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80">
                      
                      {/* Floating glowing background details */}
                      <div className="absolute right-0 top-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                      
                      <div>
                        <div className="inline-flex items-center space-x-2 px-2.5 py-1 bg-indigo-505/10 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-400 font-semibold mb-3">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
                          <span className="text-[10px] uppercase tracking-widest font-bold">Active Feed Campaign</span>
                        </div>
                        <h2 className="text-3xl font-serif italic text-white tracking-tight">{activeSession.subject}</h2>
                        <div className="flex items-center space-x-2.5 text-slate-400 text-xs mt-1">
                          <span className="font-mono bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-xs text-indigo-450 text-indigo-400">{activeSession.classCode}</span>
                          <span>•</span>
                          <span>Authorized Class Monitor</span>
                        </div>
                      </div>

                      <div className="text-left md:text-right bg-slate-950/60 border border-slate-800 rounded-xl p-4 shrink-0">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Time Remaining</p>
                        <div className="flex items-center space-x-2 mt-1.5">
                          <Clock className="h-5 w-5 text-rose-450 text-rose-400" />
                          <span className="text-xl font-bold font-mono text-white">
                            {timeRemaining || 'Loading...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 md:p-8">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                        
                        {/* QR Image visual */}
                        <div className="md:col-span-5 flex flex-col items-center">
                          {activeSession.isActive && qrCodeData ? (
                            <div className="bg-white p-6 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col items-center">
                              <img 
                                src={qrCodeData} 
                                alt="Student Checkin QR Code" 
                                className="w-48 h-48 object-contain block hover:scale-102 transition duration-200"
                              />
                              <div className="mt-3 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Project on big screen
                              </div>
                            </div>
                          ) : (
                            <div className="h-56 w-56 bg-slate-950/40 rounded-3xl border border-dashed border-slate-800 flex flex-col items-center justify-center p-6 text-center">
                              <Square className="h-10 w-10 text-rose-400/80 mb-3 block" />
                              <span className="font-bold text-white text-sm">Session Closed</span>
                              <span className="text-slate-500 text-xs mt-1">Disabled for registers</span>
                            </div>
                          )}
                        </div>

                        {/* Details instructions & early exit */}
                        <div className="md:col-span-7 space-y-5">
                          <div>
                            <h3 className="font-bold text-slate-400 text-xs block uppercase tracking-widest">QR Verification Protocol:</h3>
                            <ul className="text-xs text-slate-400 mt-3 space-y-2.5 font-sans">
                              <li className="flex items-start space-x-2.5">
                                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                <span>Students target key QR with standard camera elements to load the verification app window.</span>
                              </li>
                              <li className="flex items-start space-x-2.5 font-sans">
                                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                <span>Students entry credentials (Roll Numbers & Full Names) are transmitted instantly.</span>
                              </li>
                              <li className="flex items-start space-x-2.5">
                                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                <span>Double proxy attempts, fake browser geolocation blocks run automatically.</span>
                              </li>
                            </ul>
                          </div>

                          {/* TESTING SHORTCUT FOR DEVELOPMENT */}
                          <div className="bg-indigo-500/5 border border-indigo-500/15 p-4 rounded-2xl space-y-2">
                            <div className="flex items-center space-x-1.5 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                              <Shield className="h-4 w-4" />
                              <span>Simulation Center</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-normal font-sans">
                              Test locally by opening student portal view. Use this static link in a clean sandbox tab:
                            </p>
                            {scanUrl && (
                              <a 
                                href={scanUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center space-x-1.5 text-indigo-400 hover:text-indigo-300 font-bold text-xs uppercase tracking-wider transition-all"
                              >
                                <span>A Student Check-In Link</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            {activeSession.isActive && (
                              <button
                                onClick={handleExpireSession}
                                disabled={actionLoading}
                                className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold px-4 py-3 rounded-xl text-xs uppercase tracking-widest transition duration-150 flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                              >
                                <Square className="h-4 w-4" />
                                <span>Close Session</span>
                              </button>
                            )}
                            
                            <button
                              onClick={() => downloadCSV(activeSession.id, activeSession.subject, activeSession.classCode)}
                              className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-bold px-4 py-3 rounded-xl text-xs uppercase tracking-widest transition duration-150 flex items-center justify-center space-x-2 cursor-pointer"
                            >
                              <Download className="h-4 w-4" />
                              <span>Export CSV Log</span>
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="create-form"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.3)]"
                  >
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="h-10 w-10 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl flex items-center justify-center font-bold shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                        <Plus className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-serif italic text-white leading-snug">New Attendance Session</h2>
                        <p className="text-xs uppercase tracking-widest text-slate-500">Configure parameters to launch live QR code</p>
                      </div>
                    </div>

                    <form onSubmit={handleCreateSession} className="space-y-5">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                            Course / Subject Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Advanced Machine Learning"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={actionLoading}
                            className="w-full px-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                            Class Code / Number
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. CS-402"
                            value={classCode}
                            onChange={(e) => setClassCode(e.target.value)}
                            disabled={actionLoading}
                            className="w-full px-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                          Session Lifetime (QR Validity Period)
                        </label>
                        
                        <div className="grid grid-cols-4 gap-2">
                          {[5, 10, 15, 30].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setDuration(mins)}
                              disabled={actionLoading}
                              className={`py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all cursor-pointer ${
                                duration === mins 
                                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25 shadow-sm font-semibold' 
                                  : 'bg-slate-950/40 hover:bg-slate-950 text-slate-450 text-slate-400 border-slate-850 border-slate-800'
                              }`}
                            >
                              {mins} Mins {mins === 10 ? '★' : ''}
                            </button>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-2 block font-medium">
                          ★ Recommended default is 10 minutes. The session automatically closes after expiry.
                        </span>
                      </div>

                      <div className="pt-4 border-t border-slate-800/80">
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition duration-150 flex items-center justify-center space-x-2 cursor-pointer"
                        >
                          <Play className="h-4 w-4" />
                          <span>Generate Live Session & QR</span>
                        </button>
                      </div>

                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SECTION: History Table log */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl shadow-sm overflow-hidden p-6 md:p-8">
                <div className="flex items-center justify-between mb-5 border-b border-slate-800/60 pb-4">
                  <div className="flex items-center space-x-2.5">
                    <Calendar className="h-5 w-5 text-indigo-400" />
                    <h3 className="text-lg font-serif italic text-white tracking-tight">Preceding Attendance Campaigns</h3>
                  </div>
                  <span className="text-[10px] bg-slate-800/80 text-indigo-300 font-bold px-2.5 py-1 uppercase tracking-widest rounded-full border border-slate-700/50">
                    {previousSessions.length} campaigns
                  </span>
                </div>

                {previousSessions.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    No historical logs captured yet. Generating a new campaign creates a session entry here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-800">
                      <thead>
                        <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-left">
                          <th className="py-3 px-4">Subject & Code</th>
                          <th className="py-3 px-4 font-normal">Session Date</th>
                          <th className="py-3 px-4 text-center font-normal">Registrants</th>
                          <th className="py-3 px-4 text-center font-normal">Export</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-xs text-slate-400">
                        {previousSessions.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-800/10 transition duration-100">
                            <td className="py-3.5 px-4 font-medium text-white max-w-[170px] truncate">
                              <span className="block font-serif italic text-slate-200 text-sm leading-snug">{s.subject}</span>
                              <span className="block text-[10px] text-indigo-400 font-mono mt-0.5">{s.classCode}</span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500">
                              {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {new Date(s.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                {s.attendanceCount} Students
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => downloadCSV(s.id, s.subject, s.classCode)}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-800 bg-slate-950/40 hover:bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
                                title="Download spreadsheet log"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT AREA: Live Telemetry attending list */}
            <div className="lg:col-span-12 xl:col-span-5">
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.3)]">
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-5">
                  <div className="flex items-center space-x-2.5">
                    <Users className="h-5 w-5 text-indigo-400" />
                    <div>
                      <h3 className="text-lg font-serif italic text-white tracking-tight">Recent Activity Feed</h3>
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mt-0.5">Updated Live</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-3xl font-bold font-mono text-white block">{activeRecords.length}</span>
                    <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Logged Student{activeRecords.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {!activeSession ? (
                  <div className="text-center py-24 text-slate-500 text-xs">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-950/40 border border-slate-800 text-slate-500 mb-3">
                      <Users className="h-6 w-6" />
                    </div>
                    <p className="font-bold text-slate-400 block tracking-wider uppercase text-[10px]">Awaiting Active Session</p>
                    <p className="mt-2 leading-relaxed max-w-xs mx-auto text-slate-500 font-sans">
                      Student attendance listing will stream live here as soon as you generate a new QR session loop.
                    </p>
                  </div>
                ) : activeRecords.length === 0 ? (
                  <div className="text-center py-20 text-slate-505 text-slate-500 text-xs bg-slate-950/30 rounded-2xl border border-dashed border-slate-800">
                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3 pulse-subtle">
                      <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />
                    </div>
                    <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px] block">Awaiting Scanner Scans</p>
                    {activeSession.isActive ? (
                      <p className="mt-2 max-w-xs mx-auto leading-relaxed text-slate-500 font-sans">
                        QR projection is live. Instructors portal is listening on student scan codes. Check-ins will update instantly.
                      </p>
                    ) : (
                      <p className="mt-2 text-rose-450 text-rose-450 text-rose-400 uppercase font-bold tracking-widest text-[10px]">
                        Session Expired. Zero logs generated.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    <AnimatePresence initial={false}>
                      {activeRecords.map((r, index) => (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center justify-between p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/80 hover:bg-slate-900 transition"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="h-8.5 w-8.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full flex items-center justify-center font-bold text-xs">
                              {r.studentName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="block font-medium text-white text-xs">{r.studentName}</span>
                              <span className="block text-[10px] text-slate-500 font-mono mt-0.5">{r.studentId}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-405 text-slate-400 font-mono block">
                              {new Date(r.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className="inline-flex items-center space-x-1 mt-1 text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold tracking-wider uppercase px-2 py-0.5 rounded">
                              <span>Verified</span>
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
