import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.'
  );
}

/**
 * Dynamic persistence mode:
 * - localStorage.drive_admin_persist === 'session' => store auth session in sessionStorage
 * - otherwise => store auth session in localStorage (default, "stay signed in")
 */
const getPersistMode = () => {
  try {
    return localStorage.getItem('drive_admin_persist') === 'session' ? 'session' : 'local';
  } catch {
    return 'local';
  }
};

const routedStorage = {
  getItem: (key) => {
    try {
      return getPersistMode() === 'session'
        ? sessionStorage.getItem(key)
        : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (getPersistMode() === 'session') sessionStorage.setItem(key, value);
      else localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key) => {
    try {
      // remove from BOTH so switching modes won’t leave ghost sessions
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {}
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: routedStorage,
  },
});
