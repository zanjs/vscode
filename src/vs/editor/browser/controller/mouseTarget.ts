/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Mouse = require('vs/base/browser/mouseEvent');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import {Range as EditorRange} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';

interface IHitTestResult {
	position: EditorCommon.IPosition;
	hitTarget: Element;
}

export interface IDomNodePosition {
	top: number;
	left: number;
	width: number;
	height: number;
}

class MouseTarget implements EditorBrowser.IMouseTarget {

	public element: Element;
	public type: EditorCommon.MouseTargetType;
	public position: EditorCommon.IEditorPosition;
	public range: EditorCommon.IEditorRange;
	public detail: any;

	constructor(element: Element, type: EditorCommon.MouseTargetType, position:EditorCommon.IEditorPosition = null, range: EditorCommon.IEditorRange = null, detail: any = null) {
		this.element = element;
		this.type = type;
		this.position = position;
		if (!range && position) {
			range = new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
		}
		this.range = range;
		this.detail = detail;
	}

	private _typeToString(): string {
		if (this.type === EditorCommon.MouseTargetType.TEXTAREA) {
			return 'TEXTAREA';
		}
		if (this.type === EditorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN) {
			return 'GUTTER_GLYPH_MARGIN';
		}
		if (this.type === EditorCommon.MouseTargetType.GUTTER_LINE_NUMBERS) {
			return 'GUTTER_LINE_NUMBERS';
		}
		if (this.type === EditorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return 'GUTTER_LINE_DECORATIONS';
		}
		if (this.type === EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE) {
			return 'GUTTER_VIEW_ZONE';
		}
		if (this.type === EditorCommon.MouseTargetType.CONTENT_TEXT) {
			return 'CONTENT_TEXT';
		}
		if (this.type === EditorCommon.MouseTargetType.CONTENT_EMPTY) {
			return 'CONTENT_EMPTY';
		}
		if (this.type === EditorCommon.MouseTargetType.CONTENT_VIEW_ZONE) {
			return 'CONTENT_VIEW_ZONE';
		}
		if (this.type === EditorCommon.MouseTargetType.CONTENT_WIDGET) {
			return 'CONTENT_WIDGET';
		}
		if (this.type === EditorCommon.MouseTargetType.OVERVIEW_RULER) {
			return 'OVERVIEW_RULER';
		}
		if (this.type === EditorCommon.MouseTargetType.SCROLLBAR) {
			return 'SCROLLBAR';
		}
		if (this.type === EditorCommon.MouseTargetType.OVERLAY_WIDGET) {
			return 'OVERLAY_WIDGET';
		}
		return 'UNKNOWN';
	}

	public toString(): string {
		return this._typeToString() + ': ' + this.position + ' - ' + this.range + ' - ' + this.detail;
	}
}


// e.g. of paths:
// - overflow-guard/monaco-scrollable-element editor-scrollable vs/lines-content/view-lines/view-line
// - overflow-guard/monaco-scrollable-element editor-scrollable vs/lines-content/view-lines/view-line/token comment js
// etc.
var REGEX = (function() {

	function nodeWithClass(className:string): string {
		return '[^/]*' + className + '[^/]*';
	}

	function anyNode(): string {
		return '[^/]+';
	}

	var ANCHOR = '^' + EditorBrowser.ClassNames.OVERFLOW_GUARD + '\\/';

	function createRegExp(...pieces:string[]): RegExp {
		var forceEndMatch = false;
		if (pieces[pieces.length - 1] === '$') {
			forceEndMatch = true;
			pieces.pop();
		}
		return new RegExp(ANCHOR + pieces.join('\\/') + (forceEndMatch ? '$' : ''));
	}

	return {
		IS_TEXTAREA_COVER: createRegExp(nodeWithClass(EditorBrowser.ClassNames.TEXTAREA_COVER), '$'),
		IS_TEXTAREA: createRegExp(EditorBrowser.ClassNames.TEXTAREA, '$'),
		IS_VIEW_LINES: createRegExp(anyNode(), anyNode(), EditorBrowser.ClassNames.VIEW_LINES, '$'),
		IS_CURSORS_LAYER: createRegExp(anyNode(), anyNode(), nodeWithClass(EditorBrowser.ClassNames.VIEW_CURSORS_LAYER), '$'),
		IS_CHILD_OF_VIEW_LINES: createRegExp(anyNode(), anyNode(), EditorBrowser.ClassNames.VIEW_LINES),
		IS_CHILD_OF_SCROLLABLE_ELEMENT: createRegExp(nodeWithClass(EditorBrowser.ClassNames.SCROLLABLE_ELEMENT)),
		IS_CHILD_OF_CONTENT_WIDGETS: createRegExp(anyNode(), anyNode(), EditorBrowser.ClassNames.CONTENT_WIDGETS),
		IS_CHILD_OF_OVERLAY_WIDGETS: createRegExp(EditorBrowser.ClassNames.OVERLAY_WIDGETS),
		IS_CHILD_OF_VIEW_OVERLAYS: createRegExp(EditorBrowser.ClassNames.MARGIN_VIEW_OVERLAYS),
		IS_CHILD_OF_VIEW_ZONES: createRegExp(anyNode(), anyNode(), EditorBrowser.ClassNames.VIEW_ZONES),
	};
})();

export class MouseTargetFactory {

	private context: EditorBrowser.IViewContext;
	private viewHelper: EditorBrowser.IPointerHandlerHelper;

	constructor(context:EditorBrowser.IViewContext, viewHelper:EditorBrowser.IPointerHandlerHelper) {
		this.context = context;
		this.viewHelper = viewHelper;
	}

	private getClassNamePathTo(child:Node, stopAt:Node): string {
		var path:string[] = [],
			className: string;

		while (child && child !== document.body) {
			if (child === stopAt) {
				break;
			}
			if (child.nodeType === child.ELEMENT_NODE) {
				className = (<HTMLElement>child).className;
				if (className) {
					path.unshift(className);
				}
			}
			child = child.parentNode;
		}

		return path.join('/');
	}

	public mouseTargetIsWidget(e:Mouse.StandardMouseEvent): boolean {
		var t:Element = e.target;
		var path = this.getClassNamePathTo(t, this.viewHelper.viewDomNode);

		// Is it a content widget?
		if (REGEX.IS_CHILD_OF_CONTENT_WIDGETS.test(path)) {
			return true;
		}

		// Is it an overlay widget?
		if (REGEX.IS_CHILD_OF_OVERLAY_WIDGETS.test(path)) {
			return true;
		}

		return false;
	}

	public createMouseTarget(layoutInfo:EditorCommon.IEditorLayoutInfo, editorContent:IDomNodePosition, e:Mouse.StandardMouseEvent, testEventTarget:boolean): EditorBrowser.IMouseTarget {
		try {
			var r = this._unsafeCreateMouseTarget(layoutInfo, editorContent, e, testEventTarget);
			return r;
		} catch (e) {
			return this.createMouseTargetFromUnknownTarget(e.target);
		}
	}

	private _unsafeCreateMouseTarget(layoutInfo:EditorCommon.IEditorLayoutInfo, editorContent:IDomNodePosition, e:Mouse.StandardMouseEvent, testEventTarget:boolean): EditorBrowser.IMouseTarget {
		var mouseVerticalOffset = Math.max(0, this.viewHelper.getScrollTop() + (e.posy - editorContent.top));
		var mouseContentHorizontalOffset = this.viewHelper.getScrollLeft() + (e.posx - editorContent.left) - layoutInfo.contentLeft;

		var t:Element = e.target;
		var path = this.getClassNamePathTo(t, this.viewHelper.viewDomNode);

		// Is it a cursor ?
		var lineNumberAttribute = t.hasAttribute && t.hasAttribute('lineNumber') ? t.getAttribute('lineNumber') : null;
		var columnAttribute = t.hasAttribute && t.hasAttribute('column') ? t.getAttribute('column') : null;
		if (lineNumberAttribute && columnAttribute) {
			return this.createMouseTargetFromViewCursor(t, parseInt(lineNumberAttribute, 10), parseInt(columnAttribute, 10));
		}

		// Is it a content widget?
		if (REGEX.IS_CHILD_OF_CONTENT_WIDGETS.test(path)) {
			return this.createMouseTargetFromContentWidgetsChild(t);
		}

		// Is it an overlay widget?
		if (REGEX.IS_CHILD_OF_OVERLAY_WIDGETS.test(path)) {
			return this.createMouseTargetFromOverlayWidgetsChild(t);
		}

		// Is it the textarea cover?
		if (REGEX.IS_TEXTAREA_COVER.test(path)) {
			if (this.context.configuration.editor.glyphMargin) {
				return this.createMouseTargetFromGlyphMargin(t, mouseVerticalOffset);
			} else if (this.context.configuration.editor.lineNumbers) {
				return this.createMouseTargetFromLineNumbers(t, mouseVerticalOffset);
			} else {
				return this.createMouseTargetFromLinesDecorationsChild(t, mouseVerticalOffset);
			}
		}

		// Is it the textarea?
		if (REGEX.IS_TEXTAREA.test(path)) {
			return new MouseTarget(t, EditorCommon.MouseTargetType.TEXTAREA);
		}

		// Is it a view zone?
		if (REGEX.IS_CHILD_OF_VIEW_ZONES.test(path)) {
			// Check if it is at a view zone
			var viewZoneData = this._getZoneAtCoord(mouseVerticalOffset);
			if (viewZoneData) {
				return new MouseTarget(t, EditorCommon.MouseTargetType.CONTENT_VIEW_ZONE, viewZoneData.position, null, viewZoneData);
			}
			return this.createMouseTargetFromUnknownTarget(t);
		}

		// Is it the view lines container?
		if (REGEX.IS_VIEW_LINES.test(path)) {
			// Sometimes, IE returns this target when right clicking on top of text
			// -> See Bug #12990: [F12] Context menu shows incorrect position while doing a resize

			// Check if it is below any lines and any view zones
			if (this.viewHelper.isAfterLines(mouseVerticalOffset)) {
				return this.createMouseTargetFromViewLines(t, mouseVerticalOffset);
			}

			// Check if it is at a view zone
			var viewZoneData = this._getZoneAtCoord(mouseVerticalOffset);
			if (viewZoneData) {
				return new MouseTarget(t, EditorCommon.MouseTargetType.CONTENT_VIEW_ZONE, viewZoneData.position, null, viewZoneData);
			}

			// Check if it hits a position
			var hitTestResult = this._doHitTest(editorContent, e, mouseVerticalOffset);
			if (hitTestResult.position) {
				return this.createMouseTargetFromHitTestPosition(t, hitTestResult.position.lineNumber, hitTestResult.position.column, mouseContentHorizontalOffset);
			}

			// Fall back to view lines
			return this.createMouseTargetFromViewLines(t, mouseVerticalOffset);
		}

		// Is it a child of the view lines container?
		if (!testEventTarget || REGEX.IS_CHILD_OF_VIEW_LINES.test(path)) {
			var hitTestResult = this._doHitTest(editorContent, e, mouseVerticalOffset);
			if (hitTestResult.position) {
				return this.createMouseTargetFromHitTestPosition(t, hitTestResult.position.lineNumber, hitTestResult.position.column, mouseContentHorizontalOffset);
			} else if (hitTestResult.hitTarget) {
				t = hitTestResult.hitTarget;
				path = this.getClassNamePathTo(t, this.viewHelper.viewDomNode);
			}
		}

		// Is it the cursors layer?
		if (REGEX.IS_CURSORS_LAYER.test(path)) {
			return new MouseTarget(t, EditorCommon.MouseTargetType.UNKNOWN);
		}

		// Is it a child of the scrollable element?
		if (REGEX.IS_CHILD_OF_SCROLLABLE_ELEMENT.test(path)) {
			return this.createMouseTargetFromScrollbar(t, mouseVerticalOffset);
		}

		if (REGEX.IS_CHILD_OF_VIEW_OVERLAYS.test(path)) {
			var offset = Math.abs(e.posx - editorContent.left);

			if (offset <= layoutInfo.glyphMarginWidth) {
				// On the glyph margin
				return this.createMouseTargetFromGlyphMargin(t, mouseVerticalOffset);
			}
			offset -= layoutInfo.glyphMarginWidth;

			if (offset <= layoutInfo.lineNumbersWidth) {
				// On the line numbers
				return this.createMouseTargetFromLineNumbers(t, mouseVerticalOffset);
			}
			offset -= layoutInfo.lineNumbersWidth;

			// On the line decorations
			return this.createMouseTargetFromLinesDecorationsChild(t, mouseVerticalOffset);
		}

		if (/OverviewRuler/i.test(path)) {
			return this.createMouseTargetFromScrollbar(t, mouseVerticalOffset);
		}

		return this.createMouseTargetFromUnknownTarget(t);
	}

	private _isChild(testChild:Node, testAncestor:Node, stopAt:Node): boolean {
		while (testChild && testChild !== document.body) {
			if (testChild === testAncestor) {
				return true;
			}
			if (testChild === stopAt) {
				return false;
			}
			testChild = testChild.parentNode;
		}
		return false;
	}

	private _findAttribute(element:Element, attr:string, stopAt:Element): string {
		while (element && element !== document.body) {
			if (element.hasAttribute && element.hasAttribute(attr)) {
				return element.getAttribute(attr);
			}
			if (element === stopAt) {
				return null;
			}
			element = <Element>element.parentNode;
		}
		return null;
	}

	/**
	 * Most probably WebKit browsers
	 */
	private _doHitTestWithCaretRangeFromPoint(editorContent:IDomNodePosition, e: Mouse.StandardMouseEvent, mouseVerticalOffset: number): IHitTestResult {

		// In Chrome, especially on Linux it is possible to click between lines,
		// so try to adjust the `hity` below so that it lands in the center of a line
		var lineNumber = this.viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		var lineVerticalOffset = this.viewHelper.getVerticalOffsetForLineNumber(lineNumber);
		var centeredVerticalOffset = lineVerticalOffset + Math.floor(this.context.configuration.editor.lineHeight / 2);
		var adjustedPosy = e.posy + (centeredVerticalOffset - mouseVerticalOffset);

		if (adjustedPosy <= editorContent.top) {
			adjustedPosy = editorContent.top + 1;
		}
		if (adjustedPosy >= editorContent.top + this.context.configuration.editor.observedOuterHeight) {
			adjustedPosy = editorContent.top + this.context.configuration.editor.observedOuterHeight - 1;
		}

		var hitx = e.posx - document.body.scrollLeft;
		var r = this._actualDoHitTestWithCaretRangeFromPoint(hitx, adjustedPosy - document.body.scrollTop);
		if (r.position) {
			return r;
		}

		// Also try to hit test without the adjustment (for the edge cases that we are near the top or bottom)
		return this._actualDoHitTestWithCaretRangeFromPoint(hitx, e.posy - document.body.scrollTop);
	}

	private _actualDoHitTestWithCaretRangeFromPoint(hitx:number, hity:number): IHitTestResult {
		var resultPosition: EditorCommon.IPosition = null;
		var resultHitTarget: Element = null;

		var range:Range = (<any>document).caretRangeFromPoint(hitx, hity);

		var container = range ? range.startContainer : null;
		var parent1 = container ? container.parentNode : null;
		var parent2 = parent1 ? parent1.parentNode : null;
		var parent3 = parent2 ? parent2.parentNode : null;

		var parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : '';
		var parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? (<HTMLElement>parent3).className : '';

		if (parent3ClassName === EditorBrowser.ClassNames.VIEW_LINE) {
			resultPosition = this.viewHelper.getPositionFromDOMInfo(<HTMLElement>range.startContainer.parentNode, range.startOffset);
		} else if (parent2ClassName === EditorBrowser.ClassNames.VIEW_LINE) {
			resultPosition = this.viewHelper.getPositionFromDOMInfo(<HTMLElement>range.startContainer, range.startOffset);
		} else {
			// Looks like we've hit something foreign
			resultHitTarget = <Element>parent1;
		}

		// WebKit now shows warning in console for calling Range.detach(), because it is a no-op
		// per DOM (http://dom.spec.whatwg.org/#dom-range-detach), therefore not calling .detach() anymore.

		return {
			position: resultPosition,
			hitTarget: resultHitTarget
		};
	}

	/**
	 * Most probably Gecko
	 */
	private _doHitTestWithCaretPositionFromPoint(e: Mouse.StandardMouseEvent): IHitTestResult {
		var resultPosition: EditorCommon.IPosition = null;
		var resultHitTarget: Element = null;

		var hitx = e.posx - document.body.scrollLeft - document.documentElement.scrollLeft;
		var hity = e.posy - document.body.scrollTop - document.documentElement.scrollTop;

		var hitResult:{ offsetNode: Node; offset: number; } = (<any>document).caretPositionFromPoint(hitx, hity);

		var range = document.createRange();
		range.setStart(hitResult.offsetNode, hitResult.offset);
		range.collapse(true);
		resultPosition = this.viewHelper.getPositionFromDOMInfo(<HTMLElement>range.startContainer.parentNode, range.startOffset);
		range.detach();

		return {
			position: resultPosition,
			hitTarget: resultHitTarget
		};
	}

	/**
	 * Most probably IE
	 */
	private _doHitTestWithMoveToPoint(e: Mouse.StandardMouseEvent): IHitTestResult {
		var resultPosition: EditorCommon.IPosition = null;
		var resultHitTarget: Element = null;

		var textRange:TextRange = (<any>document.body).createTextRange();
		try {
			var hitx = e.posx - document.body.scrollLeft - document.documentElement.scrollLeft;
			var hity = e.posy - document.body.scrollTop - document.documentElement.scrollTop;
			textRange.moveToPoint(hitx, hity);
		} catch (err) {
			return {
				position: null,
				hitTarget: null
			};
		}

		textRange.collapse(true);

		// Now, let's do our best to figure out what we hit :)
		var parentElement = textRange ? textRange.parentElement() : null;
		var parent1 = parentElement ? parentElement.parentNode : null;
		var parent2 = parent1 ? parent1.parentNode : null;

		var parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? (<HTMLElement>parent2).className : '';

		if (parent2ClassName === EditorBrowser.ClassNames.VIEW_LINE) {
			var rangeToContainEntireSpan = textRange.duplicate();
			rangeToContainEntireSpan.moveToElementText(parentElement);
			rangeToContainEntireSpan.setEndPoint('EndToStart', textRange);

			resultPosition = this.viewHelper.getPositionFromDOMInfo(<HTMLElement>parentElement, rangeToContainEntireSpan.text.length);
			// Move range out of the span node, IE doesn't like having many ranges in
			// the same spot and will act badly for lines containing dashes ('-')
			rangeToContainEntireSpan.moveToElementText(this.viewHelper.viewDomNode);
		} else {
			// Looks like we've hit the hover or something foreign
			resultHitTarget = parentElement;
		}

		// Move range out of the span node, IE doesn't like having many ranges in
		// the same spot and will act badly for lines containing dashes ('-')
		textRange.moveToElementText(this.viewHelper.viewDomNode);

		return {
			position: resultPosition,
			hitTarget: resultHitTarget
		};
	}

	private _doHitTest(editorContent:IDomNodePosition, e:Mouse.StandardMouseEvent, mouseVerticalOffset: number): IHitTestResult {
		// State of the art (18.10.2012):
		// The spec says browsers should support document.caretPositionFromPoint, but nobody implemented it (http://dev.w3.org/csswg/cssom-view/)
		// Gecko:
		//    - they tried to implement it once, but failed: https://bugzilla.mozilla.org/show_bug.cgi?id=654352
		//    - however, they do give out rangeParent/rangeOffset properties on mouse events
		// Webkit:
		//    - they have implemented a previous version of the spec which was using document.caretRangeFromPoint
		// IE:
		//    - they have a proprietary method on ranges, moveToPoint: http://msdn.microsoft.com/en-us/library/ie/ms536632(v=vs.85).aspx

		// Thank you browsers for making this so 'easy' :)

		if ((<any>document).caretRangeFromPoint) {

			return this._doHitTestWithCaretRangeFromPoint(editorContent, e, mouseVerticalOffset);

		} else if ((<any>document).caretPositionFromPoint) {

			return this._doHitTestWithCaretPositionFromPoint(e);

		} else if ((<any>document.body).createTextRange) {

			return this._doHitTestWithMoveToPoint(e);

		}

		return {
			position: null,
			hitTarget: null
		};
	}

	private _getZoneAtCoord(mouseVerticalOffset: number): EditorBrowser.IViewZoneData {
		// The target is either a view zone or the empty space after the last view-line
		var viewZoneWhitespace = this.viewHelper.getWhitespaceAtVerticalOffset(mouseVerticalOffset);

		if (viewZoneWhitespace) {
			var viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2,
				lineCount = this.context.model.getLineCount(),
				positionBefore: EditorCommon.IEditorPosition = null,
				position: EditorCommon.IEditorPosition,
				positionAfter: EditorCommon.IEditorPosition = null;

			if (viewZoneWhitespace.afterLineNumber !== lineCount) {
				// There are more lines after this view zone
				positionAfter = new Position(viewZoneWhitespace.afterLineNumber + 1, 1);
			}
			if (viewZoneWhitespace.afterLineNumber > 0) {
				// There are more lines above this view zone
				positionBefore = new Position(viewZoneWhitespace.afterLineNumber, this.context.model.getLineMaxColumn(viewZoneWhitespace.afterLineNumber));
			}

			if (positionAfter === null) {
				position = positionBefore;
			} else if (positionBefore === null) {
				position = positionAfter;
			} else if (mouseVerticalOffset < viewZoneMiddle) {
				position = positionBefore;
			} else {
				position = positionAfter;
			}

			return {
				viewZoneId: viewZoneWhitespace.id,
				afterLineNumber: viewZoneWhitespace.afterLineNumber,
				positionBefore: positionBefore,
				positionAfter: positionAfter,
				position: position
			};
		}
		return null;
	}

	private _getFullLineRangeAtCoord(mouseVerticalOffset: number): { range: EditorCommon.IEditorRange; isAfterLines: boolean; } {
		if (this.viewHelper.isAfterLines(mouseVerticalOffset)) {
			// Below the last line
			var lineNumber = this.context.model.getLineCount();
			var maxLineColumn = this.context.model.getLineMaxColumn(lineNumber);
			return {
				range: new EditorRange(lineNumber, maxLineColumn, lineNumber, maxLineColumn),
				isAfterLines: true
			};
		}

		var lineNumber = this.viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		var maxLineColumn = this.context.model.getLineMaxColumn(lineNumber);
		return {
			range: new EditorRange(lineNumber, 1, lineNumber, maxLineColumn),
			isAfterLines: false
		};
	}

	private createMouseTargetFromViewCursor(target:Element, lineNumber: number, column: number): MouseTarget {
		return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_TEXT, new Position(lineNumber, column));
	}

	private createMouseTargetFromViewLines(target:Element, mouseVerticalOffset: number): MouseTarget {
		// This most likely indicates it happened after the last view-line
		var lineCount = this.context.model.getLineCount();
		var maxLineColumn = this.context.model.getLineMaxColumn(lineCount);
		return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_EMPTY, new Position(lineCount, maxLineColumn));
	}

	private createMouseTargetFromHitTestPosition(target:Element, lineNumber: number, column: number, mouseHorizontalOffset: number): MouseTarget {
		var pos = new Position(lineNumber, column);

		var lineWidth = this.viewHelper.getLineWidth(lineNumber);

		if (mouseHorizontalOffset > lineWidth) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_EMPTY, pos);
		}

		var visibleRange = this.viewHelper.visibleRangeForPosition2(lineNumber, column);

		if (!visibleRange) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.UNKNOWN, pos);
		}

		var columnHorizontalOffset = visibleRange.left;

		if (mouseHorizontalOffset === columnHorizontalOffset) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_TEXT, pos);
		}

		var mouseIsBetween: boolean;
		if (column > 1) {
			var prevColumnHorizontalOffset = visibleRange.left;
			mouseIsBetween = false;
			mouseIsBetween = mouseIsBetween || (prevColumnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < columnHorizontalOffset); // LTR case
			mouseIsBetween = mouseIsBetween || (columnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < prevColumnHorizontalOffset); // RTL case
			if (mouseIsBetween) {
				var rng = new EditorRange(lineNumber, column, lineNumber, column - 1);
				return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_TEXT, pos, rng);
			}
		}

		var lineMaxColumn = this.context.model.getLineMaxColumn(lineNumber);
		if (column < lineMaxColumn) {
			var nextColumnVisibleRange = this.viewHelper.visibleRangeForPosition2(lineNumber, column + 1);
			if (nextColumnVisibleRange) {
				var nextColumnHorizontalOffset = nextColumnVisibleRange.left;
				mouseIsBetween = false;
				mouseIsBetween = mouseIsBetween || (columnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < nextColumnHorizontalOffset); // LTR case
				mouseIsBetween = mouseIsBetween || (nextColumnHorizontalOffset < mouseHorizontalOffset && mouseHorizontalOffset < columnHorizontalOffset); // RTL case
				if (mouseIsBetween) {
					var rng = new EditorRange(lineNumber, column, lineNumber, column + 1);
					return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_TEXT, pos, rng);
				}
			}
		}

		return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_TEXT, pos);
	}

	private createMouseTargetFromContentWidgetsChild(target: Element): MouseTarget {
		var widgetId = this._findAttribute(target, 'widgetId', this.viewHelper.viewDomNode);

		if (widgetId) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.CONTENT_WIDGET, null, null, widgetId);
		} else {
			return new MouseTarget(target, EditorCommon.MouseTargetType.UNKNOWN);
		}
	}

	private createMouseTargetFromOverlayWidgetsChild(target: Element): MouseTarget {
		var widgetId = this._findAttribute(target, 'widgetId', this.viewHelper.viewDomNode);

		if (widgetId) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.OVERLAY_WIDGET, null, null, widgetId);
		} else {
			return new MouseTarget(target, EditorCommon.MouseTargetType.UNKNOWN);
		}
	}

	private createMouseTargetFromLinesDecorationsChild(target: Element, mouseVerticalOffset: number): MouseTarget {
		var viewZoneData = this._getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE, viewZoneData.position, null, viewZoneData);
		}

		var res = this._getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_LINE_DECORATIONS, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private createMouseTargetFromLineNumbers(target: Element, mouseVerticalOffset: number): MouseTarget {
		var viewZoneData = this._getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE, viewZoneData.position, null, viewZoneData);
		}

		var res = this._getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_LINE_NUMBERS, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private createMouseTargetFromGlyphMargin(target: Element, mouseVerticalOffset: number): MouseTarget {
		var viewZoneData = this._getZoneAtCoord(mouseVerticalOffset);
		if (viewZoneData) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_VIEW_ZONE, viewZoneData.position, null, viewZoneData);
		}

		var res = this._getFullLineRangeAtCoord(mouseVerticalOffset);
		return new MouseTarget(target, EditorCommon.MouseTargetType.GUTTER_GLYPH_MARGIN, new Position(res.range.startLineNumber, res.range.startColumn), res.range, res.isAfterLines);
	}

	private createMouseTargetFromScrollbar(target: Element, mouseVerticalOffset: number): MouseTarget {
		var possibleLineNumber = this.viewHelper.getLineNumberAtVerticalOffset(mouseVerticalOffset);
		var maxColumn = this.context.model.getLineMaxColumn(possibleLineNumber);
		return new MouseTarget(target, EditorCommon.MouseTargetType.SCROLLBAR, new Position(possibleLineNumber, maxColumn));
	}

	private createMouseTargetFromUnknownTarget(target: Element): MouseTarget {
		var isInView = this._isChild(target, this.viewHelper.viewDomNode, this.viewHelper.viewDomNode);
		var widgetId = null;
		if (isInView) {
			widgetId = this._findAttribute(target, 'widgetId', this.viewHelper.viewDomNode);
		}

		if (widgetId) {
			return new MouseTarget(target, EditorCommon.MouseTargetType.OVERLAY_WIDGET, null, null, widgetId);
		} else {
			return new MouseTarget(target, EditorCommon.MouseTargetType.UNKNOWN);
		}
	}
}