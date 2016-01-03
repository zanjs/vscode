/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Arrays} from 'vs/editor/common/core/arrays';

export class FilteredLineTokens implements EditorCommon.IViewLineTokens {

	private inflatedTokens: EditorCommon.ILineToken[];

	private _original:EditorCommon.ILineTokens;
	private _startOffset:number;
	private _endOffset:number;
	private _deltaStartIndex:number;

	/**
	 * [startOffset; endOffset) (i.e. do not include endOffset)
	 */
	constructor(original:EditorCommon.ILineTokens, startOffset:number, endOffset:number, deltaStartIndex:number) {
		this._original = original;
		this._startOffset = startOffset;
		this._endOffset = endOffset;
		this._deltaStartIndex = deltaStartIndex;

		this.inflatedTokens = EditorCommon.LineTokensBinaryEncoding.sliceAndInflate(original.getBinaryEncodedTokensMap(), original.getBinaryEncodedTokens(), startOffset, endOffset, deltaStartIndex);
	}

	public getTokens(): EditorCommon.ILineToken[]{
		return this.inflatedTokens;
	}

	public getFauxIndentLength(): number {
		return this._deltaStartIndex;
	}

	public getTextLength(): number {
		return this._endOffset - this._startOffset + this._deltaStartIndex;
	}

	public equals(other:EditorCommon.IViewLineTokens): boolean {
		if (other instanceof FilteredLineTokens) {
			var otherFilteredLineTokens = <FilteredLineTokens>other;
			if (this._startOffset !== otherFilteredLineTokens._startOffset) {
				return false;
			}
			if (this._endOffset !== otherFilteredLineTokens._endOffset) {
				return false;
			}
			if (this._deltaStartIndex !== otherFilteredLineTokens._deltaStartIndex) {
				return false;
			}
			return this._original.equals(otherFilteredLineTokens._original);
		}
		return false;
	}

	public findIndexOfOffset(offset: number): number {
		return Arrays.findIndexInSegmentsArray(this.inflatedTokens, offset);
	}
}

export class IdentityFilteredLineTokens implements EditorCommon.IViewLineTokens {

	private _original: EditorCommon.ILineTokens;
	private _textLength: number;

	constructor(original:EditorCommon.ILineTokens, textLength:number) {
		this._original = original;
		this._textLength = textLength;
	}

	public getTokens(): EditorCommon.ILineToken[] {
		return EditorCommon.LineTokensBinaryEncoding.inflateArr(this._original.getBinaryEncodedTokensMap(), this._original.getBinaryEncodedTokens());
	}

	public getFauxIndentLength(): number {
		return 0;
	}

	public getTextLength(): number {
		return this._textLength;
	}

	public equals(other:EditorCommon.IViewLineTokens): boolean{
		if (other instanceof IdentityFilteredLineTokens) {
			var otherFilteredLineTokens = <IdentityFilteredLineTokens>other;
			return this._original.equals(otherFilteredLineTokens._original);
		}
		return false;
	}

	public findIndexOfOffset(offset:number): number {
		return this._original.findIndexOfOffset(offset);
	}
}