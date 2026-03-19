import { useState, useEffect, useCallback, useRef } from "react";
import { fetchLogs, fetchJobs, fetchProcesses, fetchSessions, fetchHealth } from "../services/api";

export function usePolling(fetchFn, { interval = 30000, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;

    refresh();
    intervalRef.current = setInterval(refresh, interval);
    return () => clearInterval(intervalRef.current);
  }, [refresh, interval, enabled]);

  return { data, loading, error, refresh, lastUpdated };
}

export function useUiPathLogs(options = {}) {
  const fetchFn = useCallback(
    () => fetchLogs(options),
    [options.top, options.skip, options.filter, options.orderby]
  );
  const { data, loading, error, refresh } = usePolling(fetchFn, {
    interval: options.interval || 30000,
  });

  return {
    logs: data?.value || [],
    totalCount: data?.["@odata.count"] || 0,
    loading,
    error,
    refresh,
  };
}

export function useUiPathJobs(options = {}) {
  const fetchFn = useCallback(
    () => fetchJobs(options),
    [options.top, options.filter]
  );
  const { data, loading, error, refresh } = usePolling(fetchFn, {
    interval: options.interval || 30000,
  });

  return {
    jobs: data?.value || [],
    loading,
    error,
    refresh,
  };
}

export function useUiPathProcesses(interval = 60000) {
  const fetchFn = useCallback(() => fetchProcesses(), []);
  const { data, loading, error, refresh } = usePolling(fetchFn, {
    interval,
  });

  return {
    processes: data?.value || [],
    loading,
    error,
    refresh,
  };
}

export function useUiPathSessions(interval = 30000) {
  const fetchFn = useCallback(() => fetchSessions(), []);
  const { data, loading, error, refresh } = usePolling(fetchFn, {
    interval,
  });

  return {
    sessions: data?.value || [],
    recentlyOffline: data?.recentlyOffline || [],
    loading,
    error,
    refresh,
  };
}

export function useUiPathHealth() {
  const fetchFn = useCallback(() => fetchHealth(), []);
  const { data, loading, error, refresh } = usePolling(fetchFn, {
    interval: 60000,
  });

  return {
    connected: data?.connected || false,
    orchestratorStatuses: data?.orchestrators || [],
    loading,
    error,
    refresh,
  };
}
