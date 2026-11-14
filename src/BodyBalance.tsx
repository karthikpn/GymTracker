import { useState } from 'react';
import type React from 'react';
import { BODY_BACK, BODY_FRONT, OUTLINE_BACK, OUTLINE_FRONT } from './anatomyData';
import { Activity, AlertTriangle, CheckCircle, Heart, Target, XCircle } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types & props                                                       */
/* ------------------------------------------------------------------ */

export interface BalanceLog {
  timestamp: string;
  member: string;
  muscles: string[];
}

export interface BalanceGoal {
  member: string;
  focusAreas: string;
}

interface BodyBalanceProps {
  logs: BalanceLog[];
  goals: BalanceGoal[];
  members: string[];
  muscleGroups: { id: string; name: string }[];
  avatars: Record<string, string>;
  normalizeDate: (timestamp: string) => string;
  normalizeMuscle: (muscle: string) => string;
  today: string;
}

type WindowKey = 'week' | '2w' | '4w' | 'all';

// 'week' = the current Monday–Sunday week (same as the Leaderboard).
const WINDOWS: { key: WindowKey; label: string; days: number | null }[] = [
  { key: 'week', label: 'This week', days: null },
  { key: '2w', label: '2 weeks', days: 14 },
  { key: '4w', label: '4 weeks', days: 28 },
  { key: 'all', label: 'All time', days: null },
];

// Sessions per week each group should get. Goal focus areas get double.
const BASE_WEEKLY_TARGET = 1;
const FOCUS_WEEKLY_TARGET = 2;

interface GroupBalance {
  name: string;
  sessions: number;
  target: number;
  ratio: number;
  isFocus: boolean;
  daysSince: number | null;
  priority: number;
}

/* ------------------------------------------------------------------ */
/* Scales                                                              */
/* ------------------------------------------------------------------ */

// Four clear states, used on the body map, the list, the grid and the legend.
// Each always appears with a text label or icon, never colour alone.
const STATUSES = [
  { key: 'none', label: 'Not trained', fill: '#dc2626', chip: 'bg-red-500/15 text-red-300 border-red-500/30', cell: 'bg-red-500/15 text-red-300', Icon: XCircle },
  { key: 'low', label: 'Under half', fill: '#d97706', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', cell: 'bg-amber-500/20 text-amber-200', Icon: AlertTriangle },
  { key: 'almost', label: 'Almost', fill: '#0284c7', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30', cell: 'bg-sky-500/20 text-sky-200', Icon: Activity },
  { key: 'done', label: 'On track', fill: '#059669', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', cell: 'bg-emerald-500/30 text-emerald-100', Icon: CheckCircle },
] as const;

const statusFor = (ratio: number) =>
  ratio <= 0 ? STATUSES[0] : ratio < 0.5 ? STATUSES[1] : ratio < 1 ? STATUSES[2] : STATUSES[3];

const fillFor = (ratio: number) => statusFor(ratio).fill;

const daysBetween = (from: string, to: string) => {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
};

const addDays = (date: string, days: number) => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const mondayOf = (date: string) => {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
};

const formatDaysSince = (days: number | null) =>
  days === null ? 'Never logged' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;

/* ------------------------------------------------------------------ */
/* Balance calculation                                                 */
/* ------------------------------------------------------------------ */

const computeBalance = (
  member: string,
  props: BodyBalanceProps,
  windowKey: WindowKey
): GroupBalance[] => {
  const { logs, goals, muscleGroups, normalizeDate, normalizeMuscle, today } = props;

  const memberLogs = logs
    .filter((log) => log.member === member)
    .map((log) => ({ date: normalizeDate(log.timestamp), muscles: log.muscles.map(normalizeMuscle) }))
    .filter((log) => log.date && log.date <= today);

  const windowDef = WINDOWS.find((w) => w.key === windowKey)!;
  let start: string;
  let weeks: number;
  if (windowKey === 'week') {
    // Monday of this week; targets are one full week's worth.
    start = mondayOf(today);
    weeks = 1;
  } else if (windowDef.days !== null) {
    start = addDays(today, -(windowDef.days - 1));
    weeks = Math.max(1, (daysBetween(start, today) + 1) / 7);
  } else {
    start = memberLogs.reduce((min, log) => (log.date < min ? log.date : min), today);
    weeks = Math.max(1, (daysBetween(start, today) + 1) / 7);
  }

  const focusText = (goals.find((g) => g.member === member)?.focusAreas || '').toLowerCase();
  const focusSet = new Set(
    focusText
      .split(/[,/&]| and /)
      .map((part) => normalizeMuscle(part.trim()).toLowerCase())
      .filter(Boolean)
  );

  return muscleGroups.map((group) => {
    const hits = memberLogs.filter((log) => log.muscles.includes(group.name));
    const inWindow = hits.filter((log) => log.date >= start);
    const sessions = new Set(inWindow.map((log) => log.date)).size;

    const isFocus = focusSet.has(group.name.toLowerCase());
    const target = Math.max(1, Math.round((isFocus ? FOCUS_WEEKLY_TARGET : BASE_WEEKLY_TARGET) * weeks));
    const ratio = sessions / target;

    const lastDate = hits.reduce<string | null>((max, log) => (!max || log.date > max ? log.date : max), null);
    const daysSince = lastDate ? daysBetween(lastDate, today) : null;

    // Higher = should hit sooner: shortfall, boosted for goal focus and staleness.
    const shortfall = Math.max(0, 1 - ratio);
    const staleness = daysSince === null ? 1 : Math.min(daysSince, 28) / 28;
    const priority = shortfall * (isFocus ? 1.5 : 1) + staleness * 0.3;

    return { name: group.name, sessions, target, ratio, isFocus, daysSince, priority };
  });
};

/* ------------------------------------------------------------------ */
/* Body figure                                                         */
/* ------------------------------------------------------------------ */

// Which illustrated muscles make up each tracked group.
// Anything not listed (head, hands, knees, forearms...) is drawn as plain body.
const MUSCLE_TO_GROUP: Record<string, string> = {
  chest: 'Chest',
  trapezius: 'Back',
  'upper-back': 'Back',
  'lower-back': 'Back',
  deltoids: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  abs: 'Abs',
  obliques: 'Abs',
  quadriceps: 'Legs',
  hamstring: 'Legs',
  calves: 'Legs',
  gluteal: 'Legs',
  adductors: 'Legs',
  tibialis: 'Legs',
};

const BODY_FILL: Record<string, string> = { hair: '#1e293b' };
const DEFAULT_BODY_FILL = '#475569';

interface FigureProps {
  title: string;
  side: 'front' | 'back';
  byGroup: Record<string, GroupBalance>;
  active: string | null;
  onHover: (group: string | null, e?: React.MouseEvent) => void;
}

function BodyFigure({ title, side, byGroup, active, onHover }: FigureProps) {
  const parts = side === 'front' ? BODY_FRONT : BODY_BACK;
  const outline = side === 'front' ? OUTLINE_FRONT : OUTLINE_BACK;
  const viewBox = side === 'front' ? '0 0 724 1448' : '724 0 724 1448';
  const cx = side === 'front' ? 362 : 1086;
  const glowId = `glow-${side}`;
  const spotId = `spot-${side}`;

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={viewBox} className="w-full max-w-[200px] sm:max-w-[280px]" role="img" aria-label={`${title} body view`}>
        <defs>
          <radialGradient id={spotId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Spotlight and floor shadow so the figure reads as an illustration */}
        <ellipse cx={cx} cy={620} rx={360} ry={640} fill={`url(#${spotId})`} />
        <ellipse cx={cx} cy={1400} rx={170} ry={22} fill="#020617" opacity={0.7} />

        {parts.map((part) => {
          const group = MUSCLE_TO_GROUP[part.slug];
          const balance = group ? byGroup[group] : undefined;

          if (!balance) {
            return part.paths.map((d, i) => (
              <path key={`${part.slug}-${i}`} d={d} fill={BODY_FILL[part.slug] || DEFAULT_BODY_FILL} />
            ));
          }

          const isActive = active === group;
          const dim = active !== null && !isActive;
          return (
            <g
              key={part.slug}
              onMouseMove={(e) => onHover(group, e)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => onHover(group, e)}
              className="cursor-pointer"
              filter={isActive || balance.ratio >= 1 ? `url(#${glowId})` : undefined}
              style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 120ms' }}
            >
              <title>{`${group}: ${balance.sessions}/${balance.target} sessions`}</title>
              {part.paths.map((d, i) => (
                <g key={i}>
                  <path
                    d={d}
                    fill={fillFor(balance.ratio)}
                    stroke="#0f172a"
                    strokeWidth={1}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
            </g>
          );
        })}

        {outline.map((d, i) => (
          <path key={`outline-${i}`} d={d} fill="none" stroke="#64748b" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
      </svg>
      <figcaption className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mt-1">{title}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function BodyBalance(props: BodyBalanceProps) {
  const { members, muscleGroups, avatars } = props;
  const [member, setMember] = useState(members[0]);
  const [windowKey, setWindowKey] = useState<WindowKey>('week');
  const [hover, setHover] = useState<{ group: string; x: number; y: number } | null>(null);

  const squad = members.map((m) => ({ member: m, groups: computeBalance(m, props, windowKey) }));

  const groups = squad.find((s) => s.member === member)?.groups || [];
  const byGroup = Object.fromEntries(groups.map((g) => [g.name, g]));
  const toHit = groups.filter((g) => g.ratio < 1).sort((a, b) => b.priority - a.priority);
  const onTrack = groups.filter((g) => g.ratio >= 1).length;
  const cardio = byGroup['Cardio'];
  const hovered = hover ? byGroup[hover.group] : null;

  const handleHover = (group: string | null, e?: React.MouseEvent) => {
    if (!group || !e) return setHover(null);
    const box = (e.currentTarget as Element).closest('[data-figure-wrap]')!.getBoundingClientRect();
    setHover({ group, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div className="space-y-5 text-left">
      {/* Header + filters */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Body Balance</h2>
          <p className="text-slate-400 text-sm mt-1">
            Which muscles need more work. Target: {BASE_WEEKLY_TARGET} session a week per muscle,{' '}
            {FOCUS_WEEKLY_TARGET} for goal focus muscles.
          </p>
        </div>
        <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 grid grid-cols-4 gap-1 w-full sm:w-auto sm:self-start">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`px-2 sm:px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                windowKey === w.key ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Member picker: one swipeable row on phones, a grid on larger screens */}
      <div className="flex md:grid md:grid-cols-7 gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 snap-x">
        {members.map((m) => (
          <button
            key={m}
            onClick={() => { setMember(m); setHover(null); }}
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Body map */}
        <section className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-lg font-bold text-white truncate">{avatars[member]} {member}</h3>
            <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusFor(onTrack / Math.max(groups.length, 1)).chip}`}>
              {onTrack}/{groups.length} on track
            </span>
          </div>

          {/* At-a-glance: what needs work, in plain words */}
          {toHit.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Needs work</p>
              <div className="flex flex-wrap gap-1.5">
                {toHit.map((g) => {
                  const st = statusFor(g.ratio);
                  return (
                    <span key={g.name} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${st.chip}`}>
                      <st.Icon className="w-3.5 h-3.5" />
                      {g.name}
                      <span className="opacity-80 font-normal">{g.sessions}/{g.target}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mb-3 text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Every muscle group is on target.
            </p>
          )}

          <div data-figure-wrap className="relative grid grid-cols-2 gap-2 sm:gap-4" onMouseLeave={() => setHover(null)}>
            <BodyFigure title="Front" side="front" byGroup={byGroup} active={hover?.group ?? null} onHover={handleHover} />
            <BodyFigure title="Back" side="back" byGroup={byGroup} active={hover?.group ?? null} onHover={handleHover} />

            {hover && hovered && (
              <div
                className="pointer-events-none absolute z-10 w-48 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-xl"
                style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12, transform: hover.x > 220 ? 'translateX(-110%)' : undefined }}
              >
                <div className="font-bold text-white text-sm">{hovered.name}{hovered.isFocus && ' · Goal focus'}</div>
                <div className="text-slate-300 mt-1">{hovered.sessions} of {hovered.target} target sessions</div>
                <div className="text-slate-400">Last hit: {formatDaysSince(hovered.daysSince)}</div>
                <div className="text-slate-400">Status: {statusFor(hovered.ratio).label}</div>
              </div>
            )}
          </div>

          {/* Cardio isn't a body region, so it gets its own meter. */}
          {cardio && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <Heart className="w-5 h-5 shrink-0" style={{ color: fillFor(cardio.ratio) }} />
              <span className="text-sm font-semibold text-white w-14">Cardio</span>
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, cardio.ratio * 100)}%`, background: fillFor(cardio.ratio) }} />
              </div>
              <span className="text-xs text-slate-300 text-right whitespace-nowrap">{cardio.sessions}/{cardio.target}</span>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300">
            {STATUSES.map((st) => (
              <span key={st.key} className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 rounded" style={{ background: st.fill }} />
                {st.label}
              </span>
            ))}
          </div>
        </section>

        {/* Train next */}
        <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" /> Train next
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">Most behind first. Goal focus muscles get priority.</p>

          {toHit.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Every muscle group is on target for this period.
            </div>
          ) : (
            <ol className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
              {toHit.map((g, i) => {
                const st = statusFor(g.ratio);
                return (
                  <li key={g.name} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-sm font-bold text-slate-500">{i + 1}</span>
                      <st.Icon className="w-4 h-4 shrink-0" style={{ color: st.fill }} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{g.name}</span>
                          {g.isFocus && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">Goal</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {st.label} · {g.daysSince === null ? 'nothing logged yet' : `last ${formatDaysSince(g.daysSince).toLowerCase()}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white">
                          {g.sessions}<span className="text-slate-500 font-normal">/{g.target}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">sessions</div>
                      </div>
                    </div>
                    <div className="mt-2 ml-8 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, g.ratio * 100))}%`, background: st.fill }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Squad grid */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white">Squad overview</h3>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">
          Sessions vs target per muscle. Tap a name to open their body map.
          <span className="sm:hidden"> Swipe sideways to see all muscles →</span>
        </p>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] border-separate text-xs" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900 text-left font-semibold text-slate-400 py-1.5 pr-2">Member</th>
                {muscleGroups.map((g) => (
                  <th key={g.id} className="font-semibold text-slate-400 py-1.5 text-center">{g.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {squad.map((row) => {
                const selected = row.member === member;
                return (
                  <tr key={row.member} onClick={() => { setMember(row.member); setHover(null); }} className="cursor-pointer">
                    <td
                      className={`sticky left-0 z-10 bg-slate-900 font-semibold whitespace-nowrap py-2 pr-2 ${
                        selected ? 'text-emerald-300' : 'text-white'
                      }`}
                    >
                      {avatars[row.member]} {row.member}
                    </td>
                    {row.groups.map((g) => {
                      const st = statusFor(g.ratio);
                      return (
                        <td
                          key={g.name}
                          title={`${row.member} · ${g.name}: ${g.sessions}/${g.target} sessions (${st.label})${g.isFocus ? ' · goal focus' : ''}`}
                          className={`text-center font-bold rounded-md py-2 min-w-[3.25rem] ${st.cell} ${selected ? 'ring-1 ring-emerald-500/60' : ''}`}
                        >
                          {g.sessions}/{g.target}
                          {g.isFocus && <span className="ml-0.5">★</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">★ = goal focus muscle (double target)</p>
      </section>
    </div>
  );
}
