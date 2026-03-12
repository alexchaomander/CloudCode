import fs from 'node:fs';
import path from 'node:path';

export function runMigrations(db: any, migrationsDir: string) {
  if (!fs.existsSync(migrationsDir)) return;

  const applied = new Set<string>(
    db.prepare('SELECT name FROM schema_migrations').all().map((row: any) => row.name)
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    tx();
  }
}
