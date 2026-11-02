import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Trophy,
  Dumbbell,
  CheckCircle2,
  PlusCircle,
  ChevronRight,
  X,
  User,
  RefreshCw,
  BrainCircuit,
  CalendarDays,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

const WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxJzIx6mspsMj8LCDY-p3dsIzSrWkj1l0hzQvbgkkzhlyuciasEACR2LZSo5wklX1W2Tw/exec';

const TIME_ZONE = 'Asia/Kolkata';

interface LogEntry {
  id?: number;
  requestId?: string;
  timestamp: string;
  member: string;
  notes: string;
  muscles: string[];
}

interface MuscleGroup {
  id: string;
  name: string;
  category: string;
}

interface MemberStat {
  member: string;
  distinctDays: number;
  distinctCoverage: number;
  trainedList: string[];
  muscleBreakdown: Record<string, number>;
  totalHits: number;
  totalWorkouts: number;
  avatar: string;
}

interface AiReport {
  overallAssessment?: string;
  goalAlignment?: {
    score: number | null;
    rating: string;
    explanation: string;
    supportingEvidence: string[];
    gaps: string[];
  };
  consistency?: {
    workouts: number;
    target: number;
    status: string;
    feedback: string;
  };
  trainingAnalysis?: {
    whatWentWell: string[];
    concerns: string[];
    muscleGroupAnalysis: string[];
    exerciseObservations: string[];
    dataLimitations: string[];
  };
  trends?: {
    weeklyComparison: string;
    longTermPattern: string;
    improvements: string[];
    declines: string[];
  };
  recommendations?: { priority: string; action: string; reason: string }[];
  nextWeekFocus?: string[];
  closingMessage?: string;
}

interface AiReportRecord {
  weekStart: string;
  weekEnd: string;
  member: string;
  report: AiReport | null;
  generatedAt: string;
  status: string;
}

const SQUAD_MEMBERS = [
  'Akshaj',
  'Sahan',
  'Vikrant',
  'Vishal',
  'Karthik',
  'Yathi',
  'Ronak',
];

const MUSCLE_GROUPS: MuscleGroup[] = [
  { id: 'chest', name: 'Chest', category: 'Upper' },
  { id: 'back', name: 'Back', category: 'Upper' },
  { id: 'shoulders', name: 'Shoulders', category: 'Upper' },
  { id: 'biceps', name: 'Biceps', category: 'Arms' },
  { id: 'triceps', name: 'Triceps', category: 'Arms' },
  { id: 'forearms', name: 'Forearms', category: 'Arms' },
  { id: 'quads', name: 'Quads', category: 'Lower' },
  { id: 'hamstrings', name: 'Hamstrings', category: 'Lower' },
  { id: 'glutes', name: 'Glutes', category: 'Lower' },
  { id: 'calves', name: 'Calves', category: 'Lower' },
  { id: 'abs', name: 'Abs', category: 'Core' },
  { id: 'obliques', name: 'Obliques', category: 'Core' },
  { id: 'cardio', name: 'Cardio', category: 'Endurance' },
];

const MEMBER_AVATARS: Record<string, string> = {
  Akshaj: '⚡',
  Sahan: '🔥',
  Vikrant: '🦾',
  Vishal: '🎯',
  Karthik: '👑',
  Yathi: '⚡',
  Ronak: '🔥',
};

// Convert UTC timestamp to Indian calendar date: YYYY-MM-DD.
const normalizeDate = (timestamp: string): string => {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  return `${year}-${month}-${day}`;
};

// Get current Indian date.
const getTodayDate = (): string => {
  return normalizeDate(new Date().toISOString());
};

// Monday to Sunday week range in Indian calendar.
const getCurrentWeekRange = () => {
  const today = getTodayDate();
  const [year, month, day] = today.split('-').map(Number);

  // Construct date using local calendar components.
  const current = new Date(year, month - 1, day);

  const dayOfWeek = current.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;

  return {
    start: format(monday),
    end: format(sunday),
  };
};

// Display date.
const formatDisplayDate = (date: string) => {
  if (!date) return '';

  const [year, month, day] = date.split('-');

  return `${day}/${month}/${year}`;
};

// Calculate member statistics.
const calculateMemberStats = (
  member: string,
  memberLogs: LogEntry[]
): MemberStat => {
  const validDates = memberLogs
    .map((log) => normalizeDate(log.timestamp))
    .filter(Boolean);

  const distinctDays = new Set(validDates).size;

  const trainedMusclesSet = new Set<string>();
  const muscleBreakdown: Record<string, number> = {};

  let totalHits = 0;

  memberLogs.forEach((log) => {
    (log.muscles || []).forEach((muscle) => {
      trainedMusclesSet.add(muscle);

      muscleBreakdown[muscle] = (muscleBreakdown[muscle] || 0) + 1;

      totalHits++;
    });
  });

  return {
    member,
    distinctDays,
    distinctCoverage: trainedMusclesSet.size,
    trainedList: Array.from(trainedMusclesSet),
    muscleBreakdown,
    totalHits,
    totalWorkouts: memberLogs.length,
    avatar: MEMBER_AVATARS[member] || '🏋️‍♂️',
  };
};

export default function App(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reports, setReports] = useState<AiReportRecord[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState('');
  const [selectedReportMember, setSelectedReportMember] = useState(SQUAD_MEMBERS[0]);
  const [selectedReportWeek, setSelectedReportWeek] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const pendingRequestIdRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'alltime' | 'reports' | 'log'>(
    'leaderboard'
  );

  const [timeFilter, setTimeFilter] = useState<'week' | 'alltime'>('week');

  const [selectedMemberModal, setSelectedMemberModal] =
    useState<MemberStat | null>(null);

  const [formMember, setFormMember] = useState(SQUAD_MEMBERS[0]);

  // Workout date defaults to today's date in India.
  const [formDate, setFormDate] = useState(getTodayDate());

  const [formMuscles, setFormMuscles] = useState<string[]>([]);

  const [formNotes, setFormNotes] = useState('');

  const [showToast, setShowToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch Google Sheets data.
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const separator = WEB_APP_URL.includes('?') ? '&' : '?';

      const response = await fetch(`${WEB_APP_URL}${separator}t=${Date.now()}`);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid Google Sheets response');
      }

      // Map actual Google Sheets response.
      const normalizedLogs: LogEntry[] = data.map(
        (item: any, index: number) => ({
          id: index,
          timestamp: String(item.timestamp ?? item.Timestamp ?? ''),
          member: String(item.member ?? item.Member ?? '').trim(),
          notes: String(item.notes ?? item.Notes ?? ''),
          requestId: String(item.requestId ?? item.RequestId ?? ''),
          muscles: Array.isArray(item.muscles)
            ? item.muscles
            : typeof item.muscles === 'string'
            ? item.muscles
                .split(',')
                .map((m: string) => m.trim())
                .filter(Boolean)
            : typeof item.Muscles === 'string'
            ? item.Muscles.split(',')
                .map((m: string) => m.trim())
                .filter(Boolean)
            : [],
        })
      );

      console.log('Google Sheets data:', normalizedLogs);

      console.log('This week range:', getCurrentWeekRange());

      normalizedLogs.forEach((log) => {
        console.log({
          member: log.member,
          timestamp: log.timestamp,
          indianDate: normalizeDate(log.timestamp),
        });
      });

      setLogs(normalizedLogs);
    } catch (error) {
      console.error('Failed to fetch Google Sheets:', error);

      setErrorMessage(
        'Unable to load Google Sheets data. Please check your Apps Script deployment.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Normalize Apps Script responses. Supports camelCase objects, sheet-header
  // keys, and Report JSON returned either as an object or a JSON string.
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError('');

    try {
      const separator = WEB_APP_URL.includes('?') ? '&' : '?';
      const url = `${WEB_APP_URL}${separator}action=reports&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 300)}`);
      }

      let payload: any;
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error(`Reports endpoint did not return JSON: ${responseText.slice(0, 300)}`);
      }

      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.reports)
          ? payload.reports
          : Array.isArray(payload?.data)
            ? payload.data
            : null;

      if (!rows) {
        throw new Error(`Unexpected reports response shape: ${JSON.stringify(payload).slice(0, 300)}`);
      }

      const read = (item: any, camel: string, sheetHeader: string, alternate?: string) =>
        item?.[camel] ?? item?.[sheetHeader] ?? (alternate ? item?.[alternate] : undefined);

      const parseReport = (item: any): AiReport | null => {
        const raw = read(item, 'report', 'Report JSON', 'reportJson');
        if (raw && typeof raw === 'object') return raw as AiReport;
        if (typeof raw === 'string' && raw.trim()) {
          try {
            return JSON.parse(raw) as AiReport;
          } catch (error) {
            console.warn('Could not parse report JSON for', item?.member ?? item?.Member, error);
          }
        }
        return null;
      };

      const normalizeWeek = (value: unknown) => {
        const text = String(value ?? '').trim();
        // Apps Script may serialize a Sheets date as yyyy-MM-ddTHH:mm:ss.
        return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
      };

      const normalized: AiReportRecord[] = rows.map((item: any) => ({
        weekStart: normalizeWeek(read(item, 'weekStart', 'Week Start')),
        weekEnd: normalizeWeek(read(item, 'weekEnd', 'Week End')),
        member: String(read(item, 'member', 'Member') ?? '').trim(),
        report: parseReport(item),
        generatedAt: String(read(item, 'generatedAt', 'Generated At') ?? ''),
        status: String(read(item, 'status', 'Status') ?? '').trim().toUpperCase(),
      })).filter((item: AiReportRecord) => item.member && item.weekStart);

      console.log('AI reports endpoint:', url);
      console.log('AI reports raw payload:', payload);
      console.log('AI reports normalized:', normalized);

      setReports(normalized);
      setSelectedReportWeek((current) => {
        const availableWeeks = Array.from(
          new Set(normalized.map((item) => item.weekStart).filter(Boolean))
        ).sort((a, b) => b.localeCompare(a));
        return current && availableWeeks.includes(current)
          ? current
          : availableWeeks[0] || '';
      });
    } catch (error) {
      console.error('Failed to fetch AI reports:', error);
      setReportsError(error instanceof Error ? error.message : 'Unknown error loading AI reports');
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Weekly / All-time filtering.
  const filteredLogs = useMemo(() => {
    if (timeFilter === 'week') {
      const { start, end } = getCurrentWeekRange();

      return logs.filter((log) => {
        const date = normalizeDate(log.timestamp);

        return date !== '' && date >= start && date <= end;
      });
    }

    return logs;
  }, [logs, timeFilter]);

  // Weekly member statistics.
  const memberStats = useMemo(() => {
    return SQUAD_MEMBERS.map((member) => {
      const memberLogs = filteredLogs.filter((log) => log.member === member);

      return calculateMemberStats(member, memberLogs);
    });
  }, [filteredLogs]);

  // All-time member statistics.
  const allTimeMemberStats = useMemo(() => {
    return SQUAD_MEMBERS.map((member) => {
      const memberLogs = logs.filter((log) => log.member === member);

      return calculateMemberStats(member, memberLogs);
    });
  }, [logs]);

  // Leaderboard sorting.
  const sortedLeaderboard = useMemo(() => {
    return [...memberStats].sort((a, b) => {
      if (b.distinctDays !== a.distinctDays) {
        return b.distinctDays - a.distinctDays;
      }

      if (b.distinctCoverage !== a.distinctCoverage) {
        return b.distinctCoverage - a.distinctCoverage;
      }

      return b.totalHits - a.totalHits;
    });
  }, [memberStats]);

  // Poll Google Sheets until the submitted request ID appears.
  // This verifies persistence without trying to read the opaque no-cors POST response.
  const verifyWorkoutSaved = async (requestId: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const separator = WEB_APP_URL.includes('?') ? '&' : '?';
      const response = await fetch(
        `${WEB_APP_URL}${separator}verify=${encodeURIComponent(requestId)}&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response while verifying the saved workout.');
      }

      if (data.some((item: any) => String(item.requestId ?? item.RequestId ?? '') === requestId)) {
        return true;
      }
    }

    return false;
  };

  // Submit workout and confirm that Google Sheets contains the new record.
  const handleLogSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formDate) {
      alert('Please select the workout date.');
      return;
    }

    if (formDate > getTodayDate()) {
      alert('Workout date cannot be in the future.');
      return;
    }

    if (formMuscles.length === 0) {
      alert('Select at least one muscle group!');
      return;
    }

    if (submitting) return;

    setSubmitting(true);
    setErrorMessage('');

    // Reuse the same ID if the user retries after a verification timeout.
    // Apps Script uses it to prevent duplicate rows.
    if (!pendingRequestIdRef.current) {
      pendingRequestIdRef.current = crypto.randomUUID();
    }
    const requestId = pendingRequestIdRef.current;

    const payload = {
      requestId,
      date: formDate,
      member: formMember,
      notes: formNotes,
      muscles: formMuscles,
    };

    try {
      // no-cors makes the POST response unreadable. We confirm the write by
      // polling doGet and looking for this unique requestId.
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const saved = await verifyWorkoutSaved(requestId);

      if (!saved) {
        throw new Error(
          'The workout was sent, but Google Sheets has not confirmed it yet. Refresh the data before submitting it again.'
        );
      }

      pendingRequestIdRef.current = null;
      setFormMuscles([]);
      setFormNotes('');
      setFormDate(getTodayDate());

      setShowToast(true);
      window.setTimeout(() => setShowToast(false), 3000);

      // Refresh from the source of truth; do not add an optimistic record.
      await fetchLogs();
    } catch (error) {
      console.error('Submission or verification failed:', error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to confirm that the workout was saved.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMuscle = (name: string) => {
    setFormMuscles((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  };

  const availableReportWeeks = useMemo(() => {
    return Array.from(
      new Set(reports.map((item) => item.weekStart).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const selectedWeekReports = useMemo(() => {
    return reports.filter((item) => item.weekStart === selectedReportWeek);
  }, [reports, selectedReportWeek]);

  const selectedMemberReport = selectedWeekReports.find(
    (item) => item.member === selectedReportMember
  );

  const successfulReportsCount = selectedWeekReports.filter(
    (item) => item.status === 'SUCCESS' && item.report
  ).length;

  const weekRange = getCurrentWeekRange();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 sticky top-0 z-50 flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <Dumbbell className="h-8 w-8 text-emerald-400" />

          <h1 className="text-xl font-bold tracking-wider text-white">
            GYM SQUAD TRACKER
          </h1>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'leaderboard'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Leaderboard
          </button>

          <button
            onClick={() => setActiveTab('alltime')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'alltime'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All-Time Person Dashboards
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeTab === 'reports'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            AI Reports
          </button>

          <button
            onClick={() => setActiveTab('log')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeTab === 'log'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Log Workout
          </button>

          <button
            onClick={() => {
              fetchLogs();
              fetchReports();
            }}
            disabled={loading || reportsLoading}
            className="px-3 py-2 rounded-lg text-sm bg-slate-800 text-emerald-400 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading || reportsLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 mt-6">
        {/* Toast */}
        {showToast && (
          <div className="mb-4 p-4 bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5" />
            Workout submitted successfully!
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl">
            {errorMessage}
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center bg-slate-900 border border-slate-800 rounded-2xl p-4 gap-3">
              <div>
                <span className="text-slate-400 text-sm font-medium">
                  Leaderboard Timeframe
                </span>

                <p className="text-xs text-slate-500 mt-1">
                  {formatDisplayDate(weekRange.start)} –{' '}
                  {formatDisplayDate(weekRange.end)}
                </p>
              </div>

              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex gap-1">
                <button
                  onClick={() => setTimeFilter('week')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                    timeFilter === 'week'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  This Week
                </button>

                <button
                  onClick={() => setTimeFilter('alltime')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                    timeFilter === 'alltime'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Time
                </button>
              </div>
            </div>

            {loading && (
              <p className="text-center text-slate-400 py-4">
                Loading Google Sheets data...
              </p>
            )}

            {!loading && filteredLogs.length === 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                <Dumbbell className="w-8 h-8 mx-auto mb-3 text-slate-600" />

                <p className="text-white font-semibold">
                  No workouts found for this week.
                </p>

                <p className="text-slate-400 text-sm mt-2">
                  {logs.length} records loaded from Google Sheets.
                </p>
              </div>
            )}

            {filteredLogs.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl">
                <span className="text-xs font-semibold text-emerald-400 tracking-widest uppercase">
                  Current Leader
                </span>

                <h2 className="text-3xl font-extrabold text-white mt-2 flex items-center gap-3">
                  {sortedLeaderboard[0].avatar}
                  {sortedLeaderboard[0].member}

                  <Trophy className="w-7 h-7 text-amber-400 fill-amber-400" />
                </h2>

                <p className="text-slate-400 text-sm mt-2">
                  {sortedLeaderboard[0].distinctDays} Active Days •{' '}
                  {sortedLeaderboard[0].distinctCoverage}/13 Muscle Groups
                  Covered
                </p>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                Squad Leaderboard
              </h3>

              <div className="space-y-3">
                {sortedLeaderboard.map((stat, idx) => (
                  <div
                    key={stat.member}
                    onClick={() => setSelectedMemberModal(stat)}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 hover:border-emerald-500/50 cursor-pointer transition group"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>

                      <div>
                        <span className="font-bold text-white text-lg group-hover:text-emerald-400">
                          {stat.avatar} {stat.member}
                        </span>

                        <div className="text-xs text-slate-400 flex gap-4 mt-1">
                          <span>{stat.totalWorkouts} Total Logs</span>
                          <span>{stat.totalHits} Muscle Hits</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">
                          Consistency
                        </span>

                        <span className="font-bold text-emerald-400">
                          {stat.distinctDays} Days
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">
                          Coverage
                        </span>

                        <span className="font-bold text-cyan-400">
                          {stat.distinctCoverage}/13
                        </span>
                      </div>

                      <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-emerald-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ALL-TIME DASHBOARDS */}
        {activeTab === 'alltime' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <User className="w-6 h-6 text-emerald-400" />
              All-Time Individual Person Dashboards
            </h2>

            <p className="text-slate-400 text-sm mb-6">
              Cumulative statistics across all logged workouts.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {allTimeMemberStats.map((stat) => (
                <div
                  key={stat.member}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/40 transition"
                >
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{stat.avatar}</span>

                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {stat.member}
                        </h3>

                        <span className="text-xs text-slate-400">
                          {stat.totalWorkouts} Lifetime Workouts
                        </span>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-emerald-400">
                      {stat.distinctCoverage}/13 Muscles Hit
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-900 p-3 rounded-xl">
                      <span className="text-xs text-slate-400 block">
                        Active Days
                      </span>

                      <span className="text-lg font-extrabold text-emerald-400">
                        {stat.distinctDays}
                      </span>
                    </div>

                    <div className="bg-slate-900 p-3 rounded-xl">
                      <span className="text-xs text-slate-400 block">
                        Total Muscle Hits
                      </span>

                      <span className="text-lg font-extrabold text-cyan-400">
                        {stat.totalHits}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                    Lifetime Muscle Hits
                  </h4>

                  <div className="grid grid-cols-3 gap-2">
                    {MUSCLE_GROUPS.map((mg) => {
                      const hits = stat.muscleBreakdown[mg.name] || 0;

                      return (
                        <div
                          key={mg.id}
                          className={`p-2 rounded-lg text-xs flex justify-between items-center border ${
                            hits > 0
                              ? 'bg-slate-900 border-emerald-500/30 text-slate-200'
                              : 'bg-slate-900/30 border-slate-800 text-slate-600'
                          }`}
                        >
                          <span>{mg.name}</span>

                          <span
                            className={`font-bold ${
                              hits > 0 ? 'text-emerald-400' : 'text-slate-600'
                            }`}
                          >
                            {hits}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI WEEKLY REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">AI-powered weekly review</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white">Squad Performance Reports</h2>
                <p className="text-slate-400 text-sm mt-2">Training consistency, goal alignment, trends and next-week actions.</p>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedReportWeek}
                  onChange={(e) => setSelectedReportWeek(e.target.value)}
                  disabled={availableReportWeeks.length === 0}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {availableReportWeeks.length === 0 && <option value="">No reports yet</option>}
                  {availableReportWeeks.map((week) => {
                    const weekEnd = reports.find((r) => r.weekStart === week)?.weekEnd || '';
                    return <option key={week} value={week}>{formatDisplayDate(week)}{weekEnd ? ` – ${formatDisplayDate(weekEnd)}` : ''}</option>;
                  })}
                </select>
                <button
                  onClick={fetchReports}
                  disabled={reportsLoading}
                  className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 disabled:opacity-50"
                  title="Refresh AI reports"
                >
                  <RefreshCw className={`w-4 h-4 ${reportsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {reportsLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
                Loading AI reports...
              </div>
            ) : reportsError ? (
              <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-6">
                <h3 className="font-bold text-red-300">Could not load AI reports</h3>
                <p className="text-sm text-slate-300 mt-2 break-words">{reportsError}</p>
                <button onClick={fetchReports} className="mt-4 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm">Try again</button>
              </div>
            ) : availableReportWeeks.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                <BrainCircuit className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <h3 className="text-lg font-bold text-white">No AI reports available yet</h3>
                <p className="text-sm text-slate-400 mt-2">Reports will appear here after the weekly report generator completes.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Reports generated</span>
                    <div className="text-2xl font-extrabold text-white mt-1">{successfulReportsCount}<span className="text-sm text-slate-500 font-medium"> / {SQUAD_MEMBERS.length}</span></div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <span className="text-xs text-slate-400">Members pending</span>
                    <div className="text-2xl font-extrabold text-amber-400 mt-1">{Math.max(0, SQUAD_MEMBERS.length - successfulReportsCount)}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 col-span-2">
                    <span className="text-xs text-slate-400">Report period</span>
                    <div className="text-lg font-bold text-white mt-1">{formatDisplayDate(selectedReportWeek)} – {formatDisplayDate(selectedWeekReports[0]?.weekEnd || '')}</div>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {SQUAD_MEMBERS.map((member) => {
                    const record = selectedWeekReports.find((item) => item.member === member);
                    const ready = record?.status === 'SUCCESS' && !!record.report;
                    return (
                      <button
                        key={member}
                        onClick={() => setSelectedReportMember(member)}
                        className={`shrink-0 rounded-xl border px-4 py-3 text-left transition ${selectedReportMember === member ? 'bg-emerald-500/15 border-emerald-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'}`}
                      >
                        <div className="font-semibold text-sm">{MEMBER_AVATARS[member]} {member}</div>
                        <div className={`text-[11px] mt-1 ${ready ? 'text-emerald-400' : record?.status === 'ERROR' ? 'text-red-400' : 'text-amber-400'}`}>
                          {ready ? 'Report ready' : record?.status === 'ERROR' ? 'Generation failed' : 'Pending'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!selectedMemberReport || selectedMemberReport.status !== 'SUCCESS' || !selectedMemberReport.report ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                    {selectedMemberReport?.status === 'ERROR' ? <AlertTriangle className="w-9 h-9 mx-auto mb-3 text-red-400" /> : <BrainCircuit className="w-9 h-9 mx-auto mb-3 text-slate-600" />}
                    <h3 className="text-lg font-bold text-white">{selectedMemberReport?.status === 'ERROR' ? 'Report generation failed' : 'Report not generated yet'}</h3>
                    <p className="text-sm text-slate-400 mt-2">{selectedMemberReport?.status === 'ERROR' ? 'The report can be retried from Apps Script. Other members’ reports remain available.' : 'This member’s report will appear once processing is complete.'}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {(() => {
                      const report = selectedMemberReport.report!;
                      const alignment = report.goalAlignment;
                      const consistency = report.consistency;
                      const training = report.trainingAnalysis;
                      const trends = report.trends;
                      const list = (items?: string[]) => (items || []).filter(Boolean);
                      return (
                        <>
                          <div className="bg-gradient-to-br from-emerald-950/70 to-slate-900 border border-emerald-500/30 rounded-2xl p-6">
                            <div className="flex flex-wrap justify-between items-start gap-3">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">{MEMBER_AVATARS[selectedReportMember]} {selectedReportMember} · Weekly assessment</div>
                                <h3 className="text-xl font-bold text-white mt-2">Overall assessment</h3>
                              </div>
                              <span className="text-xs text-slate-400">Generated {selectedMemberReport.generatedAt ? new Date(selectedMemberReport.generatedAt).toLocaleString('en-IN', { timeZone: TIME_ZONE }) : '—'}</span>
                            </div>
                            <p className="text-slate-200 leading-relaxed mt-4">{report.overallAssessment || 'No overall assessment provided.'}</p>
                            {report.closingMessage && <p className="text-emerald-300 text-sm font-medium mt-4">{report.closingMessage}</p>}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                              <div className="flex items-center gap-2 mb-4"><Target className="w-5 h-5 text-cyan-400" /><h4 className="font-bold text-white">Goal alignment</h4></div>
                              <div className="flex items-end gap-2">
                                <span className="text-4xl font-extrabold text-cyan-300">{alignment?.score ?? '—'}</span>
                                <span className="text-sm text-slate-500 mb-1">/ 100</span>
                                <span className="text-xs rounded-full bg-slate-800 px-2 py-1 text-slate-300 mb-1">{alignment?.rating || 'Not assessed'}</span>
                              </div>
                              <p className="text-sm text-slate-300 mt-3">{alignment?.explanation || 'No goal-alignment explanation available.'}</p>
                              {list(alignment?.supportingEvidence).length > 0 && <div className="mt-4"><p className="text-xs uppercase font-bold text-emerald-400 mb-2">Supporting evidence</p><ul className="space-y-2">{list(alignment?.supportingEvidence).map((item, i) => <li key={i} className="text-sm text-slate-300 flex gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />{item}</li>)}</ul></div>}
                              {list(alignment?.gaps).length > 0 && <div className="mt-4"><p className="text-xs uppercase font-bold text-amber-400 mb-2">Gaps</p><ul className="space-y-2">{list(alignment?.gaps).map((item, i) => <li key={i} className="text-sm text-slate-300 flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />{item}</li>)}</ul></div>}
                            </section>

                            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                              <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-emerald-400" /><h4 className="font-bold text-white">Consistency</h4></div>
                              <div className="flex items-baseline gap-2"><span className="text-4xl font-extrabold text-emerald-300">{consistency?.workouts ?? '—'}</span><span className="text-sm text-slate-400">/ {consistency?.target ?? 3} workouts</span></div>
                              <span className={`inline-flex mt-3 rounded-full px-3 py-1 text-xs font-semibold ${consistency?.status === 'On track' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{consistency?.status || 'Status unavailable'}</span>
                              <p className="text-sm text-slate-300 mt-3">{consistency?.feedback || 'No consistency feedback available.'}</p>
                            </section>
                          </div>

                          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="font-bold text-white mb-4">Training analysis</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              {[['What went well', training?.whatWentWell, 'text-emerald-400'], ['Concerns', training?.concerns, 'text-amber-400'], ['Muscle-group analysis', training?.muscleGroupAnalysis, 'text-cyan-400'], ['Exercise observations', training?.exerciseObservations, 'text-violet-400']].map(([title, items, color]: any) => (
                                <div key={title}><h5 className={`text-xs uppercase font-bold mb-2 ${color}`}>{title}</h5>{list(items).length ? <ul className="space-y-2">{list(items).map((item, i) => <li key={i} className="text-sm text-slate-300 leading-relaxed">• {item}</li>)}</ul> : <p className="text-sm text-slate-500">No observations recorded.</p>}</div>
                              ))}
                            </div>
                            {list(training?.dataLimitations).length > 0 && <div className="mt-5 border-t border-slate-800 pt-4"><p className="text-xs uppercase font-bold text-slate-500 mb-2">Data limitations</p>{list(training?.dataLimitations).map((item, i) => <p key={i} className="text-xs text-slate-400 mt-1">• {item}</p>)}</div>}
                          </section>

                          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="font-bold text-white mb-4">Progress & trends</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              <div><h5 className="text-xs uppercase font-bold text-cyan-400 mb-2">Week-on-week</h5><p className="text-sm text-slate-300 leading-relaxed">{trends?.weeklyComparison || 'Not enough data for comparison.'}</p></div>
                              <div><h5 className="text-xs uppercase font-bold text-violet-400 mb-2">Long-term pattern</h5><p className="text-sm text-slate-300 leading-relaxed">{trends?.longTermPattern || 'Not enough data for a long-term pattern.'}</p></div>
                              <div><h5 className="text-xs uppercase font-bold text-emerald-400 mb-2">Improvements</h5>{list(trends?.improvements).length ? list(trends?.improvements).map((item, i) => <p key={i} className="text-sm text-slate-300 mt-1">• {item}</p>) : <p className="text-sm text-slate-500">None identified.</p>}</div>
                              <div><h5 className="text-xs uppercase font-bold text-amber-400 mb-2">Declines / gaps</h5>{list(trends?.declines).length ? list(trends?.declines).map((item, i) => <p key={i} className="text-sm text-slate-300 mt-1">• {item}</p>) : <p className="text-sm text-slate-500">None identified.</p>}</div>
                            </div>
                          </section>

                          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="font-bold text-white mb-4">Recommendations</h4>
                            <div className="space-y-3">
                              {(report.recommendations || []).length ? report.recommendations!.map((item, i) => (
                                <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                                  <div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-sm font-semibold text-white">{item.action}</span><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${item.priority === 'High' ? 'bg-red-500/15 text-red-300' : item.priority === 'Medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{item.priority} priority</span></div>
                                  <p className="text-sm text-slate-400">{item.reason}</p>
                                </div>
                              )) : <p className="text-sm text-slate-500">No recommendations supplied.</p>}
                            </div>
                          </section>

                          <section className="bg-emerald-950/30 border border-emerald-500/25 rounded-2xl p-5">
                            <h4 className="font-bold text-emerald-300 mb-3">Next week focus</h4>
                            {list(report.nextWeekFocus).length ? <ul className="space-y-2">{list(report.nextWeekFocus).map((item, i) => <li key={i} className="text-sm text-slate-200 flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />{item}</li>)}</ul> : <p className="text-sm text-slate-400">No focus items provided.</p>}
                          </section>
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* LOG WORKOUT */}
        {activeTab === 'log' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-emerald-400" />
              Log Daily Workout
            </h2>

            <form onSubmit={handleLogSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="workout-date"
                  className="block text-sm font-semibold text-slate-300 mb-2"
                >
                  Workout Date
                </label>
                <input
                  id="workout-date"
                  type="date"
                  value={formDate}
                  max={getTodayDate()}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Defaults to today. You can select an earlier date to log a past workout.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Select Squad Member
                </label>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {SQUAD_MEMBERS.map((member) => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => setFormMember(member)}
                      className={`p-3 rounded-xl font-bold text-sm text-center border transition ${
                        formMember === member
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {MEMBER_AVATARS[member]} {member}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Targeted Muscle Groups ({formMuscles.length}/13)
                </label>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {MUSCLE_GROUPS.map((mg) => {
                    const selected = formMuscles.includes(mg.name);

                    return (
                      <button
                        key={mg.id}
                        type="button"
                        onClick={() => toggleMuscle(mg.name)}
                        className={`p-3 rounded-xl text-left text-sm font-medium border flex justify-between items-center transition ${
                          selected
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span>{mg.name}</span>

                        {selected && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Exercises / Notes (Optional)
                </label>

                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Bench press 4x8, Dips 3x10..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-lg rounded-xl transition disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Submit Workout Log'}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* MEMBER DETAIL MODAL */}
      {selectedMemberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl space-y-6">
            <button
              onClick={() => setSelectedMemberModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800/50 p-2 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4">
              <span className="text-4xl">{selectedMemberModal.avatar}</span>

              <div>
                <h3 className="text-2xl font-bold text-white">
                  {selectedMemberModal.member}'s Breakdown
                </h3>

                <p className="text-slate-400 text-sm">
                  {selectedMemberModal.distinctDays} Active Days •{' '}
                  {selectedMemberModal.distinctCoverage}/13 Muscle Groups Hit
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-emerald-400 uppercase mb-3">
                Targeted Muscles
              </h4>

              {Object.keys(selectedMemberModal.muscleBreakdown).length === 0 ? (
                <p className="text-slate-500 text-sm bg-slate-950 p-4 rounded-xl text-center">
                  No workouts logged yet for this period.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {Object.entries(selectedMemberModal.muscleBreakdown).map(
                    ([muscle, count]) => (
                      <div
                        key={muscle}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex justify-between items-center"
                      >
                        <span className="text-slate-200 text-sm font-medium">
                          {muscle}
                        </span>

                        <span className="text-emerald-400 text-xs font-bold">
                          {count} hit{count > 1 ? 's' : ''}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedMemberModal(null)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
