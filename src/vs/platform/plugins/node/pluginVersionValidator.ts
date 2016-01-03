/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IPluginDescription, IPointListener, IActivationEventListener, IMessage} from 'vs/platform/plugins/common/plugins';
import {isValidPluginDescription as baseIsValidPluginDescription} from 'vs/platform/plugins/common/pluginsRegistry';
import * as semver from 'semver';

export interface IParsedVersion {
	hasCaret: boolean;
	majorBase: number;
	majorMustEqual: boolean;
	minorBase: number;
	minorMustEqual: boolean;
	patchBase: number;
	patchMustEqual: boolean;
	preRelease: string;
}

export interface INormalizedVersion {
	majorBase: number;
	majorMustEqual: boolean;
	minorBase: number;
	minorMustEqual: boolean;
	patchBase: number;
	patchMustEqual: boolean;
}

const VERSION_REGEXP = /^(\^)?((\d+)|x)\.((\d+)|x)\.((\d+)|x)(\-.*)?$/;

export function isValidVersionStr(version:string): boolean {
	version = version.trim();
	return (version === '*' || VERSION_REGEXP.test(version));
}

export function parseVersion(version:string): IParsedVersion {
	if (!isValidVersionStr(version)) {
		return null;
	}

	version = version.trim();

	if (version === '*') {
		return {
			hasCaret: false,
			majorBase: 0,
			majorMustEqual: false,
			minorBase: 0,
			minorMustEqual: false,
			patchBase: 0,
			patchMustEqual: false,
			preRelease: null
		};
	}

	let m = version.match(VERSION_REGEXP);
	return {
		hasCaret: !!m[1],
		majorBase: m[2] === 'x' ? 0 : parseInt(m[2], 10),
		majorMustEqual: (m[2] === 'x' ? false : true),
		minorBase: m[4] === 'x' ? 0 : parseInt(m[4], 10),
		minorMustEqual: (m[4] === 'x' ? false : true),
		patchBase: m[6] === 'x' ? 0 : parseInt(m[6], 10),
		patchMustEqual: (m[6] === 'x' ? false : true),
		preRelease: m[8] || null
	};
}

export function normalizeVersion(version: IParsedVersion): INormalizedVersion {
	if (!version) {
		return null;
	}

	let majorBase = version.majorBase,
		majorMustEqual = version.majorMustEqual,
		minorBase = version.minorBase,
		minorMustEqual = version.minorMustEqual,
		patchBase = version.patchBase,
		patchMustEqual = version.patchMustEqual;

	if (version.hasCaret) {
		if (majorBase === 0) {
			patchMustEqual = false;
		} else {
			minorMustEqual = false;
			patchMustEqual = false;
		}
	}

	return {
		majorBase: majorBase,
		majorMustEqual: majorMustEqual,
		minorBase: minorBase,
		minorMustEqual: minorMustEqual,
		patchBase: patchBase,
		patchMustEqual: patchMustEqual
	};
}

export function isValidVersion(_version:string|INormalizedVersion, _desiredVersion:string|INormalizedVersion): boolean {
	let version:INormalizedVersion;
	if (typeof _version === 'string') {
		version = normalizeVersion(parseVersion(_version));
	} else {
		version = _version;
	}

	let desiredVersion:INormalizedVersion;
	if (typeof _desiredVersion === 'string') {
		desiredVersion = normalizeVersion(parseVersion(_desiredVersion));
	} else {
		desiredVersion = _desiredVersion;
	}

	if (!version || !desiredVersion) {
		return false;
	}

	if (version.majorBase < desiredVersion.majorBase) {
		// smaller major version
		return false;
	}

	if (version.majorBase > desiredVersion.majorBase) {
		// higher major version
		return (!desiredVersion.majorMustEqual);
	}

	// at this point, majorBase are equal

	if (version.minorBase < desiredVersion.minorBase) {
		// smaller minor version
		return false;
	}

	if (version.minorBase > desiredVersion.minorBase) {
		// higher minor version
		return (!desiredVersion.minorMustEqual);
	}

	// at this point, minorBase are equal

	if (version.patchBase < desiredVersion.patchBase) {
		// smaller patch version
		return false;
	}

	if (version.patchBase > desiredVersion.patchBase) {
		// higher patch version
		return (!desiredVersion.patchMustEqual);
	}

	// at this point, patchBase are equal
	return true;
}

export interface IReducedExtensionDescription {
	isBuiltin: boolean;
	engines: {
		vscode: string;
	};
	main?: string;
}

export function isValidExtensionVersion(version: string, extensionDesc:IReducedExtensionDescription, notices:string[]): boolean {

	if (extensionDesc.isBuiltin || typeof extensionDesc.main === 'undefined') {
		// No version check for builtin or declarative extensions
		return true;
	}

	let desiredVersion = normalizeVersion(parseVersion(extensionDesc.engines.vscode));
	if (!desiredVersion) {
		notices.push(nls.localize('versionSyntax', "Could not parse `engines.vscode` value {0}. Please use, for example: ^0.10.0, ^1.2.3, ^0.11.0, ^0.10.x, etc.", extensionDesc.engines.vscode));
		return false;
	}

	// enforce that a breaking API version is specified.
	// for 0.X.Y, that means up to 0.X must be specified
	// otherwise for Z.X.Y, that means Z must be specified
	if (desiredVersion.majorBase === 0) {
		// force that major and minor must be specific
		if (!desiredVersion.majorMustEqual || !desiredVersion.minorMustEqual) {
			notices.push(nls.localize('versionSpecificity1', "Version specified in `engines.vscode` ({0}) is not specific enough. For vscode versions before 1.0.0, please define at a minimum the major and minor desired version. E.g. ^0.10.0, 0.10.x, 0.11.0, etc.", extensionDesc.engines.vscode));
			return false;
		}
	} else {
		// force that major must be specific
		if (!desiredVersion.majorMustEqual) {
			notices.push(nls.localize('versionSpecificity2', "Version specified in `engines.vscode` ({0}) is not specific enough. For vscode versions after 1.0.0, please define at a minimum the major desired version. E.g. ^1.10.0, 1.10.x, 1.x.x, 2.x.x, etc.", extensionDesc.engines.vscode));
			return false;
		}
	}

	if (!isValidVersion(version, desiredVersion)) {
		notices.push(nls.localize('versionMismatch', "Extension is not version compatible with VSCode. VSCode version: {0}, extension's declared engine: {1}", version, extensionDesc.engines.vscode));
		return false;
	}

	return true;
}

export function isValidPluginDescription(version: string, extensionFolderPath: string, pluginDescription:IPluginDescription, notices:string[]): boolean {

	if (!baseIsValidPluginDescription(extensionFolderPath, pluginDescription, notices)) {
		return false;
	}

	if (!semver.valid(pluginDescription.version)) {
		notices.push(nls.localize('notSemver', "Extension version is not semver compatible."));
		return false;
	}

	return isValidExtensionVersion(version, pluginDescription, notices);
}