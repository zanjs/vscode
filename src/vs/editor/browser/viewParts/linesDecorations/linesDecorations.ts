/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./linesDecorations';
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

interface IRenderResult {
	[lineNumber:string]:string[];
}

export class LinesDecorationsOverlay extends ViewEventHandler implements EditorBrowser.IDynamicViewOverlay {

	private _context:EditorBrowser.IViewContext;

	private _decorationsLeft:number;
	private _decorationsWidth:number;
	private _renderResult:IRenderResult;

	constructor(context:EditorBrowser.IViewContext) {
		super();
		this._context = context;
		this._decorationsLeft = 0;
		this._decorationsWidth = 0;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._renderResult = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		return true;
	}
	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		return true;
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
		this._decorationsLeft = layoutInfo.decorationsLeft;
		this._decorationsWidth = layoutInfo.decorationsWidth;
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

	public shouldCallRender2(ctx:EditorBrowser.IRenderingContext): boolean {
		if (!this.shouldRender) {
			return false;
		}
		this.shouldRender = false;

		var output: IRenderResult = {};
		var renderedCount = 0;

		var decorations = ctx.getDecorationsInViewport(),
			lineHeight = this._context.configuration.editor.lineHeight.toString(),
			d:EditorCommon.IModelDecoration,
			rng:EditorCommon.IRange,
			i:number, lenI:number,
			classNames:{[top:string]:{[className:string]:boolean;};} = {},
			lineClassNames:{[className:string]:boolean;},
			className:string,
			lineOutput:string[],
			lineNumber: number,
			lineNumberStr: string;;

		for (i = 0, lenI = decorations.length; i < lenI; i++) {
			d = decorations[i];
			if (!d.options.linesDecorationsClassName) {
				continue;
			}

			rng = d.range;

			for (lineNumber = rng.startLineNumber; lineNumber <= rng.endLineNumber; lineNumber++) {
				if (!ctx.lineIsVisible(lineNumber)) {
					continue;
				}

				lineNumberStr = lineNumber.toString();

//					oldTop = ctx.getViewportVerticalOffsetForLineNumber(j);

				if (!classNames.hasOwnProperty(lineNumberStr)) {
					classNames[lineNumberStr] = {};
				}
				classNames[lineNumberStr][d.options.linesDecorationsClassName] = true;
			}
		}

		var left = this._decorationsLeft.toString(),
			width = this._decorationsWidth.toString();

		var common = '" style="left:' + left + 'px;width:' + width + 'px' + ';height:' + lineHeight + 'px;"></div>';
		for (lineNumberStr in classNames) {
			lineClassNames = classNames[lineNumberStr];
			lineOutput = [];
			lineOutput.push('<div class="cldr');
			for (className in lineClassNames) {
				// Count one more glyph
				renderedCount++;
				lineOutput.push(' ');
				lineOutput.push(className);
			}
			lineOutput.push(common);
			output[lineNumberStr] = lineOutput;
		}

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