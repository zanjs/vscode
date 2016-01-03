/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment} from 'vs/workbench/services/statusbar/common/statusbarService';
import {IDisposable} from 'vs/base/common/lifecycle';
import {StatusBarAlignment as ExtHostStatusBarAlignment, Disposable} from './extHostTypes';
import {StatusBarItem, StatusBarAlignment} from 'vscode';

export class ExtHostStatusBarEntry implements StatusBarItem {
	private static ID_GEN = 0;

	private _id: number;
	private _alignment: number;
	private _priority: number;
	private _disposed: boolean;
	private _visible: boolean;

	private _text: string;
	private _tooltip: string;
	private _color: string;
	private _command: string;

	private _timeoutHandle: number;
	private _proxy: MainThreadStatusBar;

	constructor(proxy: MainThreadStatusBar, alignment: ExtHostStatusBarAlignment = ExtHostStatusBarAlignment.Left, priority?: number) {
		this._id = ExtHostStatusBarEntry.ID_GEN++;
		this._proxy = proxy;
		this._alignment = alignment;
		this._priority = priority;
	}

	public get id(): number {
		return this._id;
	}

	public get alignment(): StatusBarAlignment {
		return this._alignment;
	}

	public get priority(): number {
		return this._priority;
	}

	public get text(): string {
		return this._text;
	}

	public get tooltip(): string {
		return this._tooltip;
	}

	public get color(): string {
		return this._color;
	}

	public get command(): string {
		return this._command;
	}

	public set text(text: string) {
		this._text = text;
		this.update();
	}

	public set tooltip(tooltip: string) {
		this._tooltip = tooltip;
		this.update();
	}

	public set color(color: string) {
		this._color = color;
		this.update();
	}

	public set command(command: string) {
		this._command = command;
		this.update();
	}

	public show(): void {
		this._visible = true;
		this.update();
	}

	public hide(): void {
		this._visible = false;
		this._proxy.dispose(this.id);
	}

	private update(): void {
		if (this._disposed || !this._visible) {
			return;
		}

		if (this._timeoutHandle) {
			clearTimeout(this._timeoutHandle);
		}

		// Defer the update so that multiple changes to setters dont cause a redraw each
		this._timeoutHandle = setTimeout(() => {
			delete this._timeoutHandle;

			// Set to status bar
			this._proxy.setEntry(this.id, this.text, this.tooltip, this.command, this.color,
				this._alignment === ExtHostStatusBarAlignment.Left ? MainThreadStatusBarAlignment.LEFT : MainThreadStatusBarAlignment.RIGHT,
				this._priority);
		}, 0);
	}

	public dispose(): void {
		this.hide();
		this._disposed = true;
	}
}

class StatusBarMessage {

	private _item: StatusBarItem;
	private _messages: { message: string }[] = [];

	constructor(statusBar: ExtHostStatusBar) {
		this._item = statusBar.createStatusBarEntry(ExtHostStatusBarAlignment.Left, Number.MIN_VALUE);
	}

	dispose() {
		this._messages.length = 0;
		this._item.dispose();
	}

	setMessage(message: string): Disposable {
		const data: { message: string } = { message }; // use object to not confuse equal strings
		this._messages.unshift(data);
		this._update();

		return new Disposable(() => {
			let idx = this._messages.indexOf(data);
			if (idx >= 0) {
				this._messages.splice(idx, 1);
				this._update();
			}
		});
	}

	private _update() {
		if (this._messages.length > 0) {
			this._item.text = this._messages[0].message;
			this._item.show();
		} else {
			this._item.hide();
		}
	}
}

export class ExtHostStatusBar {

	private _proxy: MainThreadStatusBar;
	private _statusMessage: StatusBarMessage;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadStatusBar);
		this._statusMessage = new StatusBarMessage(this);
	}

	createStatusBarEntry(alignment?: ExtHostStatusBarAlignment, priority?: number): StatusBarItem {
		return new ExtHostStatusBarEntry(this._proxy, alignment, priority);
	}

	setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): Disposable {

		let d = this._statusMessage.setMessage(text);
		let handle: number;

		if (typeof timeoutOrThenable === 'number') {
			handle = setTimeout(() => d.dispose(), timeoutOrThenable);
		} else if (typeof timeoutOrThenable !== 'undefined') {
			timeoutOrThenable.then(() => d.dispose(), () => d.dispose());
		}

		return new Disposable(() => {
			d.dispose();
			clearTimeout(handle);
		});
	}
}

@Remotable.MainContext('MainThreadStatusBar')
export class MainThreadStatusBar {
	private mapIdToDisposable: { [id: number]: IDisposable };

	constructor(
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.mapIdToDisposable = Object.create(null);
	}

	setEntry(id: number, text: string, tooltip: string, command: string, color: string, alignment: MainThreadStatusBarAlignment, priority: number): void {

		// Dispose any old
		this.dispose(id);

		// Add new
		let disposeable = this.statusbarService.addEntry({ text, tooltip, command, color }, alignment, priority);
		this.mapIdToDisposable[id] = disposeable;
	}

	dispose(id: number) {
		let disposeable = this.mapIdToDisposable[id];
		if (disposeable) {
			disposeable.dispose();
		}

		delete this.mapIdToDisposable[id];
	}
}