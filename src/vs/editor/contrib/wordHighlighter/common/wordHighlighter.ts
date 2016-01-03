/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {IOccurrencesSupport, IOccurence} from 'vs/editor/common/modes';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {Range} from 'vs/editor/common/core/range';
import {onUnexpectedError, illegalArgument} from 'vs/base/common/errors';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {sequence} from 'vs/base/common/async';
import {IModelService} from 'vs/editor/common/services/modelService';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export const OccurrencesRegistry = new LanguageFeatureRegistry<IOccurrencesSupport>('occurrencesSupport');

export function getOccurrencesAtPosition(model: EditorCommon.IModel, position: EditorCommon.IPosition):TPromise<IOccurence[]> {

	const resource = model.getAssociatedResource();
	const orderedByScore = OccurrencesRegistry.ordered(model);
	let foundResult = false;

	// in order of score ask the occurrences provider
	// until someone response with a good result
	// (good = none empty array)
	return sequence(orderedByScore.map(provider => {
		return () => {
			if (!foundResult) {
				return provider.findOccurrences(resource, position).then(data => {
					if (Array.isArray(data) && data.length > 0) {
						foundResult = true;
						return data;
					}
				}, err => {
					onUnexpectedError(err);
				});
			}
		}
	})).then(values => {
		return values[0]
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeDocumentHighlights', getOccurrencesAtPosition);

class WordHighlighter {

	private editor: EditorCommon.ICommonCodeEditor;
	private model: EditorCommon.IModel;
	private _lastWordRange: EditorCommon.IEditorRange;
	private _decorationIds: string[];
	private toUnhook: Function[];

	private workerRequestTokenId:number = 0;
	private workerRequest:TPromise<IOccurence[]> = null;
	private workerRequestCompleted:boolean = false;
	private workerRequestValue:IOccurence[] = [];

	private lastCursorPositionChangeTime:number = 0;
	private renderDecorationsTimer:number = -1;

	constructor(editor:EditorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.model = this.editor.getModel();
		this.toUnhook = [];
		this.toUnhook.push(editor.addListener(EditorCommon.EventType.CursorPositionChanged, (e:EditorCommon.ICursorPositionChangedEvent) => {
			this._onPositionChanged(e);
		}));
		this.toUnhook.push(editor.addListener(EditorCommon.EventType.ModelChanged, (e) => {
			this._stopAll();
			this.model = this.editor.getModel();
		}));
		this.toUnhook.push(editor.addListener('change', (e) => {
			this._stopAll();
		}));

		this._lastWordRange = null;
		this._decorationIds = [];
		this.workerRequestTokenId = 0;
		this.workerRequest = null;
		this.workerRequestCompleted = false;

		this.lastCursorPositionChangeTime = 0;
		this.renderDecorationsTimer = -1;
	}

	private _removeDecorations(): void {
		if (this._decorationIds.length > 0) {
			// remove decorations
			this._decorationIds = this.editor.deltaDecorations(this._decorationIds, []);
		}
	}

	private _stopAll(): void {
		this._lastWordRange = null;

		// Remove any existing decorations
		this._removeDecorations();

		// Cancel any renderDecorationsTimer
		if (this.renderDecorationsTimer !== -1) {
			window.clearTimeout(this.renderDecorationsTimer);
			this.renderDecorationsTimer = -1;
		}

		// Cancel any worker request
		if (this.workerRequest !== null) {
			this.workerRequest.cancel();
			this.workerRequest = null;
		}

		// Invalidate any worker request callback
		if (!this.workerRequestCompleted) {
			this.workerRequestTokenId++;
			this.workerRequestCompleted = true;
		}
	}

	private _onPositionChanged(e:EditorCommon.ICursorPositionChangedEvent): void {

		// ignore typing & other
		if (e.reason !== 'explicit') {
			this._stopAll();
			return;
		}

		// no providers for this model
		if(!OccurrencesRegistry.has(this.model)) {
			this._stopAll();
			return;
		}

		var editorSelection = this.editor.getSelection();

		// ignore multiline selection
		if (editorSelection.startLineNumber !== editorSelection.endLineNumber) {
			this._stopAll();
			return;
		}

		var lineNumber = editorSelection.startLineNumber;
		var startColumn = editorSelection.startColumn;
		var endColumn = editorSelection.endColumn;

		var word = this.model.getWordAtPosition({
			lineNumber: lineNumber,
			column: startColumn
		});

		// The selection must be inside a word or surround one word at most
		if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
			this._stopAll();
			return;
		}

		// All the effort below is trying to achieve this:
		// - when cursor is moved to a word, trigger immediately a findOccurences request
		// - 250ms later after the last cursor move event, render the occurences
		// - no flickering!

		var currentWordRange = new Range(lineNumber, word.startColumn, lineNumber, word.endColumn);

		var workerRequestIsValid = this._lastWordRange && this._lastWordRange.equalsRange(currentWordRange);

		// Even if we are on a different word, if that word is in the decorations ranges, the request is still valid
		// (Same symbol)
		for(var i = 0, len = this._decorationIds.length; !workerRequestIsValid && i < len; i++) {
			var range = this.model.getDecorationRange(this._decorationIds[i]);
			if(range && range.startLineNumber === lineNumber) {
				if(range.startColumn <= startColumn && range.endColumn >= endColumn) {
					workerRequestIsValid = true;
				}
			}
		}


		// There are 4 cases:
		// a) old workerRequest is valid & completed, renderDecorationsTimer fired
		// b) old workerRequest is valid & completed, renderDecorationsTimer not fired
		// c) old workerRequest is valid, but not completed
		// d) old workerRequest is not valid

		// For a) no action is needed
		// For c), member 'lastCursorPositionChangeTime' will be used when installing the timer so no action is needed

		this.lastCursorPositionChangeTime = (new Date()).getTime();

		if (workerRequestIsValid) {
			if (this.workerRequestCompleted && this.renderDecorationsTimer !== -1) {
				// case b)
				// Delay the firing of renderDecorationsTimer by an extra 250 ms
				window.clearTimeout(this.renderDecorationsTimer);
				this.renderDecorationsTimer = -1;
				this._beginRenderDecorations();
			}
		} else {
			// case d)
			// Stop all previous actions and start fresh
			this._stopAll();

			var myRequestId = ++this.workerRequestTokenId;
			this.workerRequestCompleted = false;

			this.workerRequest = getOccurrencesAtPosition(this.model, this.editor.getPosition());

			this.workerRequest.then(data => {
				if (myRequestId === this.workerRequestTokenId) {
					this.workerRequestCompleted = true;
					this.workerRequestValue = data || [];
					this._beginRenderDecorations();
				}
			}).done();
		}

		this._lastWordRange = currentWordRange;
	}

	private _beginRenderDecorations(): void {
		var currentTime = (new Date()).getTime();
		var minimumRenderTime = this.lastCursorPositionChangeTime + 250;

		if (currentTime >= minimumRenderTime) {
			// Synchronous
			this.renderDecorationsTimer = -1;
			this.renderDecorations();
		} else {
			// Asyncrhonous
			this.renderDecorationsTimer = window.setTimeout(() => {
				this.renderDecorations();
			}, (minimumRenderTime - currentTime));
		}
	}

	private renderDecorations(): void {
		this.renderDecorationsTimer = -1;
		var decorations:EditorCommon.IModelDeltaDecoration[] = [];
		for(var i = 0, len = this.workerRequestValue.length; i < len; i++) {
			var info = this.workerRequestValue[i];
			var className = 'wordHighlight';
			var color = '#A0A0A0';

			if (info.kind === 'write') {
				className = className + 'Strong';
			} else if (info.kind === 'text') {
				className = 'selectionHighlight'
				// Keep the same color for now
				//color = 'rgba(249, 206, 130, 0.7)';
			}
			decorations.push({
				range: info.range,
				options: {
					stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: className,
					overviewRuler: {
						color: color,
						darkColor: color,
						position: EditorCommon.OverviewRulerLane.Center
					}
				}
			});
		}

		this._decorationIds = this.editor.deltaDecorations(this._decorationIds, decorations);
	}

	public destroy(): void {
		this._stopAll();
		while(this.toUnhook.length > 0) {
			this.toUnhook.pop()();
		}
	}
}

class WordHighlighterContribution implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.wordHighlighter';

	private wordHighligher: WordHighlighter;

	constructor(editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		this.wordHighligher = new WordHighlighter(editor);
	}

	public getId(): string {
		return WordHighlighterContribution.ID;
	}

	public dispose(): void {
		this.wordHighligher.destroy();
	}
}

CommonEditorRegistry.registerEditorContribution(WordHighlighterContribution);

