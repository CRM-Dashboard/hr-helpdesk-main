import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCollaborationData } from "../api/collabApi";
import { CollaborationData } from "./types";

const EMPTY: CollaborationData = {
  activitydata: [],
  deptdata: [],
  userdata: [],
};

/**
 * Loads the collaboration lookups (activities, departments, users) for a ticket
 * and exposes a `refresh` helper to re-pull after a new collaboration is added.
 * Guards against stale responses when the ticket changes.
 */
export function useCollaborationData(ticketId?: string) {
  const [data, setData] = useState<CollaborationData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!ticketId) {
      setData(EMPTY);
      return;
    }
    const reqId = ++reqIdRef.current;
    try {
      setLoading(true);
      const res = await fetchCollaborationData(ticketId);
      if (reqIdRef.current !== reqId) return;
      setData(res);
    } catch (e) {
      if (reqIdRef.current !== reqId) return;
      console.log("error while fetching collaboration data", e);
      setData(EMPTY);
    } finally {
      if (reqIdRef.current === reqId) setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...data, loading, refresh: load };
}
