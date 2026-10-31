import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  Trophy,
  Dumbbell,
  CheckCircle2,
  PlusCircle,
  ChevronRight,
  X,
  User,
  RefreshCw,
} from 'lucide-react';

const WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxhCIcUzplENcBMRLrYqogofUm8yzT8M-bt-D6s04E4LjC4iaaJamqq565go9EESw9y7w/exec';

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const pendingRequestIdRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'alltime' | 'log'>(
    'leaderboard'
  );

  const [timeFilter, setTimeFilter] = useState<'week' | 'alltime'>('week');

  const [selectedMemberModal, setSelectedMemberModal] =
    useState<MemberStat | null>(null);

  const [formMember, setFormMember] = useState(SQUAD_MEMBERS[0]);

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
        `${WEB_APP_URL}${separator}verify=${encodeURIComponent(
          requestId
        )}&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response while verifying the saved workout.');
      }

      if (
        data.some(
          (item: any) =>
            String(item.requestId ?? item.RequestId ?? '') === requestId
        )
      ) {
        return true;
      }
    }

    return false;
  };

  // Submit workout and confirm that Google Sheets contains the new record.
  const handleLogSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

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
            onClick={fetchLogs}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-sm bg-slate-800 text-emerald-400 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

        {/* LOG WORKOUT */}
        {activeTab === 'log' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-emerald-400" />
              Log Daily Workout
            </h2>

            <form onSubmit={handleLogSubmit} className="space-y-6">
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
