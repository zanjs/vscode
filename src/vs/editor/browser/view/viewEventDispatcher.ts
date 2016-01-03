/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EventEmitter = require('vs/base/common/eventEmitter');

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');

export class ViewEventDispatcher implements EditorCommon.IViewEventBus {

	private eventHandlerGateKeeper:(callback:()=>void)=>void;
	private eventHandlers:EditorBrowser.IViewEventHandler[];
	private eventQueue:EventEmitter.IEmitterEvent[];
	private isConsumingQueue:boolean;

	constructor(eventHandlerGateKeeper:(callback:()=>void)=>void) {
		this.eventHandlerGateKeeper = eventHandlerGateKeeper;
		this.eventHandlers = [];
		this.eventQueue = [];
		this.isConsumingQueue = false;
	}

	public addEventHandler(eventHandler: EditorBrowser.IViewEventHandler): void {
		for (var i = 0, len = this.eventHandlers.length; i < len; i++) {
			if (this.eventHandlers[i] === eventHandler) {
				console.warn('Detected duplicate listener in ViewEventDispatcher', eventHandler);
			}
		}
		this.eventHandlers.push(eventHandler);
	}

	public removeEventHandler(eventHandler:EditorBrowser.IViewEventHandler): void {
		for (var i = 0; i < this.eventHandlers.length; i++) {
			if (this.eventHandlers[i] === eventHandler) {
				this.eventHandlers.splice(i, 1);
				break;
			}
		}
	}

	public emit(eventType:string, data?:any): void {
		this.eventQueue.push(new EventEmitter.EmitterEvent(eventType, data));
		if (!this.isConsumingQueue) {
			this.consumeQueue();
		}
	}

	public emitMany(events:EventEmitter.IEmitterEvent[]): void {
		this.eventQueue = this.eventQueue.concat(events);
		if (!this.isConsumingQueue) {
			this.consumeQueue();
		}
	}

	private consumeQueue(): void {
		this.eventHandlerGateKeeper(() => {
			try {
				this.isConsumingQueue = true;

				var i:number,
					len:number,
					eventHandlers:EditorBrowser.IViewEventHandler[],
					events:EventEmitter.IEmitterEvent[];

				while (this.eventQueue.length > 0) {
					// Empty event queue, as events might come in while sending these off
					events = this.eventQueue;
					this.eventQueue = [];

					// Use a clone of the event handlers list, as they might remove themselves
					eventHandlers = this.eventHandlers.slice(0);
					for (i = 0, len = eventHandlers.length; i < len; i++) {
						eventHandlers[i].handleEvents(events);
					}
				}

			} finally {
				this.isConsumingQueue = false;
			}
		});
	}

}