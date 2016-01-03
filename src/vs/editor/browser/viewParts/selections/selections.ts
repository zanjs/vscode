/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./selections';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

interface IRenderResult {
	[lineNumber:string]:string[];
}

enum CornerStyle {
	EXTERN,
	INTERN,
	FLAT
}

interface IVisibleRangeEndPointStyle {
	top: CornerStyle;
	bottom: CornerStyle;
}

interface IVisibleRangeWithStyle extends EditorBrowser.IHorizontalRange {
	startStyle?: IVisibleRangeEndPointStyle;
	endStyle?: IVisibleRangeEndPointStyle;
}

interface ILineVisibleRangesWithStyle extends EditorBrowser.ILineVisibleRanges {
	ranges: IVisibleRangeWithStyle[];
}

// TODO@Alex: Remove this once IE11 fixes Bug #524217
// The problem in IE11 is that it does some sort of auto-zooming to accomodate for displays with different pixel density.
// Unfortunately, this auto-zooming is buggy around dealing with rounded borders
const isIEWithZoomingIssuesNearRoundedBorders = (
	(navigator.userAgent.indexOf('Trident/7.0') >= 0)
	|| (navigator.userAgent.indexOf('Edge/12') >= 0)
);


export class SelectionsOverlay extends ViewEventHandler implements EditorBrowser.IDynamicViewOverlay {

	private static SELECTION_CLASS_NAME = 'selected-text';
	private static SELECTION_TOP_LEFT = 'top-left-radius';
	private static SELECTION_BOTTOM_LEFT = 'bottom-left-radius';
	private static SELECTION_TOP_RIGHT = 'top-right-radius';
	private static SELECTION_BOTTOM_RIGHT = 'bottom-right-radius';
	private static EDITOR_BACKGROUND_CLASS_NAME = 'monaco-editor-background';

	private static ROUNDED_PIECE_WIDTH = 10;

	private _context:EditorBrowser.IViewContext;
	private _selections:EditorCommon.IEditorRange[];
	private _renderResult:IRenderResult;

	constructor(context:EditorBrowser.IViewContext) {
		super();
		this._context = context;
		this._selections = [];
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._selections = null;
		this._renderResult = null;
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
		this._selections = [e.selection];
		this._selections = this._selections.concat(e.secondarySelections);
		return true;
	}
	public onCursorRevealRange(e:EditorCommon.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		return true;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return e.vertical;
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

	// --- end event handlers

	private _visibleRangesHaveGaps(linesVisibleRanges: EditorBrowser.ILineVisibleRanges[]): boolean {

		var i:number,
			len:number,
			lineVisibleRanges:EditorBrowser.ILineVisibleRanges;

		for (i = 0, len = linesVisibleRanges.length; i < len; i++) {
			lineVisibleRanges = linesVisibleRanges[i];

			if (lineVisibleRanges.ranges.length > 1) {
				// There are two ranges on the same line
				return true;
			}
		}

		return false;
	}

	private _enrichVisibleRangesWithStyle(linesVisibleRanges:ILineVisibleRangesWithStyle[], previousFrame:ILineVisibleRangesWithStyle[]): void {
		var curLineRange: IVisibleRangeWithStyle,
			curLeft: number,
			curRight: number,
			prevLeft: number,
			prevRight: number,
			nextLeft: number,
			nextRight: number,
			startStyle: IVisibleRangeEndPointStyle,
			endStyle: IVisibleRangeEndPointStyle,
			i:number,
			len:number;

		var previousFrameTop: IVisibleRangeWithStyle = null,
			previousFrameBottom: IVisibleRangeWithStyle = null;

		if (previousFrame && previousFrame.length > 0 && linesVisibleRanges.length > 0) {

			var topLineNumber = linesVisibleRanges[0].lineNumber;
			for (var i = 0; !previousFrameTop && i < previousFrame.length; i++) {
				if (previousFrame[i].lineNumber === topLineNumber) {
					previousFrameTop = previousFrame[i].ranges[0];
				}
			}

			var bottomLineNumber = linesVisibleRanges[linesVisibleRanges.length - 1].lineNumber;
			for (var i = previousFrame.length - 1; !previousFrameBottom && i >= 0; i--) {
				if (previousFrame[i].lineNumber === bottomLineNumber) {
					previousFrameBottom = previousFrame[i].ranges[0];
				}
			}

			if (previousFrameTop && !previousFrameTop.startStyle) {
				previousFrameTop = null;
			}
			if (previousFrameBottom && !previousFrameBottom.startStyle) {
				previousFrameBottom = null;
			}
		}

		for (i = 0, len = linesVisibleRanges.length; i < len; i++) {
			// We know for a fact that there is precisely one range on each line
			curLineRange = linesVisibleRanges[i].ranges[0];
			curLeft = curLineRange.left;
			curRight = curLineRange.left + curLineRange.width;

			startStyle = {
				top: CornerStyle.EXTERN,
				bottom: CornerStyle.EXTERN
			};

			endStyle = {
				top: CornerStyle.EXTERN,
				bottom: CornerStyle.EXTERN
			};

			if (i > 0) {
				// Look above
				prevLeft = linesVisibleRanges[i-1].ranges[0].left;
				prevRight = linesVisibleRanges[i-1].ranges[0].left + linesVisibleRanges[i-1].ranges[0].width;

				if (curLeft === prevLeft) {
					startStyle.top = CornerStyle.FLAT;
				} else if (curLeft > prevLeft) {
					startStyle.top = CornerStyle.INTERN;
				}

				if (curRight === prevRight) {
					endStyle.top = CornerStyle.FLAT;
				} else if (prevLeft < curRight && curRight < prevRight) {
					endStyle.top = CornerStyle.INTERN;
				}
			} else if (previousFrameTop) {
				// Accept some hick-ups near the viewport edges to save on repaints
				startStyle.top = previousFrameTop.startStyle.top;
				endStyle.top = previousFrameTop.endStyle.top;
			}

			if (i + 1 < len) {
				// Look below
				nextLeft = linesVisibleRanges[i+1].ranges[0].left;
				nextRight = linesVisibleRanges[i+1].ranges[0].left + linesVisibleRanges[i+1].ranges[0].width;

				if (curLeft === nextLeft) {
					startStyle.bottom = CornerStyle.FLAT;
				} else if (nextLeft < curLeft && curLeft < nextRight) {
					startStyle.bottom = CornerStyle.INTERN;
				}

				if (curRight === nextRight) {
					endStyle.bottom = CornerStyle.FLAT;
				} else if (curRight < nextRight) {
					endStyle.bottom = CornerStyle.INTERN;
				}
			} else if (previousFrameBottom) {
				// Accept some hick-ups near the viewport edges to save on repaints
				startStyle.bottom = previousFrameBottom.startStyle.bottom;
				endStyle.bottom = previousFrameBottom.endStyle.bottom;
			}

			curLineRange.startStyle = startStyle;
			curLineRange.endStyle = endStyle;
		}
	}

	private _getVisibleRangesWithStyle(selection: EditorCommon.IEditorRange, ctx: EditorBrowser.IRenderingContext, previousFrame:ILineVisibleRangesWithStyle[]): ILineVisibleRangesWithStyle[] {
		var linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) || [];

		var visibleRangesHaveGaps = this._visibleRangesHaveGaps(linesVisibleRanges);

		if (!isIEWithZoomingIssuesNearRoundedBorders && !visibleRangesHaveGaps && this._context.configuration.editor.roundedSelection) {
			this._enrichVisibleRangesWithStyle(linesVisibleRanges, previousFrame);
		}

		// The visible ranges are sorted TOP-BOTTOM and LEFT-RIGHT
		return linesVisibleRanges;
	}

	private _createSelectionPiece(lineOutput:string[], height:string, className:string, left:number, width:number): void {
		lineOutput.push('<div class="cslr ');
		lineOutput.push(className);
		lineOutput.push('" style="left:');
		lineOutput.push(left.toString());
		lineOutput.push('px;width:');
		lineOutput.push(width.toString());
		lineOutput.push('px;height:');
		lineOutput.push(height);
		lineOutput.push('px;"></div>');
	}

	private _actualRenderOneSelection(output:IRenderResult, visibleRanges:ILineVisibleRangesWithStyle[]): number {
		var visibleRangesHaveStyle = (visibleRanges.length > 0 && visibleRanges[0].ranges[0].startStyle),
			lineVisibleRanges:ILineVisibleRangesWithStyle,
			lineOutput: string[],
			className:string,
			lineHeight = this._context.configuration.editor.lineHeight.toString(),
			i:number, len:number,
			j:number, lenJ:number,
			piecesCount = 0,
			visibleRange:IVisibleRangeWithStyle;

		for (i = 0, len = visibleRanges.length; i < len; i++) {
			lineVisibleRanges = visibleRanges[i];

			if (output.hasOwnProperty(lineVisibleRanges.lineNumber.toString())) {
				lineOutput = output[lineVisibleRanges.lineNumber.toString()];
			} else {
				lineOutput = [];
				output[lineVisibleRanges.lineNumber.toString()] = lineOutput;
			}

			for (j = 0, lenJ = lineVisibleRanges.ranges.length; j < lenJ; j++) {
				visibleRange = lineVisibleRanges.ranges[j];

				if (visibleRangesHaveStyle) {
					if (visibleRange.startStyle.top === CornerStyle.INTERN || visibleRange.startStyle.bottom === CornerStyle.INTERN) {
						// Reverse rounded corner to the left

						// First comes the selection (blue layer)
						piecesCount++;
						this._createSelectionPiece(lineOutput, lineHeight, SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left - SelectionsOverlay.ROUNDED_PIECE_WIDTH, SelectionsOverlay.ROUNDED_PIECE_WIDTH);

						// Second comes the background (white layer) with inverse border radius
						className = SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
						if (visibleRange.startStyle.top === CornerStyle.INTERN) {
							className += ' ' + SelectionsOverlay.SELECTION_TOP_RIGHT;
						}
						if (visibleRange.startStyle.bottom === CornerStyle.INTERN) {
							className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
						}
						piecesCount++;
						this._createSelectionPiece(lineOutput, lineHeight, className, visibleRange.left - SelectionsOverlay.ROUNDED_PIECE_WIDTH, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
					}
					if (visibleRange.endStyle.top === CornerStyle.INTERN || visibleRange.endStyle.bottom === CornerStyle.INTERN) {
						// Reverse rounded corner to the right

						// First comes the selection (blue layer)
						piecesCount++;
						this._createSelectionPiece(lineOutput, lineHeight, SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left + visibleRange.width, SelectionsOverlay.ROUNDED_PIECE_WIDTH);

						// Second comes the background (white layer) with inverse border radius
						className = SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
						if (visibleRange.endStyle.top === CornerStyle.INTERN) {
							className += ' ' + SelectionsOverlay.SELECTION_TOP_LEFT;
						}
						if (visibleRange.endStyle.bottom === CornerStyle.INTERN) {
							className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_LEFT;
						}
						piecesCount++;
						this._createSelectionPiece(lineOutput, lineHeight, className, visibleRange.left + visibleRange.width, SelectionsOverlay.ROUNDED_PIECE_WIDTH);
					}
				}

				className = SelectionsOverlay.SELECTION_CLASS_NAME;
				if (visibleRangesHaveStyle) {
					if (visibleRange.startStyle.top === CornerStyle.EXTERN) {
						className += ' ' + SelectionsOverlay.SELECTION_TOP_LEFT;
					}
					if (visibleRange.startStyle.bottom === CornerStyle.EXTERN) {
						className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_LEFT;
					}
					if (visibleRange.endStyle.top === CornerStyle.EXTERN) {
						className += ' ' + SelectionsOverlay.SELECTION_TOP_RIGHT;
					}
					if (visibleRange.endStyle.bottom === CornerStyle.EXTERN) {
						className += ' ' + SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
					}
				}
				piecesCount++;
				this._createSelectionPiece(lineOutput, lineHeight, className, visibleRange.left, visibleRange.width);
			}
		}

		return piecesCount;
	}

	private _previousFrameVisibleRangesWithStyle: ILineVisibleRangesWithStyle[][] = [];
	public shouldCallRender2(ctx:EditorBrowser.IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		var output: IRenderResult = {},
			selection:EditorCommon.IEditorRange,
			visibleRangesWithStyle:ILineVisibleRangesWithStyle[],
			piecesCount = 0,
			i:number,
			thisFrameVisibleRangesWithStyle: ILineVisibleRangesWithStyle[][] = [];

		for (i = 0; i < this._selections.length; i++) {
			selection = this._selections[i];
			if (selection.isEmpty()) {
				thisFrameVisibleRangesWithStyle.push(null);
				continue;
			}

			visibleRangesWithStyle = this._getVisibleRangesWithStyle(selection, ctx, this._previousFrameVisibleRangesWithStyle[i]);
			thisFrameVisibleRangesWithStyle.push(visibleRangesWithStyle);
			piecesCount += this._actualRenderOneSelection(output, visibleRangesWithStyle);
		}

		this._previousFrameVisibleRangesWithStyle = thisFrameVisibleRangesWithStyle;
		this._renderResult = output;

		return true;
	}

	public render2(lineNumber:number): string[] {
		if (this._renderResult && this._renderResult.hasOwnProperty(lineNumber.toString())) {
			return this._renderResult[lineNumber.toString()];
		}
		return null;
	}
}
