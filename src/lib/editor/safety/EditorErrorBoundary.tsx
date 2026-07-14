// Phase-4 — Non-blocking error boundary.
// Isolates editor panels so a crash in Inspector/Tree/Preview cannot
// take down the entire editor shell.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  area: string;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to console for debugging without bubbling.

    console.warn(`[editor:${this.props.area}] crashed`, error, info);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        role="alert"
        className="m-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
      >
        <div className="font-medium text-destructive">{this.props.area} failed to render</div>
        <div className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</div>
        <button
          type="button"
          onClick={this.reset}
          className="mt-2 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
        >
          Retry panel
        </button>
      </div>
    );
  }
}
