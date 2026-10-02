const {
	tabstop_node,
	text_node,
	capture_node,
	snippet_node,
} = require("latex-suite");

// Deliberately uses the same executable module shape as upstream/custom files.
export default [
	{ trigger: "mk", replacement: "${}$0{}$", options: "tA" },
	{ trigger: /([A-Za-z])hat/, replacement: "\\hat{[[0]]}", options: "rmA" },
	{
		trigger: /(\d)(\d)sum/,
		replacement: (match) => [
			text_node("\\sum_{"),
			capture_node(0),
			text_node("}^{"),
			capture_node(1),
			text_node("} "),
			tabstop_node(0),
		],
		options: "rmA",
	},
	{
		trigger: "pair",
		replacement: [text_node("("), snippet_node("${0:x}, ${1:y}"), text_node(")")],
		options: "m",
	},
];
