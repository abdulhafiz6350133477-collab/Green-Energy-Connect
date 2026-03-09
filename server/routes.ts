import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { initSocketIO, broadcastMessage, broadcastDelete } from "./socket";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  initSocketIO(httpServer);

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

      // Broadcast to all other clients in this room via Socket.IO
      broadcastMessage(roomId, message);

      return res.status(201).json({ message });
    } catch (err) {
      console.error("POST /api/messages error:", err);
      return res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Delete a single message (only the sender can delete their own message)
  app.delete("/api/messages/message/:messageId", async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const { userId } = req.body;

      if (!messageId || !userId) {
        return res.status(400).json({ error: "Missing messageId or userId" });
      }

      // Fetch the message first to verify ownership and get roomId for broadcast
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

      // Broadcast deletion to all clients in this room
      broadcastDelete(msg.roomId, messageId);

      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/messages/message error:", err);
      return res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Clear all messages in a room (admin use)
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

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  return httpServer;
}
