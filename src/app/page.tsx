import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { SearchWorkspace } from "@/components/search/search-workspace";
import { getRecruiter } from "@/lib/supabase/auth";
import styles from "./workspace.module.css";

async function Workspace() {
  const context = await getRecruiter();
  if (!context) {
    return (
      <main className={styles["workspace-page"]}>
        <header className={styles["workspace-header"]}>
          <Brand />
          <LogoutButton />
        </header>
        <section className={styles["welcome-card"]}>
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
    <SearchWorkspace
      key={context.recruiter.id}
      company={company.name}
      companyId={context.recruiter.company_id}
      recruiterId={context.recruiter.id}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<SearchWorkspace />}>
      <Workspace />
    </Suspense>
  );
}
