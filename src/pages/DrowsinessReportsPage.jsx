import { useEffect, useMemo, useState } from 'react';
import { Calendar, Filter, AlertTriangle, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from '../utils/supabaseClient';

const ITEMS_PER_PAGE = 10;
export function DrowsinessReportsPage() {
  const [levelFilter, setLevelFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

    // ---------- Manila-safe date helpers (no future dates + correct day boundaries) ----------
  const MANILA_OFFSET_MIN = 8 * 60;

  const getTodayManilaDateStr = () => {
    const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const d = new Date(s);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // YYYY-MM-DD
  };

  const dayStartManilaUtc = (dateStr) => {
    const [y, m, d] = String(dateStr).split('-').map((x) => Number(x));
    const utc = Date.UTC(y, (m - 1), d, 0, 0, 0) - MANILA_OFFSET_MIN * 60 * 1000;
    return new Date(utc);
  };

  const dayEndManilaUtcExclusive = (dateStr) => {
    const start = dayStartManilaUtc(dateStr);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  };

  const todayMax = useMemo(() => getTodayManilaDateStr(), []);

  // ---------- DB-backed summary counts (Step 4) ----------
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCounts, setSummaryCounts] = useState({
    total: 0,
    level1: 0,
    level2: 0,
    level3: 0,
  });

  // ---------- DB-backed detailed reports list ----------
  const [reportsLoading, setReportsLoading] = useState(false);
  const [dbReports, setDbReports] = useState([]); // mapped to UI shape
  const [dbTotalCount, setDbTotalCount] = useState(0);
  const [dbFilteredTotalCount, setDbFilteredTotalCount] = useState(0);





const totalPages = Math.max(1, Math.ceil(dbFilteredTotalCount / ITEMS_PER_PAGE));
const paginatedReports = dbReports;


  // Reset to page 1 when filters change (must be useEffect, not useMemo)
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, levelFilter]);
  
    const buildCreatedAtFilters = () => {
    // Default: fetch all (no created_at filters)
    let fromIso = null;
    let toIsoExclusive = null;

    // If user picked start/end, we apply Manila day boundaries in UTC
    if (startDate) {
      const from = dayStartManilaUtc(startDate);
      fromIso = from.toISOString();
    }

    if (endDate) {
      const to = dayEndManilaUtcExclusive(endDate);
      toIsoExclusive = to.toISOString();
    }

    // If start > end, clamp end = start (keeps UI sane)
    if (startDate && endDate && startDate > endDate) {
      const to = dayEndManilaUtcExclusive(startDate);
      toIsoExclusive = to.toISOString();
    }

    return { fromIso, toIsoExclusive };
  };

  const fetchSummaryCounts = async () => {
    setSummaryLoading(true);
    try {
      const { fromIso, toIsoExclusive } = buildCreatedAtFilters();

      const base = () => {
        let q = supabase.from('driver_warnings').select('id', { count: 'exact', head: true });
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIsoExclusive) q = q.lt('created_at', toIsoExclusive);
        return q;
      };

      const [totalRes, l1Res, l2Res, l3Res] = await Promise.all([
        base(),
        base().eq('level', 1),
        base().eq('level', 2),
        base().eq('level', 3),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (l1Res.error) throw l1Res.error;
      if (l2Res.error) throw l2Res.error;
      if (l3Res.error) throw l3Res.error;

      setSummaryCounts({
        total: totalRes.count || 0,
        level1: l1Res.count || 0,
        level2: l2Res.count || 0,
        level3: l3Res.count || 0,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[DrowsinessReportsPage] fetchSummaryCounts error:', e?.message || String(e));
      setSummaryCounts({ total: 0, level1: 0, level2: 0, level3: 0 });
    } finally {
      setSummaryLoading(false);
    }
  };

  const mapWarningsGroupToUI = (warningsAtSameTimestamp, profileById) => {
        const firstRow = warningsAtSameTimestamp?.[0] || {};
    const profile = profileById.get(firstRow.user_id) || {};
    const first = (profile.first_name || '').trim();
    const last = (profile.last_name || '').trim();
    const email = (profile.email || '').trim();

    const userName = (first || last)
      ? `${first}${first && last ? ' ' : ''}${last}`.trim()
      : (email || 'Unknown User');

    const getNum = (obj, key) => {
      const v = obj ? obj[key] : null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };




    // Preserve your existing card logic: pick the highest level among the 4 rows (safest)
    const drowsinessLevel = warningsAtSameTimestamp.reduce((mx, w) => {
      const lv = Number(w?.level);
      return Number.isFinite(lv) ? Math.max(mx, lv) : mx;
    }, 1);

    // Best-effort carry location/snapshot (first non-empty)
    const locationText =
      warningsAtSameTimestamp.find((w) => (w.location_text || '').trim())?.location_text || '';
    const snapshotUrl =
      warningsAtSameTimestamp.find((w) => (w.snapshot_url || '').trim())?.snapshot_url || null;

    return {
      // One card id per (user_id + created_at) group
      id: `${firstRow.user_id || 'unknown'}|${firstRow.created_at || ''}`,
      userName,
      timestamp: firstRow.created_at,
      drowsinessLevel,
      locationText,
      monitorType: 'combined',
      snapshotUrl,

      emergencyContacted: false,
    };
  };


  const fetchReportsPage = async () => {
    setReportsLoading(true);
    try {
      const { fromIso, toIsoExclusive } = buildCreatedAtFilters();

      const fromRow = (currentPage - 1) * ITEMS_PER_PAGE;
      const toRow = fromRow + ITEMS_PER_PAGE - 1;

      // fetch a bigger pool so filtering doesn't create short pages
      const POOL_SIZE = 2000;
      const poolFrom = 0;
      const poolTo = POOL_SIZE - 1;      let q = supabase
        .from('driver_warnings')
        .select('id,user_id,created_at,level,monitor_type,location_text,snapshot_url,meta', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(poolFrom, poolTo);
      if (fromIso) q = q.gte('created_at', fromIso);
      if (toIsoExclusive) q = q.lt('created_at', toIsoExclusive);

      // Level filter applies to the list (not the summary cards)
      if (levelFilter !== 'all') {
        q = q.eq('level', Number(levelFilter));
      }

      const res = await q;
      if (res.error) throw res.error;

      const warnings = res.data || [];
      setDbTotalCount(res.count || 0);

      // Fetch public profiles for names (no FK join available here)
      const ids = Array.from(new Set(warnings.map((w) => w.user_id).filter(Boolean)));
      let profileById = new Map();

      if (ids.length) {
        const profilesRes = await supabase
          .from('user_profiles_public')
          .select('id,email,first_name,last_name,avatar_url')
          .in('id', ids);

        if (!profilesRes.error) {
          profileById = new Map((profilesRes.data || []).map((p) => [p.id, p]));
        }
      }
      // Group rows so ONE card represents ONE (user_id + 5-minute bucket)
      const BUCKET_MS = 5 * 60 * 1000;

      const bucketIso = (createdAtIso) => {
        const t = new Date(createdAtIso).getTime();
        const b = Math.floor(t / BUCKET_MS) * BUCKET_MS;
        return new Date(b).toISOString();
      };

      const groupsMap = new Map();
      for (const w of warnings) {
        const bIso = w.created_at ? bucketIso(w.created_at) : '';
        const key = `${w.user_id || 'unknown'}|${bIso}`;
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key).push(w);
      }

      // Ensure the timestamp shown is the latest row inside the bucket
      const grouped = Array.from(groupsMap.values()).map((groupRows) => {
        const sorted = [...groupRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return mapWarningsGroupToUI(sorted, profileById);
      });


      // Optional: keep dbTotalCount aligned to cards (not raw rows)
      setDbTotalCount(grouped.length);

      // No per-metric filtering anymore
      const filteredAll = grouped;

      // Update filtered total for pagination UI
      setDbFilteredTotalCount(filteredAll.length);

      // Paginate AFTER filtering so every page is full (until the last page)
      const pageItems = filteredAll.slice(fromRow, fromRow + ITEMS_PER_PAGE);
      setDbReports(pageItems);


     } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[DrowsinessReportsPage] fetchReportsPage error:', e?.message || String(e));
      setDbReports([]);
      setDbTotalCount(0);
      setDbFilteredTotalCount(0);

    } finally {
      setReportsLoading(false);
    }
  };

  // Step 4: Summary counts refetch when date range changes (default = all)
  useEffect(() => {
    fetchSummaryCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // Detailed list refetch when filters/page change
  useEffect(() => {
    fetchReportsPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, levelFilter, currentPage]);

   const summary = useMemo(() => {
    return {
      total: summaryCounts.total,
      level1: summaryCounts.level1,
      level2: summaryCounts.level2,
      level3: summaryCounts.level3,

      // Emergency calls: NOT YET (per your instruction)
      emergencyContacted: 0,
    };
  }, [summaryCounts]);



  const levelDistribution = [
    { level: 'Level 1', count: summary.level1, color: '#FCD34D' },
    { level: 'Level 2', count: summary.level2, color: '#FB923C' },
    { level: 'Level 3', count: summary.level3, color: '#EF4444' },
  ];




  const getLevelColor = (level) => {
    switch (level) {
      case 1: return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 2: return 'bg-orange-100 text-orange-700 border-orange-300';
      case 3: return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const handleExport = () => {
    const headers = [
      'User Name',
      'Date & Time',
      'Drowsiness Level',
      'Emergency Contacted'
    ];
const rows = dbReports.map(report => [

      report.userName,
      format(new Date(report.timestamp), 'MMM dd, yyyy HH:mm:ss'),
      report.drowsinessLevel,
      report.emergencyContacted ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `drowsiness_reports_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Drowsiness Reports Summary</h1>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 p-2 border border-blue-100 shadow-md bg-white/95 backdrop-blur-sm rounded-xl shadow-blue-100">
            <Calendar size={18} className="text-blue-600" />
        <input
  type="date"
  value={startDate}
  max={todayMax}
  onChange={(e) => setStartDate(e.target.value)}
  className="text-sm font-medium text-gray-700 bg-transparent border-none cursor-pointer focus:outline-none"
  placeholder="Start Date"
/>
<span className="text-gray-400">-</span>
<input
  type="date"
  value={endDate}
  max={todayMax}
  onChange={(e) => setEndDate(e.target.value)}
  className="text-sm font-medium text-gray-700 bg-transparent border-none cursor-pointer focus:outline-none"
  placeholder="End Date"
/>

          </div>

          <div className="flex items-center gap-2 p-2 border border-blue-100 shadow-md bg-white/95 backdrop-blur-sm rounded-xl shadow-blue-100">
            <Filter size={18} className="text-blue-600" />
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="text-sm font-medium text-gray-700 bg-transparent border-none cursor-pointer focus:outline-none">
              <option value="all">All Levels</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
            </select>
          </div>

          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 font-semibold text-white transition-all duration-200 shadow-md bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-blue-200">
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="p-6 transition-shadow duration-200 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100 hover:shadow-xl">
          <p className="mb-1 text-sm text-gray-600">Total Reports</p>
          <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text">{summary.total}</p>
        </div>
        <div className="p-6 transition-shadow duration-200 border border-yellow-200 shadow-lg bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl shadow-yellow-100 hover:shadow-xl">
          <p className="mb-1 text-sm font-semibold text-yellow-700">Level 1</p>
          <p className="text-3xl font-bold text-yellow-800">{summary.level1}</p>
        </div>
        <div className="p-6 transition-shadow duration-200 border border-orange-200 shadow-lg bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl shadow-orange-100 hover:shadow-xl">
          <p className="mb-1 text-sm font-semibold text-orange-700">Level 2</p>
          <p className="text-3xl font-bold text-orange-800">{summary.level2}</p>
        </div>
        <div className="p-6 transition-shadow duration-200 border border-red-200 shadow-lg bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl shadow-red-100 hover:shadow-xl">
          <p className="mb-1 text-sm font-semibold text-red-700">Level 3</p>
          <p className="text-3xl font-bold text-red-800">{summary.level3}</p>
        </div>
        <div className="p-6 transition-shadow duration-200 border border-purple-200 shadow-lg bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl shadow-purple-100 hover:shadow-xl">
          <p className="mb-1 text-sm font-semibold text-purple-700">Emergency Calls</p>
          <p className="text-3xl font-bold text-purple-800">{summary.emergencyContacted}</p>
        </div>
      </div>

      {/* Charts & Metrics */}
      <div className="grid grid-cols-1 gap-6">
        {/* Alert Level Distribution */}
        <div className="p-6 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <h2 className="mb-6 text-xl font-bold text-gray-800">Alert Level Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={levelDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0F2FE" />
              <XAxis dataKey="level" fontSize={12} stroke="#64748B" />
              <YAxis fontSize={12} stroke="#64748B" />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px', border: '1px solid #DBEAFE', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="count" barSize={200} radius={[8, 8, 0, 0]}>
                {levelDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>


      </div>

      {/* Detailed Reports */}
      <div className="p-6 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Detailed Reports</h2>
          {dbFilteredTotalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 transition-colors rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} className="text-gray-700" />
              </button>

              <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 transition-colors rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} className="text-gray-700" />
              </button>
            </div>
          )}

        </div>

        <div className="space-y-3">
          {dbReports.length > 0 ? paginatedReports.map((report) => (
                        <div key={report.id} className="p-4 transition-all duration-200 border border-blue-100 rounded-xl hover:bg-blue-50/50 hover:shadow-md">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 text-sm font-semibold text-white rounded-full shadow-md bg-gradient-to-br from-blue-400 to-blue-600">
                    {report.userName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{report.userName}</p>
                    <p className="text-xs text-gray-500">{format(new Date(report.timestamp), 'MMM dd, yyyy HH:mm:ss')}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getLevelColor(report.drowsinessLevel)}`}>Level {report.drowsinessLevel}</span>
              </div>



              {report.emergencyContacted && (
                <div className="flex items-center gap-2 p-2 mt-3 text-sm font-semibold text-red-600 border border-red-200 rounded-lg bg-red-50">
                  <AlertTriangle size={14} />
                  <span>Emergency contact notified</span>
                </div>
              )}
            </div>
          )) : (
            <div className="py-12 text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No reports found for the selected filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
