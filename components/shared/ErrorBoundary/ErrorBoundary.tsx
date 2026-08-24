"use client";

import React from "react";
import styles from "./ErrorBoundary.module.css";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className={styles.wrap} role="alert">
          <h2 className={styles.title}>{this.props.title ?? "Er ging iets mis"}</h2>
          <p className={styles.message}>{this.state.error.message}</p>
          <button type="button" className={styles.retry} onClick={this.reset}>
            Opnieuw proberen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
