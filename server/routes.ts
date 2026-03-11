import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initSocketIO, broadcastMessage, broadcastDelete, broadcastGlobal } from "./socket";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
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
        `SELECT id, room_id AS "roomId", user_id AS "userId", user_name AS "userName",
                text, CAST(timestamp AS TEXT) AS timestamp
         FROM messages WHERE room_id = $1 AND timestamp >= $2
         ORDER BY timestamp ASC LIMIT 300`,
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
        return res.status(400).json({ error: "Empty message" });
      }
      if (text.length > 2000) {
        return res.status(400).json({ error: "Message too long" });
      }
      const timestamp = Date.now();
      const result = await query(
        `INSERT INTO messages (room_id, user_id, user_name, text, timestamp)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, room_id AS "roomId", user_id AS "userId", user_name AS "userName",
                   text, CAST(timestamp AS TEXT) AS timestamp`,
        [roomId, userId, userName, text.trim(), timestamp]
      );
      const message = { ...result.rows[0], timestamp: parseInt(result.rows[0].timestamp, 10) };
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
      if (!messageId || !userId) return res.status(400).json({ error: "Missing fields" });
      const existing = await query(
        `SELECT id, room_id AS "roomId", user_id AS "userId" FROM messages WHERE id = $1`,
        [messageId]
      );
      if (existing.rows.length === 0) return res.status(404).json({ error: "Message not found" });
      const msg = existing.rows[0];
      if (msg.userId !== userId) return res.status(403).json({ error: "Not your message" });
      await query("DELETE FROM messages WHERE id = $1", [messageId]);
      broadcastDelete(msg.roomId, messageId);
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/messages/message error:", err);
      return res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.delete("/api/messages/:roomId", async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      await query("DELETE FROM messages WHERE room_id = $1", [roomId]);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to clear" });
    }
  });

  // ─── Admin ────────────────────────────────────────────────────────────────

  app.get("/api/admin", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const result = await query(
        `SELECT key, value FROM settings WHERE key IN ('admin_device_id', 'admin_name')`
      );
      const map: Record<string, string> = {};
      result.rows.forEach((r: any) => { map[r.key] = r.value; });
      return res.json({
        adminDeviceId: map.admin_device_id || null,
        adminName: map.admin_name || null,
      });
    } catch (err) {
      console.error("GET /api/admin error:", err);
      return res.status(500).json({ error: "Failed to fetch admin" });
    }
  });

  app.post("/api/admin/claim", async (req: Request, res: Response) => {
    try {
      const { deviceId, name } = req.body;
      if (!deviceId || !name) return res.status(400).json({ error: "deviceId and name required" });

      // Check if admin already exists
      const existing = await query(`SELECT value FROM settings WHERE key = 'admin_device_id'`);

      if (existing.rows.length > 0) {
        // Admin already claimed
        const currentAdminId = existing.rows[0].value;
        const isAdmin = currentAdminId === deviceId;
        const nameRow = await query(`SELECT value FROM settings WHERE key = 'admin_name'`);
        return res.json({
          claimed: isAdmin,
          isAdmin,
          adminDeviceId: currentAdminId,
          adminName: nameRow.rows[0]?.value || null,
        });
      }

      // No admin yet — this device claims admin
      const now = Date.now();
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('admin_device_id', $1, $2)`,
        [deviceId, now]
      );
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ('admin_name', $1, $2)`,
        [name, now]
      );

      broadcastGlobal("admin_set", { adminDeviceId: deviceId, adminName: name });

      return res.status(201).json({
        claimed: true,
        isAdmin: true,
        adminDeviceId: deviceId,
        adminName: name,
      });
    } catch (err) {
      console.error("POST /api/admin/claim error:", err);
      return res.status(500).json({ error: "Failed to claim admin" });
    }
  });

  // ─── Members ──────────────────────────────────────────────────────────────

  app.get("/api/members", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store");
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
      const { members, adminDeviceId, adminName } = req.body as {
        members: Array<{ id: string; name: string; phone?: string; avatar: string }>;
        adminDeviceId?: string;
        adminName?: string;
      };

      // Verify admin
      const adminRow = await query(`SELECT value FROM settings WHERE key = 'admin_device_id'`);
      if (adminRow.rows.length > 0 && adminRow.rows[0].value !== adminDeviceId) {
        return res.status(403).json({ error: "Only admin can add members" });
      }

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
        } catch { /* skip dup */ }
      }

      if (added.length > 0) {
        const addedNames = added.map((m: any) => m.name);
        const notifText = added.length === 1
          ? `${adminName || 'Admin'} added ${addedNames[0]}`
          : `${adminName || 'Admin'} added ${added.length} new members`;

        broadcastGlobal("members_updated", {
          action: "added",
          members: added,
          notification: notifText,
        });
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
      const { adminDeviceId } = req.body;

      // Verify admin
      const adminRow = await query(`SELECT value FROM settings WHERE key = 'admin_device_id'`);
      if (adminRow.rows.length > 0 && adminRow.rows[0].value !== adminDeviceId) {
        return res.status(403).json({ error: "Only admin can remove members" });
      }

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
      res.setHeader("Cache-Control", "no-store");
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
      if (!userName) return res.status(400).json({ error: "userName required" });
      const existing = await query("SELECT * FROM projects WHERE id = $1", [projectId]);
      if (existing.rows.length === 0) return res.status(404).json({ error: "Project not found" });
      const project = existing.rows[0];
      const teammates: string[] = project.teammates || [];
      if (teammates.includes(userName)) {
        return res.json({ project: { ...project, maxTeam: project.max_team, creatorId: project.creator_id } });
      }
      if (teammates.length >= project.max_team) return res.status(400).json({ error: "Team is full" });
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

  // ─── AI Chat ──────────────────────────────────────────────────────────────

  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body as {
        messages: Array<{ role: "user" | "model"; text: string }>;
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "AI not configured" });
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction:
          "You are GangAI, a sharp and helpful AI assistant embedded in Green Gang — a private mobile community app. " +
          "You're knowledgeable, concise, and match the gang's vibe: real, direct, and friendly. " +
          "Help members with questions, ideas, tech topics, creative projects, or anything they need. " +
          "Keep responses focused and well-formatted. Use markdown sparingly — only when it truly helps readability.",
      });

      const history = messages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const chat = model.startChat({ history });
      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.text);
      const responseText = result.response.text();

      return res.json({ reply: responseText });
    } catch (err: any) {
      console.error("POST /api/ai/chat error:", err);
      return res.status(500).json({ error: err?.message || "AI request failed" });
    }
  });

  // ─── Health ───────────────────────────────────────────────────────────────

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  return httpServer;
}
