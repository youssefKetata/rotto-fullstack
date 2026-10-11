"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="workspace-loading">
      <div>
        <h1>We couldn’t open your workspace.</h1>
        <p className="muted">Please try again in a moment.</p>
        <button className="primary-button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
