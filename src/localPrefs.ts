// Per-device preferences and the in-progress workout draft.
// Stored in localStorage, so they live on this phone/browser only.
// Every call is wrapped: private windows or blocked storage must never break the app.

import type { DraftExercise } from './exercises';

const ME_KEY = 'gymtracker.me';
const DRAFT_KEY = 'gymtracker.logDraft';

export const loadMe = (): string | null => {
  try {
    return localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
};

export const saveMe = (member: string | null) => {
  try {
    if (member) localStorage.setItem(ME_KEY, member);
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* storage unavailable */
  }
};

export interface LogDraft {
  member: string;
  date: string;
  muscles: string[];
  exercises: DraftExercise[];
  notes: string;
  savedAt: number;
}

export const loadDraft = (): LogDraft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as LogDraft;
    // Drop drafts older than 2 days: they're almost certainly abandoned.
    if (!draft || Date.now() - (draft.savedAt || 0) > 2 * 24 * 60 * 60 * 1000) return null;
    return draft;
  } catch {
    return null;
  }
};

export const saveDraft = (draft: Omit<LogDraft, 'savedAt'>) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* storage unavailable */
  }
};

export const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
};

/** True when the draft holds anything worth keeping. */
export const draftHasContent = (d: { muscles: string[]; exercises: DraftExercise[]; notes: string }) =>
  d.muscles.length > 0 || d.exercises.length > 0 || d.notes.trim().length > 0;
