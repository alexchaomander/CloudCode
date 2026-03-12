export function seedProfiles(db: any) {
  const profiles = [
    { name: 'Claude Code', slug: 'claude-code', command: 'claude' },
    { name: 'Gemini CLI', slug: 'gemini-cli', command: 'gemini' },
    { name: 'GitHub Copilot CLI', slug: 'github-copilot-cli', command: 'github-copilot' },
    { name: 'Codex', slug: 'codex', command: 'codex' }
  ];

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO agent_profiles (name, slug, command, args_json, env_json) VALUES (?, ?, ?, '[]', '{}')`
  );
  for (const p of profiles) stmt.run(p.name, p.slug, p.command);
}
