/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./zoneWidget';
import domUtils = require('vs/base/browser/dom');
import Objects = require('vs/base/common/objects');
import Events = require('vs/base/common/eventEmitter');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export interface IOptions {
	showFrame?: boolean;
	showArrow?: boolean;
	frameColor?: string;
	className?: string;
}

var defaultOptions:IOptions = {
	showArrow: true,
	showFrame: true,
	frameColor: '',
	className: ''
};

var WIDGET_ID = 'vs.editor.contrib.zoneWidget';

class ViewZoneDelegate implements EditorBrowser.IViewZone {

	public domNode:HTMLElement;
	public afterLineNumber:number;
	public afterColumn:number;
	public heightInLines:number;
	private _onDomNodeTop:(top:number)=>void;
	private _onComputedHeight:(height:number)=>void;

	constructor (domNode:HTMLElement, afterLineNumber:number, afterColumn:number, heightInLines:number, onDomNodeTop:(top:number)=>void, onComputedHeight:(height:number)=>void) {
		this.domNode = domNode;
		this.afterLineNumber = afterLineNumber;
		this.afterColumn = afterColumn;
		this.heightInLines = heightInLines;
		this._onDomNodeTop = onDomNodeTop;
		this._onComputedHeight = onComputedHeight;
	}

	public onDomNodeTop(top:number):void {
		this._onDomNodeTop(top);
	}

	public onComputedHeight(height:number):void {
		this._onComputedHeight(height);
	}
}

class OverlayWidgetDelegate implements EditorBrowser.IOverlayWidget {

	private _id: string;
	private _domNode: HTMLElement;

	constructor (id: string, domNode: HTMLElement) {
		this._id = id;
		this._domNode = domNode;
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return null;
	}

}

// TODO@Joh - this is an event emitter, why?
export class ZoneWidget extends Events.EventEmitter {

	private zoneId:number;
	private lastView:any;
	private overlayWidget: OverlayWidgetDelegate;

	public container: HTMLElement;
	public shadowTop: HTMLElement;
	public shadowBottom: HTMLElement;
	public domNode:HTMLElement;
	public position:EditorCommon.IPosition;
	public editor:EditorBrowser.ICodeEditor;
	public options:IOptions;

	private listenersToRemove:Events.ListenerUnbind[];

	constructor(editor:EditorBrowser.ICodeEditor, options:IOptions = {}) {
		super();
		this.editor = editor;
		this.options = Objects.mixin(Objects.clone(defaultOptions), options);
		this.zoneId = -1;
		this.overlayWidget = null;
		this.lastView = null;
		this.domNode = document.createElement('div');
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setAttribute('role', 'presentation');

		this.container = null;
		this.listenersToRemove = [];
		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.EditorLayout, (info:EditorCommon.IEditorLayoutInfo) => {
			var width = this.getWidth(info);
			this.domNode.style.width = width + 'px';
			this.onWidth(width);
		}));
	}

	public create():void {

		domUtils.addClass(this.domNode, 'zone-widget');
		domUtils.addClass(this.domNode, this.options.className);

		this.container = document.createElement('div');
		domUtils.addClass(this.container, 'zone-widget-container');
		this.domNode.appendChild(this.container);

		this.fillContainer(this.container);
	}

	private getWidth(info:EditorCommon.IEditorLayoutInfo=this.editor.getLayoutInfo()):number {
		return info.width - info.verticalScrollbarWidth;
	}

	private onViewZoneTop(top:number):void {
		this.domNode.style.top = top + 'px';
	}

	private onViewZoneHeight(height:number):void {
		this.domNode.style.height = height + 'px';
	}

	public show(where:EditorCommon.IRange, heightInLines:number):void;
	public show(where:EditorCommon.IPosition, heightInLines:number):void;
	public show(where:any, heightInLines:number):void {
		if(typeof where.startLineNumber === 'number') {
			this.showImpl(<EditorCommon.IRange>where, heightInLines);
		} else {
			this.showImpl({
				startLineNumber: (<EditorCommon.IPosition>where).lineNumber,
				startColumn: (<EditorCommon.IPosition>where).column,
				endLineNumber: (<EditorCommon.IPosition>where).lineNumber,
				endColumn: (<EditorCommon.IPosition>where).column
			}, heightInLines);
		}
	}

	private showImpl(where:EditorCommon.IRange, heightInLines:number):void {
		var position = {
			lineNumber: where.startLineNumber,
			column: where.startColumn
		};

		this.domNode.style.width = this.getWidth() + 'px';

		// Reveal position, to get the line rendered, such that the arrow can be positioned properly
		this.editor.revealPosition(position);

		// Render the widget as zone (rendering) and widget (lifecycle)
		var viewZoneDomNode = document.createElement('div'),
			arrow = document.createElement('div'),
			lineHeight = this.editor.getConfiguration().lineHeight,
			containerHeight = heightInLines * lineHeight,
			arrowHeight = 0, frameThickness = 0;

		// Render the arrow one 1/3 of an editor line height
		if(this.options.showArrow) {
			arrowHeight = Math.round(lineHeight / 3);
			containerHeight -= 2 * arrowHeight;

			arrow = document.createElement('div');
			arrow.className = 'zone-widget-arrow below';
			arrow.style.top = -arrowHeight + 'px';
			arrow.style.borderWidth = arrowHeight + 'px';
			arrow.style.left = this.editor.getOffsetForColumn(position.lineNumber, position.column) + 'px';
			arrow.style.borderBottomColor = this.options.frameColor;

			viewZoneDomNode.appendChild(arrow);
		}

		// Render the frame as 1/9 of an editor line height
		if(this.options.showFrame) {
			frameThickness = Math.round(lineHeight / 9);
			containerHeight -= 2 * frameThickness;
		}

		// insert zone widget
		this.editor.changeViewZones((accessor:EditorBrowser.IViewZoneChangeAccessor) => {
			if (this.zoneId !== -1) {
				accessor.removeZone(this.zoneId);
			}
			if (this.overlayWidget) {
				this.editor.removeOverlayWidget(this.overlayWidget);
				this.overlayWidget = null;
			}
			this.domNode.style.top = '-1000px';
			var viewZone = new ViewZoneDelegate(
				viewZoneDomNode,
				position.lineNumber,
				position.column,
				heightInLines,
				(top:number) => this.onViewZoneTop(top),
				(height:number) => this.onViewZoneHeight(height)
			);
			this.zoneId = accessor.addZone(viewZone);
			this.overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this.zoneId, this.domNode);
			this.editor.addOverlayWidget(this.overlayWidget);
		});


		if(this.options.showFrame) {
			this.container.style.borderTopColor = this.options.frameColor;
			this.container.style.borderBottomColor = this.options.frameColor;
			this.container.style.borderTopWidth = frameThickness + 'px';
			this.container.style.borderBottomWidth = frameThickness + 'px';
		}

		this.container.style.top = arrowHeight + 'px';
		this.container.style.height = containerHeight + 'px';
		this.container.style.overflow = 'hidden';


		this.doLayout(containerHeight);

		this.editor.setSelection(where);

		// Reveal the line above or below the zone widget, to get the zone widget in the viewport
		var revealLineNumber = Math.min(this.editor.getModel().getLineCount(), Math.max(1, where.endLineNumber + 1));
		this.editor.revealLine(revealLineNumber);

		this.position = position;
	}

	public dispose():void {

		this.listenersToRemove.forEach(function (element) {
			element();
		});
		this.listenersToRemove = [];

		if (this.overlayWidget) {
			this.editor.removeOverlayWidget(this.overlayWidget);
			this.overlayWidget = null;
		}

		if (this.zoneId !== -1) {
			this.editor.changeViewZones((accessor) => {
				accessor.removeZone(this.zoneId);
				this.zoneId = -1;
			});
		}
	}

	public fillContainer(container:HTMLElement):void {
		// implement in subclass
	}

	public onWidth(widthInPixel:number):void {
		// implement in subclass
	}

	public doLayout(heightInPixel:number):void {
		// implement in subclass
	}
}

