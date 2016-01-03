/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IPluginDescription, IPluginService, IMessage, IPointListener, IActivationEventListener, IPluginStatus } from 'vs/platform/plugins/common/plugins';
import WinJS = require('vs/base/common/winjs.base');
import {IDisposable} from 'vs/base/common/lifecycle';
import Errors = require('vs/base/common/errors');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import Severity from 'vs/base/common/severity';

var hasOwnProperty = Object.hasOwnProperty;
var global = this;

export interface IPluginExports {
	// $isPluginExports:boolean;
}

export interface IPluginModule {
	activate(ctx: IPluginContext): WinJS.TPromise<IPluginExports>;
	deactivate(): void;
}

export interface IPluginContext {
	subscriptions: IDisposable[];
	workspaceState: IPluginMemento;
	globalState: IPluginMemento;
	extensionPath: string;
	asAbsolutePath(relativePath:string): string;
}

export interface IPluginMemento {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Thenable<boolean>;
}

export class ActivatedPlugin {
	activationFailed: boolean;
	module: IPluginModule;
	exports: IPluginExports;
	subscriptions: IDisposable[];

	constructor(activationFailed: boolean, module: IPluginModule, exports: IPluginExports, subscriptions: IDisposable[]) {
		this.activationFailed = activationFailed
		this.module = module;
		this.exports = exports;
		this.subscriptions = subscriptions;
	}
}

export interface IActivatedPluginMap {
	[pluginId: string]: ActivatedPlugin;
}

interface IActivatingPluginMap {
	[pluginId: string]: WinJS.TPromise<IPluginExports>;
}

export abstract class AbstractPluginService implements IPluginService {
	public serviceId = IPluginService;

	private activatingPlugins: IActivatingPluginMap;
	protected activatedPlugins: IActivatedPluginMap;
	private _onReady: WinJS.TPromise<boolean>;
	private _onReadyC: (v: boolean) => void;

	constructor(isReadyByDefault:boolean) {
		if (isReadyByDefault) {
			this._onReady = WinJS.TPromise.as(true);
			this._onReadyC = (v: boolean) => { /*No-op*/ };
		} else {
			this._onReady = new WinJS.TPromise<boolean>((c, e, p) => {
				this._onReadyC = c;
			}, () => {
				console.warn('You should really not try to cancel this ready promise!');
			});
		}
		this.activatingPlugins = {};
		this.activatedPlugins = {};
	}

	public abstract deactivate(pluginId:string): void;
	protected abstract _showMessage(severity:Severity, message:string): void;

	protected showMessage(severity:Severity, source:string, message:string): void {
		this._showMessage(severity, ( source ? '[' + source + ']: ' : '') + message);
	}

	public registrationDone(messages: IMessage[]): void {
		messages.forEach((entry) => {
			this.showMessage(entry.type, entry.source, entry.message);
		});
		this._onReadyC(true);
	}

	public registerOneTimeActivationEventListener(activationEvent: string, listener: IActivationEventListener): void {
		PluginsRegistry.registerOneTimeActivationEventListener(activationEvent, listener);
	}

	public onReady(): WinJS.TPromise<boolean> {
		return this._onReady;
	}

	public get(pluginId: string): IPluginExports {
		if (!hasOwnProperty.call(this.activatedPlugins, pluginId)) {
			throw new Error('Plugin `' + pluginId + '` is not known or not activated');
		}
		return this.activatedPlugins[pluginId].exports;
	}

	public getPluginsStatus(): { [id: string]: IPluginStatus } {
		return null;
	}

	public isActivated(pluginId:string): boolean {
		return hasOwnProperty.call(this.activatedPlugins, pluginId);
	}

	public activateByEvent(activationEvent: string): WinJS.TPromise<void> {
		return this._onReady.then(() => {
			PluginsRegistry.triggerActivationEventListeners(activationEvent);
			let activatePlugins = PluginsRegistry.getPluginDescriptionsForActivationEvent(activationEvent);
			return this._activatePlugins(activatePlugins, 0);
		});
	}

	public activateAndGet(pluginId: string): WinJS.TPromise<IPluginExports> {
		return this._onReady.then(() => {
			var desc = PluginsRegistry.getPluginDescription(pluginId);
			if (!desc) {
				throw new Error('Plugin `' + pluginId + '` is not known');
			}

			return this._activatePlugins([desc], 0).then(() => {
				return this.get(pluginId);
			});
		});
	}

	/**
	 * Handle semantics related to dependencies for `currentPlugin`.
	 * semantics: `redExtensions` must wait for `greenExtensions`.
	 */
	private _handleActivateRequest(currentPlugin:IPluginDescription, greenExtensions: { [id:string]: IPluginDescription; }, redExtensions: IPluginDescription[]): void {
		let depIds = (typeof currentPlugin.extensionDependencies === 'undefined' ? [] : currentPlugin.extensionDependencies);
		let currentPluginGetsGreenLight = true;

		for (let j = 0, lenJ = depIds.length; j < lenJ; j++) {
			let depId = depIds[j];
			let depDesc = PluginsRegistry.getPluginDescription(depId);

			if (!depDesc) {
				// Error condition 1: unknown dependency
				this._showMessage(Severity.Error, nls.localize('unknownDep', "Extension `{1}` failed to activate. Reason: unknown dependency `{0}`.", depId, currentPlugin.id));
				this.activatedPlugins[currentPlugin.id] = new ActivatedPlugin(true, { activate: undefined, deactivate: undefined }, {}, []);
				return;
			}

			if (hasOwnProperty.call(this.activatedPlugins, depId)) {
				let dep = this.activatedPlugins[depId];
				if (dep.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					this._showMessage(Severity.Error, nls.localize('failedDep', "Extension `{1}` failed to activate. Reason: dependency `{0}` failed to activate.", depId, currentPlugin.id));
					this.activatedPlugins[currentPlugin.id] = new ActivatedPlugin(true, { activate: undefined, deactivate: undefined }, {}, []);
					return;
				}
			} else {
				// must first wait for the dependency to activate
				currentPluginGetsGreenLight = false;
				greenExtensions[depId] = depDesc;
			}
		}

		if (currentPluginGetsGreenLight) {
			greenExtensions[currentPlugin.id] = currentPlugin;
		} else {
			redExtensions.push(currentPlugin);
		}
	}

	private _activatePlugins(pluginDescriptions: IPluginDescription[], recursionLevel:number): WinJS.TPromise<void> {
		// console.log(recursionLevel, '_activatePlugins: ', pluginDescriptions.map(p => p.id));
		if (pluginDescriptions.length === 0) {
			return WinJS.TPromise.as(void 0);
		}

		pluginDescriptions = pluginDescriptions.filter((p) => !hasOwnProperty.call(this.activatedPlugins, p.id));
		if (pluginDescriptions.length === 0) {
			return WinJS.TPromise.as(void 0);
		}

		if (recursionLevel > 10) {
			// More than 10 dependencies deep => most likely a dependency loop
			for (let i = 0, len = pluginDescriptions.length; i < len; i++) {
				// Error condition 3: dependency loop
				this._showMessage(Severity.Error, nls.localize('failedDep', "Extension `{0}` failed to activate. Reason: more than 10 levels of dependencies (most likely a dependency loop).", pluginDescriptions[i].id));
				this.activatedPlugins[pluginDescriptions[i].id] = new ActivatedPlugin(true, { activate: undefined, deactivate: undefined }, {}, []);
			}
			return WinJS.TPromise.as(void 0);
		}

		let greenMap: { [id:string]: IPluginDescription; } = Object.create(null),
			red: IPluginDescription[] = [];

		for (let i = 0, len = pluginDescriptions.length; i < len; i++) {
			this._handleActivateRequest(pluginDescriptions[i], greenMap, red);
		}

		// Make sure no red is also green
		for (let i = 0, len = red.length; i < len; i++) {
			if (greenMap[red[i].id]) {
				delete greenMap[red[i].id];
			}
		}

		let green = Object.keys(greenMap).map(id => greenMap[id]);

		// console.log('greenExtensions: ', green.map(p => p.id));
		// console.log('redExtensions: ', red.map(p => p.id));

		if (red.length === 0) {
			// Finally reached only leafs!
			return WinJS.TPromise.join(green.map((p) => this._activatePlugin(p))).then(_ => void 0);
		}

		return this._activatePlugins(green, recursionLevel + 1).then(_ => {
			return this._activatePlugins(red, recursionLevel + 1);
		});
	}

	protected _activatePlugin(pluginDescription: IPluginDescription): WinJS.TPromise<IPluginExports> {
		if (hasOwnProperty.call(this.activatedPlugins, pluginDescription.id)) {
			return WinJS.TPromise.as(this.activatedPlugins[pluginDescription.id].exports);
		}

		if (hasOwnProperty.call(this.activatingPlugins, pluginDescription.id)) {
			return this.activatingPlugins[pluginDescription.id];
		}

		this.activatingPlugins[pluginDescription.id] = this._actualActivatePlugin(pluginDescription).then(null, (err) => {
			this._showMessage(Severity.Error, nls.localize('activationError', "Activating extension `{0}` failed: {1}.", pluginDescription.id, err.message));
			console.error('Activating extension `' + pluginDescription.id + '` failed: ', err.message);
			console.log('Here is the error stack: ', err.stack);
			// Treat the plugin as being empty
			return new ActivatedPlugin(true, { activate: undefined, deactivate: undefined }, {}, []);
		}).then((x) => {
			this.activatedPlugins[pluginDescription.id] = x;
			delete this.activatingPlugins[pluginDescription.id];
			return x.exports;
		});

		return this.activatingPlugins[pluginDescription.id];
	}

	protected _actualActivatePlugin(pluginDescription: IPluginDescription): WinJS.TPromise<ActivatedPlugin> {
		if (!pluginDescription.main) {
			// Treat the plugin as being empty => NOT AN ERROR CASE
			return WinJS.TPromise.as(new ActivatedPlugin(false, { activate: undefined, deactivate: undefined }, {}, []));
		}
		return this._loadPluginModule(pluginDescription).then((pluginModule) => {
			return this._loadPluginContext(pluginDescription).then(context => {
				return AbstractPluginService._callActivate(pluginModule, context);
			});
		});
	}

	protected _loadPluginModule(pluginDescription: IPluginDescription): WinJS.TPromise<IPluginModule> {
		return loadAMDModule<IPluginModule>(pluginDescription.main);
	}

	protected _loadPluginContext(pluginDescription: IPluginDescription): WinJS.TPromise<IPluginContext> {
		return WinJS.TPromise.as(undefined);
	}

	private static _callActivate(pluginModule: IPluginModule, context: IPluginContext): WinJS.TPromise<ActivatedPlugin> {
		// Make sure the plugin's surface is not undefined
		pluginModule = pluginModule || {
			activate: undefined,
			deactivate: undefined
		};

		// let subscriptions:IDisposable[] = [];
		return this._callActivateOptional(pluginModule, context).then((pluginExports) => {
			return new ActivatedPlugin(false, pluginModule, pluginExports, context.subscriptions);
		});
	}

	private static _callActivateOptional(pluginModule: IPluginModule, context: IPluginContext): WinJS.TPromise<IPluginExports> {
		if (typeof pluginModule.activate === 'function') {
			try {
				return WinJS.TPromise.as(pluginModule.activate.apply(global, [context]));
			} catch (err) {
				return WinJS.TPromise.wrapError(err);
			}
		} else {
			// No activate found => the module is the plugin's exports
			return WinJS.TPromise.as<IPluginExports>(pluginModule);
		}
	}
}

export function loadAMDModule<T>(moduleId: string): WinJS.TPromise<T> {
	return new WinJS.TPromise<T>((c, e, p) => {
		require([moduleId], (r: T) => {
			c(r);
		}, e);
	});
}
