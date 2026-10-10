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

Publishing requires the one-time setup below. Only new `v<x.y.z>` tag pushes
publish; branch pushes, PRs, and manual CI runs do not.

1. Run `npm version <x.y.z> --no-git-tag-version` to update the manifest and
   lockfile. Use a stable version above the current Marketplace version;
   `1.1.0` is already published and cannot be reused.
2. Commit the version bump, merge the reviewed changes into `main`, and check CI.
3. Manually check physical `Tab`, `Enter`, `Shift+Enter`, and `Mod-` keybindings,
   undo, completion popups, Tab focus mode, and IME input on Windows and macOS;
   granting trust after opening in Restricted Mode; virtual and remote workspaces.
4. From the release commit on `main`, run `git tag v<x.y.z>` and
   `git push origin v<x.y.z>`. Wait for the release run before pushing another tag.
5. Watch **Publish Marketplace release** in Actions and approve the `marketplace`
   environment if required. It validates the tag/version/identity and main ancestry,
   runs the existing full test matrix, and publishes the exact tested Linux stable
   VSIX without rebuilding it.
6. Confirm the version on the
   [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=qmvis.latex-suite-vscode).
   Processing may continue after upload succeeds.

If publishing fails, check whether the version reached Marketplace before retrying.
Never move a published tag or reuse a published version. Tested artifacts expire
after seven days. To pause publishing, unset `MARKETPLACE_PUBLISH_ENABLED`.

### One-time Marketplace authentication setup

The owner must complete these steps before enabling publishing. Keep credentials
out of source code, issues, PRs, and chat. This uses Entra federation, not a PAT
or client secret; see the official
[Marketplace publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace).

1. In GitHub **Settings → Environments**, create `marketplace`. Allow only tags
   matching `v*`, with no branch rule. Add a required reviewer if wanted.
   Protect `main` and release tags against unauthorized changes/deletion.
2. Create a dedicated Entra application/service principal or user-assigned managed
   identity following [Microsoft's GitHub OIDC setup](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
   and [Azure Login guidance](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended).
   Configure federation for this repository's `marketplace` environment:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Audience: `api://AzureADTokenExchange`
   - Expected [immutable subject](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims):
     `repo:Nicswansonwaterloo@204956139/latex-suite-vscode@1402109021:environment:marketplace`
     This is inferred from repository creation date and IDs, not a captured token.
     Verify the actual subject and custom settings before saving; do not use the
     old repository name or broaden trust to arbitrary repositories or PRs.
3. Add that identity as a **Contributor** of Marketplace publisher `qmvis` using
   the Marketplace identity/resource ID from the publishing guide's Azure DevOps
   profile lookup, not its Entra object ID. No Azure subscription Contributor
   access is needed (`allow-no-subscriptions`). Tenant and Marketplace admins may
   be needed for setup.
4. Under **Settings → Environments → marketplace**, add Actions secrets
   `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. No PAT or client secret is needed;
   only the publishing job has OIDC access, and test jobs have no publisher credentials.
5. After reviewing setup, under **Settings → Secrets and variables → Actions →
   Variables**, set the repository variable `MARKETPLACE_PUBLISH_ENABLED` to `true`.
   Until then, tags are validated and tested but publishing is skipped. The next
   new version-tag push authorizes publication. Verify authentication on that
   intended release; ordinary PR checks do not exercise authenticated publishing.

Keep `qmvis.latex-suite-vscode` stable so existing installs receive updates;
changing the display name does not require changing this ID.
