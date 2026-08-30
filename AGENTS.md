# Repository Work Rules

These rules are mandatory for every code change in this repository.

## 1. Change only the requested scope
- Modify only behavior explicitly requested by the user/task.
- Do not refactor, rename, optimize, redesign, reformat, migrate, or alter unrelated working behavior.
- Do not change defaults, selection state, send behavior, UI interactions, storage keys, APIs, deployment structure, or campaign behavior unless the request explicitly requires it.
- If an out-of-scope change appears necessary, stop and report it separately. Do not silently include it.

## 2. Find the full root cause before writing a fix
Before modifying code for a bug:
1. Search the entire repository for the exact visible symptom: error text, alert text, selector, function name, storage key, event listener, and related behavior.
2. Inspect every runtime path that can produce the symptom, including dynamically loaded scripts and duplicate/legacy implementations.
3. Confirm which file(s) are actually loaded by the affected page.
4. Confirm the deployed mirror/runtime repository is on the expected commit when deployment is relevant.
5. Only after the full path is known, implement one minimal fix.

Do not patch the first plausible location and wait for the user to retest before checking for duplicate paths.

## 3. Preserve existing working behavior
For every bug fix, explicitly identify invariants that must remain unchanged. At minimum preserve:
- user selections and existing saved data unless the task is specifically about resetting them;
- existing mail templates, send cadence, recipients, Gmail integration, campaign logic, and discovery logic unless requested;
- unrelated pages and campaign modes;
- existing APIs and deployment behavior unless requested.

## 4. Prefer removal of the cause over workaround layers
- Fix or remove the actual offending logic.
- Do not add another interception, monkey patch, timeout, DOM-ID swap, compatibility shim, or duplicate guard when the original cause can be safely corrected.
- Avoid stacking fixes on top of previous fixes.

## 5. Regression tests are required for bugs
Every user-visible regression fix must add or update a test that reproduces the failed behavior and fails if it returns.
- Test the page/runtime composition, not only an individual helper file, when multiple scripts can affect the same behavior.
- For duplicated behavior, test that no loaded runtime path can reproduce the forbidden behavior.
- Keep positive invariants too: requested behavior must work while unrelated behavior remains unchanged.

## 6. Verify before merge
Before merging:
1. Compare the branch against the latest `main` and ensure it is not behind.
2. Review the complete changed-file list; every changed file must be justified by the request.
3. Run the full test suite (`npm test`) when executable CI/local tooling is available.
4. If full execution is unavailable, perform repository-level static verification and clearly state the limitation.
5. Re-search the repository for the original symptom after the fix.
6. Confirm cache-busting/versioned browser assets when a modified frontend script may otherwise remain cached.

## 7. Deployment mirrors
`Flow4Work/koreaproagent` is the source repository. If production deploys through a mirror such as `daijobukr/koreaproagent`, do not assume source `main` equals production.
- Verify the mirror commit after sync.
- When diagnosing a production-only issue, inspect the mirror/runtime code as well as the source.

## 8. Stop conditions
Do not claim a bug is fixed if any of these are true:
- the exact symptom still exists in another loaded code path;
- the production/mirror commit is not verified;
- the affected page still loads a stale version of the changed script;
- the fix depends on an unverified workaround ordering;
- unrelated behavior was changed to make the test pass.
