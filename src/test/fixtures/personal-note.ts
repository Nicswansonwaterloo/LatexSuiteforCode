// Each string is typed one character at a time. Tabs visit native placeholders;
// manual invokes the public expansion command for a nonautomatic snippet.
export type NoteAction = string | { command: "placeholder" | "contextualTab" | "manual" | "undo" | "backspace" | "cell" | "row" | "exitMatrix" | "selectLeft" | "selectionEnd" };
const tab: NoteAction = { command: "placeholder" };
const contextualTab: NoteAction = { command: "contextualTab" };
const manual: NoteAction = { command: "manual" };
const undo: NoteAction = { command: "undo" };
const backspace: NoteAction = { command: "backspace" };
const cell: NoteAction = { command: "cell" };
const row: NoteAction = { command: "row" };
const exitMatrix: NoteAction = { command: "exitMatrix" };
const selectLeft: NoteAction = { command: "selectLeft" };
export type NotePart = { prose: string; expected?: string } | {
	label: string; categories: string[]; inline?: boolean;
	actions: NoteAction[]; expected: string;
};

export const personalNote: NotePart[] = [
	{ prose: "# Scratch calculations\n\n" },
	{ label: "inline transition", categories: ["Math mode"], inline: true, actions: ["x2+y2=z2"], expected: "x_{2}+y_{2}=z_{2}" },
	{ prose: " iff " , expected: " if and only if " },
	{ label: "inline return", categories: ["Math mode"], inline: true, actions: ["z2=x2+y2"], expected: "z_{2}=x_{2}+y_{2}" },
	{ prose: "\n\n" },
	{ label: "fraction and inverse", categories: ["Basic operations"], actions: ["//", "a+b", tab, "c", tab, "=xi", undo, "vs"], expected: "\\frac{a+b}{c}=x^{-1}" },
	{ label: "roots and powers", categories: ["Basic operations"], actions: ["sq", "x", tab, "+cr", "y", tab, "=zcb"], expected: "\\sqrt{ x }+\\sqrt[3]{y}=z^{3}" },
	{ label: "binomial coefficient", categories: ["Basic operations"], actions: ["bnm", "n", tab, "k", tab, "=bnm", "n", tab, "n-k", tab], expected: "\\binom{n}{k}=\\binom{n}{n-k}" },
	{ label: "exponential", categories: ["Basic operations"], actions: ["ee", "-t", tab, ", e rq", "it", tab], expected: "e^{ -t }, e ^{it}" },
	{ label: "font subscripts", categories: ["Accents"], actions: ["bb", "R", tab, "3, cal", "F", tab, "2, frak", "g", tab, "1"], expected: "\\mathbb{R}^{3}, \\mathcal{F}_{2}, \\mathfrak{g}_{1}" },
	{ label: "vector and accents", categories: ["Accents"], actions: ["xvec+ytil=zund, Asmbar=Bsmhat"], expected: "\\vec{x}+\\widetilde{y}=\\underline{z}, \\bar{A}=\\hat{B}" },
	{ label: "Greek accents", categories: ["Accents", "Greek letters"], actions: ["@g smhat+@D bar=@o til"], expected: "\\hat{\\gamma}+\\overline{\\Delta}=\\widetilde{\\omega}" },
	{ label: "font wrappers", categories: ["Accents", "Basic operations"], actions: ["bf", "v", tab, "=rm", "v", tab, ", msf", "A", tab, "2=A2"], expected: "\\mathbf{v}=\\mathrm{v}, \\mathsf{A}_{2}=A_{2}" },
	{ label: "products and relations", categories: ["Sum Cool Shortcuts"], actions: ["V o+W iso U, x ox y, a**b!= 0, x+-y"], expected: "V \\oplus W \\simeq U, x \\otimes  y, a\\cdot b\\neq 0, x\\pm y" },
	{ label: "sets and arrows", categories: ["Sum Cool Shortcuts", "Brackets"], actions: ["X sub=RR, x mapsto xsr, X arrow Y"], expected: "X \\subseteq \\mathbb{R}, x \\mapsto x^{2}, X \\leftrightarrow  Y" },
	{ label: "named operators", categories: ["Basic operations"], actions: ["Aut V sub=GL V, Hom V=End V"], expected: "\\operatorname{Aut} V \\subseteq \\operatorname{GL} V, \\operatorname{Hom} V=\\operatorname{End} V" },
	{ label: "automatic spacing", categories: ["Handle spaces and backslashes"], actions: ["alpha x+beta y= nabla f, sinx+cosh y= expz"], expected: "\\alpha x+\\beta y= \\nabla f, \\sin x+\\cosh y= \\exp z" },
	{ label: "bracket navigation", categories: ["Brackets"], actions: ["(", "x+y", tab, "[", "z", tab, "+set", "a,b", tab], expected: "(x+y)[z]+\\left\\{ a,b \\right\\}" },
	{ label: "rounding", categories: ["Brackets"], actions: ["ceil", "x", tab, "+floor", "y", tab, "=n"], expected: "\\lceil x \\rceil +\\lfloor y \\rfloor =n" },
	{ label: "modular arithmetic", categories: ["Brackets", "Sum Cool Shortcuts"], actions: ["a===b pmod", "p", tab], expected: "a\\equiv b \\pmod{p}" },
	{ label: "finite product", categories: ["Sum Cool Shortcuts"], actions: ["prod", manual, tab, tab, "n", tab, "x", "_", "i", tab], expected: "\\prod_{i=1}^{n} x_{i}" },
	{ label: "limit", categories: ["Sum Cool Shortcuts"], actions: ["lim", tab, tab, "a", "_", "n", tab, "=0"], expected: "\\lim_{ n \\to \\infty } a_{n}=0" },
	{ label: "manual regex derivative", categories: ["Derivatives and integrals"], actions: ["payx", manual, "=z"], expected: "\\frac{ \\partial y }{ \\partial x } =z" },
	{ label: "improper integral", categories: ["Derivatives and integrals"], actions: ["oin", undo, "f", "f", tab, "t", tab, "=L"], expected: "\\int_{0}^{\\infty} f \\, dt =L" },
	{ label: "bra and ket", categories: ["Quantum mechanics"], actions: ["bra", "u", tab, "ket", "v", tab, "=0"], expected: "\\bra{u} \\ket{v} =0" },
	{ label: "matrix keys", categories: ["Environments"], actions: ["pmat", "1", cell, "2", row, "3", cell, "4", exitMatrix], expected: "\\begin{pmatrix}\n1 & 2 \\\\\n3 & 4\n\\end{pmatrix}" },
	{ label: "backspace correction", categories: ["Basic operations"], actions: ["x+q", backspace, "y=0"], expected: "x+y=0" },
	{ label: "visual wrapping", categories: ["Brackets"], actions: ["x", selectLeft, "(", { command: "selectionEnd" }], expected: "(x)" },
	{ label: "nested fraction root", categories: ["Basic operations"], actions: ["//", "1", tab, "sq", "x", tab, contextualTab, "=y"], expected: "\\frac{1}{\\sqrt{ x }}=y" },
	{ label: "inline matrix", categories: ["Environments"], inline: true, actions: ["bmat", "a & b \\\\ c & d", exitMatrix], expected: "\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}" },
	{ prose: "\n\n" },
	{ label: "Greek variants", categories: ["Greek letters"], actions: ["@ve+@vf+@vt=@L+@P+@O"], expected: "\\varepsilon+\\varphi+\\vartheta=\\Lambda+\\Psi+\\Omega" },
	{ label: "symbol accent", categories: ["Accents", "Handle spaces and backslashes"], actions: ["nabla smhat=partial bar"], expected: "\\hat{\\nabla}=\\overline{\\partial}" },
	{ label: "conjugates", categories: ["Basic operations"], actions: ["zconj=Re z-i Im z, Aadj=Bdag"], expected: "z^{*}=\\mathrm{Re} z-i \\mathrm{Im} z, A^{\\sharp}=B^{\\dagger}" },
	{ label: "ambient space", categories: ["Math mode", "Sum Cool Shortcuts"], actions: ["HH=CC2"], expected: "\\mathcal{H}=\\mathbb{C}^{2}" },
	{ label: "state column", categories: ["Greek letters", "Environments", "Trigonometry"], actions: ["@p=pmat", "cos@t \\\\ sin@t", exitMatrix], expected: "\\psi=\\begin{pmatrix}\n\\cos\\theta \\\\ \\sin\\theta\n\\end{pmatrix}" },
	{ label: "normalization", categories: ["Brackets", "Basic operations"], actions: ["Norm", "@p", contextualTab, "sr= cos", "rq", "2", tab, "@t+ sin", "rq", "2", tab, "@t=1"], expected: "\\lVert \\psi \\rVert^{2}= \\cos ^{2}\\theta+ \\sin ^{2}\\theta=1 " },
	{ label: "observable", categories: ["Environments", "Basic operations"], actions: ["A=bmat", "1 & 0 \\\\ 0 & -1", exitMatrix], expected: "A=\\begin{bmatrix}\n1 & 0 \\\\ 0 & -1\n\\end{bmatrix}" },
	{ label: "operator identities", categories: ["Basic operations"], actions: ["Adag=A, Asr=I, Tr A=0, det A=-1"], expected: "A^{\\dagger}=A, A^{2}=I, \\operatorname{Tr} A=0, \\det A=-1" },
	{ label: "operator notation", categories: ["Accents", "Handle spaces and backslashes"], actions: ["A in End", "lr(", "HH", contextualTab, ", Bsmhat=A, zbar=z, alpha x= beta y"], expected: "A \\in \\operatorname{End}\\left( \\mathcal{H} \\right), \\hat{B}=A, \\overline{z}=z, \\alpha x= \\beta y " },
	{ label: "probabilities", categories: ["Basic operations", "Trigonometry"], actions: ["p1= cos", "rq", "2", tab, "@t, p2= sin", "rq", "2", tab, "@t, p1+p2=1"], expected: "p_{1}= \\cos ^{2}\\theta, p_{2}= \\sin ^{2}\\theta, p_{1}+p_{2}=1" },
	{ label: "expectation", categories: ["Quantum mechanics", "Brackets"], actions: ["ang", "A", tab, "=brk", "u", tab, "A|u", tab, "=p1-p2= cos", "lr(", "2@t", contextualTab], expected: "\\langle A \\rangle =\\braket{ u | A|u } =p_{1}-p_{2}= \\cos \\left( 2\\theta \\right) " },
	{ label: "uncertainty", categories: ["Greek letters", "Basic operations", "Brackets"], actions: ["@s= sq", "1-mu sr", contextualTab, ", 0<=@s<= 1"], expected: "\\sigma= \\sqrt{ 1-\\mu^{2} }, 0\\leq\\sigma\\leq 1" },
	{ label: "time derivative", categories: ["Derivatives and integrals", "Trigonometry"], actions: ["ddt", "mu=-2 sin", "lr(", "2t", tab], expected: "\\frac{d}{dt} \\mu=-2 \\sin \\left( 2t \\right) " },
	{ label: "partial derivative", categories: ["Derivatives and integrals"], actions: ["par", manual, "y", tab, "t", tab, "=-2 sin", "lr(", "2t", tab], expected: "\\frac{ \\partial y }{ \\partial t } =-2 \\sin \\left( 2t \\right) " },
	{ label: "integral", categories: ["Derivatives and integrals", "Basic operations", "Text environment"], actions: ["din", undo, "t", tab, "2", tab, "t", tab, "t", tab, "=2, text", "area", tab], expected: "\\int_{0}^{2} t \\, dt =2, \\text{area}" },
	{ label: "finite normalization", categories: ["Sum Cool Shortcuts"], actions: ["sum", manual, tab, tab, "2", tab, "p", "_", "i", tab, "=1"], expected: "\\sum_{i=1}^{2} p_{i}=1" },
	{ label: "density operator", categories: ["Quantum mechanics"], actions: ["rho=outer", tab, ", Tr rho=1, rho sr=rho"], expected: "\\rho=\\ket{\\psi} \\bra{\\psi} , \\operatorname{Tr} \\rho=1, \\rho^{2}=\\rho" },
];
