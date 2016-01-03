/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Promise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {Action} from 'vs/base/common/actions';

export interface IMessageWithAction {
	message: string;
	actions: Action[];
}

export interface IConfirmation {
	title?: string;
	message: string;
	detail?: string;
	primaryButton?: string;
	secondaryButton?: string;
}

export var CloseAction = new Action('close.message', nls.localize('close', "Close"), null, true, () => Promise.as(true));
export var CancelAction = new Action('close.message', nls.localize('cancel', "Cancel"), null, true, () => Promise.as(true));

export var IMessageService = createDecorator<IMessageService>('messageService');

export interface IMessageService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Tells the service to show a message with a given severity
	 * the returned function can be used to hide the message again
	 */
	show(sev: Severity, message: string): () => void;
	show(sev: Severity, message: Error): () => void;
	show(sev: Severity, message: string[]): () => void;
	show(sev: Severity, message: Error[]): () => void;
	show(sev: Severity, message: IMessageWithAction): () => void;

	/**
	 * Prints something to the status bar area with optional auto dispose and delay.
	 */
	setStatusMessage(message: string, autoDisposeAfter?: number, delayBy?: number): IDisposable;

	/**
	 * Hide any messages showing currently.
	 */
	hideAll(): void;

	/**
	 * Ask the user for confirmation.
	 */
	confirm(confirmation: IConfirmation): boolean;
}

export import Severity = Severity;