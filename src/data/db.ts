import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  Exercise,
  Template,
  Session,
  SetEntry,
  ExerciseLast,
  ExercisePR,
  BodyweightEntry,
  Setting,
} from './models';

interface WorkoutDB extends DBSchema {
  exercises: {
    key: string;
    value: Exercise;
    indexes: { name: string };
  };
  templates: {
    key: string;
    value: Template;
  };
  sessions: {
    key: string;
    value: Session;
    indexes: { endedAt: number; startedAt: number; templateId: string };
  };
  sets: {
    key: string;
    value: SetEntry;
    indexes: {
      sessionId: string;
      exerciseId: string;
      'sessionId-exerciseId': [string, string];
    };
  };
  exercise_last: {
    key: string;
    value: ExerciseLast;
  };
  exercise_pr: {
    key: string;
    value: ExercisePR;
  };
  bodyweight_entries: {
    key: string;
    value: BodyweightEntry;
    indexes: { measuredAt: number };
  };
  settings: {
    key: string;
    value: Setting;
  };
}

const DB_NAME = 'offline_workout_log';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<WorkoutDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<WorkoutDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<WorkoutDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Exercises store
      if (!db.objectStoreNames.contains('exercises')) {
        const exerciseStore = db.createObjectStore('exercises', { keyPath: 'id' });
        exerciseStore.createIndex('name', 'name');
      }

      // Templates store
      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id' });
      }

      // Sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionStore.createIndex('endedAt', 'endedAt');
        sessionStore.createIndex('startedAt', 'startedAt');
        sessionStore.createIndex('templateId', 'templateId');
      }

      // Sets store
      if (!db.objectStoreNames.contains('sets')) {
        const setStore = db.createObjectStore('sets', { keyPath: 'id' });
        setStore.createIndex('sessionId', 'sessionId');
        setStore.createIndex('exerciseId', 'exerciseId');
        setStore.createIndex('sessionId-exerciseId', ['sessionId', 'exerciseId']);
      }

      // Exercise last cache
      if (!db.objectStoreNames.contains('exercise_last')) {
        db.createObjectStore('exercise_last', { keyPath: 'exerciseId' });
      }

      // Exercise PR cache
      if (!db.objectStoreNames.contains('exercise_pr')) {
        db.createObjectStore('exercise_pr', { keyPath: 'exerciseId' });
      }

      // Bodyweight entries
      if (!db.objectStoreNames.contains('bodyweight_entries')) {
        const bwStore = db.createObjectStore('bodyweight_entries', { keyPath: 'id' });
        bwStore.createIndex('measuredAt', 'measuredAt');
      }

      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// Helper to generate IDs
export function generateId(): string {
  return crypto.randomUUID();
}
