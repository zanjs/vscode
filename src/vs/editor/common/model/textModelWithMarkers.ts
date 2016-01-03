/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IMode} from 'vs/editor/common/modes';
import {Position} from 'vs/editor/common/core/position';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {ModelLine, ILineMarker} from 'vs/editor/common/model/modelLine';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IdGenerator} from 'vs/editor/common/core/idGenerator';

export interface IMarkerIdToMarkerMap {
	[key:string]:ILineMarker;
}

export interface INewMarker {
	lineNumber:number;
	column:number;
	stickToPreviousCharacter:boolean;
}

export class LineMarker implements ILineMarker {

	id:string;
	column:number;
	stickToPreviousCharacter:boolean;
	oldLineNumber:number;
	oldColumn:number;
	line:ModelLine;

	constructor(id:string, column:number, stickToPreviousCharacter:boolean) {
		this.id = id;
		this.column = column;
		this.stickToPreviousCharacter = stickToPreviousCharacter;
		this.oldLineNumber = 0;
		this.oldColumn = 0;
		this.line = null;
	}

	public toString(): string {
		return '{\'' + this.id + '\';' + this.column + ',' + this.stickToPreviousCharacter + ',[' + this.oldLineNumber + ',' + this.oldColumn + ']}';
	}
}

var _INSTANCE_COUNT = 0;

export class TextModelWithMarkers extends TextModelWithTokens implements EditorCommon.ITextModelWithMarkers {

	private _markerIdGenerator: IdGenerator;
	protected _markerIdToMarker: IMarkerIdToMarkerMap;
	constructor(allowedEventTypes:string[], rawText:EditorCommon.IRawText, modeOrPromise:IMode|TPromise<IMode>) {
		super(allowedEventTypes, rawText, true, modeOrPromise);
		this._markerIdGenerator = new IdGenerator((++_INSTANCE_COUNT) + ';');
		this._markerIdToMarker = {};
	}

	public dispose(): void {
		this._markerIdToMarker = null;
		super.dispose();
	}

	_resetValue(e:EditorCommon.IModelContentChangedFlushEvent, newValue:string): void {
		super._resetValue(e, newValue);

		// Destroy all my markers
		this._markerIdToMarker = {};
	}

	_addMarker(lineNumber:number, column:number, stickToPreviousCharacter:boolean): string {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._addMarker: Model is disposed');
		}

		var pos = this.validatePosition(new Position(lineNumber, column));

		var marker = new LineMarker(this._markerIdGenerator.generate(), pos.column, stickToPreviousCharacter);
		this._markerIdToMarker[marker.id] = marker;

		this._lines[pos.lineNumber - 1].addMarker(marker);

		return marker.id;
	}

	protected _addMarkers(newMarkers:INewMarker[]): string[] {
		let addMarkersPerLine: {
			[lineNumber:number]: LineMarker[];
		} = Object.create(null);

		let result:string[] = [];
		for (let i = 0, len = newMarkers.length; i < len; i++) {
			let newMarker = newMarkers[i];

			let marker = new LineMarker(this._markerIdGenerator.generate(), newMarker.column, newMarker.stickToPreviousCharacter);
			this._markerIdToMarker[marker.id] = marker;

			if (!addMarkersPerLine[newMarker.lineNumber]) {
				addMarkersPerLine[newMarker.lineNumber] = [];
			}
			addMarkersPerLine[newMarker.lineNumber].push(marker);

			result.push(marker.id);
		}

		let lineNumbers = Object.keys(addMarkersPerLine);
		for (let i = 0, len = lineNumbers.length; i < len; i++) {
			let lineNumber = parseInt(lineNumbers[i], 10);
			this._lines[lineNumber - 1].addMarkers(addMarkersPerLine[lineNumbers[i]]);
		}

		return result;
	}

	_changeMarker(id:string, lineNumber:number, column:number): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._changeMarker: Model is disposed');
		}

		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			var newPos = this.validatePosition(new Position(lineNumber, column));

			if (newPos.lineNumber !== marker.line.lineNumber) {
				// Move marker between lines
				marker.line.removeMarker(marker);
				this._lines[newPos.lineNumber - 1].addMarker(marker);
			}

			// Update marker column
			marker.column = newPos.column;
		}
	}

	_changeMarkerStickiness(id:string, newStickToPreviousCharacter:boolean): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._changeMarkerStickiness: Model is disposed');
		}

		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];

			if (marker.stickToPreviousCharacter !== newStickToPreviousCharacter) {
				marker.stickToPreviousCharacter = newStickToPreviousCharacter;
			}
		}
	}

	_getMarker(id:string): EditorCommon.IEditorPosition {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._getMarker: Model is disposed');
		}

		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			return new Position(marker.line.lineNumber, marker.column);
		}
		return null;
	}

	_getMarkersCount(): number {
		return Object.keys(this._markerIdToMarker).length;
	}

	_getLineMarkers(lineNumber: number): EditorCommon.IReadOnlyLineMarker[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._getLineMarkers: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._lines[lineNumber - 1].getMarkers();
	}

	_removeMarker(id:string): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._removeMarker: Model is disposed');
		}

		if (this._markerIdToMarker.hasOwnProperty(id)) {
			var marker = this._markerIdToMarker[id];
			marker.line.removeMarker(marker);
			delete this._markerIdToMarker[id];
		}
	}

	protected _removeMarkers(ids:string[]): void {
		let removeMarkersPerLine: {
			[lineNumber:number]: {
				[markerId:string]: boolean;
			};
		} = Object.create(null);

		for (let i = 0, len = ids.length; i < len; i++) {
			let id = ids[i];

			if (!this._markerIdToMarker.hasOwnProperty(id)) {
				continue;
			}

			let marker = this._markerIdToMarker[id];

			let lineNumber = marker.line.lineNumber;
			if (!removeMarkersPerLine[lineNumber]) {
				removeMarkersPerLine[lineNumber] = Object.create(null);
			}
			removeMarkersPerLine[lineNumber][id] = true;

			delete this._markerIdToMarker[id];
		}

		let lineNumbers = Object.keys(removeMarkersPerLine);
		for (let i = 0, len = lineNumbers.length; i < len; i++) {
			let lineNumber = parseInt(lineNumbers[i], 10);
			this._lines[lineNumber - 1].removeMarkers(removeMarkersPerLine[lineNumbers[i]]);
		}
	}

	_getMarkersInMap(markersMap:{[markerId:string]:boolean;}): ILineMarker[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithMarkers._getMarkersInMap: Model is disposed');
		}

		var result: ILineMarker[] = [],
			markerId: string;

		for (markerId in markersMap)	{
			if (markersMap.hasOwnProperty(markerId) && this._markerIdToMarker.hasOwnProperty(markerId)) {
				result.push(this._markerIdToMarker[markerId]);
			}
		}

		return result;
	}
}