/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import uri from 'vs/base/common/uri';
import {Match, FileMatch, SearchResult} from 'vs/workbench/parts/search/common/searchModel';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {create} from 'vs/platform/instantiation/common/instantiationService';
import {SearchSorter, SearchDataSource} from 'vs/workbench/parts/search/browser/searchViewlet';
import {TestContextService} from 'vs/workbench/test/browser/servicesTestUtils';

suite('Search - Viewlet', () => {
	let instantiation: IInstantiationService;

	setup(() => {
		instantiation = create({
			modelService: {
				getModel: () => null
			},
			requestService: {
				getRequestUrl: () => 'file:///folder/file.txt'
			},
			contextService: new TestContextService()
		});
	});

	test('Data Source', function() {
		let ds = new SearchDataSource();
		let result = instantiation.createInstance(SearchResult, null);
		result.append([{
			resource: uri.parse('file:///c:/foo'),
			lineMatches: [{ lineNumber: 1, preview: 'bar', offsetAndLengths: [[0, 1]] }]
		}]);

		let fileMatch = result.matches()[0];
		let lineMatch = fileMatch.matches()[0];

		assert.equal(ds.getId(null, result), 'root');
		assert.equal(ds.getId(null, fileMatch), 'file:///c%3A/foo');
		assert.equal(ds.getId(null, lineMatch), 'file:///c%3A/foo>1>0');

		assert(!ds.hasChildren(null, 'foo'));
		assert(ds.hasChildren(null, result));
		assert(ds.hasChildren(null, fileMatch));
		assert(!ds.hasChildren(null, lineMatch));
	});

	test('Sorter', function() {
		let fileMatch1 = new FileMatch(null, uri.file('C:\\foo'));
		let fileMatch2 = new FileMatch(null, uri.file('C:\\with\\path'));
		let fileMatch3 = new FileMatch(null, uri.file('C:\\with\\path\\foo'));
		let lineMatch1 = new Match(fileMatch1, 'bar', 1, 1, 1);
		let lineMatch2 = new Match(fileMatch1, 'bar', 2, 1, 1);
		let lineMatch3 = new Match(fileMatch1, 'bar', 2, 1, 1);

		let s = new SearchSorter();

		assert(s.compare(null, fileMatch1, fileMatch2) < 0);
		assert(s.compare(null, fileMatch2, fileMatch1) > 0);
		assert(s.compare(null, fileMatch1, fileMatch1) === 0);
		assert(s.compare(null, fileMatch2, fileMatch3) < 0);

		assert(s.compare(null, lineMatch1, lineMatch2) < 0);
		assert(s.compare(null, lineMatch2, lineMatch1) > 0);
		assert(s.compare(null, lineMatch2, lineMatch3) === 0);
	});
});