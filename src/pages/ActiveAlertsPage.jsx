import {
  AlertTriangle, Bell, BellOff, Clock, User,
  ChevronLeft, ChevronRight, CheckCircle, Navigation
} from 'lucide-react';
import { format } from 'date-fns';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';

// ─── Configurable constants ───────────────────────────────────────────────────
const HEARTBEAT_WINDOW_SEC = 90;       // driver removed if heartbeat older than this
const LOCATION_ACTIVE_SEC  = 120;      // "moving" if last_location_at within this
const ALERT_WINDOW_MIN     = 30;       // warnings older than this → SAFE
const DRIVER_POLL_MS       = 5_000;    // poll driver_status every 5s (fallback)
const WARNING_POLL_MS      = 15_000;   // poll driver_warnings every 15s (fallback)
const PRUNE_INTERVAL_MS    = 30_000;   // evict stale drivers every 30s
const ITEMS_PER_PAGE       = 5;
// ─────────────────────────────────────────────────────────────────────────────

export function ActiveAlertsPage() {
  // driversMap: Map<user_id, DriverEntry>
  // DriverEntry shape:
  // {
  //   userId, userName,
  //   lastHeartbeatAt, lastLocationAt, lastLat, lastLng,
  //   alertLevel: 0|1|2|3,   (0 = SAFE)
  //   alert: { id, level, monitor_type, location_text, snapshot_url, meta, created_at } | null
  // }
  const [driversMap, setDriversMap] = useState(() => new Map());
  const [currentPage, setCurrentPage] = useState(1);

  const warningCursorRef = useRef({ createdAt: null, id: null });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const buildFullName = (first, last, email) => {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    const full = `${f}${f && l ? ' ' : ''}${l}`.trim();
    return full || String(email || '').trim() || 'Unknown';
  };

  const coerceNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const isHeartbeatAlive = (lastHeartbeatAt) => {
    if (!lastHeartbeatAt) return false;
    const age = (Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000;
    return age <= HEARTBEAT_WINDOW_SEC;
  };

  const isLocationActive = (lastLocationAt) => {
    if (!lastLocationAt) return false;
    const age = (Date.now() - new Date(lastLocationAt).getTime()) / 1000;
    return age <= LOCATION_ACTIVE_SEC;
  };

  // ── Profile fetcher ────────────────────────────────────────────────────────

  const fetchProfilesByIds = async (userIds) => {
    if (!userIds || userIds.length === 0) return new Map();
    const { data, error } = await supabase
      .from('user_profiles_public')
      .select('id,email,first_name,last_name,avatar_url')
      .in('id', userIds);
    if (error) { console.log('[ActiveAlerts] profiles error:', error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach((p) => map.set(p.id, p));
    return map;
  };

  // ── Merge driver_status rows into driversMap ───────────────────────────────

  const upsertDriversFromStatus = useCallback(async (statusRows) => {
    if (!statusRows || statusRows.length === 0) return;

    const alive = statusRows.filter(
      (r) => r.mode === 'driver' && isHeartbeatAlive(r.last_heartbeat_at)
    );

    // Fetch profiles for newly seen user_ids only
    const userIds = alive.map((r) => r.user_id);
    const profiles = await fetchProfilesByIds(userIds);

    setDriversMap((prev) => {
      const next = new Map(prev);

      for (const row of alive) {
        const existing = next.get(row.user_id);
        const profile = profiles.get(row.user_id);
        next.set(row.user_id, {
          userId:          row.user_id,
          userName:        existing?.userName ?? buildFullName(profile?.first_name, profile?.last_name, profile?.email),
          lastHeartbeatAt: row.last_heartbeat_at,
          lastLocationAt:  row.last_location_at,
          lastLat:         row.last_lat,
          lastLng:         row.last_lng,
          // Preserve existing alert data — warning updates handle this separately
          alertLevel:      existing?.alertLevel ?? 0,
          alert:           existing?.alert ?? null,
        });
      }

      // Remove drivers that changed mode away from 'driver' in this batch
      for (const row of statusRows) {
        if (row.mode !== 'driver') next.delete(row.user_id);
      }

      return next;
    });
  }, []);

  // ── Merge driver_warnings rows into driversMap ─────────────────────────────

  const upsertWarningsFromRows = useCallback((warningRows) => {
    if (!warningRows || warningRows.length === 0) return;

    // Advance warning cursor
    for (const r of warningRows) {
      const cur = warningCursorRef.current;
      const rt = new Date(r.created_at).getTime();
      const ct = cur.createdAt ? new Date(cur.createdAt).getTime() : 0;
      if (rt > ct || (rt === ct && String(r.id) > String(cur.id))) {
        warningCursorRef.current = { createdAt: r.created_at, id: r.id };
      }
    }

    setDriversMap((prev) => {
      const next = new Map(prev);
      const alertWindowCutoff = Date.now() - ALERT_WINDOW_MIN * 60 * 1000;

      for (const row of warningRows) {
        const entry = next.get(row.user_id);
        if (!entry) continue; // driver not in active list — ignore

        const rowTime = new Date(row.created_at).getTime();
        if (rowTime < alertWindowCutoff) continue; // too old

        const currentAlert = entry.alert;
        const shouldReplace =
          !currentAlert ||
          row.level > currentAlert.level ||
          (row.level === currentAlert.level && (
            rowTime > new Date(currentAlert.created_at).getTime() ||
            (rowTime === new Date(currentAlert.created_at).getTime() && String(row.id) > String(currentAlert.id))
          ));

        if (shouldReplace) {
          next.set(row.user_id, {
            ...entry,
            alertLevel: row.level,
            alert: {
              id:           row.id,
              level:        row.level,
              monitor_type: row.monitor_type,
              location_text:row.location_text,
              snapshot_url: row.snapshot_url,
              meta:         row.meta || {},
              created_at:   row.created_at,
            },
          });
        }
      }

      return next;
    });
  }, []);

  // ── Prune stale drivers (heartbeat expired) ────────────────────────────────

  const pruneInactiveDrivers = useCallback(() => {
    setDriversMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [uid, entry] of next.entries()) {
        if (!isHeartbeatAlive(entry.lastHeartbeatAt)) {
          next.delete(uid);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────

  const fetchInitialDriverStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_status')
      .select('user_id,mode,last_lat,last_lng,last_location_at,last_heartbeat_at,updated_at')
      .eq('mode', 'driver')
      .gte('last_heartbeat_at', new Date(Date.now() - HEARTBEAT_WINDOW_SEC * 1000).toISOString());

    if (error) { console.log('[ActiveAlerts] driver_status fetch error:', error.message); return; }
    await upsertDriversFromStatus(data || []);
  }, [upsertDriversFromStatus]);

  const fetchInitialWarnings = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_latest_warnings_for_active_drivers', {
      window_minutes: ALERT_WINDOW_MIN,
    });
    if (error) { console.log('[ActiveAlerts] warnings RPC error:', error.message); return; }
    upsertWarningsFromRows(data || []);
  }, [upsertWarningsFromRows]);

  // ── Polling fallbacks ──────────────────────────────────────────────────────

  const pollDriverStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('driver_status')
      .select('user_id,mode,last_lat,last_lng,last_location_at,last_heartbeat_at,updated_at')
      .gte('last_heartbeat_at', new Date(Date.now() - HEARTBEAT_WINDOW_SEC * 1000).toISOString());

    if (error) { console.log('[ActiveAlerts] poll driver_status error:', error.message); return; }
    await upsertDriversFromStatus(data || []);
  }, [upsertDriversFromStatus]);

  const pollNewWarnings = useCallback(async () => {
    const cur = warningCursorRef.current;
    if (!cur.createdAt) return; // no cursor yet — initial fetch covers this

    let query = supabase
      .from('driver_warnings')
      .select('id,user_id,created_at,level,monitor_type,location_text,snapshot_url,meta')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100);

    query = query.or(
      `created_at.gt.${cur.createdAt},and(created_at.eq.${cur.createdAt},id.gt.${cur.id})`
    );

    const { data, error } = await query;
    if (error) { console.log('[ActiveAlerts] poll warnings error:', error.message); return; }
    upsertWarningsFromRows(data || []);
  }, [upsertWarningsFromRows]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Initial load
  useEffect(() => {
    fetchInitialDriverStatus().then(() => fetchInitialWarnings());
  }, [fetchInitialDriverStatus, fetchInitialWarnings]);

  // Realtime: driver_status INSERT + UPDATE
  useEffect(() => {
    const channel = supabase
      .channel('driver_status_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_status' },
        async (payload) => { if (payload?.new) await upsertDriversFromStatus([payload.new]); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_status' },
        async (payload) => { if (payload?.new) await upsertDriversFromStatus([payload.new]); }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [upsertDriversFromStatus]);

  // Realtime: driver_warnings INSERT
  useEffect(() => {
    const channel = supabase
      .channel('driver_warnings_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_warnings' },
        (payload) => { if (payload?.new) upsertWarningsFromRows([payload.new]); }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [upsertWarningsFromRows]);

  // Polling fallback: driver_status every 5s
  useEffect(() => {
    const t = setInterval(pollDriverStatus, DRIVER_POLL_MS);
    return () => clearInterval(t);
  }, [pollDriverStatus]);

  // Polling fallback: new warnings every 15s
  useEffect(() => {
    const t = setInterval(pollNewWarnings, WARNING_POLL_MS);
    return () => clearInterval(t);
  }, [pollNewWarnings]);

  // Prune stale drivers every 30s
  useEffect(() => {
    const t = setInterval(pruneInactiveDrivers, PRUNE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pruneInactiveDrivers]);

  // Reset to page 1 when list changes size
  useEffect(() => { setCurrentPage(1); }, [driversMap.size]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const allDrivers = useMemo(() => {
    return Array.from(driversMap.values()).sort((a, b) => {
      // Sort: highest alert level first, then by heartbeat recency
      if (b.alertLevel !== a.alertLevel) return b.alertLevel - a.alertLevel;
      return new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime();
    });
  }, [driversMap]);

  const criticalCount = useMemo(() => allDrivers.filter(d => d.alertLevel === 3).length, [allDrivers]);
  const warningCount  = useMemo(() => allDrivers.filter(d => d.alertLevel === 2).length, [allDrivers]);
  const safeCount     = useMemo(() => allDrivers.filter(d => d.alertLevel === 0).length, [allDrivers]);

  const totalPages     = Math.ceil(allDrivers.length / ITEMS_PER_PAGE);
  const startIndex     = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedDrivers = allDrivers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const paginatedCritical = paginatedDrivers.filter(d => d.alertLevel === 3);
  const paginatedWarning  = paginatedDrivers.filter(d => d.alertLevel === 2);
  const paginatedLevel1   = paginatedDrivers.filter(d => d.alertLevel === 1);
  const paginatedSafe     = paginatedDrivers.filter(d => d.alertLevel === 0);

  // ── Sub-components ─────────────────────────────────────────────────────────

  const DriverMetaGrid = ({ alert, colorClass, borderClass }) => {
    if (!alert) return null;
    const meta = alert.meta || {};
    const eye   = coerceNumber(meta.eyeClosurePercentage);
    const mouth = coerceNumber(meta.mouthAspectRatio);
    const head  = coerceNumber(meta.headTiltAngle);
    const yawn  = coerceNumber(meta.yawnFrequency);
    return (
      <div className="grid grid-cols-2 gap-4 mb-4 md:grid-cols-4">
        {[
          { label: 'Eye Closure', value: `${eye}%`, pct: eye },
          { label: 'Mouth Ratio', value: mouth.toFixed(2), pct: mouth * 100 },
          { label: 'Head Tilt',   value: `${head}°`,  pct: (head / 45) * 100 },
          { label: 'Yawn Freq',   value: yawn,         pct: (yawn / 10) * 100 },
        ].map(({ label, value, pct }) => (
          <div key={label} className={`p-3 border-2 ${borderClass} ${colorClass} rounded-xl`}>
            <p className="mb-1 text-xs text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div className="h-full transition-all duration-300 bg-current rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const MovingBadge = ({ entry }) => {
    const moving = isLocationActive(entry.lastLocationAt);
    return (
      <span className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${moving ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        <Navigation size={10} />
        {moving ? 'Moving' : 'Stationary'}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-gray-800">Active Drowsiness Alerts</h1>
          <p className="text-gray-600">All drivers currently active — real-time heartbeat monitoring</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 border border-red-200 shadow-md bg-gradient-to-r from-red-50 to-rose-50 rounded-xl">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-red-700">{criticalCount} Critical</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border border-orange-200 shadow-md bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-orange-700">{warningCount} Warning</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border border-green-200 shadow-md bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-sm font-semibold text-green-700">{safeCount} Safe</span>
          </div>
        </div>
      </div>

      {/* ── Level 3 Critical ── */}
      {paginatedCritical.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={24} className="text-red-600" />
            <h2 className="text-xl font-bold text-red-600">Critical Alerts — Level 3</h2>
          </div>
          <p className="p-3 text-sm text-gray-600 border border-red-200 bg-red-50 rounded-xl">
            Emergency contact has been notified. Immediate intervention recommended.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedCritical.map((entry) => (
              <div key={entry.userId} className="p-6 transition-shadow duration-200 border-l-4 border-red-500 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-red-100 hover:shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-red-600 rounded-full shadow-md">
                      <AlertTriangle size={24} className="text-red-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900"><User size={16} />{entry.userName}</p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {entry.alert ? format(new Date(entry.alert.created_at), 'MMM dd, yyyy HH:mm:ss') : '—'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <MovingBadge entry={entry} />
                        {entry.alert?.location_text && (
                          <span className="text-xs text-gray-500">{entry.alert.location_text}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-red-600 to-red-700">CRITICAL</span>
                    {entry.alert?.meta?.emergencyContacted && (
                      <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-purple-600 to-purple-700">
                        <Bell size={10} /> Emergency Notified
                      </span>
                    )}
                  </div>
                </div>
                <DriverMetaGrid alert={entry.alert} colorClass="bg-gradient-to-br from-red-50 to-rose-50" borderClass="border-red-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Level 2 Warning ── */}
      {paginatedWarning.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={24} className="text-orange-600" />
            <h2 className="text-xl font-bold text-orange-600">Warning Alerts — Level 2</h2>
          </div>
          <p className="p-3 text-sm text-gray-600 border border-orange-200 bg-orange-50 rounded-xl">
            Moderate drowsiness detected. Alarm and voice warning activated.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedWarning.map((entry) => (
              <div key={entry.userId} className="p-6 transition-shadow duration-200 border-l-4 border-orange-500 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-orange-100 hover:shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-orange-600 rounded-full shadow-md">
                      <Bell size={24} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900"><User size={16} />{entry.userName}</p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {entry.alert ? format(new Date(entry.alert.created_at), 'MMM dd, yyyy HH:mm:ss') : '—'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <MovingBadge entry={entry} />
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-orange-600 to-orange-700">WARNING</span>
                </div>
                <DriverMetaGrid alert={entry.alert} colorClass="bg-gradient-to-br from-orange-50 to-amber-50" borderClass="border-orange-200" />
                <div className="flex items-center gap-4 pt-4 text-sm border-t border-gray-200">
                  <span className="px-2 py-1 text-xs text-blue-700 bg-blue-100 rounded">Alarm & Voice Alert Sent</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Level 1 ── */}
      {paginatedLevel1.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={24} className="text-yellow-600" />
            <h2 className="text-xl font-bold text-yellow-600">Level 1 Alerts</h2>
          </div>
          <p className="p-3 text-sm text-gray-600 border border-yellow-200 bg-yellow-50 rounded-xl">
            Mild drowsiness detected. Monitor driver behavior.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedLevel1.map((entry) => (
              <div key={entry.userId} className="p-6 transition-shadow duration-200 border-l-4 border-yellow-500 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-yellow-100 hover:shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-yellow-500 rounded-full shadow-md">
                      <Bell size={24} className="text-yellow-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900"><User size={16} />{entry.userName}</p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {entry.alert ? format(new Date(entry.alert.created_at), 'MMM dd, yyyy HH:mm:ss') : '—'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <MovingBadge entry={entry} />
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-yellow-500 to-yellow-600">LEVEL 1</span>
                </div>
                <DriverMetaGrid alert={entry.alert} colorClass="bg-gradient-to-br from-yellow-50 to-amber-50" borderClass="border-yellow-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Safe drivers ── */}
      {paginatedSafe.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={24} className="text-green-600" />
            <h2 className="text-xl font-bold text-green-600">Safe Drivers</h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {paginatedSafe.map((entry) => (
              <div key={entry.userId} className="flex items-center justify-between p-4 transition-shadow duration-200 border-l-4 border-green-400 shadow bg-white/95 backdrop-blur-sm rounded-2xl hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-white border-2 border-green-500 rounded-full shadow">
                    <CheckCircle size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-gray-900"><User size={14} />{entry.userName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <MovingBadge entry={entry} />
                      <span className="text-xs text-gray-500">
                        Heartbeat: {entry.lastHeartbeatAt ? format(new Date(entry.lastHeartbeatAt), 'HH:mm:ss') : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 text-xs font-bold text-white rounded-full bg-gradient-to-r from-green-500 to-green-600">SAFE</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {allDrivers.length === 0 && (
        <div className="p-12 text-center bg-white shadow-sm rounded-xl">
          <BellOff size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="mb-2 text-xl font-semibold text-gray-600">No Active Drivers</p>
          <p className="text-gray-500">No drivers are currently online. Drivers with an active heartbeat will appear here automatically.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, allDrivers.length)} of {allDrivers.length} drivers
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                className="flex items-center gap-1 px-4 py-2 text-white transition-all duration-200 rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed">
                <ChevronLeft size={16} /> Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg font-semibold transition-all duration-200 ${currentPage === page ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {page}
                  </button>
                ))}
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-4 py-2 text-white transition-all duration-200 rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}