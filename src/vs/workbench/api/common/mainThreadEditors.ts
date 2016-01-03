/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Event, {Emitter} from 'vs/base/common/event';
import {IEditor} from 'vs/platform/editor/common/editor';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {RunOnceScheduler} from 'vs/base/common/async';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';

export interface ITextEditorConfigurationUpdate {
	tabSize?: number;
	insertSpaces?: boolean;
}
export interface ITextEditorConfiguration {
	tabSize: number;
	insertSpaces: boolean;
}

function configurationsEqual(a:ITextEditorConfiguration, b:ITextEditorConfiguration) {
	if (a && !b || !a && b) {
		return false;
	}
	if (!a && !b) {
		return true;
	}
	return (
		a.tabSize === b.tabSize
		&& a.insertSpaces === b.insertSpaces
	);
}

export interface IFocusTracker {
	onGainedFocus(): void;
	onLostFocus(): void;
}

export enum TextEditorRevealType {
	Default,
	InCenter,
	InCenterIfOutsideViewport
}

/**
 * Text Editor that is permanently bound to the same model.
 * It can be bound or not to a CodeEditor.
 */
export class MainThreadTextEditor {

	private _id: string;
	private _model: EditorCommon.IModel;
	private _codeEditor: EditorCommon.ICommonCodeEditor;
	private _focusTracker: IFocusTracker;
	private _codeEditorListeners: IDisposable[];

	private _lastSelection: EditorCommon.IEditorSelection[];
	private _lastConfiguration: ITextEditorConfiguration;

	private _onSelectionChanged: Emitter<EditorCommon.IEditorSelection[]>;
	private _onConfigurationChanged: Emitter<ITextEditorConfiguration>;

	constructor(id: string, model:EditorCommon.IModel, codeEditor:EditorCommon.ICommonCodeEditor, focusTracker:IFocusTracker) {
		this._id = id;
		this._model = model;
		this._codeEditor = null;
		this._focusTracker = focusTracker;
		this._codeEditorListeners = [];

		this._onSelectionChanged = new Emitter<EditorCommon.IEditorSelection[]>();
		this._onConfigurationChanged = new Emitter<ITextEditorConfiguration>();

		this._lastSelection = [ new Selection(1,1,1,1) ];
		this._lastConfiguration = {
			insertSpaces: false,
			tabSize: 4
		};

		this.setCodeEditor(codeEditor);
	}

	public dispose(): void {
		this._model = null;
		this._codeEditor = null;
		this._codeEditorListeners = disposeAll(this._codeEditorListeners);
	}

	public getId(): string {
		return this._id;
	}

	public getModel(): EditorCommon.IModel {
		return this._model;
	}

	public hasCodeEditor(codeEditor:EditorCommon.ICommonCodeEditor): boolean {
		return (this._codeEditor === codeEditor);
	}

	public setCodeEditor(codeEditor:EditorCommon.ICommonCodeEditor): void {
		if (this.hasCodeEditor(codeEditor)) {
			// Nothing to do...
			return;
		}
		this._codeEditorListeners = disposeAll(this._codeEditorListeners);

		this._codeEditor = codeEditor;
		if (this._codeEditor) {

			let forwardSelection = () => {
				this._lastSelection = this._codeEditor.getSelections();
				this._onSelectionChanged.fire(this._lastSelection);
			};
			this._codeEditorListeners.push(this._codeEditor.addListener2(EditorCommon.EventType.CursorSelectionChanged, forwardSelection));
			if (!Selection.selectionsArrEqual(this._lastSelection, this._codeEditor.getSelections())) {
				forwardSelection();
			}

			let forwardConfiguration = () => {
				this._lastConfiguration = MainThreadTextEditor._readConfiguration(this._codeEditor);
				this._onConfigurationChanged.fire(this._lastConfiguration);
			};
			this._codeEditorListeners.push(this._codeEditor.addListener2(EditorCommon.EventType.ConfigurationChanged, forwardConfiguration));
			if (!configurationsEqual(this._lastConfiguration, MainThreadTextEditor._readConfiguration(this._codeEditor))) {
				forwardConfiguration();
			}
			this._codeEditorListeners.push(this._codeEditor.addListener2(EditorCommon.EventType.EditorFocus, () => {
				this._focusTracker.onGainedFocus();
			}));
			this._codeEditorListeners.push(this._codeEditor.addListener2(EditorCommon.EventType.EditorBlur, () => {
				this._focusTracker.onLostFocus();
			}));
		}
	}

	public isVisible(): boolean {
		return !!this._codeEditor;
	}

	public get onSelectionChanged(): Event<EditorCommon.IEditorSelection[]> {
		return this._onSelectionChanged.event;
	}

	public get onConfigurationChanged(): Event<ITextEditorConfiguration> {
		return this._onConfigurationChanged.event;
	}

	public getSelections(): EditorCommon.IEditorSelection[] {
		if (this._codeEditor) {
			return this._codeEditor.getSelections();
		}
		return this._lastSelection;
	}

	public setSelections(selections:EditorCommon.ISelection[]): void {
		if (this._codeEditor) {
			this._codeEditor.setSelections(selections);
			return;
		}
		this._lastSelection = selections.map(Selection.liftSelection);
		console.warn('setSelections on invisble editor');
	}

	public getConfiguration(): ITextEditorConfiguration {
		if (this._codeEditor) {
			return MainThreadTextEditor._readConfiguration(this._codeEditor);
		}
		return this._lastConfiguration;
	}

	public setConfiguration(newConfiguration:ITextEditorConfigurationUpdate): void {
		if (this._codeEditor) {
			this._codeEditor.updateOptions(newConfiguration);
			return;
		}
		this._lastConfiguration.tabSize = typeof newConfiguration.tabSize !== 'undefined' ? newConfiguration.tabSize : this._lastConfiguration.tabSize;
		this._lastConfiguration.insertSpaces = typeof newConfiguration.insertSpaces !== 'undefined' ? newConfiguration.insertSpaces : this._lastConfiguration.insertSpaces;
		console.warn('setConfiguration on invisible editor');
	}

	public setDecorations(key: string, ranges:EditorCommon.IRangeWithMessage[]): void {
		if (!this._codeEditor) {
			console.warn('setDecorations on invisible editor');
			return;
		}
		this._codeEditor.setDecorations(key, ranges);
	}

	public revealRange(range:EditorCommon.IRange, revealType:TextEditorRevealType): void {
		if (!this._codeEditor) {
			console.warn('revealRange on invisible editor');
			return;
		}
		if (revealType === TextEditorRevealType.Default) {
			this._codeEditor.revealRange(range);
		} else if (revealType === TextEditorRevealType.InCenter) {
			this._codeEditor.revealRangeInCenter(range);
		} else if (revealType === TextEditorRevealType.InCenterIfOutsideViewport) {
			this._codeEditor.revealRangeInCenterIfOutsideViewport(range);
		} else {
			console.warn('Unknown revealType');
		}
	}

	private static _readConfiguration(codeEditor:EditorCommon.ICommonCodeEditor): ITextEditorConfiguration {
		let indent = codeEditor.getIndentationOptions();
		return {
			insertSpaces: indent.insertSpaces,
			tabSize: indent.tabSize
		};
	}

	public isFocused(): boolean {
		if (this._codeEditor) {
			return this._codeEditor.isFocused();
		}
		return false;
	}

	public matches(editor: IEditor): boolean {
		return editor.getControl() === this._codeEditor;
	}

	public applyEdits(versionIdCheck:number, edits:EditorCommon.ISingleEditOperation[]): boolean {
		if (this._model.getVersionId() !== versionIdCheck) {
			console.warn('Model has changed in the meantime!');
			// throw new Error('Model has changed in the meantime!');
			// model changed in the meantime
			return false;
		}

		if (this._codeEditor) {
			let transformedEdits = edits.map((edit): EditorCommon.IIdentifiedSingleEditOperation => {
				return {
					identifier: null,
					range: Range.lift(edit.range),
					text: edit.text,
					forceMoveMarkers: edit.forceMoveMarkers
				};
			});
			return this._codeEditor.executeEdits('MainThreadTextEditor', transformedEdits) || true;
		}

		console.warn('applyEdits on invisible editor');
		return false;
	}
}

/**
 * Keeps track of what goes on in the main thread and maps models => text editors
 */
export class MainThreadEditorsTracker {

	private static _LAST_TEXT_EDITOR_ID = 0;
	private _nextId(): string {
		return String(++MainThreadEditorsTracker._LAST_TEXT_EDITOR_ID);
	}

	private _toDispose: IDisposable[];
	private _codeEditorService: ICodeEditorService;
	private _modelService: IModelService;
	private _updateMapping: RunOnceScheduler;
	private _editorModelChangeListeners: {[editorId:string]:IDisposable;};

	private _model2TextEditors: {
		[modelUri:string]: MainThreadTextEditor[];
	};
	private _focusedTextEditorId: string;
	private _visibleTextEditorIds: string[];
	private _onTextEditorAdd: Emitter<MainThreadTextEditor>;
	private _onTextEditorRemove: Emitter<MainThreadTextEditor>;
	private _onDidChangeFocusedTextEditor: Emitter<string>;
	private _onDidUpdateTextEditors: Emitter<void>;

	private _focusTracker: IFocusTracker;

	constructor(
		editorService:ICodeEditorService,
		modelService:IModelService
	) {
		this._codeEditorService = editorService;
		this._modelService = modelService;
		this._toDispose = [];
		this._focusedTextEditorId = null;
		this._visibleTextEditorIds = [];
		this._editorModelChangeListeners = Object.create(null);
		this._model2TextEditors = Object.create(null);
		this._onTextEditorAdd = new Emitter<MainThreadTextEditor>();
		this._onTextEditorRemove = new Emitter<MainThreadTextEditor>();
		this._onDidUpdateTextEditors = new Emitter<void>();
		this._onDidChangeFocusedTextEditor = new Emitter<string>();
		this._focusTracker = {
			onGainedFocus: () => this._updateFocusedTextEditor(),
			onLostFocus: () => this._updateFocusedTextEditor()
		};

		this._modelService.onModelAdded(this._onModelAdded, this, this._toDispose);
		this._modelService.onModelRemoved(this._onModelRemoved, this, this._toDispose);

		this._codeEditorService.onCodeEditorAdd(this._onCodeEditorAdd, this, this._toDispose);
		this._codeEditorService.onCodeEditorRemove(this._onCodeEditorRemove, this, this._toDispose);

		this._updateMapping = new RunOnceScheduler(() => this._doUpdateMapping(), 0);
		this._toDispose.push(this._updateMapping);
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
	}

	private _onModelAdded(model: EditorCommon.IModel): void {
		this._updateMapping.schedule();
	}

	private _onModelRemoved(model: EditorCommon.IModel): void {
		this._updateMapping.schedule();
	}

	private _onCodeEditorAdd(codeEditor: EditorCommon.ICommonCodeEditor): void {
		this._editorModelChangeListeners[codeEditor.getId()] = codeEditor.addListener2(EditorCommon.EventType.ModelChanged, _ => this._updateMapping.schedule());
		this._updateMapping.schedule();
	}

	private _onCodeEditorRemove(codeEditor: EditorCommon.ICommonCodeEditor): void {
		this._editorModelChangeListeners[codeEditor.getId()].dispose();
		delete this._editorModelChangeListeners[codeEditor.getId()];
		this._updateMapping.schedule();
	}

	private _doUpdateMapping(): void {
		let allModels = this._modelService.getModels();
		// Same filter as in pluginHostDocuments
		allModels.filter((model) => !model.isTooLargeForHavingARichMode());
		let allModelsMap: { [modelUri:string]: EditorCommon.IModel; } = Object.create(null);
		allModels.forEach((model) => {
			allModelsMap[model.getAssociatedResource().toString()] = model;
		});

		// Remove text editors for models that no longer exist
		Object.keys(this._model2TextEditors).forEach((modelUri) => {
			if (allModelsMap[modelUri]) {
				// model still exists, will be updated below
				return;
			}

			let textEditorsToRemove = this._model2TextEditors[modelUri];
			delete this._model2TextEditors[modelUri];

			for (let i = 0; i < textEditorsToRemove.length; i++) {
				this._onTextEditorRemove.fire(textEditorsToRemove[i]);
				textEditorsToRemove[i].dispose();
			}
		});

		// Handle all visible models
		let visibleModels = this._getVisibleModels();
		Object.keys(visibleModels).forEach((modelUri) => {
			let model = visibleModels[modelUri].model;
			let codeEditors = visibleModels[modelUri].codeEditors;

			if (!this._model2TextEditors[modelUri]) {
				this._model2TextEditors[modelUri] = [];
			}
			let existingTextEditors = this._model2TextEditors[modelUri];

			// Remove text editors if more exist
			while (existingTextEditors.length > codeEditors.length) {
				let removedTextEditor = existingTextEditors.pop();
				this._onTextEditorRemove.fire(removedTextEditor);
				removedTextEditor.dispose();
			}

			// Adjust remaining text editors
			for (let i = 0; i < existingTextEditors.length; i++) {
				existingTextEditors[i].setCodeEditor(codeEditors[i]);
			}

			// Create new editors as needed
			for (let i = existingTextEditors.length; i < codeEditors.length; i++) {
				let newTextEditor = new MainThreadTextEditor(this._nextId(), model, codeEditors[i], this._focusTracker);
				existingTextEditors.push(newTextEditor);
				this._onTextEditorAdd.fire(newTextEditor);
			}
		});

		// Handle all not visible models
		allModels.forEach((model) => {
			let modelUri = model.getAssociatedResource().toString();

			if (visibleModels[modelUri]) {
				// model is visible, already handled above
				return;
			}

			if (!this._model2TextEditors[modelUri]) {
				this._model2TextEditors[modelUri] = [];
			}
			let existingTextEditors = this._model2TextEditors[modelUri];

			// Remove extra text editors
			while (existingTextEditors.length > 1) {
				let removedTextEditor = existingTextEditors.pop();
				this._onTextEditorRemove.fire(removedTextEditor);
				removedTextEditor.dispose();
			}

			// Create new editor if needed or adjust it
			if (existingTextEditors.length === 0) {
				let newTextEditor = new MainThreadTextEditor(this._nextId(), model, null, this._focusTracker);
				existingTextEditors.push(newTextEditor);
				this._onTextEditorAdd.fire(newTextEditor);
			} else {
				existingTextEditors[0].setCodeEditor(null);
			}
		});

		this._printState();

		this._visibleTextEditorIds = this._findVisibleTextEditorIds();

		this._updateFocusedTextEditor();

		// this is a sync event
		this._onDidUpdateTextEditors.fire(undefined);
	}

	private _updateFocusedTextEditor(): void {
		this._setFocusedTextEditorId(this._findFocusedTextEditorId());
	}

	private _findFocusedTextEditorId(): string {
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].isFocused()) {
					return editors[j].getId();
				}
			}
		}

		return null;
	}

	private _findVisibleTextEditorIds(): string[] {
		let result = [];
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].isVisible()) {
					result.push(editors[j].getId());
				}
			}
		}
		result.sort();
		return result;
	}

	private _setFocusedTextEditorId(focusedTextEditorId:string): void {
		if (this._focusedTextEditorId === focusedTextEditorId) {
			// no change
			return;
		}

		this._focusedTextEditorId = focusedTextEditorId;
		this._printState();
		this._onDidChangeFocusedTextEditor.fire(this._focusedTextEditorId);
	}


	private _printState(): void {
		// console.log('----------------------');
		// Object.keys(this._model2TextEditors).forEach((modelUri) => {
		// 	let editors = this._model2TextEditors[modelUri];

		// 	console.log(editors.map((e) => {
		// 		return e.getId() + " (" + (e.getId() === this._focusedTextEditorId ? 'FOCUSED, ': '') + modelUri + ")";
		// 	}).join('\n'));
		// });
	}

	private _getVisibleModels(): IVisibleModels {
		let r: IVisibleModels = {};

		let allCodeEditors = this._codeEditorService.listCodeEditors();

		// Maintain a certain sorting such that the mapping doesn't change too much all the time
		allCodeEditors.sort((a, b) => strcmp(a.getId(), b.getId()));

		allCodeEditors.forEach((codeEditor) => {
			let model = codeEditor.getModel();
			if (!model) {
				return;
			}

			let modelUri = model.getAssociatedResource().toString();
			r[modelUri] = r[modelUri] || {
				model: model,
				codeEditors: []
			};
			r[modelUri].codeEditors.push(codeEditor);
		});

		return r;
	}

	public getFocusedTextEditorId(): string {
		return this._focusedTextEditorId;
	}

	public getVisibleTextEditorIds(): string[] {
		return this._visibleTextEditorIds;
	}

	public get onTextEditorAdd(): Event<MainThreadTextEditor> {
		return this._onTextEditorAdd.event;
	}

	public get onTextEditorRemove(): Event<MainThreadTextEditor> {
		return this._onTextEditorRemove.event;
	}

	public get onDidUpdateTextEditors(): Event<void> {
		return this._onDidUpdateTextEditors.event;
	}

	public get onChangedFocusedTextEditor(): Event<string> {
		return this._onDidChangeFocusedTextEditor.event;
	}

	public findTextEditorIdFor(codeEditor:EditorCommon.ICommonCodeEditor): string {
		let modelUris = Object.keys(this._model2TextEditors);
		for (let i = 0, len = modelUris.length; i < len; i++) {
			let editors = this._model2TextEditors[modelUris[i]];
			for (let j = 0, lenJ = editors.length; j < lenJ; j++) {
				if (editors[j].hasCodeEditor(codeEditor)) {
					return editors[j].getId();
				}
			}
		}

		return null;
	}

	public registerTextEditorDecorationType(key:string, options: EditorCommon.IDecorationRenderOptions): void {
		this._codeEditorService.registerDecorationType(key, options);
	}

	public removeTextEditorDecorationType(key:string): void {
		this._codeEditorService.removeDecorationType(key);
	}
}

interface IVisibleModels {
	[modelUri:string]: {
		model: EditorCommon.IModel;
		codeEditors: EditorCommon.ICommonCodeEditor[];
	};
}

function strcmp(a:string, b:string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}