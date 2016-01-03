/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {ExtHostDocument} from 'vs/workbench/api/common/extHostDocuments';
import {Position} from 'vs/workbench/api/common/extHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';


suite("PluginHostDocument", () => {

	let doc: ExtHostDocument;

	function assertPositionAt(offset: number, line: number, character: number) {
		let position = doc.positionAt(offset);
		assert.equal(position.line, line);
		assert.equal(position.character, character);
	}

	function assertOffsetAt(line: number, character: number, offset: number) {
		let pos = new Position(line, character);
		let actual = doc.offsetAt(pos);
		assert.equal(actual, offset);
	}

	setup(function() {
		doc = new ExtHostDocument(undefined, URI.file(''), [
			'This is line one', //16
			'and this is line number two', //27
			'it is followed by #3', //20
			'and finished with the fourth.', //29
		], '\n', 'text', 1, false);
	});

	test('readonly-ness', function() {

		assert.throws(() => doc.uri = null);
		assert.throws(() => doc.fileName = 'foofile');
		assert.throws(() => doc.isDirty = false);
		assert.throws(() => doc.isUntitled = false);
		assert.throws(() => doc.languageId = 'dddd');
		assert.throws(() => doc.lineCount = 9);
	})

	test('lines', function() {

		assert.equal(doc.lineCount, 4);
		assert.throws(() => doc.lineCount = 9);

		assert.throws(() => doc.lineAt(-1));
		assert.throws(() => doc.lineAt(doc.lineCount));
		assert.throws(() => doc.lineAt(Number.MAX_VALUE));
		assert.throws(() => doc.lineAt(Number.MIN_VALUE));
		assert.throws(() => doc.lineAt(0.8));

		let line = doc.lineAt(0);
		assert.equal(line.lineNumber, 0);
		assert.equal(line.text.length, 16);
		assert.equal(line.text, 'This is line one');
		assert.equal(line.isEmptyOrWhitespace, false);
		assert.equal(line.firstNonWhitespaceCharacterIndex, 0);

		doc._acceptEvents([{
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			text: '\t ',
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		}]);

		// line didn't change
		assert.equal(line.text, 'This is line one');
		assert.equal(line.firstNonWhitespaceCharacterIndex, 0);

		// fetch line again
		line = doc.lineAt(0);
		assert.equal(line.text, '\t This is line one');
		assert.equal(line.firstNonWhitespaceCharacterIndex, 2);
	});

	test('offsetAt', function() {
		assertOffsetAt(0, 0, 0);
		assertOffsetAt(0, 1, 1);
		assertOffsetAt(0, 16, 16);
		assertOffsetAt(1, 0, 17);
		assertOffsetAt(1, 3, 20);
		assertOffsetAt(2, 0, 45);
		assertOffsetAt(4, 29, 95);
		assertOffsetAt(4, 30, 95);
		assertOffsetAt(4, Number.MAX_VALUE, 95);
		assertOffsetAt(5, 29, 95);
		assertOffsetAt(Number.MAX_VALUE, 29, 95);
		assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
	});

	test('offsetAt, after remove', function() {

		doc._acceptEvents([{
			range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
			text: '',
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		}]);

		assertOffsetAt(0, 1, 1);
		assertOffsetAt(0, 13, 13);
		assertOffsetAt(1, 0, 14);
	});

	test('offsetAt, after replace', function() {

		doc._acceptEvents([{
			range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
			text: 'is could be',
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		}]);

		assertOffsetAt(0, 1, 1);
		assertOffsetAt(0, 24, 24);
		assertOffsetAt(1, 0, 25);
	});

	test('offsetAt, after insert line', function() {

		doc._acceptEvents([{
			range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
			text: 'is could be\na line with number',
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		}]);

		assertOffsetAt(0, 1, 1);
		assertOffsetAt(0, 13, 13);
		assertOffsetAt(1, 0, 14);
		assertOffsetAt(1, 18, 13 + 1 + 18);
		assertOffsetAt(1, 29, 13 + 1 + 29);
		assertOffsetAt(2, 0, 13 + 1 + 29 + 1);
	});

	test('offsetAt, after remove line', function() {

		doc._acceptEvents([{
			range: { startLineNumber: 1, startColumn: 3, endLineNumber: 2, endColumn: 6 },
			text: '',
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		}]);

		assertOffsetAt(0, 1, 1);
		assertOffsetAt(0, 2, 2);
		assertOffsetAt(1, 0, 25);
	})

	test('positionAt', function() {
		assertPositionAt(0, 0, 0);
		assertPositionAt(Number.MIN_VALUE, 0, 0);
		assertPositionAt(1, 0, 1);
		assertPositionAt(16, 0, 16);
		assertPositionAt(17, 1, 0);
		assertPositionAt(20, 1, 3);
		assertPositionAt(45, 2, 0);
		assertPositionAt(95, 3, 29);
		assertPositionAt(96, 3, 29);
		assertPositionAt(99, 3, 29);
		assertPositionAt(Number.MAX_VALUE, 3, 29);
	});
});

enum AssertDocumentLineMappingDirection {
	OffsetToPosition,
	PositionToOffset
}

suite("PluginHostDocument updates line mapping", () => {

	function positionToStr(position:Position): string {
		return '(' + position.line + ',' + position.character + ')';
	}

	function assertDocumentLineMapping(doc:ExtHostDocument, direction:AssertDocumentLineMappingDirection): void {
		let allText = doc.getText();

		let line = 0, character = 0, previousIsCarriageReturn = false;
		for (let offset = 0; offset <= allText.length; offset++) {
			// The position coordinate system cannot express the position between \r and \n
			let	position = new Position(line, character + (previousIsCarriageReturn ? -1 : 0));

			if (direction === AssertDocumentLineMappingDirection.OffsetToPosition) {
				let actualPosition = doc.positionAt(offset);
				assert.equal(positionToStr(actualPosition), positionToStr(position), 'positionAt mismatch for offset ' + offset);
			} else {
				// The position coordinate system cannot express the position between \r and \n
				let expectedOffset = offset + (previousIsCarriageReturn ? -1 : 0);
				let actualOffset = doc.offsetAt(position);
				assert.equal(actualOffset, expectedOffset, 'offsetAt mismatch for position ' + positionToStr(position));
			}

			if (allText.charAt(offset) === '\n') {
				line++;
				character = 0;
			} else {
				character++;
			}

			previousIsCarriageReturn = (allText.charAt(offset) === '\r');
		}
	}

	function createChangeEvent(range:CodeEditorRange, text:string): EditorCommon.IModelContentChangedEvent2 {
		return {
			range: range,
			text: text,
			isRedoing: undefined,
			isUndoing: undefined,
			versionId: undefined,
			rangeLength: undefined,
		};
	}

	function testLineMappingDirectionAfterEvents(lines:string[], eol: string, direction:AssertDocumentLineMappingDirection, events:EditorCommon.IModelContentChangedEvent2[]): void {
		let myDocument = new ExtHostDocument(undefined, URI.file(''), lines.slice(0), eol, 'text', 1, false);
		assertDocumentLineMapping(myDocument, direction);

		myDocument._acceptEvents(events);
		assertDocumentLineMapping(myDocument, direction);
	}

	function testLineMappingAfterEvents(lines:string[], events:EditorCommon.IModelContentChangedEvent2[]): void {
		testLineMappingDirectionAfterEvents(lines, '\n', AssertDocumentLineMappingDirection.PositionToOffset, events);
		testLineMappingDirectionAfterEvents(lines, '\n', AssertDocumentLineMappingDirection.OffsetToPosition, events);

		testLineMappingDirectionAfterEvents(lines, '\r\n', AssertDocumentLineMappingDirection.PositionToOffset, events);
		testLineMappingDirectionAfterEvents(lines, '\r\n', AssertDocumentLineMappingDirection.OffsetToPosition, events);
	}

	test('line mapping', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], []);
	});

	test('after remove', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 1, 6), '')]);
	});

	test('after replace', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 1, 6), 'is could be')]);
	});

	test('after insert line', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 1, 6), 'is could be\na line with number')]);
	});

	test('after insert two lines', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 1, 6), 'is could be\na line with number\nyet another line')]);
	});

	test('after remove line', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 2, 6), '')]);
	});

	test('after remove two lines', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 3, 6), '')]);
	});

	test('after deleting entire content', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 4, 30), '')]);
	});

	test('after replacing entire content', () => {
		testLineMappingAfterEvents([
			'This is line one',
			'and this is line number two',
			'it is followed by #3',
			'and finished with the fourth.',
		], [createChangeEvent(new CodeEditorRange(1, 3, 4, 30), 'some new text\nthat\nspans multiple lines')]);
	});
});