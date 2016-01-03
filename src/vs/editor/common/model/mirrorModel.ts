/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {PrefixSumComputer, IPrefixSumIndexOfResult} from 'vs/editor/common/viewModel/prefixSumComputer';
import {IMode} from 'vs/editor/common/modes';
import {TextModel} from 'vs/editor/common/model/textModel';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IResourceService} from 'vs/editor/common/services/resourceService';
import URI from 'vs/base/common/uri';
import {disposeAll} from 'vs/base/common/lifecycle';

export interface IMirrorModelEvents {
	contentChanged: EditorCommon.IModelContentChangedEvent[];
	propertiesChanged: EditorCommon.IModelPropertiesChangedEvent;
}

export class AbstractMirrorModel extends TextModelWithTokens implements EditorCommon.IMirrorModel {

	_lineStarts:PrefixSumComputer;
	_associatedResource:URI;
	_extraProperties:{[key:string]:any;};

	constructor(allowedEventTypes:string[], versionId:number, value:EditorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI, properties?:{[key:string]:any;}) {
		super(allowedEventTypes.concat([EditorCommon.EventType.ModelDispose]), value, false, mode);

		if(!properties) {
			properties = {};
		}

		this._setVersionId(versionId);
		this._associatedResource = associatedResource;
		this._extraProperties = properties;
	}

	public getModeId(): string {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getModeId: Model is disposed');
		}

		return this.getMode().getId();
	}

	public getEmbeddedAtPosition(position:EditorCommon.IPosition):EditorCommon.IMirrorModel {
		return null;
	}

	public getAllEmbedded():EditorCommon.IMirrorModel[] {
		return [];
	}

	public _constructLines(rawText:EditorCommon.IRawText):void {
		super._constructLines(rawText);
		// Force EOL to be \n
		this._EOL = '\n';
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this.emit(EditorCommon.EventType.ModelDispose);
		super.dispose();
	}

	public getAssociatedResource(): URI {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getAssociatedResource: Model is disposed');
		}

		return this._associatedResource;
	}

	public getProperty(name:string): any {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getProperty: Model is disposed');
		}

		return this._extraProperties.hasOwnProperty(name) ? this._extraProperties[name] : null;
	}

	private _ensurePrefixSum(): void {
		if(!this._lineStarts) {
			var lineStartValues:number[] = [],
				eolLength = this.getEOL().length;
			for (var i = 0, len = this._lines.length; i < len; i++) {
				lineStartValues.push(this._lines[i].text.length + eolLength);
			}
			this._lineStarts = new PrefixSumComputer(lineStartValues);
		}
	}

	public getRangeFromOffsetAndLength(offset:number, length:number):EditorCommon.IRange {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getRangeFromOffsetAndLength: Model is disposed');
		}

		var startPosition = this.getPositionFromOffset(offset),
			endPosition = this.getPositionFromOffset(offset + length);
		return {
			startLineNumber: startPosition.lineNumber,
			startColumn: startPosition.column,
			endLineNumber: endPosition.lineNumber,
			endColumn: endPosition.column
		};
	}

	public getOffsetAndLengthFromRange(range:EditorCommon.IRange):{offset:number; length:number;} {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getOffsetAndLengthFromRange: Model is disposed');
		}

		var startOffset = this.getOffsetFromPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
			endOffset = this.getOffsetFromPosition({ lineNumber: range.endLineNumber, column: range.endColumn });
		return {
			offset: startOffset,
			length: endOffset - startOffset
		};
	}

	public getPositionFromOffset(offset:number):EditorCommon.IPosition {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getPositionFromOffset: Model is disposed');
		}

		this._ensurePrefixSum();
		var r:IPrefixSumIndexOfResult = {
			index: 0,
			remainder: 0
		};
		this._lineStarts.getIndexOf(offset, r);
		return {
			lineNumber: r.index + 1,
			column: this.getEOL().length + r.remainder
		};
	}

	public getOffsetFromPosition(position:EditorCommon.IPosition): number {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getOffsetFromPosition: Model is disposed');
		}

		return this.getLineStart(position.lineNumber) + position.column - 1 /* column isn't zero-index based */;
	}

	public getLineStart(lineNumber:number): number {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getLineStart: Model is disposed');
		}

		this._ensurePrefixSum();

		var lineIndex = Math.min(lineNumber, this._lines.length) - 1;
		return this._lineStarts.getAccumulatedValue(lineIndex - 1);
	}

	public getAllWordsWithRange(): EditorCommon.IRangeWithText[] {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getAllWordsWithRange: Model is disposed');
		}
		if (this._lines.length > 10000) {
			// This is a very heavy method, unavailable for very heavy models
			return [];
		}

		var result:EditorCommon.IRangeWithText[] = [],
			i:number;

		var toTextRange = function (info: EditorCommon.IWordRange) {
			var s = line.text.substring(info.start, info.end);
			var r = { startLineNumber: i + 1, startColumn: info.start + 1, endLineNumber: i + 1, endColumn: info.end + 1 };
			result.push({ text: s, range: r});
		};

		for(i = 0; i < this._lines.length; i++) {
			var line = this._lines[i];
			this.wordenize(line.text).forEach(toTextRange);
		}

		return result;
	}

	public getAllWords(): string[] {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getAllWords: Model is disposed');
		}

		var result:string[] = [];
		this._lines.forEach((line) => {
			this.wordenize(line.text).forEach((info) => {
				result.push(line.text.substring(info.start, info.end));
			});
		});
		return result;
	}

	public getAllUniqueWords(skipWordOnce?:string) : string[] {
		if (this._isDisposed) {
			throw new Error('AbstractMirrorModel.getAllUniqueWords: Model is disposed');
		}

		var foundSkipWord = false;
		var uniqueWords = {};
		return this.getAllWords().filter((word) => {
			if (skipWordOnce && !foundSkipWord && skipWordOnce === word) {
				foundSkipWord = true;
				return false;
			} else if (uniqueWords[word]) {
				return false;
			} else {
				uniqueWords[word] = true;
				return true;
			}
		});
	}

//	// TODO@Joh, TODO@Alex - remove these and make sure the super-things work
	private wordenize(content:string): EditorCommon.IWordRange[] {
		var result:EditorCommon.IWordRange[] = [];
		var match:RegExpExecArray;
		var wordsRegexp = this._getWordDefinition();
		while (match = wordsRegexp.exec(content)) {
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}

	private getWord(content:string, position:number, callback:(text:string, start:number, end:number)=>any): any {
		var words = this.wordenize(content);
		for (var i = 0; i < words.length && position >= words[i].start; i++) {
			var word= words[i];
			if (position <= word.end) {
				return callback(content, word.start, word.end);
			}
		}
		return callback(content, -1, -1);
	}

}

export class MirrorModelEmbedded extends AbstractMirrorModel implements EditorCommon.IMirrorModel {

	private _actualModel:MirrorModel;

	constructor(actualModel:MirrorModel, includeRanges:EditorCommon.IRange[], mode:IMode, url:URI) {
		super(['changed'], actualModel.getVersionId(), MirrorModelEmbedded._getMirrorValueWithinRanges(actualModel, includeRanges), mode, url);
		this._actualModel = actualModel;
	}

	private static _getMirrorValueWithinRanges(actualModel:MirrorModel, includeRanges:EditorCommon.IRange[]): EditorCommon.IRawText {

		var	resultingText = '',
			prevLineAdded = 1,
			prevColumnAdded = 1,
			i:number;

		for (i = 0; i < includeRanges.length; i++) {
			var includeRange = includeRanges[i];

			resultingText += actualModel.getEmptiedValueInRange({
				startLineNumber: prevLineAdded,
				startColumn: prevColumnAdded,
				endLineNumber: includeRange.startLineNumber,
				endColumn: includeRange.startColumn
			}, ' ');

			resultingText += actualModel.getValueInRange(includeRange);

			prevLineAdded = includeRange.endLineNumber;
			prevColumnAdded = includeRange.endColumn;
		}

		var lastLineNumber = actualModel.getLineCount(),
			lastColumn = actualModel.getLineMaxColumn(lastLineNumber);

		resultingText += actualModel.getEmptiedValueInRange({
			startLineNumber: prevLineAdded,
			startColumn: prevColumnAdded,
			endLineNumber: lastLineNumber,
			endColumn: lastColumn
		}, ' ');

		return TextModel.toRawText(resultingText);
	}

	public setIncludedRanges(newIncludedRanges:EditorCommon.IRange[]): void {
		var prevVersionId = this.getVersionId();

		// Force recreating of line starts (when used)
		this._lineStarts = null;
		this._constructLines(MirrorModelEmbedded._getMirrorValueWithinRanges(this._actualModel, newIncludedRanges));
		this._resetTokenizationState();

		this._setVersionId(prevVersionId + 1);

		this.emit('changed', {});
	}

}

class EmbeddedModeRange {
	public mode: IMode;
	public ranges: EditorCommon.IRange[];

	public constructor(mode: IMode) {
		this.mode = mode;
		this.ranges = [];
	}
}

export function createMirrorModelFromString(resourceService:IResourceService, versionId:number, value:string, mode:IMode, associatedResource?:URI, properties?:{[key:string]:any;}): MirrorModel {
	return new MirrorModel(resourceService, versionId, TextModel.toRawText(value), mode, associatedResource, properties);
}

export class MirrorModel extends AbstractMirrorModel implements EditorCommon.IMirrorModel {

	private _resourceService: IResourceService;
	private _embeddedModels: {[modeId:string]:MirrorModelEmbedded;};

	constructor(resourceService:IResourceService, versionId:number, value:EditorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI, properties?:{[key:string]:any;}) {
		super(['changed'], versionId, value, mode, associatedResource, properties);

		this._resourceService = resourceService;
		this._embeddedModels = {};
		this._updateEmbeddedModels();
	}

	public getEmbeddedAtPosition(position:EditorCommon.IPosition):EditorCommon.IMirrorModel {
		if (this._isDisposed) {
			throw new Error('MirrorModel.getEmbeddedAtPosition: Model is disposed');
		}

		var modeAtPosition = this.getModeAtPosition(position.lineNumber, position.column);
		if (this._embeddedModels.hasOwnProperty(modeAtPosition.getId())) {
			return this._embeddedModels[modeAtPosition.getId()];
		}
		return null;
	}

	public getAllEmbedded():EditorCommon.IMirrorModel[] {
		if (this._isDisposed) {
			throw new Error('MirrorModel.getAllEmbedded: Model is disposed');
		}

		return Object.keys(this._embeddedModels).map((embeddedModeId) => this._embeddedModels[embeddedModeId]);
	}

	public dispose(): void {
		super.dispose();
		var embeddedModels = Object.keys(this._embeddedModels).map((modeId) => this._embeddedModels[modeId]);
		embeddedModels.forEach((embeddedModel) => this._resourceService.remove(embeddedModel.getAssociatedResource()));
		disposeAll(embeddedModels);
		this._embeddedModels = {};
	}

	public setMode(newMode:IMode): void;
	public setMode(newModePromise:TPromise<IMode>): void;
	public setMode(newModeOrPromise:any): void {
		super.setMode(newModeOrPromise);
		this._updateEmbeddedModels();
	}

	private static _getModesRanges(model: EditorCommon.IMirrorModel): {[modeId:string]:EmbeddedModeRange} {
		var encounteredModesRanges:{[modeId:string]:EmbeddedModeRange} = {};

		var getOrCreateEmbeddedModeRange = (modeId:string, mode:IMode) => {
			if (!encounteredModesRanges.hasOwnProperty(modeId)) {
				encounteredModesRanges[modeId] = new EmbeddedModeRange(mode);
			}
			return encounteredModesRanges[modeId];
		};

		var lineCount = model.getLineCount();
		var currentModeId = model.getMode().getId();
		var currentMode = model.getMode();
		var currentStartLineNumber = 1, currentStartColumn = 1;

		for (var lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			var modeTransitions = model._getLineModeTransitions(lineNumber);

			for (var i = 0; i < modeTransitions.length; i++) {
				var modeTransition = modeTransitions[i];
				if (modeTransition.mode.getId() !== currentModeId) {

					var modeRange = getOrCreateEmbeddedModeRange(currentModeId, currentMode);
					modeRange.ranges.push({
						startLineNumber: currentStartLineNumber,
						startColumn: currentStartColumn,
						endLineNumber: lineNumber,
						endColumn: modeTransition.startIndex + 1
					});

					currentModeId = modeTransition.mode.getId();
					currentMode = modeTransition.mode;
					currentStartLineNumber = lineNumber;
					currentStartColumn = modeTransition.startIndex + 1;
				}
			}
		}

		var lastLineNumber = lineCount;
		var lastColumn = model.getLineMaxColumn(lastLineNumber);

		if (currentStartLineNumber !== lastLineNumber || currentStartColumn !== lastColumn) {
			var modeRange = getOrCreateEmbeddedModeRange(currentModeId, currentMode);
			modeRange.ranges.push({
				startLineNumber: currentStartLineNumber,
				startColumn: currentStartColumn,
				endLineNumber: lastLineNumber,
				endColumn: lastColumn
			});
		}

		return encounteredModesRanges;
	}

	private _updateEmbeddedModels(): boolean {
		if (!this._resourceService || !this.getMode().tokenizationSupport || !this.getMode().tokenizationSupport.shouldGenerateEmbeddedModels) {
			return false;
		}

		var newModesRanges = MirrorModel._getModesRanges(this);

		// Empty out embedded models that have disappeared
		var oldNestedModesIds = Object.keys(this._embeddedModels);
		for (var i = 0; i < oldNestedModesIds.length; i++) {
			var oldNestedModeId = oldNestedModesIds[i];
			if (!newModesRanges.hasOwnProperty(oldNestedModeId)) {
				this._embeddedModels[oldNestedModeId].setIncludedRanges([{
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 1
				}]);
			}
		}

		var newNestedModesIds = Object.keys(newModesRanges);
		for (var i = 0; i < newNestedModesIds.length; i++) {
			var newNestedModeId = newNestedModesIds[i];
			if (this._embeddedModels.hasOwnProperty(newNestedModeId)) {
				this._embeddedModels[newNestedModeId].setIncludedRanges(newModesRanges[newNestedModeId].ranges);
			} else {
				// TODO@Alex: implement derived resources (embedded mirror models) better
				var embeddedModelUrl = this.getAssociatedResource().withFragment(this.getAssociatedResource().fragment + 'URL_MARSHAL_REMOVE' + newNestedModeId);
				this._embeddedModels[newNestedModeId] = new MirrorModelEmbedded(this, newModesRanges[newNestedModeId].ranges, newModesRanges[newNestedModeId].mode, embeddedModelUrl);
				this._resourceService.insert(this._embeddedModels[newNestedModeId].getAssociatedResource(), this._embeddedModels[newNestedModeId]);
			}
		}

		return false;
	}

	public onEvents(events:IMirrorModelEvents) : boolean {
		if (this._isDisposed) {
			throw new Error('MirrorModel.onEvents: Model is disposed');
		}

		if (events.propertiesChanged) {
			this._extraProperties = events.propertiesChanged.properties;
		}

		let changed = false;
		for (let i = 0, len = events.contentChanged.length; i < len; i++) {
			let contentChangedEvent = events.contentChanged[i];

			// Force recreating of line starts
			this._lineStarts = null;

			this._setVersionId(contentChangedEvent.versionId);
			switch (contentChangedEvent.changeType) {
				case EditorCommon.EventType.ModelContentChangedFlush:
					this._onLinesFlushed(<EditorCommon.IModelContentChangedFlushEvent>contentChangedEvent);
					changed = true;
					break;

				case EditorCommon.EventType.ModelContentChangedLinesDeleted:
					this._onLinesDeleted(<EditorCommon.IModelContentChangedLinesDeletedEvent>contentChangedEvent);
					changed = true;
					break;

				case EditorCommon.EventType.ModelContentChangedLinesInserted:
					this._onLinesInserted(<EditorCommon.IModelContentChangedLinesInsertedEvent>contentChangedEvent);
					changed = true;
					break;

				case EditorCommon.EventType.ModelContentChangedLineChanged:
					this._onLineChanged(<EditorCommon.IModelContentChangedLineChangedEvent>contentChangedEvent);
					changed = true;
					break;
			}
		}

		var shouldFlushMarkers = false;
		if (changed) {
			this.emit('changed', {});
			shouldFlushMarkers = this._updateEmbeddedModels();
		}
		return shouldFlushMarkers;
	}

	private _onLinesFlushed(e:EditorCommon.IModelContentChangedFlushEvent): void {
		// Flush my lines
		this._constructLines(e.detail);
		this._resetTokenizationState();
	}

	private _onLineChanged(e:EditorCommon.IModelContentChangedLineChangedEvent) : void {
		this._lines[e.lineNumber - 1].applyEdits({}, [{
			startColumn: 1,
			endColumn: Number.MAX_VALUE,
			text: e.detail,
			forceMoveMarkers: false
		}]);

		this._invalidateLine(e.lineNumber - 1);
	}

	private _onLinesDeleted(e:EditorCommon.IModelContentChangedLinesDeletedEvent) : void {
		var fromLineIndex = e.fromLineNumber - 1,
			toLineIndex = e.toLineNumber - 1;

		// Save first line's state
		var firstLineState = this._lines[fromLineIndex].getState();

		this._lines.splice(fromLineIndex, toLineIndex - fromLineIndex + 1);

		if (fromLineIndex < this._lines.length) {
			// This check is always true in real world, but the tests forced this

			// Restore first line's state
			this._lines[fromLineIndex].setState(firstLineState);

			// Invalidate line
			this._invalidateLine(fromLineIndex);
		}
	}

	private _onLinesInserted(e:EditorCommon.IModelContentChangedLinesInsertedEvent) : void {
		var lineIndex:number,
			i:number,
			eolLength = this.getEOL().length,
			splitLines = e.detail.split('\n');

		for (lineIndex = e.fromLineNumber - 1, i = 0; lineIndex < e.toLineNumber; lineIndex++, i++) {
			this._lines.splice(lineIndex, 0, new ModelLine(0, splitLines[i]));
		}

		if (e.fromLineNumber >= 2) {
			// This check is always true in real world, but the tests forced this
			this._invalidateLine(e.fromLineNumber - 2);
		}
	}
}
