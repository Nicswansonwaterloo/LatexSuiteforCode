# LaTeX Suite for VS Code

Fast LaTeX typing shortcuts for Markdown and LaTeX documents, ported from
[Obsidian LaTeX Suite](https://github.com/artisticat1/obsidian-latex-suite). The
extension keeps the upstream JavaScript snippet format and bundled defaults while
using VS Code's native editor, configuration, workspace-trust, and snippet APIs.

Requires VS Code 1.137 or newer.

## Features

- Automatic (`A`) and manual (`Tab`) snippets, literal or regular-expression
  triggers, priorities, word boundaries, look-ahead triggers, context filters,
  JavaScript replacement functions, visual-selection snippets, and tabstops.
- The upstream default snippet and variable sets. Try `dm`, then `xsr`, `sin @t`,
  or `x/y` followed by `Tab`.
- `/` auto-fractions, including balanced expressions and selected numerators.
- Matrix shortcuts: `Tab` inserts ` & `, `Enter` starts a row, and `Shift+Enter`
  exits the current matrix-like scope.
- Contextual `Tab` navigation through native snippet placeholders, configured
  closing delimiters, and out of an equation.
- Automatic `\left`/`\right` enlargement when a snippet inserts a configured
  large operator inside brackets.
- User settings with workspace and multi-root workspace-folder overrides.

### Markdown and LaTeX contexts

In Markdown, the context scanner recognizes `$...$`, `$$...$$`, `\(...\)`,
`\[...\]`, common LaTeX math environments, inline code, and fenced code blocks.
Fences whose first info-string word is listed in `latexSuite.forceMathLanguages`
(the default is `math`) are treated as display math. Other fences support the `c`
option and `language` field; inline code supports `C`.

In LaTeX documents, the same math delimiters and common math environments are
recognized, and `%` comments suppress otherwise context-free snippets. Math text
macros such as `\text{...}` use the `T` context. Scope conditions also understand
enclosing macros and environments.

The scanner is designed for editing, not as a complete TeX or CommonMark parser.
It does not expand TeX definitions or interpret catcode changes.

For typing responsiveness, unanchored regex triggers inspect at most the final
8,192 UTF-16 code units before the cursor. Start-anchored regexes still inspect
the complete document prefix.

## Snippets

### Loading snippets

Run **LaTeX Suite: Add Snippet File…** or **LaTeX Suite: Add Variable File…**
to choose a file with the file picker. Each command adds one entry to the
corresponding file list in **User settings**, even with a workspace open. Local
files use absolute filesystem paths; non-file resources retain their URIs.
Existing User entries are preserved, and selecting an already-listed path or
equivalent file URI does not add a duplicate. Canceling leaves settings unchanged.
Workspace and folder settings are never copied, changed, or migrated by these
commands. Existing workspace/folder overrides still take precedence; edit those
settings separately if you want the User file list to apply in that workspace.

A project can configure a custom snippet collection in
`.vscode/settings.json`:

```json
{
  "latexSuite.snippets.files": [".vscode/latex-suite/snippets.js"],
  "latexSuite.snippets.variableFiles": [".vscode/latex-suite/variables.js"]
}
```

With no custom snippet source configured, the bundled snippets are used. Setting
inline snippet source or one or more snippet files selects your custom collection
instead. Inline source and files are loaded together; bundled snippets are never
implicitly merged into that collection. Blank inline text and blank path entries
are ignored. To deliberately use no snippets, configure `[]` as the inline source.
An empty collection, empty file/directory, or failed custom source does not bring
back bundled snippets. Source errors are reported in the LaTeX Suite output channel.
Restricted Mode always uses bundled snippets because custom JavaScript is disabled.

The former `latexSuite.snippets.mode` setting is no longer used. Saved `extend`,
`replace`, and `defaultsOnly` values are ignored; settings files are not rewritten.
Existing custom sources now replace bundled snippets regardless of that old value.
Clear the custom snippet source and file list to return to bundled snippets.
In particular, an old `defaultsOnly` value no longer disables configured custom
sources in a trusted workspace, and `replace` with no sources now uses the defaults.

`latexSuite.snippets.source` and `latexSuite.snippets.variablesSource` accept the
same JavaScript inline in settings. Files are easier to edit and version. A file
may use `export default`, `module.exports`, or contain a bare array/object
expression. A configured directory is read recursively in lexical path order;
every file is treated as JavaScript regardless of extension.

Relative paths resolve against the workspace folder containing the active
document (or the first workspace folder if the document is outside every folder).
Without a workspace folder, use an absolute path or `file:` URI. In a multi-root
workspace, the same relative setting can therefore resolve to a different file
for each folder. Run **LaTeX Suite: Reload Snippets** after editing snippet or variable files.
Files are cached and are not watched for saves or external changes. Changing
source settings also invalidates the cache; errors appear in the **LaTeX Suite**
output channel.

Settings have VS Code's `resource` scope. Put them in User Settings for a global
default, Workspace Settings for a project override, or a workspace-folder
settings file for a multi-root override. Open the focused settings page with
**LaTeX Suite: Open Settings**.

### Upstream-compatible format

```js
export default [
  { trigger: "@l", replacement: "\\lambda", options: "mA" },
  { trigger: "sq", replacement: "\\sqrt{${0:x}}$1", options: "m" },
  {
    trigger: /([A-Za-z])(\d)/,
    replacement: "[[0]]_{[[1]]}",
    options: "mA",
    priority: 10,
    description: "Single-letter subscript"
  },
  {
    trigger: "(",
    replacement: "\\left( ${VISUAL} \\right)$0",
    options: "mv"
  }
];
```

A snippet has the following fields:

| Field | Meaning |
| --- | --- |
| `trigger` | String or `RegExp` matched immediately before the caret |
| `replacement` | String, replacement function, or array of `latex-suite` nodes |
| `options` | Concatenated option flags from the table below |
| `priority` | Higher numbers match first; default `0`, negative values allowed |
| `description` | Used in diagnostics; optional |
| `flags` | Regex flags `i`, `m`, `s`, `u`, or `v` |
| `triggerAfter` | String or regex that must match immediately after the caret and is consumed |
| `triggerKey` | Upstream key name such as `Ctrl-a` or `Mod-Alt-l` |
| `language` | Exact fenced-code language, used with code-block snippets |
| `excludedMacros` | Macro names, or `{ name, arguments: [0, ...] }` records, where expansion is disabled |
| `excludedEnvironments` | Environment names where expansion is disabled |
| `includedMacros` | Macro names/argument records where expansion is exclusively enabled |

Macro argument indexes are zero-based. A macro name written as a string matches
its first required argument, following upstream 1.13.2. Use `{ name: "macro" }`
to match every argument, or specify `arguments` explicitly. Matching order is descending priority,
then descending trigger length, then source order. Give a snippet a higher priority
when it must supersede another matching snippet in your collection.

| Option | Context or behavior |
| --- | --- |
| `t` | Text outside math |
| `m` | Math (`n` or `M`) |
| `n` | Inline math |
| `M` | Display math, including configured math fences |
| `T` | Text inside a math text macro such as `\text{}` |
| `c` | Markdown fenced code; combine with `language` to select its info string |
| `C` | Markdown inline code |
| `A` | Expand automatically when the final trigger character is typed |
| `r` | Treat a string trigger as a regular expression; a `RegExp` trigger implies it |
| `v` | Visual snippet acting on a selection |
| `w` | Require configured word delimiters before and after the match |
| `U` | Skip the intermediate undo state that restores only the final trigger key |

With no mode flag, the upstream catch-all mode semantics are used. Multiple mode
flags are alternatives. Regex and visual modes are mutually exclusive.
`triggerAfter` may be a regex only for a regex snippet.

Replacement tabstops use upstream numbering: `$0`, `$1`, ... or
`${1:default}`. `Tab` visits them numerically through VS Code's native snippet
mode; repeated numbers with equal defaults are linked placeholders. A unique
last group becomes VS Code's final cursor so the following `Tab` can immediately
resume contextual navigation. A repeated last group stays linked and requires
one `Tab` to leave snippet mode. VS Code cannot natively link occurrences whose
initial defaults differ; in that rare case the first occurrence remains editable
and the later defaults remain literal. In regex replacement strings,
`[[0]]`, `[[1]]`, ... mean the first, second, ... capture group. JavaScript
string escaping still applies, so a literal LaTeX backslash is written `\\`.

Visual snippets replace the current selection when their one-character trigger
is typed. `${VISUAL}` contains a Markdown-normalized multiline selection;
`${VISUAL_ORIGINAL}` preserves its original text. A visual snippet may instead
omit `trigger` and use `triggerKey`.

Snippet-variable files export an object. Names may be written with or without
`${...}`:

```js
export default {
  GREEK_LOWER: "(?:alpha|beta|gamma|delta)"
};
```

They can then be interpolated in triggers, for example
`trigger: "(${GREEK_LOWER})hat"`. Custom variables extend or replace variables
of the same name from the bundled variable set.

Bundled **variables** remain available with either snippet collection. Custom
variable files override matching names and retain all other
bundled variables. This is independent of snippet collection selection: custom
variables alone do not replace bundled snippets, and custom snippets still receive
bundled variables plus any custom overrides.

### Programmable replacements

Function replacements receive the matched string/`RegExpExecArray` (or selected
text for a visual snippet) and a compatibility API. Return a string or a
`BaseNode[]`; return `false` to decline the match.

```js
const ls = require("latex-suite");

module.exports = [
  {
    trigger: /iden(\d)/,
    options: "mA",
    replacement: (match) => {
      const n = Number(match[1]);
      const rows = Array.from({ length: n }, (_, row) =>
        Array.from({ length: n }, (_, column) => row === column ? "1" : "0")
          .join(" & ")
      );
      return `\\begin{pmatrix}\n${rows.join(" \\\\\n")}\n\\end{pmatrix}`;
    }
  },
  {
    trigger: /(\w)(\d)/,
    options: "mrA",
    replacement: [
      ls.capture_node(0),
      ls.text_node("_{"),
      ls.capture_node(1),
      ls.text_node("}")
    ]
  }
];
```

`require("latex-suite")` exposes `snippetVariables`, `tabstop_node`, `text_node`,
`capture_node`, `snippet_node`, `array_node`, and `ALL_MACROS`. The second
function argument supplies `adapter` and its upstream alias `view`, plus
`options.captures`. The adapter exposes the VS Code `document` and a small
CodeMirror-compatible read-only `state` shape; it is not a CodeMirror
`EditorView`. Snippets that depend on Obsidian or other CodeMirror APIs may need
porting.

#### Trust and security

Custom snippet and variable sources are executable JavaScript, not data. They
run in the extension host without a sandbox and can load Node modules or access
files and processes with the extension host's permissions. Only load code you
trust and review project-level settings before trusting a workspace.

In VS Code Restricted Mode, all inline and file-based custom snippet/variable
sources are skipped. Bundled defaults remain available.

Virtual workspaces support bundled and self-contained custom sources. A custom
snippet loaded from a non-file URI cannot use relative Node.js imports such as
`require("./helper")`; keep that snippet self-contained or use a local workspace.

## Commands and keybindings

| Command palette title | Command ID | Default key |
| --- | --- | --- |
| LaTeX Suite: Expand Snippet | `latexSuite.expandSnippet` | Contextual `Tab` |
| LaTeX Suite: Expand Snippet by Trigger Key | `latexSuite.expandSnippetByKey` | None |
| LaTeX Suite: Contextual Tab | `latexSuite.tab` | `Tab` in enabled Markdown/LaTeX editors |
| LaTeX Suite: Insert Auto-fraction | `latexSuite.autoFraction` | None (`/` is automatic in math) |
| LaTeX Suite: Move to Next Bracket or Exit Equation | `latexSuite.nextBracketOrEquation` | Contextual `Tab` |
| LaTeX Suite: Add Matrix Cell | `latexSuite.matrixCell` | Contextual `Tab` |
| LaTeX Suite: Add Matrix Row | `latexSuite.matrixNewline` | `Enter` in a configured matrix scope |
| LaTeX Suite: Exit Matrix | `latexSuite.matrixExit` | `Shift+Enter` in a configured matrix scope |
| LaTeX Suite: Reload Snippets | `latexSuite.reloadSnippets` | None |
| LaTeX Suite: Add Snippet File… | `latexSuite.addSnippetFile` | None |
| LaTeX Suite: Add Variable File… | `latexSuite.addVariableFile` | None |
| LaTeX Suite: Toggle Typing Shortcuts | `latexSuite.toggleEnabled` | None |
| LaTeX Suite: Open Settings | `latexSuite.openSettings` | None |

Contextual `Tab` first leaves VS Code's native snippet mode alone. Otherwise it
tries a manual snippet, skips an unclosed matrix delimiter, adds a matrix cell,
visits the next configured closer, exits the equation, and finally falls back to
the normal VS Code Tab command. The default binding is active when
`editor.tabCompletion` is `off`; if you use VS Code's Tab Completion feature,
bind `latexSuite.tab` explicitly where you want this workflow.

To bind an upstream `triggerKey`, add a VS Code keybinding and pass either a
string command argument or an object with `triggerKey`. Without an argument the
command prompts for a key name.

```json
{
  "key": "ctrl+alt+l",
  "command": "latexSuite.expandSnippetByKey",
  "when": "editorTextFocus && !editorReadonly && !editorHasMultipleSelections",
  "args": { "triggerKey": "Ctrl-Alt-l" }
}
```

Use upstream/CodeMirror modifier spelling in `triggerKey`: `Ctrl-`, `Alt-`,
`Shift-`, `Meta-`, or portable `Mod-` (`Meta` on macOS, `Ctrl` elsewhere).
Space-separated chords are supported. For a non-automatic snippet with both
`trigger` and `triggerKey`, both must match; with `A`, invoking the key ignores
the text trigger.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `latexSuite.enabled` | `true` | Master switch |
| `latexSuite.snippets.enabled` | `true` | Automatic and manual snippet expansion |
| `latexSuite.snippets.files` | `[]` | Snippet files or directories |
| `latexSuite.snippets.source` | `""` | Inline snippet JavaScript |
| `latexSuite.snippets.variableFiles` | `[]` | Snippet-variable files |
| `latexSuite.snippets.variablesSource` | `""` | Inline variable-object JavaScript |
| `latexSuite.snippets.recursionLimit` | `0` | Extra automatic-expansion passes, `0`-`10` |
| `latexSuite.snippets.wordDelimiters` | punctuation and whitespace | Delimiters accepted by `w`; `\\n` and `\\t` are decoded |
| `latexSuite.snippets.removeTrailingWhitespace` | `true` | Trim replacement-end whitespace in inline math |
| `latexSuite.forceMathLanguages` | `["math"]` | Markdown fence languages treated as display math |
| `latexSuite.autoFraction.enabled` | `true` | Enable `/` and the auto-fraction command |
| `latexSuite.autoFraction.symbol` | `"\\frac"` | Fraction command to insert |
| `latexSuite.autoFraction.breakingCharacters` | `"+-=\\t"` | Extra backward-scan boundaries |
| `latexSuite.autoFraction.excludedRegions` | `^{...}`, `\\pu{...}` | Delimited regions where auto-fraction is disabled |
| `latexSuite.matrixShortcuts.enabled` | `true` | Matrix `Tab`/`Enter`/`Shift+Enter` behavior |
| `latexSuite.matrixShortcuts.environments` | common matrix/align environments | Environments considered matrix-like |
| `latexSuite.matrixShortcuts.macros` | `["eqalign"]` | Macros considered matrix-like |
| `latexSuite.tabOut.enabled` | `true` | Bracket/equation Tab navigation |
| `latexSuite.tabOut.closingSymbols` | common right delimiters | Delimiters visited by Tab |
| `latexSuite.tabOut.exitEquationOnlyAtEndOfLine` | `true` | Require only whitespace before the equation end |
| `latexSuite.bracketEnlargement.enabled` | `true` | Add `\left` and `\right` after qualifying snippet expansions |
| `latexSuite.bracketEnlargement.triggers` | `\\sum`, `\\int`, `\\frac`, ... | Replacement substrings that qualify |
| `latexSuite.bracketEnlargement.insertSpaces` | `true` | Add spaces inside enlarged brackets |
| `latexSuite.debug` | `off` | `off`, `info`, or `verbose` output logging |

## Scope and limitations

This port intentionally omits concealed markup, hover math previews, bracket
coloring/highlighting, and Vim integration. It does not expand simultaneously at
multiple editor cursors or selections; commands and automatic expansion require
one selection. Linked placeholders inside one inserted snippet remain supported.

Automatic expansion observes direct, single-character typing. Paste,
multi-character edits, undo/redo events, and IME composition may require manual
expansion. Bracket enlargement runs after a LaTeX Suite replacement containing a
configured trigger, not after arbitrary edits.

## Development

See the [development guide](https://github.com/Nicswansonwaterloo/latexsuiteport/blob/main/DEVELOPMENT.md)
for the VS Code API review, engineering rules, and release checks.

```sh
# Node.js 24 (see .nvmrc)
npm ci
npm run test:unit
npm test
npm run package:vsix
npm run check:package
npm run test:vsix
npm run test:trust
```

Use `npm run watch` while developing. `npm test` compiles and runs the VS Code
integration suites; `npm run test:unit` runs the editor-independent checks.
`npm run compile` performs type-checking, linting, and a
development bundle; `npm run package` creates the production bundle used by
`vscode:prepublish`. `npm run package:vsix` creates a local installable archive;
`test:vsix` and `test:trust` install it into disposable test profiles. None of
these commands publish the extension.

## Upstream and license

The snippet engine behavior is adapted from Obsidian LaTeX Suite under the MIT
License. Bundled default snippets, variables, and the macro catalogue are based on
[Obsidian LaTeX Suite v1.13.1](https://github.com/artisticat1/obsidian-latex-suite/tree/1.13.1);
the macro snapshot records upstream commit `ee9f3ee`. Selected 1.13.2 scope and
inline-environment fixes are included; port-specific differences are recorded
in `UPSTREAM.md`. See `src/upstream/LICENSE.md` and `THIRD_PARTY_NOTICES.md`. This is an independent VS
Code port and is not an official Obsidian LaTeX Suite release.
