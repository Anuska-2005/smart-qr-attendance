import React, { useState } from 'react';
import { Mail, Lock, User, LogIn, UserPlus, GraduationCap, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherAuthViewProps {
  onLoginSuccess: (token: string, teacher: { id: string; name: string; email: string }) => void;
}

export default function TeacherAuthView({ onLoginSuccess }: TeacherAuthViewProps) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password) {
      setError('Please provide both your registered email and passwords.');
      return;
    }

    if (!isLoginTab && !name) {
      setError('A full name is required to complete registration.');
      return;
    }

    try {
      setLoading(true);
      const url = isLoginTab ? '/api/auth/login' : '/api/auth/register';
      const body = isLoginTab ? { email, password } : { name, email, password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication event failed.');
      }

      if (isLoginTab) {
        onLoginSuccess(data.token, data.teacher);
      } else {
        setSuccess('Teacher account created successfully! Switching to Login tab in 2 seconds.');
        setName('');
        // Auto toggles back to login in 2 seconds
        setTimeout(() => {
          setIsLoginTab(true);
          setSuccess(null);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || 'Error executing request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 py-12 md:py-16 text-slate-300 selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="w-full max-w-md bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.3)]">
        {/* Banner */}
        <div className="relative h-32 bg-gradient-to-br from-slate-950 to-indigo-950 flex flex-col justify-end p-6 select-none overflow-hidden border-b border-slate-800/80">
          {/* Subtle glowing highlights */}
          <div className="absolute right-0 top-0 -mr-6 -mt-8 w-28 h-28 rounded-full bg-indigo-500/10 blur-2xl" />
          <div className="absolute left-1/4 bottom-0 w-32 h-32 rounded-full bg-blue-500/5 blur-3xl" />

          <div className="relative flex items-center space-x-2.5">
            <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/30 rounded-lg flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-serif italic text-white tracking-tight">QRSentry</h1>
          </div>
          <p className="text-slate-400 text-[11px] uppercase tracking-wider mt-1 relative z-10 font-sans">
            Instructor Portal • Live attendance
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-800/60 bg-slate-950/40 p-1">
          <button
            onClick={() => { setIsLoginTab(true); setError(null); }}
            className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center space-x-2 ${
              isLoginTab 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm font-semibold' 
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <LogIn className="h-4 w-4" />
            <span>Teacher Login</span>
          </button>
          <button
            onClick={() => { setIsLoginTab(false); setError(null); }}
            className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center space-x-2 ${
              !isLoginTab 
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm font-semibold' 
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            <span>Create Profile</span>
          </button>
        </div>

        <div className="p-6 md:p-8">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl flex items-start space-x-2.5 text-sm mb-6">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl flex items-start space-x-2.5 text-sm mb-6">
              <Sparkles className="h-5 w-5 shrink-0 mt-0.5 animate-bounce" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="popLayout">
              {!isLoginTab && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                    Your Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. Dr. Arthur Thorne"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                      required={!isLoginTab}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Teacher Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                <input
                  type="email"
                  placeholder="e.g. smith@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-950/60 hover:bg-slate-950 focus:bg-slate-950 text-white text-sm border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-xl transition duration-150"
                  required
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition duration-150 disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Processing transaction...' : isLoginTab ? 'Sign In as Instructor' : 'Create Instructor Profile'}
              </button>
            </div>
          </form>
        </div>

        <div className="border-t border-slate-800/80 px-6 py-4 bg-slate-950/30 text-center text-xs text-slate-500 font-medium">
          QR Secure System Verification • Sandbox Environment
        </div>
      </div>
    </div>
  );
}
