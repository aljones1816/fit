import { getSetting, setSetting } from '../data/queries';
import { isKeyLoaded } from './keyVault';

export type MigrationState = 'none' | 'partial' | 'complete';
export type EncryptionStatus = 'off' | 'active' | 'locked';

export interface EncryptionConfig {
  enabled: boolean;
  migrationState: MigrationState;
  migratedAt?: number;
}

const DEFAULTS: EncryptionConfig = {
  enabled: false,
  migrationState: 'none',
};

export async function getEncryptionConfig(): Promise<EncryptionConfig> {
  const enabled = await getSetting<boolean>('encryption.enabled');
  const migrationState = await getSetting<MigrationState>('encryption.migrationState');
  const migratedAt = await getSetting<number>('encryption.migratedAt');
  return {
    enabled: enabled ?? DEFAULTS.enabled,
    migrationState: migrationState ?? DEFAULTS.migrationState,
    ...(migratedAt != null ? { migratedAt } : {}),
  };
}

export async function setEncryptionEnabled(enabled: boolean): Promise<void> {
  await setSetting('encryption.enabled', enabled);
}

export async function setMigrationState(
  state: MigrationState,
  migratedAt?: number,
): Promise<void> {
  await setSetting('encryption.migrationState', state);
  if (migratedAt != null) {
    await setSetting('encryption.migratedAt', migratedAt);
  }
}

export async function getEncryptionStatus(): Promise<EncryptionStatus> {
  const config = await getEncryptionConfig();
  if (!config.enabled) return 'off';
  return isKeyLoaded() ? 'active' : 'locked';
}
