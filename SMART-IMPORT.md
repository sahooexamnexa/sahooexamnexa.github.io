# Private Smart MCQ Import and Audit

The **Private Admin → Smart HTML / PDF Audit** workspace stages sources separately
from the existing **HTML Imports** uploader. It never publishes a test automatically.

## Supported sources and limits

- One or multiple HTML files, PDF files, or a mixed batch. Every file requires an
  exact positive expected question count and an existing, empty Hidden/Draft test.
- HTML supports the existing canonical `sahoo-mock-data` JSON block and the reviewed
  static `const questions = [...]` format. Acorn reads literal data; uploaded HTML
  and JavaScript are never rendered or executed. Dynamic data is rejected.
- PDFs use selectable text with numbered question blocks (`1.`, `Q1.`, or
  `Question 1:`), four `A.`–`D.` option lines, `Answer: A`, `Explanation: ...`, and
  optionally `PYP: <supported exact exam/year label>`. Wrapped text is retained.
- Scanned/image-only pages, damaged PDFs, unsupported layouts, unexplained preambles
  and count discrepancies remain blocked. There is **no OCR** and no guessed answer
  or transcription. Use a supported export/transcription after inspecting the source.
- The existing 2 MB HTTP request limit stays unchanged. Binary source bytes are
  limited to **1 MB combined** to allow base64/request overhead. PDF processing has
  a 500-page / 4 MB extracted-text safety budget. These are resource limits, not
  automatic selection caps. Split larger source sets explicitly.

## Preservation, review and selection

The server archives exact source bytes, filenames/types, SHA-256 hashes and every
raw occurrence. Each working occurrence records its source index, original ID and
position. Cross-file repeated IDs remain distinct; repeated IDs within one file
are flagged. No question is silently skipped, merged or deleted. Malformed source
files are archived with extraction/count errors and cannot be installed.

Pass 1 checks counts, IDs, text/truncation, four distinct options and answer mapping.
It also reports duplicate candidates. `pass1` describes the entire staged source;
`selectedPass1` describes the explicit working selection. Thus rejected malformed
occurrences stay visible in the source report without certifying them as repaired.

Pass 2 lists unresolved factual-answer consistency, ambiguity, explanation quality,
relevance and (when present) PYP-provenance checks. **Automation does not certify
facts or provenance.** An Admin must inspect all alternatives and provide evidence
before approving each occurrence. Structural errors cannot be overridden by an
approval. The review choices are keep pending, edit, approve, reject, and remove
from working selection. All retain the private raw archive and audit trail.
Corrections reopen prior approvals. Newly linked same-fact evidence reopens the
related prior approval as well.

Exact duplicates compare normalized wording and ordered options. Near duplicates
use conservative token overlap and are candidates for review, not factual judgments.
An Admin can link differently worded occurrences with a shared reviewed fact key.
The application does not infer general semantic equivalence or equate a common
topic with duplication. Nothing is removed automatically.

Filters are All, reviewer-marked Important, explicit PYP, and PYP **or** Important.
Importance is a reviewer decision, not an invented prediction. Filtering retains
source order and all unselected records privately. A requested count is advisory:
100 requested with 86 qualifying reports 86 and a shortfall of 14. It does not
fabricate missing questions or silently truncate a larger eligible set.

Student-facing working fields remove green-circle and `[cite: n]` artifacts, known
bracketed generic labels and explicit filename/source-file lines. Tags accept only
the existing reviewed exact PYP metadata rules (`tags`, structured `pyp`, or the
explicit PDF `PYP:` line). No provenance is inferred from prose, filename, chapter,
explanation or emoji. Matching a naming rule is not proof of authenticity; PYP
provenance remains a review finding. Raw input is unchanged.

## Installing a reviewed draft

Only an explicitly confirmed, nonempty approved selection with no unresolved source
errors can be installed. The destination must still be empty and Hidden/Draft.
Revision checks reject stale edits. Installation is atomic and cannot be repeated.
It creates a normal private import with a link back to the complete source archive.
The existing HTML Imports content pass and explicit publication remain separate
steps. Subsequent working-question deletion preserves archived sources/history.

A failed extraction cannot be replaced in place: its immutable batch remains for
audit. Correct/re-export the source into another empty draft destination. An archive
or replacement workflow for failed batches is not included in this first version.

## Security and eventual release order

`202610210001_smart_import.sql` is a new forward-only migration: private staging
table, immutable-archive trigger, and an authorized API wrapper. It contains no
updates/deletes of existing catalog, questions, attempts, results or settings.
Anonymous/Student roles cannot access staging tables or protected RPCs. Internal
create/update operations are not exposed by the HTTP action allowlist. Source
parsing, filters and revisions are calculated server-side. Pre-submit option
projection and authoritative scoring remain unchanged.

For a separately approved release: review/apply only this migration, deploy the
matching academy-api with pinned `unpdf@1.9.1`, then deploy the frontend. Verify
runtime PDF resource limits using synthetic fixtures before real use. The new UI
fails safely if the backend is not yet available; legacy HTML Imports stays usable.
This development task does **not** perform these production steps.

The static artifact contains only the UI module. Parser/PDF dependencies, SQL,
tests, private archives, source banks and server credentials are not shipped.

## Development verification (2026-10-23)

- 208 Node automated tests passed, including database/security/importer suites and
  22 Smart Import parser tests plus 9 staging database lifecycle checks.
- 231 browser scenarios/check groups passed across source and generated artifact:
  18 + 21 + 6 + 9 + 62 + 15 + 18 + 1 + 1 + 10 + 8 + 62. The two aggregate
  static/SEO checks cover multiple assertions and are each counted once.
- 22 parser tests also passed in local Deno 2.9.6; the academy-api TypeScript
  entrypoint passed Deno checking. This does not substitute for a later controlled
  synthetic smoke test under the actual hosted Edge CPU/memory limits.
- JavaScript syntax checked for 65 files; four JSON/manifest files parsed; restricted
  artifact allowlist checked (35 files), Google verification file unchanged,
  dependency audit reported zero vulnerabilities, and `git diff --check` passed.
- All database/browser mutations used disposable isolated fixtures. No production
  migration, publication, import, settings change, merge or deployment occurred.
