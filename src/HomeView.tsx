import { useMemo } from 'react';
import { CalendarDays, ChevronRight, Flame, PlusCircle, Target, Trophy, UserRound } from 'lucide-react';
import { computeBalance, statusFor, formatDaysSince, type BodyBalanceProps } from './BodyBalance';
import { summarizeSession, type SetRecord } from './exercises';

interface HomeLog {
  timestamp: string;
  member: string;
  muscles: string[];
  notes?: string;
  requestId?: string;
}

interface HomeViewProps extends BodyBalanceProps {
  me: string;
  logs: HomeLog[];
  sets: SetRecord[];
  loading: boolean;
  onLog: () => void;
  onOpenBalance: () => void;
  onOpenProgress: () => void;
  onChangeMe: () => void;
}

const MIN_WEEKLY_WORKOUTS = 3;

const addDays = (date: string, days: number) => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (date: string) => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return addDays(date, -((d.getUTCDay() + 6) % 7));
};
const daysBetween = (from: string, to: string) => {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function HomeView(props: HomeViewProps) {
  const { me, logs, sets, avatars, normalizeDate, today, loading, onLog, onOpenBalance, onOpenProgress, onChangeMe } = props;

  // This week's workouts and the streak of consecutive weeks hitting the target.
  const week = useMemo(() => {
    const dates = logs
      .filter((l) => l.member === me)
      .map((l) => normalizeDate(l.timestamp))
      .filter((d) => d && d <= today);
    const monday = mondayOf(today);
    const thisWeek = new Set(dates.filter((d) => d >= monday)).size;

    // Count back from last week while each week has >= target distinct days.
    const perWeek = new Map<string, Set<string>>();
    dates.forEach((d) => {
      const m = mondayOf(d);
      perWeek.set(m, (perWeek.get(m) || new Set()).add(d));
    });
    let streak = 0;
    let cursor = addDays(monday, -7);
    while ((perWeek.get(cursor)?.size || 0) >= MIN_WEEKLY_WORKOUTS) {
      streak += 1;
      cursor = addDays(cursor, -7);
    }
    // This week counts once it's reached the target.
    if (thisWeek >= MIN_WEEKLY_WORKOUTS) streak += 1;
    const streakAtRisk = streak > 0 && thisWeek < MIN_WEEKLY_WORKOUTS;
    const daysLeft = 6 - ((new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay() + 6) % 7);

    return { thisWeek, streak, streakAtRisk, daysLeft, monday };
  }, [logs, me, normalizeDate, today]);

  // What to train next: most-behind muscle groups this week, goal focus first.
  const trainNext = useMemo(
    () =>
      computeBalance(me, props, 'week')
        .filter((g) => g.ratio < 1)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, props.logs, props.goals, today]
  );

  // Last session for me.
  const last = useMemo(() => {
    const mine = logs
      .filter((l) => l.member === me)
      .map((l) => ({ ...l, date: normalizeDate(l.timestamp) }))
      .filter((l) => l.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    const log = mine[0];
    if (!log) return null;
    const bySetExercise = new Map<string, SetRecord[]>();
    sets.filter((s) => s.requestId === log.requestId).forEach((s) => bySetExercise.set(s.exercise, [...(bySetExercise.get(s.exercise) || []), s]));
    return { log, exercises: Array.from(bySetExercise.entries()), daysAgo: daysBetween(log.date, today) };
  }, [logs, sets, me, normalizeDate, today]);

  const prsThisWeek = useMemo(() => {
    // A PR this week = a set whose est. 1RM beats every earlier set of that exercise.
    const mine = sets.filter((s) => s.member === me);
    const e1 = (s: SetRecord) => (s.weight ? (s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30)) : s.reps);
    const names = new Set<string>();
    mine.filter((s) => s.date >= week.monday).forEach((s) => {
      const earlier = mine.filter((o) => o.exercise === s.exercise && o.date < s.date);
      if (earlier.length && e1(s) > Math.max(...earlier.map(e1))) names.add(s.exercise);
    });
    return Array.from(names);
  }, [sets, me, week.monday]);

  const weekPct = Math.min(100, (week.thisWeek / MIN_WEEKLY_WORKOUTS) * 100);

  return (
    <div className="space-y-4 text-left">
      {/* Greeting */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{greeting()},</p>
          <h2 className="text-3xl font-extrabold text-white flex items-center gap-2">
            <span aria-hidden="true">{avatars[me]}</span> {me}
          </h2>
        </div>
        <button
          type="button"
          onClick={onChangeMe}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800"
        >
          <UserRound className="w-3.5 h-3.5" /> Not you?
        </button>
      </div>

      {/* Hero: log button + this week */}
      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-900/60 via-slate-900 to-slate-900 p-5 shadow-xl shadow-emerald-950/40">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">This week</div>
            <div className="mt-1 text-3xl font-extrabold text-white">
              {week.thisWeek}<span className="text-lg text-slate-400 font-semibold"> / {MIN_WEEKLY_WORKOUTS} workouts</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {week.thisWeek >= MIN_WEEKLY_WORKOUTS
                ? 'Target hit. Anything more is a bonus.'
                : `${MIN_WEEKLY_WORKOUTS - week.thisWeek} more to hit target · ${week.daysLeft} day${week.daysLeft === 1 ? '' : 's'} left`}
            </div>
          </div>
          <div className={`text-center rounded-xl px-3 py-2 border ${week.streakAtRisk ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-700 bg-slate-950/60'}`}>
            <div className="flex items-center justify-center gap-1 text-2xl font-extrabold text-white">
              <Flame className={`w-5 h-5 ${week.streak > 0 ? 'text-orange-400' : 'text-slate-600'}`} /> {week.streak}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">week streak</div>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${weekPct}%` }} />
        </div>
        {week.streakAtRisk && (
          <p className="mt-2 text-xs text-amber-300">
            {week.daysLeft === 0 ? 'Last day to keep your streak.' : `${MIN_WEEKLY_WORKOUTS - week.thisWeek} more workout${MIN_WEEKLY_WORKOUTS - week.thisWeek === 1 ? '' : 's'} by Sunday to keep your streak.`}
          </p>
        )}
        <button
          type="button"
          onClick={onLog}
          className="mt-4 w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-lg shadow-lg shadow-emerald-900/40"
        >
          <PlusCircle className="w-6 h-6" /> Log Workout
        </button>
      </section>

      {prsThisWeek.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-sm text-amber-100">
            <span className="font-bold">New PR{prsThisWeek.length === 1 ? '' : 's'} this week:</span> {prsThisWeek.join(', ')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Train next */}
        <button
          type="button"
          onClick={onOpenBalance}
          className="text-left rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" /> Train next
            </h3>
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </div>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : trainNext.length === 0 ? (
            <p className="text-sm text-emerald-300">Every muscle group is on target this week. Nice.</p>
          ) : (
            <ul className="space-y-2">
              {trainNext.map((g) => {
                const st = statusFor(g.ratio);
                return (
                  <li key={g.name} className="flex items-center gap-3 text-sm">
                    <st.Icon className="w-4 h-4 shrink-0" style={{ color: st.fill }} aria-hidden="true" />
                    <span className="font-semibold text-white">{g.name}</span>
                    {g.isFocus && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">Goal</span>}
                    <span className="ml-auto text-xs text-slate-400">
                      {g.sessions}/{g.target} · {g.daysSince === null ? 'never' : formatDaysSince(g.daysSince).toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </button>

        {/* Last session */}
        <button
          type="button"
          onClick={onOpenProgress}
          className="text-left rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-400" /> Last session
            </h3>
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </div>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !last ? (
            <p className="text-sm text-slate-500">No workouts logged yet. Your first one starts the streak.</p>
          ) : (
            <div className="text-sm">
              <div className="text-slate-400">
                {last.daysAgo === 0 ? 'Today' : last.daysAgo === 1 ? 'Yesterday' : `${last.daysAgo} days ago`}
                <span className="text-slate-600"> · </span>
                <span className="text-emerald-300">{last.log.muscles.join(' · ')}</span>
              </div>
              {last.exercises.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {last.exercises.slice(0, 4).map(([name, s]) => (
                    <li key={name} className="flex justify-between gap-2">
                      <span className="text-white truncate">{name}</span>
                      <span className="text-slate-400 shrink-0">{summarizeSession(s)}</span>
                    </li>
                  ))}
                  {last.exercises.length > 4 && <li className="text-xs text-slate-500">+{last.exercises.length - 4} more</li>}
                </ul>
              ) : last.log.notes ? (
                <p className="mt-2 text-slate-300 line-clamp-3">{last.log.notes}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No sets logged. Add weight and reps next time to track records.</p>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
