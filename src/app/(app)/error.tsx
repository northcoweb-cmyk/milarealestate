"use client";

import { useEffect } from "react";
import { report } from "@/components/error-reporter";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { report(`Screen crashed: ${error.message}`, error.stack); }, [error]);
  return (
    <main className="mx-auto max-w-md px-6 pt-24 text-center">
      <p className="display text-[34px]">Something went wrong</p>
      <p className="muted mt-2">That screen hit a problem. Your data is safe — I've let the team know.</p>
      <button className="btn btn-primary mt-6" onClick={reset}>Try again</button>
    </main>
  );
}
