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
          <span className={styles["story-label"]}>
            <span />
            THE PEOPLE BEHIND WHAT’S NEXT
          </span>
          <h2>
            Great teams
            <br />
            start with
            <br />
            <em>the right people.</em>
          </h2>
          <p>
            A little less searching.
            <br />A lot more possibility.
          </p>
        </div>
        <div className={styles["story-footer"]}>
          <span>Made for people who hire.</span>
          <span aria-hidden="true">↗</span>
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
            <span className={styles["eyebrow"]}>
              YOUR NEXT GREAT HIRE STARTS HERE
            </span>
            <h1>Welcome back.</h1>
            <p>Sign in to your recruiter workspace.</p>
          </div>
          <LoginForm />
          <p className={styles["login-note"]}>
            Use the recruiter account provided by your company.
          </p>
        </div>
        <span className={styles["panel-footer"]}>
          A thoughtful way to find talent.
        </span>
      </section>
    </main>
  );
}
