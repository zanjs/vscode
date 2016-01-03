/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Arrays = require('vs/base/common/arrays');
import Lifecycle = require('vs/base/common/lifecycle');
import DomUtils = require('vs/base/browser/dom');

export namespace EventType {
	export var Tap = '-monaco-gesturetap';
	export var Change = '-monaco-gesturechange';
	export var Start = '-monaco-gesturestart';
	export var End = '-monaco-gesturesend';
}

interface TouchData {
	id:number;
	initialTarget:EventTarget;
	initialTimeStamp:number;
	initialPageX:number;
	initialPageY:number;
	rollingTimestamps:number[];
	rollingPageX:number[];
	rollingPageY:number[];
}

export interface GestureEvent extends MouseEvent {
	initialTarget:EventTarget;
	translationX:number;
	translationY:number;
	pageX:number;
	pageY:number;
}

interface Touch {
	identifier:number;
	screenX:number;
	screenY:number;
	clientX:number;
	clientY:number;
	pageX:number;
	pageY:number;
	radiusX:number;
	radiusY:number;
	rotationAngle:number;
	force:number;
	target:Element;
}

interface TouchList {
	[i:number]:Touch;
	length:number;
	item(index:number):Touch;
	identifiedTouch(id:number):Touch;
}

interface TouchEvent extends Event {
	touches:TouchList;
	targetTouches:TouchList;
	changedTouches:TouchList;
}

export class Gesture implements Lifecycle.IDisposable {

	private static HOLD_DELAY = 2000;
	private static SCROLL_FRICTION = -0.005;

	private targetElement:HTMLElement;
	private callOnTarget:Function[];
	private handle: Lifecycle.IDisposable;

	private activeTouches:{[id:number]:TouchData;};

	constructor(target:HTMLElement) {
		this.callOnTarget = [];
		this.activeTouches = {};
		this.target = target;
		this.handle = null;
	}

	public dispose(): void {
		this.target = null;
		if (this.handle) {
			this.handle.dispose();
			this.handle = null;
		}
	}

	public set target(element:HTMLElement) {
		Lifecycle.cAll(this.callOnTarget);

		this.activeTouches = {};

		this.targetElement = element;

		if(!this.targetElement) {
			return;
		}

		this.callOnTarget.push(DomUtils.addListener(this.targetElement, 'touchstart', (e) => this.onTouchStart(e)));
		this.callOnTarget.push(DomUtils.addListener(this.targetElement, 'touchend', (e) => this.onTouchEnd(e)));
		this.callOnTarget.push(DomUtils.addListener(this.targetElement, 'touchmove', (e) => this.onTouchMove(e)));
	}

	private static newGestureEvent(type:string):GestureEvent {
		var event = <GestureEvent> (<any> document.createEvent('CustomEvent'));
		event.initEvent(type, false, true);
		return event;
	}

	private onTouchStart(e:TouchEvent): void {
		var timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

		if (this.handle) {
			this.handle.dispose();
			this.handle = null;
		}

		for(var i = 0, len = e.targetTouches.length; i < len; i++) {
			var touch = e.targetTouches.item(i);

			this.activeTouches[touch.identifier] = {
				id: touch.identifier,
				initialTarget: touch.target,
				initialTimeStamp: timestamp,
				initialPageX: touch.pageX,
				initialPageY: touch.pageY,
				rollingTimestamps: [timestamp],
				rollingPageX: [touch.pageX],
				rollingPageY: [touch.pageY]
			};

			var evt = Gesture.newGestureEvent(EventType.Start);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.targetElement.dispatchEvent(evt);
		}
	}

	private onTouchEnd(e:TouchEvent): void {
		var timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

		var activeTouchCount = Object.keys(this.activeTouches).length;

		for(var i = 0, len = e.changedTouches.length; i < len; i++) {

			var touch = e.changedTouches.item(i);

			if(!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
				console.warn('move of an UNKNOWN touch', touch);
				continue;
			}

			var data = this.activeTouches[touch.identifier],
				holdTime = Date.now() - data.initialTimeStamp;

			if(holdTime < Gesture.HOLD_DELAY &&
				Math.abs(data.initialPageX - Arrays.tail(data.rollingPageX)) < 30 &&
				Math.abs(data.initialPageY - Arrays.tail(data.rollingPageY)) < 30) {

				var evt = Gesture.newGestureEvent(EventType.Tap);
				evt.initialTarget = data.initialTarget;
				evt.pageX = Arrays.tail(data.rollingPageX);
				evt.pageY = Arrays.tail(data.rollingPageY);
				this.targetElement.dispatchEvent(evt);

			} else if(activeTouchCount === 1) {
				var finalX = Arrays.tail(data.rollingPageX);
				var finalY = Arrays.tail(data.rollingPageY);

				var deltaT = Arrays.tail(data.rollingTimestamps) - data.rollingTimestamps[0];
				var deltaX = finalX - data.rollingPageX[0];
				var deltaY = finalY - data.rollingPageY[0];

				this.inertia(timestamp,		// time now
					Math.abs(deltaX) / deltaT,	// speed
					deltaX > 0 ? 1 : -1,		// x direction
					finalX,						// x now
					Math.abs(deltaY) / deltaT,  // y speed
					deltaY > 0 ? 1 : -1,		// y direction
					finalY						// y now
				);
			}

			// forget about this touch
			delete this.activeTouches[touch.identifier];
		}
	}

	private inertia(t1:number, vX:number, dirX: number, x:number, vY:number, dirY: number, y:number): void {
		this.handle = DomUtils.scheduleAtNextAnimationFrame(() => {
			var now = Date.now();

			// velocity: old speed + accel_over_time
			var deltaT = now - t1,
				delta_pos_x = 0, delta_pos_y = 0,
				stopped = true;

			vX += Gesture.SCROLL_FRICTION * deltaT;
			vY += Gesture.SCROLL_FRICTION * deltaT;

			if(vX > 0) {
				stopped = false;
				delta_pos_x = dirX * vX * deltaT;
			}

			if(vY > 0) {
				stopped = false;
				delta_pos_y = dirY * vY * deltaT;
			}

			// dispatch translation event
			var evt = Gesture.newGestureEvent(EventType.Change);
			evt.translationX = delta_pos_x;
			evt.translationY = delta_pos_y;
			this.targetElement.dispatchEvent(evt);

			if(!stopped) {
				this.inertia(now, vX, dirX, x + delta_pos_x, vY, dirY, y + delta_pos_y);
			}
		});
	}

	private onTouchMove(e:TouchEvent): void {
		var timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

		for(var i = 0, len = e.changedTouches.length; i < len; i++) {

			var touch = e.changedTouches.item(i);

			if(!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
				console.warn('end of an UNKNOWN touch', touch);
				continue;
			}

			var data = this.activeTouches[touch.identifier];

			var evt = Gesture.newGestureEvent(EventType.Change);
			evt.translationX = touch.pageX - Arrays.tail(data.rollingPageX);
			evt.translationY = touch.pageY - Arrays.tail(data.rollingPageY);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.targetElement.dispatchEvent(evt);

			// only keep a few data points, to average the final speed
			if (data.rollingPageX.length > 3) {
				data.rollingPageX.shift();
				data.rollingPageY.shift();
				data.rollingTimestamps.shift();
			}

			data.rollingPageX.push(touch.pageX);
			data.rollingPageY.push(touch.pageY);
			data.rollingTimestamps.push(timestamp);
		}
	}
}
