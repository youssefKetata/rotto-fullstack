import styles from "./login.module.css";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Rotto" };

export default function Login() {
  return (
    <main className={styles["login-page"]}>
      <section className={styles["login-story"]} aria-label="About Rotto">
        <Brand />
        <div className={styles["story-copy"]}>
          <h2>
            Great teams
            <br />
            start with
            <br />
            <em>the right people.</em>
          </h2>
        </div>
        <div
          className={styles["story-orbit"] + " " + styles["orbit-one"]}
          aria-hidden="true"
        />
        <div
          className={styles["story-orbit"] + " " + styles["orbit-two"]}
          aria-hidden="true"
        />
      </section>
      <section className={styles["login-panel"]} aria-label="Sign in">
        <div className={styles["mobile-brand"]}>
          <Brand />
        </div>
        <div className={styles["login-content"]}>
          <div className={styles["form-heading"]}>
            <h1>Sign in</h1>
            <p>Use your company’s recruiter account.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
