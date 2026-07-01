import { useEffect, useState, type ReactNode } from "react";
import { type Socket } from "socket.io-client";
// import { getSocket } from "./socket";
import { SocketContext } from "./socketContext";
// import { useNotifications } from "@/context/notifications/NotificationContext";
import { getAuthCredentials } from "@/services/sapClient";
// import { useToast } from "@/hooks/use-toast";
// import { GraphMessage } from "@/features/mailHelpdesk/api/graphEmail";

function getUserId(): string | null {
  try {
    const raw = getAuthCredentials();
    return raw?.userName ?? null;
  } catch {
    return null;
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  // const { addNotification } = useNotifications();
  // const { toast } = useToast();

  // useEffect(() => {
  //   const userId = getUserId();
  //   if (!userId) return;

  //   const s = getSocket();
  //   setSocket(s);

  //   const handleConnect = () => {
  //     console.log("[Socket] Connected:", s.id);
  //     s.emit("register-agent", userId);
  //   };

  //   const handleEmail = (email: GraphMessage) => {
  //     console.log("handleEmail : email -->", email);

  //     const notification = {
  //       id: email.id,
  //       title: email.subject ?? "New Email",
  //       message: `From: ${email.from?.emailAddress?.address}`,
  //       createdAt: email.createdDateTime ?? "",
  //       read: false,
  //     };
  //     addNotification(notification);
  //     toast({ title: notification.title, description: notification.message });
  //   };

  //   s.on("connect", handleConnect);
  //   s.on("new-it-support-email", handleEmail);

  //   s.connect();

  //   return () => {
  //     s.off("connect", handleConnect);
  //     s.off("new-it-support-email", handleEmail);
  //     s.disconnect();
  //     setSocket(null);
  //   };
  // }, [addNotification, toast]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

// notificationService.ts is now unused
