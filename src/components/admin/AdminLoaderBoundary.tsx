import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Self-healing loader + error boundary for the Admin workspace.
 *
 * Wraps the Admin route tree so that:
 *  - Render-time exceptions (lazy chunk failure, hook crash, undefined data)
 *    show a recovery UI instead of a blank screen.
 *  - A hydration stall (loader stuck > `stallMs`) surfaces a "Reload" CTA
 *    so the user is never trapped on "Loading admin workspace…".
 *  - One automatic hard-reload is attempted (guarded by sessionStorage) to
 *    recover from stale dynamic-import chunks after a deploy.
 */

type Props = {
  children: React.ReactNode;
  /** Show the stall CTA after this many ms of continuous "loading". */
  stallMs?: number;
  /** Whether the wrapped tree is still in its initial loading state. */
  loading?: boolean;
};

type State = {
  hasError: boolean;
  error: Error | null;
  stalled: boolean;
};

const AUTO_RELOAD_KEY = "__admin_loader_auto_reload__";

export class AdminLoaderBoundary extends React.Component<Props, State> {
  private stallTimer: number | null = null;

  state: State = { hasError: false, error: null, stalled: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidMount() {
    this.armStallTimer();
  }

  componentDidUpdate(prev: Props) {
    if (prev.loading !== this.props.loading) {
      this.armStallTimer();
    }
  }

  componentWillUnmount() {
    if (this.stallTimer) window.clearTimeout(this.stallTimer);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface the failure to whatever telemetry the app uses; keep console
    // noise low but breadcrumb-friendly.
    console.error("[AdminLoaderBoundary] render error:", error, info.componentStack);

    // Stale lazy-chunk recovery: attempt exactly one hard reload, then stop.
    const msg = String(error?.message || "");
    const isChunkErr =
      /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
    if (isChunkErr && !sessionStorage.getItem(AUTO_RELOAD_KEY)) {
      sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  }

  private armStallTimer = () => {
    if (this.stallTimer) window.clearTimeout(this.stallTimer);
    this.setState({ stalled: false });
    if (!this.props.loading) return;
    const ms = this.props.stallMs ?? 8000;
    this.stallTimer = window.setTimeout(() => {
      this.setState({ stalled: true });
    }, ms);
  };

  private handleRetry = () => {
    sessionStorage.removeItem(AUTO_RELOAD_KEY);
    this.setState({ hasError: false, error: null, stalled: false });
    this.armStallTimer();
    // Soft re-mount: forcing a state change won't re-run lazy imports, so a
    // location.reload is the most reliable way to recover from a stalled
    // suspense boundary or a thrown lazy import.
    window.location.reload();
  };

  private handleSoftRecover = () => {
    this.setState({ hasError: false, error: null, stalled: false });
    this.armStallTimer();
  };

  render() {
    const { hasError, error, stalled } = this.state;
    const { loading, children } = this.props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" aria-hidden />
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Admin workspace failed to load</h2>
                <p className="mt-1 text-sm text-muted-foreground break-words">
                  {error?.message || "Something went wrong while loading this view."}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button onClick={this.handleRetry} size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                    Reload workspace
                  </Button>
                  <Button onClick={this.handleSoftRecover} size="sm" variant="ghost">
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (loading && stalled) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-3">
            <div className="animate-pulse text-muted-foreground">
              Still loading admin workspace…
            </div>
            <p className="text-xs text-muted-foreground">
              This is taking longer than usual. The connection or a cached asset
              may be stale.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button onClick={this.handleRetry} size="sm">
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                Reload now
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  }
}
