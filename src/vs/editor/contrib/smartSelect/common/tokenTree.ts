/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';

export class Node {

	start: EditorCommon.IPosition;

	end: EditorCommon.IPosition;

	get range(): EditorCommon.IRange {
		return {
			startLineNumber: this.start.lineNumber,
			startColumn: this.start.column,
			endLineNumber: this.end.lineNumber,
			endColumn: this.end.column
		};
	}

	parent: Node;
}

export class NodeList extends Node {

	children: Node[];

	get start(): EditorCommon.IPosition {
		return this.hasChildren
			? this.children[0].start
			: this.parent.start;
	}

	get end(): EditorCommon.IPosition {
		return this.hasChildren
			? this.children[this.children.length - 1].end
			: this.parent.end;
	}

	get hasChildren() {
		return this.children && this.children.length > 0;
	}

	public append(node: Node): boolean {
		if (!node) {
			return false;
		}
		node.parent = this;
		if (!this.children) {
			this.children = [];
		}
		if (node instanceof NodeList) {
			if (node.children) {
				this.children.push.apply(this.children, node.children);
			}
		} else {
			this.children.push(node);
		}
		return true;
	}
}

export class Block extends Node {

	open: Node;
	close: Node;
	elements: NodeList;

	get start(): EditorCommon.IPosition {
		return this.open.start;
	}

	get end(): EditorCommon.IPosition {
		return this.close.end;
	}

	constructor() {
		super();
		this.elements = new NodeList();
		this.elements.parent = this;
	}
}

interface Token {
	range: EditorCommon.IRange;
	bracket: Modes.Bracket;
	type: string;
	__debugContent?: string;
}

function newNode(token: Token): Node {
	var node = new Node();
	node.start = Position.startPosition(token.range);
	node.end = Position.endPosition(token.range);
	return node;
}

class TokenScanner {

	private _model: EditorCommon.IModel;
	private _versionId: number;
	private _currentLineNumber: number;
	private _currentTokenIndex: number;
	private _currentLineTokens: EditorCommon.ILineTokens;

	constructor(model: EditorCommon.IModel) {
		this._model = model;
		this._versionId = model.getVersionId();
		this._currentLineNumber = 1;
	}

	next(): Token {
		if (this._versionId !== this._model.getVersionId()) {
			// model has been modified
			return null;
		}
		if (this._currentLineNumber >= this._model.getLineCount() + 1) {
			// all line visisted
			return null;
		}
		if (!this._currentLineTokens) {
			// no tokens for this line
			this._currentLineTokens = this._model.getLineTokens(this._currentLineNumber);
			this._currentTokenIndex = 0;
		}
		if (this._currentTokenIndex >= this._currentLineTokens.getTokenCount()) {
			// last token of line visited
			this._currentLineNumber += 1;
			this._currentLineTokens = null;
			return this.next();
		}
		var token: Token = {
			type: this._currentLineTokens.getTokenType(this._currentTokenIndex),
			bracket: this._currentLineTokens.getTokenBracket(this._currentTokenIndex),
			range: {
				startLineNumber: this._currentLineNumber,
				startColumn: 1 + this._currentLineTokens.getTokenStartIndex(this._currentTokenIndex),
				endLineNumber: this._currentLineNumber,
				endColumn: 1 + this._currentLineTokens.getTokenEndIndex(this._currentTokenIndex, this._model.getLineMaxColumn(this._currentLineNumber))
			}
		};
		//		token.__debugContent = this._model.getValueInRange(token.range);
		this._currentTokenIndex += 1;
		return token;
	}
}

class TokenTreeBuilder {

	private _scanner: TokenScanner;
	private _stack: Token[] = [];
	private _currentToken: Token;

	constructor(model: EditorCommon.IModel) {
		this._scanner = new TokenScanner(model);
	}

	public build(): Node {
		var node = new NodeList();
		while (node.append(this._line() || this._any())) {
			// accept all
		}
		return node;
	}

	private _accept(condt: (info: Token) => boolean): boolean {
		var token = this._stack.pop() || this._scanner.next();
		if (!token) {
			return false;
		}
		var accepted = condt(token);
		if (!accepted) {
			this._stack.push(token);
			this._currentToken = null;
		} else {
			this._currentToken = token;
			//			console.log('accepted: ' + token.__debugContent);
		}
		return accepted;
	}

	private _peek(condt: (info: Token) => boolean): boolean {
		var ret = false;
		this._accept(info => {
			ret = condt(info);
			return false;
		});
		return ret;
	}

	private _line(): Node {
		var node = new NodeList(),
			lineNumber: number;

		// capture current linenumber
		this._peek(info => {
			lineNumber = info.range.startLineNumber;
			return false;
		});

		while (this._peek(info => info.range.startLineNumber === lineNumber)
			&& node.append(this._token() || this._block())) {

			// all children that started on this line
		}

		if (!node.children || node.children.length === 0) {
			return null;
		} else if (node.children.length === 1) {
			return node.children[0];
		} else {
			return node;
		}
	}

	private _token(): Node {
		if (!this._accept(token => token.bracket === Modes.Bracket.None)) {
			return null;
		}
		return newNode(this._currentToken);
	}

	private _block(): Node {

		var bracketType: string,
			accepted: boolean;

		accepted = this._accept(token => {
			bracketType = token.type;
			return token.bracket === Modes.Bracket.Open;
		});
		if (!accepted) {
			return null;
		}

		var bracket = new Block();
		bracket.open = newNode(this._currentToken);
		while (bracket.elements.append(this._line())) {
			// inside brackets
		}

		if (!this._accept(token => token.bracket === Modes.Bracket.Close && token.type === bracketType)) {
			// missing closing bracket -> return just a node list
			var nodelist = new NodeList();
			nodelist.append(bracket.open);
			nodelist.append(bracket.elements);
			return nodelist;
		}

		bracket.close = newNode(this._currentToken);
		return bracket;
	}

	private _any(): Node {
		if (!this._accept(_ => true)) {
			return null;
		}
		return newNode(this._currentToken);
	}
}

/**
 * Parses this grammar:
 *	grammer = { line }
 *	line = { block | "token" }
 *	block = "open_bracket" { line } "close_bracket"
 */
export function build(model: EditorCommon.IModel): Node {
	var node = new TokenTreeBuilder(model).build();
	return node;
}

export function find(node: Node, position: EditorCommon.IPosition): Node {

	if (!Range.containsPosition(node.range, position)) {
		return null;
	}

	var result: Node;

	if (node instanceof NodeList) {
		for (var i = 0, len = node.children.length; i < len && !result; i++) {
			result = find(node.children[i], position);
		}

	} else if (node instanceof Block) {
		result = find(node.open, position) || find(node.elements, position) || find(node.close, position);
	}

	return result || node;
}