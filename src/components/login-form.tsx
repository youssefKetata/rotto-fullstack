"use client";

import controls from "./controls.module.css";
import styles from "./login-form.module.css";

import { useState, useSyncExternalStore, type FormEvent } from "react";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function LoginForm() {
  // Keep submission disabled until React has attached the JSON submit handler.
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "navigating">(
    "idle",
  );
  const [error, setError] = useState("");
  const pending = status !== "idle";

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !hydrated) return;
    const fields = new FormData(event.currentTarget);
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Unable to sign in. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("navigating");
      // A new sign-in starts with an empty brief; resuming is a separate action.
      window.location.replace("/?new=1");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
      setStatus("idle");
    }
  }

  return (
    <form
      method="post"
      action="/api/auth/login"
      onSubmit={signIn}
      className={styles["login-form"]}
      aria-busy={pending}
    >
      <div className={styles["field"]}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          maxLength={254}
          required
          disabled={pending}
        />
      </div>
      <div className={styles["field"]}>
        <label htmlFor="password">Password</label>
        <div className={styles["password-field"]}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            maxLength={256}
            required
            disabled={pending}
          />
          <button
            type="button"
            className={styles["password-toggle"]}
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            disabled={pending}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {error && (
        <p className={controls["form-error"]} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className={styles["primary-button"] + " " + styles["sign-in-button"]}
        data-pending={pending}
        disabled={pending || !hydrated}
        aria-label={pending ? "Signing in" : "Sign in"}
      >
        <span
          className={styles["sign-in-label"]}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={styles["sign-in-idle"]} aria-hidden={pending}>
            Sign in
          </span>
          <span className={styles["sign-in-progress"]} aria-hidden={!pending}>
            {status === "navigating" ? "Opening workspace…" : "Signing in…"}
          </span>
        </span>
        <span className={styles["sign-in-icon"]} aria-hidden="true">
          <svg
            className={styles["sign-in-arrow"]}
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
          <svg
            className={styles["sign-in-spinner"]}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle className={styles["spinner-track"]} cx="12" cy="12" r="9" />
            <circle className={styles["spinner-arc"]} cx="12" cy="12" r="9" />
          </svg>
        </span>
      </button>
    </form>
  );
}
