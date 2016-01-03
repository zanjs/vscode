/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Actions = require('vs/base/common/actions');
import EditorCommon = require('vs/editor/common/editorCommon');
import EventEmitter = require('vs/base/common/eventEmitter');
import Lifecycle = require('vs/base/common/lifecycle');
import DomUtils = require('vs/base/browser/dom');
import Mouse = require('vs/base/browser/mouseEvent');

import Instantiation = require('vs/platform/instantiation/common/instantiation');

export interface IDynamicViewOverlay extends Lifecycle.IDisposable {
	shouldCallRender2(ctx:IRenderingContext): boolean;
	render2(lineNumber:number): string[];
}

export interface IContentWidgetData {
	widget: IContentWidget;
	position: IContentWidgetPosition;
}

export interface IOverlayWidgetData {
	widget: IOverlayWidget;
	position: IOverlayWidgetPosition;
}

export interface ICodeEditorHelper {
	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;
	getScrollHeight(): number;
	getScrollWidth(): number;
	getVerticalOffsetForPosition(lineNumber:number, column:number): number;
	delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void;
	getOffsetForColumn(lineNumber:number, column:number): number;
}

export interface IKeyboardHandlerHelper {
	viewDomNode:HTMLElement;
	textArea:HTMLTextAreaElement;
	visibleRangeForPositionRelativeToEditor(lineNumber:number, column:number): IVisibleRange;
}

export interface IPointerHandlerHelper {
	viewDomNode:HTMLElement;
	linesContentDomNode:HTMLElement;

	focusTextArea(): void;
	isDirty(): boolean;

	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;

	isAfterLines(verticalOffset:number): boolean;
	getLineNumberAtVerticalOffset(verticalOffset: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
	getWhitespaceAtVerticalOffset(verticalOffset:number): EditorCommon.IViewWhitespaceViewportData;
	shouldSuppressMouseDownOnViewZone(viewZoneId:number): boolean;

	/**
	 * Decode an Editor.IPosition from a rendered dom node
	 */
	getPositionFromDOMInfo(spanNode:HTMLElement, offset:number): EditorCommon.IPosition;

	visibleRangeForPosition2(lineNumber:number, column:number): IVisibleRange;
	getLineWidth(lineNumber:number): number;
}

export interface IView extends Lifecycle.IDisposable {
	domNode: HTMLElement;

	getInternalEventBus(): EventEmitter.IEventEmitter;

	createOverviewRuler(cssClassName:string, minimumHeight:number, maximumHeight:number): IOverviewRuler;
	getCodeEditorHelper(): ICodeEditorHelper;

	getCenteredRangeInViewport(): EditorCommon.IEditorRange;

	change(callback:(changeAccessor:IViewZoneChangeAccessor) => any): boolean;
	getWhitespaces(): EditorCommon.IEditorWhitespace[];
	renderOnce(callback:() => any): any;

	render(): void;

	focus(): void;
	isFocused(): boolean;

	saveState(): EditorCommon.IViewState;
	restoreState(state:EditorCommon.IViewState): void;

	addContentWidget(widgetData: IContentWidgetData): void;
	layoutContentWidget(widgetData: IContentWidgetData): void;
	removeContentWidget(widgetData: IContentWidgetData): void;

	addOverlayWidget(widgetData: IOverlayWidgetData): void;
	layoutOverlayWidget(widgetData: IOverlayWidgetData): void;
	removeOverlayWidget(widgetData: IOverlayWidgetData): void;
}

export interface IViewZoneData {
	viewZoneId: number;
	positionBefore:EditorCommon.IEditorPosition;
	positionAfter:EditorCommon.IEditorPosition;
	position: EditorCommon.IEditorPosition;
	afterLineNumber: number;
}

export interface IViewController {
	paste(source:string, text:string, pasteOnNewLine:boolean): void;
	type(source: string, text: string): void;
	replacePreviousChar(source: string, text: string): void;
	cut(source:string): void;
	moveTo(source:string, lineNumber:number, column:number): void;
	moveToSelect(source:string, lineNumber:number, column:number): void;
	createCursor(source:string, lineNumber:number, column:number, wholeLine:boolean): void;
	lastCursorMoveToSelect(source:string, lineNumber:number, column:number): void;
	wordSelect(source:string, lineNumber:number, column:number, preference:string): void;
	wordSelectDrag(source:string, lineNumber:number, column:number, preference:string): void;
	lastCursorWordSelect(source:string, lineNumber:number, column:number, preference:string): void;
	lineSelect(source:string, lineNumber:number, column:number): void;
	lineSelectDrag(source:string, lineNumber:number, column:number): void;
	lastCursorLineSelect(source:string, lineNumber:number, column:number): void;
	lastCursorLineSelectDrag(source:string, lineNumber:number, column:number): void;
	selectAll(source:string): void;

	emitKeyDown(e:DomUtils.IKeyboardEvent): void;
	emitKeyUp(e:DomUtils.IKeyboardEvent): void;
	emitContextMenu(e:IMouseEvent): void;
	emitMouseMove(e:IMouseEvent): void;
	emitMouseLeave(e:IMouseEvent): void;
	emitMouseUp(e:IMouseEvent): void;
	emitMouseDown(e:IMouseEvent): void;
}

export var ClassNames = {
	TEXTAREA_COVER: 'textAreaCover',
	TEXTAREA: 'inputarea',
	LINES_CONTENT: 'lines-content',
	OVERFLOW_GUARD: 'overflow-guard',
	VIEW_LINES: 'view-lines',
	VIEW_LINE: 'view-line',
	SCROLLABLE_ELEMENT: 'editor-scrollable',
	CONTENT_WIDGETS: 'contentWidgets',
	OVERLAY_WIDGETS: 'overlayWidgets',
	MARGIN_VIEW_OVERLAYS: 'margin-view-overlays',
	LINE_NUMBERS: 'line-numbers',
	GLYPH_MARGIN: 'glyph-margin',
	SCROLL_DECORATION: 'scroll-decoration',
	VIEW_CURSORS_LAYER: 'cursors-layer',
	VIEW_ZONES: 'view-zones'
};

export interface IVisibleRange {
	top:number;
	left:number;
	width:number;
	height:number;
}

export interface IRestrictedRenderingContext {
	linesViewportData:EditorCommon.IViewLinesViewportData;

	scrollWidth:number;
	scrollHeight:number;

	visibleRange:EditorCommon.IEditorRange;
	bigNumbersDelta:number;

	viewportTop:number;
	viewportWidth:number;
	viewportHeight:number;
	viewportLeft:number;

	getScrolledTopFromAbsoluteTop(absoluteTop:number): number;
	getViewportVerticalOffsetForLineNumber(lineNumber:number): number;
	lineIsVisible(lineNumber:number): boolean;

	getDecorationsInViewport(): EditorCommon.IModelDecoration[];
}

export interface IHorizontalRange {
	left:number;
	width:number;
}

export interface ILineVisibleRanges {
	lineNumber: number;
	ranges: IHorizontalRange[];
}

export interface IRenderingContext extends IRestrictedRenderingContext {

	heightInPxForLine(lineNumber:number): number;

	visibleRangesForRange(range:EditorCommon.IRange, includeNewLines:boolean): IVisibleRange[];

	linesVisibleRangesForRange(range:EditorCommon.IRange, includeNewLines:boolean): ILineVisibleRanges[];

	visibleRangeForPosition(position:EditorCommon.IPosition): IVisibleRange;
	visibleRangeForPosition2(lineNumber:number, column:number): IVisibleRange;
}

export interface IViewEventHandler {
	handleEvents(events:EventEmitter.IEmitterEvent[]): void;
}

export interface IViewportInfo {
	visibleRange: EditorCommon.IEditorRange;
	width:number;
	height:number;
	deltaTop:number;
	deltaLeft:number;
}

export interface IViewPart extends Lifecycle.IDisposable {
	onBeforeForcedLayout(): void;
	onReadAfterForcedLayout(ctx:IRenderingContext): void;
	onWriteAfterForcedLayout(): void;
}

// --- end View Event Handlers & Parts

export interface IViewContext {

	addEventHandler(eventHandler:IViewEventHandler): void;
	removeEventHandler(eventHandler:IViewEventHandler): void;

	configuration:EditorCommon.IConfiguration;
	model: EditorCommon.IViewModel;
	privateViewEventBus:EditorCommon.IViewEventBus;
}

export interface ILayoutProvider extends IVerticalLayoutProvider, IScrollingProvider {

	dispose():void;

	getCenteredViewLineNumberInViewport(): number;

	getCurrentViewport(): EditorCommon.IViewport;

	onMaxLineWidthChanged(width:number): void;

	saveState(): EditorCommon.IViewState;
	restoreState(state:EditorCommon.IViewState): void;
}

export interface IScrollingProvider {

	getOverviewRulerInsertData(): { parent: HTMLElement; insertBefore: HTMLElement; };
	getScrollbarContainerDomNode(): HTMLElement;
	delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void;

	// This is for the glyphs, line numbers, etc.
	getScrolledTopFromAbsoluteTop(top:number): number;

	getScrollHeight(): number;
	getScrollWidth(): number;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;
	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
}

export interface IVerticalLayoutProvider {

	/**
	 * Compute vertical offset (top) of line number
	 */
	getVerticalOffsetForLineNumber(lineNumber:number): number;

	/**
	 * Returns the height in pixels for `lineNumber`.
	 */
	heightInPxForLine(lineNumber:number): number;

	/**
	 * Return line number at `verticalOffset` or closest line number
	 */
	getLineNumberAtVerticalOffset(verticalOffset:number): number;

	/**
	 * Compute content height (including one extra scroll page if necessary)
	 */
	getTotalHeight(): number;

	/**
	 * Compute the lines that need to be rendered in the current viewport position.
	 */
	getLinesViewportData(): EditorCommon.IViewLinesViewportData;
}

/**
 * A view zone is a full horizontal rectangle that 'pushes' text down.
 * The editor reserves space for view zones when rendering.
 */
export interface IViewZone {
	/**
	 * The line number after which this zone should appear.
	 * Use 0 to place a view zone before the first line number.
	 */
	afterLineNumber:number;
	/**
	 * The column after which this zone should appear.
	 * If not set, the maxLineColumn of `afterLineNumber` will be used.
	 */
	afterColumn?:number;
	/**
	 * Suppress mouse down events.
	 * If set, the editor will attach a mouse down listener to the view zone and .preventDefault on it.
	 * Defaults to false
	 */
	suppressMouseDown?:boolean;
	/**
	 * The height in lines of the view zone.
	 * If specified, `heightInPx` will be used instead of this.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInLines?:number;
	/**
	 * The height in px of the view zone.
	 * If this is set, the editor will give preference to it rather than `heightInLines` above.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInPx?: number;
	/**
	 * The dom node of the view zone
	 */
	domNode:HTMLElement;
	/**
	 * Callback which gives the relative top of the view zone as it appears (taking scrolling into account).
	 */
	onDomNodeTop?:(top: number) =>void;
	/**
	 * Callback which gives the height in pixels of the view zone.
	 */
	onComputedHeight?:(height: number) =>void;
}
/**
 * An accessor that allows for zones to be added or removed.
 */
export interface IViewZoneChangeAccessor {
	/**
	 * Create a new view zone.
	 * @param zone Zone to create
	 * @return A unique identifier to the view zone.
	 */
	addZone(zone: IViewZone): number;
	/**
	 * Remove a zone
	 * @param id A unique identifier to the view zone, as returned by the `addZone` call.
	 */
	removeZone(id: number): void;
	/**
	 * Change a zone's position.
	 * The editor will rescan the `afterLineNumber` and `afterColumn` properties of a view zone.
	 */
	layoutZone(id: number): void;
}

/**
 * A positioning preference for rendering content widgets.
 */
export enum ContentWidgetPositionPreference {
	/**
	 * Place the content widget exactly at a position
	 */
	EXACT,
	/**
	 * Place the content widget above a position
	 */
	ABOVE,
	/**
	 * Place the content widget below a position
	 */
	BELOW
}
/**
 * A position for rendering content widgets.
 */
export interface IContentWidgetPosition {
	/**
	 * Desired position for the content widget.
	 * `preference` will also affect the placement.
	 */
	position: EditorCommon.IPosition;
	/**
	 * Placement preference for position, in order of preference.
	 */
	preference: ContentWidgetPositionPreference[];
}
/**
 * A content widget renders inline with the text and can be easily placed 'near' an editor position.
 */
export interface IContentWidget {
	/**
	 * Render this content widget in a location where it could overflow the editor's view dom node.
	 */
	allowEditorOverflow?: boolean;
	/**
	 * Get a unique identifier of the content widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the content widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the content widget.
	 * If null is returned, the content widget will be placed off screen.
	 */
	getPosition(): IContentWidgetPosition;
}

/**
 * A positioning preference for rendering overlay widgets.
 */
export enum OverlayWidgetPositionPreference {
	/**
	 * Position the overlay widget in the top right corner
	 */
	TOP_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the bottom right corner
	 */
	BOTTOM_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the top center
	 */
	TOP_CENTER
}
/**
 * A position for rendering overlay widgets.
 */
export interface IOverlayWidgetPosition {
	/**
	 * The position preference for the overlay widget.
	 */
	preference: OverlayWidgetPositionPreference;
}
/**
 * An overlay widgets renders on top of the text.
 */
export interface IOverlayWidget {
	/**
	 * Get a unique identifier of the overlay widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the overlay widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the overlay widget.
	 * If null is returned, the overlay widget is responsible to place itself.
	 */
	getPosition(): IOverlayWidgetPosition;
}

/**
 * Target hit with the mouse in the editor.
 */
export interface IMouseTarget {
	/**
	 * The target element
	 */
	element: Element;
	/**
	 * The target type
	 */
	type: EditorCommon.MouseTargetType;
	/**
	 * The 'approximate' editor position
	 */
	position: EditorCommon.IEditorPosition;
	/**
	 * The 'approximate' editor range
	 */
	range: EditorCommon.IEditorRange;
	/**
	 * Some extra detail.
	 */
	detail: any;
}
/**
 * A mouse event originating from the editor.
 */
export interface IMouseEvent {
	event: Mouse.IMouseEvent;
	target: IMouseTarget;
}

export type ISimpleEditorContributionCtor = Instantiation.IConstructorSignature1<ICodeEditor, EditorCommon.IEditorContribution> | Instantiation.INewConstructorSignature1<ICodeEditor, EditorCommon.IEditorContribution>;

/**
 * An editor contribution descriptor that will be used to construct editor contributions
 */
export interface IEditorContributionDescriptor {
	/**
	 * Create an instance of the contribution
	 */
	createInstance(instantiationService:Instantiation.IInstantiationService, editor:ICodeEditor): EditorCommon.IEditorContribution;
}

/**
 * A zone in the overview ruler
 */
export interface IOverviewRulerZone {
	startLineNumber: number;
	endLineNumber: number;
	forceHeight?: number;
	color: string;
	darkColor: string;
	position: EditorCommon.OverviewRulerLane;
}
/**
 * An overview ruler
 */
export interface IOverviewRuler {
	getDomNode(): HTMLElement;
	dispose(): void;
	setZones(zones:IOverviewRulerZone[]): void;
	setLayout(position:EditorCommon.IOverviewRulerPosition): void;
}
/**
 * A rich code editor.
 */
export interface ICodeEditor extends EditorCommon.ICommonCodeEditor {

	/**
	 * Returns the editor's dom node
	 */
	getDomNode(): HTMLElement;

	/**
	 * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addContentWidget(widget: IContentWidget): void;
	/**
	 * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutContentWidget(widget: IContentWidget): void;
	/**
	 * Remove a content widget.
	 */
	removeContentWidget(widget: IContentWidget): void;

	/**
	 * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Remove an overlay widget.
	 */
	removeOverlayWidget(widget: IOverlayWidget): void;

	/**
	 * Change the view zones. View zones are lost when a new model is attached to the editor.
	 */
	changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;
}

/**
 * A rich diff editor.
 */
export interface IDiffEditor extends EditorCommon.ICommonDiffEditor {
	/**
	 * @see ICodeEditor.getDomNode
	 */
	getDomNode(): HTMLElement;
}
