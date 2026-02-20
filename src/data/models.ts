export type Id = string;

export interface Exercise {
  id: Id;
  name: string;
  createdAt: number; // ms epoch
  updatedAt: number;
}

export interface Template {
  id: Id;
  name: string;
  exerciseIds: Id[]; // ordered
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: Id;
  templateId?: Id;
  startedAt: number;
  endedAt?: number; // present when finished
  notes?: string;
  bodyweightLbs?: number; // optional
}

export interface SetEntry {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  setIndex: number; // 0..n-1
  reps?: number;    // undefined means blank/discard
  weightLbs?: number;
}

export interface ExerciseLast {
  exerciseId: Id;
  lastEndedAt: number;
  sets: Array<{ reps: number; weightLbs: number }>; // only filled sets
}

export interface ExercisePR {
  exerciseId: Id;
  bestE1rm: number;
  bestE1rmSet: { reps: number; weightLbs: number };
  bestTopSetWeight: number;
  updatedAt: number;
}

export interface PRHit {
  exerciseId: Id;
  e1rmPR: boolean;
  weightPR: boolean;
  topSet: { reps: number; weightLbs: number }; // best set from this session
}

export interface BodyweightEntry {
  id: Id;
  measuredAt: number;
  weightLbs: number;
}

export interface Setting {
  key: string;
  value: any;
}

export type DisplayUnit = 'lbs' | 'kg';
export type ThemeMode = 'dark' | 'light' | 'system';
