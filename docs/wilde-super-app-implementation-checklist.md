# Wilde Super App progress and decision record

Last updated: 2026-09-25, America/Halifax.
Status: implementation authorized and integrated; final verification and local packaging in progress.

Canonical plan: [wilde-super-app.md](reference/wilde-super-app.md).
Evidence: [audit README](audits/wilde-super-app/README.md).

## Resume instructions

Read the plan and this record, then current repository instructions and Git state.
Use `C:/Users/sread/orca-wilde-build`; the F: project folder is reference material.
The user's execution request approved the complete implementation. No feature-by-feature
continuation approval is required; publishing and installation remain separate actions.
Update this record at each integrated milestone and before stopping: files/owners,
acceptance, decisions, commands/results, blockers, next concrete step. Never imply work
continued after the session ended. Current planning/evidence files are local-only under
the repository's docs ignore policy; allowlist the durable docs after approval.

## Starting state

- Branch `wilde/theme`; HEAD `2e4261cd7155a4e0a4e8ad8f9aef1c309c416388`; tracked/untracked
  Git state clean at inspection. Only ignored local planning/evidence files were added.
- `origin=https://github.com/stablyai/orca`, `wilde=https://github.com/shaecodes-wilde/orca-wilde.git`.
- Git needs per-command `-c safe.directory=C:/Users/sread/orca-wilde-build` because the
  worktree metadata lives on exFAT. No global trust configuration change made.
- Node `v24.13.0`, Corepack pnpm `12.0.0`, dependencies present.
- Shared stock Orca app ID/profile; update feed disabled; Spotify, OBS, Drive present.
- n8n configuration supplied explicitly by user; values never recorded. Variable names
  needed are `N8N_API_URL` / `N8N_API_KEY`. Reuse the user-provided source path from the
  conversation; do not duplicate secrets or unrelated configuration into this repository.
- Local Parakeet TDT v3 files present; cloud speech credential absent. Inference/mic not tested.

## Accepted scope refinements to carry forward

- User explicitly wants assigning an existing workspace/project to a client in the database.
- Include existing Orca project association as well as business delivery-project ownership.
- No new customer creation needed for assignment; show project/workspace consistency and
  bulk/reassignment impact previews; historical attribution stays with the old scope.
- User confirmed Spotify is working well: preserve the card's layout, controls, playback
  and visualizer. Regression checking only; voice ducking remains deferred.

## Implemented architecture

- SQLite sidecar in active profile, existing adapter, one bounded DB worker.
- Existing immutable worktree/folder + owner identity; explicit orphan/unavailable states.
- Four primary destinations with existing Orca agent automations preserved separately.
- Trusted desktop IPC and validated command registry; no remote business service/sync.
- One read-only n8n collector, documented partial history, no workflow mutation methods.
- Operational execution evidence separated from idempotent imported business outcomes.
- Existing local Sherpa/Parakeet speech path; command mode cannot insert into a terminal.
- Strict connector credential storage; command speech uses only the local provider.
- Context preview/draft preparation with explicit selection; no automatic assistant send.
- Defer Spotify ducking; preserve its player and playback.

## Milestones

- [x] Plan approval: user's implementation request, 2026-09-25.
- [x] 0: isolated baseline, hidden launch, profile and updater safeguards.
- [x] 1: SQLite worker, migration, first restart/workspace/note journey.
- [x] 2: clients/projects/knowledge/activity/assignment/archive/backup interface.
- [x] 3: existing-server n8n connector, assignment, collection and operational screens.
- [x] 4: metric definitions, historical attribution and idempotent outcome import.
- [x] 5: six command forms, local capture/transcription path and context/draft previews.
- [ ] 6: final packaging and evidence reconciliation; see remaining verification below.

## Checks already run

- `corepack pnpm tc`: exit 1, nested bare pnpm unavailable on PATH (environment failure).
- `corepack pnpm run typecheck`: exit 0.
- Focused Vitest invocation documented in evidence: exit 0, 13 files / 98 tests, 48.48 s.
- Corrected updater safeguard path run separately: exit 0, 1 file / 2 tests, 9.21 s.
  Total across the two invocations: 14 files / 100 tests.
- Focused Wilde oxlint invocation documented in evidence: exit 0.
- n8n HTTPS metadata probes: workflows 200, executions 200; one row each, cursor present,
  execution details absent. Not end-to-end app validation.
- `orca skills get electron`: exit 1, unknown skill topic. No desktop was opened for tests.

## Next action

Finish the final source checks, hidden rendered acceptance, startup comparison and local
Windows artifact. Preserve the working installation. Report actual evidence separately
from unverified platform and full spoken-command coverage.

## Completion evidence format

For each milestone: acceptance → implementation/files → exact verification → result →
fixture/live/platform classification → unresolved risks → next step. Fresh reviewer findings
must be tracked to a fix or explicitly justified deferral. Keep concurrency at lead plus
at most two implementers, and one build/E2E process.

## Execution 2026-09-25
Full implementation authorized by the user's execution request. Starting tree clean at the documented HEAD. Temporary Corepack shims are process-local. Missing electron skill rechecked; use repository's explicit hidden Playwright fixture instructions. Baseline e2e build passed. Startup/terminal E2E and full lint in progress before application edits.

Acceptance before implementation: persistent client/project/note after reopen; exact owner-host-instance assignment; reject mismatched and archived parents; revision conflicts and idempotent retries; transactional backup restore; no secret/raw payload in evidence; typed and voice navigation never write terminal text. Failures must be explicit, scoped and recoverable. New UI follows a restrained operational ledger direction (DFII 13), existing Geist/tokens/shadcn and Wilde chrome; compact actionable rows, no new animation or font.
