import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Activity, AlertTriangle } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';


export function DashboardPage() {
  const getNowInManila = () => {
    // Force “now” to Asia/Manila even if admin PC is in another timezone
    const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    return new Date(s);
  };

const formatMonthLabel = (d) =>
  d.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short' }) +
  ' ' +
  d.toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric' });


  const formatMonthKey = (d) => {
    const year = d.toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric' });
    const month = d.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: '2-digit' });
    return `${year}-${month}`; // YYYY-MM
  };

  const MANILA_OFFSET_MIN = 8 * 60;

  const startOfMonthManilaUtc = (monthKey) => {
    const [y, m] = String(monthKey).split('-').map((x) => Number(x));
    // Manila 00:00 is UTC 16:00 previous day
    const utc = Date.UTC(y, (m - 1), 1, 0, 0, 0) - MANILA_OFFSET_MIN * 60 * 1000;
    return new Date(utc);
  };

  const endOfMonthManilaUtcExclusive = (monthKey) => {
    const [y, m] = String(monthKey).split('-').map((x) => Number(x));
    const utc = Date.UTC(y, (m - 1) + 1, 1, 0, 0, 0) - MANILA_OFFSET_MIN * 60 * 1000;
    return new Date(utc);
  };


  const now = getNowInManila();
  const currentMonthKey = formatMonthKey(now);

  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [reportsThisMonth, setReportsThisMonth] = useState(0);
    const [totalDriverUsers, setTotalDriverUsers] = useState(0);


  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [chartKey, setChartKey] = useState(0);

  // Chart-only controls (DO NOT affect "Reports This Month")
  const currentYear = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric' }));
  const currentMonth2 = now.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: '2-digit' }); // "01".."12"

  const [chartYear, setChartYear] = useState(currentYear);
  const [chartMonthKey, setChartMonthKey] = useState(currentMonthKey);

 const [monthlyUserData, setMonthlyUserData] = useState(() => {
  const arr = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(chartYear, m, 1, 0, 0, 0));
    arr.push({
      month: formatMonthLabel(d),
      monthKey: formatMonthKey(d),
      totalUsers: 0,
      activeUsers: 0,
      driverUsers: 0,
    });
  }
  return arr;
});


  const [drowsinessLevelData, setDrowsinessLevelData] = useState([
    { level: 'Level 1', count: 0 },
    { level: 'Level 2', count: 0 },
    { level: 'Level 3', count: 0 },
  ]);

  const [recentSummary, setRecentSummary] = useState({ l1: 0, l2: 0, l3: 0 });

  const selectedMonthLabel = useMemo(() => {
    const item = monthlyUserData.find((x) => x.monthKey === selectedMonthKey);
    return item?.month || formatMonthLabel(now);
  }, [monthlyUserData, selectedMonthKey]);
  
  const MonthlyTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #DBEAFE',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#111827' }}>Active Users: <b>{p.activeUsers ?? 0}</b></div>      </div>
    );
  };

    const selectedMonthStats = useMemo(() => {
    const item = monthlyUserData.find((x) => x.monthKey === chartMonthKey);
    return {
      totalUsers: item?.totalUsers || 0,
      activeUsers: item?.activeUsers || 0,
    };
  }, [monthlyUserData, chartMonthKey]);

    const barMonths = useMemo(() => {
    // show only months up to "currentMonthKey" (Manila) and take the last 4
    const idx = monthlyUserData.findIndex((m) => m.monthKey === currentMonthKey);
    const end = idx >= 0 ? idx + 1 : monthlyUserData.length; // inclusive end
    const start = Math.max(0, end - 4);
    return monthlyUserData.slice(start, end);
  }, [monthlyUserData, currentMonthKey]);

    const lineMonths = useMemo(() => {
    // If viewing current year, do NOT show future months (stop at current month).
    if (chartYear === currentYear) {
      const idx = monthlyUserData.findIndex((m) => m.monthKey === currentMonthKey);
      const end = idx >= 0 ? idx + 1 : monthlyUserData.length;
      return monthlyUserData.slice(0, end);
    }
    // Past years: show full year
    return monthlyUserData;
  }, [monthlyUserData, chartYear, currentYear, currentMonthKey]);



  // Fetch TOTAL users (all-time) from user_profiles_public
  const fetchTotalUsers = async () => {
    const { count, error } = await supabase
.from('user_profiles_public')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;
    setTotalUsers(count || 0);
  };

  // Active users (last 7 days) aligned with User Accounts:
  // Uses admin_get_user_accounts() which computes status from true auth.users.last_sign_in_at
  const fetchActiveUsers = async () => {
    const { data, error } = await supabase.rpc('admin_get_user_accounts');
    if (error) throw error;

    const activeCount = (data || []).filter((u) => u?.status === 'Active').length;
    setActiveUsers(activeCount);
  };

  const fetchTotalDriverUsers = async () => {
    const { data, error } = await supabase
      .from('driver_status')
      .select('user_id,mode')
      .eq('mode', 'driver');

    if (error) throw error;

    const set = new Set();
    for (const r of data || []) {
      if (r?.user_id) set.add(r.user_id);
    }
    setTotalDriverUsers(set.size);
  };

  // Build 12-month chart:
  // - total users per month from user_profiles.created_at
  // - active users per month from driver_status.last_heartbeat_at (distinct user_id)
  const fetchMonthlyUsersSeries = async (yearParam) => {
    const year = Number(yearParam);
    const firstKey = monthlyUserData?.[0]?.monthKey || currentMonthKey;
    const startIso = startOfMonthManilaUtc(firstKey).toISOString();

    // 1) TOTAL USERS (CUMULATIVE) per month
    // Use the same table you use for all-time Total Users so charts match the headline number.
  // We are charting the current Manila year Jan..Dec.
// So we need:
// 1) users created BEFORE Jan 1 (baseline running)
// 2) users created during the year (to distribute into months)

const yearStartKey = `${year}-01`;
const yearEndKey = `${year}-12`;
const yearStartIso = startOfMonthManilaUtc(yearStartKey).toISOString();
const yearEndIso = endOfMonthManilaUtcExclusive(yearEndKey).toISOString();

// baseline count: users created before year start
const baseRes = await supabase
  .from('user_profiles_public')
  .select('id', { count: 'exact', head: true })
  .lt('created_at', yearStartIso);

if (baseRes.error) throw baseRes.error;
const baseline = baseRes.count || 0;

// fetch users in the year for bucketing
const usersRes = await supabase
  .from('user_profiles_public')  
  .select('id, created_at')
  .gte('created_at', yearStartIso)
  .lt('created_at', yearEndIso);

if (usersRes.error) throw usersRes.error;



    if (usersRes.error) throw usersRes.error;

    // Count NEW users in each month, then turn that into a running total (cumulative)
    const newByMonth = new Map();
    for (const row of usersRes.data || []) {
      const t = row?.created_at ? new Date(row.created_at) : null;
      if (!t) continue;
      const mk = formatMonthKey(t);
      newByMonth.set(mk, (newByMonth.get(mk) || 0) + 1);
    }

    // 2) Active users per month (aligned with User Accounts: true sign-in based last_active_at)
    const activeRpc = await supabase.rpc('admin_get_user_accounts');
    if (activeRpc.error) throw activeRpc.error;

    // For each month, "active" means last_active_at is within the last 7 days of that month.
    const activeByMonth = new Map(); // mk -> count (we will store CUMULATIVE active)
    // Pre-parse last_active_at timestamps once
    const lastActiveRows = (activeRpc.data || [])
      .map((r) => ({
        id: r?.id,
        last_active_at: r?.last_active_at ? new Date(r.last_active_at) : null,
      }))
      .filter((r) => r.id && r.last_active_at && !Number.isNaN(r.last_active_at.getTime()));

    const monthsForYear = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(year, i, 1, 0, 0, 0));
      monthsForYear.push({
        month: formatMonthLabel(d),
        monthKey: formatMonthKey(d),
      });
    }

    for (const m of monthsForYear) {
      const mk = m.monthKey;
      const monthEndExclusive = endOfMonthManilaUtcExclusive(mk);

      // IMPORTANT:
      // - For the CURRENT month (current year + current month), use "now" as window end
      // - Otherwise use end-of-month
      const windowEnd = (year === currentYear && mk === currentMonthKey) ? now : monthEndExclusive;

      const cutoff = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      const set = new Set();
      for (const r of lastActiveRows) {
        const t = r.last_active_at;
        if (t && t >= cutoff && t < windowEnd) set.add(r.id);
      }
      activeByMonth.set(mk, set.size);    }
    // 3) Driver users per month (CUMULATIVE):
    // If drivers already existed before this year, monthly buckets can be 0 and bars won't show.
    // So we compute:
    // - baselineDrivers = distinct drivers before yearStart
    // - newDriversByMonth = first time we see a driver within the year (per user)
    // - driverUsers per month = cumulative baseline + new additions

    // 3A) Baseline drivers (before year start)
    const driverBaselineRes = await supabase
      .from('driver_status')
      .select('user_id')
      .eq('mode', 'driver')
      .lt('updated_at', yearStartIso);

    if (driverBaselineRes.error) throw driverBaselineRes.error;

    const baselineDriverSet = new Set();
    for (const r of driverBaselineRes.data || []) {
      if (r?.user_id) baselineDriverSet.add(r.user_id);
    }
    const baselineDrivers = baselineDriverSet.size;

    // 3B) Driver activity within the year — we assign each user to the month we FIRST see them in the year
    const driverRes = await supabase
      .from('driver_status')
      .select('user_id, updated_at')
      .eq('mode', 'driver')
      .gte('updated_at', yearStartIso)
      .lt('updated_at', yearEndIso);

    if (driverRes.error) throw driverRes.error;

    // user_id -> earliest updated_at within the year
    const firstSeenInYear = new Map();
    for (const row of driverRes.data || []) {
      if (!row?.user_id || !row?.updated_at) continue;
      const t = new Date(row.updated_at);
      if (Number.isNaN(t.getTime())) continue;

      const prev = firstSeenInYear.get(row.user_id);
      if (!prev || t < prev) firstSeenInYear.set(row.user_id, t);
    }

    // mk -> count of NEW drivers added in that month
    const newDriversByMonth = new Map();
    for (const [uid, t] of firstSeenInYear.entries()) {
      // If they already existed before year start, don't count as "new this year"
      if (baselineDriverSet.has(uid)) continue;
      const mk = formatMonthKey(t);
      newDriversByMonth.set(mk, (newDriversByMonth.get(mk) || 0) + 1);
    }

    // Build cumulative totals aligned to your existing month buckets
    setMonthlyUserData(() => {
      let runningUsers = baseline;
      let runningDrivers = baselineDrivers;

      return monthsForYear.map((m) => {
        runningUsers += newByMonth.get(m.monthKey) || 0;
        runningDrivers += newDriversByMonth.get(m.monthKey) || 0;

        return {
          month: m.month,
          monthKey: m.monthKey,
          totalUsers: runningUsers,
          activeUsers: activeByMonth.get(m.monthKey) || 0,
          driverUsers: runningDrivers,
        };
      });
    });
        setChartKey((k) => k + 1);


  };

// Fetch ALL-TIME alert level counts for the Pie Chart + Alert Summary
  const fetchAllTimeWarnings = async () => {
    const levelsRes = await supabase
      .from('driver_warnings')
      .select('level');

    if (levelsRes.error) throw levelsRes.error;

    let l1 = 0, l2 = 0, l3 = 0;
    for (const r of levelsRes.data || []) {
      if (r.level === 1) l1++;
      else if (r.level === 2) l2++;
      else if (r.level === 3) l3++;
    }

    setDrowsinessLevelData([
      { level: 'Level 1', count: l1 },
      { level: 'Level 2', count: l2 },
      { level: 'Level 3', count: l3 },
    ]);

    setRecentSummary({ l1, l2, l3 });
  };
  // For selected month: total reports + level distribution + recent summary
  const fetchSelectedMonthWarnings = async (monthKey) => {
    const from = startOfMonthManilaUtc(monthKey).toISOString();
    const to = endOfMonthManilaUtcExclusive(monthKey).toISOString();


    // total warnings this month
    const totalRes = await supabase
      .from('driver_warnings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', from)
      .lt('created_at', to);

    if (totalRes.error) throw totalRes.error;
    setReportsThisMonth(totalRes.count || 0);

    // Note: Pie chart + Alert Summary are all-time — see fetchAllTimeWarnings()
  };

  useEffect(() => {
    // Rebuild the 12-month skeleton when changing chart year
    const arr = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(chartYear, m, 1, 0, 0, 0));
      arr.push({
        month: formatMonthLabel(d),
        monthKey: formatMonthKey(d),
        totalUsers: 0,
        activeUsers: 0,
        driverUsers: 0,
      });
    }
    setMonthlyUserData(arr);

    // Chart month key: current month for current year, otherwise Dec of that year
    const nextChartMonthKey = (chartYear === currentYear) ? `${chartYear}-${currentMonth2}` : `${chartYear}-12`;
    setChartMonthKey(nextChartMonthKey);

    // Fetch series for the chosen year
    (async () => {
      try {
        await fetchMonthlyUsersSeries(chartYear);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[DashboardPage] chartYear fetch error:', e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartYear]);


  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await fetchTotalUsers();
        await fetchTotalDriverUsers();
        await fetchActiveUsers();
        await fetchSelectedMonthWarnings(currentMonthKey);
        await fetchAllTimeWarnings();
        if (!alive) return;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[DashboardPage] fetch error:', e?.message || String(e));
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refetch only the month-dependent boxes when selectedMonthKey changes
  useEffect(() => {
    (async () => {
      try {
        await fetchSelectedMonthWarnings(selectedMonthKey);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[DashboardPage] month fetch error:', e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthKey]);

  return (

    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 transition-all duration-200 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100 hover:shadow-xl hover:shadow-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl">
              <Users className="text-blue-600" size={24} />
            </div>
            <span className="px-2 py-1 text-sm font-semibold text-green-600 rounded-lg bg-green-50">+400</span>
          </div>
          <p className="mb-1 text-sm text-gray-600">Total Users</p>
          <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text">{totalUsers}</p>
        </div>

        <div className="p-6 transition-all duration-200 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100 hover:shadow-xl hover:shadow-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-green-100 to-green-200 rounded-xl">
              <Activity className="text-green-600" size={24} />
            </div>
            <span className="px-2 py-1 text-sm font-semibold text-green-600 rounded-lg bg-green-50">+400</span>
          </div>
          <p className="mb-1 text-sm text-gray-600">Active Users</p>
          <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-green-600 to-green-700 bg-clip-text">{activeUsers}</p>
        </div>

        <div className="p-6 transition-all duration-200 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100 hover:shadow-xl hover:shadow-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <span className="px-2 py-1 text-sm font-semibold text-green-600 rounded-lg bg-green-50">+12%</span>
          </div>
          <p className="mb-1 text-sm text-gray-600">Reports This Month</p>
          <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-purple-600 to-purple-700 bg-clip-text">{reportsThisMonth}</p>

        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* User Count Per Month */}
        <div className="p-6 border border-blue-100 shadow-lg lg:col-span-2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">User Count Per Month</h2>

            <select
              className="px-3 py-2 text-sm border border-blue-100 rounded-xl bg-white/95"
              value={chartYear}
              onChange={(e) => setChartYear(Number(e.target.value))}
            >
              {[0,1,2,3,4].map((i) => {
                const y = currentYear - i;
                return (
                  <option key={y} value={y}>{y}</option>
                );
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50 rounded-xl">
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-800">{selectedMonthStats.totalUsers}</p>

              <p className="text-sm font-semibold text-green-600">+400</p>
            </div>
            <div className="p-4 border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl">
              <p className="text-sm text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-gray-800">{selectedMonthStats.activeUsers}</p>
              <p className="text-sm font-semibold text-green-600">+400</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart key={chartKey} data={lineMonths}>


              <CartesianGrid strokeDasharray="3 3" stroke="#E0F2FE" />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} />
              <Tooltip 
                content={<MonthlyTooltip />}
                formatter={(value, name) => {
                  if (name === 'activeUsers') return [value, 'Active Users'];
                  return [value, name];
                }}              />

              <Line
                type="monotone"
                dataKey="activeUsers"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={{ fill: '#3B82F6', r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                isAnimationActive={true}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Total Driver Users */}
        <div className="p-6 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <h2 className="mb-4 text-xl font-bold text-gray-800">Total Driver Users</h2>
          <p className="mb-6 text-4xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text">{totalDriverUsers}</p>          <ResponsiveContainer width="100%" height={150}>
            <BarChart
              barCategoryGap={18}
              barGap={6}
              data={barMonths.map((d) => ({ ...d, driverUsers: Number(d?.driverUsers || 0) }))}
            >              <CartesianGrid strokeDasharray="3 3" stroke="#E0F2FE" />
              <XAxis dataKey="month" hide />
              <YAxis hide domain={[0, 'dataMax + 1']} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '12px',
                  border: '1px solid #DBEAFE',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                formatter={(value) => [value, 'Driver Users']}
              />
              <defs>
                <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>

              <Bar dataKey="driverUsers" fill="url(#blueGradient)" radius={[8, 8, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Drowsiness Alert Levels - Pie Chart */}
        <div className="p-6 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">Drowsiness Alert Levels</h2>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={drowsinessLevelData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ level, count }) => `${level}: ${count}`}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="count"
                >
                  <Cell fill="#FCD34D" />
                  <Cell fill="#FB923C" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    borderRadius: '12px', 
                    border: '1px solid #DBEAFE',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="p-4 mt-4 space-y-2 border border-blue-100 bg-blue-50 rounded-xl">
            <div className="text-xs text-gray-700">
              <p><span className="font-semibold">Level 1:</span> Voice warning</p>
              <p><span className="font-semibold">Level 2:</span> Alarm + voice warning</p>
              <p><span className="font-semibold">Level 3:</span> Emergency contact notified</p>
            </div>
          </div>
        </div>

        {/* Recent Reports Summary */}
        <div className="p-6 border border-blue-100 shadow-lg bg-white/95 backdrop-blur-sm rounded-2xl shadow-blue-100">
          <h2 className="text-xl font-bold text-gray-800">All-Time Alert Summary</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 transition-shadow duration-200 border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full shadow-md bg-gradient-to-br from-yellow-400 to-yellow-500">
                  1
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Level 1 Alerts</p>
                  <p className="text-xs text-gray-600">Voice warnings only</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{recentSummary.l1}</p>

            </div>

            <div className="flex items-center justify-between p-4 transition-shadow duration-200 border border-orange-300 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full shadow-md bg-gradient-to-br from-orange-500 to-orange-600">
                  2
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Level 2 Alerts</p>
                  <p className="text-xs text-gray-600">Alarm + voice warnings</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{recentSummary.l2}</p>

            </div>

            <div className="flex items-center justify-between p-4 transition-shadow duration-200 border border-red-300 bg-gradient-to-r from-red-50 to-rose-50 rounded-xl hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full shadow-md bg-gradient-to-br from-red-600 to-red-700">
                  3
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Level 3 Alerts</p>
                  <p className="text-xs text-gray-600">Emergency contacted</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{recentSummary.l3}</p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}