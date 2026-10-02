# VS Code extension development review

Reviewed against the official VS Code Extension API guidance on 2026-09-13.
This is a scoped engineering review, not certification of every API guideline.

| Area | Project rule and review result | Official reference |
| --- | --- | --- |
| Activation | Activate for Markdown and LaTeX; contributed commands activate automatically. Keep activation free of custom snippet evaluation and file reads. | [Activation events](https://code.visualstudio.com/api/references/activation-events) |
| Lifecycle | Own registrations through disposables. Cancel pending editor waits on shutdown; reject stale operations after edits, selection changes, configuration changes, or disposal. Handle background promise failures. | [Extension anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy) |
| Workspace Trust | Execute custom JavaScript only in trusted workspaces. Keep all four executable-source settings restricted and retain bundled defaults in Restricted Mode. Invalidate caches when trust changes. | [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust) |
| Files and configuration | Read resources through `workspace.fs`; join paths with `Uri.joinPath`. Use `fsPath` only for file URIs. Resolve configuration per document and relative paths per workspace folder. | [Virtual workspaces](https://code.visualstudio.com/api/extension-guides/virtual-workspaces) |
| Commands and editing | Use the LaTeX Suite command category. Scope typing shortcuts with editor context keys and preserve native completion, snippet navigation, accessibility Tab mode, and undo behavior. | [Command Palette](https://code.visualstudio.com/api/ux-guidelines/command-palette) |
| Packaging | Bundle production code with esbuild, externalize `vscode`, and ship only the runtime and public documentation/licenses. Inspect the VSIX file list after changing runtime assets. | [Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) |
| Testing | Type-check, lint, and run unit/integration tests in an isolated Extension Development Host. Check the minimum supported VS Code release and current stable before release. | [Testing extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension) |

## Reproducible checks

Use Node.js 24 (`.nvmrc`) and the committed npm lockfile. Packaging uses the pinned
local `@vscode/vsce`; a global installation is unnecessary.

```sh
npm ci
npm run test:unit
npm test -- --code-version 1.137.0
npm test
npm run package:vsix
npm run check:package
npm run test:vsix
npm run test:trust
npm run benchmark
npm audit
```

`npm test` compiles tests, checks types, lints, bundles, and runs three isolated
Extension Development Hosts: editor/core behavior, multi-root configuration,
and controller lifecycle. Use `--label editor`, `--label configuration`, or
`--label lifecycle` to select one. `test:unit` runs the editor-independent parse
checks. `watch-tests` refreshes both TypeScript and bundled snippet test assets.

`package` builds production JavaScript. `package:vsix` builds the local archive
with the configured repository metadata; it never publishes.
`check:package` opens that archive, checks its exact file list and current file
contents, and verifies the bundled third-party dependency/license inventory.
Run packaging again after edits before checking the archive. The archive ships
only the bundle, icon, manifest, public documentation, and licenses.

`test:vsix` installs the archive into a temporary profile and loads a separate,
empty test harness so the development checkout cannot shadow the installed code.
`test:trust` uses another fresh profile with Workspace Trust enabled; the normal
VS Code test runner disables trust and cannot validate Restricted Mode. These
checks exercise activation, bundled expansion, native placeholders, Tab, and
rapid typing. The trust check asserts the real untrusted state and verifies
that configured custom snippets/variables did not execute. Set `VSCODE_VERSION`
to a release such as `1.137.0` to override their default of current stable.

Linux headless hosts need a display, for example `xvfb-run -a npm test`.
The GitHub workflow runs minimum/stable editor suites and package checks on
Linux, Windows, and macOS, plus installed/trust smoke checks on Linux. It does
not publish and needs no Marketplace credentials. Hosted job results must be
reviewed after a public repository is connected.

## Maintenance evidence (2026-10-02)

- Linux VS Code 1.137.0 and 1.140.0 each pass 136 host tests: 121 editor/core,
  13 configuration/multi-root, and 2 lifecycle tests. All 3 standalone parse
  tests pass. Type checks (including unused locals/parameters) and lint pass.
  The dependency audit reports zero known vulnerabilities on this date.
- The archive allowlist contains 12 ZIP entries, including VSIX metadata.
  Installed trusted and Restricted Mode smoke tests pass on Linux. Hosted
  Windows/macOS jobs have been configured but have not run from this checkout.
- Lifecycle tests now construct and dispose a real controller in a separate
  host. They verify command removal and cancellation of an actual pending wait.
- Delayed non-file source tests hold `workspace.fs.readFile` until selection,
  document, or configuration changes have completed, then verify no stale edit
  or replacement evaluation occurs. Two real workspace folders resolve the
  same relative path independently, including when switching back.
- The long-form note uses explicit placeholder and contextual-navigation
  actions. It no longer forces the caret to the end before asserting tab-out.
  A separate burst test avoids per-character idle barriers. Command-driven
  tests do not prove physical keyboard routing or IME behavior.
- Source settings invalidate the cache. File saves/external changes require
  **Reload Snippets**; there is no automatic file watcher.
- A black LaTeX / Suite wordmark on white replaces the earlier icons. See
  the [VS Code brand rules](https://code.visualstudio.com/brand).
  Acorn's MIT notice ships in `THIRD_PARTY_NOTICES.md`.

## Performance boundary

The benchmark parses 12k, 120k, and 600k-character documents and queries 100
cursor positions per parse. A local sample measured approximately 1.5/18/97 ms
for parsing and 0.004/0.032/0.162 ms per cached cursor query. These are diagnostic
measurements, not a latency guarantee or CI timing threshold.

Cursor movement reuses one parsed document revision. Edits still snapshot and
parse the document; very large documents and long regex candidate lines remain
performance work. Custom JavaScript and regular expressions run synchronously
in the extension host. Revisit incremental parsing/candidate indexing before
claiming low typing latency in arbitrarily large documents.

## Remaining release gates

- [ ] Create a Marketplace publisher and confirm its ID. The provisional extension
  identity is `latex-suite-port.latex-suite`; the manifest does not reserve it
  or establish publisher ownership. If the publisher ID changes, update
  `package.json` and identity-dependent code/tests together before packaging.
- [ ] Confirm that the configured GitHub repository, README, and issue tracker
  are publicly accessible. The Marketplace resource URLs are derived from the
  configured Git remote; public availability has not been verified here.
- [ ] Review Windows and macOS minimum/stable CI results once hosted, then test
  physical Tab/Enter/Shift+Enter/Mod bindings, undo, completion popups, Tab focus
  mode, and IME input on those systems. Linux command tests cannot establish this.
- [ ] Manually grant trust in a previously restricted workspace and confirm
  configured sources become available without stale edits. The automated tests
  cover Restricted Mode itself and a simulated gate transition, not this UI flow.
- [ ] Test an actual virtual-workspace provider and remote extension host.
  Automated URI-source coverage does not prove every provider or remote setup.
  `Mod-` currently follows the extension host OS; cross-OS remote sessions need
  particular attention before claiming parity.
- [ ] Choose the release version, review Marketplace listing/identity, rebuild
  the VSIX, rerun archive/smoke checks, and explicitly authorize publication.
  Nothing in this maintenance pass publishes the extension.

## Marketplace publication

Version `1.0.0` is configured. Publication is a separate, manual step after all
release gates above pass. The publishing account and a fresh release archive
are still required; repository configuration alone cannot confirm readiness.

1. [Create a publisher](https://marketplace.visualstudio.com/manage/publishers/)
   using your Microsoft account. Use `latex-suite-port` only if you can create
   or already own that publisher ID. Confirm the extension name `latex-suite`
   and display name `LaTeX Suite` are accepted by the Marketplace.
2. Review the listing: description, README, changelog, PNG icon, license, and
   repository/homepage/issues links. The package targets desktop VS Code 1.137
   or newer; development uses Node.js 24. Consumers do not install the build
   tools separately. Browser-only VS Code is unsupported.
3. Require successful minimum/stable GitHub Actions checks on Linux, Windows,
   and macOS after the Windows license-comparison fix. Complete the remaining
   manual editor, trust, and remote checks above.
4. From the exact revision intended for release, run the reproducible checks
   above. `npm run package:vsix` creates `latex-suite-1.0.0.vsix` and builds the
   production bundle first. `npm run check:package` validates its content;
   `test:vsix` and `test:trust` exercise that same archive. Rebuild and recheck
   after any changes; previously generated archives may be stale.
5. When ready to publish, upload that checked VSIX through the publisher
   management page. Packaging, Git commits/tags, and GitHub pushes do not
   publish the extension. No automatic publishing workflow is configured.

For future command-line or automated publishing, follow the current
[official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
Keep authentication outside the repository. Prefer Microsoft Entra ID for
new automation; global Azure DevOps PATs retire on December 1, 2026.
Do not use `npm publish` to publish a VS Code extension.

This is a Node extension. Browser-only hosts such as vscode.dev are unsupported;
virtual filesystem access does not imply browser support. Upstream compatibility
and deliberately retained behavior are listed in `UPSTREAM.md`.

Revisit the linked guidance when raising `engines.vscode` or adding capabilities.
