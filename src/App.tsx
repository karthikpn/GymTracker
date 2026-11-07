import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Trophy,
  Dumbbell,
  CheckCircle2,
  PlusCircle,
  ChevronRight,
  ChevronDown,
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
  Trash2,
  PersonStanding,
} from 'lucide-react';
import BodyBalance from './BodyBalance';

const WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxAqsB3TankAM9IVWKts7yZuZNieijgBCm-0DoJaicEaTo0viw2_3c1Wr0V5obk-Z2q0A/exec';

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
  qualifyingWeeks?: number;
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

interface MemberGoal {
  member: string;
  primaryGoal: string;
  focusAreas: string;
  goalDescription: string;
}

const GOAL_FIELD_LIMITS = {
  primaryGoal: 120,
  focusAreas: 200,
  goalDescription: 1000,
};

const emptyGoal = (member: string): MemberGoal => ({
  member,
  primaryGoal: '',
  focusAreas: '',
  goalDescription: '',
});

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
  { id: 'legs', name: 'Legs', category: 'Lower' },
  { id: 'abs', name: 'Abs', category: 'Core' },
  { id: 'cardio', name: 'Cardio', category: 'Endurance' },
];

// Normalize older workout records so Quads, Hamstrings, Glutes and Calves
// all count as the single Legs category in the 8-group tracker.
const normalizeMuscleGroup = (muscle: string): string => {
  const normalized = muscle.trim().toLowerCase();
  if (['quads', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'legs', 'leg'].includes(normalized)) {
    return 'Legs';
  }
  const match = MUSCLE_GROUPS.find((group) => group.name.toLowerCase() === normalized);
  return match?.name || muscle;
};

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

// Human-friendly label for AI report week selectors.
const formatReportWeekLabel = (start: string, end: string) => {
  const parseDate = (value: string): Date | null => {
    if (!value || typeof value !== 'string') return null;

    // Prefer the date portion of ISO values to avoid timezone shifting.
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
      // Reject impossible dates such as 2026-02-31.
      if (
        date.getFullYear() === Number(year) &&
        date.getMonth() === Number(month) - 1 &&
        date.getDate() === Number(day)
      ) return date;
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const startDate = parseDate(start);
  if (!startDate) return 'Select a reporting week';

  const endDate = parseDate(end);
  const shortFormat = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  const fullFormat = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (!endDate) return fullFormat.format(startDate);
  if (startDate.getFullYear() !== endDate.getFullYear()) {
    return `${fullFormat.format(startDate)} – ${fullFormat.format(endDate)}`;
  }
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.getDate()} – ${fullFormat.format(endDate)}`;
  }
  return `${shortFormat.format(startDate)} – ${fullFormat.format(endDate)}`;
};

// Calculate member statistics.
// Count Monday-Sunday calendar weeks with at least 3 workouts.
const calculateQualifyingWeeks = (memberLogs: LogEntry[]): number => {
  const workoutsByWeek: Record<string, number> = {};

  memberLogs.forEach((log) => {
    const date = normalizeDate(log.timestamp);
    if (!date) return;

    const [year, month, day] = date.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = utcDate.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    utcDate.setUTCDate(utcDate.getUTCDate() - daysSinceMonday);

    const monday = [
      utcDate.getUTCFullYear(),
      String(utcDate.getUTCMonth() + 1).padStart(2, '0'),
      String(utcDate.getUTCDate()).padStart(2, '0'),
    ].join('-');

    workoutsByWeek[monday] = (workoutsByWeek[monday] || 0) + 1;
  });

  return Object.values(workoutsByWeek).filter((count) => count >= 3).length;
};

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
      const canonicalMuscle = normalizeMuscleGroup(muscle);
      trainedMusclesSet.add(canonicalMuscle);
      muscleBreakdown[canonicalMuscle] = (muscleBreakdown[canonicalMuscle] || 0) + 1;
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
  const [selectedReportMember, setSelectedReportMember] = useState(SQUAD_MEMBERS[0]);
  const [selectedReportWeek, setSelectedReportWeek] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);

  const [goals, setGoals] = useState<MemberGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalMember, setGoalMember] = useState(SQUAD_MEMBERS[0]);
  // Unsaved edits for the selected member; null means "show what's saved".
  const [goalDraft, setGoalDraft] = useState<MemberGoal | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalMessage, setGoalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'alltime' | 'balance' | 'reports' | 'goals' | 'log' | 'manage'>(
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

  // Fetch AI reports separately so report failures do not affect workout data.
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);

    try {
      const separator = WEB_APP_URL.includes('?') ? '&' : '?';
      const response = await fetch(
        `${WEB_APP_URL}${separator}action=reports&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid AI reports response');

      const normalized: AiReportRecord[] = data.map((item: any) => ({
        weekStart: String(item.weekStart ?? ''),
        weekEnd: String(item.weekEnd ?? ''),
        member: String(item.member ?? '').trim(),
        report: item.report && typeof item.report === 'object' ? item.report : null,
        generatedAt: String(item.generatedAt ?? ''),
        status: String(item.status ?? '').toUpperCase(),
      }));

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
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Fetch member goals from the "Member Goals" tab.
  const fetchGoals = useCallback(async (): Promise<MemberGoal[]> => {
    setGoalsLoading(true);

    try {
      const separator = WEB_APP_URL.includes('?') ? '&' : '?';
      const response = await fetch(
        `${WEB_APP_URL}${separator}action=goals&t=${Date.now()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid goals response');

      const normalized: MemberGoal[] = data.map((item: any) => ({
        member: String(item.member ?? '').trim(),
        primaryGoal: String(item.primaryGoal ?? ''),
        focusAreas: String(item.focusAreas ?? ''),
        goalDescription: String(item.goalDescription ?? ''),
      }));

      setGoals(normalized);
      return normalized;
    } catch (error) {
      console.error('Failed to fetch member goals:', error);
      return [];
    } finally {
      setGoalsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const savedGoalForMember = goals.find((goal) => goal.member === goalMember);
  const goalForm: MemberGoal = goalDraft ?? savedGoalForMember ?? emptyGoal(goalMember);
  const setGoalForm = (update: (current: MemberGoal) => MemberGoal) =>
    setGoalDraft(update(goalForm));

  const selectGoalMember = (member: string) => {
    if (member === goalMember) return;
    if (goalFormDirty && !window.confirm('Discard unsaved goal changes?')) return;
    setGoalMember(member);
    setGoalDraft(null);
    setGoalMessage(null);
  };
  const goalFormDirty =
    (savedGoalForMember?.primaryGoal ?? '') !== goalForm.primaryGoal ||
    (savedGoalForMember?.focusAreas ?? '') !== goalForm.focusAreas ||
    (savedGoalForMember?.goalDescription ?? '') !== goalForm.goalDescription;

  // Save a goal, then poll the sheet until the new values are visible.
  const handleGoalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (savingGoal) return;

    const payload = {
      action: 'updateGoal',
      member: goalMember,
      primaryGoal: goalForm.primaryGoal.trim(),
      focusAreas: goalForm.focusAreas.trim(),
      goalDescription: goalForm.goalDescription.trim(),
    };

    if (!payload.primaryGoal) {
      setGoalMessage({ type: 'error', text: 'Primary goal is required.' });
      return;
    }

    setSavingGoal(true);
    setGoalMessage(null);

    try {
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      let confirmed = false;
      for (let attempt = 0; attempt < 12 && !confirmed; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
        const latest = await fetchGoals();
        const saved = latest.find((goal) => goal.member === payload.member);
        confirmed =
          !!saved &&
          saved.primaryGoal.trim() === payload.primaryGoal &&
          saved.focusAreas.trim() === payload.focusAreas &&
          saved.goalDescription.trim() === payload.goalDescription;
      }

      if (!confirmed) {
        throw new Error('The goal was sent, but Google Sheets has not confirmed it yet. Refresh and check before saving again.');
      }

      setGoalDraft(null);
      setGoalMessage({ type: 'success', text: `${payload.member}'s goal saved to Google Sheets.` });
    } catch (error) {
      console.error('Goal save failed:', error);
      setGoalMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Unable to save goal.',
      });
    } finally {
      setSavingGoal(false);
    }
  };

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

  // All-time ranking prioritizes weeks with at least 3 workouts.
  const sortedLeaderboard = useMemo(() => {
    const stats = memberStats.map((stat) => ({
      ...stat,
      qualifyingWeeks:
        timeFilter === 'alltime'
          ? calculateQualifyingWeeks(logs.filter((log) => log.member === stat.member))
          : undefined,
    }));

    return stats.sort((a, b) => {
      if (timeFilter === 'alltime') {
        if (b.qualifyingWeeks !== a.qualifyingWeeks) {
          return (b.qualifyingWeeks || 0) - (a.qualifyingWeeks || 0);
        }
        if (b.distinctDays !== a.distinctDays) {
          return b.distinctDays - a.distinctDays;
        }
        return b.totalWorkouts - a.totalWorkouts;
      }
      if (b.distinctDays !== a.distinctDays) {
        return b.distinctDays - a.distinctDays;
      }
      if (b.distinctCoverage !== a.distinctCoverage) {
        return b.distinctCoverage - a.distinctCoverage;
      }
      return b.totalHits - a.totalHits;
    });
  }, [memberStats, logs, timeFilter]);

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

  // Delete a workout by its stable Request ID, then verify that it is gone.
  const handleDeleteWorkout = async (log: LogEntry) => {
    if (!log.requestId) {
      alert('This workout has no Request ID and cannot be safely deleted.');
      return;
    }

    const date = formatDisplayDate(normalizeDate(log.timestamp));
    const confirmed = window.confirm(
      `Delete this workout?\n\nMember: ${log.member}\nDate: ${date}\nMuscles: ${log.muscles.join(', ')}\n\nThis action cannot be undone.`
    );
    if (!confirmed || deletingRequestId) return;

    setDeletingRequestId(log.requestId);
    setErrorMessage('');

    try {
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteWorkout', requestId: log.requestId }),
      });

      let deleted = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
        const separator = WEB_APP_URL.includes('?') ? '&' : '?';
        const response = await fetch(
          `${WEB_APP_URL}${separator}action=verifyDeleted&requestId=${encodeURIComponent(log.requestId)}&t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!response.ok) continue;
        const result = await response.json();
        if (result.deleted === true) {
          deleted = true;
          break;
        }
      }

      if (!deleted) throw new Error('Google Sheets has not confirmed the deletion. Please refresh and check before retrying.');

      await fetchLogs();
      alert('Workout deleted successfully.');
    } catch (error) {
      console.error('Workout deletion failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete workout.');
    } finally {
      setDeletingRequestId(null);
    }
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
            onClick={() => setActiveTab('balance')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeTab === 'balance'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <PersonStanding className="w-4 h-4" />
            Body Balance
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
            onClick={() => setActiveTab('goals')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeTab === 'goals'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Target className="w-4 h-4" />
            Goals
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
              activeTab === 'manage'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Manage Workouts
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
              fetchGoals();
            }}
            disabled={loading || reportsLoading || goalsLoading}
            className="px-3 py-2 rounded-lg text-sm bg-slate-800 text-emerald-400 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading || reportsLoading || goalsLoading ? 'animate-spin' : ''}`} />
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
                  {timeFilter === 'week'
                    ? `${formatDisplayDate(weekRange.start)} – ${formatDisplayDate(weekRange.end)}`
                    : 'All recorded workout history'}
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
                  {timeFilter === 'alltime' ? (
                    <>
                      {sortedLeaderboard[0].qualifyingWeeks || 0} Qualifying Weeks •{' '}
                      {sortedLeaderboard[0].distinctDays} Active Days •{' '}
                      {sortedLeaderboard[0].totalWorkouts} Workouts
                    </>
                  ) : (
                    <>
                      {sortedLeaderboard[0].distinctDays} Active Days •{' '}
                      {sortedLeaderboard[0].distinctCoverage}/8 Muscle Groups Covered
                    </>
                  )}
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
                      {timeFilter === 'alltime' ? (
                        <>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">3+ Workout Weeks</span>
                            <span className="font-bold text-emerald-400">{stat.qualifyingWeeks || 0} Weeks</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Active Days</span>
                            <span className="font-bold text-cyan-400">{stat.distinctDays} Days</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Consistency</span>
                            <span className="font-bold text-emerald-400">{stat.distinctDays} Days</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">Coverage</span>
                            <span className="font-bold text-cyan-400">{stat.distinctCoverage}/8</span>
                          </div>
                        </>
                      )}
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
                      {stat.distinctCoverage}/8 Muscles Hit
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

        {/* BODY BALANCE */}
        {activeTab === 'balance' && (
          loading && logs.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Loading Google Sheets data...</p>
          ) : (
            <BodyBalance
              logs={logs}
              goals={goals}
              members={SQUAD_MEMBERS}
              muscleGroups={MUSCLE_GROUPS}
              avatars={MEMBER_AVATARS}
              normalizeDate={normalizeDate}
              normalizeMuscle={normalizeMuscleGroup}
              today={getTodayDate()}
            />
          )
        )}

        {/* AI WEEKLY REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <Sparkles className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">AI-powered weekly review</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white">Squad Performance Reports</h2>
                <p className="text-slate-400 text-sm mt-2">Training consistency, goal alignment, trends and next-week actions.</p>
              </div>

              <div className="flex items-stretch gap-2 w-full lg:w-auto">
                <div className="min-w-0 flex-1 lg:w-[350px] rounded-2xl border border-slate-700/80 bg-slate-900 p-3 shadow-lg shadow-black/10">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        <CalendarDays className="w-4 h-4" />
                      </span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Reporting week</p>
                        <p className="text-sm font-semibold text-white">
                          {formatReportWeekLabel(
                            selectedReportWeek,
                            selectedWeekReports[0]?.weekEnd || ''
                          )}
                        </p>
                      </div>
                    </div>
                    {availableReportWeeks.length > 0 && selectedReportWeek === availableReportWeeks[0] && (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                        Latest
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <select
                      aria-label="Choose AI report week"
                      value={selectedReportWeek}
                      onChange={(e) => setSelectedReportWeek(e.target.value)}
                      disabled={availableReportWeeks.length === 0}
                      className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pr-10 text-sm font-medium text-slate-200 outline-none transition hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]"
                    >
                      {availableReportWeeks.length === 0 && <option value="">No reports yet</option>}
                      {availableReportWeeks.map((week) => {
                        const weekEnd = reports.find((r) => r.weekStart === week)?.weekEnd || '';
                        return (
                          <option key={week} value={week}>
                            {formatReportWeekLabel(week, weekEnd)}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <button
                  onClick={fetchReports}
                  disabled={reportsLoading}
                  className="self-stretch rounded-2xl border border-slate-700 bg-slate-900 px-4 text-emerald-400 transition hover:border-emerald-500/50 hover:bg-slate-800 disabled:opacity-50"
                  title="Refresh AI reports"
                  aria-label="Refresh AI reports"
                >
                  <RefreshCw className={`h-5 w-5 ${reportsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {reportsLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
                Loading AI reports...
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
                    <div className="text-lg font-bold text-white mt-1">{formatReportWeekLabel(selectedReportWeek, selectedWeekReports[0]?.weekEnd || '')}</div>
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

        {/* MEMBER GOALS */}
        {activeTab === 'goals' && (
          <div className="space-y-6">
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Target className="w-6 h-6 text-emerald-400" />
                    Member Goals
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Saved to the Member Goals tab in Google Sheets. AI reports use these to score goal alignment.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
                {SQUAD_MEMBERS.map((member) => {
                  const hasGoal = !!goals.find((g) => g.member === member)?.primaryGoal;
                  return (
                    <button
                      key={member}
                      type="button"
                      onClick={() => selectGoalMember(member)}
                      disabled={savingGoal}
                      className={`p-3 rounded-xl font-bold text-sm text-center border transition disabled:opacity-60 ${
                        goalMember === member
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {MEMBER_AVATARS[member]} {member}
                      <span className={`block text-[10px] font-semibold mt-1 ${hasGoal ? 'text-emerald-500' : 'text-slate-600'}`}>
                        {hasGoal ? 'Goal set' : 'No goal'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {goalsLoading && goals.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Loading goals...</p>
              ) : (
                <form onSubmit={handleGoalSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="goal-primary" className="block text-sm font-semibold text-slate-300 mb-2">
                      Primary Goal
                    </label>
                    <input
                      id="goal-primary"
                      type="text"
                      value={goalForm.primaryGoal}
                      maxLength={GOAL_FIELD_LIMITS.primaryGoal}
                      onChange={(e) => setGoalForm((f) => ({ ...f, primaryGoal: e.target.value }))}
                      disabled={savingGoal}
                      placeholder="e.g. Build muscle, Lose fat, Improve endurance"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="goal-focus" className="block text-sm font-semibold text-slate-300 mb-2">
                      Focus Areas
                    </label>
                    <input
                      id="goal-focus"
                      type="text"
                      value={goalForm.focusAreas}
                      maxLength={GOAL_FIELD_LIMITS.focusAreas}
                      onChange={(e) => setGoalForm((f) => ({ ...f, focusAreas: e.target.value }))}
                      disabled={savingGoal}
                      placeholder="e.g. Chest, Back, Cardio"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {MUSCLE_GROUPS.map((mg) => {
                        const current = goalForm.focusAreas.split(',').map((x) => x.trim()).filter(Boolean);
                        const selected = current.some((x) => x.toLowerCase() === mg.name.toLowerCase());
                        return (
                          <button
                            key={mg.id}
                            type="button"
                            disabled={savingGoal}
                            onClick={() =>
                              setGoalForm((f) => {
                                const list = f.focusAreas.split(',').map((x) => x.trim()).filter(Boolean);
                                const next = selected
                                  ? list.filter((x) => x.toLowerCase() !== mg.name.toLowerCase())
                                  : [...list, mg.name];
                                return { ...f, focusAreas: next.join(', ') };
                              })
                            }
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                              selected
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            {mg.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="goal-description" className="block text-sm font-semibold text-slate-300 mb-2">
                      Goal Description
                    </label>
                    <textarea
                      id="goal-description"
                      value={goalForm.goalDescription}
                      maxLength={GOAL_FIELD_LIMITS.goalDescription}
                      onChange={(e) => setGoalForm((f) => ({ ...f, goalDescription: e.target.value }))}
                      disabled={savingGoal}
                      rows={4}
                      placeholder="What does success look like? Any targets, timelines or constraints."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-right">
                      {goalForm.goalDescription.length}/{GOAL_FIELD_LIMITS.goalDescription}
                    </p>
                  </div>

                  {goalMessage && (
                    <div
                      className={`p-3 rounded-xl text-sm border flex items-center gap-2 ${
                        goalMessage.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-red-500/10 border-red-500/30 text-red-300'
                      }`}
                    >
                      {goalMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {goalMessage.text}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={savingGoal || !goalFormDirty}
                      className="px-5 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingGoal ? 'Saving to Google Sheets...' : 'Save Goal'}
                    </button>
                    <button
                      type="button"
                      disabled={savingGoal || !goalFormDirty}
                      onClick={() => {
                        setGoalDraft(null);
                        setGoalMessage(null);
                      }}
                      className="px-5 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reset
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Squad Goals Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SQUAD_MEMBERS.map((member) => {
                  const goal = goals.find((g) => g.member === member);
                  return (
                    <button
                      key={member}
                      type="button"
                      onClick={() => selectGoalMember(member)}
                      disabled={savingGoal}
                      className="text-left bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-emerald-500/40 transition"
                    >
                      <div className="font-bold text-white">{MEMBER_AVATARS[member]} {member}</div>
                      {goal?.primaryGoal ? (
                        <>
                          <p className="text-sm text-emerald-300 mt-1">{goal.primaryGoal}</p>
                          {goal.focusAreas && <p className="text-xs text-cyan-400 mt-1">Focus: {goal.focusAreas}</p>}
                          {goal.goalDescription && <p className="text-sm text-slate-400 mt-2 break-words line-clamp-3">{goal.goalDescription}</p>}
                        </>
                      ) : (
                        <p className="text-sm text-slate-600 mt-1">No goal set yet. Click to add one.</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* MANAGE WORKOUTS */}
        {activeTab === 'manage' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Manage Workouts</h2>
                <p className="text-sm text-slate-400 mt-1">Review and delete any squad member's workout entry.</p>
              </div>
              <span className="text-xs text-slate-500">{logs.length} total entries</span>
            </div>

            {loading ? (
              <p className="text-center text-slate-400 py-8">Loading workouts...</p>
            ) : logs.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No workout entries found.</p>
            ) : (
              <div className="space-y-3">
                {[...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((log, index) => (
                  <div key={log.requestId || `${log.timestamp}-${log.member}-${index}`} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white">{MEMBER_AVATARS[log.member] || '🏋️'} {log.member}</span>
                        <span className="text-xs text-slate-500">{formatDisplayDate(normalizeDate(log.timestamp))}</span>
                      </div>
                      <p className="text-sm text-emerald-300 mt-1">{log.muscles.join(' · ') || 'No muscle groups'}</p>
                      {log.notes && <p className="text-sm text-slate-400 mt-1 break-words">{log.notes}</p>}
                      {!log.requestId && <p className="text-xs text-amber-400 mt-1">Missing Request ID — cannot safely delete this entry.</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteWorkout(log)}
                      disabled={!log.requestId || deletingRequestId !== null}
                      className="shrink-0 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Delete workout"
                    >
                      <Trash2 className="w-4 h-4" />
                      {deletingRequestId === log.requestId ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
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
                  Targeted Muscle Groups ({formMuscles.length}/8)
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
                  {selectedMemberModal.distinctCoverage}/8 Muscle Groups Hit
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