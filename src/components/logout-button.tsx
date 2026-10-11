"use client";

import styles from "./controls.module.css";

import { useState } from "react";
import { DropdownMenuItem } from "./ui/dropdown-menu";

export function LogoutButton({ menuItem = false }: { menuItem?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.replace("/login");
    } catch {
      setError("Unable to sign out. Please try again.");
      setPending(false);
    }
  }
  if (menuItem) {
    return (
      <>
        <DropdownMenuItem
          className={styles["secondary-button"]}
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {error && (
          <p className={styles["form-error"]} role="alert">
            {error}
          </p>
        )}
      </>
    );
  }
  return (
    <div className={styles["logout-control"]}>
      <button
        className={styles["secondary-button"]}
        onClick={signOut}
        disabled={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p className={styles["form-error"]} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
