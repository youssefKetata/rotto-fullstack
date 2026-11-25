import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getRecruiter } from "@/lib/supabase/auth";
import { CheckoutStatus } from "./status";
import styles from "../../workspace.module.css";

type Query = Promise<{ checkout?: string | string[] }>;

async function ReturnStatus({ searchParams }: { searchParams: Query }) {
  if (!(await getRecruiter())) redirect("/login");
  const { checkout } = await searchParams;
  if (checkout !== "complete" && checkout !== "canceled") redirect("/");
  return <CheckoutStatus canceled={checkout === "canceled"} />;
}

export default function BillingReturn({
  searchParams,
}: {
  searchParams: Query;
}) {
  return (
    <main className={styles["workspace-page"]}>
      <section className={styles["welcome-card"]}>
        <Suspense fallback={<p>Loading checkout status…</p>}>
          <ReturnStatus searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
