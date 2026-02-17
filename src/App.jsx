import { useState, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { UserAccountsPage } from './pages/UserAccountsPage';
import { DrowsinessReportsPage } from './pages/DrowsinessReportsPage';
import { ActiveAlertsPage } from './pages/ActiveAlertsPage';
import { ArchivePage } from './pages/ArchivePage';
import { initializeData } from './utils/initData';
import './styles/theme.css';
import { supabase } from './utils/supabaseClient';


export default function App() {
  const [currentPage, setCurrentPage] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
useEffect(() => {
  let alive = true;

  const getSavedPage = () => {
    try {
      const v = localStorage.getItem('drive_admin_currentPage');
      // only allow known pages
      if (v === 'dashboard' || v === 'users' || v === 'reports' || v === 'alerts') return v;
      return null;
    } catch {
      return null;
    }
  };

  const savePage = (page) => {
    try {
      localStorage.setItem('drive_admin_currentPage', page);
    } catch {}
  };

  const routeFromHash = () => {
    // Supabase recovery links: #access_token=...&type=recovery&...
    const h = String(window.location.hash || '');
    if (h.includes('type=recovery') || h.startsWith('#reset-password')) {
      setIsAuthenticated(false);
      setCurrentPage('reset-password');
      return true;
    }
    return false;
  };

  const onHash = () => {
    routeFromHash();
  };

  window.addEventListener('hashchange', onHash);

  (async () => {
    // If this is a recovery link, go straight to reset-password page
    if (routeFromHash()) return;

    const { data } = await supabase.auth.getSession();
    const hasSession = !!data?.session?.user;

    if (!alive) return;

    setIsAuthenticated(hasSession);

    if (hasSession) {
      const saved = getSavedPage();
      setCurrentPage(saved || 'dashboard');
    } else {
      setCurrentPage('login');
    }
  })();

  const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
    // If user is in recovery flow, keep reset-password page visible
    const h = String(window.location.hash || '');
    if (h.includes('type=recovery') || h.startsWith('#reset-password')) {
      setIsAuthenticated(false);
      setCurrentPage('reset-password');
      return;
    }

    const hasSession = !!session?.user;
    setIsAuthenticated(hasSession);

    if (!hasSession) {
      setCurrentPage('login');
      try {
        localStorage.removeItem('drive_admin_currentPage');
      } catch {}
      return;
    }

    const saved = getSavedPage();
    if (!saved) {
      savePage('dashboard');
      setCurrentPage('dashboard');
    }
  });

  return () => {
    alive = false;
    window.removeEventListener('hashchange', onHash);
    try {
      sub?.subscription?.unsubscribe?.();
    } catch {}
  };
}, []);


const handleLogin = async ({ email, password, staySignedIn }) => {
  // ✅ Step 2 persistence: routedStorage in supabaseClient.js reads this
  try {
    localStorage.setItem('drive_admin_persist', staySignedIn ? 'local' : 'session');
  } catch {}

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || ''),
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const uid = data?.user?.id;
  if (!uid) {
    try { await supabase.auth.signOut(); } catch {}
    return { ok: false, message: 'Login failed: missing user id.' };
  }

  // ✅ Admin-only gate: must exist in public.admin_users
  const { data: adminRow, error: adminErr } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle();

  if (adminErr) {
    try { await supabase.auth.signOut(); } catch {}
    return { ok: false, message: adminErr.message || 'Admin verification failed.' };
  }

  if (!adminRow?.user_id) {
    try { await supabase.auth.signOut(); } catch {}
    return { ok: false, message: 'This account is not an admin.' };
  }

  setIsAuthenticated(true);
  setCurrentPage('dashboard');
  try {
    localStorage.setItem('drive_admin_currentPage', 'dashboard');
  } catch {}
  return { ok: true };
};



const handleLogout = async () => {
  try {
    await supabase.auth.signOut();
  } catch {}

  setIsAuthenticated(false);
  setCurrentPage('login');
  try {
    localStorage.removeItem('drive_admin_currentPage');
  } catch {}
};


const navigate = (page) => {
  setCurrentPage(page);
  try {
    localStorage.setItem('drive_admin_currentPage', page);
  } catch {}
};

  if (!isAuthenticated) {
    if (currentPage === 'reset-password') {
      return (
        <ResetPasswordPage
          onBackToLogin={() => setCurrentPage('login')}
        />
      );
    }

    if (currentPage === 'forgot-password') {
      return (
        <ForgotPasswordPage
          onBackToLogin={() => setCurrentPage('login')}
        />
      );
    }

    return (
      <LoginPage
        onLogin={handleLogin}
        onForgotPassword={() => setCurrentPage('forgot-password')}
      />
    );
  }


  return (
    <Layout
      currentPage={currentPage}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'users' && <UserAccountsPage />}
      {currentPage === 'reports' && <DrowsinessReportsPage />}
      {currentPage === 'alerts' && <ActiveAlertsPage />}
    </Layout>
  );
}