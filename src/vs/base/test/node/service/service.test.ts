/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Client } from 'vs/base/node/service.cp';
import uri from 'vs/base/common/uri';
import {isPromiseCanceledError} from 'vs/base/common/errors';
import {TestService} from 'vs/base/test/node/service/testService';

function createService() {
	const server = new Client(
		uri.parse(require.toUrl('bootstrap')).fsPath,
		{
			serverName: 'TestServer',
			env: { AMD_ENTRYPOINT: 'vs/base/test/node/service/testApp', verbose: true }
		}
	);

	return server.getService<TestService>('TestService', TestService);
}

suite('Service', () => {

	test('createService', function(done: () => void) {
		this.timeout(5000);

		const testService = createService();
		const res = testService.pong('ping');

		res.then(r => {
			assert.equal(r.incoming, 'ping');
			assert.equal(r.outgoing, 'pong');
			done();
		});
	});

	test('cancellation', function(done: () => void) {
		this.timeout(5000);

		const testService = createService();
		const res = testService.cancelMe();

		setTimeout(() => {
			res.cancel();
		}, 50);

		res.then(r => {
			assert.fail('Unexpected');
			done();
		}, (error) => {
			assert.ok(isPromiseCanceledError(error));
			done();
		});
	});
});