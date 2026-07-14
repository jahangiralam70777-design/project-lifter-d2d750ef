import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type State = { error: Error | null; key: number };

/**
 * Local error boundary for the User Management page.
 *
 * RULE: User Management must NEVER fall through to the route-level
 * `errorComponent` (which replaces the whole page with a "Forbidden /
 * Something went wrong" screen). If a child throws — including transient
 * "Forbidden: ban verification unavailable" style errors from a flaky RPC —
 * we render a non-blocking warning banner above a reset button instead of
 * blanking the page.
 */
export class UserManagementSafeBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log loudly but never block UI.
    console.warn("[UserManagement] recovered from render error", {
      message: error.message,
      stack: info.componentStack,
    });
  }

  reset = () => {
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  render() {
    const { error, key } = this.state;
    if (error) {
      const isAuth = /forbidden|unauthor|permission|ban/i.test(error.message);
      return (
        <div className="space-y-3 p-4 lg:p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm font-semibold">
                {isAuth
                  ? "Permission check unavailable — showing cached view"
                  : "User Management hit a non-blocking error"}
              </div>
              <p className="text-xs text-amber-100/80">
                {error.message}. The page stays usable; retry to refresh data.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-amber-400/50 bg-transparent text-amber-100 hover:bg-amber-500/20"
              onClick={this.reset}
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </div>
      );
    }
    return <div key={key}>{this.props.children}</div>;
  }
}
