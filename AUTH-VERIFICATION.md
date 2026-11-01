# Priority #7 — registration and email verification

Development branch: `codex/registration-email-otp`, based on production `main` at `059f709d3e7d15858a0e7afe244cb8982f8f6c9d`. Priority #6 and PR #3 remain paused and unchanged. This change requires no database migration, Edge deployment, dependency upgrade or new secret.

## Client behavior

- Registration collects Full Name, Email, Password and Confirm Password, with field-level validation and associated accessible error messages. Names support Unicode including Odia; only the existing `displayName` metadata field is sent. Confirmation and caller-supplied roles/verification flags are not sent.
- New registration passwords need at least **12 characters**, matching the existing setup guidance and password-recovery UI. A shared constant controls registration validation, its HTML minimum and its hint. Existing password login has no new minimum-length restriction. The hosted password policy remains authoritative and unchanged; its current minimum/composition rules must be checked separately rather than inferred from repository guidance.
- `signUp` still requests email confirmation with the base-aware existing redirect. An unconfirmed response never grants access or creates a local account. Supabase's obfuscated duplicate responses and explicit duplicate errors receive the same generic confirmation guidance.
- `#/verify-email` accepts the registered email and a 6–10 digit code. It uses official `auth.verifyOtp({email,token,type:'email'})`, then requires the existing remote-user and backend-account checks. Roles come from the authorized backend account response, not editable Auth metadata.
- Resend uses only `auth.resend({type:'signup',email,options:{emailRedirectTo}})`. It does not call passwordless `signInWithOtp`, create users implicitly or alter an existing password.
- A 60-second client cooldown and busy guard prevent accidental duplicate requests. Hosted Auth rate limits remain the security control and can be stricter. A failed/limited resend does not claim delivery or authentication.
- Pending email/cooldown state is in memory, never an authorization flag. Reloading the verification page requires re-entering the email and never automatically resends. No password, confirmation password or OTP is retained in application snapshots, browser storage, logs or URLs. The official SDK continues to own normal persisted sessions and tokens.
- Existing confirmation links, password login/logout, Admin authorization, test access, and the dedicated `reset-password.html` recovery flow remain separate and supported. Verification is email confirmation, not a claim of MFA.
- Public indexing remains limited to the existing homepage. Verification, login, account and other private views remain `noindex, nofollow` and are not sitemap entries.

## Required hosted configuration review — NOT applied

Code inspection confirms the required Supabase template fields and SDK methods. The current production template contents, rate limits and SMTP delivery were **not** queried or changed by this task. Real email delivery and hosted confirmation must be checked only during a separately approved release.

Before release, verify in the existing project `dtacpfeemvmdzzgwqscj`:

1. Email/password sign-in and **Confirm email** stay enabled. Do not disable confirmation to make testing pass. Read the current hosted password minimum and composition rules without changing them. Record any mismatch with the 12-character registration/recovery guidance and request separate approval for a hosted correction if needed; do not lower the hosted policy to match a UI. Preserve existing password, session, SMTP, CAPTCHA/security and authorization settings.
2. In **Authentication → Email Templates → Confirm signup**, preserve the existing branding and confirmation link, and ensure the body also shows `{{ .Token }}`. A minimal content example is:

   ```html
   <h2>Confirm your Sahoo ExamNexa account</h2>
   <p>Enter this verification code on the email-verification screen:</p>
   <p><strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">confirm your email using this link</a>.</p>
   <p>If you did not request this account, ignore this email.</p>
   ```

   This is a proposed template example, not a saved hosted configuration. Include both variables; do not replace the existing confirmation URL with a custom token-bearing application URL. If the existing email contains only a link, the link still works, but a numeric code will not be visible until this separate template action is approved.
3. Leave Recovery, Magic Link, invitations, email-change and other templates untouched. Keep the current Site URL and both retained origins/callback sets unchanged. Existing confirmation redirects target `siteBase()`; password recovery continues to target `reset-password.html` under that same base.
4. Confirm the configured email OTP length is within Supabase's supported 6–10 digits. Do not promise a fixed expiration: hosted Auth owns expiry and one-time consumption. Check the current send frequency and server rate limits; the UI does not override them.
5. Test actual signup/code/link/resend and recovery with an explicitly approved controlled account before any production release is called verified. Do not send real emails or change accounts as part of local QA.

Official references: [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [resend](https://supabase.com/docs/reference/javascript/auth-resend), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [official OTP length configuration specification](https://github.com/supabase/supabase/blob/master/apps/docs/spec/cli_v1_config.yaml).

### Exact safe hosted-template review procedure

This is a prepared procedure, **not an executed hosted review or change**:

1. Open the existing Supabase project and confirm reference **`dtacpfeemvmdzzgwqscj`** and production environment. Do not create a project or follow historical project-creation/old-URL setup instructions.
2. Open **Authentication → Email Templates → Confirm signup** and inspect the subject and HTML/source. Do not select **Save**, **Send test**, user creation, or an email-generating action.
3. Before any approved edit, retain the existing subject/body privately outside GitHub. Record only whether the required placeholders exist; never collect actual OTPs, confirmation URLs with real tokens, SMTP passwords or session secrets.
4. Verify the rendered body exposes `{{ .Token }}` as readable text and an existing confirmation anchor retains `href="{{ .ConfirmationURL }}"`. Preserve branding, existing safe links and subject. Do not put codes into analytics URLs or replace confirmation links with a guessed custom callback.
5. If both placeholders are already present, no template write is needed. If the code is missing, propose only this additive block before the existing confirmation link, keeping the rest of the template intact:

   ```html
   <p>Your Sahoo ExamNexa verification code:</p>
   <p><strong>{{ .Token }}</strong></p>
   ```

6. Report the exact proposed diff and stop for separate approval before saving. Never edit the Recovery, Magic Link, invitation or email-change templates, Site URL, callbacks, CORS or SMTP settings under this approval.
7. After a separately approved save, reopen the same template and compare its subject/body to the private original plus the approved insertion. Recheck both placeholders; stop on unexpected changes. A saved template is not proof of email delivery.

### Controlled live verification and release gates

- Next perform hosted read-only inspection using the procedure above. Any template/policy write, real email/account operation and frontend merge/deployment need separate explicit approval. No such operation has occurred during this audit.
- Before release, verify the current hosted Confirm email, password policy, OTP length/expiry, send limits, SMTP availability and existing root/retained-old callbacks. Record facts without collecting secrets. Do not make guessed configuration changes.
- With separate approval for an owner-controlled account and real emails, verify signup stays unconfirmed; valid/invalid/expired codes; resend/cooldown/delivery errors; and both code and link confirmation. Code and link are alternatives: consuming one can invalidate the other. Use a separately issued approved confirmation for the link check, rather than treating reuse of a consumed token as a regression.
- Verify existing password login/logout/session reload, recovery callback, student denial of Admin, approved Admin access, FREE/PREMIUM eligibility and a controlled mock-test flow. No access or role may be granted from client metadata or an unverified response.
- Merge only after separate release approval: the existing main-push workflow deploys Pages automatically. No migration, hosted policy relaxation or Edge deployment is needed for this client-only feature. Stop on Auth/delivery/authorization regressions; use a separately approved rollback to the previous frontend/template, never delete accounts or overwrite student records.

## Local verification

`npm run test:auth` runs synthetic validation/controller/SDK-adapter tests. `npm run build` generates the ignored official SDK bundle before browser tests. `npm run test:auth-browser` starts a loopback-only fixture server, uses the pinned official SDK against intercepted synthetic Auth responses, blocks unexpected network requests, and shuts down its own server/browser.

The browser harness uses the existing Playwright installation (`PLAYWRIGHT_MODULE`, if needed) and Microsoft Edge; no additional project dependency is introduced. Existing backend regressions use disposable PGlite fixtures, not Docker or production. Test results must be reported from the actual execution; local mocks do not certify SMTP deliverability, hosted settings or live Auth behavior.

### Initial Priority #7 evidence — 2026-11-01, commit `89204ecaffbbb3ef6fa8604e3483aa834071f400`

- All automated tests (`node --test tests/*.test.mjs`): **224 passed, 0 failed**, including 47 new registration/Auth tests and existing database, RLS, answer-privacy, importer, hierarchy, scoring, timer and access-control regressions. The focused Auth command passed 62 tests; those are included in the full total, not additional tests.
- Counted browser scenarios: **151 passed, 0 failed**: registration/OTP 21; general browser 21; launch access 6; branding/mobile 9; isolated Supabase/backend 56; Coming Soon 18; password recovery 10 at root plus 10 at the old subpath.
- Additional generated-artifact browser checks passed for root and subpath assets/routing/Auth redirects, plus root SEO/structured-data/robots/sitemap/private-page checks. These are separate suite passes, not extra numbered scenarios.
- Local client build and root/subpath Pages builds passed. The final root artifact contains exactly **35 allowlisted public files**, including the new Auth helper and existing Google verification file; no documentation, tests, migrations or private configuration is published.
- Syntax checks for the eight changed JavaScript/MJS files and `git diff --check` passed. The 320px and desktop registration/verification screenshots were inspected; no horizontal overflow was found.
- The registration browser fixture blocked unexpected external requests and recorded zero production requests or real emails. Existing backend browser checks use disposable local PGlite and intercepted Auth transport.

The existing workflow has no `pull_request` trigger or PR test job. Its Pages build/deploy runs only from `main`; a feature-branch push does not deploy. Absence of GitHub PR checks is not a CI success claim. No workflow change is included here.

### Final pre-release audit — 2026-11-01

Confirmed correction: registration's former 8-character minimum disagreed with the existing setup guidance and 12-character recovery UI. Registration now uses one 12-character constant in validation, HTML and wording. Existing password login and recovery code are unchanged. No hosted password policy was read or modified, so its exact current rules remain a release prerequisite.

Fresh results for this correction: **66 focused unit tests passed, 0 failed** (51 registration/Auth plus 15 launch-access tests); **22 registration/OTP browser scenarios passed, 0 failed**, including 8/11 rejection, exact-12 acceptance and existing short-password login. The browser fixture recorded zero unexpected external requests, production requests or real emails. The root Pages build, four changed JS/MJS syntax checks, 35-file artifact equality/current-code checks and diff integrity passed.

The earlier 224-test full suite and 151-scenario broader browser evidence above are preserved; they were **not** rerun or relabelled as fresh results for this correction. No database/backend, dependency, workflow, recovery, catalog, scoring or timer implementation changed in this audit.

Security inspection confirmed official `verifyOtp` and signup-only `resend`, remote confirmed-user and backend account/role resolution, server-enforced student/Admin and mock-test authorization, sanitized errors, secret-free application snapshots, safe return routes and private-page indexing. No additional blocking code defect was identified in this review. This is a local code/fixture assessment, not certification of hosted Auth or delivery.

**Local audit: PASS. Production release: NOT APPROVED / pending hosted configuration review and controlled live verification.** Priority #6 and PR #3 stay paused and unchanged. No real emails, accounts, hosted changes, migration, merge or deployment occurred.

## Review/release boundaries

Only the Priority #7 feature branch/PR is prepared. No merge, Pages deployment, migration, hosted Auth setting/template change or production email/account operation is authorized by this implementation. The Pages workflow currently deploys on `main`, so merging is a separate release decision. No completed Priority #6 QA/recovery work is rerun or changed, and no Priority #6 code/migration is included in this branch.
