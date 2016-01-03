/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Model} from 'vs/editor/common/model/model';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {Position} from 'vs/editor/common/core/position';
import {Cursor} from 'vs/editor/common/controller/cursor';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IMode} from 'vs/editor/common/modes';
import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';
import {MockConfiguration} from 'vs/editor/test/common/commands/commandTestUtils';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {ModelLine, ILineEdit} from 'vs/editor/common/model/modelLine';

function testCommand(lines:string[], selection:Selection, edits:EditorCommon.IIdentifiedSingleEditOperation[], expectedLines:string[], expectedSelection:Selection): void {
	let model = new Model(lines.join('\n'), null);
	let config = new MockConfiguration(null);
	let cursor = new Cursor(0, config, model, null, false);

	cursor.setSelections('tests', [selection]);

	model.applyEdits(edits);

	let actualValue = model.toRawText().lines;
	assert.deepEqual(actualValue, expectedLines);

	let actualSelection = cursor.getSelection();
	assert.deepEqual(actualSelection.toString(), expectedSelection.toString());

	cursor.dispose();
	config.dispose();
	model.dispose();
}

function testLineEditMarker(text:string, column:number, stickToPreviousCharacter:boolean, edit:ILineEdit, expectedColumn: number): void {
	var line = new ModelLine(1, text);
	line.addMarker({
		id: '1',
		line: null,
		column: column,
		stickToPreviousCharacter: stickToPreviousCharacter,
		oldLineNumber: 0,
		oldColumn: 0,
	});

	line.applyEdits({}, [edit]);

	assert.equal(line.getMarkers()[0].column, expectedColumn);
}

suite('Editor Side Editing - collapsed selection', () => {

	test('replace at selection', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,1,1,1),
			[
				EditOperation.replace(new Selection(1,1,1,1), 'something ')
			],
			[
				'something first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,1,1,11)
		);
	});

	test('replace at selection 2', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,1,1,6),
			[
				EditOperation.replace(new Selection(1,1,1,6), 'something')
			],
			[
				'something',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,1,1,10)
		);
	});

	test('ModelLine.applyEdits uses `isReplace`', () => {
		testLineEditMarker('something', 1, true, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: false }, 1);
		testLineEditMarker('something', 1, true, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: true }, 4);

		testLineEditMarker('something', 1, false, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: false }, 4);
		testLineEditMarker('something', 1, false, { startColumn: 1, endColumn: 1, text: 'asd', forceMoveMarkers: true }, 4);
	});

	test('insert at selection', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,1,1,1),
			[
				EditOperation.insert(new Position(1,1), 'something ')
			],
			[
				'something first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,11,1,11)
		);
	});

	test('insert at selection sitting on max column', () => {
		testCommand(
			[
				'first',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(1,6,1,6),
			[
				EditOperation.insert(new Position(1,6), ' something\nnew ')
			],
			[
				'first something',
				'new ',
				'second line',
				'third line',
				'fourth'
			],
			new Selection(2,5,2,5)
		);
	});

});