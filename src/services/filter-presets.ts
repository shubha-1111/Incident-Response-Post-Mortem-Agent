import { getDatabase } from '../database/database.js';
import { isPostgresEnabled } from '../config/postgres.js';
import type { IncidentFilter } from './filter-engine.js';

/**
 * Saved filter presets (Phase 6.2).
 *
 * Uses the database dispatcher so it works on both SQLite (dev) and Postgres
 * (prod). The only dialect difference is the JSONB cast applied to the
 * `filter_json` column on Postgres; SQLite stores it as TEXT, so we branch on
 * `isPostgresEnabled()` and keep the rest of the SQL backend-agnostic (`?`
 * placeholders handled by the dispatcher).
 */
const JSONB = isPostgresEnabled() ? '::jsonb' : '';

export async function saveFilterPreset(
  userId: string,
  name: string,
  filter: IncidentFilter,
  isDefault: boolean = false
): Promise<void> {
  const db = await getDatabase();
  await db.run(
    `INSERT INTO filter_presets (user_id, name, filter_json, is_default)
     VALUES (?, ?, ?${JSONB}, ?)
     ON CONFLICT (user_id, name) DO UPDATE SET
       filter_json = EXCLUDED.filter_json${JSONB ? '::jsonb' : ''},
       is_default = EXCLUDED.is_default`,
    [userId, name, JSON.stringify(filter), isDefault ? 1 : 0]
  );
}

export async function getFilterPresets(userId: string): Promise<
  Array<{ id: number; userId: string; name: string; isDefault: boolean; filter: IncidentFilter; createdAt: string }>
> {
  const db = await getDatabase();
  const rows = (await db.all(
    'SELECT * FROM filter_presets WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    [userId]
  )) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    isDefault: Boolean(r.is_default),
    filter: typeof r.filter_json === 'string' ? JSON.parse(r.filter_json) : r.filter_json,
    createdAt: r.created_at,
  }));
}

export async function deleteFilterPreset(userId: string, name: string): Promise<void> {
  const db = await getDatabase();
  await db.run('DELETE FROM filter_presets WHERE user_id = ? AND name = ?', [userId, name]);
}
