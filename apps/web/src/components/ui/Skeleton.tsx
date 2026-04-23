export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="data-grid skeleton-grid">
      <div className="grid-toolbar">
        <Skeleton className="h-10 wide" />
        <Skeleton className="h-10 pill" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-row">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ))}
    </div>
  );
}
