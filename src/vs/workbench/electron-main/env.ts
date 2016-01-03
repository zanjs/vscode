/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import crypto = require('crypto');
import fs = require('fs');
import path = require('path');
import os = require('os');
import app = require('app');

import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import platform = require('vs/base/common/platform');
import uri from 'vs/base/common/uri';
import types = require('vs/base/common/types');

export interface IUpdateInfo {
	baseUrl: string;
}

export interface IProductConfiguration {
	nameShort: string;
	nameLong: string;
	icons: {
		application: {
			png: string;
		}
	};
	win32AppUserModelId: string;
	dataFolderName: string;
	downloadUrl: string;
	updateUrl: string;
	commit: string;
	date: string;
	expiryDate: number;
	expiryUrl: string;
	extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
	};
	crashReporter: ICrashReporterConfigBrowser;
	welcomePage: string;
	enableTelemetry: boolean;
	aiConfig: {
		key: string;
		asimovKey: string;
	};
	sendASmile: {
		submitUrl: string,
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
	documentationUrl: string;
	releaseNotesUrl: string;
	twitterUrl: string;
	requestFeatureUrl: string;
	reportIssueUrl: string;
	licenseUrl: string;
	privacyStatementUrl: string;
}

export const isBuilt = !process.env.VSCODE_DEV;

export const appRoot = path.dirname(uri.parse(require.toUrl('')).fsPath);

let productContents: IProductConfiguration;
try {
	productContents = JSON.parse(fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8'));
} catch (error) {
	productContents = Object.create(null);
}

export const product: IProductConfiguration = productContents;
product.nameShort = product.nameShort || 'Code [OSS Build]';
product.nameLong = product.nameLong || 'Code [OSS Build]';
product.dataFolderName = product.dataFolderName || (isBuilt ? '.code-oss-build' : '.code-oss-build-dev');

export const updateInfo: IUpdateInfo = product.updateUrl ? { baseUrl: product.updateUrl } : void 0;

export const mainIPCHandle = getMainIPCHandle();
export const sharedIPCHandle = getSharedIPCHandle();
export const version = app.getVersion();
export const cliArgs = parseCli();

export const appHome = app.getPath('userData');

export const appSettingsHome = path.join(appHome, 'User');
if (!fs.existsSync(appSettingsHome)) {
	fs.mkdirSync(appSettingsHome);
}
export const appSettingsPath = path.join(appSettingsHome, 'settings.json');
export const appKeybindingsPath = path.join(appSettingsHome, 'keybindings.json');

export const userHome = path.join(app.getPath('home'), product.dataFolderName);
if (!fs.existsSync(userHome)) {
	fs.mkdirSync(userHome);
}

export const userPluginsHome = cliArgs.pluginHomePath || path.join(userHome, 'extensions');
if (!fs.existsSync(userPluginsHome)) {
	fs.mkdirSync(userPluginsHome);
}

// Helper to identify if we have plugin tests to run from the command line without debugger
export const isTestingFromCli = cliArgs.pluginTestsPath && !cliArgs.debugBrkPluginHost;

export function log(...a: any[]): void {
	if (cliArgs.verboseLogging) {
		console.log.apply(null, a);
	}
}

export interface IProcessEnvironment {
	[key: string]: string;
}

export interface ICommandLineArguments {
	verboseLogging: boolean;
	debugPluginHostPort: number;
	debugBrkPluginHost: boolean;
	logPluginHostCommunication: boolean;
	disablePlugins: boolean;

	pluginHomePath: string;
	pluginDevelopmentPath: string;
	pluginTestsPath: string;

	programStart: number;

	pathArguments?: string[];

	workers?: number;

	enablePerformance?: boolean;

	firstrun?: boolean;

	openNewWindow?: boolean;
	openInSameWindow?: boolean;

	gotoLineMode?: boolean;
}

function parseCli(): ICommandLineArguments {

	// We need to do some argv massaging. First, remove the Electron executable
	let args = Array.prototype.slice.call(process.argv, 1);

	// Then, when in dev, remove the first non option argument, it will be the app location
	if (!isBuilt) {
		let i = (() => {
			for (let j = 0; j < args.length; j++) {
				if (args[j][0] !== '-') {
					return j;
				}
			}

			return -1;
		})();

		if (i > -1) {
			args.splice(i, 1);
		}
	}

	// Finally, any extra arguments in the 'argv' file should be prepended
	if (fs.existsSync(path.join(appRoot, 'argv'))) {
		let extraargs: string[] = JSON.parse(fs.readFileSync(path.join(appRoot, 'argv'), 'utf8'));
		args = extraargs.concat(args);
	}

	let opts = parseOpts(args);

	let gotoLineMode = !!opts['g'] || !!opts['goto'];

	let debugBrkPluginHostPort = parseNumber(args, '--debugBrkPluginHost', 5870);
	let debugPluginHostPort: number;
	let debugBrkPluginHost: boolean;
	if (debugBrkPluginHostPort) {
		debugPluginHostPort = debugBrkPluginHostPort;
		debugBrkPluginHost = true;
	} else {
		debugPluginHostPort = parseNumber(args, '--debugPluginHost', 5870, isBuilt ? void 0 : 5870);
	}

	return {
		pathArguments: parsePathArguments(args, gotoLineMode),
		programStart: parseNumber(args, '--timestamp', 0, 0),
		workers: parseNumber(args, '--workers', -1, -1),
		enablePerformance: !!opts['p'],
		verboseLogging: !!opts['verbose'],
		debugPluginHostPort: debugPluginHostPort,
		debugBrkPluginHost: debugBrkPluginHost,
		logPluginHostCommunication: !!opts['logPluginHostCommunication'],
		firstrun: !!opts['squirrel-firstrun'],
		openNewWindow: !!opts['n'] || !!opts['new-window'],
		openInSameWindow: !!opts['r'] || !!opts['reuse-window'],
		gotoLineMode: gotoLineMode,
		pluginHomePath: normalizePath(parseString(args, '--extensionHomePath')),
		pluginDevelopmentPath: normalizePath(parseString(args, '--extensionDevelopmentPath')),
		pluginTestsPath: normalizePath(parseString(args, '--extensionTestsPath')),
		disablePlugins: !!opts['disableExtensions'] || !!opts['disable-extensions']
	};
}

function getIPCHandleName(): string {
	let handleName = app.getName();

	if (!isBuilt) {
		handleName += '-dev';
	}

	// Support to run VS Code multiple times as different user
	// by making the socket unique over the logged in user
	let userId = uniqueUserId();
	if (userId) {
		handleName += ('-' + userId);
	}

	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\' + handleName;
	}

	return path.join(os.tmpdir(), handleName);
}

function getMainIPCHandle(): string {
	return getIPCHandleName() + (process.platform === 'win32' ? '-sock' : '.sock');
}

function getSharedIPCHandle(): string {
	return getIPCHandleName() + '-shared' + (process.platform === 'win32' ? '-sock' : '.sock');
}

function uniqueUserId(): string {
	let username: string;
	if (platform.isWindows) {
		username = process.env.USERNAME;
	} else {
		username = process.env.USER;
	}

	if (!username) {
		return ''; // fail gracefully if there is no user name
	}

	// use sha256 to ensure the userid value can be used in filenames and are unique
	return crypto.createHash('sha256').update(username).digest('hex').substr(0, 6);
}

type OptionBag = { [opt: string]: boolean; };

function parseOpts(argv: string[]): OptionBag {
	return argv
		.filter(a => /^-/.test(a))
		.map(a => a.replace(/^-*/, ''))
		.reduce((r, a) => { r[a] = true; return r; }, <OptionBag>{});
}

function parsePathArguments(argv: string[], gotoLineMode?: boolean): string[] {
	return arrays.coalesce(							// no invalid paths
		arrays.distinct(							// no duplicates
			argv.filter(a => !(/^-/.test(a))) 		// arguments without leading "-"
				.map((arg) => {
					let pathCandidate = arg;

					let parsedPath: IParsedPath;
					if (gotoLineMode) {
						parsedPath = parseLineAndColumnAware(arg);
						pathCandidate = parsedPath.path;
					}

					if (pathCandidate) {
						pathCandidate = massagePath(pathCandidate);
					}

					let realPath: string;
					try {
						realPath = fs.realpathSync(pathCandidate);
					} catch (error) {
						// in case of an error, assume the user wants to create this file
						// if the path is relative, we join it to the cwd
						realPath = path.normalize(path.isAbsolute(pathCandidate) ? pathCandidate : path.join(process.cwd(), pathCandidate));
					}

					if (!paths.isValidBasename(path.basename(realPath))) {
						return null; // do not allow invalid file names
					}

					if (gotoLineMode) {
						parsedPath.path = realPath;
						return toLineAndColumnPath(parsedPath);
					}

					return realPath;
				}),
			(element) => {
				return element && (platform.isWindows || platform.isMacintosh) ? element.toLowerCase() : element; // only linux is case sensitive on the fs
			}
		)
	);
}

function massagePath(path: string): string {
	if (platform.isWindows) {
		path = strings.rtrim(path, '"'); // https://github.com/Microsoft/vscode/issues/1498
	}

	// Trim whitespaces
	path = strings.trim(strings.trim(path, ' '), '\t');

	// Remove trailing dots
	path = strings.rtrim(path, '.');

	return path;
}

function normalizePath(p?: string): string {
	return p ? path.normalize(p) : p;
}

function parseNumber(argv: string[], key: string, defaultValue?: number, fallbackValue?: number): number {
	let value: number;

	for (let i = 0; i < argv.length; i++) {
		let segments = argv[i].split('=');
		if (segments[0] === key) {
			value = Number(segments[1]) || defaultValue;
			break;
		}
	}

	return types.isNumber(value) ? value : fallbackValue;
}

function parseString(argv: string[], key: string, defaultValue?: string, fallbackValue?: string): string {
	let value: string;

	for (let i = 0; i < argv.length; i++) {
		let segments = argv[i].split('=');
		if (segments[0] === key) {
			value = String(segments[1]) || defaultValue;
			break;
		}
	}

	return types.isString(value) ? strings.trim(value, '"') : fallbackValue;
}

export function getPlatformIdentifier(): string {
	if (process.platform === 'linux') {
		return `linux-${process.arch}`;
	}

	return process.platform;
}

export interface IParsedPath {
	path: string;
	line?: number;
	column?: number;
}

export function parseLineAndColumnAware(rawPath: string): IParsedPath {
	let segments = rawPath.split(':'); // C:\file.txt:<line>:<column>

	let path: string;
	let line: number = null;
	let column: number = null;

	segments.forEach(segment => {
		let segmentAsNumber = Number(segment);
		if (!types.isNumber(segmentAsNumber)) {
			path = !!path ? [path, segment].join(':') : segment; // a colon can well be part of a path (e.g. C:\...)
		} else if (line === null) {
			line = segmentAsNumber;
		} else if (column === null) {
			column = segmentAsNumber;
		}
	});

	return {
		path: path,
		line: line !== null ? line : void 0,
		column: column !== null ? column : line !== null ? 1 : void 0 // if we have a line, make sure column is also set
	};
}

export function toLineAndColumnPath(parsedPath: IParsedPath): string {
	let segments = [parsedPath.path];

	if (types.isNumber(parsedPath.line)) {
		segments.push(String(parsedPath.line));
	}

	if (types.isNumber(parsedPath.column)) {
		segments.push(String(parsedPath.column));
	}

	return segments.join(':');
}