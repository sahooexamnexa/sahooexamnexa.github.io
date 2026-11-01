# Priority #7 — registration and email verification

Development branch: `codex/registration-email-otp`, based on production `main` at `059f709d3e7d15858a0e7afe244cb8982f8f6c9d`. Priority #6 and PR #3 remain paused and unchanged. This change requires no database migration, Edge deployment, dependency upgrade or new secret.

## Client behavior

- Registration collects Full Name, Email, Password and Confirm Password, with field-level validation and associated accessible error messages. Names support Unicode including Odia; only the existing `displayName` metadata field is sent. Confirmation and caller-supplied roles/verification flags are not sent.
- New passwords need at least eight characters in this UI; existing password login does not acquire that new length restriction. The existing hosted password policy remains authoritative and unchanged.
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

1. Email/password sign-in and **Confirm email** stay enabled. Do not disable confirmation to make testing pass. Preserve existing password, session, SMTP, CAPTCHA/security and authorization settings.
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

## Local verification

`npm run test:auth` runs synthetic validation/controller/SDK-adapter tests. `npm run build` generates the ignored official SDK bundle before browser tests. `npm run test:auth-browser` starts a loopback-only fixture server, uses the pinned official SDK against intercepted synthetic Auth responses, blocks unexpected network requests, and shuts down its own server/browser.

The browser harness uses the existing Playwright installation (`PLAYWRIGHT_MODULE`, if needed) and Microsoft Edge; no additional project dependency is introduced. Existing backend regressions use disposable PGlite fixtures, not Docker or production. Test results must be reported from the actual execution; local mocks do not certify SMTP deliverability, hosted settings or live Auth behavior.

### Fresh Priority #7 evidence — 2026-11-01

- All automated tests (`node --test tests/*.test.mjs`): **224 passed, 0 failed**, including 47 new registration/Auth tests and existing database, RLS, answer-privacy, importer, hierarchy, scoring, timer and access-control regressions. The focused Auth command passed 62 tests; those are included in the full total, not additional tests.
- Counted browser scenarios: **151 passed, 0 failed**: registration/OTP 21; general browser 21; launch access 6; branding/mobile 9; isolated Supabase/backend 56; Coming Soon 18; password recovery 10 at root plus 10 at the old subpath.
- Additional generated-artifact browser checks passed for root and subpath assets/routing/Auth redirects, plus root SEO/structured-data/robots/sitemap/private-page checks. These are separate suite passes, not extra numbered scenarios.
- Local client build and root/subpath Pages builds passed. The final root artifact contains exactly **35 allowlisted public files**, including the new Auth helper and existing Google verification file; no documentation, tests, migrations or private configuration is published.
- Syntax checks for the eight changed JavaScript/MJS files and `git diff --check` passed. The 320px and desktop registration/verification screenshots were inspected; no horizontal overflow was found.
- The registration browser fixture blocked unexpected external requests and recorded zero production requests or real emails. Existing backend browser checks use disposable local PGlite and intercepted Auth transport.

The existing workflow has no `pull_request` trigger or PR test job. Its Pages build/deploy runs only from `main`; a feature-branch push does not deploy. Absence of GitHub PR checks is not a CI success claim. No workflow change is included here.

## Review/release boundaries

Only the Priority #7 feature branch/PR is prepared. No merge, Pages deployment, migration, hosted Auth setting/template change or production email/account operation is authorized by this implementation. The Pages workflow currently deploys on `main`, so merging is a separate release decision. No completed Priority #6 QA/recovery work is rerun or changed, and no Priority #6 code/migration is included in this branch.
