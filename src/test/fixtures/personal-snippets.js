// Test-only custom snippet collection, compacted with loops.
// Preserve quirks (including wiletilde); do not replace bundled defaults with this.
const snippets = [];
const add = (trigger, replacement, options = "mA", priority = 0) =>
  snippets.push({ trigger, replacement, options, priority });
add("mk", "$$0$", "tA");
add("dk", "$$$0$$", "tA");
add(" iff", " if and only if", "tA");
add("beg", "\\begin{$0}\n$1\n\\end{$0}");
for (const [key, name] of Object.entries({
  a: "alpha", b: "beta", g: "gamma", G: "Gamma", d: "delta", D: "Delta",
  e: "epsilon", ve: "varepsilon", z: "zeta", t: "theta", T: "Theta", vt: "vartheta",
  f: "phi", vf: "varphi", p: "psi", F: "Phi", P: "Psi", i: "iota", k: "kappa",
  l: "lambda", L: "Lambda", s: "sigma", S: "Sigma", u: "upsilon", U: "Upsilon",
  o: "omega", O: "Omega",
})) { add("@" + key, "\\" + name); }
for (const [key, value] of Object.entries({
  text: "\\text{$0}$1", sr: "^{2}", cb: "^{3}", cr: "\\sqrt[3]{$0}$1",
  rq: "^{$0}$1", sq: "\\sqrt{ $0 }$1", _: "_{$0}$1", sts: "_\\text{$0}",
  "//": "\\frac{$0}{$1}$2", bnm: "\\binom{$0}{$1}$2", ee: "e^{ $0 }$1", ivs: "^{-1}",
  cdot: "\\cdot", msf: "\\mathsf{$0}$1",
})) { add(key, value); }
for (const name of ["End", "Hom", "Aut", "Mat", "wt", "GL", "char", "Pic", "disc", "trd"]) {
  add(name, "\\operatorname{" + name + "}");
}
add(/([A-Za-z])(\d)/, "[[0]]_{[[1]]}", "rmA", -1);
add(/([^\\])(exp|log|ln|det)/, "[[0]]\\[[1]]", "rmA");
for (const [key, value] of Object.entries({
  conj: "^{*}", dag: "^{\\dagger}", adj: "^{\\sharp}", str: "^*", "o+": "\\oplus ",
  ox: "\\otimes ", Re: "\\mathrm{Re}", Im: "\\mathrm{Im}", Tr: "\\operatorname{Tr}", actson: "\\curvearrowright",
})) { add(key, value); }
const accents = { hat: "widehat", smhat: "hat", bar: "overline", smbar: "bar", bf: "mathbf", cal: "mathcal", bb: "mathbb", frak: "mathfrak", rm: "mathrm", til: "widetilde", smtil: "tilde", und: "underline", vec: "vec" };
for (const [key, name] of Object.entries(accents)) {
  add(key, "\\" + name + "{$0}$1", "mA", ["smbar", "smtil"].includes(key) ? 1 : 0);
}
for (const key of ["hat", "smhat", "bar", "smbar", "til", "smtil", "und", "vec", "cal"]) {
  add(new RegExp("([a-zA-Z])(" + key + ")"), "\\" + accents[key] + "{[[0]]}", "rmA", key.startsWith("sm") ? 1 : 0);
  add("\\\\(${GREEK}|${SYMBOL}) " + key, "\\" + accents[key] + "{\\[[0]]}", "rmA", key.startsWith("sm") ? 1 : 0);
}
for (const [key, value] of Object.entries({ sr: "^{2}", cb: "^{3}", rq: "^{$0}$1" })) {
  add("\\\\(${GREEK}|${SYMBOL}) " + key, "\\[[0]]" + value, "rmA");
}
for (const name of ["hat", "overline", "bar", "mathbb", "mathcal", "mathfrak", "mathbf", "mathrm", "mathsf", "wiletilde", "tilde", "underline", "vec"]) {
  add(new RegExp("\\\\" + name + "{([A-Za-z])}(\\d)"), "\\" + (name === "wiletilde" ? "widetilde" : name) + "{[[0]]}" + (name === "mathbb" ? "^" : "_") + "{[[1]]}", "rmA");
}
add("samp", "\\overset{{\\scriptscriptstyle\\$}}{\\leftarrow}$0");
for (const [key, value] of Object.entries({
  ooo: "\\infty", sum: "\\sum", prod: "\\prod", lim: "\\lim_{ ${0:n} \\to ${1:\\infty} } $2",
  Or: "\\mathcal{O}", "+-": "\\pm", "-+": "\\mp", "...": "\\dots", xx: "\\times", "**": "\\cdot",
  para: "\\parallel", ker: "\\ker ", Fpp: "\\mathbb F_{p^2} ", "===": "\\equiv", "!=": "\\neq",
  ne: "\\ne", ">=": "\\geq", "<=": "\\leq", ge: "\\ge", le: "\\le", to: "\\to", sim: "\\sim", iso: "\\simeq", prop: "\\propto",
  arrow: "\\leftrightarrow ", gets: "\\gets", "=>": "\\implies", "=<": "\\impliedby",
  in: "\\in", notin: "\\not\\in", "\\\\\\": "\\setminus", "sub=": "\\subseteq", "sup=": "\\supseteq", eset: "\\emptyset",
  LL: "\\mathcal{L}", HH: "\\mathcal{H}", CC: "\\mathbb{C}", RR: "\\mathbb{R}", ZZ: "\\mathbb{Z}", NN: "\\mathbb{N}", QQ: "\\mathbb{Q}", FF: "\\mathbb{F}", PP: "\\mathbb{P}",
})) { add(key, value); }
for (const name of ["sum", "prod"]) { add("\\" + name, "\\" + name + "_{${0:i}=${1:1}}^{${2:N}} $3", "m"); }
for (const [key, value] of Object.entries({ mapsto: "\\mapsto", "\\in to": "\\hookrightarrow", hookright: "\\hookrightarrow", "e\\xi sts": "\\exists", "\\deg rd": "\\operatorname{degrd}" })) { add(key, value, "mA", 1); }
add("([^\\\\])(${GREEK})", "[[0]]\\[[1]]", "rmA");
add("([^\\\\])(${SYMBOL})", "[[0]]\\[[1]]", "rmA");
add("\\\\(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})([A-Za-z])", "\\[[0]] [[1]]", "rmA");
add("par", "\\frac{ \\partial ${0:y} }{ \\partial ${1:x} } $2", "m");
add(/pa([A-Za-z])([A-Za-z])/, "\\frac{ \\partial [[0]] }{ \\partial [[1]] } ", "rm");
add("ddt", "\\frac{d}{dt} ");
add(/([^\\])int/, "[[0]]\\int", "mA", -1);
add("\\int", "\\int $0 \\, d${1:x} $2", "m");
add("dint", "\\int_{${0:0}}^{${1:1}} $2 \\, d${3:x} $4");
for (const name of ["oint", "iint", "iiint"]) { add(name, "\\" + name); }
add("oinf", "\\int_{0}^{\\infty} $0 \\, d${1:x} $2");
add("infi", "\\int_{-\\infty}^{\\infty} $0 \\, d${1:x} $2");
add(/([^\\])(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)/, "[[0]]\\[[1]]", "rmA");
add(/\\(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)([A-Za-gi-z])/, "\\[[0]] [[1]]", "rmA");
add(/\\(sinh|cosh|tanh|coth)([A-Za-z])/, "\\[[0]] [[1]]", "rmA");
add("bra", "\\bra{$0} $1");
add("ket", "\\ket{$0} $1");
add("brk", "\\braket{ $0 | $1 } $2");
add("outer", "\\ket{${0:\\psi}} \\bra{${0:\\psi}} $1");
add("CD", "\\begin{CD}\n$0\n\\end{CD}", "MA");
for (const [key, name] of Object.entries({ pmat: "pmatrix", bmat: "bmatrix", Bmat: "Bmatrix", vmat: "vmatrix", Vmat: "Vmatrix", matrix: "matrix" })) {
  add(key, "\\begin{" + name + "}\n$0\n\\end{" + name + "}", "MA");
  add(key, "\\begin{" + name + "}$0\\end{" + name + "}", "nA");
}
for (const name of ["cases", "align", "array"]) { add(name, "\\begin{" + name + "}\n$0\n\\end{" + name + "}"); }
for (const [key, value] of Object.entries({ ang: "\\langle $0 \\rangle $1", norm: "\\lvert $0 \\rvert $1", Norm: "\\lVert $0 \\rVert $1", set: "\\left\\{ $0 \\right\\}$1", ceil: "\\lceil $0 \\rceil $1", floor: "\\lfloor $0 \\rfloor $1", mod: "\\bmod{$0}$1", pmod: "\\pmod{$0}$1" })) { add(key, value, "mA", /^(norm|Norm)$/.test(key) ? 1 : 0); }
for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) { add(open, open + "${VISUAL}" + close); }
for (const [open, close] of [["(", ")"], ["{", "}"], ["[", "]"]]) { add(open, open + "$0" + close + "$1"); }
for (const [open, close] of [["(", ")"], ["{", "}"], ["[", "]"], ["|", "|"], ["<", ">"]]) { add("lr" + open, "\\left" + (open === "{" ? "\\" : "") + open + " $0 \\right" + (close === "}" ? "\\" : "") + close + " $1"); }
module.exports = snippets;
