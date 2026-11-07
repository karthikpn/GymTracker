// Shared types and helpers for sets / reps / weight logging.

/** One set as stored in the "Exercise Sets" sheet. */
export interface SetRecord {
  requestId: string;
  date: string; // YYYY-MM-DD (India)
  member: string;
  exercise: string;
  muscle: string;
  setNumber: number;
  reps: number;
  weight: number; // kg, 0 = bodyweight
}

/** One set while it's being typed in the log form. */
export interface DraftSet {
  reps: string;
  weight: string;
}

/** One exercise while it's being typed in the log form. */
export interface DraftExercise {
  id: string;
  name: string;
  muscle: string;
  sets: DraftSet[];
}

export const EXERCISE_LIBRARY: { name: string; muscle: string }[] = [
  // Chest
  { name: 'Bench Press', muscle: 'Chest' },
  { name: 'Incline Bench Press', muscle: 'Chest' },
  { name: 'Dumbbell Bench Press', muscle: 'Chest' },
  { name: 'Incline Dumbbell Press', muscle: 'Chest' },
  { name: 'Chest Fly', muscle: 'Chest' },
  { name: 'Cable Crossover', muscle: 'Chest' },
  { name: 'Push-up', muscle: 'Chest' },
  { name: 'Chest Dip', muscle: 'Chest' },
  // Back
  { name: 'Deadlift', muscle: 'Back' },
  { name: 'Pull-up', muscle: 'Back' },
  { name: 'Chin-up', muscle: 'Back' },
  { name: 'Lat Pulldown', muscle: 'Back' },
  { name: 'Barbell Row', muscle: 'Back' },
  { name: 'Dumbbell Row', muscle: 'Back' },
  { name: 'Seated Cable Row', muscle: 'Back' },
  { name: 'T-Bar Row', muscle: 'Back' },
  // Shoulders
  { name: 'Overhead Press', muscle: 'Shoulders' },
  { name: 'Dumbbell Shoulder Press', muscle: 'Shoulders' },
  { name: 'Lateral Raise', muscle: 'Shoulders' },
  { name: 'Front Raise', muscle: 'Shoulders' },
  { name: 'Rear Delt Fly', muscle: 'Shoulders' },
  { name: 'Face Pull', muscle: 'Shoulders' },
  { name: 'Shrug', muscle: 'Shoulders' },
  // Biceps
  { name: 'Barbell Curl', muscle: 'Biceps' },
  { name: 'Dumbbell Curl', muscle: 'Biceps' },
  { name: 'Hammer Curl', muscle: 'Biceps' },
  { name: 'Preacher Curl', muscle: 'Biceps' },
  { name: 'Cable Curl', muscle: 'Biceps' },
  // Triceps
  { name: 'Tricep Pushdown', muscle: 'Triceps' },
  { name: 'Skull Crusher', muscle: 'Triceps' },
  { name: 'Overhead Tricep Extension', muscle: 'Triceps' },
  { name: 'Close-Grip Bench Press', muscle: 'Triceps' },
  { name: 'Tricep Dip', muscle: 'Triceps' },
  // Legs
  { name: 'Squat', muscle: 'Legs' },
  { name: 'Front Squat', muscle: 'Legs' },
  { name: 'Leg Press', muscle: 'Legs' },
  { name: 'Romanian Deadlift', muscle: 'Legs' },
  { name: 'Lunge', muscle: 'Legs' },
  { name: 'Bulgarian Split Squat', muscle: 'Legs' },
  { name: 'Leg Extension', muscle: 'Legs' },
  { name: 'Leg Curl', muscle: 'Legs' },
  { name: 'Hip Thrust', muscle: 'Legs' },
  { name: 'Calf Raise', muscle: 'Legs' },
  // Abs
  { name: 'Crunch', muscle: 'Abs' },
  { name: 'Hanging Leg Raise', muscle: 'Abs' },
  { name: 'Cable Crunch', muscle: 'Abs' },
  { name: 'Russian Twist', muscle: 'Abs' },
  { name: 'Ab Wheel Rollout', muscle: 'Abs' },
  { name: 'Woodchopper', muscle: 'Abs' },
];

/** Case-insensitive key so "bench press" and "Bench Press" are one exercise. */
export const exerciseKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export const findLibraryExercise = (name: string) =>
  EXERCISE_LIBRARY.find((item) => exerciseKey(item.name) === exerciseKey(name));

/** Estimated one-rep max (Epley). Bodyweight sets (0 kg) return 0. */
export const estimateOneRepMax = (weight: number, reps: number) => {
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
};

export const formatKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(/\.0$/, ''));

export const formatSet = (weight: number, reps: number) =>
  weight > 0 ? `${formatKg(weight)}kg × ${reps}` : `BW × ${reps}`;

/** Group a member's sets into sessions (one per workout) for one exercise, newest first. */
export const sessionsForExercise = (sets: SetRecord[], member: string, exercise: string) => {
  const key = exerciseKey(exercise);
  const byWorkout = new Map<string, SetRecord[]>();

  sets
    .filter((s) => s.member === member && exerciseKey(s.exercise) === key)
    .forEach((s) => {
      const list = byWorkout.get(s.requestId) || [];
      list.push(s);
      byWorkout.set(s.requestId, list);
    });

  return Array.from(byWorkout.values())
    .map((list) => list.sort((a, b) => a.setNumber - b.setNumber))
    .sort((a, b) => b[0].date.localeCompare(a[0].date));
};

/** "3 × 8 @ 60kg" when every set matches, otherwise "60×8, 62.5×6, …". */
export const summarizeSession = (sets: SetRecord[]) => {
  if (sets.length === 0) return '';
  const first = sets[0];
  const allSame = sets.every((s) => s.reps === first.reps && s.weight === first.weight);
  if (allSame) {
    return first.weight > 0
      ? `${sets.length} × ${first.reps} @ ${formatKg(first.weight)}kg`
      : `${sets.length} × ${first.reps} @ bodyweight`;
  }
  return sets.map((s) => (s.weight > 0 ? `${formatKg(s.weight)}×${s.reps}` : `BW×${s.reps}`)).join(', ');
};

export const newDraftExercise = (name: string, muscle: string): DraftExercise => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()),
  name,
  muscle,
  sets: [{ reps: '', weight: '' }],
});

export interface ExercisePayload {
  name: string;
  muscle: string;
  sets: { reps: number; weight: number }[];
}

/** Turn drafts into the payload, or return an error message. */
export const buildExercisePayload = (
  drafts: DraftExercise[]
): { exercises: ExercisePayload[]; error?: undefined } | { error: string; exercises?: undefined } => {
  const exercises: ExercisePayload[] = [];

  for (const draft of drafts) {
    const sets: { reps: number; weight: number }[] = [];
    for (const [index, set] of draft.sets.entries()) {
      const blank = set.reps.trim() === '' && set.weight.trim() === '';
      if (blank) continue;

      const reps = Number(set.reps);
      const weight = set.weight.trim() === '' ? 0 : Number(set.weight);

      if (!Number.isInteger(reps) || reps < 1 || reps > 200) {
        return { error: `${draft.name}, set ${index + 1}: reps must be a whole number from 1 to 200.` };
      }
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000) {
        return { error: `${draft.name}, set ${index + 1}: weight must be between 0 and 1000 kg.` };
      }
      sets.push({ reps, weight: Math.round(weight * 100) / 100 });
    }

    if (sets.length === 0) {
      return { error: `${draft.name}: fill in at least one set, or remove the exercise.` };
    }
    if (!draft.muscle) {
      return { error: `${draft.name}: pick a muscle group.` };
    }
    exercises.push({ name: draft.name.trim(), muscle: draft.muscle, sets });
  }

  return { exercises };
};
