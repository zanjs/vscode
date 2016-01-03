/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./contentWidgets';
import DomUtils = require('vs/base/browser/dom');

import {ViewPart} from 'vs/editor/browser/view/viewPart';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

interface IWidgetData {
	allowEditorOverflow: boolean;
	widget: EditorBrowser.IContentWidget;
	position: EditorCommon.IPosition;
	preference: EditorBrowser.ContentWidgetPositionPreference[];
	isVisible: boolean;
}

interface IWidgetMap {
	[key:string]: IWidgetData;
}

interface IBoxLayoutResult {
	aboveTop:number;
	fitsAbove:boolean;
	belowTop:number;
	fitsBelow:boolean;
	left:number;
}

interface IMyWidgetRenderData {
	top:number;
	left:number;
}

interface IMyRenderData {
	[id:string]:IMyWidgetRenderData;
}

export class ViewContentWidgets extends ViewPart {

	private _widgets:IWidgetMap;
	private _contentWidth:number;
	private _contentLeft: number;

	public domNode:HTMLElement;
	private _viewDomNode: HTMLElement;

	constructor(context:EditorBrowser.IViewContext, viewDomNode:HTMLElement) {
		super(context);
		this._viewDomNode = viewDomNode;

		this._widgets = {};
		this._contentWidth = 0;
		this._contentLeft = 0;

		this.domNode = document.createElement('div');
		this.domNode.className = EditorBrowser.ClassNames.CONTENT_WIDGETS;
	}

	public dispose(): void {
		super.dispose();
		this._widgets = null;
		this.domNode = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		return true;
	}
	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return e.inlineDecorationsChanged;
	}
	public onModelLinesDeleted(e:EditorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e:EditorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:EditorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e:EditorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		return true;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this._contentWidth = layoutInfo.contentWidth;
		this._contentLeft = layoutInfo.contentLeft;

		this._requestModificationFrameBeforeRendering(() => {
			// update the maxWidth on widgets nodes, such that `onReadAfterForcedLayout`
			// below can read out the adjusted width/height of widgets
			var widgetId:string;
			for (widgetId in this._widgets) {
				if (this._widgets.hasOwnProperty(widgetId)) {
					DomUtils.StyleMutator.setMaxWidth(this._widgets[widgetId].widget.getDomNode(), this._contentWidth);
				}
			}
		});

		return true;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return false;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}

	// ---- end view event handlers

	public addWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetData: IWidgetData = {
			allowEditorOverflow: widget.allowEditorOverflow || false,
			widget: widget,
			position: null,
			preference: null,
			isVisible: false
		};
		this._widgets[widget.getId()] = widgetData;

		var domNode = widget.getDomNode();
		domNode.style.position = 'absolute';
		DomUtils.StyleMutator.setMaxWidth(domNode, this._contentWidth);
		DomUtils.StyleMutator.setVisibility(domNode, 'hidden');
		domNode.setAttribute('widgetId', widget.getId());

		if (widgetData.allowEditorOverflow) {
			this._viewDomNode.appendChild(domNode);
		} else {
			this.domNode.appendChild(domNode);
		}

		this.shouldRender = true;
	}

	public setWidgetPosition(widget: EditorBrowser.IContentWidget, position: EditorCommon.IPosition, preference:EditorBrowser.ContentWidgetPositionPreference[]): void {
		var widgetData = this._widgets[widget.getId()];
		widgetData.position = position;
		widgetData.preference = preference;
		this.shouldRender = true;
	}

	public removeWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this._widgets.hasOwnProperty(widgetId)) {
			var widgetData = this._widgets[widgetId];
			delete this._widgets[widgetId];

			var domNode = widgetData.widget.getDomNode();
			domNode.parentNode.removeChild(domNode);
			domNode.removeAttribute('monaco-visible-content-widget');

			this.shouldRender = true;
		}
	}

	private _layoutBoxInViewport(position:EditorCommon.IEditorPosition, domNode:HTMLElement, ctx:EditorBrowser.IRenderingContext): IBoxLayoutResult {

		var visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		var width = domNode.clientWidth;
		var height = domNode.clientHeight;

		// Our visible box is split horizontally by the current line => 2 boxes

		// a) the box above the line
		var aboveLineTop = visibleRange.top;
		var heightAboveLine = aboveLineTop;

		// b) the box under the line
		var underLineTop = visibleRange.top + visibleRange.height;
		var heightUnderLine = ctx.viewportHeight - underLineTop;

		var aboveTop = aboveLineTop - height;
		var fitsAbove = (heightAboveLine >= height);
		var belowTop = underLineTop;
		var fitsBelow = (heightUnderLine >= height);

		// And its left
		var actualLeft = visibleRange.left;
		if (actualLeft + width > ctx.viewportLeft + ctx.viewportWidth) {
			actualLeft = ctx.viewportLeft + ctx.viewportWidth - width;
		}
		if (actualLeft < ctx.viewportLeft) {
			actualLeft = ctx.viewportLeft;
		}

		return {
			aboveTop: aboveTop,
			fitsAbove: fitsAbove,
			belowTop: belowTop,
			fitsBelow: fitsBelow,
			left: actualLeft
		};
	}

	private _layoutBoxInPage(position: EditorCommon.IEditorPosition, domNode: HTMLElement, ctx: EditorBrowser.IRenderingContext): IBoxLayoutResult {
		var visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		var left = visibleRange.left - ctx.viewportLeft;
		if (left < 0 || left > this._contentWidth) {
			return null;
		}

		var width = domNode.clientWidth,
			height = domNode.clientHeight;

		var aboveTop = visibleRange.top - height,
			belowTop = visibleRange.top + visibleRange.height,
			left = left + this._contentLeft;

		var domNodePosition = DomUtils.getDomNodePosition(this._viewDomNode);
		var absoluteAboveTop = domNodePosition.top + aboveTop - document.body.scrollTop - document.documentElement.scrollTop,
			absoluteBelowTop = domNodePosition.top + belowTop - document.body.scrollTop - document.documentElement.scrollTop,
			absoluteLeft = domNodePosition.left + left - document.body.scrollLeft - document.documentElement.scrollLeft;

		var INNER_WIDTH = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
			INNER_HEIGHT = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

		// Leave some clearance to the bottom
		var BOTTOM_PADDING = 22;

		var fitsAbove = (absoluteAboveTop >= 0),
			fitsBelow = (absoluteBelowTop + height <= INNER_HEIGHT - BOTTOM_PADDING);

		if (absoluteLeft + width + 20 > INNER_WIDTH) {
			var delta = absoluteLeft - (INNER_WIDTH - width - 20);
			absoluteLeft -= delta;
			left -= delta;
		}
		if (absoluteLeft < 0) {
			var delta = absoluteLeft;
			absoluteLeft -= delta;
			left -= delta;
		}

		return {
			aboveTop: aboveTop,
			fitsAbove: fitsAbove,
			belowTop: belowTop,
			fitsBelow: fitsBelow,
			left: left
		};
	}

	private _prepareRenderWidgetAtExactPosition(position:EditorCommon.IEditorPosition, ctx:EditorBrowser.IRenderingContext): IMyWidgetRenderData {
		var visibleRange = ctx.visibleRangeForPosition(position);

		if (!visibleRange) {
			return null;
		}

		return {
			top: visibleRange.top,
			left: visibleRange.left
		};
	}

	private _prepareRenderWidget(widgetData:IWidgetData, ctx:EditorBrowser.IRenderingContext): IMyWidgetRenderData {
		if (!widgetData.position || !widgetData.preference) {
			return null;
		}

		// Do not trust that widgets have a valid position
		var validModelPosition = this._context.model.validateModelPosition(widgetData.position),
			position = this._context.model.convertModelPositionToViewPosition(validModelPosition.lineNumber, validModelPosition.column),
			pref:EditorBrowser.ContentWidgetPositionPreference,
			pass:number,
			i:number;

		var placement: IBoxLayoutResult = null;
		var fetchPlacement = () => {
			if (placement) {
				return;
			}

			var domNode = widgetData.widget.getDomNode();
			if (widgetData.allowEditorOverflow) {
				placement = this._layoutBoxInPage(position, domNode, ctx);
			} else {
				placement = this._layoutBoxInViewport(position, domNode, ctx);
			}
		};

		// Do two passes, first for perfect fit, second picks first option
		for (pass = 1; pass <= 2; pass++) {
			for (i = 0; i < widgetData.preference.length; i++) {
				pref = widgetData.preference[i];
				if (pref === EditorBrowser.ContentWidgetPositionPreference.ABOVE) {
					fetchPlacement();
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsAbove) {
						return {
							top: placement.aboveTop,
							left: placement.left
						};
					}
				} else if (pref === EditorBrowser.ContentWidgetPositionPreference.BELOW) {
					fetchPlacement();
					if (!placement) {
						// Widget outside of viewport
						return null;
					}
					if (pass === 2 || placement.fitsBelow) {
						return {
							top: placement.belowTop,
							left: placement.left
						};
					}
				} else {
					return this._prepareRenderWidgetAtExactPosition(position, ctx);
				}
			}
		}
	}

	_render(ctx:EditorBrowser.IRenderingContext): void {
		var data:IMyRenderData = {},
			renderData: IMyWidgetRenderData,
			widgetId: string;

		for (widgetId in this._widgets) {
			if (this._widgets.hasOwnProperty(widgetId)) {
				renderData = this._prepareRenderWidget(this._widgets[widgetId], ctx);
				if (renderData) {
					data[widgetId] = renderData;
				}
			}
		}

		this._requestModificationFrame(() => {
			var widgetId:string,
				widget:IWidgetData,
				domNode: HTMLElement;

			for (widgetId in this._widgets) {
				if (this._widgets.hasOwnProperty(widgetId)) {
					widget = this._widgets[widgetId];
					domNode = this._widgets[widgetId].widget.getDomNode();

					if (data.hasOwnProperty(widgetId)) {
						if (widget.allowEditorOverflow) {
							DomUtils.StyleMutator.setTop(domNode, data[widgetId].top);
							DomUtils.StyleMutator.setLeft(domNode, data[widgetId].left);
						} else {
							DomUtils.StyleMutator.setTop(domNode, data[widgetId].top + ctx.viewportTop - ctx.bigNumbersDelta);
							DomUtils.StyleMutator.setLeft(domNode, data[widgetId].left);
						}
						if (!widget.isVisible) {
							DomUtils.StyleMutator.setVisibility(domNode, 'inherit');
							domNode.setAttribute('monaco-visible-content-widget', 'true');
							widget.isVisible = true;
						}
					} else {
						if (widget.isVisible) {
							domNode.removeAttribute('monaco-visible-content-widget');
							widget.isVisible = false;
							DomUtils.StyleMutator.setVisibility(domNode, 'hidden');
						}
					}
				}
			}
		});
	}
}
