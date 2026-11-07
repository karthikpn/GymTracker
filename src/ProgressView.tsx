import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Dumbbell, TrendingUp, Trophy } from 'lucide-react';
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
      };
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
};

/* ------------------------------------------------------------------ */
/* Line chart                                                          */
/* ------------------------------------------------------------------ */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
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

function ProgressChart({ summary }: { summary: ExerciseSummary }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const sessions = summary.sessions;

  const series = summary.bodyweightOnly
    ? [{ key: 'reps', color: SERIES.e1rm.color, label: 'Most reps in a set', dashed: false, values: sessions.map((s) => s.maxReps) }]
    : [
        { key: 'e1rm', color: SERIES.e1rm.color, label: SERIES.e1rm.label, dashed: false, values: sessions.map((s) => s.bestE1rm) },
        { key: 'top', color: SERIES.top.color, label: SERIES.top.label, dashed: true, values: sessions.map((s) => s.topWeight) },
      ];
  const unit = summary.bodyweightOnly ? 'reps' : 'kg';

  const height = 260;
  const margin = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = Math.max(width - margin.left - margin.right, 10);
  const innerH = height - margin.top - margin.bottom;

  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.max(0, Math.min(...all) * 0.9), Math.max(...all) * 1.05);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const firstDay = sessions[0].date;
  const spanDays = Math.max(daysBetween(firstDay, sessions[sessions.length - 1].date), 1);
  const x = (date: string) =>
    sessions.length === 1 ? innerW / 2 : (daysBetween(firstDay, date) / spanDays) * innerW;
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const xLabels = sessions.length <= 1
    ? sessions
    : [sessions[0], sessions[Math.floor((sessions.length - 1) / 2)], sessions[sessions.length - 1]].filter(
        (s, i, arr) => arr.findIndex((o) => o.date === s.date) === i
      );

  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let nearest = 0;
    sessions.forEach((s, i) => {
      if (Math.abs(x(s.date) - px) < Math.abs(x(sessions[nearest].date) - px)) nearest = i;
    });
    setHoverIndex(nearest);
  };

  const hovered = hoverIndex !== null ? sessions[hoverIndex] : null;

  return (
    <div>
      {/* Legend (always shown for 2 series) */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 mb-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 3' : undefined} />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Trophy className="w-3 h-3 text-amber-400" /> = personal record
        </span>
      </div>

      <div ref={wrapRef} className="relative">
        <svg width={width} height={height} role="img" aria-label={`${summary.name} progress chart`}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="#1e293b" strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">
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
                fontSize={11}
                fill="#64748b"
              >
                {shortDate(s.date)}
              </text>
            ))}

            {hovered && (
              <line x1={x(hovered.date)} x2={x(hovered.date)} y1={0} y2={innerH} stroke="#475569" strokeWidth={1} />
            )}

            {series.map((s) => (
              <g key={s.key}>
                {sessions.length > 1 && (
                  <path
                    d={sessions.map((sess, i) => `${i ? 'L' : 'M'}${x(sess.date)},${y(s.values[i])}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {sessions.map((sess, i) => (
                  <circle
                    key={sess.requestId}
                    cx={x(sess.date)}
                    cy={y(s.values[i])}
                    r={hoverIndex === i ? 5.5 : 4}
                    fill={s.color}
                    stroke="#0f172a"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ))}

            {/* PR markers above the main series */}
            {sessions.map((sess, i) =>
              sess.isPr ? (
                <text key={`pr-${sess.requestId}`} x={x(sess.date)} y={y(series[0].values[i]) - 10} textAnchor="middle" fontSize={12}>
                  🏆
                </text>
              ) : null
            )}

            <rect
              x={-8}
              y={0}
              width={innerW + 16}
              height={innerH}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={handleMove}
            />
          </g>
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-xl"
            style={{
              // Sit on the side of the crosshair away from the newest points.
              left: x(hovered.date) > innerW / 2
                ? Math.max(margin.left + x(hovered.date) - 220, 0)
                : Math.min(margin.left + x(hovered.date) + 12, width - 216),
              top: innerH - 40,
            }}
          >
            <div className="font-bold text-white">
              {shortDate(hovered.date)} {hovered.isPr && <span className="text-amber-300">· PR</span>}
            </div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 mt-1 text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-white">
                  {formatKg(Math.round(s.values[hoverIndex] * 10) / 10)} {unit}
                </span>
              </div>
            ))}
            <div className="mt-2 text-slate-400">
              {hovered.sets.map((set) => formatSet(set.weight, set.reps)).join(' · ')}
            </div>
          </div>
        )}
      </div>

      {/* Table view of the same data */}
      <details className="mt-3">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200">Show as table</summary>
        <table className="w-full mt-2 text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1 font-semibold">Date</th>
              <th className="py-1 font-semibold">Sets</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 font-semibold text-right">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...sessions].reverse().map((sess) => {
              const i = sessions.indexOf(sess);
              return (
                <tr key={sess.requestId} className="border-t border-slate-800 text-slate-300">
                  <td className="py-1.5">{shortDate(sess.date)} {sess.isPr && '🏆'}</td>
                  <td className="py-1.5">{sess.sets.map((set) => formatSet(set.weight, set.reps)).join(', ')}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 text-right">{formatKg(Math.round(s.values[i] * 10) / 10)} {unit}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
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

  const summaries = useMemo(() => buildSummaries(sets, member, today), [sets, member, today]);
  const selected = summaries.find((s) => s.key === selectedKey) || summaries[0];

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
        .slice(0, 10),
    [sets, members, today]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-emerald-400" /> Strength Progress
        </h2>
        <p className="text-slate-400 text-sm mt-2">
          Personal records and progress from logged sets. Estimated 1RM = weight × (1 + reps ÷ 30).
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {members.map((m) => (
          <button
            key={m}
            onClick={() => { setMember(m); setSelectedKey(null); }}
            className={`p-3 rounded-xl font-bold text-sm text-center border transition ${
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
          <p className="text-slate-400 text-sm mt-2">Add exercises with weight and reps in Log Workout to start tracking PRs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Chart */}
          <section className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-bold text-white">{selected.name}</h3>
              <select
                value={selected.key}
                onChange={(e) => setSelectedKey(e.target.value)}
                aria-label="Exercise"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {summaries.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
            <ProgressChart key={`${member}-${selected.key}`} summary={selected} />
          </section>

          {/* PR table */}
          <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" /> Personal records
            </h3>
            <p className="text-xs text-slate-500 mb-4">Best set per exercise. Click one to chart it.</p>
            <ul className="space-y-2">
              {summaries.map((s) => (
                <li key={s.key}>
                  <button
                    onClick={() => setSelectedKey(s.key)}
                    className={`w-full text-left rounded-xl border p-3 transition ${
                      s.key === selected.key ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white text-sm">
                        {s.name}
                        {s.recentPr && (
                          <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                            New PR
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {s.bodyweightOnly
                          ? `${s.best.maxReps} reps`
                          : `${formatKg(Math.round(s.best.bestE1rm * 10) / 10)} kg`}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                      <span>
                        Best: {formatSet(s.best.topSet.weight, s.best.topSet.reps)} · {shortDate(s.best.date)}
                      </span>
                      <span>{s.bodyweightOnly ? 'bodyweight' : 'est. 1RM'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {s.muscle || 'No group'} · {s.sessions.length} session{s.sessions.length === 1 ? '' : 's'}
                      {!s.bodyweightOnly && ` · heaviest ${formatKg(s.heaviest)} kg`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Squad PR feed */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" /> Squad PRs · last 30 days
        </h3>
        {recentPrs.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">No new personal records yet. Log sets to start the race.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800">
            {recentPrs.map(({ member: m, summary, session }) => (
              <li key={`${m}-${summary.key}-${session.requestId}`} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-white">
                  {avatars[m]} <span className="font-semibold">{m}</span>
                  <span className="text-slate-400"> · {summary.name}</span>
                </span>
                <span className="text-slate-300">
                  {formatSet(session.topSet.weight, session.topSet.reps)}
                  <span className="text-slate-500"> · {shortDate(session.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
