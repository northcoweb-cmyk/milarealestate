#!/usr/bin/env bash
# Fix-it Felix gate: everything that must be green before anything ships.
# Usage: scripts/felix.sh [--quick]   (--quick skips the 1,800-scenario QA run and the production build)
set -u
cd "$(dirname "$0")/.."
fail=0
step() { printf '\n── %s\n' "$1"; shift; if "$@"; then echo "   ✅ pass"; else echo "   ❌ FAIL"; fail=1; fi; }
step "Type check" npx tsc --noEmit
step "Lint (errors only)" npx eslint . --quiet
step "Unit + flow tests" npx tsx --test tests/*.test.ts tests/*.test.mts
if [ "${1:-}" != "--quick" ]; then
  step "QA agent: 1,800+ scenarios (seed 0)" env QA_SEED=0 npx tsx tests/qa/run.mts all /tmp/qa-out
  step "Production build" npx next build
fi
echo; [ $fail -eq 0 ] && echo "ALL GREEN" || echo "THERE ARE FAILURES — fix them, then re-run."
exit $fail
