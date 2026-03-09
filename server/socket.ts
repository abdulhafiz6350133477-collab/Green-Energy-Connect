import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[socket] client connected: ${socket.id}`);

    socket.on("join_room", (roomId: string) => {
      if (typeof roomId !== "string" || roomId.length > 100) return;
      socket.join(roomId);
      console.log(`[socket] ${socket.id} joined room: ${roomId}`);
    });

    socket.on("leave_room", (roomId: string) => {
      socket.leave(roomId);
    });

    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function broadcastMessage(
  roomId: string,
  message: {
    id: string;
    roomId: string;
    userId: string;
    userName: string;
    text: string;
    timestamp: number;
  }
) {
  if (!io) return;
  io.to(roomId).emit("new_message", message);
}

export function broadcastDelete(roomId: string, messageId: string) {
  if (!io) return;
  io.to(roomId).emit("delete_message", { messageId });
}
