import { useContext } from "react";
import type { Socket } from "socket.io-client";
import { SocketContext } from "@/context/sockets/socketContext";

/**
 * Returns the singleton Socket.IO instance from context.
 *
 * Must be used inside <SocketProvider>.
 *
 * Example:
 *   const socket = useSocket()
 *   socket?.emit("my:event", payload)
 */
export function useSocket(): Socket | null {
  return useContext(SocketContext);
}
