/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import Model = require('vs/editor/common/model/model');
import TU = require('vs/editor/test/common/commands/commandTestUtils');
import ModelModes = require('vs/editor/test/common/testModes');
import LineCommentCommand = require('vs/editor/contrib/comment/common/lineCommentCommand');
import {Selection} from 'vs/editor/common/core/selection';

suite('Editor Contrib - Line Comment Command', () => {

	function testLineCommentCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
		var mode = new ModelModes.CommentMode({ lineCommentTokens: ['!@#'], blockCommentStartToken: '<!@#', blockCommentEndToken: '#@!>' });
		TU.testCommand(lines, mode, selection, (sel) => new LineCommentCommand.LineCommentCommand(sel, 4, LineCommentCommand.Type.Toggle), expectedLines, expectedSelection);
	}

	test('comment single line', function () {
		testLineCommentCommand(
			[
				'some text',
				'\tsome more text'
			],
			new Selection(1, 1, 1, 1),
			[
				'!@# some text',
				'\tsome more text'
			],
			new Selection(1, 9, 1, 9)
		);
	});

	function createSimpleModel(lines:string[]): LineCommentCommand.ISimpleModel {
		return {
			getLineContent: (lineNumber:number) => {
				return lines[lineNumber - 1];
			}
		};
	}

	function createBasicLinePreflightData(commentTokens:string[]): LineCommentCommand.ILinePreflightData[] {
		return commentTokens.map((commentString) => {
			var r: LineCommentCommand.ILinePreflightData = {
				ignore: false,
				commentStr: commentString,
				commentStrOffset: 0,
				commentStrLength: commentString.length
			};
			return r;
		});
	}

	test('_analyzeLines', function () {
		var r:LineCommentCommand.IPreflightData;

		r = LineCommentCommand.LineCommentCommand._analyzeLines(LineCommentCommand.Type.Toggle, createSimpleModel([
			'\t\t',
			'    ',
			'    c',
			'\t\td'
		]), createBasicLinePreflightData(['//', 'rem', '!@#', '!@#']), 1);

		assert.equal(r.shouldRemoveComments, false);

		// Does not change `commentStr`
		assert.equal(r.lines[0].commentStr, '//');
		assert.equal(r.lines[1].commentStr, 'rem');
		assert.equal(r.lines[2].commentStr, '!@#');
		assert.equal(r.lines[3].commentStr, '!@#');

		// Fills in `isWhitespace`
		assert.equal(r.lines[0].ignore, true);
		assert.equal(r.lines[1].ignore, true);
		assert.equal(r.lines[2].ignore, false);
		assert.equal(r.lines[3].ignore, false);

		// Fills in `commentStrOffset`
		assert.equal(r.lines[0].commentStrOffset, 2);
		assert.equal(r.lines[1].commentStrOffset, 4);
		assert.equal(r.lines[2].commentStrOffset, 4);
		assert.equal(r.lines[3].commentStrOffset, 2);


		r = LineCommentCommand.LineCommentCommand._analyzeLines(LineCommentCommand.Type.Toggle, createSimpleModel([
			'\t\t',
			'    rem ',
			'    !@# c',
			'\t\t!@#d'
		]), createBasicLinePreflightData(['//', 'rem', '!@#', '!@#']), 1);

		assert.equal(r.shouldRemoveComments, true);

		// Does not change `commentStr`
		assert.equal(r.lines[0].commentStr, '//');
		assert.equal(r.lines[1].commentStr, 'rem');
		assert.equal(r.lines[2].commentStr, '!@#');
		assert.equal(r.lines[3].commentStr, '!@#');

		// Fills in `isWhitespace`
		assert.equal(r.lines[0].ignore, true);
		assert.equal(r.lines[1].ignore, false);
		assert.equal(r.lines[2].ignore, false);
		assert.equal(r.lines[3].ignore, false);

		// Fills in `commentStrOffset`
		assert.equal(r.lines[0].commentStrOffset, 2);
		assert.equal(r.lines[1].commentStrOffset, 4);
		assert.equal(r.lines[2].commentStrOffset, 4);
		assert.equal(r.lines[3].commentStrOffset, 2);

		// Fills in `commentStrLength`
		assert.equal(r.lines[0].commentStrLength, 2);
		assert.equal(r.lines[1].commentStrLength, 4);
		assert.equal(r.lines[2].commentStrLength, 4);
		assert.equal(r.lines[3].commentStrLength, 3);
	});

	test('_normalizeInsertionPoint', function () {

		var runTest = (mixedArr:any[], tabSize:number, expected:number[], testName:string) => {
			var model = createSimpleModel(mixedArr.filter((item, idx) => idx % 2 === 0));
			var offsets = mixedArr.filter((item, idx) => idx % 2 === 1).map(offset => {
				return {
					commentStrOffset: offset,
					ignore: false
				}
			});
			LineCommentCommand.LineCommentCommand._normalizeInsertionPoint(model, offsets, 1, tabSize);
			var actual = offsets.map(item => item.commentStrOffset);
			assert.deepEqual(actual, expected, testName);
		};

		// Bug 16696:[comment] comments not aligned in this case
		runTest([
			'  XX', 2,
			'    YY', 4
		], 4, [0, 0], 'Bug 16696');

		runTest([
			'\t\t\tXX', 3,
			'    \tYY', 5,
			'        ZZ', 8,
			'\t\tTT', 2
		], 4, [2, 5, 8, 2], 'Test1');

		runTest([
			'\t\t\t   XX', 6,
			'    \t\t\t\tYY', 8,
			'        ZZ', 8,
			'\t\t    TT', 6
		], 4, [2, 5, 8, 2], 'Test2');

		runTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3
		], 4, [2, 2, 2, 2], 'Test3');

		runTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3,
			'    ', 4
		], 2, [2, 2, 2, 2, 4], 'Test4');

		runTest([
			'\t\t', 2,
			'\t\t\t', 3,
			'\t\t\t\t', 4,
			'\t\t\t', 3,
			'    ', 4
		], 4, [1, 1, 1, 1, 4], 'Test5');

		runTest([
			' \t', 2,
			'  \t', 3,
			'   \t', 4,
			'    ', 4,
			'\t', 1
		], 4, [2, 3, 4, 4, 1], 'Test6');

		runTest([
			' \t\t', 3,
			'  \t\t', 4,
			'   \t\t', 5,
			'    \t', 5,
			'\t', 1
		], 4, [2, 3, 4, 4, 1], 'Test7');

		runTest([
			'\t', 1,
			'    ', 4
		], 4, [1, 4], 'Test8:4');
		runTest([
			'\t', 1,
			'   ', 3
		], 4, [0, 0], 'Test8:3');
		runTest([
			'\t', 1,
			'  ', 2
		], 4, [0, 0], 'Test8:2');
		runTest([
			'\t', 1,
			' ', 1
		], 4, [0, 0], 'Test8:1');
		runTest([
			'\t', 1,
			'', 0
		], 4, [0, 0], 'Test8:0');
	});

	test('detects indentation', function () {
		testLineCommentCommand(
			[
				'\tsome text',
				'\tsome more text'
			],
			new Selection(2, 2, 1, 1),
			[
				'\t!@# some text',
				'\t!@# some more text'
			],
			new Selection(1, 1, 2, 2)
		);
	});

	test('detects mixed indentation', function () {
		testLineCommentCommand(
			[
				'\tsome text',
				'    some more text'
			],
			new Selection(2, 2, 1, 1),
			[
				'\t!@# some text',
				'    !@# some more text'
			],
			new Selection(1, 1, 2, 2)
		);
	});

	test('ignores whitespace lines', function () {
		testLineCommentCommand(
			[
				'\tsome text',
				'\t   ',
				'',
				'\tsome more text'
			],
			new Selection(4, 2, 1, 1),
			[
				'\t!@# some text',
				'\t   ',
				'',
				'\t!@# some more text'
			],
			new Selection(1, 1, 4, 2)
		);
	});

	test('removes its own', function () {
		testLineCommentCommand(
			[
				'\t!@# some text',
				'\t   ',
				'\t\t!@# some more text'
			],
			new Selection(3, 2, 1, 1),
			[
				'\tsome text',
				'\t   ',
				'\t\tsome more text'
			],
			new Selection(1, 1, 3, 2)
		);
	});

	test('works in only whitespace', function () {
		testLineCommentCommand(
			[
				'\t    ',
				'\t',
				'\t\tsome more text'
			],
			new Selection(3, 1, 1, 1),
			[
				'\t!@#     ',
				'\t!@# ',
				'\t\tsome more text'
			],
			new Selection(1, 1, 3, 1)
		);
	});

	test('bug 9697 - whitespace before comment token', function () {
		testLineCommentCommand(
			[
				'\t !@#first',
				'\tsecond line'
			],
			new Selection(1, 1, 1, 1),
			[
				'\t first',
				'\tsecond line'
			],
			new Selection(1, 1, 1, 1)
		);
	});

	test('bug 10162 - line comment before caret', function () {
		testLineCommentCommand(
			[
				'first!@#',
				'\tsecond line'
			],
			new Selection(1, 1, 1, 1),
			[
				'!@# first!@#',
				'\tsecond line'
			],
			new Selection(1, 9, 1, 9)
		);
	});

	test('comment single line - leading whitespace', function () {
		testLineCommentCommand(
			[
				'first!@#',
				'\tsecond line'
			],
			new Selection(2, 3, 2, 1),
			[
				'first!@#',
				'\t!@# second line'
			],
			new Selection(2, 1, 2, 7)
		);
	});

	test('ignores invisible selection', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 1, 1, 1),
			[
				'!@# first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 2, 5)
		);
	});

	test('multiple lines', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 1, 1),
			[
				'!@# first',
				'!@# \tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 2, 12)
		);
	});

	test('multiple modes on multiple lines', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(4, 4, 3, 1),
			[
				'first',
				'\tsecond line',
				'!@# third line',
				'!@# fourth line',
				'fifth'
			],
			new Selection(3, 9, 4, 12)
		);
	});

	test('toggle single line', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1),
			[
				'!@# first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 1, 9)
		);

		testLineCommentCommand(
			[
				'!@# first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 4, 1, 4),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1)
		);
	});

	test('toggle multiple lines', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 4, 1, 1),
			[
				'!@# first',
				'!@# \tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 9, 2, 12)
		);

		testLineCommentCommand(
			[
				'!@# first',
				'!@# \tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(2, 7, 1, 4),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 2, 3)
		);
	});
});

suite('Editor Contrib - Line Comment As Block Comment', () => {

	function testLineCommentCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
		var mode = new ModelModes.CommentMode({ lineCommentTokens: [''], blockCommentStartToken: '(', blockCommentEndToken: ')' });
		TU.testCommand(lines, mode, selection, (sel) => new LineCommentCommand.LineCommentCommand(sel, 4, LineCommentCommand.Type.Toggle), expectedLines, expectedSelection);
	}

	test('fall back to block comment command', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1),
			[
				'(first)',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 2, 1, 2)
		);
	});

	test('fall back to block comment command - toggle', function () {
		testLineCommentCommand(
			[
				'(first)',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 7, 1, 2),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 6)
		);
	});

	test('bug 9513 - expand single line to uncomment auto block', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 1, 1),
			[
				'(first)',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 2, 1, 2)
		);
	});

	test('bug 9691 - always expand selection to line boundaries', function () {
		testLineCommentCommand(
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(3, 2, 1, 3),
			[
				'(first',
				'\tsecond line',
				'third line)',
				'fourth line',
				'fifth'
			],
			new Selection(1, 4, 3, 2)
		);

		testLineCommentCommand(
			[
				'(first',
				'\tsecond line',
				'third line)',
				'fourth line',
				'fifth'
			],
			new Selection(3, 11, 1, 2),
			[
				'first',
				'\tsecond line',
				'third line',
				'fourth line',
				'fifth'
			],
			new Selection(1, 1, 3, 11)
		);
	});
});

suite('Editor Contrib - Line Comment As Block Comment 2', () => {
	function testLineCommentCommand(lines: string[], selection: Selection, expectedLines: string[], expectedSelection: Selection): void {
		var mode = new ModelModes.CommentMode({ lineCommentTokens: [], blockCommentStartToken: '<!@#', blockCommentEndToken: '#@!>' });
		TU.testCommand(lines, mode, selection, (sel) => new LineCommentCommand.LineCommentCommand(sel, 4, LineCommentCommand.Type.Toggle), expectedLines, expectedSelection);
	}

	test('no selection => uses indentation', function () {
		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(1, 1, 1, 1),
			[
				'\t\t<!@#first\t    #@!>',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(1, 1, 1, 1)
		);

		testLineCommentCommand(
			[
				'\t\t<!@#first\t    #@!>',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(1, 1, 1, 1),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(1, 1, 1, 1)
		);
	});

	test('can remove', function () {
		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 1, 5, 1),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 1, 5, 1)
		);

		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 3, 5, 3),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 3, 5, 3)
		);

		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 4, 5, 4),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 3, 5, 3)
		);

		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 16, 5, 3),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 3, 5, 8)
		);

		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 12, 5, 7),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 3, 5, 8)
		);

		testLineCommentCommand(
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\t<!@#fifth#@!>\t\t'
			],
			new Selection(5, 18, 5, 18),
			[
				'\t\tfirst\t    ',
				'\t\tsecond line',
				'\tthird line',
				'fourth line',
				'\t\tfifth\t\t'
			],
			new Selection(5, 10, 5, 10)
		);
	});
});


