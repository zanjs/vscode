/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import TMState = require('vs/editor/common/modes/TMState');

suite('Editor Modes - TMState', () => {
	test('Bug #16982: Cannot read property \'length\' of null', () => {
		var s1 = new TMState.TMState(null, null, null);
		var s2 = new TMState.TMState(null, null, null);
		assert.equal(s1.equals(s2), true);
	});
});
