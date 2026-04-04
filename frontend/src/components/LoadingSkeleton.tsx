const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
);

export const PageSkeleton = () => (
  <div className="min-h-screen bg-background">
    {/* Navbar skeleton */}
    <div className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header skeleton */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Stat cards skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </main>
  </div>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="overflow-hidden rounded-xl border border-border">
    <div className="border-b border-border bg-secondary/50 px-4 py-3">
      <Skeleton className="h-4 w-full" />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12">
    <p className="mb-2 text-lg font-semibold text-destructive">Something went wrong</p>
    <p className="mb-4 text-sm text-muted-foreground">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        Try Again
      </button>
    )}
  </div>
);

export const EmptyState = ({ title, description }: { title: string; description?: string }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center">
    <p className="mb-1 text-lg font-semibold text-foreground">{title}</p>
    {description && <p className="text-sm text-muted-foreground">{description}</p>}
  </div>
);

export default Skeleton;
