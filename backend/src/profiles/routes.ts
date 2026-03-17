import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { logAudit } from '../audit/service.js';
import type { AgentProfile } from '../db/schema.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseProfile(row: AgentProfile) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    command: row.command,
    args: JSON.parse(row.args_json) as string[],
    env: JSON.parse(row.env_json) as Record<string, string>,
    defaultWorkdir: row.default_workdir,
    startupTemplate: row.startup_template,
    stopMethod: row.stop_method,
    supportsInteractiveInput: row.supports_interactive_input === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const profileCreateSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).optional(),
  command: z.string().min(1).max(256),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  default_workdir: z.string().nullable().optional(),
  startup_template: z.string().nullable().optional(),
  stop_method: z.enum(['ctrl_c', 'kill']).default('ctrl_c'),
  supports_interactive_input: z.boolean().default(true),
});

const profileUpdateSchema = profileCreateSchema.partial();

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/profiles
  fastify.get('/api/v1/profiles', { preHandler: requireAuth }, async (request, reply) => {
    const rows = db.prepare('SELECT * FROM agent_profiles ORDER BY name ASC').all() as unknown as AgentProfile[];
    return reply.send({ profiles: rows.map(parseProfile) });
  });

  // POST /api/v1/profiles
  fastify.post('/api/v1/profiles', { preHandler: requireAdmin }, async (request, reply) => {
    const parseResult = profileCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const id = nanoid();
    const slug = data.slug ?? slugify(data.name);
    const now = new Date().toISOString();

    // Check slug uniqueness
    const existing = db.prepare('SELECT id FROM agent_profiles WHERE slug = ?').get(slug);
    if (existing) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `A profile with slug "${slug}" already exists`,
      });
    }

    db.prepare(`
      INSERT INTO agent_profiles (id, name, slug, command, args_json, env_json, default_workdir, startup_template, stop_method, supports_interactive_input, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      slug,
      data.command,
      JSON.stringify(data.args),
      JSON.stringify(data.env),
      data.default_workdir ?? null,
      data.startup_template ?? null,
      data.stop_method,
      data.supports_interactive_input ? 1 : 0,
      now,
      now
    );

    const row = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as unknown as AgentProfile;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'profile.created',
      targetType: 'agent_profile',
      targetId: id,
      metadata: { name: data.name, slug },
    });

    return reply.status(201).send({ profile: parseProfile(row) });
  });

  // GET /api/v1/profiles/:id
  fastify.get('/api/v1/profiles/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as unknown as AgentProfile | undefined;

    if (!row) {
      return reply.status(404).send({ error: 'Not Found', message: 'Profile not found' });
    }

    return reply.send({ profile: parseProfile(row) });
  });

  // PUT /api/v1/profiles/:id
  fastify.put('/api/v1/profiles/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as unknown as AgentProfile | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Profile not found' });
    }

    const parseResult = profileUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const now = new Date().toISOString();

    // If slug changed, check uniqueness
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = db.prepare('SELECT id FROM agent_profiles WHERE slug = ? AND id != ?').get(data.slug, id);
      if (slugConflict) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `A profile with slug "${data.slug}" already exists`,
        });
      }
    }

    const updatedSlug = data.slug ?? (data.name ? slugify(data.name) : existing.slug);

    db.prepare(`
      UPDATE agent_profiles SET
        name = ?,
        slug = ?,
        command = ?,
        args_json = ?,
        env_json = ?,
        default_workdir = ?,
        startup_template = ?,
        stop_method = ?,
        supports_interactive_input = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? existing.name,
      updatedSlug,
      data.command ?? existing.command,
      data.args !== undefined ? JSON.stringify(data.args) : existing.args_json,
      data.env !== undefined ? JSON.stringify(data.env) : existing.env_json,
      data.default_workdir !== undefined ? data.default_workdir : existing.default_workdir,
      data.startup_template !== undefined ? data.startup_template : existing.startup_template,
      data.stop_method ?? existing.stop_method,
      data.supports_interactive_input !== undefined
        ? data.supports_interactive_input ? 1 : 0
        : existing.supports_interactive_input,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as unknown as AgentProfile;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'profile.updated',
      targetType: 'agent_profile',
      targetId: id,
      metadata: { changes: data },
    });

    return reply.send({ profile: parseProfile(updated) });
  });

  // DELETE /api/v1/profiles/:id
  fastify.delete('/api/v1/profiles/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as unknown as AgentProfile | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Profile not found' });
    }

    // Check if any active sessions use this profile
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE agent_profile_id = ? AND status IN ('pending', 'running')
    `).get(id) as { count: number };

    if (activeSessions.count > 0) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Cannot delete profile with active sessions',
      });
    }

    db.prepare('DELETE FROM agent_profiles WHERE id = ?').run(id);

    logAudit({
      actorUserId: request.userId!,
      eventType: 'profile.deleted',
      targetType: 'agent_profile',
      targetId: id,
      metadata: { name: existing.name, slug: existing.slug },
    });

    return reply.status(204).send();
  });
};

export default profileRoutes;
