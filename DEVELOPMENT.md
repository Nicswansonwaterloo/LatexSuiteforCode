# Development guide

## Setup and checks

Use Node.js 24 (see `.nvmrc`) and the committed lockfile.

```sh
npm ci
npm run test:unit                       # editor-independent parser tests
npm test                                # integration tests on current stable VS Code
npm test -- --code-version 1.137.0      # integration tests on the minimum supported VS Code
npm run package:vsix                    # build latex-suite-vscode-<version>.vsix (does not publish)
npm run check:package                   # verify the archive contents
npm run test:vsix                       # install the archive into a clean profile and smoke-test it
npm run test:trust                      # same, in Restricted Mode
npm run benchmark                       # parser timing (diagnostic only)
npm audit
```

Use `npm run watch` while developing, or press F5 to launch an Extension
Development Host.

- `npm test` type-checks, lints, bundles, and runs three test hosts: editor
  behavior, multi-root configuration, and controller lifecycle. Select one with
  `--label editor`, `--label configuration`, or `--label lifecycle`.
- On headless Linux, wrap test commands in `xvfb-run -a`.
- `test:vsix` and `test:trust` default to current stable; set `VSCODE_VERSION`
  to test another release. If they fail with `listen EINVAL` on a `.sock` path,
  `TMPDIR` is too long for a Unix socket; rerun with a short `TMPDIR` such as
  `/tmp`.
- `check:package` fails if the archive contains anything beyond the bundle,
  icon, manifest, README, and license files, or if a new runtime dependency is
  bundled without its license notice. Repackage after every edit.

CI (`.github/workflows/ci.yml`) runs the unit, integration, and package checks
on Linux, Windows, and macOS against the minimum and stable VS Code versions,
plus the installed and Restricted Mode smoke tests on Linux. It never publishes.

## Engineering rules

| Area | Rule |
| --- | --- |
| Activation | Activate on Markdown and LaTeX only. Do not evaluate custom snippets or read files during activation. |
| Lifecycle | Register everything through disposables. Cancel pending editor waits on shutdown and drop stale operations after edits, selection or configuration changes, or disposal. |
| Workspace Trust | Run custom JavaScript only in trusted workspaces. Keep the four executable-source settings restricted, keep bundled defaults in Restricted Mode, and invalidate caches when trust changes. |
| Files and configuration | Read through `workspace.fs` and build paths with `Uri.joinPath`; use `fsPath` only for `file:` URIs. Resolve configuration per document and relative paths per workspace folder. |
| Editing | Scope keybindings with context keys. Preserve native completion, snippet navigation, Tab focus mode, and undo. |
| Packaging | Bundle with esbuild, externalize `vscode`, and ship only the runtime, icon, README, and licenses. |
| Upstream | Record intentional differences in `UPSTREAM.md`. Port fixes with independently written expected outputs; never regenerate expectations from the code. |

See the [VS Code extension API docs](https://code.visualstudio.com/api) when
raising `engines.vscode` or adding capabilities. Browser-only hosts such as
vscode.dev are not supported.

## Performance

Cursor movement reuses one parsed document revision; each edit re-parses the
document. Unanchored regex triggers inspect at most the last 8,192 UTF-16 code
units before the cursor. Custom JavaScript and regular expressions run
synchronously in the extension host, so very large documents or expensive
custom snippets can add typing latency.

## Releasing

After the one-time setup below, pushing a version tag such as `v1.1.1` publishes
that release to `qmvis.latex-suite-vscode`. Ordinary branch pushes, pull requests,
and the CI workflow's manual Run button only check code; they never publish.
Merging the workflow alone does not enable publishing.

1. Bump both manifest and lockfile versions with
   `npm version <x.y.z> --no-git-tag-version`. Use a new stable version above the
   current Marketplace version; `1.1.0` is already published and cannot be reused.
2. Commit the version bump and merge the reviewed changes into `main`.
3. Check CI and do these manual checks, which automated tests cannot cover:
   - physical `Tab`, `Enter`, `Shift+Enter`, and `Mod-` keybindings, undo,
     completion popups, Tab focus mode, and IME input on Windows and macOS;
   - granting trust to a workspace that opened in Restricted Mode;
   - a virtual workspace and a remote extension host.
4. From the intended release commit on `main`, create and push only that tag:
   `git tag v<x.y.z>` then `git push origin v<x.y.z>`. Release one version at a
   time and wait for that run to finish before pushing another release tag.
5. Watch **Publish Marketplace release** in Actions. It validates the exact
   tag/version/lockfile and `qmvis.latex-suite-vscode` identity, requires the commit
   to be on `main`, and reruns the full existing OS/VS Code test matrix. Publishing
   waits for every matrix job and uses the exact Linux stable VSIX that passed
   package, installed-extension, and Restricted Mode checks, without rebuilding it.
   Approve the `marketplace` environment if required by its protection rules.
6. Confirm the new version appears on the
   [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=qmvis.latex-suite-vscode).
   A successful upload can still need Marketplace processing.

The workflow does not increment versions, create tags, or create GitHub releases.
A failed test blocks publication. If publishing fails, fix its cause and inspect
whether that version already reached Marketplace before retrying; never move a
published tag or reuse a published version. The tested artifact is retained for
seven days. To pause publishing, unset `MARKETPLACE_PUBLISH_ENABLED`.

### One-time owner setup (required before enabling)

No credentials or cloud resources are created by these workflows. The repository
owner must separately authorize and complete this setup. Do not put tokens,
passwords, or client secrets in source code, issues, PRs, or chat.

This workflow uses the pinned `@vscode/vsce` with Microsoft Entra authentication.
Microsoft recommends federation instead of long-lived PATs; global Azure DevOps
PATs retire on December 1, 2026. See the official
[Marketplace publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

1. Create the GitHub environment `marketplace` in this repository **before**
   enabling publishing. Restrict its deployment rules to tags matching `v*`, with
   no branch rule. Add a required reviewer if releases should need approval.
   Protect `main` and release tags against unauthorized changes/deletion.
2. Use a dedicated Microsoft Entra application/service principal or user-assigned
   managed identity. Follow Microsoft's
   [GitHub OIDC setup](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
   and [Azure Login guidance](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended).
   Bind federation to this repository's `marketplace` environment, issuer
   `https://token.actions.githubusercontent.com`, and audience
   `api://AzureADTokenExchange`. Use the exact subject issued for
   `Nicswansonwaterloo/latex-suite-vscode` and this environment. The default
   [immutable subject](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)
   expected from this repository's creation date and IDs is
   `repo:Nicswansonwaterloo@204956139/latex-suite-vscode@1402109021:environment:marketplace`.
   This is not a captured token claim; verify the actual subject and any custom
   settings before saving the federation. Do not
   copy the old repository name or broaden trust to arbitrary repositories or PRs.
3. Authorize that identity as a **Contributor** of the `qmvis` Marketplace
   publisher, using the Marketplace identity/resource ID obtained through the
   publishing guide's Azure DevOps profile lookup. An Entra object ID alone is
   not a substitute. This workflow does not deploy Azure resources and uses
   `allow-no-subscriptions`; it does not require Azure subscription Contributor
   access. Azure tenant and Marketplace administrators may be needed for setup.
4. In the `marketplace` environment, store `AZURE_CLIENT_ID` and
   `AZURE_TENANT_ID` as Actions secrets. No client secret or PAT is used. Only the
   publishing job can request a short-lived OIDC token; test jobs have read-only
   repository access and no publisher credentials.
5. After reviewing the setup, create the **repository Actions variable**
   `MARKETPLACE_PUBLISH_ENABLED` with value `true`. Until then tags are validated
   and tested but the publishing job is skipped. Treat the next new version-tag
   push as authorization to publish it. Authenticated publishing is intentionally
   not exercised by ordinary PR validation; verify it on the first intended
   release after owner setup.

Keep the publisher and extension name stable. Changing the display name does not
require changing `qmvis.latex-suite-vscode`, which identifies existing installs.
