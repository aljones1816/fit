import { getDB } from './db';
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
import { setSetting } from './queries';

interface BackupData {
  schemaVersion: number;
  exportedAt: number;
  data: {
    exercises: Exercise[];
    templates: Template[];
    sessions: Session[];
    sets: SetEntry[];
    exercise_last: ExerciseLast[];
    exercise_pr: ExercisePR[];
    bodyweight_entries: BodyweightEntry[];
    settings: Setting[];
  };
}

const SCHEMA_VERSION = 1;

export async function exportBackup(): Promise<void> {
  const db = await getDB();

  const backup: BackupData = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      exercises: await db.getAll('exercises'),
      templates: await db.getAll('templates'),
      sessions: await db.getAll('sessions'),
      sets: await db.getAll('sets'),
      exercise_last: await db.getAll('exercise_last'),
      exercise_pr: await db.getAll('exercise_pr'),
      bodyweight_entries: await db.getAll('bodyweight_entries'),
      settings: await db.getAll('settings'),
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split('T')[0];
  const filename = `workout-log-backup-${date}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);

  await setSetting('backup.lastExportedAt', Date.now());
}

export async function importBackup(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const backup: BackupData = JSON.parse(text);

    if (backup.schemaVersion > SCHEMA_VERSION) {
      throw new Error('Backup is from a newer app version');
    }

    const db = await getDB();

    // Clear all stores
    const stores = [
      'exercises',
      'templates',
      'sessions',
      'sets',
      'exercise_last',
      'exercise_pr',
      'bodyweight_entries',
      'settings',
    ] as const;

    for (const storeName of stores) {
      const tx = db.transaction(storeName, 'readwrite');
      await tx.store.clear();
    }

    // Import data
    if (backup.data.exercises) {
      for (const item of backup.data.exercises) {
        await db.add('exercises', item);
      }
    }

    if (backup.data.templates) {
      for (const item of backup.data.templates) {
        await db.add('templates', item);
      }
    }

    if (backup.data.sessions) {
      for (const item of backup.data.sessions) {
        await db.add('sessions', item);
      }
    }

    if (backup.data.sets) {
      for (const item of backup.data.sets) {
        await db.add('sets', item);
      }
    }

    if (backup.data.exercise_last) {
      for (const item of backup.data.exercise_last) {
        await db.put('exercise_last', item);
      }
    }

    if (backup.data.exercise_pr) {
      for (const item of backup.data.exercise_pr) {
        await db.put('exercise_pr', item);
      }
    }

    if (backup.data.bodyweight_entries) {
      for (const item of backup.data.bodyweight_entries) {
        await db.add('bodyweight_entries', item);
      }
    }

    if (backup.data.settings) {
      for (const item of backup.data.settings) {
        // Don't restore active session
        if (item.key !== 'session.activeId') {
          await db.put('settings', item);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Import failed:', error);
    return false;
  }
}
