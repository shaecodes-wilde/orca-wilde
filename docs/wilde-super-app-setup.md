# Wilde business workspace: setup and operating notes

This is an internal, single-operator desktop workspace for clients, delivery projects,
knowledge, workspace links, automation evidence and reports. Business records stay in
the selected Orca profile. There is no automatic synchronization between computers.

The business Automations view connects to an **existing n8n instance**. It does not
install an n8n server, deploy workflows or change their execution settings. Orca's
existing scheduled agent automations remain a separate feature.

## First local journey

1. Open Clients and create a client. Add a delivery project under that client.
2. Open Workspaces and assign an existing workspace or Orca project to the client.
   An optional delivery project must belong to the same client.
3. Save a delivery note in the client's knowledge area, with the project selected.
4. Restart the same profile. Reopen the client, follow the workspace link and retrieve
   the note. Use a disposable profile and clearly labelled sample records for testing.

Workspace links use an immutable target identity, owning host and installation owner.
A rename does not change that identity. A disconnected host or removed workspace is
an unavailable target; reconnect or explicitly select an existing replacement. Names
alone never merge targets across hosts. Reassignment retains historical evidence.
Archive preserves records; restore makes an archived record available again. Review
the presented impact before confirming bulk changes, deletion or replacement.

## Storage, native setup and recovery

The active profile's storage directory contains `wilde-business.sqlite`, with SQLite
write-ahead-log sidecar files while open. The existing Orca SQLite adapter runs in a
dedicated worker. Schema changes are transactional; unknown newer schemas and failed
integrity checks stop business access rather than overwriting the database. Preserve
the original files when investigating corruption. Do not copy only the main SQLite
file from a running app and assume it contains the latest committed changes.

Development code lives in the Windows build checkout described by `WILDE.md`. Use
`corepack pnpm` when pnpm is not on PATH. Node tests and Electron launches can require
different native module builds: use `node config/scripts/ensure-native-runtime.mjs
--runtime=node` or `corepack pnpm ensure:electron-runtime` for the corresponding phase,
sequentially.
Do not rebuild native dependencies while another build or Electron test is using them.
Run tests and agent-launched apps with `ORCA_BACKGROUND_LAUNCH=1`, using disposable
profiles and the repository's hidden-window fixtures. Preserve the working installed
app and keep the fork's stock auto-update feed disabled.

To isolate a business-service problem, launch with `ORCA_WILDE_BUSINESS_DISABLED=1`.
This disables business IPC and background collection without deleting business data.
Remove the variable on a later launch to enable the services again. It is a local
operational switch, not a database downgrade or an installer rollback.

## Backups and imports

Open **Backup and import**, choose **Export business backup**, then choose a local
destination. The JSON file contains private client records, notes and retained
evidence/history. It is **unencrypted**. Keep it in access-controlled storage and
share it only with deliberate authorization. Its SHA-256 digest detects accidental
changes; it is not a signature or proof that the author is trusted.

Credentials, microphone audio, speech model files and Orca terminal sessions are not
included. Restore does not restore an n8n API key. A fresh profile needs its own
connection setup and OS keychain access. Source installation and host identities are
preserved, so foreign workspace links can remain unresolved until explicitly reassigned.
Do not treat an imported path or matching display name as permission to open a new host.

Before replacing records, export a current backup. Confirmation durably pauses n8n
collection before changing the database; inability to save that pause rejects the import. Select
**Merge backup** to add compatible records, or **Replace from backup** to replace the
business store, including records absent from the file. Inspect the impact preview
and confirm that exact change set. A changed record with the same identity is a merge
conflict; it is not silently overwritten. A stale preview must be recreated. Check the
restored client, project, note and workspace links before explicitly resuming collection.
The imported history's identity, client scope and revisions are validated; conflicting
history/activity/checkpoint identities reject the complete transaction.

Files are bounded to 10 MiB. Backups have limits of 10,000 records, 10,000 history
entries, 10,000 activity entries and 100 capture checkpoints. Oversized exports fail
instead of writing a partial backup. Snapshot/report views also have a 10,000-record
bound and must disclose truncation; they are not an unrestricted archive query.

## Connect n8n

Choose **Automations → Connect n8n**. Enter a label, the instance's HTTPS root or API
base ending in `/api/v1`, and an API key authorized for that instance. A deployment
subpath is supported. Review the instance before enabling collection. Connection
settings retain an existing key when the field is blank and the normalized URL is
unchanged. Changing the instance URL requires a key and creates a new local instance
identity. **Pause collection** and **Resume collection** preserve the saved connection.

The backend seals the key through Orca's OS-backed SecretStore in the active profile's
`wilde-business/n8n-connection.enc.json`. An unavailable keychain or Linux `basic_text`
fallback is rejected. The saved key is never returned to the renderer, included in
reports/backups or written into logs. The setup form holds the entered value only to
submit the configuration. Do not paste credentials into client notes or an outcome file.

The connector permits fixed GET operations for workflow inventory, execution lists
and execution refresh. It has no workflow write, activation, retry, deletion, webhook
invocation or credential-listing operation. API keys may still have broader authority
outside this app. URLs with embedded credentials, query strings, fragments or unsafe
paths are rejected. DNS results are checked and pinned for the connection; metadata
and service/link-local addresses and redirects are rejected. Deliberately configured
private HTTPS instances are supported. HTTP is restricted to injected loopback test
fixtures; there is currently no private-HTTP acknowledgement screen or custom-CA picker.
Normal certificate verification stays enabled.

The collector runs while Orca is running, independently of which view is visible.
Workflow scans are normally five minutes apart and execution scans one minute apart.
Refreshes coalesce. Requests have a 15-second timeout, response limits and at most two
retries for retryable failures. Authentication failures suspend attempts until the
configuration changes; other failures back off up to 15 minutes. Pages and progress
commit together. Restart replays overlapping source history rather than trusting an
old cursor as a permanent event offset. Each slice is bounded to 20 pages/30 seconds.

Initial collection targets roughly 30 days using bounded source pagination and local
date checks. Current code does not probe newer optional date-filter capabilities.
Waiting/nonterminal executions are refreshed in bounded batches. A missing execution
detail is disclosed as incomplete evidence; a durable per-execution unavailable marker
is not yet implemented. A failed inventory read never means workflows were deleted.
Raw nodes, parameters, credentials and execution input/output bodies are discarded
before persistence. The execution list requests `includeData=false`.

## Read reports accurately

Reports separate **execution evidence** from **business outcomes**. A successful run
does not establish that an appointment was booked or a report delivered.

| Measure | Definition |
| --- | --- |
| Recorded runs | Observed executions whose valid start time falls within the selected window. Undated observations are reported separately. |
| Success rate | `success / (success + error + crashed)`. Waiting, running, canceled and unknown statuses are excluded from this denominator. An empty denominator is unavailable, not 0%. |
| Failed runs | Runs with status `error` or `crashed` in the window. Unknown status strings are retained rather than converted to success. |
| Duration | Stop time minus start time for terminal runs with finite, nonnegative elapsed time. Sample count and excluded count are shown. This is elapsed time, not CPU time. |
| p95 duration | Available only with at least 100 valid duration samples. |
| Last success | Latest recorded successful run's start time within the selected window; missing evidence means “No recorded success.” |
| Business outcomes | Effective imported source assertions in the period, excluding archived, superseded and voided evidence. |

**Last 7 days** is a rolling 168-hour window. **This week** begins Monday at midnight
in the selected reporting timezone and ends now. Reports display an IANA timezone;
the failed-automations voice command uses the desktop's local timezone. Check displayed
boundaries when comparing these views. Each retry is a source execution record; counts
are not counts of unique customers or business transactions.

Exclusive workflow ownership provides client attribution from the assignment in
effect when the run started. Later reassignment does not rewrite recorded attribution.
Shared or unassigned workflow runs remain outside client totals without explicit
attributable evidence. Client-scoped reports can therefore show fewer observations
than the global report without indicating data loss.

Always consider last observation, last successful sync, oldest captured time,
unattributed counts and truncation. Capture can be incomplete while Orca is closed or
asleep, after collection errors, or because n8n did not save or retained/pruned only
part of its history. A missing observation is unknown activity, not zero activity.
During collection commits, execution records last **observed** more than 365 days ago
are pruned locally. This is not a guarantee of 365 days of complete source history.
Outcomes and client records are not removed by this execution-retention rule.

## Import business outcomes

Use [the disposable example file](examples/wilde-outcomes.json) as a format template.
Its UUID is a placeholder, not an existing client. Replace it with a client UUID from
the selected local profile before using the import preview. `projectId`, when supplied,
must identify that client's delivery project. `workflowId` is the local workflow-record
UUID, not the external n8n workflow ID; leave it null if no reviewed mapping exists.
All nullable fields shown in the example are required. Additional fields are rejected.

Choose **Import business outcomes** or **Backup and import → Import outcomes**, select
the JSON file, inspect the counts, then confirm. Files support up to 10,000 events and
10 MiB. Invalid relationships or conflicting evidence reject the transaction rather
than importing a partial batch. Reimporting identical `(sourceNamespace, idempotencyKey)`
events skips duplicates. The same key with changed content is a conflict. Corrections
use a new stable key and `correctsId` referring to the existing local outcome UUID;
voids use a new key and `voidsId`. Use one of these references at a time and preserve
the source record for audit.

The following optional n8n **Code** node example runs once for all items. It only
constructs a file-shaped JSON object. Nothing has been deployed, and the desktop app
does not install an emitter. Its input must come after the source system confirms the
business outcome. Review the source-to-client mapping and storage destination before
adding it to any real workflow. The `$input.all()` and `{ json: ... }` convention follow
the [official input-data reference](https://docs.n8n.io/data/expression-reference/nodeinputdata/)
and [Code node return format](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/common-issues/).

```javascript
const events = $input.all().map(({ json }) => {
  const businessId = String(json.appointmentId ?? '');
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(businessId)) {
    throw new Error('A stable appointment identifier is required');
  }
  if (typeof json.wildeClientId !== 'string' || typeof json.bookedAt !== 'string') {
    throw new Error('A reviewed local client mapping and source booking time are required');
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(json.bookedAt)) {
    throw new Error('Source booking time must include a timezone');
  }
  const occurredAt = new Date(json.bookedAt).toISOString();
  return {
    clientId: json.wildeClientId,
    projectId: null,
    eventType: 'appointment_booked',
    occurredAt,
    sourceNamespace: 'example-booking-system',
    sourceReference: businessId,
    idempotencyKey: `appointment_booked:${businessId}`,
    workflowId: null,
    executionId: null,
    correctsId: null,
    voidsId: null
  };
});
return [{ json: { format: 'wilde-outcomes', version: 1, events } }];
```

Save the returned item's **JSON object**, not the surrounding n8n item array, as a
UTF-8 `.json` file through a separately reviewed local file/export step. Import it in
the desktop app. This example emits only `appointment_booked`; other approved types
are `enquiry_received`, `job_scheduled` and `report_delivered`. Never infer one merely
from a successful workflow run.

The stable business identifier and original source booking time must remain unchanged
on retries. An execution ID, current timestamp or random UUID is not an idempotency key
for a booking: it would count the same booking again. `executionId` is deliberately
null here because changing retry execution IDs would also make an otherwise identical
event conflict. Include no names, email addresses, message bodies or credentials.
Choose a stable source namespace for the source system, tenant and environment so
unrelated systems' business identifiers cannot collide. Changing a namespace merely
to bypass a conflict would create duplicate evidence.

## Local voice and preparation

The command bar supports typed input and mouse/keyboard push-to-talk. Hold **Hold to
speak** (or hold Space/Enter while the button is focused), speak, then release. Commands
use the installed `parakeet-tdt-0.6b-v3-int8` model through Orca's local Sherpa provider.
If it is not ready, set it up explicitly in **Settings → Voice**, or use typed input.
The command bar does not download a model or use paid/cloud transcription automatically.

Escape, focus loss, hiding the window, changing scope, unmounting or device loss cancels
capture. Holds are bounded to 30 seconds. Late/canceled transcripts are discarded.
A unique command session prevents transcripts reaching the existing dictation insertion
target. Another active speech owner is rejected. Commands never write to a terminal or
chat input. The resolver supports the listed navigation/preparation forms; arbitrary
instructions, shell commands and mutation requests are rejected.

Prepared context and project notes remain previews until the operator explicitly
copies, exports or saves the reviewed content. A note draft is not proof of completed
delivery. Preparation uses the selected scope and does not retrieve linked documents,
terminal history, credentials or unrelated clients automatically.

| Requested phrase | Deterministic typed/fixture resolution | Mocked capture coverage | Genuine audio evidence |
| --- | --- | --- | --- |
| “Open Maritime Solar.” | Resolves a disposable named-client fixture; ambiguous matches offer choices. | Shared session/lifecycle tests; not a microphone recording of this phrase. | Synthetic SAPI audio → genuine local model: exact normalized match. |
| “Open their active projects.” | Uses current client or offers a client choice. | Shared lifecycle coverage. | Synthetic audio: exact normalized match. |
| “Switch to the contractor checklist workspace.” | Resolves fixture identity/host; collision and disconnected-host cases tested. | Shared lifecycle coverage. | Synthetic audio: exact normalized match. |
| “Show failed automations this week.” | Resolves scoped failures and week filtering. | Mocked final segments combine into this command once after stopped. | Synthetic audio: exact normalized match. |
| “Go back.” | Resolves the navigation-back action. | Shared lifecycle coverage. | Synthetic audio: exact normalized match. |
| “Draft a project note.” | Resolves current project or offers project choices; opens a draft. | Shared lifecycle coverage. | Synthetic audio: exact normalized match. |

Names in this matrix are test fixtures, not retrieved client records. Twelve command-bar
DOM tests use mocked audio capture and speech IPC: they verify session isolation,
mouse/keyboard release, duplicate/late finals, startup races, silence, provider failure,
missing-model typed fallback and cancellation. They do not prove physical capture.

A separate genuine Windows-native Sherpa/Parakeet test processed the cached English
fixture: **3.845 seconds of audio, 15.562 seconds wall time, 79 nonempty transcript
characters**. Six additional Windows SAPI synthetic fixtures also produced exact normalized
transcripts through that native model (6.3–9.9 seconds per cold worker). Runnable tools:
`tests/tools/wilde-speech-fixtures.ps1` and `tests/tools/wilde-local-speech-inference.mjs`.
These checks establish fixture inference, not human speech accuracy. A separate hidden Windows Electron test acquired the actual default
input through getUserMedia, sampled it for 500 ms, then stopped every track; no audio was
saved and no fake media-device switch was used. Hardware device identity and a person
speaking all six commands through the complete navigation path remain unverified.
Non-Windows platforms remain unverified.

## Delivery evidence and remaining checks

The connector's loopback HTTP fixtures cover bounded reads, projection, retries,
timeouts, cancellation, redirect rejection, cursor loops, checkpoint failures and
restart behavior. Credential tests use an injected keychain fixture; they do not prove
every operating system's real secure-storage backend. A separate bounded live read
returned **1 projected workflow and 100 projected executions** successfully. No n8n
mutation was performed and no private names, IDs or credential values are included here.

The source includes storage, resolver/reporting, renderer and connector checks. Consult
the execution progress record for the final command results and any current failures;
this document does not convert passing mocks into live integration proof. Complete
the full spoken-command journey, performance comparison and platform-specific checks
before claiming those boundaries are verified. Hidden restart acceptance and the
100-test existing-feature regression suite passed; final source evidence is in the audit.

The local Windows packaging artifact and checksum are **pending** at the time this
guide was written. Packaging must not publish or launch an installer. Installation over
the working shared-identity app, deployment, publishing, paid services and production
mutations require separate authorization.
