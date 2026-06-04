import React, { useState, useEffect } from 'react';
import StudentScanView from './components/StudentScanView';
import TeacherAuthView from './components/TeacherAuthView';
import TeacherDashboard from './components/TeacherDashboard';
import { Loader2, RefreshCw } from 'lucide-react';

export default function App() {
  // Routing state
  const [route, setRoute] = useState<{ type: 'teacher' | 'student'; sessionId?: string; token?: string | null }>({ type: 'teacher' });
  
  // Teacher credentials state
  const [teacherToken, setTeacherToken] = useState<string | null>(null);
  const [teacherUser, setTeacherUser] = useState<{ id: string; name: string; email: string } | null>(null);
  
  // Application starting up
  const [initializing, setInitializing] = useState(true);

  // Read URL routes and verify Token
  useEffect(() => {
    const parseRoute = () => {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/scan/')) {
        const sessionId = pathname.split('/scan/')[1];
        const params = new URLSearchParams(window.location.search);
        const token = params.get('t');
        setRoute({ type: 'student', sessionId, token });
      } else {
        setRoute({ type: 'teacher' });
      }
    };

    // Parse once
    parseRoute();

    // Look for previous login session
    const savedToken = localStorage.getItem('teacherToken');
    const savedUserJson = localStorage.getItem('teacherUser');

    if (savedToken && savedUserJson) {
      const parsedUser = JSON.parse(savedUserJson);
      // Verify token is still good
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      })
      .then(res => {
        if (res.ok) {
          setTeacherToken(savedToken);
          setTeacherUser(parsedUser);
        } else {
          // Bad/expired token
          localStorage.removeItem('teacherToken');
          localStorage.removeItem('teacherUser');
        }
      })
      .catch(() => {
        // Network problem, let them keep using offline cached fallback
        setTeacherToken(savedToken);
        setTeacherUser(parsedUser);
      })
      .finally(() => {
        setInitializing(false);
      });
    } else {
      setInitializing(false);
    }
  }, []);

  const handleLoginSuccess = (token: string, teacher: { id: string; name: string; email: string }) => {
    localStorage.setItem('teacherToken', token);
    localStorage.setItem('teacherUser', JSON.stringify(teacher));
    setTeacherToken(token);
    setTeacherUser(teacher);
  };

  const handleLogout = () => {
    localStorage.removeItem('teacherToken');
    localStorage.removeItem('teacherUser');
    setTeacherToken(null);
    setTeacherUser(null);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center text-slate-400 font-sans selection:bg-indigo-500/30">
        <RefreshCw className="h-8 w-8 text-indigo-505 text-indigo-500 animate-spin" />
        <p className="mt-4 text-xs font-mono text-slate-550 uppercase tracking-[0.25em]">Initializing QRSentry Secure Environment...</p>
      </div>
    );
  }

  // Route 1: Student Scanning Landing view
  if (route.type === 'student' && route.sessionId) {
    return <StudentScanView sessionId={route.sessionId} token={route.token || null} />;
  }

  // Route 2: Teacher Authenticated Dashboard
  if (teacherToken && teacherUser) {
    return (
      <TeacherDashboard 
        token={teacherToken} 
        teacher={teacherUser} 
        onLogout={handleLogout} 
      />
    );
  }

  // Route 3: Teacher Authenticating Form
  return <TeacherAuthView onLoginSuccess={handleLoginSuccess} />;
}
