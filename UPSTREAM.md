# Upstream attribution

This project ports typing and snippet behavior from
[Obsidian LaTeX Suite](https://github.com/artisticat1/obsidian-latex-suite),
licensed under the MIT License in `src/upstream/LICENSE.md`.

The base snapshot is version 1.13.1, commit
`ee9f3ee05e98e8144a56f74e8f218eda47bcccea` (2026-09-10).
Variables and the macro catalogue retain that snapshot. Snippet nodes, matching,
context semantics, auto-fraction, matrix, tab-out, and bracket enlargement are
adapted implementations. VS Code owns editing, placeholders, and undo.

## Review through 1.13.3 (2026-10-02)

Reviewed the [1.13.1…1.13.3 changes](https://github.com/artisticat1/obsidian-latex-suite/compare/1.13.1...1.13.3).
This is selective compatibility, not a claim of full 1.13.3 parity.

- Adopted 1.13.2's required-argument limits for text and snippetless macros,
  including colorbox/fcolorbox, operatorname, and style. A string macro selector
  means argument 0; an object without `arguments` still matches every argument.
- Adopted the inline `beg` trigger correction in `default_snippets.js`.
- Retained this port's existing `dm` behavior. Upstream 1.13.2 reworks leading
  newlines and blockquote handling; importing that whole change needs separate
  native-editor indentation/navigation fixtures. Existing plain-line and list
  behavior is covered here.
- The port's `mk` omits Obsidian's empty groups used to avoid preview flicker.
  This difference predates this maintenance pass; the defaults are not an
  unchanged upstream copy.
- Obsidian/CodeMirror rendering, concealment, file watching, and 1.13.3 Excalidraw
  changes do not transfer directly to this extension. Browser hosts, Vim,
  previews, and concealed markup remain outside this port's scope.

Keep these differences explicit when refreshing the snapshot. Port fixes with
independent expected outputs; do not regenerate test expectations from the code.
