# Wilde Super App implementation evidence

Implementation authorized 2026-09-25. Work is local to `wilde/theme`, starting at
`2e4261cd7155a4e0a4e8ad8f9aef1c309c416388`. No installer was run, no production records
were mutated, and no code or artifact was published. The existing n8n server was read
using the user-designated environment source; credentials were not copied into source,
fixtures or evidence. The connector is part of Orca, not another n8n deployment.

## Final executed checks

| Boundary | Evidence and result |
| --- | --- |
| TypeScript | `corepack pnpm run typecheck` passed. Normal desktop build repeats this gate. |
| Changed source quality | `ORCA_CODE_QUALITY_BASE=2e4261cd7155a4e0a4e8ad8f9aef1c309c416388 corepack pnpm run check:code-quality:changed`: passed across 74 changed source files, including type-aware, React Doctor, design-system and cast-rationale gates. |
| Business/connector/UI | 68 tests passed in 10 files, one Vitest worker. Real SQLite persistence/reopen/rollback/import, historical attribution and digest-valid malformed backup rejection; loopback n8n pagination/retry/cancel/restart; deterministic resolver/reporting and mocked DOM/capture tests. |
| Existing-feature regressions | 100 tests passed in 14 files: Spotify, disabled updater, speech service/API, navigation and workspace identity. No live Spotify playback commands were sent. |
| Hidden Windows app | 2 tests passed in 2.2 minutes: real client/project/note creation, IPC assignment review, restart persistence, exact workspace activation and return to client; separate actual default-input capture. |
| Live n8n | Implemented N8nClient returned 1 projected workflow and 100 projected executions from the existing server. Read-only. Collector lifecycle/retries are fixture-tested, not a long-running production soak. |
| Native local speech | Cached English WAV: 3.845 s audio, 15.562 s inference, nonempty 79-character transcript. All four installed model artifacts matched pinned SHA-256 catalog entries. |
| Six command audio fixtures | Windows SAPI synthesized each requested phrase to a file without playback. Genuine native Sherpa/Parakeet inference matched all six normalized phrases; cold-worker elapsed times 6.3–9.9 s. No cloud call or model download. |
| Actual microphone boundary | getUserMedia opened one live default-input track at 44,100 Hz for 503 ms and stopped it. Signal was silent (RMS 0); no audio saved. This proves capture access, not hardware identity or spoken recognition. |
| Startup | Same hidden fixture, five runs before/after, 1,000 cache files and 20 restored tabs. Median process-to-loaded: 6.93 s before, 3.04 s after; maximum-event-loop-stall median: 3.38 s before, 676 ms after. Cache/load effects prevent attributing improvement to this change. Workspace-ready and interactive terminal latency were not measured. |

Repeatable commands (PowerShell uses process-local Corepack shims on PATH, and
`ORCA_BACKGROUND_LAUNCH=1`; Git trust is process-local):

```text
corepack pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=1 src/main/wilde/business src/main/wilde/n8n src/shared/wilde/navigation-commands.test.ts src/renderer/src/components/wilde-business
corepack pnpm exec electron-vite build --mode e2e
# Then set SKIP_BUILD=1, ORCA_WILDE_TEST_MIC=1, PLAYWRIGHT_HTML_OPEN=never:
corepack pnpm exec playwright test tests/e2e/wilde-business.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1 --reporter=html,list
node tests/tools/benchmarks/startup-time-bench.mjs --label wilde-after --iterations 5 --files 1000 --state-profile restored-local-tabs --session-tabs 20
```

Sanitized local logs live beside this README (ignored generated artifacts):
`business-tests-final.txt`, `regression-tests-final.txt`, `business-e2e-final.txt`,
`typecheck-final.txt`, `changed-quality-final.txt`, `live-n8n-connector.json`,
`local-speech-inference.txt`, `local-model-integrity.txt`, `voice-six-native.txt`,
`microphone-capability.json`, and `startup-final.txt`. The HTML report with inspected
screenshots is `pr-evidence/wilde-super-app/rendered-report/index.html`.

## Review fixes and practical limits

Independent read-only review was completed. Fixes include immutable workspace-instance
identity; host revalidation at assignment commit; source-time workflow attribution;
delivery/handoff history surviving project moves; outcome timezone comparisons;
durable collection pause before restore; bounded worker teardown on timeout; and
strict imported evidence identity/scope validation. Mutation previews now show the
complete affected set with before/after ownership. Navigation state resets cancel
stale responses and capture; workspace return retains client context.

Storage is schema v1, additive to Orca's existing profile. All development used disposable
business databases; early intermediate v1 test databases are not release migration
fixtures. Backup/report limits are explicit (10,000 records; 10 MiB backups), and a
truncated snapshot is disclosed. Oversized backups fail without writing partial data.
History is retained in backups; the activity UI shows its latest 200 events. There is
no full historical revision browser or detailed per-gap retention ledger. Report history
is always described as incomplete rather than implying that absent runs equal zero.

Remote catalogs use existing verified runtime/SSH ownership and safe unavailable states;
live disconnected/reconnected SSH and mixed-version host acceptance remain unverified.
At most 20 ready paired environments are inspected; nested remote SSH targets are not
discovered. There is no cross-device business synchronization. Business context history
within a view is bounded and session-local; this is not persistent browser history.
Command transcripts are not logged; navigation outcomes do not yet have a durable command
audit trail. No Windows human-spoken six-command journey, Linux/macOS validation,
real secure-keyring failure, disk-full recovery, or installed-app upgrade was performed.

Earlier verification attempts are retained: one concurrent Vitest run encountered worker
startup timeouts; the bounded sequential rerun passed. Full repository lint has a
pre-existing anti-slop finding in `config/scripts/vitest-wilde-fork-updater-setup.ts` and
unrelated mobile warnings; the changed-code gate passes. The repository E2E typecheck
has pre-existing helper/dependency diagnostics; do not confuse the passing app typecheck
with a clean full E2E typecheck. The requested electron skill was unavailable; repository
hidden Playwright/CDP instructions were followed instead.

## Original planning baseline

Captured on 2026-09-25 (America/Halifax), before application changes.
Checkout: `C:/Users/sread/orca-wilde-build`, branch `wilde/theme`,
HEAD `2e4261cd7155a4e0a4e8ad8f9aef1c309c416388`.
Node `v24.13.0`; Corepack pnpm `12.0.0`; Windows.

All tests used `ORCA_BACKGROUND_LAUNCH=1`. No installed app launch, installer, profile
migration, production mutation, push, or publish occurred. Only documentation/evidence
was written. No raw business records or credentials are included here.

## Commands and results

```text
git -c safe.directory=C:/Users/sread/orca-wilde-build status --short
git -c safe.directory=C:/Users/sread/orca-wilde-build branch --show-current
git -c safe.directory=C:/Users/sread/orca-wilde-build rev-parse HEAD
git -c safe.directory=C:/Users/sread/orca-wilde-build remote -v
```

Initially clean; confirmed branch/HEAD/remotes above. Plain Git without the per-command
exception failed its ownership check. No persistent exception was added.

```text
corepack pnpm tc
```

Exit 1: nested `pnpm run typecheck` could not find bare pnpm. Output:
`baseline-typecheck.txt`. This is a tooling PATH issue, not a TypeScript diagnostic.

```text
corepack pnpm run typecheck
```

Exit 0. Output: `baseline-typecheck-direct.txt`. Windows PowerShell wraps pnpm's routine
stderr script echo as a NativeCommandError record in the redirected text; the process
exit code was 0 and there were no TypeScript diagnostics.

```text
corepack pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=3 src/shared/worktree/identity.test.ts src/shared/worktree/host-qualified-identity.test.ts src/shared/runtime-navigation.test.ts src/main/updater/updater.fork-disabled.test.ts src/main/wilde/spotify src/shared/wilde-spotify.test.ts src/main/speech/stt-service.test.ts src/main/speech/openai-transcription-client.test.ts src/main/speech/openai-api-key-store.test.ts src/main/runtime/rpc/methods/speech.test.ts src/renderer/src/lib/app-command-dispatch.test.ts src/renderer/src/store/slices/ui-page-navigation.test.ts
```

Exit 0: 13 test files, 98 tests passed, 48.48 seconds. Output:
`baseline-focused-tests.txt`. This invocation passed the listed path filters to Vitest;
the reported 13 files are the evidence, not an assertion that every path argument
matched a test file. Mocked speech/provider tests do not prove live transcription.

The updater test's actual location is directly under `src/main/`; the first invocation's
`src/main/updater/updater.fork-disabled.test.ts` filter matched nothing. Ran it explicitly:

```text
corepack pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=1 src/main/updater.fork-disabled.test.ts
```

Exit 0: 1 file, 2 tests passed, 9.21 seconds. Output: `baseline-updater-tests.txt`.
Combined executed baseline: 14 files / 100 tests across both invocations.

```text
corepack pnpm exec oxlint src/main/wilde src/shared/wilde-appearance.ts src/shared/wilde-spotify.ts src/shared/wilde-obs.ts src/shared/wilde-drive.ts src/renderer/src/components/wilde-spotify src/renderer/src/components/wilde-obs
```

Exit 0. Output: `baseline-wilde-lint.txt` (no findings). This was focused lint, not the
full repository lint pipeline.

```text
orca skills get electron
```

Exit 1: `Unknown skill topic "electron"`. Available CLI topics did not include electron.
Root AGENTS.md calls for this skill for rendered checks. Local available skill directories
also had no electron skill. Existing Playwright/CDP fixture instructions were inspected;
rendered checks have not been run during planning.

## Bounded live n8n read check

Loaded only the required fields from the explicitly supplied env file through Node's
`util.parseEnv`. HTTPS only, embedded URL credentials rejected, no redirects, 12-second
request timeout, 1 MiB response limit. No environment changes or secret writes.

```text
GET <configured instance>/api/v1/workflows?limit=1&excludePinnedData=true
GET <configured instance>/api/v1/executions?limit=1&includeData=false
```

Both returned 200, an array with one row and a pagination cursor. Execution details were
absent. Only status/count/shape booleans were retained in
`baseline-n8n-read-check.json`; no URLs, IDs, names, values or payloads. This verifies
configured endpoint/authentication access, not the proposed app collector, pagination,
retention completeness, or reporting accuracy. No n8n production record was modified.

## Not yet executed

Full lint; full/expanded unit and renderer suites; real SQLite business-store tests;
hidden Electron visual/restart journeys; comparable startup/interactive terminal timing;
physical microphone capture; genuine speech inference; Linux/Omarchy/macOS checks;
new Windows build/package. These remain explicit implementation/release gates.

## Sources consulted

- Existing source and instructions named in the canonical plan.
- [n8n authentication](https://docs.n8n.io/connect/n8n-api/authentication),
  [pagination](https://docs.n8n.io/connect/n8n-api/pagination),
  [execution contract](https://docs.n8n.io/connect/n8n-api/executions),
  [workflow contract](https://docs.n8n.io/connect/n8n-api/workflow).
  Old `/api/` docs URLs returned not-found; the current sitemap supplied `/connect/n8n-api/`.
  Endpoint Markdown/OpenAPI content was fetched directly when the browser fetch failed.
- [Sherpa Node API](https://k2-fsa.github.io/sherpa/onnx/javascript-api/index.html),
  [NeMo models](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html).
- [OpenAI transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create),
  [GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe).
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
  [Node SQLite](https://nodejs.org/api/sqlite.html). Implement against repository runtime
  support, not newer methods merely visible in latest documentation.
