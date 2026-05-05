import * as React from "react";
import { Button } from "@/components/ui/button";

type State = { error: Error | null };
type Props = { children: React.ReactNode; fallback?: (e: Error, reset: () => void) => React.ReactNode };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">Something broke on this page</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <Button onClick={this.reset} className="mt-4">Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
