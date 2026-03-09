import { io, Socket } from "socket.io-client";
import { getApiUrl } from "./query-client";

let socket: Socket | null = null;

function getSocketUrl(): string {
  const apiUrl = getApiUrl();
  // Strip trailing slash
  return apiUrl.replace(/\/$/, "");
}

export function getSocket(): Socket {
  if (!socket) {
    const url = getSocketUrl();
    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });

    socket.on("connect", () => {
      console.log("[socket] connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket] disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.warn("[socket] connection error:", err.message);
    });
  }

  return socket;
}

export function joinRoom(roomId: string) {
  const s = getSocket();
  s.emit("join_room", roomId);
}

export function leaveRoom(roomId: string) {
  const s = getSocket();
  s.emit("leave_room", roomId);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
