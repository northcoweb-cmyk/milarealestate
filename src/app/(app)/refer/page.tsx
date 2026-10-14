"use client";

import { Page } from "@/components/page";
import { PageHeader } from "@/components/ui";
import { ReferralPanel } from "@/components/referral-panel";

export default function ReferPage() {
  return (
    <Page wide>
      <PageHeader title="Invite & earn" />
      <div className="mx-auto max-w-3xl"><ReferralPanel /></div>
    </Page>
  );
}
