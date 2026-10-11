# Capability / readiness matrix

Source of truth in code: `src/lib/capabilities.ts` (`capabilityRegistry()`), served at `/api/capabilities`. States: live, internal_only, credentials_required, unsupported, unavailable. The table is what is known from local code and tests; "live" is never assumed without credentials present in the running environment.

| Capability | Local behavior verified | Needs for production |
|---|---|---|
| Chat agent (rule-based + model fallback) | Yes, 1868 scenario QA, unit tests | Model key + budget set |
| Mila calendar (own) | Yes | none |
| Google/Outlook calendar sync | Labels only; round trip NOT verified | OAuth creds, scopes audit, retry states |
| Email send | Approval flow tested with mocks; no real send | Gmail connection per user |
| Text/SMS | Not sent by Mila; user marks sent | n/a (stated honestly in UI) |
| Property lookup | Mock/cached data tested | Provider keys; evidence ledger not built |
| Street View photos | Proxy tested | Maps key |
| Social posts / images | Rendering checked with Playwright | none |
| Voice in/out | Browser speechSynthesis toggle only | Device testing; metering |
| Payments | Plan gating tested | Stripe live checkout/cancel untested |
| Refunds | Intake only | Owner/legal policy |
| Support / bug intake | Tested | GITHUB_BUG_REPO privacy decision |
