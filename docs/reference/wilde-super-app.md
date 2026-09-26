# Wilde Systems Super App: v1 implementation plan

Status: implementation approved by Shae on 2026-09-25. Audit date: 2026-09-25 (America/Halifax).
This is one implementation initiative, milestones 0â€“6. Approval covers implementation,
integration, testing, review, and local build artifacts for the whole plan. It does not
authorize publishing, installation over the working app, production mutations, paid
usage, or transferring business records to another system.

Progress and decisions: [implementation checklist](../wilde-super-app-implementation-checklist.md).
Executed checks: [baseline evidence](../audits/wilde-super-app/README.md).
These planning/evidence files currently follow the repository's local-only `docs/**`
ignore convention. Milestone 0 will add exact allowlist entries for the durable design,
progress record, setup documentation, and sanitized evidence summaries; raw run artifacts
remain local. No application code or existing configuration was changed in this audit.

## 1. Outcome and boundaries

An internal, single-operator desktop app answers: who is the work for, what are we
delivering, what is running, and what needs attention. Four primary destinations:
Home, Clients, Workspaces, Automations. Projects and curated knowledge live within a
client. Existing Orca development features remain accessible through Workspaces and
the existing utility navigation and shortcuts.

The first end-to-end gate is: create a client and delivery project, assign an existing
workspace, save a delivery note, restart the isolated app, open the client, reopen the
same workspace on the right host, and retrieve that note. This gate includes real IPC
and disk persistence; an in-memory store demonstration does not pass it.

Shae's follow-up is part of the contract: existing workspaces AND existing Orca
projects can be assigned to a client selected from the database. Creating a new client
is never required merely to associate an existing workspace/project.

Data initially belongs to the selected installation and active Orca profile. Its database
does not follow cloud login, SSH pairing, or another installation. Windows and
Linux/Omarchy are primary targets; macOS compatibility is preserved but platform
verification is reported separately. No customer login, multi-user collaboration,
billing, campaigns, generic plugin system, always-on service, wake word, arbitrary
voice shell execution, autonomous fixes, or n8n production mutations enter v1.

## 2. Confirmed current state

| Area | Evidence and implication |
| --- | --- |
| Working source | `C:/Users/sread/orca-wilde-build`, branch `wilde/theme`, HEAD `2e4261cd7155a4e0a4e8ad8f9aef1c309c416388`, initially clean. Package `orca` version `1.4.197`. |
| Git layout | This is a worktree whose Git metadata is on exFAT under `F:/Projects/orca`. Use per-command `-c safe.directory=C:/Users/sread/orca-wilde-build`; no global Git trust changes. |
| Remotes | `origin` is upstream `stablyai/orca`; `wilde` is `shaecodes-wilde/orca-wilde`. No fetch/merge/reset/push occurred. |
| Instructions | Root `AGENTS.md`, `tests/AGENTS.md`, `tests/e2e/AGENTS.md`, `WILDE.md`, `README.md`, `docs/STYLEGUIDE.md`, SSH boundary and remote wire compatibility references inspected. |
| Identity | `config/electron-builder.config.cjs` uses `com.stablyai.orca`; `WILDE.md` explicitly says this build replaces stock Orca and shares its profile. Preserve identity and installer/update behavior. |
| Updates | `src/main/updater/fork-update-feed.ts` returns `null`. Preserve and regression-test it. |
| Branding and utilities | Existing Wilde CSS/tokens, `app-shell/WildeBrandLockup.tsx`, `resources/wilde/`, Spotify under `src/main/wilde/spotify/` and `components/wilde-spotify/`. OBS and Drive sidebar integrations also exist and must survive. |
| Shell | `app-shell/AppWorkspaceShell.tsx` lazily renders active pages and retains the terminal workbench. Navigation lives in `components/sidebar/SidebarNav.tsx` and `store/slices/ui/ui-slice-view-actions.ts`. Extend this shell rather than adding another router. |
| Commands | `WorktreeJumpPalette.tsx`, `components/cmd-j/`, shared keybinding definitions, `app-shell/app-command-handlers.ts`, and `lib/app-command-dispatch.ts`. The last dispatches renderer keybinding actions; it is not a validated business service. |
| Workspace identity | `src/shared/worktree/identity.ts` defines immutable `wt2` identity from execution host plus `instanceId`. `Worktree.id` remains a mutable repo/path locator. Legacy records may lack immutable identity. |
| Folder and remote workspaces | `folder-workspace-types.ts`, `workspace-scope.ts`, `execution-host.ts`, and `lib/worktree-activation.ts` distinguish folder workspaces, local, SSH, and paired runtimes. Folder UUID + owning host/runtime is its link identity. |
| Existing projects | `src/shared/project-types.ts` represents Orca repository projects and host setups. Business delivery projects require a distinct model and namespace. |
| Persistence | `src/main/persistence/loading-store/store.ts` and related domains own `orca-data.json`; `Store.getProfileStorageDirectory()` supplies the correct storage root. Profile paths are in `src/main/orca-profiles/profile-storage-paths.ts`. |
| SQLite | `src/main/sqlite/sync-database.ts` already wraps `node:sqlite`; search stores use it. Reuse it without a new native dependency or ORM. |
| IPC/RPC/CLI | Typed preload bridges under `src/preload/api/`; registration in `src/main/ipc/register-core-handlers/register-core-handlers.ts`; Zod RPC contracts in `src/main/runtime/rpc/core.ts` and `methods/`; CLI in `src/cli/` targets the authenticated runtime. |
| Secure storage | `src/shared/secret-store.ts`, `src/main/host/electron-secret-store.ts`, `secure-file.ts`, and Spotify's encrypted envelope are reusable. Linux `basic_text` must not qualify as protected storage. |
| Existing security gap | `src/main/speech/openai-api-key-store.ts` permits plaintext fallback and uses a home-level credential file. `openai-transcription-client.ts` lacks a request abort/timeout. Fix narrowly before exposing cloud command transcription. Do not migrate unrelated accounts. |
| Speech | `use-audio-capture.ts`, `DictationController.tsx`, `src/main/ipc/speech.ts`, `src/main/speech/stt-service.ts`, worker modules, and model catalog already implement actual capture and local/cloud transcription. Existing dictation inserts text, so command mode needs a distinct final-transcript destination. |
| Speech configuration | Parakeet TDT v3 INT8 model files exist in the current model cache. File presence/lengths were inspected; inference, hashes, microphone permission, and microphone capture have not been verified. Existing OpenAI speech credential file is absent. |
| n8n configuration | User-supplied configuration contains `N8N_API_URL` and `N8N_API_KEY`. A bounded HTTPS GET for one workflow and one execution returned 200; execution details were excluded. Values, record names, IDs, and payloads were not recorded. |
| Tests | Vitest, Testing Library, Electron Playwright/CDP, restart fixtures, terminal latency and startup benchmarks, SSH fixture scripts, and packaging checks already exist. |

Baseline executed: direct typecheck passed; 98 tests in 13 selected suites plus two
updater safeguard tests in a separate suite passed; focused Wilde lint passed.
`corepack pnpm tc` failed because its nested bare `pnpm`
was not on PATH; `corepack pnpm run typecheck` passed. Full lint, broad regression
suites, startup/typing measurements, rendered checks, and a fresh package build remain
milestone-0/final gates, not claimed baseline successes.

## 3. Architecture decisions

### A. One bounded Wilde service, one business database

Add `src/main/wilde/business/` and shared contracts under `src/shared/wilde/`.
Persist `wilde-business.sqlite` under `Store.getProfileStorageDirectory()` in the
selected installation. Reuse the SQLite adapter, secure path/file helpers, UUIDs,
Zod validation, and existing lifecycle hooks. Enable foreign keys and WAL; use
transactions, parameterized queries, versioned migrations, and bounded queries.

The trusted main process owns IPC authorization, credentials, networking, and service
lifecycle. A single lazy database worker handles synchronous SQLite, search, imports,
and aggregates off the terminal/main event loop. Serialize writes; bound pending work
and return a busy/cancelled result instead of allowing an unlimited queue. The worker
receives projected data, never credentials. Start the collector after core workspace
hydration; no n8n request or speech model load blocks startup.

Rejected: adding business records to the frequently saved Orca session JSON; another
server/database service; Electron renderer persistence; syncing records through existing
host settings; a new ORM/native SQLite module; a generic event bus/plugin platform.
The existing session JSON is a poor fit for transactional relations and growing execution
evidence. An additive SQLite sidecar also makes rollback less invasive.

### B. Desktop-owned business scope, existing workspace execution routes

Add a narrow typed `window.api.wildeBusiness` preload surface. All operations call one
validated service/command layer. IPC accepts only the trusted app renderer/frame;
embedded browser pages cannot invoke it. Reuse sender-scoped cancellation and cleanup.
Do not expose a generic URL, SQL, shell, filesystem, or arbitrary IPC proxy.

Business records do not become remotely readable merely because a device is paired.
No new public listener or remote business RPC API is needed for v1. Existing RPC/CLI
workspace catalog and navigation mechanisms remain the execution boundary for remote
targets. Contracts are transport-neutral enough for a later authenticated backend,
without implementing that backend. Unsupported/older hosts yield an explicit result.

### C. UI and operational features are independent of appearance

Use canonical tokens, shadcn primitives, Geist typography, existing focus treatment,
Wilde oil-slick chrome, and reduced-motion conventions from `docs/STYLEGUIDE.md`.
Feature availability is independent of the Wilde appearance toggle. Lazy mount pages,
paginate inventories, and use narrow Zustand selectors. Keep the terminal workbench
mounted across business-page navigation; preserve split, scroll, agent and reconnect
state. Preserve Spotify's compact utility position and OBS/Drive utilities.

No scoring model or inferred customer health. Home shows concrete overdue dates,
blocked projects, missing next steps, unresolved observed failures and stale connections,
with the evidence and action behind each item.

## 4. Data model, integrity, and history

All local business entities have UUIDs, created/updated UTC timestamps, revision numbers,
and archive state where appropriate. Display names are never keys. Timestamps include
their source; date-only project dates stay date-only. Store an IANA reporting timezone
(default the installation's timezone, `America/Halifax` here).

| Entity/table family | Fields and constraints |
| --- | --- |
| Client | Organization/display name, relationship status (`prospect`, `active`, `paused`, `former`), owner label, contacts, tags, notes, validated system links, `kind=external/internal`, archive time. No invented records; explicitly offer creating internal Wilde Systems. |
| Delivery project | Required client, intended outcome, title, status (`planned`, `active`, `blocked`, `completed`, `cancelled`), priority, optional dates, next action; scoped milestones, repository/deployment references, decisions, delivery and handoff entries. |
| Orca project link | Local record linking owner installation/runtime + existing Orca project ID to client and optional delivery project. Folder-project groups use an explicit discriminator and their stable ID. Repository URL/path is display/reference data only. |
| Workspace link | Stable external target identity, kind, owner installation/runtime, execution host, immutable worktree identity or folder UUID, last known locator/name, client and optional delivery project. At most one current assignment for each exact target. |
| Assignment history | Valid-from/to intervals and assignment revision for workspace/project/workflow associations; actor and reason. No rewriting old attribution on reassignment. |
| Knowledge | Required client, optional project, kind (`note`, `decision`, `procedure`, `document-reference`), title, bounded Markdown/plain text or validated URL, provenance, curated/draft state, timestamps, archive time. |
| n8n instance | Stable local instance UUID, label, normalized API base, environment defaults, credential reference, enabled state, capability observations, connection/sync state. UI initially connects one instance; schema supports more. |
| Workflow/automation | Unique `(instanceId, workflowId)`, observed title/active/archive state and times; app-owned purpose, environment (`production`, `test`, `unknown`), maintainer, ownership mode (`exclusive`, `shared`, `unassigned`), client/project association. |
| Execution evidence | Unique `(instanceId, executionId)`, workflow ID, raw/normalized status, mode, retry references, start/stop/observed times, valid elapsed duration, assignment revision/snapshot, source reference, completeness flags. Metadata only. |
| Business outcome | Required client; optional project, instance/workflow and execution references; controlled event type, occurredAt, receivedAt, source namespace/reference, idempotency key, correction/void reference. Compact evidence independent of executions. |
| Activity | Typed business changes and command results, relevant entity IDs, actor/source, time, request ID, minimal redacted metadata; no raw transcript, prompt, audio, credentials, or terminal history. |
| Capture state | Per-instance collection generations, committed page checkpoints, recent overlap boundary, unfinished execution IDs, coverage intervals, interruptions, retention cutoff, sync errors. |

Enforce project/client consistency with service validation and composite foreign keys
where appropriate. Execution/workspace external IDs intentionally have no cascade into
Orca's own database. Deleting or forgetting an Orca workspace leaves an orphaned link
and all delivery evidence. Loss of host contact is `disconnected/unverifiable`, not proof
of deletion. Show reconnect, locate, or unlink actions. Recreating a checkout at the same
path is a different occupant and must not inherit an old assignment.

Worktrees without `instanceId` use Orca's existing identity normalization when the owner
can provide it. Otherwise association is blocked with â€œReconnect/update this host to
identify the workspaceâ€; do not substitute path matching. Namespace local IDs with
the owning installation/runtime so a restored backup cannot bind `local` to the wrong PC.

### Assignment journeys

From a workspace context menu/header, choose an existing client and optionally one of
that client's delivery projects; offer â€œUnassigned.â€ Show the chosen client/project
visibly and link back to it. From a client/project, list exact host-qualified workspace
targets and open them using the existing activation adapter without a startup command.
Unavailable targets never cause a clone, new workspace, or arbitrary path opening.

From an existing Orca project, choose the same database client picker and optional
delivery project. The dialog lists current unassigned workspaces and offers an explicit
â€œApply to selected workspacesâ€ preview. Existing explicit assignments are conflicts to
resolve, never silently overwritten. Future workspaces receive a suggestion; no hidden
bulk reassignment. An Orca project link can exist without claiming every workspace.

Reassigning a delivery project uses an impact preview with exact linked workspaces,
project-scoped knowledge, and automation associations. Confirm one atomic change set,
including conflict choices; check revisions again at commit. Move current associations
together or decline the reassignment. Previous activity, deliveries, execution evidence,
and outcomes retain their original client snapshot. Query historical evidence by its
snapshot, never by joining through today's project owner.

Archive hides a record from default pickers while preserving detail, history and links.
Archiving a client disables new work under it; children remain stored and visible through
the archive filter. Restore is supported. Permanent delete is limited to archived,
unreferenced records and requires an exact impact confirmation; referenced records
return â€œarchive instead.â€ Unlink only ends an association. No cascading deletion of
delivery/outcome history. Completed projects stay searchable under Delivered.

### Migrations, backup, and restore

Numbered forward migrations plus a schema-version table; transactional migration and
pre-migration snapshot; integrity/foreign-key checks. Unknown newer schemas disable
business writes and show recovery instructions while Orca workspaces remain usable.
No silent empty-store fallback after corruption, no auto-rebuild of business evidence.

Export is a versioned JSON package with schema version, export/source identity,
timestamps, record counts and content digest. Generate a consistent snapshot; explicitly
include compact evidence and attribution. Exclude credentials, secret references that
could grant access, raw execution payloads, audio, cache, and Orca account/session data.
Warn that the package contains business information and is not an encrypted vault.

Import through a native file selection and bounded parser (10 MiB / 10,000 records
initial limit, actionable error on larger files). Validate structure, links, lengths,
duplicates, relationships, timestamps, IDs, unsupported schemas and external target
mapping before any writes. Show add/skip/conflict counts, archives, unresolved targets,
and excluded configuration. Identical rows skip; differing same-ID rows require explicit
choices. Preview token binds file digest, DB revision, operation and targets; expiry or
changed data requires a new preview. Commit in one transaction with backup and activity.
Offer full business-store replacement only behind a separate reviewed restore preview.
Connections restore disabled and require local credential configuration. A foreign
installation's workspace links stay unresolved until deliberately mapped. Test both a
clean restoration and a conflicting import using disposable profiles.

## 5. Complete interface journeys

| Destination | v1 behavior |
| --- | --- |
| Home | Resume recent exact workspaces; active/blocked/overdue projects and next actions; observed workflow failures; stale/unreachable connectors; links into evidence. No activity is invented when history is missing. |
| Clients | Search name/tags/contact; create/edit/archive/restore; archive filter; guided empty state. Detail tabs: Overview, Projects, Automations, Knowledge, Activity. |
| Project within client | Outcome, status/priority, next step/dates, milestones, linked workspaces and host states, repository/deployment links, decisions and handoff. Active and Delivered filters. |
| Workspaces | Existing Orca workbench and workspace list, additive assignment controls and visible business context; client/project links in both directions, internal/unassigned filters. |
| Automations | n8n inventory, assignments, execution history and connection status. Keep existing Orca scheduled agent automations in a clearly named separate tab with their existing behavior. |
| Knowledge/context | Create/edit/archive/search client/project notes and document references; provenance and updated time; curated records distinguished from drafts; preview a selected context package. |

Every new surface includes loading, empty, populated, inline error/retry, disconnected,
and stale states as relevant. Accessible labels, keyboard operation, focus restoration,
announced results, narrow panels, light/dark and appearance-off modes are acceptance
requirements. Use existing localization conventions without claiming new translations
were independently reviewed. No demo data goes into the real profile. Fixtures are
explicitly marked test/demo and live in disposable test records.

## 6. n8n connection and collection

Official documentation was checked against the current endpoint reference, authentication,
and cursor pagination pages. n8n API keys may have broad authority; app restrictions do
not rely on read-only key scopes. [Authentication](https://docs.n8n.io/connect/n8n-api/authentication)
and [pagination](https://docs.n8n.io/connect/n8n-api/pagination) document the header and
cursor contract; the API's default/max page sizes are 100/250.

The backend adapter exposes only fixed GET operations for workflows, executions and
one execution's detail. No credential listing, workflow editing/activation, retries,
stops, deletion, production webhook calls, or arbitrary request method/path is exposed.
Use `/api/v1/workflows`, `/api/v1/executions`, and documented item reads from the
[workflow](https://docs.n8n.io/connect/n8n-api/workflow) and
[execution](https://docs.n8n.io/connect/n8n-api/executions) contracts. Do not confuse
an n8n project/permission owner with a Wilde client.

Setup: base URL, label, credential configuration, test connection, actionable error,
status and last successful sync. Accept the instance root or `/api/v1` once, including
a configured subpath. The native main-process picker can import only the needed
`N8N_API_URL`/`N8N_API_KEY` fields from a deliberately selected env file using Node's
parser; do not execute env-file contents or expose secrets to renderer state. Persist
only an OS-protected credential envelope; renderer receives configured/error flags.
Live verification can instead use the provided configuration in process memory within
a disposable test profile. No broad environment-variable loading or credential copying
is needed. Never embed the user's file path in shipped code.

URL policy: HTTPS default; private DNS/IP instances supported deliberately. HTTP is
allowed only for an explicitly acknowledged loopback/private-network instance. Reject
embedded credentials, fragments, unrelated query strings, unsupported protocols,
metadata/service link-local addresses and encoded path traversal. Bind requests to the
configured origin and API prefix; encode IDs/query values. Do not follow redirects
with credentials (reject all redirects initially). Classify DNS results, prevent rebinding
to forbidden addresses at connect time, and support normal TLS verification/custom
trusted CA configuration without an â€œignore certificatesâ€ shortcut. Fixture HTTP is
explicitly loopback-scoped. Source links use validated instance origin and a verified
deep-link format, falling back to the instance page if a version's route is unknown.

One collector per active primary profile, independent of visible panels: workflows
every 5 minutes, executions every 60 seconds, coalesced refresh, no overlapping cycles.
Per request: 15-second timeout, cancellation, bounded response bytes, at most two
retries for retryable network/5xx/429 responses with jitter and Retry-After handling.
401/403 stops collection until configuration changes; do not hammer an invalid key.
Back off up to 15 minutes after repeated connection failures. Show last success separately
from last attempt, authentication failure, unavailable instance and stale coverage.

Collect cursor pages in small batches (initial limit 100; adaptive lower pages for
oversized workflow responses). Cap a scheduling slice at 20 pages / 30 seconds, yield
to the app, persist progress, and continue later. Initial backfill targets 30 days of
available saved executions. Clearly display incomplete/capped backfill and permit a
reviewed request for an older bounded interval. Replay from a safe overlap on restart
or expired cursors; never assume cursors are durable event offsets. Commit each page's
upserts and checkpoint atomically. Refresh unfinished execution IDs until terminal or
explicitly unavailable; waiting executions may resume much later. Sweep overlapping
windows to capture late status changes. Detect cursor loops, invalid pages and response
limits. An error must not be mistaken for an empty inventory or deleted workflows.

Current docs include `startedAfter`/`startedBefore`; feature-detect support rather than
assuming the configured instance is current. Older servers fall back to bounded cursor
scans and local filtering with coverage warnings. Preserve unknown status strings and
map them to unknown; never infer success from the deprecated `finished` flag alone.

Metadata projection occurs before persistence/renderer delivery. Workflow API responses
can contain node parameters, credential references and pinned/static data even during
an inventory request; discard those and never log the raw body. Use `excludePinnedData`
where supported. Execution list uses `includeData=false`. Optional detail requires an
explicit selected execution, a 1 MiB response cap and short memory lifetime; expose only
allowlisted structural/node-status information and sanitized diagnostic summaries,
never binary/input/output data, credentials or authorization headers. Do not request
unredacted data or bypass the provider's size policy. Link to n8n for deeper authorized
inspection. A shared workflow remains excluded from client execution totals unless
there is explicit attributable evidence; never parse customer ownership out of names.

Collector stops/aborts on profile shutdown or connection disable, resumes safely on
restart/wake, and logs redacted correlation IDs. No always-running service is installed.
The UI must say that capture can be incomplete while Orca is closed/asleep or source
executions are unsaved/pruned. Deletion from n8n does not erase locally recorded evidence.

## 7. Reporting and business outcomes

Operational cards disclose window, IANA timezone, source instance/workflow, denominator,
number of records, attribution coverage, oldest captured time and last successful sync.
Default window: last 7 days; â€œthis weekâ€ means Monday 00:00 through now in the selected
timezone. Store/query UTC bounds with DST tests.

| Metric | Definition |
| --- | --- |
| Recorded executions | Distinct `(instanceId, executionId)` whose valid startedAt is in the window. Attempts/retries count separately and are labelled. Missing start times appear in an undated bucket. |
| Terminal success/failure rates | S = `success`; F = `error` + `crashed`; denominator S+F. Show numerator/denominator. Exclude canceled, waiting, running, new and unknown, each with its own count. Zero denominator is unavailable, not 0% success. |
| Duration | `stoppedAt - startedAt` for recognized completed records with finite, ordered timestamps. Label elapsed time (may include waiting), disclose eligible N and exclusions; show mean and median, no p95 until N >= 100. |
| Failures over time | Unique failed execution attempts grouped by the displayed timezone/window, with retry links. Connection failures never add workflow failures. |
| Last success | Latest valid successful source run time, plus observed/synced time and coverage caveat. Missing evidence reads â€œNo recorded success,â€ not â€œnever ran.â€ |

Snapshot attribution at execution start using known assignment history. Runs predating
known ownership remain unattributed by default. Assignment changes only apply forward.
An optional backfill is an exact reviewed instance/workflow/time range with evidence,
preview counts, reason and reversible attribution adjustment; it never fabricates runs
or outcomes. No backfill occurs during assignment/import without that explicit review.

Business outcomes come from a versioned, validated JSON file import in v1. There is no
suitable existing application-specific authenticated external outcome receiver, and
opening one is unnecessary for this scope. Require client ID, optional consistent
project/workflow references, approved event type, occurred timestamp, source reference,
source namespace and idempotency key; the importer sets receivedAt. Initial event types:
`enquiry_received`, `appointment_booked`, `job_scheduled`, `report_delivered`.
The import preview displays timezone, evidence source, added/duplicate/conflicting and
unattributable counts. Files have the same size/row bounds as backup import.

Unique `(sourceNamespace, idempotencyKey)` makes repeated import harmless. Same key with
different content is a conflict, not an overwrite. Corrections/voids retain original
evidence and an audit trail. Validate workflow/client consistency; shared-workflow
outcomes require explicit client attribution. Counts of distinct outcomes never derive
from execution success or from retries. Importing a human assertion labels its source
as imported evidence; it does not prove the upstream event independently.

Provide a documented opt-in n8n emitter example that produces the same compact event
format and stable business-event key (not execution ID), plus a usable file-import
example. Do not deploy/enable it or claim an event producer is already running.
Reporting offers client/project period summaries with source references, coverage and
explicit export preview. No time-saved/revenue estimates in v1.

Retention defaults: compact execution evidence 365 days; business outcomes, curated
knowledge, assignments and delivery history until deliberate user action; no raw
execution payload or audio persistence. Activity retention is documented and bounded
(365 days for command/read audit; retain durable domain change references). Bounded
maintenance records cutoff/coverage gaps. Retention never silently erases outcomes or
converts unknown history to zero. Backups contain the retained compact evidence.

## 8. Shared actions, typed commands, voice, and assistant context

Start the registry in milestone 1 so UI actions already use its handlers; milestone 5
adds full resolution and voice coverage. Each command declares ID, Zod arguments,
resolver, scope/context requirements, risk, allowed entry points, confirmation rule,
handler, structured result and audit policy. Handlers revalidate current entities,
archive state, association revisions, host/target availability and approval tokens.
UI hiding is not authorization.

Representative operations: `client.open`, `project.open/list`, `workspace.open/assign`,
`orcaProject.assign`, `navigation.back`, `knowledge.search`, `automations.list`,
`executions.list`, `draft.projectNote`, `context.preview`, plus validated CRUD/archive
and preview/commit import operations. Reuse the existing palette with an explicit
business-command entry/mode; preserve its current workspace search and keyboard binding.
Add a configurable push-to-talk command binding after collision checking; preserve
the existing `voice.dictation` action. The visible microphone control works without a
new global shortcut.

Result union: success, needs-choice, needs-confirmation, cancelled, stale-context,
not-found, unavailable, rejected, failed. Include request ID and safe target summary.
Confirmation is a one-use, expiring main-owned token tied to exact command arguments,
targets and revisions. Internal edits return feedback and undo where safe. Bulk
assignment, project reassignment, permanent deletion, import/restore and context export
require their specific preview. Voice allowlists navigation/read/draft commands only;
it cannot invoke arbitrary CRUD/settings, external communication, shell, or n8n writes.

Resolve straightforward grammar deterministically against scoped local records. Similar
names produce choices with client/project/machine labels; no fuzzy auto-execution.
â€œTheirâ€ uses the current client context snapshot. A context generation changes on
navigation/reassignment; stale async results are cancelled or ignored. Do not send the
client database, terminal history, notes, or model output to an interpreter. No LLM
interpreter is needed for v1.

Reuse `useAudioCapture`, session-scoped speech IPC, the STT worker and model manager.
Add an explicit command transcript destination so partial/final command speech can
never enter a terminal or chat input. Push-to-talk releases to finish; Escape, blur,
device loss, scope switch, timeout or navigation cancel and stop microphone tracks.
One speech owner/session at a time; a 30-second command recording cap. States: idle,
listening, transcribing, resolving, choosing/confirming, completed/error. Show interpreted
action, stable target and final result; do not silently repeat an action on duplicate
final segments. Audit action IDs/results, not the transcript.

Required real provider: existing local `sherpa-onnx` Parakeet TDT v3 adapter. Use an
already-installed verified model when selected. On fresh installs, show model size and
require an explicit download through the current checksummed model manager. No automatic
download. [Sherpa's Node documentation](https://k2-fsa.github.io/sherpa/onnx/javascript-api/index.html)
and [NeMo model documentation](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html)
support this integration; package/runtime support still needs target-specific tests.

Preserve the replaceable provider interface and the existing optional OpenAI adapter.
Its endpoint and `gpt-4o-mini-transcribe` model are documented in the
[official transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create).
Before cloud command mode is available, remove plaintext fallback, block Linux
`basic_text`, add timeout/abort and bounded responses, and keep legacy credentials
unmodified until explicit reconfiguration. No chat subscription/API entitlement is
assumed. Cloud mode requires deliberate key configuration, provider/cost consent and
an â€œaudio leaves this deviceâ€ indication. The local required path sends no audio off
device. No paid request is needed to complete local-provider v1.

Shae confirmed the Spotify card is already functioning well. Preserve its current
layout, controls, playback and visualizer; regression coverage verifies that experience.

Spotify ducking is explicitly deferred. Current supported volume control depends on
Spotify Web API/account conditions and affects playback state; v1 leaves playback
under the existing player controls. Headphones are a useful voice setup option, not
a feature prerequisite.

### Voice coverage to implement and test

| Utterance/action | v1 result and boundary |
| --- | --- |
| â€œOpen Maritime Solar.â€ | Resolve fixture client; open detail; choice if ambiguous. |
| â€œOpen their active projects.â€ | Use current client, show active-project list; ask for client choice if context absent. |
| â€œSwitch to the contractor checklist workspace.â€ | Resolve exact existing local/remote/folder target; machine choice on collision; unavailable on disconnected host. Never create a replacement or inject a startup command. |
| â€œShow failed automations this week.â€ | Apply documented week/timezone window to observed failed n8n executions, respecting client/global context and coverage. |
| â€œGo back.â€ | Return to prior valid view/workspace using navigation history; explicit result if target was removed. |
| â€œDraft a project note.â€ | Open a clearly labelled draft for the current project, or choose project; saving/promoting curated content requires review. |
| Search client knowledge / focus existing terminal | Supported scoped read or safe focus-only action; no terminal write. Existing sleeping-agent/reconnect gates still apply. |
| Assignment, archive, restore, credential/model setup, export | Use typed/UI review flows; voice mutation coverage excluded in v1. |
| Shell commands, sending messages, production changes, sensitive settings | Rejected by trusted command policy. |
| Headless host / unavailable mic or native provider | Voice unavailable with a specific setup/platform reason; typed commands stay usable. |

All speech examples use disposable fixtures; â€œMaritime Solarâ€ is a test name, not an
invented live customer. Test deterministic resolution, genuine provider inference from
a known audio fixture, and microphone capture/navigation separately. Fixture audio with
real inference does not prove a physical microphone; both evidence types are reported.

Context preparation is explicit: select client/project and curated items, preview
bounded content with provenance/source dates, then copy/export or insert into an
existing assistant draft composer only on user action. No auto-send, auto-run, hidden
retrieval of linked documents, credentials, unrelated clients, terminal logs, or generated
drafts presented as facts. A project-note draft can be a useful structured template
(decision, rationale, next action) without an LLM dependency. Historical records retain
their original scope even after a project moves to another client.

## 9. Security and failure behavior

- Extend existing secure-file/SecretStore plumbing; fail closed when protection is
  unavailable. Check both availability and Linux backend; Electron documents
  [the unprotected `basic_text` fallback](https://www.electronjs.org/docs/latest/api/safe-storage).
  Missing secure storage blocks connectors/cloud speech, not local records or local voice.
- Keep business data out of telemetry/crash breadcrumbs by default. Logs contain operation
  IDs, status/error classes and timings, not contact details, URLs containing secrets,
  note bodies, key values or provider response bodies. Redact diagnostic source data.
- Strict size/range/schema validation at IPC, commands, import and remote-response
  boundaries. Reject unknown mutation commands and privileged sender/frame types.
- Bind client/project scope and generation to queries; scope cache keys; abort/discard
  late responses after switching clients. Service filters by current validated scope.
- Markdown is sanitized with existing libraries; no raw HTML execution or active embeds.
  Restrict external links; imports/notes/model output are data, never instructions.
- Disk full/corrupt DB returns an actionable persistence failure; no success toast before
  commit. Transaction rollback, controlled worker restart, and idempotent request IDs
  prevent double saves/imports. No automatic repeated destructive operation.
- Bound subscriptions, worker queues, network pages, model sessions and caches. Tear down
  on disconnect/profile change/quit. History and runtime lifecycle remain separate.
- Single-operator scoping protects context and prevents accidental mixups; it is not
  represented as multi-tenant security or a general defense against local OS malware.

## 10. Dependency-ordered milestones and ownership

The lead owns all shared schemas, migrations, IPC/preload contracts, routing, workspace
identity adapters, and integration. At most two additional implementation workers run
alongside the lead; one heavy build/E2E process at a time. Contracts stabilize before
workers start. Use available supported orchestration only when helpful; no worker edits
another worker's files or the shared seams. A fresh reviewer joins near completion.
The database worker's build entry belongs in `electron.vite.config.ts`, following the
existing `stt-worker` entry; the lead owns that build seam and any required type catalogs.

| Milestone | Ownership / principal files | Integration exit gate |
| --- | --- | --- |
| 0: protect and measure | Lead: exact docs allowlist, this plan/checklist, baseline evidence, safe test/build launch configuration if needed. Existing identity/updater/profile files are reviewed, not redesigned. | Initial Git and configuration audit; isolated startup/terminal baseline, broad relevant baseline failures classified; no real profile mutation. |
| 1: domain and first journey | Lead: `src/shared/wilde/{domain,commands,validation}.ts`, `src/main/wilde/business/{service,database-worker,migrations,workspace-links,project-links}.ts`, `src/preload/api/wilde-business-bridge.ts`, API types/registration, minimal shell routes. | Client â†’ project â†’ existing workspace â†’ saved note â†’ restart â†’ correct workspace/note, real SQLite and IPC. Folder/local/remote identities represented. |
| 2: client/project/knowledge UX | UI worker: `components/wilde-business/{home,clients,projects,knowledge,activity}/`. Lead: archive/import/export/service contracts, command adapters, `SidebarNav`, `AppWorkspaceShell`, assignment entry points and navigation history. | Complete CRUD/search/archive/restore/context journeys, existing Orca project assignment, stale-response isolation, backup restore, responsive/accessibility DOM checks. |
| 3: n8n connector | Connector worker: `src/main/wilde/n8n/{client,url-policy,collector,projection,capabilities}.ts` + network tests. Lead owns shared schemas/checkpoints/secret boundary. UI worker: `components/wilde-business/automations/` after contracts. | Allowlisted read surface, fixture pagination/retry/restart/dedupe, assignments/health/execution views and bounded authorized live read verification. |
| 4: honest reporting | Lead: `src/main/wilde/reporting/{metrics,outcome-import,coverage,attribution}.ts`, migration additions. UI worker: report/coverage/import-preview views. | Correct denominators and attribution, source retention gaps, outcome idempotency/conflicts/corrections, functional file producer/import examples. |
| 5: actions and voice | Lead: trusted registry/resolver and context/draft contracts. Worker: `components/wilde-business/commands/`, safe reuse of dictation capture/provider modules; no independent shell dispatcher. | All example commands via typed/UI/voice paths; real local inference and attempted mic validation; ambiguity/cancel/provider failure/unsafe action tests; scoped draft preparation. |
| 6: review and release evidence | Fresh reviewer: read-only security/product/regression review. Lead fixes findings, runs sequential final gates and local Windows build, updates WILDE/setup/privacy/voice coverage docs. | Every required gate classified; fixes reviewed; no unexplained regressions; artifact checksum/commands and remaining platform/live limitations stated. |

Each milestone ends in a working integrated app and repeatable evidence, not only
contracts or UI scaffolds. A missing live configuration/platform may block that specific
verification, but does not excuse stopping independent implementation. No repeated
â€œcontinue?â€ approvals are needed after the whole plan is approved.

## 11. Acceptance and verification plan

Before writing each feature, record its observable acceptance and important failure modes
in the checklist. Tests target actual outcomes, not setter behavior or snapshots of code.

| Boundary | Required evidence |
| --- | --- |
| Persistence/migrations | Real temporary SQLite: valid migration/reopen; interrupted transaction; newer schema; corrupt/disk failure; first journey across Electron restart. |
| Relations/history | Assign existing workspace AND Orca project to existing client; enforce project-client match; rename; delete/recreate same path; orphan; unlink; reassignment preview/conflict/revision race; historical client attribution intact. |
| Archive/import/export | Archived records discoverable; referenced delete rejected; exported secret sentinels absent; restored relationships/notes/evidence identical; invalid links/schema/digest/conflicts rejected atomically; foreign targets unresolved. |
| Client scoping | Two clients with similar names, delayed A response after switching to B, old voice context, cached report and draft isolation; malicious imported instructions do not change command permissions. |
| n8n | Local HTTP fixtures: pagination, unknown/missing fields, unsupported optional params, 401/403/404/429/5xx, Retry-After, timeouts, cancel, size limit, redirect/SSRF, cursor loops, mid-page crash/restart, duplicate/retry/waiting transitions and partial backfill. |
| Reporting | Mixed terminal/nonterminal status denominators; N=0; missing/negative times; small samples; DST/week bounds; pruned/unsaved history; stopped-runtime gaps; changed/shared/unassigned workflow ownership; late outcomes, duplicate keys and conflicting duplicate payloads. |
| Commands/voice | All six examples, ambiguity choice, exact host collision, stale/removed targets, cancelled/repeated final segments, microphone denied/unplugged, model missing/failure, real inference, rejected shell/settings/production commands. No terminal insertion from command mode. |
| UI | DOM assertions and hidden CDP screenshots for loading/empty/error/populated/stale views; keyboard navigation/focus, narrow widths, theme on/off, light/dark. Screenshots contain disposable data. |
| Existing Orca | Golden quit/relaunch session, worktree create/switch, terminal rendering/input, agent lifecycle, SSH disconnect/reconnect and host collision, settings/account persistence, existing automations and compact Spotify/OBS/Drive surfaces; updater remains disabled. |
| Performance | Same machine/fixture and startup milestone before/after (5 iterations); existing typing/output tests with collector and voice active and idle. No material startup/typing regression or main-thread stalls. |
| Build/platforms | Safe Windows artifact and fresh isolated launch. Linux/Omarchy native speech/keyring/Wayland/SSH validation on available isolated target; macOS when available. Unavailable targets are not â€œpassed.â€ |

Baseline/final command families (exact file selections and exit codes go into evidence):

```text
corepack pnpm run typecheck
corepack pnpm run typecheck:e2e
corepack pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=3 <selected suites>
corepack pnpm run check:code-quality:changed
corepack pnpm lint
corepack pnpm run test:perf:contracts
corepack pnpm exec electron-vite build --mode e2e
corepack pnpm exec playwright test <selected specs> --config tests/playwright.config.ts --project electron-headless --workers=1
node tests/tools/benchmarks/startup-time-bench.mjs --label wilde-before --iterations 5 --state-profile restored-local-tabs --session-tabs 20 --files 1000
corepack pnpm build:win
```

For nested package scripts, create a temporary Corepack shim directory on the command's
PATH; no global package-manager installation or PATH edits. Set
`ORCA_BACKGROUND_LAUNCH=1` for every test/app launch. Keep Node-native unit tests and
Electron-native build/E2E phases sequential because native runtime preparation may
switch local dependency variants. Build with `--mode e2e`; do not reuse stale production
output with `SKIP_BUILD`. Isolate userData, home/account paths, pairing and daemon state
using the repository's helpers. Disable real connector side effects in ordinary tests.

Run relevant unit/integration/renderer suites each milestone; near completion, run the
broader impacted regression set, full lint and practical build. If pre-existing failures
occur, compare the same baseline and report them explicitly; do not suppress gates or
expand into unrelated refactors. Packaging must not publish (`--publish never` where
the packaging command permits) or launch the installer. On POSIX avoid `build:cli`'s
global symlink step by using its compile/verification stages directly for tests.

Startup and latency comparisons use existing benchmark budgets plus a project gate:
investigate/fix a repeatable >10% median startup or p95 input regression beyond baseline
noise, reporting absolute changes as well. Hidden Windows renderers are throttled;
do not claim hidden-frame timing represents interactive latency. Use the documented
isolated Linux/Xvfb presentation path or an isolated desktop for real pixel latency.
Record this as a pending platform measurement if the isolated display is unavailable.

The repository requests an `$electron` skill for UI checks. It is not installed in the
available skill locations, and `orca skills get electron` returned â€œUnknown skill topic.â€
Milestone 0 must resolve the skill source or document use of the repository's explicit
Playwright/CDP fixture instructions; no desktop computer-use or foreground launch is
substituted. This does not block planning or service tests.

## 12. Rollout, rollback, and remaining gates

Keep the current branch/worktree and preserve unrelated work; no forced checkout or
upstream merge. Record the approved starting HEAD and any new dirty state before edits.
Develop and validate against disposable profiles with clearly labelled fixtures. Add a
local operational feature switch independent of appearance so the business surfaces and
collector can be disabled without affecting the terminal environment.

Build a local Windows artifact without publishing or running an installer. Provide
checksum, source HEAD/diff, setup instructions, privacy/credential guidance, backup/restore
steps and coverage matrix. Any installation over the working shared-identity app is a
separate approval with a profile backup and exact artifact. No production data is seeded
automatically and no n8n workflow is changed to create a test.

Rollback: disable Wilde business services; retain the additive business database; restore
the prior binary/source through a reviewed local operation if needed. Older binaries
ignore the new database. Forward schema migrations keep pre-migration snapshots; never
run a down migration silently or overwrite the sole business copy. Restoring business
data affects only the explicitly reviewed business store, not Orca account/session data.

Execution status (supersedes the planning gates above):

The user's 2026-09-25 execution request authorized implementation. The source now includes
the SQLite worker, business interface, existing-server n8n collector, historical reports,
outcome import and local command capture. See the [progress record](../wilde-super-app-implementation-checklist.md)
and [audit](../audits/wilde-super-app/README.md) for exact executed checks and remaining gaps.
Genuine cached-model inference and actual default-input capture were tested separately;
the complete human-spoken six-command journey remains unverified. No Linux/Omarchy or
macOS target is available. Installation, publishing, paid services and production writes
remain outside this implementation authorization.

Completion report must separate implemented, executed-and-verified, fixture-only,
unverified platform, and missing-configuration outcomes. Include exact commands/results,
pre-existing failures, fixed/new issues, manual checks, scope deviations, and artifact
location. A build, typed commands, mocked provider, or preliminary HTTP 200 does not
establish a complete live voice/n8n journey.

