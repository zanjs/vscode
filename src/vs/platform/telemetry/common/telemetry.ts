/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Lifecycle = require('vs/base/common/lifecycle');
import Timer = require('vs/base/common/timer');
import {createDecorator, ServiceIdentifier, IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export var ID = 'telemetryService';

export var ITelemetryService = createDecorator<ITelemetryService>(ID);

export interface ITelemetryInfo {
		sessionId: string;
		machineId: string;
		instanceId: string;
}

export interface ITelemetryService extends Lifecycle.IDisposable {
	serviceId : ServiceIdentifier<any>;

	/**
	 * Sends a telemetry event that has been privacy approved.
	 * Do not call this unless you have been given approval.
	 */
	publicLog(eventName: string, data?: any):void;

	/**
	 * Starts a telemetry timer. Call stop() to send the event.
	 */
	start(name:string, data?:any):Timer.ITimerEvent;

	/**
	 * Session Id
	 */
	getSessionId(): string;

	/**
	 * a unique Id that is not hardware specific
	 */
	getInstanceId(): string;

	/**
	 * a hardware specific machine Id
	 */
	getMachineId(): string;

	getTelemetryInfo(): Thenable<ITelemetryInfo>;

	/**
	 * Appender operations
	 */
	getAppendersCount(): number;
	getAppenders(): ITelemetryAppender[];
	addTelemetryAppender(appender: ITelemetryAppender): void;
	removeTelemetryAppender(appender: ITelemetryAppender): void;
	setInstantiationService(instantiationService: IInstantiationService): void;
}

export interface ITelemetryAppender extends Lifecycle.IDisposable {
	log(eventName: string, data?: any): void;
}

export function anonymize(input: string): string {
	if (!input) {
		return input;
	}

	var r = '';
	for (var i = 0; i < input.length; i++) {
		var ch = input[i];
		if (ch >= '0' && ch <= '9') {
			r += '0';
			continue;
		}
		if (ch >= 'a' && ch <= 'z') {
			r += 'a';
			continue;
		}
		if (ch >= 'A' && ch <= 'Z') {
			r += 'A';
			continue;
		}
		r += ch;
	}
	return r;
}