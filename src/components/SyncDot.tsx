/** Pulsing dot that changes colour based on data freshness */
export function SyncDot({ isRefreshing, elapsed }) {
  if (isRefreshing) {
    return (
      <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
    );
  }
  const isStale = elapsed > 10 * 60 * 1000; // 10 min
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full transition-colors duration-500 ${
        isStale ? "bg-amber-400" : "bg-emerald-500"
      }`}
    />
  );
}
