/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import path = require('path');
import fs = require('fs');

import stream = require('vs/base/node/stream');
import encoding = require('vs/base/node/encoding');

var utf8Buffer = new Buffer([0xEF, 0xBB, 0xBF]);

suite('Stream', () => {
	test('readExactlyByFile - ANSI', function(done:()=>void) {
		var file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByFile(file, 10, (error:Error, buffer:NodeBuffer, count:number)=>{
			assert.equal(error, null);
			assert.equal(count, 10);
			assert.equal(buffer.toString(), '/*--------');

			done();
		});
	});

	test('readExactlyByFile - empty', function(done:()=>void) {
		var file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByFile(file, 10, (error:Error, buffer:NodeBuffer, count:number)=>{
			assert.equal(error, null);
			assert.equal(count, 0);

			done();
		});
	});

	test('readExactlyByStream - ANSI', function(done:()=>void) {
		var file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByStream(fs.createReadStream(file), 10, (error:Error, buffer:NodeBuffer, count:number)=>{
			assert.equal(error, null);
			assert.equal(count, 10);
			assert.equal(buffer.toString(), '/*--------');

			done();
		});
	});

	test('readExactlyByStream - empty', function(done:()=>void) {
		var file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByStream(fs.createReadStream(file), 10, (error:Error, buffer:NodeBuffer, count:number)=>{
			assert.equal(error, null);
			assert.equal(count, 0);

			done();
		});
	});
});