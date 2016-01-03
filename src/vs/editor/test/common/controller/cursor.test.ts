/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Model = require('vs/editor/common/model/model');
import Cursor = require('vs/editor/common/controller/cursor');
import Position = require('vs/editor/common/core/position');
import Range = require('vs/editor/common/core/range');
import ModelModes = require('vs/editor/test/common/testModes');
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {MockConfiguration} from 'vs/editor/test/common/commands/commandTestUtils';
import {EditOperation} from 'vs/editor/common/core/editOperation';

var H = EditorCommon.Handler;

// --------- utils



function cursorCommand(cursor: Cursor.Cursor, command: string, extraData?: any, sizeProvider?: { pageSize: number; }, overwriteSource?: string) {
	if (sizeProvider) {
		cursor.configuration.editor.pageSize = sizeProvider.pageSize;
	}
	cursor.configuration.handlerDispatcher.trigger(overwriteSource || 'tests', command, extraData);
}

function moveTo(cursor: Cursor.Cursor, lineNumber: number, column: number, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.MoveToSelect : H.MoveTo, { position: new Position.Position(lineNumber, column) });
}

function moveLeft(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorLeftSelect : H.CursorLeft);
}

function moveWordLeft(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordLeftSelect : H.CursorWordLeft);
}

function moveRight(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorRightSelect : H.CursorRight);
}

function moveWordRight(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorWordRightSelect : H.CursorWordRight);
}

function moveDown(cursor: Cursor.Cursor, linesCount: number, inSelectionMode: boolean = false) {
	if (linesCount === 1) {
		cursorCommand(cursor, inSelectionMode ? H.CursorDownSelect : H.CursorDown);
	} else {
		cursorCommand(cursor, inSelectionMode ? H.CursorPageDownSelect : H.CursorPageDown, null, { pageSize: linesCount });
	}
}

function moveUp(cursor: Cursor.Cursor, linesCount: number, inSelectionMode: boolean = false) {
	if (linesCount === 1) {
		cursorCommand(cursor, inSelectionMode ? H.CursorUpSelect : H.CursorUp);
	} else {
		cursorCommand(cursor, inSelectionMode ? H.CursorPageUpSelect : H.CursorPageUp, null, { pageSize: linesCount });
	}
}

function moveToBeginningOfLine(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorHomeSelect : H.CursorHome);
}

function moveToEndOfLine(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ?  H.CursorEndSelect : H.CursorEnd);
}

function moveToBeginningOfBuffer(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorTopSelect : H.CursorTop);
}

function moveToEndOfBuffer(cursor: Cursor.Cursor, inSelectionMode: boolean = false) {
	cursorCommand(cursor, inSelectionMode ? H.CursorBottomSelect : H.CursorBottom);
}

function deleteWordLeft(cursor: Cursor.Cursor) {
	cursorCommand(cursor, H.DeleteWordLeft);
}

function deleteWordRight(cursor: Cursor.Cursor) {
	cursorCommand(cursor, H.DeleteWordRight);
}

function positionEqual(position:EditorCommon.IPosition, lineNumber: number, column: number) {
	assert.deepEqual({
		lineNumber: position.lineNumber,
		column: position.column
	}, {
		lineNumber: lineNumber,
		column: column
	}, 'position equal');
}

function selectionEqual(selection:EditorCommon.ISelection, posLineNumber: number, posColumn: number, selLineNumber: number, selColumn: number) {
	assert.deepEqual({
		selectionStartLineNumber: selection.selectionStartLineNumber,
		selectionStartColumn: selection.selectionStartColumn,
		positionLineNumber: selection.positionLineNumber,
		positionColumn: selection.positionColumn
	}, {
		selectionStartLineNumber: selLineNumber,
		selectionStartColumn: selColumn,
		positionLineNumber: posLineNumber,
		positionColumn: posColumn
	}, 'selection equal');
}

function cursorEqual(cursor: Cursor.Cursor, posLineNumber: number, posColumn: number, selLineNumber: number = posLineNumber, selColumn: number = posColumn) {
	positionEqual(cursor.getPosition(), posLineNumber, posColumn);
	selectionEqual(cursor.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}


suite('Editor Controller - Cursor', () => {
	var LINE1 = '    \tMy First Line\t ';
	var LINE2 = '\tMy Second Line';
	var LINE3 = '    Third Line';
	var LINE4 = '';
	var LINE5 = '1';

	var thisHighlighter = new ModelModes.CursorMode();
	var thisModel: Model.Model;
	var thisConfiguration: MockConfiguration;
	var thisCursor: Cursor.Cursor;

	setup(() => {
		var text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;

		thisModel = new Model.Model(text, thisHighlighter);
		thisConfiguration = new MockConfiguration(null);
		thisCursor = new Cursor.Cursor(1, thisConfiguration, thisModel, null, false);
	});

	teardown(() => {
		thisCursor.dispose();
		thisModel.dispose();
		thisConfiguration.dispose();
	});

	test('cursor initialized', () => {
		cursorEqual(thisCursor, 1, 1);
	});

	// --------- absolute move

	test('no move', () => {
		moveTo(thisCursor, 1, 1);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move', () => {
		moveTo(thisCursor, 1, 2);
		cursorEqual(thisCursor, 1, 2);
	});

	test('move in selection mode', () => {
		moveTo(thisCursor, 1, 2, true);
		cursorEqual(thisCursor, 1, 2, 1, 1);
	});

	test('move beyond line end', () => {
		moveTo(thisCursor, 1, 25);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move empty line', () => {
		moveTo(thisCursor, 4, 20);
		cursorEqual(thisCursor, 4, 1);
	});

	test('move one char line', () => {
		moveTo(thisCursor, 5, 20);
		cursorEqual(thisCursor, 5, 2);
	});

	test('selection down', () => {
		moveTo(thisCursor, 2, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);
	});

	test('move and then select', () => {
		moveTo(thisCursor, 2, 3);
		cursorEqual(thisCursor, 2, 3);

		moveTo(thisCursor, 2, 15, true);
		cursorEqual(thisCursor, 2, 15, 2, 3);

		moveTo(thisCursor, 1, 2, true);
		cursorEqual(thisCursor, 1, 2, 2, 3);
	});

	// --------- move left

	test('move left on top left position', () => {
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move left', () => {
		moveTo(thisCursor, 1, 3);
		cursorEqual(thisCursor, 1, 3);
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 2);
	});

	test('move left goes to previous row', () => {
		moveTo(thisCursor, 2, 1);
		cursorEqual(thisCursor, 2, 1);
		moveLeft(thisCursor);
		cursorEqual(thisCursor, 1, 21);
	});

	test('move left selection', () => {
		moveTo(thisCursor, 2, 1);
		cursorEqual(thisCursor, 2, 1);
		moveLeft(thisCursor, true);
		cursorEqual(thisCursor, 1, 21, 2, 1);
	});

	// --------- move word left

	test('move word left', () => {
		moveTo(thisCursor, 5, 2);
		var expectedStops = [
			[5, 1],
			[4, 1],
			[3, 11],
			[3, 5],
			[3, 1],
			[2, 12],
			[2, 5],
			[2, 2],
			[2, 1],
			[1, 15],
			[1, 9],
			[1, 6],
			[1, 1],
			[1, 1],
		];

		var actualStops:number[][] = [];
		for (var i = 0; i < expectedStops.length; i++) {
			moveWordLeft(thisCursor);
			var pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);
	});

	test('move word left selection', () => {
		moveTo(thisCursor, 5, 2);
		cursorEqual(thisCursor, 5, 2);
		moveWordLeft(thisCursor, true);
		cursorEqual(thisCursor, 5, 1, 5, 2);
	});

	// --------- move right

	test('move right on bottom right position', () => {
		moveTo(thisCursor, 5, 2);
		cursorEqual(thisCursor, 5, 2);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 5, 2);
	});

	test('move right', () => {
		moveTo(thisCursor, 1, 3);
		cursorEqual(thisCursor, 1, 3);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 1, 4);
	});

	test('move right goes to next row', () => {
		moveTo(thisCursor, 1, 21);
		cursorEqual(thisCursor, 1, 21);
		moveRight(thisCursor);
		cursorEqual(thisCursor, 2, 1);
	});

	test('move right selection', () => {
		moveTo(thisCursor, 1, 21);
		cursorEqual(thisCursor, 1, 21);
		moveRight(thisCursor, true);
		cursorEqual(thisCursor, 2, 1, 1, 21);
	});

	// --------- move word right

	test('move word right', () => {
		moveTo(thisCursor, 1, 1);
		var expectedStops = [
			[1, 8],
			[1, 14],
			[1, 19],
			[1, 21],
			[2, 4],
			[2, 11],
			[2, 16],
			[3, 10],
			[3, 15],
			[4, 1],
			[5, 2],
			[5, 2],
		];

		var actualStops:number[][] = [];
		for (var i = 0; i < expectedStops.length; i++) {
			moveWordRight(thisCursor);
			var pos = thisCursor.getPosition();
			actualStops.push([pos.lineNumber, pos.column]);
		}

		assert.deepEqual(actualStops, expectedStops);


	});

	test('move word right selection', () => {
		moveTo(thisCursor, 1, 1);
		cursorEqual(thisCursor, 1, 1);
		moveWordRight(thisCursor, true);
		cursorEqual(thisCursor, 1, 8, 1, 1);
	});
	// --------- move down

	test('move down', () => {
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);
	});

	test('move down with selection', () => {
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 3, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 4, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 5, 1, 1, 1);
		moveDown(thisCursor, 1, true);
		cursorEqual(thisCursor, 5, 2, 1, 1);
	});

	test('move down with tabs', () => {
		moveTo(thisCursor, 1, 5);
		cursorEqual(thisCursor, 1, 5);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, 5);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, 2);
	});

	// --------- move up

	test('move up', () => {
		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);

		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 1, 5);
	});

	test('move up with selection', () => {
		moveTo(thisCursor, 3, 5);
		cursorEqual(thisCursor, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 2, 2, 3, 5);

		moveUp(thisCursor, 1, true);
		cursorEqual(thisCursor, 1, 5, 3, 5);
	});

	test('move up and down with tabs', () => {
		moveTo(thisCursor, 1, 5);
		cursorEqual(thisCursor, 1, 5);
		moveDown(thisCursor, 4);
		cursorEqual(thisCursor, 5, 2);
		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 4, 1);
		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 3, 5);
		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 2, 2);
		moveUp(thisCursor, 1);
		cursorEqual(thisCursor, 1, 5);
	});

	test('move up and down with end of lines starting from a long one', () => {
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 2, LINE2.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 3, LINE3.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 4, LINE4.length + 1);
		moveDown(thisCursor, 1);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
		moveUp(thisCursor, 4);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	// --------- move to beginning of line

	test('move to beginning of line', () => {
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of line from within line', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of line from whitespace at beginning of line', () => {
		moveTo(thisCursor, 1, 2);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 1);
		moveToBeginningOfLine(thisCursor);
		cursorEqual(thisCursor, 1, 6);
	});

	test('move to beginning of line from within line selection', () => {
		moveTo(thisCursor, 1, 8);
		moveToBeginningOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, 6, 1, 8);
		moveToBeginningOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 1, 8);
	});

	// --------- move to end of line

	test('move to end of line', () => {
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move to end of line from within line', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
	});

	test('move to end of line from whitespace at end of line', () => {
		moveTo(thisCursor, 1, 20);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length + 1);
		moveToEndOfLine(thisCursor);
		cursorEqual(thisCursor, 1, LINE1.length - 1);
	});

	test('move to end of line from within line selection', () => {
		moveTo(thisCursor, 1, 6);
		moveToEndOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, LINE1.length - 1, 1, 6);
		moveToEndOfLine(thisCursor, true);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 6);
	});

	// --------- move to beginning of buffer

	test('move to beginning of buffer', () => {
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within first line', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor);
		cursorEqual(thisCursor, 1, 1);
	});

	test('move to beginning of buffer from within first line selection', () => {
		moveTo(thisCursor, 1, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 1, 3);
	});

	test('move to beginning of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToBeginningOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 1, 1, 3, 3);
	});

	// --------- move to end of buffer

	test('move to end of buffer', () => {
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within last line', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within another line', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor);
		cursorEqual(thisCursor, 5, LINE5.length + 1);
	});

	test('move to end of buffer from within last line selection', () => {
		moveTo(thisCursor, 5, 1);
		moveToEndOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 5, 1);
	});

	test('move to end of buffer from within another line selection', () => {
		moveTo(thisCursor, 3, 3);
		moveToEndOfBuffer(thisCursor, true);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 3, 3);
	});

	// --------- delete word left/right

	//	Model looks like:
	//	var LINE1 = '    \tMy First Line\t ';
	//	var LINE2 = '\tMy Second Line';
	//	var LINE3 = '    Third Line';
	//	var LINE4 = '';
	//	var LINE5 = '1';

	test('delete word left for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line');
		cursorEqual(thisCursor, 3, 7);
	});

	test('delete word left for caret at beginning of document', () => {
		moveTo(thisCursor, 1, 1);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy First Line\t ');
		cursorEqual(thisCursor, 1, 1);
	});

	test('delete word left for caret at end of whitespace', () => {
		moveTo(thisCursor, 3, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    ThirdLine');
		cursorEqual(thisCursor, 3, 10);
	});

	test('delete word left for caret just behind a word', () => {
		moveTo(thisCursor, 2, 11);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		cursorEqual(thisCursor, 2, 5);
	});

	test('delete word left for caret inside of a word', () => {
		moveTo(thisCursor, 1, 12);
		deleteWordLeft(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy st Line\t ');
		cursorEqual(thisCursor, 1, 9);
	});

	test('delete word right for non-empty selection', () => {
		moveTo(thisCursor, 3, 7);
		moveRight(thisCursor, true);
		moveRight(thisCursor, true);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), '    Thd Line');
		cursorEqual(thisCursor, 3, 7);
	});

	test('delete word right for caret at end of document', () => {
		moveTo(thisCursor, 5, 3);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(5), '1');
		cursorEqual(thisCursor, 5, 2);
	});

	test('delete word right for caret at beggining of whitespace', () => {
		moveTo(thisCursor, 3, 1);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(3), 'Third Line');
		cursorEqual(thisCursor, 3, 1);
	});

	test('delete word right for caret just before a word', () => {
		moveTo(thisCursor, 2, 5);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(2), '\tMy  Line');
		cursorEqual(thisCursor, 2, 5);
	});

	test('delete word right for caret inside of a word', () => {
		moveTo(thisCursor, 1, 11);
		deleteWordRight(thisCursor);
		assert.equal(thisModel.getLineContent(1), '    \tMy Fi Line\t ');
		cursorEqual(thisCursor, 1, 11);
	});

	// --------- misc

	test('select all', () => {
		cursorCommand(thisCursor, H.SelectAll);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
	});

	test('expandLineSelection', () => {
		//              0          1         2
		//              01234 56789012345678 0
		// var LINE1 = '    \tMy First Line\t ';
		moveTo(thisCursor, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 2);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 5);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 19);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 20);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);

		moveTo(thisCursor, 1, 21);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 1, LINE1.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 2, LINE2.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 3, LINE3.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 4, LINE4.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
		cursorCommand(thisCursor, H.ExpandLineSelection);
		cursorEqual(thisCursor, 5, LINE5.length + 1, 1, 1);
	});

	// --------- eventing

	test('no move doesn\'t trigger event', () => {
		thisCursor.addListener(EditorCommon.EventType.CursorPositionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		thisCursor.addListener(EditorCommon.EventType.CursorSelectionChanged, (e) => {
			assert.ok(false, 'was not expecting event');
		});
		moveTo(thisCursor, 1, 1);
	});

	test('move eventing', () => {
		var events = 0;
		thisCursor.addListener(EditorCommon.EventType.CursorPositionChanged, (e) => {
			events++;
			positionEqual(e.position, 1, 2);
		});
		thisCursor.addListener(EditorCommon.EventType.CursorSelectionChanged, (e) => {
			events++;
			selectionEqual(e.selection, 1, 2, 1, 2);
		});
		moveTo(thisCursor, 1, 2);
		assert.equal(events, 2, 'receives 2 events');
	});

	test('move in selection mode eventing', () => {
		var events = 0;
		thisCursor.addListener(EditorCommon.EventType.CursorPositionChanged, (e) => {
			events++;
			positionEqual(e.position, 1, 2);
		});
		thisCursor.addListener(EditorCommon.EventType.CursorSelectionChanged, (e) => {
			events++;
			selectionEqual(e.selection, 1, 2, 1, 1);
		});
		moveTo(thisCursor, 1, 2, true);
		assert.equal(events, 2, 'receives 2 events');
	});

	// --------- state save & restore

	test('saveState & restoreState', () => {
		moveTo(thisCursor, 2, 1, true);
		cursorEqual(thisCursor, 2, 1, 1, 1);

		var savedState = JSON.stringify(thisCursor.saveState());

		moveTo(thisCursor, 1, 1, false);
		cursorEqual(thisCursor, 1, 1);

		thisCursor.restoreState(JSON.parse(savedState));
		cursorEqual(thisCursor, 2, 1, 1, 1);
	});

	// --------- updating cursor

	test('Independent model edit 1', () => {
		moveTo(thisCursor, 2, 16, true);

		thisModel.applyEdits([EditOperation.delete(new Range.Range(2, 1, 2, 2))]);
		cursorEqual(thisCursor, 2, 15, 1, 1);
	});

	// --------- bugs

	test('Bug 9121: Auto indent + undo + redo is funky', () => {
		var model = new Model.Model('', thisHighlighter);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({
			tabSize: 4,
			insertSpaces: false
		}), model, null, false);
		cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n', 'assert1');

		cursorCommand(cursor, H.Tab, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t', 'assert2');

		cursorCommand(cursor, H.Type, { text: '\n'}, null, 'keyboard');
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\n\t', 'assert3');

		cursorCommand(cursor, H.Type, { text: 'x' });
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\n\tx', 'assert4');

		cursorCommand(cursor, H.CursorLeft, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\n\tx', 'assert5');

		cursorCommand(cursor, H.DeleteLeft, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\nx', 'assert6');

		cursorCommand(cursor, H.DeleteLeft, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\tx', 'assert7');

		cursorCommand(cursor, H.DeleteLeft, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\nx', 'assert8');

		cursorCommand(cursor, H.DeleteLeft, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), 'x', 'assert9');

		cursorCommand(cursor, H.Undo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\nx', 'assert10');

		cursorCommand(cursor, H.Undo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\nx', 'assert11');

		cursorCommand(cursor, H.Undo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\n\tx', 'assert12');

		cursorCommand(cursor, H.Redo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\n\t\nx', 'assert13');

		cursorCommand(cursor, H.Redo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), '\nx', 'assert14');

		cursorCommand(cursor, H.Redo, {});
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.LF), 'x', 'assert15');

		cursor.dispose();
		model.dispose();
	});
});

suite('Editor Controller - Cursor Configuration', () => {

	var thisHighlighter = new ModelModes.CursorMode();

	test('issue #183: jump to matching bracket position', () => {
		let mode = new ModelModes.BracketMode();
		let model = new Model.Model([
			'var x = (3 + (5-7));'
		].join('\n'), mode);
		let cursor = new Cursor.Cursor(1, new MockConfiguration(null), model, null, false);

		// ensure is tokenized
		model.getLineContext(1);

		moveTo(cursor, 1, 20);

		cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
		cursorEqual(cursor, 1, 10);

		cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
		cursorEqual(cursor, 1, 20);

		cursorCommand(cursor, H.JumpToBracket, null, null, 'keyboard');
		cursorEqual(cursor, 1, 10);

		cursor.dispose();
		model.dispose();
	});

	test('Cursor honors insertSpaces configuration on new line', () => {
		var text = '    \tMy First Line\t \n' + '\tMy Second Line\n' + '    Third Line\n' + '\n' + '1';
		var model = new Model.Model(text, thisHighlighter);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(1, 21) }, null, 'keyboard');
		cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
		assert.equal(model.getLineContent(1), '    \tMy First Line\t ');
		assert.equal(model.getLineContent(2), '        ');

		cursor.dispose();
		model.dispose();
	});

	test('bug #16543: Tab should indent to correct indentation spot immediately', () => {
		var text = [
			'function baz() {',
			'\tfunction hello() { // something here',
			'\t',
			'',
			'\t}',
			'}'
		];
		var mode = new ModelModes.IndentingMode();
		var model = new Model.Model(text.join('\n'), mode);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: false, tabSize: 4 }), model, null, false);

		moveTo(cursor, 4, 1, false);
		cursorEqual(cursor, 4, 1, 4, 1);

		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(4), '\t\t');

		cursor.dispose();
		model.dispose();
	});

	test('Bug 18276:[editor] Indentation broken when selection is empty', () => {
		var text = [
			'function baz() {'
		];
		var model = new Model.Model(text.join('\n'), null);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: false, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 2, false);
		cursorEqual(cursor, 1, 2, 1, 2);

		cursorCommand(cursor, H.Indent, null, null, 'keyboard');
		assert.equal(model.getLineContent(1), '\tfunction baz() {');

		cursorEqual(cursor, 1, 3, 1, 3);
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(1), '\tf\tunction baz() {');

		cursor.dispose();
		model.dispose();
	});

	test('bug #16815:Shift+Tab doesn\'t go back to tabstop', () => {
		var text = [
			'     function baz() {'
		];
		var model = new Model.Model(text.join('\n'), null);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 6, false);
		cursorEqual(cursor, 1, 6, 1, 6);

		cursorCommand(cursor, H.Outdent, null, null, 'keyboard');
		assert.equal(model.getLineContent(1), '    function baz() {');
		cursorEqual(cursor, 1, 5, 1, 5);

		cursor.dispose();
		model.dispose();
	});

	test('Bug #18293:[regression][editor] Can\'t outdent whitespace line', () => {
		var text = [
			'      '
		];
		var model = new Model.Model(text.join('\n'), null);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 7, false);
		cursorEqual(cursor, 1, 7, 1, 7);

		cursorCommand(cursor, H.Outdent, null, null, 'keyboard');
		assert.equal(model.getLineContent(1), '    ');
		cursorEqual(cursor, 1, 5, 1, 5);

		cursor.dispose();
		model.dispose();
	});

	test('Bug #16657: [editor] Tab on empty line of zero indentation moves cursor to position (1,1)', () => {
		var text = [
			'function baz() {',
			'\tfunction hello() { // something here',
			'\t',
			'',
			'\t}',
			'}',
			''
		];
		var model = new Model.Model(text.join('\n'), null);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: false, tabSize: 4 }), model, null, false);

		moveTo(cursor, 7, 1, false);
		cursorEqual(cursor, 7, 1, 7, 1);

		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(7), '\t');
		cursorEqual(cursor, 7, 2, 7, 2);

		cursor.dispose();
		model.dispose();
	});

	test('bug #16740: [editor] Cut line doesn\'t quite cut the last line', () => {
		// Part 1 => there is text on the last line
		var text = [
			'asdasd',
			'qwerty'
		];
		var model = new Model.Model(text.join('\n'), null);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: false, tabSize: 4 }), model, null, true);

		moveTo(cursor, 2, 1, false);
		cursorEqual(cursor, 2, 1, 2, 1);

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursor.dispose();
		model.dispose();

		// Part 2 => there is no text on the last line
		text = [
			'asdasd',
			''
		];
		model = new Model.Model(text.join('\n'), null);
		cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: false, tabSize: 4 }), model, null, true);

		moveTo(cursor, 2, 1, false);
		cursorEqual(cursor, 2, 1, 2, 1);

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), 'asdasd');

		cursorCommand(cursor, H.Cut, null, null, 'keyboard');
		assert.equal(model.getLineCount(), 1);
		assert.equal(model.getLineContent(1), '');

		cursor.dispose();
		model.dispose();
	});

	test('Cursor honors insertSpaces configuration on tab', () => {
		var text = '    \tMy First Line\t \n' + 'My Second Line123\n' + '    Third Line\n' + '\n' + '1';
		var model = new Model.Model(text, thisHighlighter);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize:13 }), model, null, false);

		// Tab on column 1
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 1) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), '             My Second Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 2
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 2) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'M            y Second Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 3
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 3) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My            Second Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 4
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 4) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My           Second Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 5
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 5) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My S         econd Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 5
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 5) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My S         econd Line123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 13
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 13) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My Second Li ne123');
		cursorCommand(cursor, H.Undo, null, null, 'keyboard');

		// Tab on column 14
		assert.equal(model.getLineContent(2), 'My Second Line123');
		cursorCommand(cursor, H.MoveTo, { position: new Position.Position(2, 14) }, null, 'keyboard');
		cursorCommand(cursor, H.Tab, null, null, 'keyboard');
		assert.equal(model.getLineContent(2), 'My Second Lin             e123');

		cursor.dispose();
		model.dispose();
	});

	test('Bug #11476: Double bracket surrounding + undo is broken', () => {
		var text = 'hello';
		var model = new Model.Model(text, new ModelModes.SurroundingMode());
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true }), model, null, false);

		moveTo(cursor, 1, 3, false);
		moveTo(cursor, 1, 5, true);
		cursorEqual(cursor, 1, 5, 1, 3);

		cursorCommand(cursor, H.Type, { text: '(' }, null, 'keyboard');
		cursorEqual(cursor, 1, 6, 1, 4);

		cursorCommand(cursor, H.Type, { text: '(' }, null, 'keyboard');
		cursorEqual(cursor, 1, 7, 1, 5);

		cursor.dispose();
		model.dispose();
	});

	test('Enter auto-indents with insertSpaces setting 1', () => {
		var text = '\thello';
		var mode = new ModelModes.IndentingMode();
		var model = new Model.Model(text, mode);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 7, false);
		cursorEqual(cursor, 1, 7, 1, 7);

		cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.CRLF), '\thello\r\n        ');

		cursor.dispose();
		model.dispose();
	});

	test('Enter auto-indents with insertSpaces setting 2', () => {
		var text = '\thello';
		var mode = new ModelModes.NonIndentingMode();
		var model = new Model.Model(text, mode);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 7, false);
		cursorEqual(cursor, 1, 7, 1, 7);

		cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.CRLF), '\thello\r\n    ');

		cursor.dispose();
		model.dispose();
	});

	test('Enter auto-indents with insertSpaces setting 3', () => {
		var text = '\thell()';
		var mode = new ModelModes.IndentOutdentMode();
		var model = new Model.Model(text, mode);
		var cursor = new Cursor.Cursor(1, new MockConfiguration({ insertSpaces: true, tabSize: 4 }), model, null, false);

		moveTo(cursor, 1, 7, false);
		cursorEqual(cursor, 1, 7, 1, 7);

		cursorCommand(cursor, H.Type, { text: '\n' }, null, 'keyboard');
		assert.equal(model.getValue(EditorCommon.EndOfLinePreference.CRLF), '\thell(\r\n        \r\n    )');

		cursor.dispose();
		model.dispose();
	});

	test('Insert line before', () => {

		var testInsertLineBefore = (lineNumber:number, column:number, callback:(model:Model.Model, cursor:Cursor.Cursor) => void) => {
			usingCursor([
				'First line',
				'Second line',
				'Third line'
			], null, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				cursorEqual(cursor, lineNumber, column, lineNumber, column);

				cursorCommand(cursor, H.LineInsertBefore, null, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineBefore(1, 3, (model, cursor) => {
			cursorEqual(cursor, 1, 1, 1, 1);
			assert.equal(model.getLineContent(1), '');
			assert.equal(model.getLineContent(2), 'First line');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(2, 3, (model, cursor) => {
			cursorEqual(cursor, 2, 1, 2, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineBefore(3, 3, (model, cursor) => {
			cursorEqual(cursor, 3, 1, 3, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});
	});

	test('Insert line after', () => {

		var testInsertLineAfter = (lineNumber:number, column:number, callback:(model:Model.Model, cursor:Cursor.Cursor) => void) => {
			usingCursor([
				'First line',
				'Second line',
				'Third line'
			], null, (model, cursor) => {
				moveTo(cursor, lineNumber, column, false);
				cursorEqual(cursor, lineNumber, column, lineNumber, column);

				cursorCommand(cursor, H.LineInsertAfter, null, null, 'keyboard');
				callback(model, cursor);
			});
		};

		testInsertLineAfter(1, 3, (model, cursor) => {
			cursorEqual(cursor, 2, 1, 2, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), '');
			assert.equal(model.getLineContent(3), 'Second line');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(2, 3, (model, cursor) => {
			cursorEqual(cursor, 3, 1, 3, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), '');
			assert.equal(model.getLineContent(4), 'Third line');
		});

		testInsertLineAfter(3, 3, (model, cursor) => {
			cursorEqual(cursor, 4, 1, 4, 1);
			assert.equal(model.getLineContent(1), 'First line');
			assert.equal(model.getLineContent(2), 'Second line');
			assert.equal(model.getLineContent(3), 'Third line');
			assert.equal(model.getLineContent(4), '');
		});
	});
});

interface ICursorOpts {
	mode: Modes.IMode;
	config: any;
}

function usingCursor(text:string[], opts:ICursorOpts, callback:(model:Model.Model, cursor:Cursor.Cursor)=>void): void {
	opts = opts || <any>{};
	var model = new Model.Model(text.join('\n'), opts.mode);
	var config = new MockConfiguration(opts.config);
	var cursor = new Cursor.Cursor(1, config, model, null, false);

	callback(model, cursor);

	cursor.dispose();
	config.dispose();
	model.dispose();
}