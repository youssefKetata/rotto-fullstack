import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Rotto" };

export default function Login() {
  return (
    <main className="login-page">
      <section className="login-story" aria-label="About Rotto">
        <Brand />
        <div className="story-copy">
          <span className="story-label">
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
        <div className="story-footer">
          <span>Made for people who hire.</span>
          <span aria-hidden="true">↗</span>
        </div>
        <div className="story-orbit orbit-one" aria-hidden="true" />
        <div className="story-orbit orbit-two" aria-hidden="true" />
      </section>
      <section className="login-panel" aria-label="Sign in">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-content">
          <div className="form-heading">
            <span className="eyebrow">YOUR NEXT GREAT HIRE STARTS HERE</span>
            <h1>Welcome back.</h1>
            <p>Sign in to your recruiter workspace.</p>
          </div>
          <LoginForm />
          <p className="login-note">
            Use the recruiter account provided by your company.
          </p>
        </div>
        <span className="panel-footer">A thoughtful way to find talent.</span>
      </section>
    </main>
  );
}
