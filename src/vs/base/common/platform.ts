/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// --- THIS FILE IS TEMPORARY UNTIL ENV.TS IS CLEANED UP. IT CAN SAFELY BE USED IN ALL TARGET EXECUTION ENVIRONMENTS (node & dom) ---

let _isWindows = false;
let _isMacintosh = false;
let _isLinux = false;
let _isNative = false;
let _isWeb = false;
let _isQunit = false;

interface INodeProcess {
	platform: string;
}
declare let process: INodeProcess;
declare let global: any;

interface INavigator {
	userAgent:string;
}
declare let navigator: INavigator;
declare let self: any;

// OS detection
if (typeof process === 'object') {
	_isWindows = (process.platform === 'win32');
	_isMacintosh = (process.platform === 'darwin');
	_isLinux = (process.platform === 'linux');
	_isNative = true;
} else if (typeof navigator === 'object') {
	let userAgent = navigator.userAgent;
	_isWindows = userAgent.indexOf('Windows') >= 0;
	_isMacintosh = userAgent.indexOf('Macintosh') >= 0;
	_isLinux = userAgent.indexOf('Linux') >= 0;
	_isWeb = true;

	_isQunit = !!(<any>self).QUnit;
}

export enum Platform {
	Web,
	Mac,
	Linux,
	Windows
}

export let _platform:Platform = Platform.Web;
if (_isNative) {
	if (_isMacintosh) {
		_platform = Platform.Mac;
	} else if (_isWindows) {
		_platform = Platform.Windows;
	} else if (_isLinux) {
		_platform = Platform.Linux;
	}
}

export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isNative = _isNative;
export const isWeb = _isWeb;
export const isQunit = _isQunit;
export const platform = _platform;

export interface TimeoutToken {
}

export interface IntervalToken {
}

interface IGlobals {
	Worker?: any;
	setTimeout(callback: (...args: any[]) => void, delay: number, ...args: any[]): TimeoutToken;
	clearTimeout(token: TimeoutToken): void;

	setInterval(callback: (...args: any[]) => void, delay: number, ...args: any[]): IntervalToken;
	clearInterval(token: IntervalToken);
}

const _globals = <IGlobals> (typeof self === 'object' ? self : global);
export const globals: any = _globals;

export function hasWebWorkerSupport(): boolean {
	return typeof _globals.Worker !== 'undefined';
}
export const setTimeout = _globals.setTimeout.bind(_globals);
export const clearTimeout = _globals.clearTimeout.bind(_globals);

export const setInterval = _globals.setInterval.bind(_globals);
export const clearInterval = _globals.clearInterval.bind(_globals);