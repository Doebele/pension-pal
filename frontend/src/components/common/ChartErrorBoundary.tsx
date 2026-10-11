import React from "react";

type ChartErrorBoundaryProps = {
  title?: string;
  children: React.ReactNode;
};

type ChartErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): ChartErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unbekannter Fehler in der Diagramm-Darstellung.",
    };
  }

  componentDidCatch(error: unknown): void {
    // Keep browser console trace for debugging.
    // eslint-disable-next-line no-console
    console.error("Chart rendering failed", error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <p className="font-semibold">{this.props.title || "Diagramm konnte nicht geladen werden"}</p>
          <p className="mt-1 text-xs text-rose-100/90">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-2 rounded border border-rose-400/50 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
          >
            Diagramm erneut laden
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

