/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {OverviewRulerImpl} from 'vs/editor/browser/viewParts/overviewRuler/overviewRulerImpl';
import {ViewPart} from 'vs/editor/browser/view/viewPart';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Themes = require('vs/platform/theme/common/themes');

export class DecorationsOverviewRuler extends ViewPart {

	static DECORATION_HEIGHT = 6;

	private static _CURSOR_COLOR = 'rgba(0, 0, 102, 0.8)';
	private static _CURSOR_COLOR_DARK = 'rgba(152, 152, 152, 0.8)';

	private _overviewRuler:OverviewRulerImpl;

	private _shouldUpdateDecorations:boolean;
	private _shouldUpdateCursorPosition:boolean;
	private _shouldForceRender:boolean;
	private _hideCursor:boolean;

	private _zonesFromDecorations: EditorBrowser.IOverviewRulerZone[];
	private _zonesFromCursors: EditorBrowser.IOverviewRulerZone[];

	private _cursorPositions: EditorCommon.IEditorPosition[];

	constructor(context:EditorBrowser.IViewContext, scrollHeight:number, getVerticalOffsetForLine:(lineNumber:number)=>number) {
		super(context);
		this._overviewRuler = new OverviewRulerImpl(1, 'decorationsOverviewRuler', scrollHeight, this._context.configuration.editor.lineHeight,
					DecorationsOverviewRuler.DECORATION_HEIGHT, DecorationsOverviewRuler.DECORATION_HEIGHT, getVerticalOffsetForLine);
		this._overviewRuler.setLanesCount(this._context.configuration.editor.overviewRulerLanes, false);
		let theme = this._context.configuration.editor.theme;
		this._overviewRuler.setUseDarkColor(!Themes.isLightTheme(theme), false);

		this._shouldUpdateDecorations = true;
		this._zonesFromDecorations = [];

		this._shouldUpdateCursorPosition = true;
		this._hideCursor = this._context.configuration.editor.hideCursorInOverviewRuler;

		this._shouldForceRender = false;

		this._zonesFromCursors = [];
		this._cursorPositions = [];
	}

	public dispose(): void {
		super.dispose();
		this._overviewRuler.dispose();
	}

	// ---- begin view event handlers

	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this._shouldUpdateCursorPosition = true;
		this._cursorPositions = [ e.position ];
		this._cursorPositions = this._cursorPositions.concat(e.secondaryPositions);
		return true;
	}

	public onConfigurationChanged(e:EditorCommon.IConfigurationChangedEvent): boolean {
		var prevLanesCount = this._overviewRuler.getLanesCount();
		var newLanesCount = this._context.configuration.editor.overviewRulerLanes;

		var shouldRender = false;

		if (e.lineHeight) {
			this._overviewRuler.setLineHeight(this._context.configuration.editor.lineHeight, false);
			this._shouldForceRender = true;
			shouldRender = true;
		}

		if (prevLanesCount !== newLanesCount) {
			this._overviewRuler.setLanesCount(newLanesCount, false);
			this._shouldForceRender = true;
			shouldRender = true;
		}

		if (e.hideCursorInOverviewRuler) {
			this._hideCursor = this._context.configuration.editor.hideCursorInOverviewRuler;
			this._shouldUpdateCursorPosition = true;
			shouldRender = true;
		}

		if (e.theme) {
			let theme = this._context.configuration.editor.theme;
			this._overviewRuler.setUseDarkColor(!Themes.isLightTheme(theme), false);
			this._shouldForceRender = true;
			shouldRender = true;
		}

		return shouldRender;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this._shouldForceRender = true;
		this._requestModificationFrame(() => {
			this._overviewRuler.setLayout(layoutInfo.overviewRuler, false);
		});
		return true;
	}

	public onZonesChanged(): boolean {
		return true;
	}

	public onModelFlushed(): boolean {
		this._shouldUpdateCursorPosition = true;
		this._shouldUpdateDecorations = true;
		return true;
	}

	public onModelDecorationsChanged(e:EditorCommon.IViewDecorationsChangedEvent): boolean {
		this._shouldUpdateDecorations = true;
		return true;
	}

	public onScrollHeightChanged(scrollHeight:number): boolean {
		this._overviewRuler.setScrollHeight(scrollHeight, false);
		this._shouldForceRender = true;
		return true;
	}

	// ---- end view event handlers

	public getDomNode(): HTMLElement {
		return this._overviewRuler.getDomNode();
	}

	private _createZonesFromDecorations(): EditorBrowser.IOverviewRulerZone[] {
		var decorations = this._context.model.getAllDecorations(),
			zones:EditorBrowser.IOverviewRulerZone[] = [],
			i:number,
			len:number,
			dec:EditorCommon.IModelDecoration;

		for (i = 0, len = decorations.length; i < len; i++) {
			dec = decorations[i];
			if (dec.options.overviewRuler.color) {
				zones.push({
					startLineNumber: dec.range.startLineNumber,
					endLineNumber: dec.range.endLineNumber,
					color: dec.options.overviewRuler.color,
					darkColor: dec.options.overviewRuler.darkColor,
					position: dec.options.overviewRuler.position
				});
			}
		}

		return zones;
	}

	private _createZonesFromCursors(): EditorBrowser.IOverviewRulerZone[] {
		var zones:EditorBrowser.IOverviewRulerZone[] = [],
			i:number,
			len:number,
			cursor:EditorCommon.IEditorPosition;

		for (i = 0, len = this._cursorPositions.length; i < len; i++) {
			cursor = this._cursorPositions[i];

			zones.push({
				forceHeight: 2,
				startLineNumber: cursor.lineNumber,
				endLineNumber: cursor.lineNumber,
				color: DecorationsOverviewRuler._CURSOR_COLOR,
				darkColor: DecorationsOverviewRuler._CURSOR_COLOR_DARK,
				position: EditorCommon.OverviewRulerLane.Full
			});
		}

		return zones;
	}

	_render(ctx:EditorBrowser.IRenderingContext): void {

		var shouldForceRender = this._shouldForceRender;
		this._shouldForceRender = false;

		// Update decorations if necessary
		var shouldRender = false;
		if (this._shouldUpdateDecorations || this._shouldUpdateCursorPosition) {

			if (this._shouldUpdateDecorations) {
				this._shouldUpdateDecorations = false;
				this._zonesFromDecorations = this._createZonesFromDecorations();
			}

			if (this._shouldUpdateCursorPosition) {
				this._shouldUpdateCursorPosition = false;
				if (this._hideCursor) {
					this._zonesFromCursors = [];
				} else {
					this._zonesFromCursors = this._createZonesFromCursors();
				}
			}

			var allZones:EditorBrowser.IOverviewRulerZone[] = [];
			allZones = allZones.concat(this._zonesFromCursors);
			allZones = allZones.concat(this._zonesFromDecorations);

			this._overviewRuler.setZones(allZones, false);

			shouldRender = true;
		}

		if (shouldRender || shouldForceRender) {
			this._requestModificationFrame(() => {
				var hasRendered = this._overviewRuler.render(shouldForceRender);

				if (hasRendered && OverviewRulerImpl.hasCanvas && this._overviewRuler.getLanesCount() > 0 && (this._zonesFromDecorations.length > 0 || this._zonesFromCursors.length > 0)) {
					var ctx2 = this._overviewRuler.getDomNode().getContext('2d');
					ctx2.beginPath();
					ctx2.lineWidth = 1;
					ctx2.strokeStyle = 'rgba(197,197,197,0.8)';
					ctx2.rect(0, 0, this._overviewRuler.getWidth(), this._overviewRuler.getHeight());
					ctx2.stroke();
				}
			});
		}
	}
}
