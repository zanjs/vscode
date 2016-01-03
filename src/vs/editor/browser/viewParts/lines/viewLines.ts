/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Browser = require('vs/base/browser/browser');
import DomUtils = require('vs/base/browser/dom');
import Schedulers = require('vs/base/common/async');

import {createLine, IViewLineData} from 'vs/editor/browser/viewParts/lines/viewLine';
import {IVisibleLineData, ViewLayer} from 'vs/editor/browser/view/viewLayer';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';

export class ViewLines extends ViewLayer {

	/**
	 * Width to extends a line to render the line feed at the end of the line
	 */
	private static LINE_FEED_WIDTH = 10;

	/**
	 * Adds this ammount of pixels to the right of lines (no-one wants to type near the edge of the viewport)
	 */
	private static HORIZONTAL_EXTRA_PX = 30;

	private _layoutProvider:EditorBrowser.ILayoutProvider;
	_lines:IViewLineData[];

	public textRangeRestingSpot:HTMLElement;

	// --- width
	private _maxLineWidth: number;
	private _asyncUpdateLineWidths: Schedulers.RunOnceScheduler;

	private _currentVisibleRange: EditorCommon.IEditorRange;

	private _lastCursorRevealRangeHorizontallyEvent:EditorCommon.IViewRevealRangeEvent;
	private _bigNumbersDelta: number;

	constructor(context:EditorBrowser.IViewContext, layoutProvider:EditorBrowser.ILayoutProvider) {
		super(context);
		this._layoutProvider = layoutProvider;
		this.domNode.className = EditorBrowser.ClassNames.VIEW_LINES;

		// --- width & height
		this._maxLineWidth = 0;
		this._asyncUpdateLineWidths = new Schedulers.RunOnceScheduler(() => {
			this._updateLineWidths();
		}, 200);

		this._currentVisibleRange = new Range(1, 1, 1, 1);
		this._bigNumbersDelta = 0;

		this._lastCursorRevealRangeHorizontallyEvent = null;
		this.textRangeRestingSpot = document.createElement('div');
		this.textRangeRestingSpot.className = 'textRangeRestingSpot';

		this._hasVerticalScroll = true;
		this._hasHorizontalScroll = true;
	}

	public dispose(): void {
		this._asyncUpdateLineWidths.dispose();
		this._layoutProvider = null;
		super.dispose();
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		var shouldRender = super.onConfigurationChanged(e);
		if (e.wrappingInfo) {
			this._maxLineWidth = 0;
		}
		return shouldRender;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		var shouldRender = super.onLayoutChanged(layoutInfo);
		this._maxLineWidth = 0;
		return shouldRender;
	}

	public onModelFlushed(): boolean {
		var shouldRender = super.onModelFlushed();
		this._maxLineWidth = 0;
		return shouldRender;
	}

	public onScrollWidthChanged(scrollWidth:number): boolean {
		DomUtils.StyleMutator.setWidth(this.domNode, scrollWidth);
		return false;
	}

	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		var shouldRender = super.onModelDecorationsChanged(e);
		for (var i = 0; i < this._lines.length; i++) {
			this._lines[i].onModelDecorationsChanged();
		}
		return shouldRender || true;
	}

	public onCursorRevealRange(e:EditorCommon.IViewRevealRangeEvent): boolean {
		var newScrollTop = this._computeScrollTopToRevealRange(this._layoutProvider.getCurrentViewport(), e.range, e.verticalType);

		if (e.revealHorizontal) {
			this._lastCursorRevealRangeHorizontallyEvent = e;
		}

		this._layoutProvider.setScrollTop(newScrollTop);

		return true;
	}

	public onCursorScrollRequest(e:EditorCommon.IViewScrollRequestEvent): boolean {
		let currentScrollTop = this._layoutProvider.getScrollTop();
		let newScrollTop = currentScrollTop + e.deltaLines * this._context.configuration.editor.lineHeight;
		this._layoutProvider.setScrollTop(newScrollTop);
		return true;
	}

	private _hasVerticalScroll = false;
	private _hasHorizontalScroll = false;
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this._hasVerticalScroll = this._hasVerticalScroll || e.vertical;
		this._hasHorizontalScroll = this._hasHorizontalScroll || e.horizontal;
		return super.onScrollChanged(e);
	}

	// ---- end view event handlers

	// ----------- HELPERS FOR OTHERS

	public getPositionFromDOMInfo(spanNode:HTMLElement, offset:number): EditorCommon.IPosition {
		var lineNumber = this._getLineNumberFromDOMInfo(spanNode);

		if (lineNumber === -1) {
			// Couldn't find span node
			return null;
		}

		if (lineNumber < 1 || lineNumber > this._context.model.getLineCount()) {
			// lineNumber is outside range
			return null;
		}

		if (this._context.model.getLineMaxColumn(lineNumber) === 1) {
			// Line is empty
			return {
				lineNumber: lineNumber,
				column: 1
			};
		}

		var lineIndex = lineNumber - this._rendLineNumberStart;
		if (lineIndex < 0 || lineIndex >= this._lines.length) {
			// Couldn't find line
			return null;
		}

		var column = this._lines[lineIndex].getColumnOfNodeOffset(lineNumber, spanNode, offset);
		var minColumn = this._context.model.getLineMinColumn(lineNumber);
		if (column < minColumn) {
			column = minColumn;
		}
		return {
			lineNumber: lineNumber,
			column: column
		};
	}

	private _getLineNumberFromDOMInfo(spanNode:HTMLElement): number {
		while (spanNode && spanNode.nodeType === 1) {
			if (spanNode.className === EditorBrowser.ClassNames.VIEW_LINE) {
				return parseInt(spanNode.getAttribute('lineNumber'), 10);
			}
			spanNode = spanNode.parentElement;
		}
		return -1;
	}

	public getLineWidth(lineNumber: number): number {
		var lineIndex = lineNumber - this._rendLineNumberStart;
		if (lineIndex < 0 || lineIndex >= this._lines.length) {
			return -1;
		}

		return this._lines[lineIndex].getWidth();
	}

	public linesVisibleRangesForRange(range:EditorCommon.IRange, includeNewLines:boolean): EditorBrowser.ILineVisibleRanges[] {
		if (this.shouldRender) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		var originalEndLineNumber = range.endLineNumber;
		range = Range.intersectRanges(range, this._currentVisibleRange);
		if (!range) {
			return null;
		}

		var visibleRangesForLine:EditorBrowser.IVisibleRange[],
			visibleRanges:EditorBrowser.ILineVisibleRanges[] = [],
			lineNumber:number,
			lineIndex:number,
			startColumn:number,
			endColumn:number;

		var boundingClientRect = this.domNode.getBoundingClientRect();
		var clientRectDeltaTop = boundingClientRect.top;
		var clientRectDeltaLeft = boundingClientRect.left;

		var currentLineModelLineNumber:number,
			nextLineModelLineNumber:number;

		if (includeNewLines) {
			nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
		}

		for (lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
			lineIndex = lineNumber - this._rendLineNumberStart;

			if (lineIndex < 0 || lineIndex >= this._lines.length) {
				continue;
			}

			startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			visibleRangesForLine = this._lines[lineIndex].getVisibleRangesForRange(lineNumber, startColumn, endColumn, clientRectDeltaTop, 0, clientRectDeltaLeft, this.textRangeRestingSpot);

			if (visibleRangesForLine && visibleRangesForLine.length > 0) {
				if (includeNewLines && lineNumber < originalEndLineNumber) {
					currentLineModelLineNumber = nextLineModelLineNumber;
					nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(lineNumber + 1, 1).lineNumber;

					if (currentLineModelLineNumber !== nextLineModelLineNumber) {
						visibleRangesForLine[visibleRangesForLine.length - 1].width += ViewLines.LINE_FEED_WIDTH;
					}
				}

				visibleRanges.push({
					lineNumber: lineNumber,
					ranges: visibleRangesForLine
				});
			}
		}

		if (visibleRanges.length === 0) {
			return null;
		}

		return visibleRanges;
	}

	public visibleRangesForRange2(range:EditorCommon.IRange, deltaTop:number, correctionTop:number, includeNewLines:boolean): EditorBrowser.IVisibleRange[] {

		if (this.shouldRender) {
			// Cannot read from the DOM because it is dirty
			// i.e. the model & the dom are out of sync, so I'd be reading something stale
			return null;
		}

		var originalEndLineNumber = range.endLineNumber;
		range = Range.intersectRanges(range, this._currentVisibleRange);
		if (!range) {
			return null;
		}

		var visibleRangesForLine:EditorBrowser.IVisibleRange[],
			visibleRanges:EditorBrowser.IVisibleRange[] = [],
			lineNumber:number,
			adjustedLineNumberVerticalOffset:number,
			lineIndex:number,
			startColumn:number,
			endColumn:number,
			lineHeight = this._context.configuration.editor.lineHeight;

		var boundingClientRect = this.domNode.getBoundingClientRect();
		var clientRectDeltaTop = boundingClientRect.top;
		var clientRectDeltaLeft = boundingClientRect.left;

		var currentLineModelLineNumber:number,
			nextLineModelLineNumber:number;

		if (includeNewLines) {
			nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
		}

		for (lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
			lineIndex = lineNumber - this._rendLineNumberStart;

			if (lineIndex < 0 || lineIndex >= this._lines.length) {
				continue;
			}

			startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
			endColumn = lineNumber === range.endLineNumber ? range.endColumn : this._context.model.getLineMaxColumn(lineNumber);
			visibleRangesForLine = this._lines[lineIndex].getVisibleRangesForRange(lineNumber, startColumn, endColumn, clientRectDeltaTop, correctionTop, clientRectDeltaLeft, this.textRangeRestingSpot);


			if (visibleRangesForLine && visibleRangesForLine.length > 0) {
				adjustedLineNumberVerticalOffset = this._layoutProvider.getVerticalOffsetForLineNumber(lineNumber) - this._bigNumbersDelta + deltaTop;
				for (var i = 0, len = visibleRangesForLine.length; i < len; i++) {
					// Ranges must be positioned at lineHeight increments
					// (overcome WebKit Range.getClientRects() rounding to integers)
					visibleRangesForLine[i].top = adjustedLineNumberVerticalOffset;
					visibleRangesForLine[i].height = lineHeight;
				}
				if (includeNewLines && lineNumber < originalEndLineNumber) {
					currentLineModelLineNumber = nextLineModelLineNumber;
					nextLineModelLineNumber = this._context.model.convertViewPositionToModelPosition(lineNumber + 1, 1).lineNumber;

					if (currentLineModelLineNumber !== nextLineModelLineNumber) {
						visibleRangesForLine[visibleRangesForLine.length - 1].width += ViewLines.LINE_FEED_WIDTH;
					}
				}

				visibleRanges = visibleRanges.concat(visibleRangesForLine);
			}
		}

		if (visibleRanges.length === 0) {
			return null;
		}

		return visibleRanges;
	}

	// --- implementation

	_createLine(): IVisibleLineData {
		return createLine(this._context);
	}

	private _renderAndUpdateLineHeights(linesViewportData: EditorCommon.IViewLinesViewportData): void {
		super._renderLines(linesViewportData);

		// Update internal current visible range
		this._currentVisibleRange = new Range(
			0 + this._rendLineNumberStart,
			1,
			this._lines.length - 1 + this._rendLineNumberStart,
			this._context.model.getLineMaxColumn(this._lines.length - 1 + this._rendLineNumberStart)
		);


		if (this._lastCursorRevealRangeHorizontallyEvent) {
			var newScrollLeft = this._computeScrollLeftToRevealRange(this._lastCursorRevealRangeHorizontallyEvent.range);
			this._lastCursorRevealRangeHorizontallyEvent = null;

			var isViewportWrapping = this._context.configuration.editor.wrappingInfo.isViewportWrapping;
			if (!isViewportWrapping) {
				this._ensureMaxLineWidth(newScrollLeft.maxHorizontalOffset);
			}

			this._layoutProvider.setScrollLeft(newScrollLeft.scrollLeft);
		}
	}

	private _updateLineWidths(): void {
		var i:number,
			localMaxLineWidth = 1,
			widthInPx:number;

		// Read line widths
		for (i = 0; i < this._lines.length; i++) {
			widthInPx = this._lines[i].getWidth();
			localMaxLineWidth = Math.max(localMaxLineWidth, widthInPx);
		}

		this._ensureMaxLineWidth(localMaxLineWidth);
	}

	public render(): EditorCommon.IViewLinesViewportData {

		var linesViewportData = this._layoutProvider.getLinesViewportData();
		this._bigNumbersDelta = linesViewportData.bigNumbersDelta;

		if (this.shouldRender) {
			this.shouldRender = false;

			this._renderAndUpdateLineHeights(linesViewportData);

			// Update max line width (not so important, it is just so the horizontal scrollbar doesn't get too small)
			this._asyncUpdateLineWidths.schedule();
		}

		if (this._hasVerticalScroll || this._hasHorizontalScroll) {
			if (Browser.canUseTranslate3d) {
				var transform = 'translate3d(' + -this._layoutProvider.getScrollLeft() + 'px, ' + linesViewportData.visibleRangesDeltaTop + 'px, 0px)';
				DomUtils.StyleMutator.setTransform(<HTMLElement>this.domNode.parentNode, transform);
			} else {
				if (this._hasVerticalScroll) {
					DomUtils.StyleMutator.setTop(<HTMLElement>this.domNode.parentNode, linesViewportData.visibleRangesDeltaTop);
				}
				if (this._hasHorizontalScroll) {
					DomUtils.StyleMutator.setLeft(<HTMLElement>this.domNode.parentNode, -this._layoutProvider.getScrollLeft());
				}
			}
			this._hasVerticalScroll = false;
			this._hasHorizontalScroll = false;
		}

		DomUtils.StyleMutator.setWidth(this.domNode, this._layoutProvider.getScrollWidth());
		DomUtils.StyleMutator.setHeight(this.domNode, Math.min(this._layoutProvider.getTotalHeight(), 1000000));

		linesViewportData.visibleRange = this._currentVisibleRange;

		return linesViewportData;
	}

	// --- width

	private _ensureMaxLineWidth(lineWidth: number): void {
		if (this._maxLineWidth < lineWidth) {
			this._maxLineWidth = lineWidth;
			this._layoutProvider.onMaxLineWidthChanged(this._maxLineWidth);
		}
	}

	private _computeScrollTopToRevealRange(viewport:EditorCommon.IViewport, range: EditorCommon.IEditorRange, verticalType: EditorCommon.VerticalRevealType): number {
		var viewportStartY = viewport.top,
			viewportHeight = viewport.height,
			viewportEndY = viewportStartY + viewportHeight,
			boxStartY:number,
			boxEndY:number;

		// Have a box that includes one extra line height (for the horizontal scrollbar)
		boxStartY = this._layoutProvider.getVerticalOffsetForLineNumber(range.startLineNumber);
		boxEndY = this._layoutProvider.getVerticalOffsetForLineNumber(range.endLineNumber) + this._layoutProvider.heightInPxForLine(range.endLineNumber);
		if (verticalType === EditorCommon.VerticalRevealType.Simple) {
			// Reveal one line more for the arrow down case, when the last line would be covered by the scrollbar
			boxEndY += this._context.configuration.editor.lineHeight;
		}

		var newScrollTop: number;

		if (verticalType === EditorCommon.VerticalRevealType.Center || verticalType === EditorCommon.VerticalRevealType.CenterIfOutsideViewport) {
			if (verticalType === EditorCommon.VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
				// Box is already in the viewport... do nothing
				newScrollTop = viewportStartY;
			} else {
				// Box is outside the viewport... center it
				var boxMiddleY = (boxStartY + boxEndY) / 2;
				newScrollTop = Math.max(0, boxMiddleY - viewportHeight/2);
			}
		} else {
			newScrollTop = this._computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY);
		}

		return newScrollTop;
	}

	private _computeScrollLeftToRevealRange(range: EditorCommon.IEditorRange): { scrollLeft: number; maxHorizontalOffset: number; } {

		var maxHorizontalOffset = 0;

		if (range.startLineNumber !== range.endLineNumber) {
			// Two or more lines? => scroll to base (That's how you see most of the two lines)
			return {
				scrollLeft: 0,
				maxHorizontalOffset: maxHorizontalOffset
			};
		}

		var viewport = this._layoutProvider.getCurrentViewport(),
			viewportStartX = viewport.left,
			viewportEndX = viewportStartX + viewport.width;

		var visibleRanges = this.visibleRangesForRange2(range, 0, 0, false),
			boxStartX = Number.MAX_VALUE,
			boxEndX = 0;

		if (!visibleRanges) {
			// Unknown
			return {
				scrollLeft: viewportStartX,
				maxHorizontalOffset: maxHorizontalOffset
			};
		}

		var i:number,
			visibleRange:EditorBrowser.IVisibleRange;

		for (i = 0; i < visibleRanges.length; i++) {
			visibleRange = visibleRanges[i];
			if (visibleRange.left < boxStartX) {
				boxStartX = visibleRange.left;
			}
			if (visibleRange.left + visibleRange.width > boxEndX) {
				boxEndX = visibleRange.left + visibleRange.width;
			}
		}

		maxHorizontalOffset = boxEndX;

		boxStartX = Math.max(0, boxStartX - ViewLines.HORIZONTAL_EXTRA_PX);
		boxEndX += this._context.configuration.editor.revealHorizontalRightPadding;

		var newScrollLeft = this._computeMinimumScrolling(viewportStartX, viewportEndX, boxStartX, boxEndX);
		return {
			scrollLeft: newScrollLeft,
			maxHorizontalOffset: maxHorizontalOffset
		};
	}

	private _computeMinimumScrolling(viewportStart: number, viewportEnd: number, boxStart: number, boxEnd: number): number {
		var viewportLength = viewportEnd - viewportStart,
			boxLength = boxEnd - boxStart;

		if (boxLength < viewportLength) {
			// The box would fit in the viewport
			if (boxStart < viewportStart) {
				// The box is above the viewport
				return boxStart;
			} else if (boxEnd > viewportEnd) {
				// The box is below the viewport
				return Math.max(0, boxEnd - viewportLength);
			}
		} else {
			// The box would not fit in the viewport
			// Reveal the beginning of the box
			return boxStart;
		}

		return viewportStart;
	}
}
