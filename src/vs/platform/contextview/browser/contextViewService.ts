/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ContextMenuHandler} from './contextMenuHandler';
import {IContextViewService, IContextMenuService, IContextViewDelegate, IContextMenuDelegate} from './contextView';
import {ContextView} from 'vs/base/browser/ui/contextview/contextview';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IMessageService} from 'vs/platform/message/common/message';

export class ContextViewService implements IContextViewService {
	public serviceId = IContextViewService;

	private contextView: ContextView;

	constructor(container: HTMLElement, telemetryService:ITelemetryService, messageService:IMessageService) {
		this.contextView = new ContextView(container);
	}

	public dispose():void {
		this.contextView.dispose();
	}

	// ContextView

	public setContainer(container: HTMLElement): void {
		this.contextView.setContainer(container);
	}

	public showContextView(delegate: IContextViewDelegate):void {
		this.contextView.show(delegate);
	}

	public layout():void {
		this.contextView.layout();
	}

	public hideContextView(data?: any):void {
		this.contextView.hide(data);
	}
}