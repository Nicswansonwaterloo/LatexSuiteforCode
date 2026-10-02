/*
 * A small, read-only compatibility surface for programmable snippets written
 * against CodeMirror 6. It intentionally implements only document and
 * selection queries; mutating EditorView APIs belong to the VS Code host.
 *
 * Semantics mirror @codemirror/state's Text and EditorSelection APIs:
 * document offsets count UTF-16 code units, line numbers are 1-based, slice
 * bounds are clipped, and invalid line/selection positions throw RangeError.
 */

export interface CodeMirrorLine {
	/** Zero-based document offset of the line start. */
	readonly from: number;
	/** Zero-based document offset immediately before the line break. */
	readonly to: number;
	/** One-based line number. */
	readonly number: number;
	/** Line contents without the line break. */
	readonly text: string;
	/** Line length without the line break. */
	readonly length: number;
}

export interface ReadOnlyCodeMirrorText {
	readonly length: number;
	/** The number of lines, which is always at least one. */
	readonly lines: number;
	toString(): string;
	sliceString(from: number, to?: number, lineSeparator?: string): string;
	lineAt(position: number): CodeMirrorLine;
	line(number: number): CodeMirrorLine;
}

export interface CodeMirrorSelectionRange {
	readonly from: number;
	readonly to: number;
	readonly anchor: number;
	readonly head: number;
	readonly empty: boolean;
}

export interface ReadOnlyCodeMirrorSelection {
	readonly main: CodeMirrorSelectionRange;
	readonly ranges: readonly CodeMirrorSelectionRange[];
	readonly mainIndex: number;
	asSingle(): ReadOnlyCodeMirrorSelection;
}

export interface ReadOnlyCodeMirrorState {
	readonly doc: ReadOnlyCodeMirrorText;
	readonly selection: ReadOnlyCodeMirrorSelection;
	sliceDoc(from?: number, to?: number): string;
}

/** Shape that may be spread into a host-specific snippet function adapter. */
export interface ReadOnlyEditorAdapter {
	readonly state: ReadOnlyCodeMirrorState;
}

class Line implements CodeMirrorLine {
	readonly length: number;

	constructor(
		readonly from: number,
		readonly to: number,
		readonly number: number,
		readonly text: string,
	) {
		this.length = to - from;
		Object.freeze(this);
	}
}

class TextDocument implements ReadOnlyCodeMirrorText {
	readonly length: number;
	readonly lines: number;
	private readonly value: string;
	private readonly lineDescriptions: readonly Line[];

	constructor(source: string) {
		// EditorState's default line separator accepts CRLF, CR, and LF, then
		// represents every document line break as one `\n` code unit.
		this.value = source.replace(/\r\n?|\n/g, "\n");
		this.length = this.value.length;

		const descriptions: Line[] = [];
		let from = 0;
		let number = 1;
		for (;;) {
			const breakAt = this.value.indexOf("\n", from);
			const to = breakAt < 0 ? this.value.length : breakAt;
			descriptions.push(
				new Line(from, to, number, this.value.slice(from, to)),
			);
			if (breakAt < 0) {
				break;
			}
			from = breakAt + 1;
			number += 1;
		}
		this.lineDescriptions = Object.freeze(descriptions);
		this.lines = descriptions.length;
	}

	toString(): string {
		return this.value;
	}

	sliceString(
		from: number,
		to: number = this.length,
		lineSeparator = "\n",
	): string {
		const clippedFrom = clipPosition(from, this.length);
		const clippedTo = Math.max(clippedFrom, clipPosition(to, this.length));
		const result = this.value.slice(clippedFrom, clippedTo);
		return lineSeparator === "\n"
			? result
			: result.replaceAll("\n", lineSeparator);
	}

	lineAt(position: number): CodeMirrorLine {
		if (!Number.isFinite(position) || position < 0 || position > this.length) {
			throw new RangeError(
				`Invalid position ${position} in document of length ${this.length}`,
			);
		}

		// A position on a line break belongs to the line before that break,
		// matching Text.lineAt. Find the first line whose `to` reaches it.
		let low = 0;
		let high = this.lineDescriptions.length - 1;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (this.lineDescriptions[middle].to >= position) {
				high = middle;
			} else {
				low = middle + 1;
			}
		}
		return this.lineDescriptions[low];
	}

	line(number: number): CodeMirrorLine {
		if (!Number.isFinite(number) || number < 1 || number > this.lines) {
			throw new RangeError(
				`Invalid line number ${number} in ${this.lines}-line document`,
			);
		}
		// @codemirror/state's lookup effectively rounds a fractional line number
		// upward. Callers normally pass integers, but preserving this is cheap.
		return this.lineDescriptions[Math.ceil(number) - 1];
	}
}

class SelectionRange implements CodeMirrorSelectionRange {
	readonly from: number;
	readonly to: number;
	readonly empty: boolean;

	constructor(
		readonly anchor: number,
		readonly head: number,
	) {
		this.from = Math.min(anchor, head);
		this.to = Math.max(anchor, head);
		this.empty = anchor === head;
		Object.freeze(this);
	}
}

class EditorSelection implements ReadOnlyCodeMirrorSelection {
	readonly ranges: readonly CodeMirrorSelectionRange[];
	readonly mainIndex = 0;

	constructor(readonly main: CodeMirrorSelectionRange) {
		this.ranges = Object.freeze([main]);
		Object.freeze(this);
	}

	asSingle(): ReadOnlyCodeMirrorSelection {
		return this;
	}
}

class EditorState implements ReadOnlyCodeMirrorState {
	constructor(
		readonly doc: ReadOnlyCodeMirrorText,
		readonly selection: ReadOnlyCodeMirrorSelection,
	) {
		Object.freeze(this);
	}

	sliceDoc(from = 0, to = this.doc.length): string {
		return this.doc.sliceString(from, to);
	}
}

/**
 * Build the CodeMirror-shaped state visible to an upstream replacement
 * function. `anchor` and `head` retain selection direction; `from`/`to` are
 * their ordered bounds. As in EditorState.create, selection positions beyond
 * the normalized document are rejected.
 */
export function createReadOnlyEditorState(
	source: string,
	anchor: number,
	head: number = anchor,
): ReadOnlyCodeMirrorState {
	const doc = new TextDocument(source);
	assertSelectionPosition(anchor, doc.length);
	assertSelectionPosition(head, doc.length);
	const selection = new EditorSelection(new SelectionRange(anchor, head));
	return new EditorState(doc, selection);
}

/** Build an object with a `state` property, matching an EditorView subset. */
export function createReadOnlyEditorAdapter(
	source: string,
	anchor: number,
	head: number = anchor,
): ReadOnlyEditorAdapter {
	return Object.freeze({ state: createReadOnlyEditorState(source, anchor, head) });
}

function clipPosition(position: number, length: number): number {
	return Math.max(0, Math.min(length, position));
}

function assertSelectionPosition(position: number, length: number): void {
	if (
		!Number.isFinite(position) ||
		!Number.isInteger(position) ||
		position < 0 ||
		position > length
	) {
		throw new RangeError("Selection points outside of document");
	}
}
