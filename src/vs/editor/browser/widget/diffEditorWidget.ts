/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/diffEditor';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import Lifecycle = require('vs/base/common/lifecycle');
import Objects = require('vs/base/common/objects');
import CodeEditorWidget = require('vs/editor/browser/widget/codeEditorWidget');
import DomUtils = require('vs/base/browser/dom');
import EventEmitter = require('vs/base/common/eventEmitter');
import EditorCommon = require('vs/editor/common/editorCommon');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import Actions = require('vs/base/common/actions');
import Sash = require('vs/base/browser/ui/sash/sash');
import ViewLine = require('vs/editor/browser/viewParts/lines/viewLine');
import ViewLineParts = require('vs/editor/common/viewLayout/viewLineParts');
import Schedulers = require('vs/base/common/async');
import {Range} from 'vs/editor/common/core/range';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

interface IEditorScrollEvent {
	scrollLeft: number;
	scrollTop: number;
}

interface IEditorDiffDecorations {
	decorations:EditorCommon.IModelDeltaDecoration[];
	overviewZones:EditorBrowser.IOverviewRulerZone[];
}

interface IEditorDiffDecorationsWithZones extends IEditorDiffDecorations {
	zones:EditorBrowser.IViewZone[];
}

interface IEditorsDiffDecorations {
	original:IEditorDiffDecorations;
	modified:IEditorDiffDecorations;
}

interface IEditorsDiffDecorationsWithZones {
	original:IEditorDiffDecorationsWithZones;
	modified:IEditorDiffDecorationsWithZones;
}

interface IEditorsZones {
	original:EditorBrowser.IViewZone[];
	modified:EditorBrowser.IViewZone[];
}

interface IDiffEditorWidgetStyle {
	getEditorsDiffDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalWhitespaces:EditorCommon.IEditorWhitespace[], modifiedWhitespaces:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorsDiffDecorationsWithZones;
	setEnableSplitViewResizing(enableSplitViewResizing:boolean): void;
	layout(): number;
	dispose(): void;
}

class VisualEditorState {
	private _zones:number[];
	private _zonesMap:{[zoneId:string]:boolean;};
	private _decorations:string[];

	constructor() {
		this._zones = [];
		this._zonesMap = {};
		this._decorations = [];
	}

	public getForeignViewZones(allViewZones:EditorCommon.IEditorWhitespace[]): EditorCommon.IEditorWhitespace[] {
		return allViewZones.filter((z) => !this._zonesMap[String(z.id)]);
	}

	public clean(editor:CodeEditorWidget.CodeEditorWidget): void {
		// (1) View zones
		if (this._zones.length > 0) {
			editor.changeViewZones((viewChangeAccessor:EditorBrowser.IViewZoneChangeAccessor) => {
				for (var i = 0, length = this._zones.length; i < length; i++) {
					viewChangeAccessor.removeZone(this._zones[i]);
				}
			});
		}
		this._zones = [];
		this._zonesMap = {};

		// (2) Model decorations
		if (this._decorations.length > 0) {
			editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
				changeAccessor.deltaDecorations(this._decorations, []);
			});
		}
		this._decorations = [];
	}

	public apply(editor:CodeEditorWidget.CodeEditorWidget, overviewRuler:EditorBrowser.IOverviewRuler, newDecorations:IEditorDiffDecorationsWithZones): void {
		var i:number,
			length: number;

		// view zones
		editor.changeViewZones((viewChangeAccessor:EditorBrowser.IViewZoneChangeAccessor) => {
			for (i = 0, length = this._zones.length; i < length; i++) {
				viewChangeAccessor.removeZone(this._zones[i]);
			}
			this._zones = [];
			this._zonesMap = {};
			for (i = 0, length = newDecorations.zones.length; i < length; i++) {
				newDecorations.zones[i].suppressMouseDown = true;
				var zoneId = viewChangeAccessor.addZone(newDecorations.zones[i]);
				this._zones.push(zoneId);
				this._zonesMap[String(zoneId)] = true;
			}
		});

		// decorations
		this._decorations = editor.deltaDecorations(this._decorations, newDecorations.decorations);

		// overview ruler
		overviewRuler.setZones(newDecorations.overviewZones);
	}
}

var DIFF_EDITOR_ID = 0;

export class DiffEditorWidget extends EventEmitter.EventEmitter implements EditorBrowser.IDiffEditor {

	private static ONE_OVERVIEW_WIDTH = 15;
	public static ENTIRE_DIFF_OVERVIEW_WIDTH = 30;
	private static UPDATE_DIFF_DECORATIONS_DELAY = 200; // ms

	private id: number;

	private _toDispose:Lifecycle.IDisposable[];

	private _theme:string;
	private _domElement:HTMLElement;
	_containerDomElement:HTMLElement;
	private _overviewDomElement:HTMLElement;
	private _overviewViewportDomElement: HTMLElement;

	private _width:number;
	private _height:number;
	private _measureDomElementToken:number;

	private originalEditor:CodeEditorWidget.CodeEditorWidget;
	private _originalDomNode:HTMLElement;
	private _originalEditorState:VisualEditorState;
	private _originalOverviewRuler:EditorBrowser.IOverviewRuler;

	private modifiedEditor:CodeEditorWidget.CodeEditorWidget;
	private _modifiedDomNode:HTMLElement;
	private _modifiedEditorState:VisualEditorState;
	private _modifiedOverviewRuler:EditorBrowser.IOverviewRuler;

	private _currentlyChangingViewZones:boolean;
	private _beginUpdateDecorationsTimeout:number;
	private _diffComputationToken:number;
	private _lineChanges:EditorCommon.ILineChange[];

	private _isVisible:boolean;
	private _isHandlingScrollEvent:boolean;

	private _ignoreTrimWhitespace: boolean;

	private _renderSideBySide:boolean;
	private _enableSplitViewResizing:boolean;
	private _strategy:IDiffEditorWidgetStyle;

	private _updateDecorationsRunner:Schedulers.RunOnceScheduler;

	constructor(domElement:HTMLElement, options:EditorCommon.IDiffEditorOptions, @IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.id = (++DIFF_EDITOR_ID);

		this._domElement = domElement;
		options = options || {};

		this._theme = options.theme || DefaultConfig.editor.theme;
		// renderSideBySide
		this._renderSideBySide = true;
		if (typeof options.renderSideBySide !== 'undefined') {
			this._renderSideBySide = options.renderSideBySide;
		}

		// ignoreTrimWhitespace
		this._ignoreTrimWhitespace = true;
		if (typeof options.ignoreTrimWhitespace !== 'undefined') {
			this._ignoreTrimWhitespace = options.ignoreTrimWhitespace;
		}

		this._updateDecorationsRunner = new Schedulers.RunOnceScheduler(() => this._updateDecorations(), 0);

		this._toDispose = [];
		this._toDispose.push(this._updateDecorationsRunner);

		this._containerDomElement = document.createElement('div');
		this._containerDomElement.className = DiffEditorWidget._getClassName(this._theme, this._renderSideBySide);
		this._containerDomElement.style.position = 'relative';
		this._containerDomElement.style.height = '100%';
		this._domElement.appendChild(this._containerDomElement);

		this._overviewViewportDomElement = document.createElement('div');
		this._overviewViewportDomElement.className = 'diffViewport';
		this._overviewViewportDomElement.style.position = 'absolute';

		this._overviewDomElement = document.createElement('div');
		this._overviewDomElement.className = 'diffOverview';
		this._overviewDomElement.style.position = 'absolute';
		this._overviewDomElement.style.height = '100%';

		this._overviewDomElement.appendChild(this._overviewViewportDomElement);

		this._toDispose.push(DomUtils.addDisposableListener(this._overviewDomElement, 'mousedown', (e:MouseEvent) => {
			this.modifiedEditor.delegateVerticalScrollbarMouseDown(e);
		}));
		this._containerDomElement.appendChild(this._overviewDomElement);

		this._createLeftHandSide();
		this._createRightHandSide();

		this._beginUpdateDecorationsTimeout = -1;
		this._currentlyChangingViewZones = false;
		this._diffComputationToken = 0;

		this._originalEditorState = new VisualEditorState();
		this._modifiedEditorState = new VisualEditorState();

		this._isVisible = true;
		this._isHandlingScrollEvent = false;

		this._width = 0;
		this._height = 0;

		this._lineChanges = null;

		this._createLeftHandSideEditor(options, instantiationService);
		this._createRightHandSideEditor(options, instantiationService);

		if (options.automaticLayout) {
			this._measureDomElementToken = window.setInterval(() => this._measureDomElement(false), 100);
		}

		// enableSplitViewResizing
		this._enableSplitViewResizing = true;
		if (typeof options.enableSplitViewResizing !== 'undefined') {
			this._enableSplitViewResizing = options.enableSplitViewResizing;
		}

		if (this._renderSideBySide) {
			this._setStrategy(new DiffEdtorWidgetSideBySide(this._createDataSource(), this._enableSplitViewResizing));
		} else {
			this._setStrategy(new DiffEdtorWidgetInline(this._createDataSource(), this._enableSplitViewResizing));
		}
	}

	public get ignoreTrimWhitespace(): boolean {
		return this._ignoreTrimWhitespace;
	}

	public get renderSideBySide(): boolean {
		return this._renderSideBySide;
	}

	private static _getClassName(theme:string, renderSideBySide:boolean): string {
		var result = 'monaco-diff-editor monaco-editor-background ';
		if (renderSideBySide) {
			result += 'side-by-side ';
		}
		result += theme;
		return result;
	}

	private _recreateOverviewRulers(): void {
		if (this._originalOverviewRuler) {
			this._overviewDomElement.removeChild(this._originalOverviewRuler.getDomNode());
			this._originalOverviewRuler.dispose();
		}
		this._originalOverviewRuler = this.originalEditor.getView().createOverviewRuler('original diffOverviewRuler', 4, Number.MAX_VALUE);
		this._overviewDomElement.appendChild(this._originalOverviewRuler.getDomNode());

		if (this._modifiedOverviewRuler) {
			this._overviewDomElement.removeChild(this._modifiedOverviewRuler.getDomNode());
			this._modifiedOverviewRuler.dispose();
		}
		this._modifiedOverviewRuler = this.modifiedEditor.getView().createOverviewRuler('modified diffOverviewRuler', 4, Number.MAX_VALUE);
		this._overviewDomElement.appendChild(this._modifiedOverviewRuler.getDomNode());

		this._layoutOverviewRulers();
	}

	private _createLeftHandSide(): void {
		this._originalDomNode = document.createElement('div');
		this._originalDomNode.className = 'editor original';
		this._originalDomNode.style.position = 'absolute';
		this._originalDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._originalDomNode);
	}

	private _createRightHandSide(): void {
		this._modifiedDomNode = document.createElement('div');
		this._modifiedDomNode.className = 'editor modified';
		this._modifiedDomNode.style.position = 'absolute';
		this._modifiedDomNode.style.height = '100%';
		this._containerDomElement.appendChild(this._modifiedDomNode);
	}

	private _createLeftHandSideEditor(options:EditorCommon.IDiffEditorOptions, instantiationService:IInstantiationService): void {
		this.originalEditor = instantiationService.createInstance(CodeEditorWidget.CodeEditorWidget, this._originalDomNode, <any> this._adjustOptionsForLeftHandSide(options)); //TS bug: IDiffEditorOptions are not compatable with IEditorCreationOptions
		this._toDispose.push(this.originalEditor.addBulkListener2((events: any) => this._onOriginalEditorEvents(events)));
		this._toDispose.push(this.addEmitter2(this.originalEditor, 'leftHandSide'));
	}

	private _createRightHandSideEditor(options:EditorCommon.IDiffEditorOptions, instantiationService:IInstantiationService): void {
		this.modifiedEditor = instantiationService.createInstance(CodeEditorWidget.CodeEditorWidget, this._modifiedDomNode, <any> this._adjustOptionsForRightHandSide(options)); //TS bug: IDiffEditorOptions are not compatable with IEditorCreationOptions
		this._toDispose.push(this.modifiedEditor.addBulkListener2((events: any) => this._onModifiedEditorEvents(events)));
		this._toDispose.push(this.addEmitter2(this.modifiedEditor, 'rightHandSide'));
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._toDispose = Lifecycle.disposeAll(this._toDispose);

		window.clearInterval(this._measureDomElementToken);

		this._cleanViewZonesAndDecorations();

		this._originalOverviewRuler.dispose();
		this._modifiedOverviewRuler.dispose();

		this.originalEditor.destroy();
		this.modifiedEditor.destroy();

		this._strategy.dispose();

		super.dispose();
	}

	//------------ begin IDiffEditor methods

	public getId(): string {
		return this.getEditorType() + ':' + this.id;
	}

	public getEditorType(): string {
		return EditorCommon.EditorType.IDiffEditor;
	}

	public getLineChanges(): EditorCommon.ILineChange[] {
		return this._lineChanges;
	}

	public getOriginalEditor(): EditorBrowser.ICodeEditor {
		return this.originalEditor;
	}

	public getModifiedEditor(): EditorBrowser.ICodeEditor {
		return this.modifiedEditor;
	}

	public updateOptions(newOptions:EditorCommon.IDiffEditorOptions): void {
		// Handle new theme
		this._theme = newOptions && newOptions.theme ? newOptions.theme : this._theme;

		// Handle side by side
		var renderSideBySideChanged = false;
		if (typeof newOptions.renderSideBySide !== 'undefined') {
			if (this._renderSideBySide !== newOptions.renderSideBySide) {
				this._renderSideBySide = newOptions.renderSideBySide;
				renderSideBySideChanged = true;
			}
		}

		if (typeof newOptions.ignoreTrimWhitespace !== 'undefined') {
			if (this._ignoreTrimWhitespace !== newOptions.ignoreTrimWhitespace) {
				this._ignoreTrimWhitespace = newOptions.ignoreTrimWhitespace;
				// Begin comparing
				this._beginUpdateDecorations();
			}
		}

		// Update class name
		this._containerDomElement.className = DiffEditorWidget._getClassName(this._theme, this._renderSideBySide);

		this.modifiedEditor.updateOptions(this._adjustOptionsForRightHandSide(newOptions));
		this.originalEditor.updateOptions(this._adjustOptionsForLeftHandSide(newOptions));

		// enableSplitViewResizing
		if (typeof newOptions.enableSplitViewResizing !== 'undefined') {
			this._enableSplitViewResizing = newOptions.enableSplitViewResizing;
		}
		this._strategy.setEnableSplitViewResizing(this._enableSplitViewResizing);

		// renderSideBySide
		if (renderSideBySideChanged) {
			if (this._renderSideBySide) {
				this._setStrategy(new DiffEdtorWidgetSideBySide(this._createDataSource(), this._enableSplitViewResizing));
			} else {
				this._setStrategy(new DiffEdtorWidgetInline(this._createDataSource(), this._enableSplitViewResizing));
			}
		}
	}

	public getValue(options:{ preserveBOM:boolean; lineEnding:string; }=null): string {
		return this.modifiedEditor.getValue(options);
	}

	public getModel(): EditorCommon.IDiffEditorModel {
		return {
			original: this.originalEditor.getModel(),
			modified: this.modifiedEditor.getModel()
		};
	}

	public setModel(model:EditorCommon.IDiffEditorModel): void {
		// Guard us against partial null model
		if (model && (!model.original || !model.modified)) {
			throw new Error(!model.original ? 'DiffEditorWidget.setModel: Original model is null' : 'DiffEditorWidget.setModel: Modified model is null');
		}

		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();

		// Update code editor models
		this.originalEditor.setModel(model ? model.original : null);
		this.modifiedEditor.setModel(model ? model.modified : null);
		this._updateDecorationsRunner.cancel();

		if (model) {
			this.originalEditor.setScrollTop(0);
			this.modifiedEditor.setScrollTop(0);
		}

		// Disable any diff computations that will come in
		this._lineChanges = null;
		this._diffComputationToken++;

		if (model) {
			this._recreateOverviewRulers();

			// Begin comparing
			this._beginUpdateDecorations();
		} else {
			this._lineChanges = null;
		}

		this._layoutOverviewViewport();
	}

	public getDomNode(): HTMLElement {
		return this._domElement;
	}

	public getVisibleColumnFromPosition(position:EditorCommon.IPosition): number {
		return this.modifiedEditor.getVisibleColumnFromPosition(position);
	}

	public getPosition(): EditorCommon.IEditorPosition {
		return this.modifiedEditor.getPosition();
	}

	public setPosition(position: EditorCommon.IPosition, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void {
		this.modifiedEditor.setPosition(position, reveal, revealVerticalInCenter, revealHorizontal);
	}

	public revealLine(lineNumber: number): void {
		this.modifiedEditor.revealLine(lineNumber);
	}

	public revealLineInCenter(lineNumber: number): void {
		this.modifiedEditor.revealLineInCenter(lineNumber);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number): void {
		this.modifiedEditor.revealLineInCenterIfOutsideViewport(lineNumber);
	}

	public revealPosition(position: EditorCommon.IPosition, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		this.modifiedEditor.revealPosition(position, revealVerticalInCenter, revealHorizontal);
	}

	public revealPositionInCenter(position: EditorCommon.IPosition): void {
		this.modifiedEditor.revealPositionInCenter(position);
	}

	public revealPositionInCenterIfOutsideViewport(position: EditorCommon.IPosition): void {
		this.modifiedEditor.revealPositionInCenterIfOutsideViewport(position);
	}

	public getSelection(): EditorCommon.IEditorSelection {
		return this.modifiedEditor.getSelection();
	}

	public getSelections(): EditorCommon.IEditorSelection[] {
		return this.modifiedEditor.getSelections();
	}

	public setSelection(range:EditorCommon.IRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorRange:EditorCommon.IEditorRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(selection:EditorCommon.ISelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorSelection:EditorCommon.IEditorSelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(something:any, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void {
		this.modifiedEditor.setSelection(something, reveal, revealVerticalInCenter, revealHorizontal);
	}

	public setSelections(ranges: EditorCommon.ISelection[]): void {
		this.modifiedEditor.setSelections(ranges);
	}

	public revealLines(startLineNumber: number, endLineNumber: number): void {
		this.modifiedEditor.revealLines(startLineNumber, endLineNumber);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number): void {
		this.modifiedEditor.revealLinesInCenter(startLineNumber, endLineNumber);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number): void {
		this.modifiedEditor.revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber);
	}

	public revealRange(range: EditorCommon.IRange, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		this.modifiedEditor.revealRange(range, revealVerticalInCenter, revealHorizontal);
	}

	public revealRangeInCenter(range: EditorCommon.IRange): void {
		this.modifiedEditor.revealRangeInCenter(range);
	}

	public revealRangeInCenterIfOutsideViewport(range: EditorCommon.IRange): void {
		this.modifiedEditor.revealRangeInCenterIfOutsideViewport(range);
	}

	public addAction(descriptor:EditorCommon.IActionDescriptor): void {
		this.modifiedEditor.addAction(descriptor);
	}

	public getActions(): Actions.IAction[] {
		return this.modifiedEditor.getActions();
	}

	public getAction(id:string): Actions.IAction {
		return this.modifiedEditor.getAction(id);
	}

	public saveViewState(): EditorCommon.IDiffEditorViewState {
		var originalViewState = this.originalEditor.saveViewState();
		var modifiedViewState = this.modifiedEditor.saveViewState();
		return {
			original: originalViewState,
			modified: modifiedViewState
		};
	}

	public restoreViewState(state:EditorCommon.IEditorViewState): void {
		var s = <any>state;
		if (s.original && s.original) {
			var diffEditorState = <EditorCommon.IDiffEditorViewState>s;
			this.originalEditor.restoreViewState(diffEditorState.original);
			this.modifiedEditor.restoreViewState(diffEditorState.modified);
		}
	}

	public layout(dimension?:EditorCommon.IDimension): void {
		this._measureDomElement(false, dimension);
	}

	public focus(): void {
		this.modifiedEditor.focus();
	}

	public isFocused(): boolean {
		return this.originalEditor.isFocused() || this.modifiedEditor.isFocused();
	}

	public onVisible(): void {
		this._isVisible = true;
		this.originalEditor.onVisible();
		this.modifiedEditor.onVisible();
		// Begin comparing
		this._beginUpdateDecorations();
	}

	public onHide(): void {
		this._isVisible = false;
		this.originalEditor.onHide();
		this.modifiedEditor.onHide();
		// Remove all view zones & decorations
		this._cleanViewZonesAndDecorations();
	}

	public trigger(source:string, handlerId:string, payload:any): void {
		this.modifiedEditor.trigger(source, handlerId, payload);
	}

	public changeDecorations(callback:(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor)=>any): any {
		return this.modifiedEditor.changeDecorations(callback);
	}

	//------------ end IDiffEditor methods



	//------------ begin layouting methods

	private _measureDomElement(forceDoLayoutCall:boolean, dimensions?:EditorCommon.IDimension): void {
		dimensions = dimensions || DomUtils.getDomNodePosition(this._containerDomElement);

		if (dimensions.width <= 0) {
			return;
		}

		if (!forceDoLayoutCall && dimensions.width === this._width && dimensions.height === this._height) {
			// Nothing has changed
			return;
		}

		this._width = dimensions.width;
		this._height = dimensions.height;

		this._doLayout();
	}

	private _layoutOverviewRulers(): void {
		var freeSpace = DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH - 2*DiffEditorWidget.ONE_OVERVIEW_WIDTH;
		var layoutInfo = this.modifiedEditor.getLayoutInfo();
		if (layoutInfo) {
			this._originalOverviewRuler.setLayout({
				top: 0,
				width: DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				right: freeSpace + DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				height: this._height - layoutInfo.horizontalScrollbarHeight
			});
			this._modifiedOverviewRuler.setLayout({
				top: 0,
				right: 0,
				width: DiffEditorWidget.ONE_OVERVIEW_WIDTH,
				height: this._height - layoutInfo.horizontalScrollbarHeight
			});
		}
	}

	//------------ end layouting methods

	private _recomputeIfNecessary(events:EventEmitter.IEmitterEvent[]): void {
		var changed = false;
		for (var i = 0; !changed && i < events.length; i++) {
			var type = events[i].getType();
			changed = changed || type === 'change' || type === EditorCommon.EventType.ModelModeChanged;
		}
		if (changed && this._isVisible) {
			// Clear previous timeout if necessary
			if (this._beginUpdateDecorationsTimeout !== -1) {
				window.clearTimeout(this._beginUpdateDecorationsTimeout);
				this._beginUpdateDecorationsTimeout = -1;
			}
			this._beginUpdateDecorationsTimeout = window.setTimeout(() => this._beginUpdateDecorations(), DiffEditorWidget.UPDATE_DIFF_DECORATIONS_DELAY);
		}
	}

	private _onOriginalEditorEvents(events:EventEmitter.IEmitterEvent[]): void {
		for (var i = 0; i < events.length; i++) {
			if (events[i].getType() === 'scroll') {
				this._onOriginalEditorScroll(events[i].getData());
			}
			if (events[i].getType() === EditorCommon.EventType.ViewZonesChanged) {
				this._onViewZonesChanged();
			}
		}
		this._recomputeIfNecessary(events);
	}

	private _onModifiedEditorEvents(events:EventEmitter.IEmitterEvent[]): void {
		for (var i = 0; i < events.length; i++) {
			if (events[i].getType() === 'scroll') {
				this._onModifiedEditorScroll(events[i].getData());
				this._layoutOverviewViewport();
			}
			if (events[i].getType() === 'scrollSize') {
				this._layoutOverviewViewport();
			}
			if (events[i].getType() === 'viewLayoutChanged') {
				this._layoutOverviewViewport();
			}

			if (events[i].getType() === EditorCommon.EventType.ViewZonesChanged) {
				this._onViewZonesChanged();
			}
		}
		this._recomputeIfNecessary(events);
	}

	private _onViewZonesChanged(): void {
		if (this._currentlyChangingViewZones) {
			return;
		}
		this._updateDecorationsRunner.schedule();
	}

	private _beginUpdateDecorations(): void {
		this._beginUpdateDecorationsTimeout = -1;
		if (!this.modifiedEditor.getModel()) {
			return;
		}

		// Prevent old diff requests to come if a new request has been initiated
		// The best method would be to call cancel on the Promise, but this is not
		// yet supported, so using tokens for now.
		this._diffComputationToken++;
		var currentToken = this._diffComputationToken;
		var currentOriginalModel = this.originalEditor.getModel();
		var currentModifiedModel = this.modifiedEditor.getModel();

		var diffSupport = this.modifiedEditor.getModel().getMode().diffSupport;
		if(!diffSupport) {
			// no diffing support
			this._lineChanges = null;
			this._updateDecorationsRunner.schedule();
		} else {
			try {
				diffSupport.computeDiff(currentOriginalModel.getAssociatedResource(), currentModifiedModel.getAssociatedResource(), this._ignoreTrimWhitespace).then((result:EditorCommon.ILineChange[]) => {
					if (currentToken === this._diffComputationToken
						&& currentOriginalModel === this.originalEditor.getModel()
						&& currentModifiedModel === this.modifiedEditor.getModel()
						)
					{
						this._lineChanges = result;
						this._updateDecorationsRunner.schedule();
						this.emit(EditorCommon.EventType.DiffUpdated, { editor: this, lineChanges: result });
					}
				}, (error) => {
					if (currentToken === this._diffComputationToken
						&& currentOriginalModel === this.originalEditor.getModel()
						&& currentModifiedModel === this.modifiedEditor.getModel()
						)
					{
						this._lineChanges = null;
						this._updateDecorationsRunner.schedule();
					}
				});
			} catch(e) {
				console.error(e);
				this._lineChanges = null;
				this._updateDecorationsRunner.schedule();
			}
		}
	}

	private _cleanViewZonesAndDecorations(): void {
		this._originalEditorState.clean(this.originalEditor);
		this._modifiedEditorState.clean(this.modifiedEditor);
	}

	private _updateDecorations(): void {
		var lineChanges = this._lineChanges || [];

		var foreignOriginal = this._originalEditorState.getForeignViewZones(this.originalEditor.getWhitespaces());
		var foreignModified = this._modifiedEditorState.getForeignViewZones(this.modifiedEditor.getWhitespaces());

		var diffDecorations = this._strategy.getEditorsDiffDecorations(lineChanges, this._ignoreTrimWhitespace, foreignOriginal, foreignModified, this.originalEditor, this.modifiedEditor);

		try {
			this._currentlyChangingViewZones = true;
			this._originalEditorState.apply(this.originalEditor, this._originalOverviewRuler, diffDecorations.original);
			this._modifiedEditorState.apply(this.modifiedEditor, this._modifiedOverviewRuler, diffDecorations.modified);
		} finally {
			this._currentlyChangingViewZones = false;
		}
	}

	private _adjustOptionsForLeftHandSide(options:EditorCommon.IDiffEditorOptions): EditorCommon.IDiffEditorOptions {
		var clonedOptions:EditorCommon.IDiffEditorOptions = Objects.clone(options || {});
		clonedOptions.wrappingColumn = -1;
		clonedOptions.readOnly = true;
		clonedOptions.automaticLayout = false;
		clonedOptions.scrollbar = clonedOptions.scrollbar || {};
		clonedOptions.scrollbar.vertical = 'visible';
		clonedOptions.overviewRulerLanes = 1;
		clonedOptions.theme = this._theme + ' original-in-monaco-diff-editor';
		return clonedOptions;
	}

	private _adjustOptionsForRightHandSide(options:EditorCommon.IDiffEditorOptions): EditorCommon.IDiffEditorOptions {
		var clonedOptions:EditorCommon.IDiffEditorOptions = Objects.clone(options || {});
		clonedOptions.wrappingColumn = -1;
		clonedOptions.automaticLayout = false;
		clonedOptions.revealHorizontalRightPadding = DefaultConfig.editor.revealHorizontalRightPadding + DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
		clonedOptions.scrollbar = clonedOptions.scrollbar || {};
		clonedOptions.scrollbar.vertical = 'visible';
		clonedOptions.scrollbar.verticalHasArrows = false;
		clonedOptions.theme = this._theme + ' modified-in-monaco-diff-editor';
		return clonedOptions;
	}

	private _onOriginalEditorScroll(e:IEditorScrollEvent): void {
		if (this._isHandlingScrollEvent) {
			return;
		}
		this._isHandlingScrollEvent = true;
		this.modifiedEditor.setScrollLeft(e.scrollLeft);
		this.modifiedEditor.setScrollTop(e.scrollTop);
		this._isHandlingScrollEvent = false;
	}

	private _onModifiedEditorScroll(e:IEditorScrollEvent): void {
		if(this._isHandlingScrollEvent) {
			return;
		}
		this._isHandlingScrollEvent = true;
		this.originalEditor.setScrollLeft(e.scrollLeft);
		this.originalEditor.setScrollTop(e.scrollTop);
		this._isHandlingScrollEvent = false;
	}

	private _doLayout(): void {
		var splitPoint = this._strategy.layout();

		this._originalDomNode.style.width = splitPoint + 'px';
		this._originalDomNode.style.left = '0px';

		this._modifiedDomNode.style.width = (this._width - splitPoint) + 'px';
		this._modifiedDomNode.style.left = splitPoint + 'px';

		this._overviewDomElement.style.top = '0px';
		this._overviewDomElement.style.width = DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px';
		this._overviewDomElement.style.left = (this._width - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH) + 'px';
		this._overviewViewportDomElement.style.width = DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH + 'px';
		this._overviewViewportDomElement.style.height = '30px';

		this.originalEditor.layout({ width: splitPoint, height: this._height });
		this.modifiedEditor.layout({ width: this._width - splitPoint - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH, height: this._height });

		if (this._originalOverviewRuler || this._modifiedOverviewRuler) {
			this._layoutOverviewRulers();
		}

		this._layoutOverviewViewport();
	}

	private _layoutOverviewViewport(): void {
		var layout = this._computeOverviewViewport();
		if (!layout) {
			DomUtils.StyleMutator.setTop(this._overviewViewportDomElement, 0);
			DomUtils.StyleMutator.setHeight(this._overviewViewportDomElement, 0);
		} else {
			DomUtils.StyleMutator.setTop(this._overviewViewportDomElement, layout.top);
			DomUtils.StyleMutator.setHeight(this._overviewViewportDomElement, layout.height);
		}
	}

	private _computeOverviewViewport(): { height: number; top: number;} {
		var layoutInfo = this.modifiedEditor.getLayoutInfo();
		if (!layoutInfo) {
			return null;
		}

		var scrollTop = this.modifiedEditor.getScrollTop();
		var scrollHeight = this.modifiedEditor.getScrollHeight();

		var computedAvailableSize = Math.max(0, layoutInfo.contentHeight - layoutInfo.horizontalScrollbarHeight);
		var computedRepresentableSize = Math.max(0, computedAvailableSize - 2 * 0);
		var computedRatio = scrollHeight > 0 ? (computedRepresentableSize / scrollHeight) : 0;

		var computedSliderSize = Math.max(1, Math.floor(layoutInfo.contentHeight * computedRatio));
		var computedSliderPosition = Math.floor(scrollTop * computedRatio);

		return {
			height: computedSliderSize,
			top: computedSliderPosition
		};
	}

	private _createDataSource():IDataSource {
		return {
			getWidth: () => {
				return this._width;
			},

			getHeight: () => {
				return this._height;
			},

			getContainerDomNode: () => {
				return this._containerDomElement;
			},

			relayoutEditors: () => {
				this._doLayout();
			},

			getOriginalEditor: () => {
				return this.originalEditor;
			},

			getModifiedEditor: () => {
				return this.modifiedEditor;
			}
		};
	}

	private _setStrategy(newStrategy:IDiffEditorWidgetStyle): void {
		if (this._strategy) {
			this._strategy.dispose();
		}

		this._strategy = newStrategy;

		if (this._lineChanges) {
			this._updateDecorations();
		}

		// Just do a layout, the strategy might need it
		this._measureDomElement(true);
	}

	private _getLineChangeAtOrBeforeLineNumber(lineNumber: number, startLineNumberExtractor:(lineChange:EditorCommon.ILineChange)=>number): EditorCommon.ILineChange {
		if (this._lineChanges.length === 0 || lineNumber < startLineNumberExtractor(this._lineChanges[0])) {
			// There are no changes or `lineNumber` is before the first change
			return null;
		}

		var min = 0, max = this._lineChanges.length - 1;
		while (min < max) {
			var mid = Math.floor((min + max) / 2);
			var midStart = startLineNumberExtractor(this._lineChanges[mid]);
			var midEnd = (mid + 1 <= max ? startLineNumberExtractor(this._lineChanges[mid + 1]) : Number.MAX_VALUE);

			if (lineNumber < midStart) {
				max = mid - 1;
			} else if (lineNumber >= midEnd) {
				min = mid + 1;
			} else {
				// HIT!
				min = mid;
				max = mid;
			}
		}
		return this._lineChanges[min];
	}

	private _getEquivalentLineForOriginalLineNumber(lineNumber: number): number {
		var lineChange = this._getLineChangeAtOrBeforeLineNumber(lineNumber, (lineChange) => lineChange.originalStartLineNumber);

		if (!lineChange) {
			return lineNumber;
		}

		var originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
		var modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
		var lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
		var lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);


		var delta = lineNumber - originalEquivalentLineNumber;

		if (delta <= lineChangeOriginalLength) {
			return modifiedEquivalentLineNumber + Math.min(delta, lineChangeModifiedLength);
		}

		return modifiedEquivalentLineNumber + lineChangeModifiedLength - lineChangeOriginalLength + delta ;
	}

	private _getEquivalentLineForModifiedLineNumber(lineNumber: number): number {
		var lineChange = this._getLineChangeAtOrBeforeLineNumber(lineNumber, (lineChange) => lineChange.modifiedStartLineNumber);

		if (!lineChange) {
			return lineNumber;
		}

		var originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
		var modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
		var lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
		var lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);


		var delta = lineNumber - modifiedEquivalentLineNumber;

		if (delta <= lineChangeModifiedLength) {
			return originalEquivalentLineNumber + Math.min(delta, lineChangeOriginalLength);
		}

		return originalEquivalentLineNumber + lineChangeOriginalLength - lineChangeModifiedLength + delta ;
	}

	public getDiffLineInformationForOriginal(lineNumber:number): EditorCommon.IDiffLineInformation {
		if (!this._lineChanges) {
			// Cannot answer that which I don't know
			return null;
		}
		return {
			equivalentLineNumber: this._getEquivalentLineForOriginalLineNumber(lineNumber)
		};
	}

	public getDiffLineInformationForModified(lineNumber:number): EditorCommon.IDiffLineInformation {
		if (!this._lineChanges) {
			// Cannot answer that which I don't know
			return null;
		}
		return {
			equivalentLineNumber: this._getEquivalentLineForModifiedLineNumber(lineNumber)
		};
	}
}

interface IDataSource {
	getWidth(): number;
	getHeight(): number;
	getContainerDomNode(): HTMLElement;
	relayoutEditors(): void;

	getOriginalEditor(): EditorBrowser.ICodeEditor;
	getModifiedEditor(): EditorBrowser.ICodeEditor;
}

class DiffEditorWidgetStyle {

	_dataSource:IDataSource;

	constructor(dataSource:IDataSource) {
		this._dataSource = dataSource;
	}

	public getEditorsDiffDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalWhitespaces:EditorCommon.IEditorWhitespace[], modifiedWhitespaces:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorsDiffDecorationsWithZones {
		// Get view zones
		modifiedWhitespaces = modifiedWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		originalWhitespaces = originalWhitespaces.sort((a, b) => {
			return a.afterLineNumber - b.afterLineNumber;
		});
		var zones = this._getViewZones(lineChanges, originalWhitespaces, modifiedWhitespaces, originalEditor, modifiedEditor);

		// Get decorations & overview ruler zones
		var originalDecorations = this._getOriginalEditorDecorations(lineChanges, ignoreTrimWhitespace, originalEditor, modifiedEditor);
		var modifiedDecorations = this._getModifiedEditorDecorations(lineChanges, ignoreTrimWhitespace, originalEditor, modifiedEditor);

		return {
			original: {
				decorations: originalDecorations.decorations,
				overviewZones: originalDecorations.overviewZones,
				zones: zones.original
			},
			modified: {
				decorations: modifiedDecorations.decorations,
				overviewZones: modifiedDecorations.overviewZones,
				zones: zones.modified
			}
		};
	}

	_getViewZones(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorsZones {
		return null;
	}

	_getOriginalEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {
		return null;
	}

	_getModifiedEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {
		return null;
	}
}

interface IMyViewZone extends EditorBrowser.IViewZone {
	shouldNotShrink?: boolean;
}

class ForeignViewZonesIterator {

	private _index: number;
	private _source: EditorCommon.IEditorWhitespace[];
	public current: EditorCommon.IEditorWhitespace;

	constructor(source: EditorCommon.IEditorWhitespace[]) {
		this._source = source;
		this._index = -1;
		this.advance();
	}

	public advance(): void {
		this._index++;
		if (this._index < this._source.length) {
			this.current = this._source[this._index];
		} else {
			this.current = null;
		}
	}
}

class ViewZonesComputer {

	private lineChanges:EditorCommon.ILineChange[];
	private originalForeignVZ:EditorCommon.IEditorWhitespace[];
	private modifiedForeignVZ:EditorCommon.IEditorWhitespace[];

	constructor(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[]) {
		this.lineChanges = lineChanges;
		this.originalForeignVZ = originalForeignVZ;
		this.modifiedForeignVZ = modifiedForeignVZ;
	}

	public getViewZones(): IEditorsZones {
		var result: IEditorsZones = {
			original: [],
			modified: []
		};

		var i:number,
			length:number,
			lineChange:EditorCommon.ILineChange;

		var stepOriginal: IMyViewZone[],
			stepModified: IMyViewZone[],
			stepOriginalIndex: number,
			stepModifiedIndex: number,
			lineChangeModifiedLength:number = 0,
			lineChangeOriginalLength:number = 0,
			originalEquivalentLineNumber: number = 0,
			modifiedEquivalentLineNumber: number = 0,
			originalEndEquivalentLineNumber: number = 0,
			modifiedEndEquivalentLineNumber: number = 0,
			viewZoneLineNumber: number = 0;

		var sortMyViewZones = (a:IMyViewZone, b:IMyViewZone) => {
			return a.afterLineNumber - b.afterLineNumber;
		};

		var addAndCombineIfPossible = (destination:EditorBrowser.IViewZone[], item:IMyViewZone) => {
			if (item.domNode === null && destination.length > 0) {
				var lastItem = destination[destination.length - 1];
				if (lastItem.afterLineNumber === item.afterLineNumber && lastItem.domNode === null) {
					lastItem.heightInLines += item.heightInLines;
					return;
				}
			}
			destination.push(item);
		};

		var modifiedForeignVZ = new ForeignViewZonesIterator(this.modifiedForeignVZ);
		var originalForeignVZ = new ForeignViewZonesIterator(this.originalForeignVZ);

		// In order to include foreign view zones after the last line change, the for loop will iterate once more after the end of the `lineChanges` array
		for (i = 0, length = this.lineChanges.length; i <= length; i++) {
			lineChange = (i < length ? this.lineChanges[i] : null);

			if (lineChange !== null) {
				originalEquivalentLineNumber = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
				modifiedEquivalentLineNumber = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
				lineChangeOriginalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
				lineChangeModifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);
				originalEndEquivalentLineNumber = Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber);
				modifiedEndEquivalentLineNumber = Math.max(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber);
			} else {
				// Increase to very large value to get the producing tests of foreign view zones running
				originalEquivalentLineNumber += 10000000 + lineChangeOriginalLength;
				modifiedEquivalentLineNumber += 10000000 + lineChangeModifiedLength;
				originalEndEquivalentLineNumber = originalEquivalentLineNumber;
				modifiedEndEquivalentLineNumber = modifiedEquivalentLineNumber;
			}

			// Each step produces view zones, and after producing them, we try to cancel them out, to avoid empty-empty view zone cases
			stepOriginal = [];
			stepModified = [];

			// ---------------------------- PRODUCE VIEW ZONES

			// [PRODUCE] View zone(s) in original-side due to foreign view zone(s) in modified-side
			while (modifiedForeignVZ.current && modifiedForeignVZ.current.afterLineNumber <= modifiedEndEquivalentLineNumber) {
				if (modifiedForeignVZ.current.afterLineNumber <= modifiedEquivalentLineNumber) {
					viewZoneLineNumber = originalEquivalentLineNumber - modifiedEquivalentLineNumber + modifiedForeignVZ.current.afterLineNumber;
				} else {
					viewZoneLineNumber = originalEndEquivalentLineNumber;
				}
				stepOriginal.push({
					afterLineNumber: viewZoneLineNumber,
					heightInLines: modifiedForeignVZ.current.heightInLines,
					domNode: null
				});
				modifiedForeignVZ.advance();
			}

			// [PRODUCE] View zone(s) in modified-side due to foreign view zone(s) in original-side
			while (originalForeignVZ.current && originalForeignVZ.current.afterLineNumber <= originalEndEquivalentLineNumber) {
				if (originalForeignVZ.current.afterLineNumber <= originalEquivalentLineNumber) {
					viewZoneLineNumber = modifiedEquivalentLineNumber - originalEquivalentLineNumber + originalForeignVZ.current.afterLineNumber;
				} else {
					viewZoneLineNumber = modifiedEndEquivalentLineNumber;
				}
				stepModified.push({
					afterLineNumber: viewZoneLineNumber,
					heightInLines: originalForeignVZ.current.heightInLines,
					domNode: null
				});
				originalForeignVZ.advance();
			}

			if (lineChange !== null && isChangeOrInsert(lineChange)) {
				var r = this._produceOriginalFromDiff(lineChange, lineChangeOriginalLength, lineChangeModifiedLength);
				if (r) {
					stepOriginal.push(r);
				}
			}

			if (lineChange !== null && isChangeOrDelete(lineChange)) {
				var r = this._produceModifiedFromDiff(lineChange, lineChangeOriginalLength, lineChangeModifiedLength);
				if (r) {
					stepModified.push(r);
				}
			}

			// ---------------------------- END PRODUCE VIEW ZONES


			// ---------------------------- EMIT MINIMAL VIEW ZONES

			// [CANCEL & EMIT] Try to cancel view zones out
			stepOriginalIndex = 0;
			stepModifiedIndex = 0;

			stepOriginal = stepOriginal.sort(sortMyViewZones);
			stepModified = stepModified.sort(sortMyViewZones);

			while (stepOriginalIndex < stepOriginal.length && stepModifiedIndex < stepModified.length) {
				var original = stepOriginal[stepOriginalIndex];
				var modified = stepModified[stepModifiedIndex];

				var originalDelta = original.afterLineNumber - originalEquivalentLineNumber;
				var modifiedDelta = modified.afterLineNumber - modifiedEquivalentLineNumber;

				if (originalDelta < modifiedDelta) {
					addAndCombineIfPossible(result.original, original);
					stepOriginalIndex++;
				} else if (modifiedDelta < originalDelta) {
					addAndCombineIfPossible(result.modified, modified);
					stepModifiedIndex++;
				} else if (original.shouldNotShrink) {
					addAndCombineIfPossible(result.original, original);
					stepOriginalIndex++;
				} else if (modified.shouldNotShrink) {
					addAndCombineIfPossible(result.modified, modified);
					stepModifiedIndex++;
				} else {
					if (original.heightInLines >= modified.heightInLines) {
						// modified view zone gets removed
						original.heightInLines -= modified.heightInLines;
						stepModifiedIndex++;
					} else {
						// original view zone gets removed
						modified.heightInLines -= original.heightInLines;
						stepOriginalIndex++;
					}
				}
			}

			// [EMIT] Remaining original view zones
			while (stepOriginalIndex < stepOriginal.length) {
				addAndCombineIfPossible(result.original, stepOriginal[stepOriginalIndex]);
				stepOriginalIndex++;
			}

			// [EMIT] Remaining modified view zones
			while (stepModifiedIndex < stepModified.length) {
				addAndCombineIfPossible(result.modified, stepModified[stepModifiedIndex]);
				stepModifiedIndex++;
			}

			// ---------------------------- END EMIT MINIMAL VIEW ZONES
		}

		var ensureDomNode = (z:IMyViewZone) => {
			if (!z.domNode) {
				z.domNode = createFakeLinesDiv();
			}
		};

		result.original.forEach(ensureDomNode);
		result.modified.forEach(ensureDomNode);

		return result;
	}

	_produceOriginalFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		throw new Error('NotImplemented');
	}

	_produceModifiedFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		throw new Error('NotImplemented');
	}
}

class DiffEdtorWidgetSideBySide extends DiffEditorWidgetStyle implements IDiffEditorWidgetStyle, Sash.IVerticalSashLayoutProvider {

	static MINIMUM_EDITOR_WIDTH = 100;

	private _disableSash: boolean;
	private _sash:Sash.Sash;
	private _sashRatio:number;
	private _sashPosition:number;
	private _startSashPosition:number;

	constructor(dataSource:IDataSource, enableSplitViewResizing:boolean) {
		super(dataSource);

		this._disableSash = (enableSplitViewResizing === false);
		this._sashRatio = null;
		this._sashPosition = null;
		this._sash = new Sash.Sash(this._dataSource.getContainerDomNode(), this);

		if (this._disableSash) {
			this._sash.disable();
		}

		this._sash.on('start', () => this._onSashDragStart());
		this._sash.on('change', (e: Sash.ISashEvent) => this._onSashDrag(e));
		this._sash.on('end', () => this._onSashDragEnd());
	}

	public dispose(): void {
		this._sash.dispose();
	}

	public setEnableSplitViewResizing(enableSplitViewResizing:boolean): void {
		var newDisableSash = (enableSplitViewResizing === false);
		if (this._disableSash !== newDisableSash) {
			this._disableSash = newDisableSash;

			if (this._disableSash) {
				this._sash.disable();
			} else {
				this._sash.enable();
			}
		}
	}

	public layout(sashRatio:number = this._sashRatio): number {
		var w = this._dataSource.getWidth();
		var contentWidth = w - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;

		var sashPosition = Math.floor((sashRatio || 0.5) * contentWidth);
		var midPoint = Math.floor(0.5 * contentWidth);

		var sashPosition = this._disableSash ? midPoint : sashPosition || midPoint;

		if (contentWidth > DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH * 2) {
			if (sashPosition < DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH) {
				sashPosition = DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH;
			}

			if (sashPosition > contentWidth - DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH) {
				sashPosition = contentWidth - DiffEdtorWidgetSideBySide.MINIMUM_EDITOR_WIDTH;
			}
		} else {
			sashPosition = midPoint;
		}

		if (this._sashPosition !== sashPosition) {
			this._sashPosition = sashPosition;
			this._sash.layout();
		}

		return this._sashPosition;
	}

	private _onSashDragStart(): void {
		this._startSashPosition = this._sashPosition;
	}

	private _onSashDrag(e:Sash.ISashEvent): void {
		var w = this._dataSource.getWidth();
		var contentWidth = w - DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH;
		var sashPosition = this.layout((this._startSashPosition + (e.currentX - e.startX)) / contentWidth);

		this._sashRatio = sashPosition / contentWidth;

		this._dataSource.relayoutEditors();
	}

	private _onSashDragEnd(): void {
		this._sash.layout();
	}

	public getVerticalSashTop(sash: Sash.Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash.Sash): number {
		return this._sashPosition;
	}

	public getVerticalSashHeight(sash: Sash.Sash): number {
		return this._dataSource.getHeight();
	}

	_getViewZones(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorsZones {
		var c = new SideBySideViewZonesComputer(lineChanges, originalForeignVZ, modifiedForeignVZ);
		return c.getViewZones();
	}

	_getOriginalEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {

		var result:IEditorDiffDecorations = {
				decorations: [],
				overviewZones: []
			},
			i:number,
			length:number,
			j:number,
			lengthJ:number,
			lineChange:EditorCommon.ILineChange,
			charChange:EditorCommon.ICharChange,
			lineNumber:number,
			startColumn:number,
			endColumn:number,
			originalModel = originalEditor.getModel();

		for (i = 0, length = lineChanges.length; i < length; i++) {
			lineChange = lineChanges[i];

			if (isChangeOrDelete(lineChange)) {

				result.decorations.push(createDecoration(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Number.MAX_VALUE, 'line-delete', true));
				if (!isChangeOrInsert(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.originalStartLineNumber, 1, lineChange.originalEndLineNumber, Number.MAX_VALUE, 'char-delete', true));
				}

				result.overviewZones.push({
					startLineNumber: lineChange.originalStartLineNumber,
					endLineNumber: lineChange.originalEndLineNumber,
					color: 'rgba(255, 0, 0, 0.4)',
					darkColor: 'rgba(255, 0, 0, 0.4)',
					position: EditorCommon.OverviewRulerLane.Full
				});

				if (lineChange.charChanges) {
					for (j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						charChange = lineChange.charChanges[j];
						if (isChangeOrDelete(charChange)) {
							if (ignoreTrimWhitespace) {
								for (lineNumber = charChange.originalStartLineNumber; lineNumber <= charChange.originalEndLineNumber; lineNumber++) {
									if (lineNumber === charChange.originalStartLineNumber) {
										startColumn = charChange.originalStartColumn;
									} else {
										startColumn = originalModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.originalEndLineNumber) {
										endColumn = charChange.originalEndColumn;
									} else {
										endColumn = originalModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, 'char-delete', false));
								}
							} else {
								result.decorations.push(createDecoration(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn, 'char-delete', false));
							}
						}
					}
				}
			}
		}

		return result;
	}

	_getModifiedEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {

		var result:IEditorDiffDecorations = {
				decorations: [],
				overviewZones: []
			},
			i:number,
			length:number,
			j:number,
			lengthJ:number,
			lineChange:EditorCommon.ILineChange,
			charChange:EditorCommon.ICharChange,
			lineNumber:number,
			startColumn:number,
			endColumn:number,
			modifiedModel = modifiedEditor.getModel();

		for (i = 0, length = lineChanges.length; i < length; i++) {
			lineChange = lineChanges[i];

			if (isChangeOrInsert(lineChange)) {

				result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, 'line-insert', true));
				if (!isChangeOrDelete(lineChange) || !lineChange.charChanges) {
					result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, 'char-insert', true));
				}
				result.overviewZones.push({
					startLineNumber: lineChange.modifiedStartLineNumber,
					endLineNumber: lineChange.modifiedEndLineNumber,
					color: 'rgba(155, 185, 85, 0.4)',
					darkColor: 'rgba(155, 185, 85, 0.4)',
					position: EditorCommon.OverviewRulerLane.Full
				});

				if (lineChange.charChanges) {
					for (j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						charChange = lineChange.charChanges[j];
						if (isChangeOrInsert(charChange)) {
							if (ignoreTrimWhitespace) {
								for (lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
									if (lineNumber === charChange.modifiedStartLineNumber) {
										startColumn = charChange.modifiedStartColumn;
									} else {
										startColumn = modifiedModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.modifiedEndLineNumber) {
										endColumn = charChange.modifiedEndColumn;
									} else {
										endColumn = modifiedModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, 'char-insert', false));
								}
							} else {
								result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, 'char-insert', false));
							}
						}
					}
				}

			}
		}
		return result;
	}
}

class SideBySideViewZonesComputer extends ViewZonesComputer {

	constructor(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[]) {
		super(lineChanges, originalForeignVZ, modifiedForeignVZ);
	}

	_produceOriginalFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		if (lineChangeModifiedLength > lineChangeOriginalLength) {
			return {
				afterLineNumber: Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber),
				heightInLines: (lineChangeModifiedLength - lineChangeOriginalLength),
				domNode: null
			};
		}
		return null;
	}

	_produceModifiedFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		if (lineChangeOriginalLength > lineChangeModifiedLength) {
			return {
				afterLineNumber: Math.max(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber),
				heightInLines: (lineChangeOriginalLength - lineChangeModifiedLength),
				domNode: null
			};
		}
		return null;
	}
}

class DiffEdtorWidgetInline extends DiffEditorWidgetStyle implements IDiffEditorWidgetStyle {

	private toDispose:Lifecycle.IDisposable[];
	private decorationsLeft: number;

	constructor(dataSource:IDataSource, enableSplitViewResizing:boolean) {
		super(dataSource);

		this.decorationsLeft = 40;

		this.toDispose = [];
		this.toDispose.push(dataSource.getOriginalEditor().addListener2(EditorCommon.EventType.EditorLayout, (layoutInfo:EditorCommon.IEditorLayoutInfo) => {
			if (this.decorationsLeft !== layoutInfo.decorationsLeft) {
				this.decorationsLeft = layoutInfo.decorationsLeft;
				dataSource.relayoutEditors();
			}
		}));
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
	}

	public setEnableSplitViewResizing(enableSplitViewResizing:boolean): void {
		// Nothing to do..
	}

	_getViewZones(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorsZones {
		var computer = new InlineViewZonesComputer(lineChanges, originalForeignVZ, modifiedForeignVZ, originalEditor, modifiedEditor);
		return computer.getViewZones();
	}

	_getOriginalEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {
		var result:IEditorDiffDecorations = {
				decorations: [],
				overviewZones: []
			},
			i:number,
			length:number,
			lineChange:EditorCommon.ILineChange;

		for (i = 0, length = lineChanges.length; i < length; i++) {
			lineChange = lineChanges[i];

			// Add overview zones in the overview ruler
			if (isChangeOrDelete(lineChange)) {
				result.overviewZones.push({
					startLineNumber: lineChange.originalStartLineNumber,
					endLineNumber: lineChange.originalEndLineNumber,
					color: 'rgba(255, 0, 0, 0.4)',
					darkColor: 'rgba(255, 0, 0, 0.4)',
					position: EditorCommon.OverviewRulerLane.Full
				});
			}
		}

		return result;
	}

	_getModifiedEditorDecorations(lineChanges:EditorCommon.ILineChange[], ignoreTrimWhitespace:boolean, originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor): IEditorDiffDecorations {

		var result:IEditorDiffDecorations = {
				decorations: [],
				overviewZones: []
			},
			i:number,
			length:number,
			lineChange:EditorCommon.ILineChange,
			j:number,
			lengthJ:number,
			charChange: EditorCommon.ICharChange,
			lineNumber:number,
			startColumn:number,
			endColumn:number,
			modifiedModel = modifiedEditor.getModel();

		for (i = 0, length = lineChanges.length; i < length; i++) {
			lineChange = lineChanges[i];

			// Add decorations & overview zones
			if (isChangeOrInsert(lineChange)) {
				result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, 'line-insert', true));

				result.overviewZones.push({
					startLineNumber: lineChange.modifiedStartLineNumber,
					endLineNumber: lineChange.modifiedEndLineNumber,
					color: 'rgba(155, 185, 85, 0.4)',
					darkColor: 'rgba(155, 185, 85, 0.4)',
					position: EditorCommon.OverviewRulerLane.Full
				});

				if (lineChange.charChanges) {
					for (j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
						charChange = lineChange.charChanges[j];
						if (isChangeOrInsert(charChange)) {
							if (ignoreTrimWhitespace) {
								for (lineNumber = charChange.modifiedStartLineNumber; lineNumber <= charChange.modifiedEndLineNumber; lineNumber++) {
									if (lineNumber === charChange.modifiedStartLineNumber) {
										startColumn = charChange.modifiedStartColumn;
									} else {
										startColumn = modifiedModel.getLineFirstNonWhitespaceColumn(lineNumber);
									}
									if (lineNumber === charChange.modifiedEndLineNumber) {
										endColumn = charChange.modifiedEndColumn;
									} else {
										endColumn = modifiedModel.getLineLastNonWhitespaceColumn(lineNumber);
									}
									result.decorations.push(createDecoration(lineNumber, startColumn, lineNumber, endColumn, 'char-insert', false));
								}
							} else {
								result.decorations.push(createDecoration(charChange.modifiedStartLineNumber, charChange.modifiedStartColumn, charChange.modifiedEndLineNumber, charChange.modifiedEndColumn, 'char-insert', false));
							}
						}
					}
				} else {
					result.decorations.push(createDecoration(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber, Number.MAX_VALUE, 'char-insert', true));
				}
			}
		}

		return result;
	}

	public layout(): number {
		// An editor should not be smaller than 5px
		return Math.max(5, this.decorationsLeft);
	}

}

class InlineViewZonesComputer extends ViewZonesComputer {

	private originalModel:EditorCommon.IModel;
	private modifiedEditorConfiguration:EditorCommon.IInternalEditorOptions;
	private modifiedEditorIndentation:EditorCommon.IInternalIndentationOptions;

	constructor(lineChanges:EditorCommon.ILineChange[], originalForeignVZ:EditorCommon.IEditorWhitespace[], modifiedForeignVZ:EditorCommon.IEditorWhitespace[], originalEditor:EditorBrowser.ICodeEditor, modifiedEditor:EditorBrowser.ICodeEditor) {
		super(lineChanges, originalForeignVZ, modifiedForeignVZ);
		this.originalModel = originalEditor.getModel();
		this.modifiedEditorConfiguration = modifiedEditor.getConfiguration();
		this.modifiedEditorIndentation = modifiedEditor.getIndentationOptions();
	}

	_produceOriginalFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		return {
			afterLineNumber:Math.max(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber),
			heightInLines: lineChangeModifiedLength,
			domNode: document.createElement('div')
		};
	}

	_produceModifiedFromDiff(lineChange:EditorCommon.ILineChange, lineChangeOriginalLength:number, lineChangeModifiedLength:number): IMyViewZone {
		var decorations:EditorCommon.IModelDecoration[] = [],
			j:number,
			lengthJ:number,
			charChange:EditorCommon.ICharChange,
			tempDecoration:EditorCommon.IModelDecoration;

		if (lineChange.charChanges) {
			for (j = 0, lengthJ = lineChange.charChanges.length; j < lengthJ; j++) {
				charChange = lineChange.charChanges[j];
				if (isChangeOrDelete(charChange)) {
					tempDecoration = <any>createDecoration(charChange.originalStartLineNumber, charChange.originalStartColumn, charChange.originalEndLineNumber, charChange.originalEndColumn, 'char-delete', false);
					tempDecoration.options.inlineClassName = tempDecoration.options.className;
					decorations.push(tempDecoration);
				}
			}
		}

		var html: string[] = [],
			lineNumber: number;
		for (lineNumber = lineChange.originalStartLineNumber; lineNumber <= lineChange.originalEndLineNumber; lineNumber++) {
			html = html.concat(this.renderOriginalLine(lineNumber - lineChange.originalStartLineNumber, this.originalModel, this.modifiedEditorConfiguration, this.modifiedEditorIndentation, lineNumber, decorations));
		}

		var domNode = document.createElement('div');
		domNode.className = 'view-lines line-delete';
		domNode.innerHTML = html.join('');

		return {
			shouldNotShrink: true,
			afterLineNumber: (lineChange.modifiedEndLineNumber === 0 ? lineChange.modifiedStartLineNumber : lineChange.modifiedStartLineNumber - 1),
			heightInLines: lineChangeOriginalLength,
			domNode: domNode
		};
	}

	private renderOriginalLine(count:number, originalModel:EditorCommon.IModel, config:EditorCommon.IInternalEditorOptions, indentation:EditorCommon.IInternalIndentationOptions, lineNumber:number, decorations:EditorCommon.IModelDecoration[]): string[] {
		var lineContent = originalModel.getLineContent(lineNumber),
			lineTokens:EditorCommon.IViewLineTokens,
			parts:ViewLineParts.ILineParts;

		lineTokens = {
			getTokens: () => {
				return [{ startIndex: 0, type: '' }];
			},
			getFauxIndentLength: () => {
				return 0;
			},
			getTextLength: () => {
				return lineContent.length;
			},
			equals: (other:EditorCommon.IViewLineTokens) => {
				return false;
			},
			findIndexOfOffset: (offset:number) => {
				return 0;
			}
		};

		parts = ViewLineParts.createLineParts(lineNumber, lineContent, lineTokens, decorations, config.renderWhitespace);

		var r = ViewLine.renderLine({
			lineContent: lineContent,
			tabSize: indentation.tabSize,
			stopRenderingLineAfter: config.stopRenderingLineAfter,
			renderWhitespace: config.renderWhitespace,
			parts: parts.getParts()
		});

		var myResult:string[] = [];


		myResult.push('<div class="view-line');
		if (decorations.length === 0) {
			// No char changes
			myResult.push(' char-delete');
		}
		myResult.push('" style="top:');
		myResult.push(String(count * config.lineHeight));
		myResult.push('px;width:1000000px;">');
		myResult = myResult.concat(r.output);
		myResult.push('</div>');

		return myResult;
	}
}

function isChangeOrInsert(lineChange:EditorCommon.IChange): boolean {
	return lineChange.modifiedEndLineNumber > 0;
}

function isChangeOrDelete(lineChange:EditorCommon.IChange): boolean {
	return lineChange.originalEndLineNumber > 0;
}

function createDecoration(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number, className:string, isWholeLine:boolean): EditorCommon.IModelDeltaDecoration {
	return {
		range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
		options: {
			className: className,
			isWholeLine: isWholeLine
		}
	};
}

function createFakeLinesDiv(): HTMLElement {
	var r = document.createElement('div');
	r.className = 'diagonal-fill';
	return r;
}
