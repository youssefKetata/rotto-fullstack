"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { searchApi } from "@/lib/search/browser";
import type { CompanyPlan } from "@/lib/search/contracts";

export function CheckoutStatus({ canceled }: { canceled: boolean }) {
  const [status, setStatus] = useState<"checking" | "paid" | "waiting">(
    "checking",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (canceled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let checks = 0;
    async function check() {
      try {
        const plan = await searchApi<CompanyPlan>("/api/plan", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
        });
        if (controller.signal.aborted) return;
        if (plan.plan === "paid") {
          setStatus("paid");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (++checks < 6) timer = setTimeout(() => void check(), 2000);
      else setStatus("waiting");
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt, canceled]);

  return (
    <>
      <h1>
        {canceled
          ? "Checkout canceled"
          : status === "paid"
            ? "Your workspace is upgraded"
            : "Waiting for payment confirmation"}
      </h1>
      <p role="status">
        {canceled
          ? "You can return to your workspace and reopen checkout whenever you’re ready."
          : status === "paid"
            ? "You can now run new searches and refine your results."
            : status === "checking"
              ? "Checking whether Stripe has confirmed your subscription…"
              : "Your plan has not been confirmed yet. Check again shortly."}
      </p>
      {!canceled && status === "waiting" && (
        <button
          type="button"
          onClick={() => {
            setStatus("checking");
            setAttempt((value) => value + 1);
          }}
        >
          Check again
        </button>
      )}
      <p>
        <Link href="/">Return to workspace</Link>
      </p>
    </>
  );
}
