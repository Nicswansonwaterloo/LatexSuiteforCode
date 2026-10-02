import type { ResultInsert, TabstopSpec } from "./nodes";

/**
 * Convert LaTeX Suite's zero-based tabstop model to VS Code snippet syntax.
 *
 * Upstream visits $0, $1, ... numerically. VS Code reserves $0 for the final
 * cursor, so all but the numerically last upstream path are mapped to 1, 2,
 * ... and a unique last path is mapped to native $0. Reaching that tabstop
 * therefore also leaves VS Code snippet mode, matching upstream's next-Tab
 * fallthrough behavior. A repeated final group stays numbered so VS Code can
 * preserve its linked selections.
 * Building from ranges (rather than rewriting the source string) also keeps
 * literal dollar signs in TeX safe.
 */
export function toVscodeSnippet(result: ResultInsert): string {
	const tabstops = keepRepresentableLinkedTabstops(
		normalizeTabstops(result.tabstops, result.insert.length),
		result.insert,
	);
	if (tabstops.length === 0) {
		return escapeSnippetText(result.insert);
	}

	const indexKeys = Array.from(new Set(tabstops.map((tabstop) => indexKey(tabstop.index))))
		.sort((left, right) => compareIndexes(parseIndexKey(left), parseIndexKey(right)));
	const lastIndexKey = indexKeys[indexKeys.length - 1];
	const lastIndexIsUnique = tabstops.filter((tabstop) => indexKey(tabstop.index) === lastIndexKey).length === 1;
	const vscodeIndexes = new Map(indexKeys.map((key, index) => [
		key,
		index === indexKeys.length - 1 && lastIndexIsUnique ? 0 : index + 1,
	]));

	const roots = buildIntervalTree(tabstops);
	return renderRange(result.insert, 0, result.insert.length, roots, vscodeIndexes, new Set<string>());
}

/**
 * Native snippets require every occurrence of a linked placeholder to have the
 * same initial value. Upstream can represent unequal ranges in one tabstop
 * group, so retain its first editable occurrence and leave the other initial
 * text literal instead of letting VS Code materialize the wrong mirror text.
 */
function keepRepresentableLinkedTabstops(tabstops: readonly TabstopSpec[], text: string): TabstopSpec[] {
	const defaultsByIndex = new Map<string, string>();
	const incompatibleIndexes = new Set<string>();
	for (const tabstop of tabstops) {
		const key = indexKey(tabstop.index);
		const value = text.slice(tabstop.from, tabstop.to);
		const first = defaultsByIndex.get(key);
		if (first === undefined) {
			defaultsByIndex.set(key, value);
		} else if (first !== value) {
			incompatibleIndexes.add(key);
		}
	}
	const retainedIncompatible = new Set<string>();
	return tabstops.filter((tabstop) => {
		const key = indexKey(tabstop.index);
		if (!incompatibleIndexes.has(key)) {
			return true;
		}
		if (retainedIncompatible.has(key)) {
			return false;
		}
		retainedIncompatible.add(key);
		return true;
	});
}

export function escapeSnippetText(value: string): string {
	return value.replace(/[\\$}]/g, "\\$&");
}

function renderRange(
	text: string,
	from: number,
	to: number,
	children: IntervalNode[],
	indexes: ReadonlyMap<string, number>,
	renderedIndexes: Set<string>,
): string {
	let cursor = from;
	let output = "";
	for (const child of children) {
		if (child.from < cursor || child.to > to) {
			continue;
		}
		output += escapeSnippetText(text.slice(cursor, child.from));
		const key = indexKey(child.index);
		const vscodeIndex = indexes.get(key);
		if (vscodeIndex === undefined) {
			throw new Error("Internal error while mapping a LaTeX Suite tabstop");
		}
		if (renderedIndexes.has(key)) {
			output += `$${vscodeIndex}`;
		} else if (child.from === child.to) {
			renderedIndexes.add(key);
			output += `$${vscodeIndex}`;
		} else {
			renderedIndexes.add(key);
			const placeholder = renderRange(
				text,
				child.from,
				child.to,
				child.children,
				indexes,
				renderedIndexes,
			);
			output += `\${${vscodeIndex}:${placeholder}}`;
		}
		cursor = child.to;
	}
	output += escapeSnippetText(text.slice(cursor, to));
	return output;
}

interface IntervalNode extends TabstopSpec {
	children: IntervalNode[];
}

function buildIntervalTree(tabstops: TabstopSpec[]): IntervalNode[] {
	const roots: IntervalNode[] = [];
	const stack: IntervalNode[] = [];
	const ordered = tabstops
		.map((tabstop) => ({ ...tabstop, index: [...tabstop.index], children: [] as IntervalNode[] }))
		.sort((left, right) =>
			left.from - right.from ||
			right.to - left.to ||
			compareIndexes(left.index, right.index),
		);

	for (const node of ordered) {
		while (
			stack.length > 0 &&
			(!contains(stack[stack.length - 1], node) ||
				!isStrictIndexPrefix(stack[stack.length - 1].index, node.index))
		) {
			stack.pop();
		}
		const parent = stack[stack.length - 1];
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
		if (node.to > node.from) {
			stack.push(node);
		}
	}
	return removeCrossingIntervals(roots);
}

function isStrictIndexPrefix(parent: readonly number[], child: readonly number[]): boolean {
	return parent.length < child.length && parent.every((value, index) => value === child[index]);
}

function removeCrossingIntervals(nodes: IntervalNode[]): IntervalNode[] {
	const accepted: IntervalNode[] = [];
	let cursor = -1;
	for (const node of nodes) {
		if (node.from < cursor) {
			continue;
		}
		node.children = removeCrossingIntervals(node.children);
		accepted.push(node);
		cursor = Math.max(cursor, node.to);
	}
	return accepted;
}

function normalizeTabstops(tabstops: readonly TabstopSpec[], textLength: number): TabstopSpec[] {
	const seen = new Set<string>();
	const result: TabstopSpec[] = [];
	for (const tabstop of tabstops) {
		const from = clamp(tabstop.from, 0, textLength);
		const to = clamp(tabstop.to, from, textLength);
		const key = `${indexKey(tabstop.index)}:${from}:${to}`;
		if (!seen.has(key)) {
			seen.add(key);
			result.push({ index: [...tabstop.index], from, to });
		}
	}
	return result;
}

function contains(parent: IntervalNode, child: IntervalNode): boolean {
	return parent.from <= child.from && parent.to >= child.to;
}

function indexKey(index: readonly number[]): string {
	return index.join(".");
}

function parseIndexKey(key: string): number[] {
	return key.split(".").map(Number);
}

function compareIndexes(left: readonly number[], right: readonly number[]): number {
	for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
		const difference = left[index] - right[index];
		if (difference !== 0) {
			return difference;
		}
	}
	return left.length - right.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}
