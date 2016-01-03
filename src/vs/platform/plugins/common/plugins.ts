/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier, IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {TPromise} from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';

export interface IPluginDescription {
	id: string;
	name: string;
	version: string;
	publisher: string;
	isBuiltin: boolean;
	extensionFolderPath: string;
	extensionDependencies?: string[];
	activationEvents?: string[];
	engines: {
		vscode: string;
	};
	main?: string;
	contributes?: { [point: string]: any; };
	isAMD: boolean;
}

export interface IActivationEventListener {
	():void;
}

export interface IPointListener {
	(desc: IPluginDescription[]): void;
}

export var IPluginService = createDecorator<IPluginService>('pluginService');

export interface IMessage {
	type: Severity;
	message: string;
	source: string;
}

export interface IPluginStatus {
	messages: IMessage[];
}

export interface IPluginService {
	serviceId: ServiceIdentifier<any>;

	activateByEvent(activationEvent:string): TPromise<any>;
	activateAndGet(pluginId:string): TPromise<any>;
	activateAndGet<T>(pluginId:string): TPromise<T>;
	isActivated(pluginId:string): boolean;

	/**
	 * This method should be called only on shutdown!
	 * More work is needed for this to be called any time!
	 */
	deactivate(pluginId:string): void;

	/**
	 * To be used only by the platform once on startup.
	 */
	registrationDone(errors?:IMessage[]): void;

	registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void;

	get(pluginId:string): any;

	/**
	 * Block on this signal any interactions with extensions.
	 */
	onReady(): TPromise<boolean>;
	getPluginsStatus(): { [id: string]: IPluginStatus };
}

export var INSTANCE:IPluginService = null;