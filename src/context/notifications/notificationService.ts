import { AppNotification } from "@/context/notifications/NotificationContext";
import type { Socket } from "socket.io-client";
// import type { AppNotification } from "@/context/notificationContext";

export interface NotificationHandlers {
  onNew: (notification: AppNotification) => void;
  onUpdate: (notification: AppNotification) => void;
  onRead: (payload: { id: string }) => void;
}

/**
 * Attaches socket listeners for all notification events.
 * Removes any previously registered listeners first to avoid duplicates.
 *
 * Returns a cleanup function — call it in useEffect's return or on unmount.
 *
 * Example:
 *   const unsubscribe = subscribeToNotifications(socket, { onNew, onUpdate, onRead })
 *   return unsubscribe  // inside useEffect
 */
export function subscribeToNotifications(
  socket: Socket,
  handlers: NotificationHandlers,
): () => void {
  // Remove stale listeners before adding fresh ones
  socket.off("notification:new");
  socket.off("notification:update");
  socket.off("notification:read");

  socket.on("notification:new", handlers.onNew);
  socket.on("notification:update", handlers.onUpdate);
  socket.on("notification:read", handlers.onRead);

  return () => unsubscribeFromNotifications(socket, handlers);
}

/**
 * Removes notification socket listeners.
 * Pass the same handler references used in subscribeToNotifications for
 * precise removal; omit handlers to remove all listeners for each event.
 */
export function unsubscribeFromNotifications(
  socket: Socket,
  handlers?: NotificationHandlers,
): void {
  if (handlers) {
    socket.off("notification:new", handlers.onNew);
    socket.off("notification:update", handlers.onUpdate);
    socket.off("notification:read", handlers.onRead);
  } else {
    socket.off("notification:new");
    socket.off("notification:update");
    socket.off("notification:read");
  }
}
