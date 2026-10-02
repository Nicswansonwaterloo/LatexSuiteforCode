# Custom configuration typing regression

`personal-note.test.ts` replays 44 equation checkpoints in one initially empty
Markdown editor. Every input string is sent character by character through VS
Code's `type` command. The document is never prefilled or repaired with edits.
Each checkpoint checks the entire accumulated text against literal expected
output, and checks that the caret exits the equation before continuing.

Run with `npm test`, or after `npm run compile-tests && npm run compile`:

```sh
npx vscode-test --grep "Personal configuration long-form typing"
```

The actual typed Markdown is saved to `out/test/personal-note.actual.md`.
The test restores configuration in `finally` and uses `personal-snippets.js` and
`personal-variables.js` as the custom collection, without bundled snippets.
These test fixtures use loops for repeated definitions and retain known quirks
to exercise configuration collisions. Their `personal-` filenames distinguish
the custom configuration from bundled defaults; they contain no personal data.

## Coverage

| Category | Examples in the replay |
| --- | --- |
| Math mode | `mk`, `dk`, text-mode ` iff`, repeated inline/display transitions |
| Greek | `@p`, `@ve`, `@vf`, `@vt`, uppercase variants |
| Text environment | `text` with a literal label |
| Basic operations | `//`, `sq`, `cr`, `bnm`, `ee`, `rq`, `sr`, `cb`, `ivs`, subscripts, operator names |
| Accents | prefix/postfix accents, Greek/symbol accents, fonts and digit suffixes |
| Sum shortcuts | manual bounds for `sum`/`prod`, `lim`, sets, arrows, relations |
| Spaces/backslashes | `alpha`, `beta`, `nabla`, `sinx`, `expz` |
| Derivatives/integrals | `ddt`, manual `par`/`payx`, `dint`, `oinf` |
| Trigonometry | `sin`, `cos`, `cosh`, powers and arguments |
| Quantum | `bra`, `ket`, `brk`, linked placeholders in `outer` |
| Environments | inline/display matrices; cell, row, and exit commands |
| Brackets | pairs, visual selection wrapping, norms, rounding, `pmod`, `lr(` |

Navigation uses explicit native-placeholder or contextual-Tab actions, equation
exit commands, matrix commands, Backspace, Shift+Left selection, nested
fraction/root placeholders, and Undo to recover from premature expansions.
The fixture never tries both Tab commands or moves to the document end to make
the exit assertion pass. The main replay waits for each typing action to settle;
a separate burst-typing test covers consecutive input without those barriers.
This is an extension-host command replay, not an OS keyboard-binding test.

## Observed configuration collisions

- `dint` and `oinf`: `in` expands before the longer trigger is complete.
  The transcript types `din`/`oin`, undoes the expansion, then finishes the word.
- `xivs`: the Greek `xi` expansion wins before `ivs` is complete. The transcript
  undoes that expansion and finishes `vs`.
- `a!=0` and `...<=1`: automatic letter-digit subscripting can turn the command
  suffix into `\neq_{0}` or `\leq_{1}`. The transcript includes a separating space.
- The fixture's `wiletilde` digit pattern is misspelled; it does not match output
  produced by `til` (`\widetilde`). This is preserved, not silently corrected.

No custom configuration fixture is imported by production code. The existing `.vscodeignore`
ships only explicitly allowed files; this test, its fixtures, and generated
artifacts are excluded. The extension bundle still uses only the standard production entry.
