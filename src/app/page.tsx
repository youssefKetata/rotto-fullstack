import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { getRecruiter } from "@/lib/supabase/auth";

async function Workspace() {
  const context = await getRecruiter();
  if (!context) {
    return (
      <main className="workspace-page">
        <header className="workspace-header">
          <Brand />
          <LogoutButton />
        </header>
        <section className="welcome-card">
          <h1>Recruiter access required.</h1>
          <p>
            We couldn’t verify access to a recruiter workspace. Sign out and use
            the account provided by your company.
          </p>
        </section>
      </main>
    );
  }
  const { data: company, error } = await context.supabase
    .from("companies")
    .select("name")
    .eq("id", context.recruiter.company_id)
    .single<{ name: string }>();
  if (error || !company) throw new Error("Unable to load workspace.");

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Brand />
        <LogoutButton />
      </header>
      <section className="welcome-card">
        <span className="session-badge">
          <span />
          SIGNED IN
        </span>
        <h1>Welcome to {company.name}.</h1>
        <p>You’re signed in to your company’s recruiter workspace.</p>
        <div className="workspace-identity">
          <span className="company-initial" aria-hidden="true">
            {company.name.charAt(0)}
          </span>
          <div>
            <strong>{company.name}</strong>
            <span>Recruiter workspace</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="workspace-loading" role="status">
          Opening your workspace…
        </main>
      }
    >
      <Workspace />
    </Suspense>
  );
}
