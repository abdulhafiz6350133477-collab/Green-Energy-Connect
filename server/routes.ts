import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { initSocketIO, broadcastMessage, broadcastDelete, broadcastGlobal } from "./socket";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp BIGINT NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      avatar TEXT NOT NULL DEFAULT '?',
      added_at BIGINT NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      creator TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      teammates TEXT[] NOT NULL DEFAULT '{}',
      max_team INTEGER NOT NULL DEFAULT 4,
      timestamp BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
    )
  `);
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  initSocketIO(httpServer);
  await initDB();

  // ─── Messages ─────────────────────────────────────────────────────────────

  app.get("/api/messages/:roomId", async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const since = req.query.since ? parseInt(req.query.since as string, 10) : 0;
      if (!roomId || typeof roomId !== "string") {
        return res.status(400).json({ error: "Invalid room ID" });
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const result = await query(
        `SELECT id,
                room_id   AS "roomId",
                user_id   AS "userId",
                user_name AS "userName",
                text,
                CAST(timestamp AS TEXT) AS timestamp
         FROM messages
         WHERE room_id = $1 AND timestamp >= $2
         ORDER BY timestamp ASC
         LIMIT 300`,
        [roomId, since]
      );
      const messages = result.rows.map((row: any) => ({
        ...row,
        timestamp: parseInt(row.timestamp, 10),
      }));
      return res.json({ messages });
    } catch (err) {
      console.error("GET /api/messages error:", err);
      return res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { roomId, userId, userName, text } = req.body;
      if (!roomId || !userId || !userName || !text) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Message text cannot be empty" });
      }
      if (text.length > 2000) {
        return res.status(400).json({ error: "Message too long" });
      }
      const sanitizedText = text.trim();
      const timestamp = Date.now();
      const result = await query(
        `INSERT INTO messages (room_id, user_id, user_name, text, timestamp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id,
                   room_id   AS "roomId",
                   user_id   AS "userId",
                   user_name AS "userName",
                   text,
                   CAST(timestamp AS TEXT) AS timestamp`,
        [roomId, userId, userName, sanitizedText, timestamp]
      );
      const row = result.rows[0];
      const message = { ...row, timestamp: parseInt(row.timestamp, 10) };
      broadcastMessage(roomId, message);
      return res.status(201).json({ message });
    } catch (err) {
      console.error("POST /api/messages error:", err);
      return res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.delete("/api/messages/message/:messageId", async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const { userId } = req.body;
      if (!messageId || !userId) {
        return res.status(400).json({ error: "Missing messageId or userId" });
      }
      const existing = await query(
        `SELECT id, room_id AS "roomId", user_id AS "userId" FROM messages WHERE id = $1`,
        [messageId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }
      const msg = existing.rows[0];
      if (msg.userId !== userId) {
        return res.status(403).json({ error: "You can only delete your own messages" });
      }
      await query("DELETE FROM messages WHERE id = $1", [messageId]);
      broadcastDelete(msg.roomId, messageId);
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/messages/message error:", err);
      return res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.delete("/api/messages/:roomId", async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      await query("DELETE FROM messages WHERE room_id = $1", [roomId]);
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/messages error:", err);
      return res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // ─── Members ──────────────────────────────────────────────────────────────

  app.get("/api/members", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const result = await query(
        `SELECT id, name, phone, avatar, CAST(added_at AS TEXT) AS "addedAt"
         FROM members ORDER BY added_at ASC`
      );
      const members = result.rows.map((row: any) => ({
        ...row,
        addedAt: parseInt(row.addedAt, 10),
      }));
      return res.json({ members });
    } catch (err) {
      console.error("GET /api/members error:", err);
      return res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.post("/api/members", async (req: Request, res: Response) => {
    try {
      const { members } = req.body as { members: Array<{ id: string; name: string; phone?: string; avatar: string }> };
      if (!Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: "Members array required" });
      }
      const addedAt = Date.now();
      const added: any[] = [];
      for (const m of members) {
        if (!m.id || !m.name) continue;
        try {
          const result = await query(
            `INSERT INTO members (id, name, phone, avatar, added_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING
             RETURNING id, name, phone, avatar, CAST(added_at AS TEXT) AS "addedAt"`,
            [m.id, m.name, m.phone || null, m.avatar || m.name[0]?.toUpperCase() || '?', addedAt]
          );
          if (result.rows.length > 0) {
            added.push({ ...result.rows[0], addedAt: parseInt(result.rows[0].addedAt, 10) });
          }
        } catch {
          // skip duplicates
        }
      }
      if (added.length > 0) {
        broadcastGlobal("members_updated", { action: "added", members: added });
      }
      return res.status(201).json({ added });
    } catch (err) {
      console.error("POST /api/members error:", err);
      return res.status(500).json({ error: "Failed to add members" });
    }
  });

  app.delete("/api/members/:memberId", async (req: Request, res: Response) => {
    try {
      const { memberId } = req.params;
      await query("DELETE FROM members WHERE id = $1", [memberId]);
      broadcastGlobal("members_updated", { action: "removed", memberId });
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/members error:", err);
      return res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // ─── Projects ─────────────────────────────────────────────────────────────

  app.get("/api/projects", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      const result = await query(
        `SELECT id, title, description, creator, creator_id AS "creatorId",
                tags, teammates, max_team AS "maxTeam",
                CAST(timestamp AS TEXT) AS timestamp, status
         FROM projects ORDER BY timestamp DESC`
      );
      const projects = result.rows.map((row: any) => ({
        ...row,
        timestamp: parseInt(row.timestamp, 10),
      }));
      return res.json({ projects });
    } catch (err) {
      console.error("GET /api/projects error:", err);
      return res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const { id, title, description, creator, creatorId, tags, teammates, maxTeam, status } = req.body;
      if (!id || !title || !description || !creator || !creatorId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const timestamp = Date.now();
      const result = await query(
        `INSERT INTO projects (id, title, description, creator, creator_id, tags, teammates, max_team, timestamp, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, title, description, creator, creator_id AS "creatorId",
                   tags, teammates, max_team AS "maxTeam",
                   CAST(timestamp AS TEXT) AS timestamp, status`,
        [id, title.trim(), description.trim(), creator, creatorId,
         tags || [], teammates || [creator], maxTeam || 4, timestamp, status || 'open']
      );
      const project = { ...result.rows[0], timestamp: parseInt(result.rows[0].timestamp, 10) };
      broadcastGlobal("projects_updated", { action: "created", project });
      return res.status(201).json({ project });
    } catch (err) {
      console.error("POST /api/projects error:", err);
      return res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.post("/api/projects/:projectId/join", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { userName } = req.body;
      if (!userName) {
        return res.status(400).json({ error: "userName required" });
      }
      const existing = await query("SELECT * FROM projects WHERE id = $1", [projectId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }
      const project = existing.rows[0];
      const teammates: string[] = project.teammates || [];
      if (teammates.includes(userName)) {
        return res.json({ project: { ...project, maxTeam: project.max_team, creatorId: project.creator_id } });
      }
      if (teammates.length >= project.max_team) {
        return res.status(400).json({ error: "Team is full" });
      }
      const newTeammates = [...teammates, userName];
      const result = await query(
        `UPDATE projects SET teammates = $1 WHERE id = $2
         RETURNING id, title, description, creator, creator_id AS "creatorId",
                   tags, teammates, max_team AS "maxTeam",
                   CAST(timestamp AS TEXT) AS timestamp, status`,
        [newTeammates, projectId]
      );
      const updated = { ...result.rows[0], timestamp: parseInt(result.rows[0].timestamp, 10) };
      broadcastGlobal("projects_updated", { action: "updated", project: updated });
      return res.json({ project: updated });
    } catch (err) {
      console.error("POST /api/projects/:id/join error:", err);
      return res.status(500).json({ error: "Failed to join project" });
    }
  });

  // ─── Health ───────────────────────────────────────────────────────────────

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  return httpServer;
}
