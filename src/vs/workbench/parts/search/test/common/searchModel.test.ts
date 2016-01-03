/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Match, FileMatch, SearchResult} from 'vs/workbench/parts/search/common/searchModel';
import model = require('vs/editor/common/model/model');
import {Emitter} from 'vs/base/common/event';
import {IModel} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {create} from 'vs/platform/instantiation/common/instantiationService';
import {TestContextService} from 'vs/workbench/test/browser/servicesTestUtils';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IFileMatch} from 'vs/platform/search/common/search';

function toUri(path: string): URI {
	return URI.file('C:\\' + path);
}

suite('Search - Model', () => {
	let instantiation: IInstantiationService;
	let oneModel: IModel;

	setup(() => {
		let emitter = new Emitter<any>();

		oneModel = new model.Model('line1\nline2\nline3', null, URI.parse('file:///folder/file.txt'));
		instantiation = create({
			modelService: {
				getModel: () => oneModel,
				onModelAdded: emitter.event
			},
			requestService: {
				getRequestUrl: () => 'file:///folder/file.txt'
			},
			contextService: new TestContextService()
		});
	});

	teardown(() => {
		oneModel.dispose();
	});

	test('Line Match', function() {
		let fileMatch = new FileMatch(null, toUri('folder\\file.txt'));
		let lineMatch = new Match(fileMatch, 'foo bar', 1, 0, 3);
		assert.equal(lineMatch.text(), 'foo bar');
		assert.equal(lineMatch.range().startLineNumber, 2);
		assert.equal(lineMatch.range().endLineNumber, 2);
		assert.equal(lineMatch.range().startColumn, 1);
		assert.equal(lineMatch.range().endColumn, 4);
	});

	test('Line Match - Remove', function() {

		let fileMatch = new FileMatch(null, toUri('folder\\file.txt'));
		let lineMatch = new Match(fileMatch, 'foo bar', 1, 0, 3);
		fileMatch.add(lineMatch);
		assert.equal(fileMatch.matches().length, 1);
		fileMatch.remove(lineMatch);
		assert.equal(fileMatch.matches().length, 0);
	});

	test('File Match', function() {

		let fileMatch = new FileMatch(null, toUri('folder\\file.txt'));
		assert.equal(fileMatch.matches(), 0);
		assert.equal(fileMatch.resource().toString(), 'file:///c%3A/folder/file.txt');
		assert.equal(fileMatch.name(), 'file.txt');

		fileMatch = new FileMatch(null, toUri('file.txt'));
		assert.equal(fileMatch.matches(), 0);
		assert.equal(fileMatch.resource().toString(), 'file:///c%3A/file.txt');
		assert.equal(fileMatch.name(), 'file.txt');
	});

	test('Search Result', function() {

		let searchResult = instantiation.createInstance(SearchResult, null);
		assert.equal(searchResult.isEmpty(), true);

		let raw: IFileMatch[] = [];
		for (let i = 0; i < 10; i++) {
			raw.push({
				resource: URI.parse('file://c:/' + i),
				lineMatches: [{
					preview: String(i),
					lineNumber: 1,
					offsetAndLengths: [[0, 1]]
				}]
			});
		}
		searchResult.append(raw);

		assert.equal(searchResult.isEmpty(), false);
		assert.equal(searchResult.matches().length, 10);
	});

	test('Alle Drei Zusammen', function() {

		let searchResult = instantiation.createInstance(SearchResult, null);
		let fileMatch = new FileMatch(searchResult, toUri('far\\boo'));
		let lineMatch = new Match(fileMatch, 'foo bar', 1, 0, 3);

		assert(lineMatch.parent() === fileMatch);
		assert(fileMatch.parent() === searchResult);
	});

	//// ----- utils
	//function lineHasDecorations(model: editor.IModel, lineNumber: number, decorations: { start: number; end: number; }[]): void {
	//    let lineDecorations:typeof decorations = [];
	//    let decs = model.getLineDecorations(lineNumber);
	//    for (let i = 0, len = decs.length; i < len; i++) {
	//        lineDecorations.push({
	//            start: decs[i].range.startColumn,
	//            end: decs[i].range.endColumn
	//        });
	//    }
	//    assert.deepEqual(lineDecorations, decorations);
	//}
	//
	//function lineHasNoDecoration(model: editor.IModel, lineNumber: number): void {
	//    lineHasDecorations(model, lineNumber, []);
	//}
	//
	//function lineHasDecoration(model: editor.IModel, lineNumber: number, start: number, end: number): void {
	//    lineHasDecorations(model, lineNumber, [{
	//        start: start,
	//        end: end
	//    }]);
	//}
	//// ----- end utils
	//
	//test('Model Highlights', function () {
	//
	//    let fileMatch = instantiation.createInstance(FileMatch, null, toUri('folder\\file.txt'));
	//    fileMatch.add(new Match(fileMatch, 'line2', 1, 0, 2));
	//    fileMatch.connect();
	//    lineHasDecoration(oneModel, 2, 1, 3);
	//});
	//
	//test('Dispose', function () {
	//
	//    let fileMatch = instantiation.createInstance(FileMatch, null, toUri('folder\\file.txt'));
	//    fileMatch.add(new Match(fileMatch, 'line2', 1, 0, 2));
	//    fileMatch.connect();
	//    lineHasDecoration(oneModel, 2, 1, 3);
	//
	//    fileMatch.dispose();
	//    lineHasNoDecoration(oneModel, 2);
	//});
});