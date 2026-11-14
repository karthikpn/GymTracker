/**
 * One member picker for every tab.
 * Phones: a single swipeable row. Larger screens: one row of equal buttons.
 * Optional `status` text shows under each name (used by AI Reports).
 */
interface MemberPickerProps {
  members: string[];
  avatars: Record<string, string>;
  value: string;
  onChange: (member: string) => void;
  status?: (member: string) => { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } | null;
  disabled?: boolean;
  label?: string;
}

const toneClass = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-red-400',
  muted: 'text-slate-500',
};

export default function MemberPicker({ members, avatars, value, onChange, status, disabled, label }: MemberPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label || 'Squad member'}
      className="flex md:grid md:grid-cols-7 gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 snap-x"
    >
      {members.map((member) => {
        const selected = member === value;
        const s = status?.(member);
        return (
          <button
            key={member}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(member)}
            className={`shrink-0 snap-start min-w-[6.5rem] md:min-w-0 px-3 py-2.5 rounded-xl text-sm text-center border transition whitespace-nowrap disabled:opacity-60 ${
              selected
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-300 font-semibold hover:bg-slate-800'
            }`}
          >
            <span aria-hidden="true">{avatars[member]}</span> {member}
            {s && <span className={`block text-[10px] font-semibold mt-0.5 ${toneClass[s.tone]}`}>{s.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
