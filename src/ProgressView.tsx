import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Dumbbell, Minus, TrendingUp, Trophy } from 'lucide-react';
import {
  estimateOneRepMax,
  exerciseKey,
  formatKg,
  formatSet,
  type SetRecord,
} from './exercises';

interface ProgressViewProps {
  sets: SetRecord[];
  members: string[];
  avatars: Record<string, string>;
  today: string;
  loading: boolean;
}

/** One workout's result for one exercise. */
interface Session {
  requestId: string;
  date: string;
  sets: SetRecord[];
  bestE1rm: number;
  topWeight: number;
  topSet: SetRecord; // best set by e1RM (or most reps when bodyweight)
  maxReps: number;
  volume: number;
  isPr: boolean;
}

interface ExerciseSummary {
  key: string;
  name: string;
  muscle: string;
  sessions: Session[]; // oldest first
  best: Session;
  heaviest: number;
  bodyweightOnly: boolean;
  lastDate: string;
  recentPr: boolean;
  /** Change of the latest session vs the one before it: % for weighted, reps for bodyweight. null = only one session. */
  lastChange: number | null;
  /** Change of the latest session vs the first one (overall trend). */
  overallChange: number | null;
}

// Validated pair for the dark surface (dataviz validator: all checks pass).
const SERIES = {
  e1rm: { color: '#059669', label: 'Estimated 1RM' },
  top: { color: '#0284c7', label: 'Heaviest set' },
};

const daysBetween = (from: string, to: string) => {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
};

const shortDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Build per-exercise sessions for one member, flagging PR sessions. */
const buildSummaries = (sets: SetRecord[], member: string, today: string): ExerciseSummary[] => {
  const byExercise = new Map<string, SetRecord[]>();
  sets
    .filter((s) => s.member === member)
    .forEach((s) => {
      const key = exerciseKey(s.exercise);
      byExercise.set(key, [...(byExercise.get(key) || []), s]);
    });

  return Array.from(byExercise.entries())
    .map(([key, list]) => {
      const byWorkout = new Map<string, SetRecord[]>();
      list.forEach((s) => byWorkout.set(s.requestId, [...(byWorkout.get(s.requestId) || []), s]));

      const bodyweightOnly = list.every((s) => s.weight === 0);
      let runningBest = 0;

      const sessions: Session[] = Array.from(byWorkout.entries())
        .map(([requestId, workoutSets]) => {
          const sorted = [...workoutSets].sort((a, b) => a.setNumber - b.setNumber);
          const topSet = sorted.reduce((top, s) => {
            const score = bodyweightOnly ? s.reps : estimateOneRepMax(s.weight, s.reps);
            const topScore = bodyweightOnly ? top.reps : estimateOneRepMax(top.weight, top.reps);
            return score > topScore ? s : top;
          }, sorted[0]);
          return {
            requestId,
            date: sorted[0].date,
            sets: sorted,
            bestE1rm: Math.max(...sorted.map((s) => estimateOneRepMax(s.weight, s.reps))),
            topWeight: Math.max(...sorted.map((s) => s.weight)),
            topSet,
            maxReps: Math.max(...sorted.map((s) => s.reps)),
            volume: sorted.reduce((sum, s) => sum + s.weight * s.reps, 0),
            isPr: false,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

      // A PR is beating every earlier session (the first session isn't a PR).
      sessions.forEach((session, index) => {
        const score = bodyweightOnly ? session.maxReps : session.bestE1rm;
        if (index > 0 && score > runningBest) session.isPr = true;
        runningBest = Math.max(runningBest, score);
      });

      const best = sessions.reduce((top, s) =>
        (bodyweightOnly ? s.maxReps > top.maxReps : s.bestE1rm > top.bestE1rm) ? s : top
      );
      const last = sessions[sessions.length - 1];
      const scoreOf = (s: Session) => (bodyweightOnly ? s.maxReps : s.bestE1rm);
      const change = (from: Session, to: Session) => {
        if (bodyweightOnly) return scoreOf(to) - scoreOf(from);
        return scoreOf(from) > 0 ? ((scoreOf(to) - scoreOf(from)) / scoreOf(from)) * 100 : null;
      };

      return {
        key,
        name: list[list.length - 1].exercise,
        muscle: list[list.length - 1].muscle,
        sessions,
        best,
        heaviest: Math.max(...list.map((s) => s.weight)),
        bodyweightOnly,
        lastDate: last.date,
        recentPr: sessions.some((s) => s.isPr && daysBetween(s.date, today) <= 7),
        lastChange: sessions.length > 1 ? change(sessions[sessions.length - 2], last) : null,
        overallChange: sessions.length > 1 ? change(sessions[0], last) : null,
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const formatChange = (value: number | null, bodyweight: boolean) => {
  if (value === null) return null;
  const rounded = bodyweight ? Math.round(value) : Math.round(value * 10) / 10;
  if (rounded === 0) return { text: 'Same as last time', tone: 'flat' as const, Icon: Minus };
  const up = rounded > 0;
  const text = bodyweight
    ? `${up ? '+' : ''}${rounded} rep${Math.abs(rounded) === 1 ? '' : 's'}`
    : `${up ? '+' : ''}${formatKg(rounded)}%`;
  return { text, tone: up ? ('up' as const) : ('down' as const), Icon: up ? ArrowUpRight : ArrowDownRight };
};

const toneClass = {
  up: 'text-emerald-300',
  down: 'text-amber-300',
  flat: 'text-slate-400',
};

/** Sorts exercises by muscle group order, then by name. */
const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Abs', 'Cardio'];
const muscleRank = (m: string) => {
  const i = MUSCLE_ORDER.indexOf(m);
  return i === -1 ? 99 : i;
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const niceTicks = (min: number, max: number, count = 4) => {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) || raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
};

/* ------------------------------------------------------------------ */
/* Line chart: one series, big touch targets, tap-to-inspect           */
/* ------------------------------------------------------------------ */

function ProgressChart({ summary }: { summary: ExerciseSummary }) {
  const [wrapRef, measured] = useWidth<HTMLDivElement>();
  const width = measured || 320;
  const sessions = summary.sessions;
  // Default to the latest session so the chart always explains itself.
  const [selected, setSelected] = useState(sessions.length - 1);
  const values = sessions.map((s) => (summary.bodyweightOnly ? s.maxReps : s.bestE1rm));
  const unit = summary.bodyweightOnly ? 'reps' : 'kg';
  const seriesLabel = summary.bodyweightOnly ? 'Most reps in a set' : 'Estimated max (1 rep)';

  const height = 220;
  const margin = { top: 24, right: 14, bottom: 26, left: 36 };
  const innerW = Math.max(width - margin.left - margin.right, 10);
  const innerH = height - margin.top - margin.bottom;

  const ticks = niceTicks(Math.max(0, Math.min(...values) * 0.9), Math.max(...values) * 1.08, 3);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const firstDay = sessions[0].date;
  const spanDays = Math.max(daysBetween(firstDay, sessions[sessions.length - 1].date), 1);
  const x = (date: string) => (sessions.length === 1 ? innerW / 2 : (daysBetween(firstDay, date) / spanDays) * innerW);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const xLabels = sessions.length <= 1
    ? sessions
    : [sessions[0], sessions[Math.floor((sessions.length - 1) / 2)], sessions[sessions.length - 1]].filter(
        (s, i, arr) => arr.findIndex((o) => o.date === s.date) === i
      );

  const pick = (clientX: number, target: Element) => {
    const box = target.getBoundingClientRect();
    const px = clientX - box.left;
    let nearest = 0;
    sessions.forEach((s, i) => {
      if (Math.abs(x(s.date) - px) < Math.abs(x(sessions[nearest].date) - px)) nearest = i;
    });
    setSelected(nearest);
  };

  const sel = sessions[selected];
  const prev = selected > 0 ? sessions[selected - 1] : null;
  const selChange = prev
    ? formatChange(
        summary.bodyweightOnly
          ? values[selected] - values[selected - 1]
          : values[selected - 1] > 0 ? ((values[selected] - values[selected - 1]) / values[selected - 1]) * 100 : null,
        summary.bodyweightOnly
      )
    : null;

  const linePath = sessions.map((s, i) => `${i ? 'L' : 'M'}${x(s.date)},${y(values[i])}`).join(' ');
  const areaPath = sessions.length > 1
    ? `${linePath} L${x(sessions[sessions.length - 1].date)},${innerH} L${x(sessions[0].date)},${innerH} Z`
    : '';

  return (
    <div>
      {/* Selected session readout: sits above the chart, never covers it */}
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">
            {shortDate(sel.date)} {sel.isPr && <span className="text-amber-300 font-bold">· PR 🏆</span>}
          </div>
          <div className="text-2xl font-extrabold text-white leading-tight">
            {formatKg(Math.round(values[selected] * 10) / 10)} <span className="text-sm font-semibold text-slate-400">{unit}</span>
          </div>
          <div className="text-[11px] text-slate-400">{seriesLabel}</div>
        </div>
        <div className="text-right">
          {selChange ? (
            <div className={`inline-flex items-center gap-1 text-sm font-bold ${toneClass[selChange.tone]}`}>
              <selChange.Icon className="w-4 h-4" /> {selChange.text}
            </div>
          ) : (
            <div className="text-xs text-slate-500">First session</div>
          )}
          <div className="text-[11px] text-slate-500 mt-0.5">{sel.sets.map((set) => formatSet(set.weight, set.reps)).join(' · ')}</div>
        </div>
      </div>

      <div ref={wrapRef} className="relative -mx-1">
        {measured > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${summary.name} progress chart`} className="touch-pan-y">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="#1e293b" strokeWidth={1} />
                  <text x={-6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#64748b">
                    {formatKg(t)}
                  </text>
                </g>
              ))}
              {xLabels.map((s, i) => (
                <text
                  key={s.date}
                  x={x(s.date)}
                  y={innerH + 18}
                  textAnchor={xLabels.length > 1 && i === 0 ? 'start' : i === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'}
                  fontSize={10}
                  fill="#64748b"
                >
                  {shortDate(s.date)}
                </text>
              ))}

              {areaPath && <path d={areaPath} fill={SERIES.e1rm.color} fillOpacity={0.12} />}
              {sessions.length > 1 && (
                <path d={linePath} fill="none" stroke={SERIES.e1rm.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              )}

              {/* Selected marker */}
              <line x1={x(sel.date)} x2={x(sel.date)} y1={-8} y2={innerH} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />

              {sessions.map((s, i) => (
                <g key={s.requestId}>
                  <circle
                    cx={x(s.date)}
                    cy={y(values[i])}
                    r={i === selected ? 7 : 4.5}
                    fill={i === selected ? '#ffffff' : SERIES.e1rm.color}
                    stroke={i === selected ? SERIES.e1rm.color : '#0f172a'}
                    strokeWidth={i === selected ? 3 : 2}
                  />
                  {s.isPr && (
                    <text x={x(s.date)} y={y(values[i]) - 13} textAnchor="middle" fontSize={11}>
                      🏆
                    </text>
                  )}
                </g>
              ))}

              <rect
                x={-margin.left}
                y={-margin.top}
                width={innerW + margin.left + margin.right}
                height={innerH + margin.top}
                fill="transparent"
                onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
                onClick={(e) => pick(e.clientX, e.currentTarget)}
                onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget)}
                onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget)}
              />
            </g>
          </svg>
        )}
      </div>
      <p className="text-[11px] text-slate-500 text-center mt-1">Tap or drag on the chart to see each session</p>

      <details className="mt-3 group">
        <summary className="list-none cursor-pointer text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" /> All sessions
        </summary>
        <ul className="mt-2 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
          {[...sessions].reverse().map((sess) => {
            const i = sessions.indexOf(sess);
            return (
              <li key={sess.requestId} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-400 w-14 shrink-0">{shortDate(sess.date)}</span>
                <span className="flex-1 min-w-0 truncate text-slate-300">{sess.sets.map((set) => formatSet(set.weight, set.reps)).join(', ')}</span>
                <span className="font-semibold text-white shrink-0">
                  {formatKg(Math.round(values[i] * 10) / 10)} {unit} {sess.isPr && '🏆'}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function ProgressView({ sets, members, avatars, today, loading }: ProgressViewProps) {
  const [member, setMember] = useState(members[0]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null); // null = default (first group open)
  const [showAllPrs, setShowAllPrs] = useState(false);
  const chartRef = useRef<HTMLElement>(null);

  const summaries = useMemo(
    () => buildSummaries(sets, member, today).sort((a, b) => muscleRank(a.muscle) - muscleRank(b.muscle) || a.name.localeCompare(b.name)),
    [sets, member, today]
  );
  const selected = summaries.find((s) => s.key === selectedKey) || summaries[0];

  // Headline numbers for the member.
  const stats = useMemo(() => {
    const allSessions = summaries.flatMap((s) => s.sessions);
    const sessionIds = new Set(allSessions.map((s) => s.requestId));
    const prsLast30 = allSessions.filter((s) => s.isPr && daysBetween(s.date, today) <= 30).length;
    const improving = summaries.filter((s) => s.overallChange !== null && s.overallChange > 0).length;
    const tracked = summaries.filter((s) => s.sessions.length > 1).length;
    const volume7 = sets
      .filter((s) => s.member === member && daysBetween(s.date, today) <= 6)
      .reduce((sum, s) => sum + s.weight * s.reps, 0);
    return { workouts: sessionIds.size, prsLast30, improving, tracked, volume7 };
  }, [summaries, sets, member, today]);

  // Squad-wide PR feed for the last 30 days.
  const recentPrs = useMemo(
    () =>
      members
        .flatMap((m) =>
          buildSummaries(sets, m, today).flatMap((summary) =>
            summary.sessions
              .filter((s) => s.isPr && daysBetween(s.date, today) <= 30)
              .map((s) => ({ member: m, summary, session: s }))
          )
        )
        .sort((a, b) => b.session.date.localeCompare(a.session.date))
        .slice(0, 20),
    [sets, members, today]
  );
  const visiblePrs = showAllPrs ? recentPrs : recentPrs.slice(0, 4);

  // Lifts grouped by muscle, in a fixed order.
  const groups = useMemo(() => {
    const map = new Map<string, ExerciseSummary[]>();
    summaries.forEach((s) => {
      const key = s.muscle || 'Other';
      map.set(key, [...(map.get(key) || []), s]);
    });
    return Array.from(map.entries()).map(([muscle, items]) => ({
      muscle,
      items,
      prs: items.filter((i) => i.recentPr).length,
      improving: items.filter((i) => i.lastChange !== null && i.lastChange > 0).length,
    }));
  }, [summaries]);

  const isOpen = (muscle: string) => (openGroups ? openGroups.has(muscle) : groups[0]?.muscle === muscle);
  const toggleGroup = (muscle: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev ?? (groups[0] ? [groups[0].muscle] : []));
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return next;
    });

  const chooseExercise = (key: string) => {
    setSelectedKey(key);
    // On phones the chart is above the list, so bring it into view.
    if (window.innerWidth < 1024) chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-5 text-left">
      <div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-emerald-400" /> Progress
        </h2>
        <p className="text-slate-400 text-sm mt-1">Are you getting stronger? Records and trends from your logged sets.</p>
      </div>

      {/* Member picker: one swipeable row on phones */}
      <div className="flex md:grid md:grid-cols-7 gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 snap-x">
        {members.map((m) => (
          <button
            key={m}
            onClick={() => { setMember(m); setSelectedKey(null); setOpenGroups(null); }}
            className={`shrink-0 snap-start px-4 py-2.5 rounded-xl font-bold text-sm text-center border transition whitespace-nowrap ${
              member === m
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {avatars[m]} {m}
          </button>
        ))}
      </div>

      {loading && sets.length === 0 ? (
        <p className="text-center text-slate-400 py-8">Loading sets...</p>
      ) : summaries.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <Dumbbell className="w-8 h-8 mx-auto mb-3 text-slate-600" />
          <p className="text-white font-semibold">No sets logged for {member} yet.</p>
          <p className="text-slate-400 text-sm mt-2">Add exercises with weight and reps in Log Workout to start tracking records.</p>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-amber-300/80 font-semibold">PRs · 30d</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 flex items-center gap-1.5">
                {stats.prsLast30} <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Improving</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {stats.improving}<span className="text-sm sm:text-base text-slate-500 font-semibold">/{stats.tracked}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Lifted · 7d</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {stats.volume7 >= 1000 ? `${(stats.volume7 / 1000).toFixed(1)}t` : `${formatKg(Math.round(stats.volume7))}`}
                {stats.volume7 < 1000 && <span className="text-sm sm:text-base text-slate-500 font-semibold"> kg</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
            {/* Chart */}
            <section ref={chartRef} className="lg:col-span-3 lg:order-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 min-w-0 scroll-mt-20">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{selected.name}</h3>
                  <div className="text-xs text-slate-500">
                    {selected.muscle || 'No group'} · {selected.sessions.length} session{selected.sessions.length === 1 ? '' : 's'}
                    {!selected.bodyweightOnly && ` · heaviest ${formatKg(selected.heaviest)} kg`}
                  </div>
                </div>
                <div className="relative shrink-0">
                  <select
                    value={selected.key}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    aria-label="Exercise"
                    className="appearance-none bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[11rem] truncate"
                  >
                    {summaries.map((s) => (
                      <option key={s.key} value={s.key}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <ProgressChart key={`${member}-${selected.key}`} summary={selected} />
            </section>

            {/* Lifts, grouped by muscle */}
            <section className="lg:col-span-2 lg:order-1">
              <div className="flex items-baseline justify-between px-1 mb-2">
                <h3 className="text-lg font-bold text-white">Your lifts</h3>
                <span className="text-[11px] text-slate-500">Tap a lift to chart it</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden">
                {groups.map((g) => {
                  const open = isOpen(g.muscle);
                  return (
                    <div key={g.muscle}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.muscle)}
                        aria-expanded={open}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40"
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`} />
                        <span className="flex-1 font-semibold text-white">{g.muscle}</span>
                        {g.prs > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                            <Trophy className="w-3 h-3" /> {g.prs} PR{g.prs === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">{g.items.length} lift{g.items.length === 1 ? '' : 's'}</span>
                      </button>

                      {open && (
                        <ul className="pb-1">
                          {g.items.map((s) => {
                            const change = formatChange(s.lastChange, s.bodyweightOnly);
                            const active = s.key === selected.key;
                            return (
                              <li key={s.key}>
                                <button
                                  onClick={() => chooseExercise(s.key)}
                                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-l-2 transition ${
                                    active ? 'border-emerald-500 bg-emerald-500/5' : 'border-transparent hover:bg-slate-800/40'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-semibold truncate ${active ? 'text-emerald-300' : 'text-white'}`}>{s.name}</span>
                                      {s.recentPr && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="New PR" />}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {change ? (
                                        <span className={`font-semibold ${toneClass[change.tone]}`}>{change.text}</span>
                                      ) : (
                                        'Logged once'
                                      )}
                                      <span> · {shortDate(s.lastDate)}</span>
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold text-white shrink-0">{formatSet(s.best.topSet.weight, s.best.topSet.reps)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}

      {/* Squad PR feed */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" /> Squad PRs
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Everyone's new records in the last 30 days.</p>
        {recentPrs.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">No new personal records yet. Log sets to start the race.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-slate-800">
              {visiblePrs.map(({ member: m, summary, session }) => (
                <li key={`${m}-${summary.key}-${session.requestId}`} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="text-xl shrink-0" aria-hidden="true">{avatars[m]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate"><span className="font-semibold">{m}</span> <span className="text-slate-400">· {summary.name}</span></div>
                    <div className="text-[11px] text-slate-500">{shortDate(session.date)}</div>
                  </div>
                  <span className="font-semibold text-white shrink-0">{formatSet(session.topSet.weight, session.topSet.reps)}</span>
                </li>
              ))}
            </ul>
            {recentPrs.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllPrs((v) => !v)}
                className="mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllPrs ? 'rotate-180' : ''}`} />
                {showAllPrs ? 'Show fewer' : `Show all ${recentPrs.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <p className="text-[11px] text-slate-600 px-1">
        Estimated max = the most you could probably lift once, worked out from weight × (1 + reps ÷ 30). Used to compare sets with different reps.
      </p>
    </div>
  );
}
