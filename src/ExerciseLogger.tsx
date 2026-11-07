import { useMemo, useState } from 'react';
import type React from 'react';
import { Copy, History, Plus, Trash2, X } from 'lucide-react';
import {
  EXERCISE_LIBRARY,
  exerciseKey,
  findLibraryExercise,
  formatSet,
  estimateOneRepMax,
  newDraftExercise,
  sessionsForExercise,
  summarizeSession,
  type DraftExercise,
  type SetRecord,
} from './exercises';

interface ExerciseLoggerProps {
  value: DraftExercise[];
  onChange: (next: DraftExercise[]) => void;
  member: string;
  history: SetRecord[];
  muscleGroups: string[];
  disabled?: boolean;
}

const inputClass =
  'w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60';

const formatShortDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function ExerciseLogger({ value, onChange, member, history, muscleGroups, disabled }: ExerciseLoggerProps) {
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState('');

  // Library names plus anything this squad has logged before.
  const suggestions = useMemo(() => {
    const names = new Map<string, string>();
    EXERCISE_LIBRARY.forEach((item) => names.set(exerciseKey(item.name), item.name));
    history.forEach((set) => {
      if (!names.has(exerciseKey(set.exercise))) names.set(exerciseKey(set.exercise), set.exercise);
    });
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [history]);

  const muscleForName = (name: string) => {
    const lib = findLibraryExercise(name);
    if (lib) return lib.muscle;
    const previous = [...history].reverse().find((s) => exerciseKey(s.exercise) === exerciseKey(name));
    return previous?.muscle || '';
  };

  const update = (id: string, change: (exercise: DraftExercise) => DraftExercise) =>
    onChange(value.map((exercise) => (exercise.id === id ? change(exercise) : exercise)));

  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    const muscle = newMuscle || muscleForName(name);
    const exercise = newDraftExercise(name, muscle);

    // Pre-fill the first set from last time, so repeating a session is quick.
    const last = sessionsForExercise(history, member, name)[0];
    if (last) {
      exercise.sets = last.map((s) => ({ reps: String(s.reps), weight: String(s.weight) }));
    }

    onChange([...value, exercise]);
    setNewName('');
    setNewMuscle('');
  };

  const handleNameChange = (name: string) => {
    setNewName(name);
    const known = muscleForName(name);
    if (known) setNewMuscle(known);
  };

  return (
    <div className="space-y-3">
      {value.map((exercise) => {
        const sessions = sessionsForExercise(history, member, exercise.name);
        const last = sessions[0];
        const best = sessions
          .flat()
          .reduce<SetRecord | null>(
            (top, s) =>
              !top || estimateOneRepMax(s.weight, s.reps) > estimateOneRepMax(top.weight, top.reps) ? s : top,
            null
          );

        return (
          <div key={exercise.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm truncate">{exercise.name}</div>
                {last ? (
                  <div className="mt-0.5 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1">
                      <History className="w-3 h-3" /> Last ({formatShortDate(last[0].date)}): {summarizeSession(last)}
                    </span>
                    {best && best.weight > 0 && <span>Best: {formatSet(best.weight, best.reps)}</span>}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[11px] text-slate-500">First time logging this for {member}.</div>
                )}
              </div>
              <select
                value={exercise.muscle}
                onChange={(e) => update(exercise.id, (ex) => ({ ...ex, muscle: e.target.value }))}
                disabled={disabled}
                aria-label={`Muscle group for ${exercise.name}`}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Muscle…</option>
                {muscleGroups.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(value.filter((ex) => ex.id !== exercise.id))}
                disabled={disabled}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10"
                aria-label={`Remove ${exercise.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-1">
                <span>Set</span>
                <span>Weight (kg)</span>
                <span>Reps</span>
                <span />
              </div>
              {exercise.sets.map((set, index) => (
                <div key={index} className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 items-center">
                  <span className="text-sm font-bold text-slate-400 text-center">{index + 1}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1000}
                    step={0.5}
                    placeholder="0 = BW"
                    value={set.weight}
                    disabled={disabled}
                    onChange={(e) =>
                      update(exercise.id, (ex) => ({
                        ...ex,
                        sets: ex.sets.map((s, i) => (i === index ? { ...s, weight: e.target.value } : s)),
                      }))
                    }
                    aria-label={`Set ${index + 1} weight`}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    step={1}
                    placeholder="reps"
                    value={set.reps}
                    disabled={disabled}
                    onChange={(e) =>
                      update(exercise.id, (ex) => ({
                        ...ex,
                        sets: ex.sets.map((s, i) => (i === index ? { ...s, reps: e.target.value } : s)),
                      }))
                    }
                    aria-label={`Set ${index + 1} reps`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={disabled || exercise.sets.length === 1}
                    onClick={() =>
                      update(exercise.id, (ex) => ({ ...ex, sets: ex.sets.filter((_, i) => i !== index) }))
                    }
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 disabled:opacity-30 disabled:hover:text-slate-500"
                    aria-label={`Remove set ${index + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={disabled || exercise.sets.length >= 20}
              onClick={() =>
                update(exercise.id, (ex) => ({
                  ...ex,
                  sets: [...ex.sets, { ...ex.sets[ex.sets.length - 1] }],
                }))
              }
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
            >
              <Copy className="w-3.5 h-3.5" /> Add set (copy last)
            </button>
          </div>
        );
      })}

      {/* Add exercise */}
      <div className="rounded-xl border border-dashed border-slate-700 p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            list="exercise-suggestions"
            value={newName}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExercise();
              }
            }}
            disabled={disabled || value.length >= 30}
            placeholder="Add exercise, e.g. Bench Press"
            maxLength={60}
            aria-label="Exercise name"
            className={`${inputClass} flex-1`}
          />
          <datalist id="exercise-suggestions">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <select
            value={newMuscle}
            onChange={(e) => setNewMuscle(e.target.value)}
            disabled={disabled}
            aria-label="Muscle group for new exercise"
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Muscle group…</option>
            {muscleGroups.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addExercise}
            disabled={disabled || !newName.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-emerald-300 text-sm font-semibold hover:bg-slate-700 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Optional. Weight in kg; use 0 for bodyweight. Known exercises fill in the muscle group and last session's sets.
        </p>
      </div>
    </div>
  );
}
