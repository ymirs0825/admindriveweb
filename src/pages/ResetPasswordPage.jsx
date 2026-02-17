import { useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import driveLogo from '../assets/drivelogo.png';

export function ResetPasswordPage({ onBackToLogin }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorText, setErrorText] = useState('');
  const [okText, setOkText] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = useMemo(() => {
    if (!password) return 'New password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    if (confirm !== password) return 'Passwords do not match';
    return '';
  }, [password, confirm]);

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorText('');
    setOkText('');

    const v = validate;
    if (v) {
      setErrorText(v);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorText(error.message || 'Failed to update password.');
        return;
      }

      setOkText('Password updated. Please log in again.');

      // clean URL hash tokens (recovery hash)
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}

      // force fresh login
      try {
        await supabase.auth.signOut();
      } catch {}

      onBackToLogin?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200">
      <div className="w-full max-w-md p-8 border shadow-2xl rounded-2xl bg-white/95 border-white/20">
        <div className="mb-6 text-center">
          <div className="w-16 h-16 mx-auto mb-3">
            <img src={driveLogo} alt="D.R.I.V.E. Logo" className="object-contain w-full h-full drop-shadow-2xl" />
          </div>
          <h2 className="text-2xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text">
            Set New Admin Password
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter a new password for your admin account.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorText(''); }}
              className="w-full px-4 py-3 transition-all duration-200 border border-blue-200 rounded-xl bg-white/80 hover:border-blue-300 focus:border-transparent focus:ring-2 focus:ring-blue-400"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrorText(''); }}
              className="w-full px-4 py-3 transition-all duration-200 border border-blue-200 rounded-xl bg-white/80 hover:border-blue-300 focus:border-transparent focus:ring-2 focus:ring-blue-400"
              placeholder="••••••••"
            />
          </div>

          {errorText && <p className="text-sm text-red-600">{errorText}</p>}
          {okText && <p className="text-sm text-green-700">{okText}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 font-semibold text-white transition-all duration-200 shadow-lg bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save Password'}
          </button>

          <button
            type="button"
            onClick={onBackToLogin}
            className="w-full text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
          >
            Back to Login
          </button>
        </form>
      </div>
    </div>
  );
}
