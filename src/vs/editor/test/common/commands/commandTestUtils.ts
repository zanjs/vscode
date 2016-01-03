/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Model} from 'vs/editor/common/model/model';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {Cursor} from 'vs/editor/common/controller/cursor';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IMode} from 'vs/editor/common/modes';
import {CommonEditorConfiguration, ICSSConfig} from 'vs/editor/common/config/commonEditorConfig';

export class MockConfiguration extends CommonEditorConfiguration {

	constructor(opts:any) {
		super(opts);
	}

	protected getOuterWidth(): number {
		return 100;
	}

	protected getOuterHeight(): number {
		return 100;
	}

	protected readConfiguration(editorClassName: string, fontFamily: string, fontSize: number, lineHeight: number): ICSSConfig {
		// Doesn't really matter
		return {
			typicalHalfwidthCharacterWidth: 10,
			typicalFullwidthCharacterWidth: 20,
			maxDigitWidth: 10,
			lineHeight: 20,
			font: 'mockFont',
			fontSize: 20
		};
	}
}

export function testCommand(
	lines: string[],
	mode: IMode,
	selection: Selection,
	commandFactory: (selection:Selection) => EditorCommon.ICommand,
	expectedLines: string[],
	expectedSelection: Selection
): void {

	let model = new Model(lines.join('\n'), mode);
	let config = new MockConfiguration(null);
	let cursor = new Cursor(0, config, model, null, false);

	cursor.setSelections('tests', [selection]);

	cursor.configuration.handlerDispatcher.trigger('tests', EditorCommon.Handler.ExecuteCommand, commandFactory(cursor.getSelection()));

	let actualValue = model.toRawText().lines;
	assert.deepEqual(actualValue, expectedLines);

	let actualSelection = cursor.getSelection();
	assert.deepEqual(actualSelection.toString(), expectedSelection.toString());

	cursor.dispose();
	config.dispose();
	model.dispose();
}

/**
 * Extract edit operations if command `command` were to execute on model `model`
 */
export function getEditOperation(model: EditorCommon.IModel, command: EditorCommon.ICommand): EditorCommon.IIdentifiedSingleEditOperation[] {
	var operations: EditorCommon.IIdentifiedSingleEditOperation[] = [];
	var editOperationBuilder: EditorCommon.IEditOperationBuilder = {
		addEditOperation: (range: EditorCommon.IEditorRange, text: string) => {
			operations.push({
				identifier: null,
				range: range,
				text: text,
				forceMoveMarkers: false
			});
		},

		trackSelection: (selection: EditorCommon.IEditorSelection) => {
			return null;
		}
	};
	command.getEditOperations(model, editOperationBuilder);
	return operations;
}

/**
 * Create single edit operation
 */
export function createSingleEditOp(text:string, positionLineNumber:number, positionColumn:number, selectionLineNumber:number = positionLineNumber, selectionColumn:number = positionColumn):EditorCommon.IIdentifiedSingleEditOperation {
	return {
		identifier: null,
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text,
		forceMoveMarkers: false
	};
}

/**
 * Create single edit operation
 */
export function createInsertDeleteSingleEditOp(text:string, positionLineNumber:number, positionColumn:number, selectionLineNumber:number = positionLineNumber, selectionColumn:number = positionColumn):EditorCommon.IIdentifiedSingleEditOperation {
	return {
		identifier: null,
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text,
		forceMoveMarkers: true
	};
}
