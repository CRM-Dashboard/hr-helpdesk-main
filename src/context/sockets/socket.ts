import { sapClientBase } from "@/services/sapClient";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = sapClientBase.getUri();

let socketInstance: Socket | null = null;

/**
 * Returns the singleton socket instance, creating it on first call.
 * Does not auto-connect — call socket.connect() explicitly so we
 * never open a connection before the user is authenticated.
 */
export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // transports: ["websocket", "polling"],
    });
  }
  return socketInstance;
}

/**
 * Disconnects and destroys the singleton so a fresh connection
 * can be created (e.g. after logout).
 */
export function destroySocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
