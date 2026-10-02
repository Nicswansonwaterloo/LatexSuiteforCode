import * as vscode from "vscode";
import type { EditPlan, TextEditPlan } from "../core/features";
import type { ResultInsert } from "../core/nodes";
import { createReadOnlyEditorState } from "../core/editorAdapter";
import type { SnippetFunctionAdapter } from "../snippetRepository";

export function createFunctionAdapter(
	document: vscode.TextDocument,
	source: string,
	selectionStart: number,
	selectionEnd: number,
): SnippetFunctionAdapter {
	let state: SnippetFunctionAdapter["state"] | undefined;
	return {
		document,
		get state() {
			state ??= createReadOnlyEditorState(
				source,
				normalizedOffset(source, selectionStart),
				normalizedOffset(source, selectionEnd),
			);
			return state;
		},
	};
}

function normalizedOffset(source: string, offset: number): number {
	return source.slice(0, offset).replace(/\r\n?|\n/g, "\n").length;
}

export function trimReplacement(replacement: ResultInsert): ResultInsert {
	const insert = replacement.insert.trimEnd();
	return {
		insert,
		tabstops: replacement.tabstops.map((tabstop) => ({
			...tabstop,
			from: Math.min(tabstop.from, insert.length),
			to: Math.min(tabstop.to, insert.length),
		})),
	};
}

export function firstTabstopByIndex(replacement: ResultInsert): ResultInsert["tabstops"][number] | undefined {
	return [...replacement.tabstops].sort((left, right) => {
		const length = Math.max(left.index.length, right.index.length);
		for (let index = 0; index < length; index += 1) {
			const difference = (left.index[index] ?? -1) - (right.index[index] ?? -1);
			if (difference !== 0) {
				return difference;
			}
		}
		return 0;
	})[0];
}

export function normalizeReplacementEol(replacement: ResultInsert, eol: vscode.EndOfLine): ResultInsert {
	const target = eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
	const edits = [...replacement.insert.matchAll(/\r\n?|\n/g)].map((match) => ({
		from: match.index ?? 0,
		to: (match.index ?? 0) + match[0].length,
		text: target,
	}));
	if (edits.every((edit) => replacement.insert.slice(edit.from, edit.to) === edit.text)) {
		return replacement;
	}
	let insert = replacement.insert;
	for (const edit of [...edits].reverse()) {
		insert = insert.slice(0, edit.from) + edit.text + insert.slice(edit.to);
	}
	const mapOffset = (offset: number): number => {
		let delta = 0;
		for (const edit of edits) {
			if (offset <= edit.from) {
				break;
			}
			if (offset < edit.to) {
				return edit.from + delta + edit.text.length;
			}
			delta += edit.text.length - (edit.to - edit.from);
		}
		return offset + delta;
	};
	return {
		insert,
		tabstops: replacement.tabstops.map((tabstop) => ({
			...tabstop,
			from: mapOffset(tabstop.from),
			to: mapOffset(tabstop.to),
		})),
	};
}

export interface VisualSelectionInfo {
	original: string;
	parsed: string;
	linePrefix: string;
	prefixWasSelected: boolean;
}

export interface EditorSelectionSnapshot {
	anchor: number;
	active: number;
}

export function captureSelection(editor: vscode.TextEditor): EditorSelectionSnapshot {
	return {
		anchor: editor.document.offsetAt(editor.selection.anchor),
		active: editor.document.offsetAt(editor.selection.active),
	};
}

export function selectionMatches(editor: vscode.TextEditor, expected: EditorSelectionSnapshot): boolean {
	return editor.document.offsetAt(editor.selection.anchor) === expected.anchor &&
		editor.document.offsetAt(editor.selection.active) === expected.active;
}

export function selectionBoundsMatch(selection: EditorSelectionSnapshot, start: number, end: number): boolean {
	return Math.min(selection.anchor, selection.active) === start &&
		Math.max(selection.anchor, selection.active) === end;
}

export interface VisualTypingOperation {
	oldStart: number;
	oldEnd: number;
	currentStart: number;
	currentEnd: number;
	triggerKey: string;
}

export interface AutoClosedPairOperation {
	currentStart: number;
	cursor: number;
	currentEnd: number;
	open: string;
	close: string;
	syntheticClose: boolean;
}

export interface TypedChangeUndoBase {
	currentStart: number;
	currentEnd: number;
	previousText: string;
}

export interface AutomaticExpansionOptions {
	undoBase?: TypedChangeUndoBase;
	autoClosedPair?: AutoClosedPairOperation;
	preserveTriggerOnUndo?: boolean;
}

function mapOffsetAcrossRestoredChange(offset: number, change: TypedChangeUndoBase): number {
	if (offset <= change.currentStart) {
		return offset;
	}
	if (offset >= change.currentEnd) {
		return offset + change.previousText.length - (change.currentEnd - change.currentStart);
	}
	return change.currentStart + Math.min(offset - change.currentStart, change.previousText.length);
}

export function mapSelectionAcrossChange(
	selection: EditorSelectionSnapshot,
	change: TypedChangeUndoBase,
): EditorSelectionSnapshot {
	return {
		anchor: mapOffsetAcrossRestoredChange(selection.anchor, change),
		active: mapOffsetAcrossRestoredChange(selection.active, change),
	};
}

export function replaceTextRange(source: string, start: number, end: number, text: string): string {
	return source.slice(0, start) + text + source.slice(end);
}

export function applyTextEdits(source: string, edits: readonly TextEditPlan[]): string {
	let result = source;
	for (const edit of [...edits].sort((left, right) => right.start - left.start || right.end - left.end)) {
		result = replaceTextRange(result, edit.start, edit.end, edit.text);
	}
	return result;
}

export function mapSelectionAcrossTextEdits(
	selection: EditorSelectionSnapshot,
	edits: readonly TextEditPlan[],
): EditorSelectionSnapshot {
	const ordered = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
	const mapOffset = (offset: number): number => {
		let delta = 0;
		for (const edit of ordered) {
			if (offset <= edit.start) {
				break;
			}
			if (offset < edit.end) {
				return edit.start + delta + edit.text.length;
			}
			delta += edit.text.length - (edit.end - edit.start);
		}
		return offset + delta;
	};
	return {
		anchor: mapOffset(selection.anchor),
		active: mapOffset(selection.active),
	};
}

export function mapPlanAcrossRestoredChange(
	plan: EditPlan,
	change: TypedChangeUndoBase,
	currentSource: string,
): EditPlan {
	const unionStart = Math.min(plan.start, change.currentStart);
	const unionEnd = Math.max(plan.end, change.currentEnd);
	const retainedPrefix = currentSource.slice(unionStart, plan.start);
	const retainedSuffix = currentSource.slice(plan.end, unionEnd);
	return {
		start: mapOffsetAcrossRestoredChange(unionStart, change),
		end: mapOffsetAcrossRestoredChange(unionEnd, change),
		replacement: {
			insert: retainedPrefix + plan.replacement.insert + retainedSuffix,
			tabstops: plan.replacement.tabstops.map((tabstop) => ({
				...tabstop,
				from: retainedPrefix.length + tabstop.from,
				to: retainedPrefix.length + tabstop.to,
			})),
		},
	};
}

export function mapAutoClosedPairAcrossRestoredChange(
	operation: AutoClosedPairOperation,
	change: TypedChangeUndoBase,
): AutoClosedPairOperation {
	return {
		currentStart: mapOffsetAcrossRestoredChange(operation.currentStart, change),
		cursor: mapOffsetAcrossRestoredChange(operation.cursor, change),
		currentEnd: mapOffsetAcrossRestoredChange(operation.currentEnd, change),
		open: operation.open,
		close: operation.close,
		syntheticClose: operation.syntheticClose,
	};
}

export function isCollapsedAt(editor: vscode.TextEditor, offset: number): boolean {
	return editor.selection.isEmpty && editor.document.offsetAt(editor.selection.active) === offset;
}

export function detectAutoClosePair(
	changes: readonly vscode.TextDocumentContentChangeEvent[],
	oldSource: string,
): AutoClosedPairOperation | null {
	const pairs: Readonly<Record<string, string>> = {
		"(": ")",
		"[": "]",
		"{": "}",
		"\"": "\"",
		"'": "'",
		"`": "`",
		"$": "$",
		"<": ">",
		"|": "|",
	};
	if (changes.length === 1) {
		const [change] = changes;
		if (change.rangeLength !== 0) {
			return null;
		}
		const [open] = Array.from(change.text);
		if (open === undefined) {
			return null;
		}
		const insertedSuffix = change.text.slice(open.length);
		const close = insertedSuffix || pairs[open];
		if (close === undefined) {
			return null;
		}
		return {
			currentStart: change.rangeOffset,
			cursor: change.rangeOffset + open.length,
			currentEnd: change.rangeOffset + change.text.length,
			open,
			close,
			syntheticClose: insertedSuffix.length > 0 ||
				!oldSource.startsWith(close, change.rangeOffset),
		};
	}
	if (changes.length !== 2 || changes.some((change) => change.rangeLength !== 0)) {
		return null;
	}
	const opening = changes.find((change) => pairs[change.text] !== undefined);
	const closing = opening === undefined
		? undefined
		: changes.find((change) => change !== opening && change.text === pairs[opening.text]);
	if (
		opening === undefined ||
		closing === undefined ||
		opening.rangeOffset !== closing.rangeOffset ||
		oldSource.slice(opening.rangeOffset, closing.rangeOffset).length !== 0
	) {
		return null;
	}
	return {
		currentStart: opening.rangeOffset,
		cursor: opening.rangeOffset + opening.text.length,
		currentEnd: opening.rangeOffset + opening.text.length + closing.text.length,
		open: opening.text,
		close: closing.text,
		syntheticClose: true,
	};
}

export function detectAutoSurround(
	changes: readonly vscode.TextDocumentContentChangeEvent[],
	oldSource: string,
): VisualTypingOperation | null {
	if (changes.length !== 2 || changes.some((change) => change.rangeLength !== 0)) {
		return null;
	}
	const [opening, closing] = [...changes].sort((left, right) => left.rangeOffset - right.rangeOffset);
	if (
		closing.rangeOffset <= opening.rangeOffset ||
		Array.from(opening.text).length !== 1 ||
		closing.text.length === 0 ||
		oldSource.slice(opening.rangeOffset, closing.rangeOffset).length === 0
	) {
		return null;
	}
	return {
		oldStart: opening.rangeOffset,
		oldEnd: closing.rangeOffset,
		currentStart: opening.rangeOffset,
		currentEnd: closing.rangeOffset + opening.text.length + closing.text.length,
		triggerKey: opening.text,
	};
}

export function detectVisualTyping(
	change: vscode.TextDocumentContentChangeEvent,
	oldSource: string,
): { trigger: string; replacementLength: number } | null {
	if (!change.text.includes("\n") && !change.text.includes("\r") && Array.from(change.text).length === 1) {
		return { trigger: change.text, replacementLength: change.text.length };
	}
	const selected = oldSource.slice(change.rangeOffset, change.rangeOffset + change.rangeLength);
	const selectedAt = change.text.indexOf(selected);
	if (selected && selectedAt > 0) {
		const trigger = change.text.slice(0, selectedAt);
		const suffix = change.text.slice(selectedAt + selected.length);
		if (Array.from(trigger).length === 1 && suffix.length > 0) {
			return { trigger, replacementLength: change.text.length };
		}
	}
	return null;
}

export function parseVisualSelection(source: string, start: number, end: number): VisualSelectionInfo {
	const original = source.slice(start, end);
	const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const lineEnd = source.indexOf("\n", start);
	const startLine = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
	const prefix = startLine.match(/^((?:> ?)*)([ \t]*)/) ?? ["", "", ""];
	const linePrefix = prefix[0];
	const calloutCount = prefix[1].split(">").length - 1;
	const indentation = prefix[2];
	let incompatible = false;
	let parsed = original.replace(/\n((?:> ?)*)([ \t]*)/g, (match, callouts: string, indent: string) => {
		if (incompatible || callouts.split(">").length - 1 !== calloutCount || indent.length < indentation.length) {
			incompatible = true;
			return match;
		}
		return "\n";
	});
	if (incompatible) {
		return { original, parsed: original, linePrefix: "", prefixWasSelected: false };
	}
	const prefixWasSelected = start === lineStart && linePrefix.length > 0;
	if (prefixWasSelected) {
		parsed = parsed.slice(linePrefix.length);
	}
	return { original, parsed, linePrefix, prefixWasSelected };
}

export function getLinePrefix(document: vscode.TextDocument, position: vscode.Position): string {
	return document.lineAt(position.line).text.match(/^((?:> ?)*)([ \t]*)/)?.[0] ?? "";
}

export function preserveLinePrefix(
	replacement: ResultInsert,
	prefix: string,
	prefixWasSelected: boolean,
	options: vscode.TextEditorOptions,
): ResultInsert {
	if (!prefix && !prefixWasSelected) {
		return replacement;
	}
	const tabSize = typeof options.tabSize === "number" ? options.tabSize : 4;
	const indentUnit = options.insertSpaces === false ? "\t" : " ".repeat(tabSize);
	const edits: Array<{ from: number; to: number; text: string }> = [];
	if (prefixWasSelected && prefix) {
		edits.push({ from: 0, to: 0, text: prefix });
	}
	for (const match of replacement.insert.matchAll(/\n(\t*)/g)) {
		const from = (match.index ?? 0) + 1;
		const tabs = match[1].length;
		edits.push({ from, to: from + tabs, text: prefix + indentUnit.repeat(tabs) });
	}
	if (edits.length === 0) {
		return replacement;
	}
	let insert = replacement.insert;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		insert = insert.slice(0, edit.from) + edit.text + insert.slice(edit.to);
	}
	const mapOffset = (offset: number): number => {
		let delta = 0;
		for (const edit of edits) {
			if (offset < edit.from) {
				break;
			}
			if (offset < edit.to) {
				return edit.from + delta + edit.text.length;
			}
			delta += edit.text.length - (edit.to - edit.from);
		}
		return offset + delta;
	};
	return {
		insert,
		tabstops: replacement.tabstops.map((tabstop) => ({
			...tabstop,
			from: mapOffset(tabstop.from),
			to: mapOffset(tabstop.to),
		})),
	};
}

export function setCursor(editor: vscode.TextEditor, offset: number): void {
	const position = editor.document.positionAt(offset);
	editor.selection = new vscode.Selection(position, position);
	editor.revealRange(new vscode.Range(position, position));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function errorDetail(error: unknown): string {
	return error instanceof Error ? error.stack ?? error.message : String(error);
}
