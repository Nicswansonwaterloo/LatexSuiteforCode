# Change Log

All notable changes to LaTeX Suite for VS Code are documented here.

## [Unreleased]

### Fixed

- Load bare snippet-variable objects with quoted keys such as
  `"${OPERATORNAMES}"`, allowing custom operator snippets such as `End` to expand.

## [1.0.0] - 2026-10-02

### Fixed

- Check scope, trigger look-ahead, and word boundaries before running a custom
  replacement function. Rejected matches no longer execute replacement code.
- Limit default text/color scopes to their actual arguments; adopt upstream
  1.13.2 first-argument semantics for string macro selectors and fix inline `beg`.
- Document explicit snippet-file reloads; saving a source file does not reload it.
- Normalize line endings when comparing the packaged Acorn license on Windows.

### Changed

- Configure Marketplace repository, homepage, issue, license, and banner metadata.
- Reuse parsed document context during cursor movement. Edits still reparse.
- Share manual/key expansion code, name edit options, and extract editor helpers.
- Remove unused scaffold/scratch files, refresh development tasks and fixture
  documentation, and stop retaining stale production source maps.
- Replace the earlier icons with a black LaTeX / Suite wordmark on white and
  ship Acorn's license.
- Pin packaging tooling, update vulnerable development dependencies, use Node 24
  for development, and check unhandled promises during linting.

### Tests and release preparation

- Replace prototype-only lifecycle tests with real construction and disposal.
- Make long-form placeholder/navigation actions explicit and assert actual exits.
- Add rapid typing, delayed virtual-source stale-edit, and multi-root loading tests.
- Add archive content/license checks, installed-VSIX smoke tests, and a real
  Restricted Mode test with custom-source execution traps.
- Add minimum/stable CI jobs for Linux, Windows, and macOS. Platform verification,
  release identity, and publishing gates are tracked in `DEVELOPMENT.md`.

## [0.1.2] - 2026-10-01

### Changed

- Rebuilt and repackaged on Linux. No functional changes from 0.1.1.

## [0.1.1] - 2026-09-28

### Added

- LaTeX Suite extension icon featuring a blue ribbon and white wordmark.

### Changed

- Snippets now use bundled defaults when no custom source is configured, otherwise
  only the custom collection. Empty or failed custom sources do not restore defaults.
  The former snippet mode setting is ignored without rewriting saved settings.
  Restricted Mode retains bundled snippets; variable merging is unchanged.

### Fixed

- Add Snippet File and Add Variable File now add only to User settings, preserve
  existing User entries, and recognize equivalent filesystem paths and file URIs
  without copying workspace overrides or adding duplicate entries.

### Tests

- Added coverage for User-only file commands, custom collection selection, and
  returning to previously typed equations to edit math and matrices after writing
  later content. The full suite passes 128 tests on VS Code 1.137.0 and 1.139.1.

## [0.1.0] - 2026-09-13

### Added

- Initial VS Code port of Obsidian LaTeX Suite's typing workflow for Markdown
  and LaTeX documents.
- Upstream-compatible automatic, manual, regex, visual, scoped, programmable,
  prioritized, and tabstop-aware snippets.
- Bundled Obsidian LaTeX Suite v1.13.1 default snippets and variables, with
  `extend`, `replace`, and `defaultsOnly` loading modes.
- Resource-scoped global, workspace, and multi-root folder configuration for
  inline snippets, recursively loaded snippet files, and snippet variables.
- Auto-fractions, matrix cell/row/exit shortcuts, bracket enlargement, and
  contextual Tab navigation through placeholders, delimiters, and equations.
- Workspace Trust protection for executable custom snippet and variable code,
  plus reload, toggle, settings, and debug-output commands.
- Unit and VS Code integration coverage for upstream examples and representative
  Markdown, LaTeX, custom-file, navigation, and multi-cursor cases.

### Not included

- Concealed markup, hover previews, bracket coloring/highlighting, Vim
  integration, and simultaneous multi-cursor expansion.
