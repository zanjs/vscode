/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import ModelLine = require('vs/editor/common/model/modelLine');
import Modes = require('vs/editor/common/modes');
import TextModelWithTokens = require('vs/editor/common/model/textModelWithTokens');
import EditorCommon = require('vs/editor/common/editorCommon');
import {LineMarker} from 'vs/editor/common/model/textModelWithMarkers';

function assertLineTokens(actual:EditorCommon.ILineTokens, expected:Modes.IToken[]): void {
	var inflatedActual = EditorCommon.LineTokensBinaryEncoding.inflateArr(actual.getBinaryEncodedTokensMap(), actual.getBinaryEncodedTokens());
	assert.deepEqual(inflatedActual, expected, 'Line tokens are equal');
}

suite('Editor Model - ModelLine.applyEdits text', () => {

	function testEdits(initial:string, edits:ModelLine.ILineEdit[], expected:string): void {
		var line = new ModelLine.ModelLine(1, initial);
		line.applyEdits({}, edits);
		assert.equal(line.text, expected);
	}

	function editOp(startColumn: number, endColumn: number, text:string): ModelLine.ILineEdit {
		return {
			startColumn: startColumn,
			endColumn: endColumn,
			text: text,
			forceMoveMarkers: false
		};
	}

	test('single insert 1', () => {
		testEdits(
			'',
			[
				editOp(1, 1, 'Hello world')
			],
			'Hello world'
		);
	});

	test('single insert 2', () => {
		testEdits(
			'Hworld',
			[
				editOp(2, 2, 'ello ')
			],
			'Hello world'
		);
	});

	test('multiple inserts 1', () => {
		testEdits(
			'Hw',
			[
				editOp(2, 2, 'ello '),
				editOp(3, 3, 'orld')
			],
			'Hello world'
		);
	});

	test('multiple inserts 2', () => {
		testEdits(
			'Hw,',
			[
				editOp(2, 2, 'ello '),
				editOp(3, 3, 'orld'),
				editOp(4, 4, ' this is H.A.L.')
			],
			'Hello world, this is H.A.L.'
		);
	});

	test('single delete 1', () => {
		testEdits(
			'Hello world',
			[
				editOp(1, 12, '')
			],
			''
		);
	});

	test('single delete 2', () => {
		testEdits(
			'Hello world',
			[
				editOp(2, 7, '')
			],
			'Hworld'
		);
	});

	test('multiple deletes 1', () => {
		testEdits(
			'Hello world',
			[
				editOp(2, 7, ''),
				editOp(8, 12, '')
			],
			'Hw'
		);
	});

	test('multiple deletes 2', () => {
		testEdits(
			'Hello world, this is H.A.L.',
			[
				editOp(2, 7, ''),
				editOp(8, 12, ''),
				editOp(13, 28, '')
			],
			'Hw,'
		);
	});

	test('single replace 1', () => {
		testEdits(
			'',
			[
				editOp(1, 1, 'Hello world')
			],
			'Hello world'
		);
	});

	test('single replace 2', () => {
		testEdits(
			'H1234world',
			[
				editOp(2, 6, 'ello ')
			],
			'Hello world'
		);
	});

	test('multiple replace 1', () => {
		testEdits(
			'H123w321',
			[
				editOp(2, 5, 'ello '),
				editOp(6, 9, 'orld')
			],
			'Hello world'
		);
	});

	test('multiple replace 2', () => {
		testEdits(
			'H1w12,123',
			[
				editOp(2, 3, 'ello '),
				editOp(4, 6, 'orld'),
				editOp(7, 10, ' this is H.A.L.')
			],
			'Hello world, this is H.A.L.'
		);
	});
});

suite('Editor Model - ModelLine.split text', () => {

	function testLineSplit(initial:string, splitColumn:number, expected1:string, expected2:string): void {
		var line = new ModelLine.ModelLine(1, initial);
		var newLine = line.split({}, splitColumn, false);
		assert.equal(line.text, expected1);
		assert.equal(newLine.text, expected2);
	}

	test('split at the beginning', () => {
		testLineSplit(
			'qwerty',
			1,
			'',
			'qwerty'
		);
	});

	test('split at the end', () => {
		testLineSplit(
			'qwerty',
			7,
			'qwerty',
			''
		);
	});

	test('split in the middle', () => {
		testLineSplit(
			'qwerty',
			3,
			'qw',
			'erty'
		);
	});
});

suite('Editor Model - ModelLine.append text', () => {

	function testLineAppend(a:string, b:string, expected:string): void {
		var line1 = new ModelLine.ModelLine(1, a);
		var line2 = new ModelLine.ModelLine(2, b);
		line1.append({}, line2);
		assert.equal(line1.text, expected);
	}

	test('append at the beginning', () => {
		testLineAppend(
			'',
			'qwerty',
			'qwerty'
		);
	});

	test('append at the end', () => {
		testLineAppend(
			'qwerty',
			'',
			'qwerty'
		);
	});

	test('append in the middle', () => {
		testLineAppend(
			'qw',
			'erty',
			'qwerty'
		);
	});
});

suite('Editor Model - ModelLine.applyEdits text & tokens', () => {
	function testLineEditTokens(initialText:string, initialTokens: Modes.IToken[], edits:ModelLine.ILineEdit[], expectedText:string, expectedTokens: Modes.IToken[]): void {
		var line = new ModelLine.ModelLine(1, initialText);
		line.setTokens(new TextModelWithTokens.TokensInflatorMap(), initialTokens, null, []);

		line.applyEdits({}, edits);

		assert.equal(line.text, expectedText);
		assertLineTokens(line.getTokens(), expectedTokens);
	}

	test('insertion on empty line', () => {
		var line = new ModelLine.ModelLine(1, 'some text');
		var map = new TextModelWithTokens.TokensInflatorMap();
		line.setTokens(map, [{startIndex: 0, type:'bar', bracket:0}], null, []);

		line.applyEdits({}, [{startColumn:1, endColumn:10, text:'', forceMoveMarkers: false}]);
		line.setTokens(map, [], null, []);

		line.applyEdits({}, [{startColumn:1, endColumn:1, text:'a', forceMoveMarkers: false}]);
		assertLineTokens(line.getTokens(), [{
			startIndex: 0,
			type:'',
			bracket:0
		}]);
	})

	test('updates tokens on insertion 1', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 5, type: '2', bracket: 1 },
				{ startIndex: 6, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 2', () => {
		testLineEditTokens(
			'aabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 5, type: '2', bracket: 1 },
				{ startIndex: 6, type: '3', bracket: -1 }
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'x',
				forceMoveMarkers: false
			}],
			'axabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 6, type: '2', bracket: 1 },
				{ startIndex: 7, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 3', () => {
		testLineEditTokens(
			'axabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 6, type: '2', bracket: 1 },
				{ startIndex: 7, type: '3', bracket: -1 }
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'stu',
				forceMoveMarkers: false
			}],
			'axstuabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 9, type: '2', bracket: 1 },
				{ startIndex: 10, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 4', () => {
		testLineEditTokens(
			'axstuabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 9, type: '2', bracket: 1 },
				{ startIndex: 10, type: '3', bracket: -1 }
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: '\t',
				forceMoveMarkers: false
			}],
			'axstuabcd\t efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 11, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 5', () => {
		testLineEditTokens(
			'axstuabcd\t efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 11, type: '3', bracket: -1 }
			],
			[{
				startColumn: 12,
				endColumn: 12,
				text: 'dd',
				forceMoveMarkers: false
			}],
			'axstuabcd\t ddefgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 13, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 6', () => {
		testLineEditTokens(
			'axstuabcd\t ddefgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 13, type: '3', bracket: -1 }
			],
			[{
				startColumn: 18,
				endColumn: 18,
				text: 'xyz',
				forceMoveMarkers: false
			}],
			'axstuabcd\t ddefghxyz',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 13, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 7', () => {
		testLineEditTokens(
			'axstuabcd\t ddefghxyz',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 10, type: '2', bracket: 1 },
				{ startIndex: 13, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'x',
				forceMoveMarkers: false
			}],
			'xaxstuabcd\t ddefghxyz',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 11, type: '2', bracket: 1 },
				{ startIndex: 14, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 8', () => {
		testLineEditTokens(
			'xaxstuabcd\t ddefghxyz',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 11, type: '2', bracket: 1 },
				{ startIndex: 14, type: '3', bracket: -1 }
			],
			[{
				startColumn: 22,
				endColumn: 22,
				text: 'x',
				forceMoveMarkers: false
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 11, type: '2', bracket: 1 },
				{ startIndex: 14, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 9', () => {
		testLineEditTokens(
			'xaxstuabcd\t ddefghxyzx',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 11, type: '2', bracket: 1 },
				{ startIndex: 14, type: '3', bracket: -1 }
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: '',
				forceMoveMarkers: false
			}],
			'xaxstuabcd\t ddefghxyzx',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 11, type: '2', bracket: 1 },
				{ startIndex: 14, type: '3', bracket: -1 }
			]
		);
	});

	test('updates tokens on insertion 10', () => {
		testLineEditTokens(
			'',
			null,
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'a',
			[
				{ startIndex: 0, type: '', bracket: 0 }
			]
		);
	});

	test('delete second token 2', () => {
		testLineEditTokens(
			'abcdefghij',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 3, type: '2', bracket: 1 },
				{ startIndex: 6, type: '3', bracket: -1 }
			],
			[{
				startColumn: 4,
				endColumn: 7,
				text: '',
				forceMoveMarkers: false
			}],
			'abcghij',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 3, type: '3', bracket: -1 }
			]
		);
	});

	test('insert right before second token', () => {
		testLineEditTokens(
			'abcdefghij',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 3, type: '2', bracket: 1 },
				{ startIndex: 6, type: '3', bracket: -1 }
			],
			[{
				startColumn: 4,
				endColumn: 4,
				text: 'hello',
				forceMoveMarkers: false
			}],
			'abchellodefghij',
			[
				{ startIndex:  0, type: '1', bracket: 0 },
				{ startIndex:  8, type: '2', bracket: 1 },
				{ startIndex: 11, type: '3', bracket: -1 }
			]
		);
	});

	test('delete first char', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 2,
				text: '',
				forceMoveMarkers: false
			}],
			'bcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 3, type: '2', bracket: 1 },
				{ startIndex: 4, type: '3', bracket: -1 }
			]
		);
	});

	test('delete 2nd and 3rd chars', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 2,
				endColumn: 4,
				text: '',
				forceMoveMarkers: false
			}],
			'ad efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 2, type: '2', bracket: 1 },
				{ startIndex: 3, type: '3', bracket: -1 }
			]
		);
	});

	test('delete first token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 5,
				text: '',
				forceMoveMarkers: false
			}],
			' efgh',
			[
				{ startIndex: 0, type: '2', bracket: 1 },
				{ startIndex: 1, type: '3', bracket: -1 }
			]
		);
	});

	test('delete second token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 5,
				endColumn: 6,
				text: '',
				forceMoveMarkers: false
			}],
			'abcdefgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '3', bracket: -1 }
			]
		);
	});

	test('delete second token + a bit of the third one', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 5,
				endColumn: 7,
				text: '',
				forceMoveMarkers: false
			}],
			'abcdfgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '3', bracket: -1 }
			]
		);
	});

	test('delete second and third token', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 5,
				endColumn: 10,
				text: '',
				forceMoveMarkers: false
			}],
			'abcd',
			[
				{ startIndex: 0, type: '1', bracket: 0 }
			]
		);
	});

	test('delete everything', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 10,
				text: '',
				forceMoveMarkers: false
			}],
			'',
			[]
		);
	});

	test('noop', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: '',
				forceMoveMarkers: false
			}],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});

	test('equivalent to deleting first two chars', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 1,
				endColumn: 3,
				text: '',
				forceMoveMarkers: false
			}],
			'cd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 2, type: '2', bracket: 1 },
				{ startIndex: 3, type: '3', bracket: -1 }
			]
		);
	});

	test('equivalent to deleting from 5 to the end', () => {
		testLineEditTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			[{
				startColumn: 5,
				endColumn: 10,
				text: '',
				forceMoveMarkers: false
			}],
			'abcd',
			[
				{ startIndex: 0, type: '1', bracket: 0 }
			]
		);
	});

	test('updates tokens on replace 1', () => {
		testLineEditTokens(
			'Hello world, ciao',
			[
				{ startIndex: 0, type: 'hello', bracket: 0 },
				{ startIndex: 5, type: '', bracket: 0 },
				{ startIndex: 6, type: 'world', bracket: 0 },
				{ startIndex: 11, type: '', bracket: 0 },
				{ startIndex: 13, type: '', bracket: 0 },
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'Hi',
				forceMoveMarkers: false
			}],
			'Hi world, ciao',
			[
				{ startIndex: 0, type: 'hello', bracket: 0 },
				{ startIndex: 2, type: '', bracket: 0 },
				{ startIndex: 3, type: 'world', bracket: 0 },
				{ startIndex: 8, type: '', bracket: 0 },
				{ startIndex: 10, type: '', bracket: 0 },
			]
		);
	});

	test('updates tokens on replace 2', () => {
		testLineEditTokens(
			'Hello world, ciao',
			[
				{ startIndex: 0, type: 'hello', bracket: 0 },
				{ startIndex: 5, type: '', bracket: 0 },
				{ startIndex: 6, type: 'world', bracket: 0 },
				{ startIndex: 11, type: '', bracket: 0 },
				{ startIndex: 13, type: '', bracket: 0 },
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'Hi',
				forceMoveMarkers: false
			}, {
				startColumn: 8,
				endColumn: 12,
				text: 'my friends',
				forceMoveMarkers: false
			}],
			'Hi wmy friends, ciao',
			[
				{ startIndex: 0, type: 'hello', bracket: 0 },
				{ startIndex: 2, type: '', bracket: 0 },
				{ startIndex: 3, type: 'world', bracket: 0 },
				{ startIndex: 14, type: '', bracket: 0 },
				{ startIndex: 16, type: '', bracket: 0 },
			]
		);
	});
});

suite('Editor Model - ModelLine.split text & tokens', () => {
	function testLineSplitTokens(initialText:string, initialTokens: Modes.IToken[], splitColumn:number, expectedText1:string, expectedText2:string, expectedTokens: Modes.IToken[]): void {
		var line = new ModelLine.ModelLine(1, initialText);
		line.setTokens(new TextModelWithTokens.TokensInflatorMap(), initialTokens, null, []);

		var other = line.split({}, splitColumn, false);

		assert.equal(line.text, expectedText1);
		assert.equal(other.text, expectedText2);
		assertLineTokens(line.getTokens(), expectedTokens);
	}

	test('split at the beginning', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			1,
			'',
			'abcd efgh',
			[]
		);
	});

	test('split at the end', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			10,
			'abcd efgh',
			'',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});

	test('split inthe middle 1', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			5,
			'abcd',
			' efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 }
			]
		);
	});

	test('split inthe middle 2', () => {
		testLineSplitTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			6,
			'abcd ',
			'efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 }
			]
		);
	});
});

suite('Editor Model - ModelLine.append text & tokens', () => {
	function testLineAppendTokens(aText:string, aTokens: Modes.IToken[], bText:string, bTokens:Modes.IToken[], expectedText:string, expectedTokens:Modes.IToken[]): void {
		var inflator = new TextModelWithTokens.TokensInflatorMap();

		var a = new ModelLine.ModelLine(1, aText);
		a.setTokens(inflator, aTokens, null, []);

		var b = new ModelLine.ModelLine(2, bText);
		b.setTokens(inflator, bTokens, null, []);

		a.append({}, b);

		assert.equal(a.text, expectedText);
		assertLineTokens(a.getTokens(), expectedTokens);
	}

	test('append empty 1', () => {
		testLineAppendTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			'',
			[],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});

	test('append empty 2', () => {
		testLineAppendTokens(
			'',
			[],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});

	test('append 1', () => {
		testLineAppendTokens(
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			],
			'abcd efgh',
			[
				{ startIndex: 0, type: '4', bracket: 0 },
				{ startIndex: 4, type: '5', bracket: 1 },
				{ startIndex: 5, type: '6', bracket: -1 }
			],
			'abcd efghabcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 },
				{ startIndex: 9, type: '4', bracket: 0 },
				{ startIndex: 13, type: '5', bracket: 1 },
				{ startIndex: 14, type: '6', bracket: -1 }
			]
		);
	});

	test('append 2', () => {
		testLineAppendTokens(
			'abcd ',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 }
			],
			'efgh',
			[
				{ startIndex: 0, type: '3', bracket: -1 }
			],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});

	test('append 3', () => {
		testLineAppendTokens(
			'abcd',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
			],
			' efgh',
			[
				{ startIndex: 0, type: '2', bracket: 1 },
				{ startIndex: 1, type: '3', bracket: -1 }
			],
			'abcd efgh',
			[
				{ startIndex: 0, type: '1', bracket: 0 },
				{ startIndex: 4, type: '2', bracket: 1 },
				{ startIndex: 5, type: '3', bracket: -1 }
			]
		);
	});
});

interface ILightWeightMarker {
	id: string;
	column: number;
	stickToPreviousCharacter: boolean;
}

suite('Editor Model - ModelLine.applyEdits text & markers', () => {

	function marker(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), column, stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker:ModelLine.ILineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			column: marker.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLineEditMarkers(initialText:string, initialMarkers: LineMarker[], edits:ModelLine.ILineEdit[], expectedText:string, expectedChangedMarkers:number[], _expectedMarkers: LineMarker[]): void {
		var line = new ModelLine.ModelLine(1, initialText);
		line.addMarkers(initialMarkers);

		var changedMarkers = Object.create(null);
		line.applyEdits(changedMarkers, edits);

		assert.equal(line.text, expectedText, 'text');

		var actualMarkers = line.getMarkers().map(toLightWeightMarker);
		var expectedMarkers = _expectedMarkers.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers, expectedMarkers, 'markers');

		var actualChangedMarkers = Object.keys(changedMarkers);
		actualChangedMarkers.sort().map(Object.prototype.toString);
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('insertion: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcabcd efgh',
			[2,3,4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 4, false),
				marker(3, 5, true),
				marker(4, 5, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'aabcbcd efgh',
			[4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 5, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'ababccd efgh',
			[5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 8, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 4', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcdabc efgh',
			[6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 8, false),
				marker(7, 13, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion: updates markers 5', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'abc',
				forceMoveMarkers: false
			}],
			'abcd efghabc',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 13, false)
			]
		);
	});

	test('insertion bis: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2,3,4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 2, false),
				marker(3, 3, true),
				marker(4, 3, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 3, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 3,
				endColumn: 3,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abacd efgh',
			[5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 6, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 4', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 5,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abcda efgh',
			[6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 6, false),
				marker(7, 11, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion bis: updates markers 5', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 10,
				endColumn: 10,
				text: 'a',
				forceMoveMarkers: false
			}],
			'abcd efgha',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 11, false)
			]
		);
	});

	test('insertion: does not move marker at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[marker(1, 1, true)],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[],
			[marker(1, 1, true)]
		);
	});

	test('insertion: does move marker at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[marker(1, 1, false)],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[1],
			[marker(1, 2, false)]
		);
	});

	test('insertion: two markers at column 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2],
			[
				marker(1, 1, true),
				marker(2, 2, false)
			]
		);
	});

	test('insertion: two markers at column 1 unsorted', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(2, 1, false),
				marker(1, 1, true),
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}],
			'aabcd efgh',
			[2],
			[
				marker(1, 1, true),
				marker(2, 2, false)
			]
		);
	});

	test('deletion: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 2,
				text: '',
				forceMoveMarkers: false
			}],
			'bcd efgh',
			[3,4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 1, true),
				marker(4, 1, false),
				marker(5, 4, true),
				marker(6, 4, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('deletion: updates markers 2', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 4,
				text: '',
				forceMoveMarkers: false
			}],
			'd efgh',
			[3,4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 1, true),
				marker(4, 1, false),
				marker(5, 2, true),
				marker(6, 2, false),
				marker(7, 7, true),
				marker(8, 7, false)
			]
		);
	});

	test('deletion: updates markers 3', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 5,
				endColumn: 6,
				text: '',
				forceMoveMarkers: false
			}],
			'abcdefgh',
			[7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('replace: updates markers 1', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: 'a',
				forceMoveMarkers: false
			}, {
				startColumn: 2,
				endColumn: 3,
				text: '',
				forceMoveMarkers: false
			}],
			'aacd efgh',
			[2,3,4],
			[
				marker(1, 1, true),
				marker(2, 2, false),
				marker(3, 3, true),
				marker(4, 3, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('delete near markers', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 3, true),
				marker(2, 3, false)
			],
			[{
				startColumn: 3,
				endColumn: 4,
				text: '',
				forceMoveMarkers: false
			}],
			'abd',
			[],
			[
				marker(1, 3, true),
				marker(2, 3, false)
			]
		);
	});

	test('replace: updates markers 2', () => {
		testLineEditMarkers(
			'Hello world, how are you',
			[
				marker(1, 1, false),
				marker(2, 6, true),
				marker(3, 14, false),
				marker(4, 21, true)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
				forceMoveMarkers: false
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
				forceMoveMarkers: false
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
				forceMoveMarkers: false
			}],
			' - Hello, how are things',
			[1,2,3,4],
			[
				marker(1, 4, false),
				marker(2, 9, true),
				marker(3, 11, false),
				marker(4, 18, true)
			]
		);
	});

	test('sorts markers', () => {
		testLineEditMarkers(
			'Hello world, how are you',
			[
				marker(4, 21, true),
				marker(2, 6, true),
				marker(1, 1, false),
				marker(3, 14, false)
			],
			[{
				startColumn: 1,
				endColumn: 1,
				text: ' - ',
				forceMoveMarkers: false
			}, {
				startColumn: 6,
				endColumn: 12,
				text: '',
				forceMoveMarkers: false
			}, {
				startColumn: 22,
				endColumn: 25,
				text: 'things',
				forceMoveMarkers: false
			}],
			' - Hello, how are things',
			[1,2,3,4],
			[
				marker(1, 4, false),
				marker(2, 9, true),
				marker(3, 11, false),
				marker(4, 18, true)
			]
		);
	});

	test('change text inside markers', () => {
		testLineEditMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 6, false),
				marker(4, 10, true)
			],
			[{
				startColumn: 6,
				endColumn: 10,
				text: '1234567',
				forceMoveMarkers: false
			}],
			'abcd 1234567',
			[],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 6, false),
				marker(4, 10, true)
			]
		);
	});

	test('inserting is different than replacing for markers part 1', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 2, false)
			],
			[{
				startColumn: 2,
				endColumn: 2,
				text: 'INSERT',
				forceMoveMarkers: false
			}],
			'aINSERTbcd',
			[1],
			[
				marker(1, 8, false)
			]
		);
	});

	test('inserting is different than replacing for markers part 2', () => {
		testLineEditMarkers(
			'abcd',
			[
				marker(1, 2, false)
			],
			[{
				startColumn: 2,
				endColumn: 3,
				text: 'REPLACED',
				forceMoveMarkers: false
			}],
			'aREPLACEDcd',
			[],
			[
				marker(1, 2, false)
			]
		);
	});

	test('replacing the entire line with more text', () => {
		testLineEditMarkers(
			'this is a short text',
			[
				marker(1, 1, false),
				marker(2, 16, true),
			],
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'Some new text here',
				forceMoveMarkers: false
			}],
			'Some new text here',
			[],
			[
				marker(1, 1, false),
				marker(2, 16, true),
			]
		);
	});

	test('replacing the entire line with less text', () => {
		testLineEditMarkers(
			'this is a short text',
			[
				marker(1, 1, false),
				marker(2, 16, true),
			],
			[{
				startColumn: 1,
				endColumn: 21,
				text: 'ttt',
				forceMoveMarkers: false
			}],
			'ttt',
			[2],
			[
				marker(1, 1, false),
				marker(2, 1, true),
			]
		);
	});

	test('replace selection', () => {
		testLineEditMarkers(
			'first',
			[
				marker(1, 1, true),
				marker(2, 6, false),
			],
			[{
				startColumn: 1,
				endColumn: 6,
				text: 'something',
				forceMoveMarkers: false
			}],
			'something',
			[2],
			[
				marker(1, 1, true),
				marker(2, 10, false),
			]
		);
	});
});

suite('Editor Model - ModelLine.split text & markers', () => {

	function marker(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), column, stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker:ModelLine.ILineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			column: marker.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLineSplitMarkers(initialText:string, initialMarkers: LineMarker[], splitColumn:number, forceMoveMarkers:boolean, expectedText1:string, expectedText2:string, expectedChangedMarkers:number[], _expectedMarkers1: LineMarker[], _expectedMarkers2: LineMarker[]): void {
		var line = new ModelLine.ModelLine(1, initialText);
		line.addMarkers(initialMarkers);

		var changedMarkers = Object.create(null);
		var otherLine = line.split(changedMarkers, splitColumn, forceMoveMarkers);

		assert.equal(line.text, expectedText1, 'text');
		assert.equal(otherLine.text, expectedText2, 'text');

		var actualMarkers1 = line.getMarkers().map(toLightWeightMarker);
		var expectedMarkers1 = _expectedMarkers1.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers1, expectedMarkers1, 'markers');

		var actualMarkers2 = otherLine.getMarkers().map(toLightWeightMarker);
		var expectedMarkers2 = _expectedMarkers2.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers2, expectedMarkers2, 'markers');

		var actualChangedMarkers = Object.keys(changedMarkers);
		actualChangedMarkers.sort().map(Object.prototype.toString);
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('split at the beginning', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			1,
			false,
			'',
			'abcd efgh',
			[2,3,4,5,6,7,8],
			[
				marker(1, 1, true)
			],
			[
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('split at the beginning 2', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			1,
			true,
			'',
			'abcd efgh',
			[1,2,3,4,5,6,7,8],
			[],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('split at the end', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			10,
			false,
			'abcd efgh',
			'',
			[8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
			],
			[
				marker(8, 1, false)
			]
		);
	});

	test('split it the middle 1', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			2,
			false,
			'a',
			'bcd efgh',
			[4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
			],
			[
				marker(4, 1, false),
				marker(5, 4, true),
				marker(6, 4, false),
				marker(7, 9, true),
				marker(8, 9, false)
			]
		);
	});

	test('split it the middle 2', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			3,
			false,
			'ab',
			'cd efgh',
			[5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
			],
			[
				marker(5, 3, true),
				marker(6, 3, false),
				marker(7, 8, true),
				marker(8, 8, false)
			]
		);
	});

	test('split it the middle 3', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			5,
			false,
			'abcd',
			' efgh',
			[6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
			],
			[
				marker(6, 1, false),
				marker(7, 6, true),
				marker(8, 6, false)
			]
		);
	});

	test('split it the middle 4', () => {
		testLineSplitMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			],
			6,
			false,
			'abcd ',
			'efgh',
			[7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
			],
			[
				marker(7, 5, true),
				marker(8, 5, false)
			]
		);
	});
});

suite('Editor Model - ModelLine.append text & markers', () => {

	function marker(id: number, column: number, stickToPreviousCharacter: boolean): LineMarker {
		return new LineMarker(String(id), column, stickToPreviousCharacter);
	}

	function toLightWeightMarker(marker:ModelLine.ILineMarker): ILightWeightMarker {
		return {
			id: marker.id,
			column: marker.column,
			stickToPreviousCharacter: marker.stickToPreviousCharacter
		};
	}

	function testLinePrependMarkers(aText:string, aMarkers: LineMarker[], bText:string, bMarkers: LineMarker[], expectedText:string, expectedChangedMarkers:number[], _expectedMarkers: LineMarker[]): void {
		var a = new ModelLine.ModelLine(1, aText);
		a.addMarkers(aMarkers);

		var b = new ModelLine.ModelLine(1, bText);
		b.addMarkers(bMarkers);

		var changedMarkers = Object.create(null);
		a.append(changedMarkers, b);

		assert.equal(a.text, expectedText, 'text');

		var actualMarkers = a.getMarkers().map(toLightWeightMarker);
		var expectedMarkers = _expectedMarkers.map(toLightWeightMarker);
		assert.deepEqual(actualMarkers, expectedMarkers, 'markers');

		var actualChangedMarkers = Object.keys(changedMarkers);
		actualChangedMarkers.sort().map(Object.prototype.toString);
		assert.deepEqual(actualChangedMarkers, expectedChangedMarkers, 'changed markers');
	}

	test('append to an empty', () => {
		testLinePrependMarkers(
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false),
			],
			'',
			[
			],
			'abcd efgh',
			[],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('append an empty', () => {
		testLinePrependMarkers(
			'',
			[
			],
			'abcd efgh',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false),
			],
			'abcd efgh',
			[1,2,3,4,5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('append 1', () => {
		testLinePrependMarkers(
			'abcd',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false)
			],
			' efgh',
			[
				marker(5, 1, true),
				marker(6, 1, false),
				marker(7, 6, true),
				marker(8, 6, false),
			],
			'abcd efgh',
			[5,6,7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});

	test('append 2', () => {
		testLinePrependMarkers(
			'abcd e',
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false)
			],
			'fgh',
			[
				marker(7, 4, true),
				marker(8, 4, false),
			],
			'abcd efgh',
			[7,8],
			[
				marker(1, 1, true),
				marker(2, 1, false),
				marker(3, 2, true),
				marker(4, 2, false),
				marker(5, 5, true),
				marker(6, 5, false),
				marker(7, 10, true),
				marker(8, 10, false)
			]
		);
	});
});

