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

type WindowKey = '2w' | '4w' | '8w' | 'all';

const WINDOWS: { key: WindowKey; label: string; days: number | null }[] = [
  { key: '2w', label: '2 weeks', days: 14 },
  { key: '4w', label: '4 weeks', days: 28 },
  { key: '8w', label: '8 weeks', days: 56 },
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

// Sequential single-hue scale (emerald), dark -> light on the dark surface.
const SCALE = [
  { min: 0, max: 0, fill: '#1e293b', label: 'Not hit' },
  { min: 0.0001, max: 0.5, fill: '#065f46', label: '< 50%' },
  { min: 0.5, max: 1, fill: '#059669', label: '50–99%' },
  { min: 1, max: 1.5, fill: '#34d399', label: '100–149%' },
  { min: 1.5, max: Infinity, fill: '#a7f3d0', label: '150%+' },
];

const fillFor = (ratio: number) =>
  ratio <= 0 ? SCALE[0].fill : (SCALE.find((s, i) => i > 0 && ratio < s.max) || SCALE[SCALE.length - 1]).fill;

const statusFor = (ratio: number) => {
  if (ratio <= 0) return { label: 'Neglected', className: 'bg-red-500/15 text-red-300', Icon: XCircle };
  if (ratio < 0.5) return { label: 'Lacking', className: 'bg-amber-500/15 text-amber-300', Icon: AlertTriangle };
  if (ratio < 1) return { label: 'Almost', className: 'bg-sky-500/15 text-sky-300', Icon: Activity };
  return { label: 'On track', className: 'bg-emerald-500/15 text-emerald-300', Icon: CheckCircle };
};

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
  if (windowDef.days !== null) {
    start = addDays(today, -(windowDef.days - 1));
  } else {
    start = memberLogs.reduce((min, log) => (log.date < min ? log.date : min), today);
  }
  const weeks = Math.max(1, (daysBetween(start, today) + 1) / 7);

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
  const hatchId = `hatch-${side}`;

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={viewBox} className="w-full max-w-[280px]" role="img" aria-label={`${title} body view`}>
        <defs>
          <radialGradient id={spotId} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          <pattern id={hatchId} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="#fbbf24" strokeWidth="4" strokeOpacity="0.75" />
          </pattern>
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

          const lacking = balance.ratio < 0.5;
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
                  {lacking && <path d={d} fill={`url(#${hatchId})`} pointerEvents="none" />}
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
  const [windowKey, setWindowKey] = useState<WindowKey>('4w');
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
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Body Balance</h2>
          <p className="text-slate-400 text-sm mt-2">
            Which muscle groups each member is under-training. Target: {BASE_WEEKLY_TARGET} session/week per group,{' '}
            {FOCUS_WEEKLY_TARGET}/week for goal focus areas.
          </p>
        </div>
        <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex gap-1 self-start">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                windowKey === w.key ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {members.map((m) => (
          <button
            key={m}
            onClick={() => { setMember(m); setHover(null); }}
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Body map */}
        <section className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">{avatars[member]} {member}'s body map</h3>
            <span className="text-xs text-slate-400">{onTrack}/{groups.length} groups on track</span>
          </div>

          <div data-figure-wrap className="relative grid grid-cols-2 gap-4" onMouseLeave={() => setHover(null)}>
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
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <Heart className="w-5 h-5 text-slate-300 shrink-0" />
              <span className="text-sm font-semibold text-white w-16">Cardio</span>
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, cardio.ratio * 100)}%`, background: fillFor(cardio.ratio) }} />
              </div>
              <span className="text-xs text-slate-300 w-20 text-right">{cardio.sessions}/{cardio.target} sessions</span>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-500">Sessions vs target:</span>
            {SCALE.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded" style={{ background: s.fill, border: '1px solid #334155' }} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ background: 'repeating-linear-gradient(45deg, #fbbf24 0 2px, #1e293b 2px 5px)' }}
              />
              Lacking (&lt; 50%)
            </span>
          </div>
        </section>

        {/* Hit these next */}
        <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" /> Hit these next
          </h3>
          <p className="text-xs text-slate-500 mb-4">Ranked by shortfall, goal focus and time since last trained.</p>

          {toHit.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Every muscle group is on target for this period.
            </div>
          ) : (
            <ol className="space-y-3">
              {toHit.map((g, i) => {
                const status = statusFor(g.ratio);
                return (
                  <li key={g.name} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white text-sm">
                        <span className="text-slate-500 mr-2">#{i + 1}</span>{g.name}
                        {g.isFocus && <span className="ml-2 text-[10px] font-bold uppercase text-cyan-300">Goal focus</span>}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-full ${status.className}`}>
                        <status.Icon className="w-3 h-3" /> {status.label}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, g.ratio * 100)}%`, background: fillFor(g.ratio) }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
                      <span>{g.sessions}/{g.target} sessions</span>
                      <span>Last: {formatDaysSince(g.daysSince)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Squad grid */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-1">Squad balance grid</h3>
        <p className="text-xs text-slate-500 mb-4">Sessions in this period vs target. Click a row to open that member.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 p-2">Member</th>
                {muscleGroups.map((g) => (
                  <th key={g.id} className="text-xs font-semibold text-slate-400 p-2">{g.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {squad.map((row) => (
                <tr
                  key={row.member}
                  onClick={() => { setMember(row.member); setHover(null); }}
                  className={`cursor-pointer ${row.member === member ? 'outline outline-1 outline-emerald-500 rounded' : ''}`}
                >
                  <td className="text-sm font-semibold text-white p-2 whitespace-nowrap">{avatars[row.member]} {row.member}</td>
                  {row.groups.map((g) => (
                    <td
                      key={g.name}
                      title={`${row.member} · ${g.name}: ${g.sessions}/${g.target} sessions${g.isFocus ? ' (goal focus)' : ''}`}
                      className="text-center text-xs font-bold rounded-md p-2 hover:ring-2 hover:ring-slate-400"
                      style={{ background: fillFor(g.ratio), color: g.ratio >= 1 ? '#022c22' : '#e2e8f0' }}
                    >
                      {g.sessions}/{g.target}
                      {g.isFocus && <span className="ml-0.5">★</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">★ = goal focus area (double target)</p>
      </section>
    </div>
  );
}
