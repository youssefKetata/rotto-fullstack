"use client";

import controls from "@/components/controls.module.css";
import styles from "./workspace.module.css";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles["workspace-loading"]}>
      <div>
        <h1>We couldn’t open your workspace.</h1>
        <p className={styles["muted"]}>Please try again in a moment.</p>
        <button className={controls["secondary-button"]} onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
