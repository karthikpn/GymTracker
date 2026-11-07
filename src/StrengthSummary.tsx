import { useState } from 'react';
import { ChevronRight, Dumbbell, Trophy } from 'lucide-react';
import {
  estimateOneRepMax,
  exerciseKey,
  formatKg,
  formatSet,
  type SetRecord,
} from './exercises';

interface StrengthSummaryProps {
  sets: SetRecord[];
  member: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  muscleOrder: string[];
  loading?: boolean;
}

// Common hypertrophy guideline: ~10 hard sets per muscle group per week.
const WEEKLY_SET_GUIDE = 10;

interface ExerciseRow {
  key: string;
  name: string;
  muscle: string;
  setCount: number;
  bestSet: SetRecord;
  bodyweightOnly: boolean;
  score: number; // est. 1RM in kg, or max reps when bodyweight-only
  priorScore: number | null; // null = no earlier data (baseline)
  change: number | null; // % for weighted, reps for bodyweight
  isPr: boolean;
}

const addDays = (date: string, days: number) => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const bestOf = (list: SetRecord[], bodyweightOnly: boolean) =>
  list.reduce((top, s) => {
    const score = bodyweightOnly ? s.reps : estimateOneRepMax(s.weight, s.reps);
    const topScore = bodyweightOnly ? top.reps : estimateOneRepMax(top.weight, top.reps);
    return score > topScore ? s : top;
  }, list[0]);

const scoreOf = (set: SetRecord, bodyweightOnly: boolean) =>
  bodyweightOnly ? set.reps : estimateOneRepMax(set.weight, set.reps);

const buildStrengthRows = (
  sets: SetRecord[],
  member: string,
  weekStart: string,
  weekEnd: string
): ExerciseRow[] => {
  const memberSets = sets.filter((s) => s.member === member && s.date && s.date <= weekEnd);
  const thisWeek = memberSets.filter((s) => s.date >= weekStart);

  const byExercise = new Map<string, SetRecord[]>();
  thisWeek.forEach((s) => {
    const key = exerciseKey(s.exercise);
    byExercise.set(key, [...(byExercise.get(key) || []), s]);
  });

  return Array.from(byExercise.entries()).map(([key, weekSets]) => {
    const earlier = memberSets.filter((s) => s.date < weekStart && exerciseKey(s.exercise) === key);

    // Compare by est. 1RM, unless this exercise has only ever been bodyweight.
    const bodyweightOnly = [...weekSets, ...earlier].every((s) => s.weight === 0);
    const bestSet = bestOf(weekSets, bodyweightOnly);
    const score = scoreOf(bestSet, bodyweightOnly);

    const comparableEarlier = earlier.filter((s) => scoreOf(s, bodyweightOnly) > 0);
    const priorScore = comparableEarlier.length
      ? Math.max(...comparableEarlier.map((s) => scoreOf(s, bodyweightOnly)))
      : null;

    let change: number | null = null;
    if (priorScore !== null && score > 0) {
      change = bodyweightOnly ? score - priorScore : ((score - priorScore) / priorScore) * 100;
    }

    return {
      key,
      name: weekSets[weekSets.length - 1].exercise,
      muscle: weekSets[weekSets.length - 1].muscle,
      setCount: weekSets.length,
      bestSet,
      bodyweightOnly,
      score,
      priorScore,
      change,
      isPr: change !== null && change > 0,
    };
  });
};

function ChangeCell({ row }: { row: ExerciseRow }) {
  if (row.change === null) {
    return <span className="text-slate-400">Baseline <span className="text-slate-500">(first log)</span></span>;
  }
  const rounded = row.bodyweightOnly ? row.change : Math.round(row.change * 10) / 10;
  const unit = row.bodyweightOnly ? (Math.abs(rounded) === 1 ? ' rep' : ' reps') : '%';
  if (rounded === 0) return <span className="text-slate-400">= Same as best</span>;

  const up = rounded > 0;
  return (
    <span className={up ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}>
      {up ? '▲ +' : '▼ '}
      {formatKg(rounded)}
      {unit}
      {row.isPr && <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">PR</span>}
    </span>
  );
}

export default function StrengthSummary({ sets, member, weekStart, weekEnd, muscleOrder, loading }: StrengthSummaryProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (muscle: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return next;
    });

  if (!weekStart) return null;
  const end = weekEnd || addDays(weekStart, 6);

  const rows = buildStrengthRows(sets, member, weekStart, end).sort(
    (a, b) =>
      (muscleOrder.indexOf(a.muscle) + 1 || 99) - (muscleOrder.indexOf(b.muscle) + 1 || 99) ||
      a.name.localeCompare(b.name)
  );
  const prs = rows.filter((r) => r.isPr);

  const setsPerMuscle = new Map<string, number>();
  rows.forEach((r) => {
    if (r.muscle) setsPerMuscle.set(r.muscle, (setsPerMuscle.get(r.muscle) || 0) + r.setCount);
  });
  const muscleRows = muscleOrder.filter((m) => setsPerMuscle.has(m)).map((m) => [m, setsPerMuscle.get(m)!] as const);
  const scaleMax = Math.max(WEEKLY_SET_GUIDE + 2, ...muscleRows.map(([, n]) => n));
  const groups = muscleRows.map(([muscle, count]) => ({ muscle, count, items: rows.filter((r) => r.muscle === muscle) }));
  const ungrouped = rows.filter((r) => !r.muscle || !muscleOrder.includes(r.muscle));
  if (ungrouped.length) {
    groups.push({ muscle: 'Other', count: ungrouped.reduce((n, r) => n + r.setCount, 0), items: ungrouped });
  }
  const totalSets = rows.reduce((n, r) => n + r.setCount, 0);
  const allBaseline = rows.every((r) => r.change === null);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-emerald-400" />
          <h4 className="font-bold text-white">Strength</h4>
        </div>
        <span className="text-[11px] text-slate-500">Calculated from logged sets, not written by AI</span>
      </div>

      {loading && sets.length === 0 ? (
        <p className="text-sm text-slate-400">Loading sets...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No sets logged this week. Add exercises with weight and reps in Log Workout to see strength data here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* One-line summary instead of repeating "Baseline" on every row */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
            <span><span className="font-semibold text-white">{rows.length}</span> exercises</span>
            <span><span className="font-semibold text-white">{totalSets}</span> sets</span>
            {prs.length > 0 && <span><span className="font-semibold text-amber-300">{prs.length}</span> PR{prs.length === 1 ? '' : 's'}</span>}
            {allBaseline && <span className="text-slate-500">First week of logged sets: everything is a baseline, changes show from next week.</span>}
          </div>

          {prs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {prs.map((r) => (
                <span
                  key={r.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  {r.name} PR · {formatSet(r.bestSet.weight, r.bestSet.reps)}
                </span>
              ))}
            </div>
          )}

          {/* One row per muscle group; click to see that group's exercises in detail */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h5 className="text-xs uppercase font-bold text-cyan-400">By muscle group</h5>
              <span className="text-[11px] text-slate-500">Dashed line = ~{WEEKLY_SET_GUIDE} sets/week guideline · click a group for details</span>
            </div>
            <ul className="divide-y divide-slate-800">
              {groups.map(({ muscle, items, count }) => {
                const isOpen = open.has(muscle);
                return (
                  <li key={muscle}>
                    <button
                      type="button"
                      onClick={() => toggle(muscle)}
                      aria-expanded={isOpen}
                      className="w-full text-left py-2.5 grid grid-cols-[1rem_5.5rem_1fr_2.5rem] items-center gap-3 hover:bg-slate-800/40 rounded-lg px-1"
                    >
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      <span className="text-sm font-semibold text-white">{muscle}</span>
                      <span className="min-w-0">
                        <span className="relative block h-2 rounded-full bg-slate-800" title={`${muscle}: ${count} sets this week`}>
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(count / scaleMax) * 100}%` }} />
                          <span
                            className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-slate-400"
                            style={{ left: `${(WEEKLY_SET_GUIDE / scaleMax) * 100}%` }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="mt-1.5 block truncate text-[11px] text-slate-400">
                          {items.map((r, i) => (
                            <span key={r.key}>
                              {i > 0 && <span className="text-slate-600"> · </span>}
                              {r.name} <span className="text-slate-300">{formatSet(r.bestSet.weight, r.bestSet.reps)}</span>
                              {r.change !== null && <span className={r.change > 0 ? 'text-emerald-300' : r.change < 0 ? 'text-amber-300' : ''}> {r.change > 0 ? '▲' : r.change < 0 ? '▼' : '='}</span>}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-200 text-right">{count}</span>
                    </button>

                    {isOpen && (
                      <div className="overflow-x-auto pl-7 pb-3">
                        <table className="w-full min-w-[460px] text-sm">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                              <th className="px-1 py-1.5 font-semibold">Exercise</th>
                              <th className="px-1 py-1.5 font-semibold">Best set</th>
                              <th className="px-1 py-1.5 font-semibold text-right">Est. 1RM</th>
                              <th className="px-1 py-1.5 font-semibold">vs previous best</th>
                              <th className="px-1 py-1.5 font-semibold text-right">Sets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r) => (
                              <tr key={r.key} className="border-t border-slate-800/70">
                                <td className="px-1 py-1.5 text-white">{r.name}</td>
                                <td className="px-1 py-1.5 text-slate-200">{formatSet(r.bestSet.weight, r.bestSet.reps)}</td>
                                <td className="px-1 py-1.5 text-right text-slate-200">
                                  {r.bodyweightOnly || r.score === 0 ? '—' : `${formatKg(Math.round(r.score))} kg`}
                                </td>
                                <td className="px-1 py-1.5"><ChangeCell row={r} /></td>
                                <td className="px-1 py-1.5 text-right text-slate-200">{r.setCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
