# Mila agent roster

Every agent reproduces before it fixes, proves the fix, adds a regression test, uses its own port and data dir, and never pushes. Only the **release-captain** pushes, and never when anything is red.

| Agent | Owns | Port | Run it after |
|---|---|---|---|
| release-captain | The gate, the order of checks, push to branch + main, live deploy check | n/a | Every release |
| fix-it-felix | `scripts/felix.sh`: types, lint, tests, 1,800-scenario QA, build | 3100 | Every change |
| agent-brain-qa | Chat understanding: intents, dates, addresses, calendar, follow-ups, content | n/a | Any change to `src/lib/agent` |
| screen-sweeper | Every screen, phone + desktop, light + dark: overlap, clipping, shift, jank | 3101 | Any UI change |
| journey-tester | Sign up, sign in, onboarding, trial, first tasks, sign out | 3102 | Any auth, onboarding or navigation change |
| media-qa | Street View, photo cache, event/listing/post photos and fallbacks | 3103 | Any property, photo or card change |
| content-studio-qa | Posts, 3-slide carousels, captions, hashtags, editor, viewer, save | 3104 | Any content change |
| growth-funnel-qa | 7-day trial, checklist, Day 1-7 funnel, plans, admin funnel | 3105 | Any trial, plan or admin change |
| launch-kit-keeper | `launch-kit/` logo + app screenshots, regenerated from the live app | 3106 | Any visible UI change, before a new video |
| ai-spend-guard | AI budgets, ceilings, kill switch, fallbacks, paid-API limits | n/a | Any provider, plan, credit or engine change |
| data-integrity | Store parity, migrations, tenant isolation, persistence | n/a | Any store, type or migration change |
| copy-voice | Every word users read: no vendor names, brand voice, pricing text | n/a | Any text change |
| trust-guard | Security, privacy, honesty, destructive-action confirmation | n/a | Before releases, after auth/billing/integrations |
| ui-polish | Visual design quality | 3107 | UI feels unprofessional |
| flow-clarity | First-run confusion and where things live | n/a | App feels confusing |
| mobile-perf | iPhone smoothness and jank | 3108 | Anything feels laggy |

## Standard order for a release
1. fix-it-felix (gate green)
2. specialists that match the diff, in parallel (each on its own port)
3. trust-guard + copy-voice + ai-spend-guard
4. release-captain: commit, push branch + main, check the live deploy
