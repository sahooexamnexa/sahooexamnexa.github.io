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
- Embedded-font selectable-text Odia is supported when the font's Unicode mapping
  is usable. Extraction retains PDF.js text fragments and explicit word spacing;
  shaping fragments and font changes never introduce spaces by themselves. It
  preserves Unicode without rewriting/reordering marks. Detected ambiguous geometry,
  private-use/replacement characters, invalid scalars, decoding controls and detectable
  visual-order Odia mark/base mappings block extraction instead of being repaired.
  Single-column horizontal LTR text is the reviewed layout. A font being embedded
  (or having a ToUnicode map) is not proof of correct text: plausible but incorrect
  mappings or omissions may still need visual/source comparison in Pass 2. Arbitrary
  font maps and OCR are not certified by the synthetic embedded-font regressions.
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
before approving each occurrence. Resolve each finding individually with its own
evidence/reason, then approve only when none remain unresolved. The review choices
are keep pending, edit, resolve a selected finding, approve, reject, and remove
from working selection. All retain the private raw archive and audit trail.
Each resolution is bound to the particular evidence it reviewed. An unrelated
edit cannot clear source findings; unchanged PYP evidence can retain its separate
resolution. Changed evidence invalidates the affected resolution and reopens any
approval depending on it. Reverting text does not revive an invalidated resolution.
Same-fact links survive ordinary edits and newly linked evidence requires review
of both occurrences.

Duplicate/missing/invalid original source IDs are immutable source-integrity blockers and
cannot be waived. Explicitly exclude the conflicting occurrence or use a corrected
source in a new empty destination. A targeted working-field repair recomputes only
the validation supported by that field; it never removes unrelated source findings.

Source IDs accept nonblank intact strings and safe integers (including zero). Blank,
null, boolean, object, array and unsafe numeric IDs are blocked. An explicitly invalid
`id` never falls back to `number`; a number-only canonical record remains supported
when no `id` property exists. Original values stay in the raw archive. Internal
occurrence keys such as `s1q1` identify the working record, not its original source ID.

Canonical option IDs must be intact, unique, nonblank strings without boundary
whitespace. They are never generated, trimmed or coerced into a guessed answer
mapping. Invalid original canonical IDs require explicit exclusion or a corrected
source; an explanation edit or review resolution cannot waive them. Valid source
array options use position-derived `option-0` IDs; PDF labels use `option-A` IDs.
The archived source format, original array/index or PDF block, and working mapping
make these supported derivations traceable. Canonical JSON with duplicate property
declarations or non-finite numeric literals is blocked instead of silently accepting
the last answer/option value. Exact source bytes remain privately archived.

PDF explanation declarations retain every occurrence with its block line and
original question identity. Identical declarations consolidate only in the working
copy. Differing declarations leave the working explanation unset and create a
source conflict. Admin sees all private candidates, saves the selected/revised
explanation, then explicitly resolves the conflict before approval.

Question, option, answer-ID and explanation validation rejects replacement/control
characters, known decoding artifacts and visibly truncated endings. Empty options
after artifact cleanup are also blocked. These checks do not invent replacement
text and cannot recognize every possible semantic truncation; factual/ambiguity
review remains necessary. Valid English/Odia/Unicode is retained.

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

For a separately approved release, first establish verified backup and isolated
restore readiness and refresh the actual production schema/data baseline. Verify
the migration is absent, then apply only this migration once. Deploy the matching
academy-api with its complete reachable module graph and pinned `unpdf@1.9.1`.
Successful hosted synthetic checks are required before frontend release. Merging
to main automatically triggers Pages, so merge only after those backend checks
pass. The new UI fails safely if the backend is not yet available; legacy HTML
Imports stays usable. This documentation update authorizes none of these steps.

The static artifact contains only the UI module. Parser/PDF dependencies, SQL,
tests, private archives, source banks and server credentials are not shipped.

## Recorded initial development verification (2026-10-23)

These historical results predate the Odia PDF correction. The later correction
results are recorded separately below; this documentation update reruns no suites.

- 230 Node automated tests passed, including database/security/importer suites and
  42 Smart Import parser tests plus 11 staging database lifecycle checks (53 focused).
- 235 browser scenarios/check groups passed across source and generated artifact:
  18 + 21 + 6 + 9 + 64 + 15 + 18 + 1 + 1 + 10 + 8 + 64. The two aggregate
  static/SEO checks cover multiple assertions and are each counted once.
- 42 parser tests also passed in local Deno 2.9.6; the academy-api TypeScript
  entrypoint passed Deno checking. This does not substitute for a later controlled
  synthetic smoke test under the actual hosted Edge CPU/memory limits.
- JavaScript syntax checked for 66 files; four JSON/manifest files parsed; restricted
  artifact allowlist checked (35 files), Google verification file unchanged,
  dependency audit reported zero vulnerabilities, and `git diff --check` passed.
- All database/browser mutations used disposable isolated fixtures. No production
  migration, publication, import, settings change, merge or deployment occurred.
- Blocker regressions cover unrelated edits retaining duplicate-source-ID blockers,
  targeted repairs, independently retained PYP resolutions, same-fact link retention
  and invalidation, identical/conflicting PDF explanations, explicit resolution,
  all four option positions, replacement/control/decoding artifacts, truncation,
  post-cleanup empty options, and valid Unicode. Browser checks exercise the complete
  conflicting-PDF correction/resolution flow at 320px without installing its content.
- Independent re-review additionally covers invalid/blank/non-scalar original IDs,
  valid numeric/string IDs, missing/duplicate/ambiguous canonical option IDs, strict
  answer mapping, unrelated edits retaining all other blockers, and duplicate JSON
  property/non-finite literal rejection. Browser and HTTP/database checks confirm
  malformed identities cannot install, while original bytes/records remain intact.
  The SQL migration was not changed by these parser fixes.

## Odia PDF correction (2026-10-28, committed and pushed)

The reviewed correction was committed and pushed to `codex/smart-mcq-import-audit`
as `55c350184b116496fb0cc1f5e047383d59a65fdf`, following the original reviewed
implementation `b6f26aa201555bd0e2dc6961f2affe28d4183d75`. Its 12 files contain
only the extraction correction, tests, documentation and nine synthetic fixtures.
The complete Priority #6 PR #3 contains 26 changed files against production main
`059f709d3e7d15858a0e7afe244cb8982f8f6c9d`.

The following tests executed during correction validation before that commit.
The final diff/remote reviews matched the tested patch and fixture hashes; neither
those reviews nor this documentation update reran the completed suites.

- 63 parser checks passed in Node and Deno; 251 full local automated checks passed
  (including those 63 and the database/security lifecycle checks).
- 64 targeted Admin/backend browser checks passed. The earlier 235-browser result
  was preserved, not repeated or presented as a fresh full-browser run.
- The same correctly mapped basic/wrapped fixtures improved from 20/35 matching
  fields under the approved baseline to 35/35 after the correction. NFC equivalence
  and ordinary line wrapping are allowed in comparisons; internal word spaces and
  Odia marks are never removed to obtain a pass.
- Four deliberately broken/missing font-map fixtures remain blocked with originals
  intact. The original discovery PDFs still have unrecoverable mappings and remain
  blocked; this correction does not invent their missing characters.
- Edge type checking, 66 JS syntax checks, six JSON/manifest parses and the exact
  35-file artifact audit passed. Synthetic PDFs/server code stay out of the artifact.
- The correction is committed and independently reviewed; it is not deployed.

## PR checks and unresolved release gates (2026-10-28)

GitHub reported zero automated PR check runs and zero commit statuses for reviewed
implementation `55c350184b116496fb0cc1f5e047383d59a65fdf`. The only workflow is
Pages deployment on main (or manual dispatch gated to main); no PR test workflow
is configured. Missing checks are not an automated approval or a failing test.
The PR description records the current documentation head separately from the
reviewed implementation and the dates of its existing local QA evidence.

Hosted Supabase Edge PDF execution remains **UNVERIFIED**. Before frontend release,
verify complete module packaging, pinned `unpdf` and its internal `unpdf/pdfjs`
resolution, function startup, final bundle size, and cold/warm synthetic HTML,
PDF, embedded-font Odia and mixed-source requests. Include unsupported inputs and
near-limit cases, authorization/privacy checks, and CPU/memory/timeout behavior.
The local byte/page/text limits do not prove compliance with hosted resource
budgets; recheck the official hosted limits at release time. Do not weaken parsing
or silently omit records to pass a resource check. Synthetic staging archives are
immutable, so any smoke test that writes them needs approval to retain its audit.

Production backup/recovery verification is **DEFERRED and UNRESOLVED**. A real
owner-controlled recovery backup and successful isolated restoration have not
been verified. Priority #6 is not complete or production-release-ready. Fresh
production-state preflight and separate explicit release approval remain required;
no migration, merge, backend/Pages deployment or production import is authorized
by this documentation update.
