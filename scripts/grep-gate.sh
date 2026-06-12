#!/usr/bin/env bash
# Spec 08 §4.3, §7.3 — coverage-ignore and eslint-disable comments are forbidden
# in src/ (except, for eslint-disable, inside src/adapters/ with justification).
# CI greps for them and fails the build if any appear where they are not allowed.
set -euo pipefail

fail=0

# 1. Coverage-ignore comments are forbidden anywhere in src/.
coverage_hits=$(grep -rEn \
  -e 'v8 ignore' \
  -e 'istanbul ignore' \
  -e 'c8 ignore' \
  --include='*.ts' --include='*.tsx' src 2>/dev/null || true)
if [ -n "$coverage_hits" ]; then
  echo "✗ Forbidden coverage-ignore comment(s) found in src/:"
  echo "$coverage_hits"
  fail=1
fi

# 2. eslint-disable comments are forbidden in src/ outside src/adapters/.
disable_hits=$(grep -rEn 'eslint-disable' \
  --include='*.ts' --include='*.tsx' src 2>/dev/null \
  | grep -v '^src/adapters/' || true)
if [ -n "$disable_hits" ]; then
  echo "✗ Forbidden eslint-disable comment(s) found outside src/adapters/:"
  echo "$disable_hits"
  fail=1
fi

# 3. .only / .skip in committed test code fail CI (Spec 08 §8 flaky-test policy).
focus_hits=$(grep -rEn '\b(describe|it|test)\.(only|skip)\b' \
  --include='*.ts' --include='*.tsx' src 2>/dev/null || true)
if [ -n "$focus_hits" ]; then
  echo "✗ Forbidden .only/.skip found in committed tests:"
  echo "$focus_hits"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ grep gate clean — no ignore/disable/focus comments"
fi
exit "$fail"
