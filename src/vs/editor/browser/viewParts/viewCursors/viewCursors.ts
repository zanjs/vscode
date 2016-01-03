/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./viewCursors';
import Browser = require('vs/base/browser/browser');

import {ViewCursor} from 'vs/editor/browser/viewParts/viewCursors/viewCursor';
import {ViewPart} from 'vs/editor/browser/view/viewPart';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

enum RenderType {
	Hidden,
	Visible,
	Blink
}

export class ViewCursors extends ViewPart {

	static BLINK_INTERVAL = 500;

	private _isVisible:boolean;

	private _domNode:HTMLElement;

	private _blinkTimer:number;

	private _editorHasFocus:boolean;

	private _primaryCursor: ViewCursor;
	private _secondaryCursors: ViewCursor[];

	constructor(context:EditorBrowser.IViewContext) {
		super(context);

		this._primaryCursor = new ViewCursor(this._context, false);
		this._secondaryCursors = [];

		this._domNode = document.createElement('div');
		this._domNode.className = EditorBrowser.ClassNames.VIEW_CURSORS_LAYER;
		if (Browser.canUseTranslate3d) {
			this._domNode.style.transform = 'translate3d(0px, 0px, 0px)';
		}

		this._domNode.appendChild(this._primaryCursor.getDomNode());

		this._blinkTimer = -1;

		this._editorHasFocus = false;
		this._updateBlinking();
	}

	public dispose(): void {
		super.dispose();
		if (this._blinkTimer !== -1) {
			window.clearInterval(this._blinkTimer);
			this._blinkTimer = -1;
		}
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		this._primaryCursor.onModelFlushed();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			var domNode = this._secondaryCursors[i].getDomNode();
			domNode.parentNode.removeChild(domNode);
		}
		this._secondaryCursors = [];
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
	public onModelTokensChanged(e:EditorCommon.IViewTokensChangedEvent): boolean {
		var shouldRender = (position:EditorCommon.IPosition) => {
			return e.fromLineNumber <= position.lineNumber && position.lineNumber <= e.toLineNumber;
		};
		if (shouldRender(this._primaryCursor.getPosition())) {
			return true;
		}
		for (var i = 0; i < this._secondaryCursors.length; i++) {
			if (shouldRender(this._secondaryCursors[i].getPosition())) {
				return true;
			}
		}
		return false;
	}
	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this._primaryCursor.onCursorPositionChanged(e.position, e.isInEditableRange);
		this._updateBlinking();

		if (this._secondaryCursors.length < e.secondaryPositions.length) {
			// Create new cursors
			var addCnt = e.secondaryPositions.length - this._secondaryCursors.length;
			for (var i = 0; i < addCnt; i++) {
				var newCursor = new ViewCursor(this._context, true);
				this._primaryCursor.getDomNode().parentNode.insertBefore(newCursor.getDomNode(), this._primaryCursor.getDomNode().nextSibling);
				this._secondaryCursors.push(newCursor);
			}
		} else if (this._secondaryCursors.length > e.secondaryPositions.length) {
			// Remove some cursors
			var removeCnt = this._secondaryCursors.length - e.secondaryPositions.length;
			for (var i = 0; i < removeCnt; i++) {
				this._secondaryCursors[0].getDomNode().parentNode.removeChild(this._secondaryCursors[0].getDomNode());
				this._secondaryCursors.splice(0, 1);
			}
		}

		for (var i = 0; i < e.secondaryPositions.length; i++) {
			this._secondaryCursors[i].onCursorPositionChanged(e.secondaryPositions[i], e.isInEditableRange);
		}

		return true;
	}
	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		this._primaryCursor.onConfigurationChanged(e);
		this._updateBlinking();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].onConfigurationChanged(e);
		}
		return true;
	}
	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		return true;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		return false;
	}
	public onViewFocusChanged(isFocused:boolean): boolean {
		this._editorHasFocus = isFocused;
		this._updateBlinking();
		return false;
	}
	// --- end event handlers

	public getPosition(): EditorCommon.IPosition {
		return this._primaryCursor.getPosition();
	}

// ---- blinking logic

	private _getRenderType(): RenderType {
		if (this._editorHasFocus) {
			if (this._primaryCursor.getIsInEditableRange() && !this._context.configuration.editor.readOnly) {
				switch (this._context.configuration.editor.cursorBlinking) {
					case ("blink"):
						return RenderType.Blink;
					case ("visible"):
						return RenderType.Visible;
					case ("hidden"):
						return RenderType.Hidden;
					default:
						return RenderType.Blink;
				}
			}
			return RenderType.Visible;
		}
		return RenderType.Hidden;
	}

	private _updateBlinking(): void {
		if (this._blinkTimer !== -1) {
			window.clearInterval(this._blinkTimer);
			this._blinkTimer = -1;
		}

		var renderType = this._getRenderType();

		if (renderType === RenderType.Visible || renderType === RenderType.Blink) {
			this._show();
		} else {
			this._hide();
		}

		if (renderType === RenderType.Blink) {
			this._blinkTimer = window.setInterval(() => this._blink(), ViewCursors.BLINK_INTERVAL);
		}
	}
// --- end blinking logic

	private _blink(): void {
		if (this._isVisible) {
			this._hide();
		} else {
			this._show();
		}
	}

	private _show(): void {
		this._primaryCursor.show();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].show();
		}
		this._isVisible = true;
	}

	private _hide(): void {
		this._primaryCursor.hide();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].hide();
		}
		this._isVisible = false;
	}

	// ---- IViewPart implementation

	_render(ctx:EditorBrowser.IRenderingContext): void {
		this._primaryCursor.prepareRender(ctx);
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].prepareRender(ctx);
		}

		this._requestModificationFrame(() => {
			this._primaryCursor.render(ctx);
			for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
				this._secondaryCursors[i].render(ctx);
			}
		});
	}
}
