/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {
	isValidVersionStr, isValidVersion,
	parseVersion, IParsedVersion,
	normalizeVersion, INormalizedVersion,
	IReducedExtensionDescription, isValidExtensionVersion
} from 'vs/platform/plugins/node/pluginVersionValidator';

suite('Plugin Version Validator', () => {

	test('isValidVersionStr', () => {
		assert.equal(isValidVersionStr('0.10.0-dev'), true);
		assert.equal(isValidVersionStr('0.10.0'), true);
		assert.equal(isValidVersionStr('0.10.1'), true);
		assert.equal(isValidVersionStr('0.10.100'), true);
		assert.equal(isValidVersionStr('0.11.0'), true);

		assert.equal(isValidVersionStr('x.x.x'), true);
		assert.equal(isValidVersionStr('0.x.x'), true);
		assert.equal(isValidVersionStr('0.10.0'), true);
		assert.equal(isValidVersionStr('0.10.x'), true);
		assert.equal(isValidVersionStr('^0.10.0'), true);
		assert.equal(isValidVersionStr('*'), true);

		assert.equal(isValidVersionStr('0.x.x.x'), false);
		assert.equal(isValidVersionStr('0.10'), false);
		assert.equal(isValidVersionStr('0.10.'), false);
	});

	test('parseVersion', () => {
		function assertParseVersion(version:string, hasCaret:boolean, majorBase:number, majorMustEqual:boolean, minorBase:number, minorMustEqual:boolean, patchBase:number, patchMustEqual:boolean, preRelease:string): void {
			var actual = parseVersion(version);
			var expected: IParsedVersion = {
				hasCaret: hasCaret,
				majorBase: majorBase,
				majorMustEqual: majorMustEqual,
				minorBase: minorBase,
				minorMustEqual: minorMustEqual,
				patchBase: patchBase,
				patchMustEqual: patchMustEqual,
				preRelease: preRelease
			};
			assert.deepEqual(actual, expected, 'parseVersion for ' + version);
		}

		assertParseVersion('0.10.0-dev', false, 0, true, 10, true, 0, true, '-dev');
		assertParseVersion('0.10.0', false, 0, true, 10, true, 0, true, null);
		assertParseVersion('0.10.1', false, 0, true, 10, true, 1, true, null);
		assertParseVersion('0.10.100', false, 0, true, 10, true, 100, true, null);
		assertParseVersion('0.11.0', false, 0, true, 11, true, 0, true, null);

		assertParseVersion('x.x.x', false, 0, false, 0, false, 0, false, null);
		assertParseVersion('0.x.x', false, 0, true, 0, false, 0, false, null);
		assertParseVersion('0.10.x', false, 0, true, 10, true, 0, false, null);
		assertParseVersion('^0.10.0', true, 0, true, 10, true, 0, true, null);
		assertParseVersion('^0.10.2', true, 0, true, 10, true, 2, true, null);
		assertParseVersion('^1.10.2', true, 1, true, 10, true, 2, true, null);
		assertParseVersion('*', false, 0, false, 0, false, 0, false, null);
	});

	test('normalizeVersion', () => {
		function assertNormalizeVersion(version:string, majorBase:number, majorMustEqual:boolean, minorBase:number, minorMustEqual:boolean, patchBase:number, patchMustEqual:boolean): void {
			var actual = normalizeVersion(parseVersion(version));
			var expected: INormalizedVersion = {
				majorBase: majorBase,
				majorMustEqual: majorMustEqual,
				minorBase: minorBase,
				minorMustEqual: minorMustEqual,
				patchBase: patchBase,
				patchMustEqual: patchMustEqual
			};
			assert.deepEqual(actual, expected, 'parseVersion for ' + version);
		}

		assertNormalizeVersion('0.10.0-dev', 0, true, 10, true, 0, true);
		assertNormalizeVersion('0.10.0', 0, true, 10, true, 0, true);
		assertNormalizeVersion('0.10.1', 0, true, 10, true, 1, true);
		assertNormalizeVersion('0.10.100', 0, true, 10, true, 100, true);
		assertNormalizeVersion('0.11.0', 0, true, 11, true, 0, true);

		assertNormalizeVersion('x.x.x', 0, false, 0, false, 0, false);
		assertNormalizeVersion('0.x.x', 0, true, 0, false, 0, false);
		assertNormalizeVersion('0.10.x', 0, true, 10, true, 0, false);
		assertNormalizeVersion('^0.10.0', 0, true, 10, true, 0, false);
		assertNormalizeVersion('^0.10.2', 0, true, 10, true, 2, false);
		assertNormalizeVersion('^1.10.2', 1, true, 10, false, 2, false);
		assertNormalizeVersion('*', 0, false, 0, false, 0, false);
	});

	test('isValidVersion', () => {
		function testIsValidVersion(version:string, desiredVersion:string, expectedResult:boolean): void {
			let actual = isValidVersion(version, desiredVersion);
			assert.equal(actual, expectedResult, 'extension - vscode: ' + version + ', desiredVersion: ' + desiredVersion + ' should be ' + expectedResult);
		}

		testIsValidVersion('0.10.0-dev', 'x.x.x', true);
		testIsValidVersion('0.10.0-dev', '0.x.x', true);
		testIsValidVersion('0.10.0-dev', '0.10.0', true);
		testIsValidVersion('0.10.0-dev', '0.10.2', false);
		testIsValidVersion('0.10.0-dev', '^0.10.2', false);
		testIsValidVersion('0.10.0-dev', '0.10.x', true);
		testIsValidVersion('0.10.0-dev', '^0.10.0', true);
		testIsValidVersion('0.10.0-dev', '*', true);

		testIsValidVersion('0.10.0', 'x.x.x', true);
		testIsValidVersion('0.10.0', '0.x.x', true);
		testIsValidVersion('0.10.0', '0.10.0', true);
		testIsValidVersion('0.10.0', '0.10.2', false);
		testIsValidVersion('0.10.0', '^0.10.2', false);
		testIsValidVersion('0.10.0', '0.10.x', true);
		testIsValidVersion('0.10.0', '^0.10.0', true);
		testIsValidVersion('0.10.0', '*', true);

		testIsValidVersion('0.10.1', 'x.x.x', true);
		testIsValidVersion('0.10.1', '0.x.x', true);
		testIsValidVersion('0.10.1', '0.10.0', false);
		testIsValidVersion('0.10.1', '0.10.2', false);
		testIsValidVersion('0.10.1', '^0.10.2', false);
		testIsValidVersion('0.10.1', '0.10.x', true);
		testIsValidVersion('0.10.1', '^0.10.0', true);
		testIsValidVersion('0.10.1', '*', true);

		testIsValidVersion('0.10.100', 'x.x.x', true);
		testIsValidVersion('0.10.100', '0.x.x', true);
		testIsValidVersion('0.10.100', '0.10.0', false);
		testIsValidVersion('0.10.100', '0.10.2', false);
		testIsValidVersion('0.10.100', '^0.10.2', true);
		testIsValidVersion('0.10.100', '0.10.x', true);
		testIsValidVersion('0.10.100', '^0.10.0', true);
		testIsValidVersion('0.10.100', '*', true);

		testIsValidVersion('0.11.0', 'x.x.x', true);
		testIsValidVersion('0.11.0', '0.x.x', true);
		testIsValidVersion('0.11.0', '0.10.0', false);
		testIsValidVersion('0.11.0', '0.10.2', false);
		testIsValidVersion('0.11.0', '^0.10.2', false);
		testIsValidVersion('0.11.0', '0.10.x', false);
		testIsValidVersion('0.11.0', '^0.10.0', false);
		testIsValidVersion('0.11.0', '*', true);

		testIsValidVersion('1.0.0', 'x.x.x', true);
		testIsValidVersion('1.0.0', '0.x.x', false);
		testIsValidVersion('1.0.0', '0.10.0', false);
		testIsValidVersion('1.0.0', '0.10.2', false);
		testIsValidVersion('1.0.0', '^0.10.2', false);
		testIsValidVersion('1.0.0', '0.10.x', false);
		testIsValidVersion('1.0.0', '^0.10.0', false);
		testIsValidVersion('1.0.0', '*', true);
	});

	test('isValidExtensionVersion', () => {

		function testExtensionVersion(version:string, desiredVersion:string, isBuiltin:boolean, hasMain:boolean, expectedResult:boolean): void {
			let desc: IReducedExtensionDescription = {
				isBuiltin: isBuiltin,
				engines: {
					vscode: desiredVersion
				},
				main: hasMain ? 'something': undefined
			};
			let reasons: string[] = [];
			let actual = isValidExtensionVersion(version, desc, reasons);

			assert.equal(actual, expectedResult, "version: " + version + ", desiredVersion: " + desiredVersion + ", desc: " + JSON.stringify(desc) + ", reasons: " + JSON.stringify(reasons));
		}

		function testIsInvalidExtensionVersion(version:string, desiredVersion:string, isBuiltin:boolean, hasMain:boolean): void {
			testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, false);
		}

		function testIsValidExtensionVersion(version:string, desiredVersion:string, isBuiltin:boolean, hasMain:boolean): void {
			testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, true);
		}

		function testIsValidVersion(version:string, desiredVersion:string, expectedResult:boolean): void {
			testExtensionVersion(version, desiredVersion, false, true, expectedResult);
		}

		// builtin are allowed to use * or x.x.x
		testIsValidExtensionVersion('0.10.0-dev', '*', true, true);
		testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', true, true);
		testIsValidExtensionVersion('0.10.0-dev', '0.x.x', true, true);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', true, true);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', true, true);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', true, true);
		testIsValidExtensionVersion('0.10.0-dev', '*', true, false);
		testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', true, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.x.x', true, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', true, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', true, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', true, false);

		// normal extensions are allowed to use * or x.x.x only if they have no main
		testIsInvalidExtensionVersion('0.10.0-dev', '*', false, true);
		testIsInvalidExtensionVersion('0.10.0-dev', 'x.x.x', false, true);
		testIsInvalidExtensionVersion('0.10.0-dev', '0.x.x', false, true);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, true);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, true);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, true);
		testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
		testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);

		// extensions without "main" get no version check
		testIsValidExtensionVersion('0.10.0-dev', '>=0.9.1-pre.1', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
		testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
		testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
		testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
		testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);

		// normal extensions with code
		testIsValidVersion('0.10.0-dev', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.0-dev', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.0-dev', '0.10.0', true);
		testIsValidVersion('0.10.0-dev', '0.10.2', false);
		testIsValidVersion('0.10.0-dev', '^0.10.2', false);
		testIsValidVersion('0.10.0-dev', '0.10.x', true);
		testIsValidVersion('0.10.0-dev', '^0.10.0', true);
		testIsValidVersion('0.10.0-dev', '*', false); // fails due to lack of specificity

		testIsValidVersion('0.10.0', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.0', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.0', '0.10.0', true);
		testIsValidVersion('0.10.0', '0.10.2', false);
		testIsValidVersion('0.10.0', '^0.10.2', false);
		testIsValidVersion('0.10.0', '0.10.x', true);
		testIsValidVersion('0.10.0', '^0.10.0', true);
		testIsValidVersion('0.10.0', '*', false); // fails due to lack of specificity

		testIsValidVersion('0.10.1', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.1', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.1', '0.10.0', false);
		testIsValidVersion('0.10.1', '0.10.2', false);
		testIsValidVersion('0.10.1', '^0.10.2', false);
		testIsValidVersion('0.10.1', '0.10.x', true);
		testIsValidVersion('0.10.1', '^0.10.0', true);
		testIsValidVersion('0.10.1', '*', false); // fails due to lack of specificity

		testIsValidVersion('0.10.100', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.100', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.10.100', '0.10.0', false);
		testIsValidVersion('0.10.100', '0.10.2', false);
		testIsValidVersion('0.10.100', '^0.10.2', true);
		testIsValidVersion('0.10.100', '0.10.x', true);
		testIsValidVersion('0.10.100', '^0.10.0', true);
		testIsValidVersion('0.10.100', '*', false); // fails due to lack of specificity

		testIsValidVersion('0.11.0', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.11.0', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('0.11.0', '0.10.0', false);
		testIsValidVersion('0.11.0', '0.10.2', false);
		testIsValidVersion('0.11.0', '^0.10.2', false);
		testIsValidVersion('0.11.0', '0.10.x', false);
		testIsValidVersion('0.11.0', '^0.10.0', false);
		testIsValidVersion('0.11.0', '*', false); // fails due to lack of specificity

		testIsValidVersion('1.0.0', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('1.0.0', '0.x.x', false); // fails due to lack of specificity
		testIsValidVersion('1.0.0', '0.10.0', false);
		testIsValidVersion('1.0.0', '0.10.2', false);
		testIsValidVersion('1.0.0', '^0.10.2', false);
		testIsValidVersion('1.0.0', '0.10.x', false);
		testIsValidVersion('1.0.0', '^0.10.0', false);
		testIsValidVersion('1.0.0', '*', false); // fails due to lack of specificity

		testIsValidVersion('1.10.0', 'x.x.x', false); // fails due to lack of specificity
		testIsValidVersion('1.10.0', '1.x.x', true);
		testIsValidVersion('1.10.0', '1.10.0', true);
		testIsValidVersion('1.10.0', '1.10.2', false);
		testIsValidVersion('1.10.0', '^1.10.2', false);
		testIsValidVersion('1.10.0', '1.10.x', true);
		testIsValidVersion('1.10.0', '^1.10.0', true);
		testIsValidVersion('1.10.0', '*', false); // fails due to lack of specificity
	});
});