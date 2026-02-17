import { AlertTriangle, Bell, BellOff, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';

import { mockDrowsinessReports } from '../data/mockData';
import { format } from 'date-fns';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { supabase } from "../utils/supabaseClient";


export function ActiveAlertsPage() {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Active alerts keyed by driver (user_id). Value is the "active" warning record to display.
  const [activeMap, setActiveMap] = useState(() => new Map());

  // Cursor for polling new rows (created_at + id tie-break)
  const cursorRef = useRef({ createdAt: null, id: null });

  // Rolling window (last 24 hours)
  const windowHours = 24;

  const coerceNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const buildFullName = (first, last, email) => {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    const full = `${f}${f && l ? ' ' : ''}${l}`.trim();
    return full || String(email || '').trim() || 'Unknown';
  };

  const mapWarningToAlertShape = (row, profile) => {
    const meta = row?.meta || {};
    return {
      id: row.id,
      userId: row.user_id,
      drowsinessLevel: row.level,
      timestamp: row.created_at,
      userName: buildFullName(profile?.first_name, profile?.last_name, profile?.email),
      eyeClosurePercentage: coerceNumber(meta.eyeClosurePercentage, 0),
      mouthAspectRatio: coerceNumber(meta.mouthAspectRatio, 0),
      headTiltAngle: coerceNumber(meta.headTiltAngle, 0),
      yawnFrequency: coerceNumber(meta.yawnFrequency, 0),
      speed: coerceNumber(meta.speed, 0),
      emergencyContacted: !!meta.emergencyContacted,
      monitorType: row.monitor_type,
      locationText: row.location_text,
      snapshotUrl: row.snapshot_url,
    };
  };

  const shouldReplaceActive = (current, incoming) => {
    if (!current) return true;
    if (incoming.drowsinessLevel > current.drowsinessLevel) return true;
    if (incoming.drowsinessLevel < current.drowsinessLevel) return false;

    const a = new Date(incoming.timestamp).getTime();
    const b = new Date(current.timestamp).getTime();
    if (a > b) return true;
    if (a < b) return false;

    // Tie-breaker by id (string compare is OK for uuid for deterministic ordering)
    return String(incoming.id) > String(current.id);
  };

  const upsertActiveFromRows = useCallback((alertsFromRows) => {
    if (!alertsFromRows || alertsFromRows.length === 0) return;

    setActiveMap((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const incoming of alertsFromRows) {
        const key = incoming.userId;
        const current = next.get(key);
        if (shouldReplaceActive(current, incoming)) {
          next.set(key, incoming);
          changed = true;
        }
      }

      return changed ? next : prev;
    });

    // Advance cursor using newest row (max created_at, then max id)
    for (const a of alertsFromRows) {
      const cur = cursorRef.current;
      if (!cur.createdAt) {
        cur.createdAt = a.timestamp;
        cur.id = a.id;
        continue;
      }
      const at = new Date(a.timestamp).getTime();
      const ct = new Date(cur.createdAt).getTime();
      if (at > ct || (at === ct && String(a.id) > String(cur.id))) {
        cur.createdAt = a.timestamp;
        cur.id = a.id;
      }
    }
  }, []);

  const fetchProfilesByIds = async (userIds) => {
    if (!userIds || userIds.length === 0) return new Map();
    const { data, error } = await supabase
      .from('user_profiles_public')
      .select('id,email,first_name,last_name,avatar_url')
      .in('id', userIds);

    if (error) {
      console.log('[ActiveAlerts] profiles fetch error:', error.message);
      return new Map();
    }

    const map = new Map();
    (data || []).forEach((p) => map.set(p.id, p));
    return map;
  };

  const fetchWindow = useCallback(async () => {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('driver_warnings')
      .select('id,user_id,created_at,level,monitor_type,location_text,snapshot_url,meta')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      console.log('[ActiveAlerts] initial fetch error:', error.message);
      return;
    }

    const rows = data || [];
    const userIds = Array.from(new Set(rows.map(r => r.user_id)));
    const profiles = await fetchProfilesByIds(userIds);

    const alertsFromRows = rows.map((r) => mapWarningToAlertShape(r, profiles.get(r.user_id)));
    upsertActiveFromRows(alertsFromRows);
  }, [upsertActiveFromRows]);

  const pollNew = useCallback(async () => {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const cur = cursorRef.current;

    let query = supabase
      .from('driver_warnings')
      .select('id,user_id,created_at,level,monitor_type,location_text,snapshot_url,meta')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (cur.createdAt && cur.id) {
      query = query.or(`created_at.gt.${cur.createdAt},and(created_at.eq.${cur.createdAt},id.gt.${cur.id})`);
    }

    const { data, error } = await query;

    if (error) {
      console.log('[ActiveAlerts] poll error:', error.message);
      return;
    }

    const rows = data || [];
    if (rows.length === 0) return;

    const userIds = Array.from(new Set(rows.map(r => r.user_id)));
    const profiles = await fetchProfilesByIds(userIds);

    const alertsFromRows = rows.map((r) => mapWarningToAlertShape(r, profiles.get(r.user_id)));
    upsertActiveFromRows(alertsFromRows);
  }, [upsertActiveFromRows]);

  useEffect(() => {
    fetchWindow();
  }, [fetchWindow]);

  useEffect(() => {
    const channel = supabase
      .channel('driver_warnings_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_warnings' },
        async (payload) => {
          const r = payload?.new;
          if (!r) return;

          const profiles = await fetchProfilesByIds([r.user_id]);
          const alert = mapWarningToAlertShape(r, profiles.get(r.user_id));
          upsertActiveFromRows([alert]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertActiveFromRows]);

  useEffect(() => {
    const t = setInterval(() => {
      pollNew();
    }, 15000);

    return () => clearInterval(t);
  }, [pollNew]);

  // Sort by most recent first (across all levels)
  const alerts = useMemo(() => {
    return Array.from(activeMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activeMap]);


  const criticalAlerts = alerts.filter(a => a.drowsinessLevel === 3);
  const warningAlerts = alerts.filter(a => a.drowsinessLevel === 2);
  const level1Alerts = alerts.filter(a => a.drowsinessLevel === 1);


  // Pagination calculations
  const totalPages = Math.ceil(alerts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAlerts = alerts.slice(startIndex, endIndex);

  // Split paginated alerts by level
   const paginatedCritical = paginatedAlerts.filter(a => a.drowsinessLevel === 3);
  const paginatedWarning = paginatedAlerts.filter(a => a.drowsinessLevel === 2);
  const paginatedLevel1 = paginatedAlerts.filter(a => a.drowsinessLevel === 1);


  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const getLevelColor = (level) => {
    return level === 3 ? 'border-red-500 bg-red-50' : 'border-orange-500 bg-orange-50';
  };

  const getLevelIcon = (level) => {
    return level === 3 ? 'text-red-600' : 'text-orange-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-gray-800">Active Drowsiness Alerts</h1>
          <p className="text-gray-600">Real-time monitoring of critical and warning level drowsiness events</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 border border-red-200 shadow-md bg-gradient-to-r from-red-50 to-rose-50 rounded-xl">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-red-700">
              {criticalAlerts.length} Critical
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border border-orange-200 shadow-md bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl">
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-orange-700">
              {warningAlerts.length} Warning
            </span>
          </div>
        </div>
      </div>

      {/* Critical Alerts */}
      {paginatedCritical.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={24} className="text-red-600" />
            <h2 className="text-xl font-bold text-red-600">Critical Alerts - Level 3</h2>
          </div>
          <p className="p-3 mb-4 text-sm text-gray-600 border border-red-200 bg-red-50 rounded-xl">
            Emergency contact has been notified. Immediate intervention recommended.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedCritical.map((alert) => (
              <div
                key={alert.id}
                className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg shadow-red-100 p-6 border-l-4 border-red-500 hover:shadow-xl transition-shadow duration-200`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-red-600 rounded-full shadow-md">
                      <AlertTriangle size={24} className="text-red-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900">
                        <User size={16} />
                        {alert.userName}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-red-600 to-red-700">
                      CRITICAL
                    </span>
                    {alert.emergencyContacted && (
                      <span className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-purple-600 to-purple-700">
                        <Bell size={10} />
                        Emergency Notified
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 md:grid-cols-4">
                  <div className="p-3 border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Eye Closure</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.eyeClosurePercentage}%</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-red-600 rounded-full"
                        style={{ width: `${alert.eyeClosurePercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Mouth Ratio</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.mouthAspectRatio.toFixed(2)}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-red-600 rounded-full"
                        style={{ width: `${alert.mouthAspectRatio * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Head Tilt</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.headTiltAngle}°</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-red-600 rounded-full"
                        style={{ width: `${(alert.headTiltAngle / 45) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-red-200 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Yawn Frequency</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.yawnFrequency}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-red-600 rounded-full"
                        style={{ width: `${(alert.yawnFrequency / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}
      {/* Level 1 Alerts */}
      {paginatedLevel1.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={24} className="text-yellow-600" />
            <h2 className="text-xl font-bold text-yellow-600">Level 1 Alerts</h2>
          </div>
          <p className="p-3 mb-4 text-sm text-gray-600 border border-yellow-200 bg-yellow-50 rounded-xl">
            Mild drowsiness detected. Monitor driver behavior.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedLevel1.map((alert) => (
              <div
                key={alert.id}
                className="p-6 transition-shadow duration-200 border-l-4 border-yellow-500 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-yellow-100 hover:shadow-xl"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-yellow-600 rounded-full shadow-md">
                      <Bell size={24} className="text-yellow-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900">
                        <User size={16} />
                        {alert.userName}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-yellow-600 to-yellow-700">
                    LEVEL 1
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 md:grid-cols-4">
                  <div className="p-3 border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Eye Closure</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.eyeClosurePercentage}%</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-yellow-600 rounded-full"
                        style={{ width: `${alert.eyeClosurePercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Mouth Ratio</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.mouthAspectRatio.toFixed(2)}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-yellow-600 rounded-full"
                        style={{ width: `${alert.mouthAspectRatio * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Head Tilt</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.headTiltAngle}°</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-yellow-600 rounded-full"
                        style={{ width: `${(alert.headTiltAngle / 45) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Yawn Frequency</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.yawnFrequency}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-yellow-600 rounded-full"
                        style={{ width: `${(alert.yawnFrequency / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning Alerts */}
      {paginatedWarning.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={24} className="text-orange-600" />
            <h2 className="text-xl font-bold text-orange-600">Warning Alerts - Level 2</h2>
          </div>
          <p className="p-3 mb-4 text-sm text-gray-600 border border-orange-200 bg-orange-50 rounded-xl">
            Moderate drowsiness detected. Alarm and voice warning activated.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {paginatedWarning.map((alert) => (
              <div
                key={alert.id}
                className="p-6 transition-shadow duration-200 border-l-4 border-orange-500 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-orange-100 hover:shadow-xl"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-white border-2 border-orange-600 rounded-full shadow-md">
                      <Bell size={24} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="flex items-center gap-2 text-lg font-bold text-gray-900">
                        <User size={16} />
                        {alert.userName}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock size={14} />
                        {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-bold text-white rounded-full shadow-md bg-gradient-to-r from-orange-600 to-orange-700">
                    WARNING
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 md:grid-cols-4">
                  <div className="p-3 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Eye Closure</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.eyeClosurePercentage}%</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-orange-600 rounded-full"
                        style={{ width: `${alert.eyeClosurePercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Mouth Ratio</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.mouthAspectRatio.toFixed(2)}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-orange-600 rounded-full"
                        style={{ width: `${alert.mouthAspectRatio * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Head Tilt</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.headTiltAngle}°</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-orange-600 rounded-full"
                        style={{ width: `${(alert.headTiltAngle / 45) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-3 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl">
                    <p className="mb-1 text-xs text-gray-600">Yawn Frequency</p>
                    <p className="text-2xl font-bold text-gray-900">{alert.yawnFrequency}</p>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300 bg-orange-600 rounded-full"
                        style={{ width: `${(alert.yawnFrequency / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-4 text-sm border-t border-gray-200">
                  <span className="px-2 py-1 text-xs text-blue-700 bg-blue-100 rounded">
                    Alarm & Voice Alert Sent
                  </span>
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="p-12 text-center bg-white shadow-sm rounded-xl">
          <BellOff size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="mb-2 text-xl font-semibold text-gray-600">No Active Alerts</p>
          <p className="text-gray-500">All drivers are safe and alert. Level 2 and Level 3 alerts will appear here when detected.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1} to {Math.min(endIndex, alerts.length)} of {alerts.length} alerts
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-4 py-2 text-white transition-all duration-200 rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed hover:shadow-lg disabled:shadow-none"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-lg font-semibold transition-all duration-200 ${
                      currentPage === page
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-4 py-2 text-white transition-all duration-200 rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed hover:shadow-lg disabled:shadow-none"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>  
      )}
    </div>
  );
}
