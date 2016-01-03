/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import Model = require('vs/editor/common/model/model');
import ModelModes = require('vs/editor/test/common/testModes');
import {EditOperation} from 'vs/editor/common/core/editOperation';

// --------- utils

function checkAndClear(highlighter, arr) {
	assert.deepEqual(highlighter.calledFor, arr);
	highlighter.calledFor = [];
}

function invalidEqual(model, indexArray) {
	var i, len, asHash = {};
	for (i = 0, len = indexArray.length; i < len; i++) {
		asHash[indexArray[i]] = true;
	}
	for (i = 0, len = model.getLineCount(); i < len; i++) {
		assert.equal(model._lines[i].isInvalid, asHash.hasOwnProperty(i));
	}
}

function stateEqual(state, content) {
	assert.equal(state.prevLineContent, content);
}

function statesEqual(model:Model.Model, states:string[]) {
	var i, len = states.length - 1;
	for (i = 0; i < len; i++) {
		stateEqual(model._lines[i].getState(), states[i]);
	}
	stateEqual((<any>model)._lastState, states[len]);
}


var LINE1 = '1';
var LINE2 = '2';
var LINE3 = '3';
var LINE4 = '4';
var LINE5 = '5';


suite('Editor Model - Model Modes 1', () => {

	var thisHighlighter: ModelModes.ModelMode1;
	var thisModel: Model.Model;

	setup(() => {
		thisHighlighter = new ModelModes.ModelMode1();
		var text =
			LINE1 + '\r\n' +
			LINE2 + '\n' +
			LINE3 + '\n' +
			LINE4 + '\r\n' +
			LINE5;
		thisModel = new Model.Model(text, thisHighlighter);
	});

	teardown(() => {
		thisModel.dispose();
	});
	test('model calls syntax highlighter 1', () => {
		thisModel.getLineTokens(1);
		checkAndClear(thisHighlighter, ['1']);
	});

	test('model calls syntax highlighter 2', () => {
		thisModel.getLineTokens(2);
		checkAndClear(thisHighlighter, ['1', '2']);

		thisModel.getLineTokens(2);
		checkAndClear(thisHighlighter, []);
	});

	test('model caches states', () => {
		thisModel.getLineTokens(1);
		checkAndClear(thisHighlighter, ['1']);

		thisModel.getLineTokens(2);
		checkAndClear(thisHighlighter, ['2']);

		thisModel.getLineTokens(3);
		checkAndClear(thisHighlighter, ['3']);

		thisModel.getLineTokens(4);
		checkAndClear(thisHighlighter, ['4']);

		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['5']);

		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, []);
	});

	test('model invalidates states for one line insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['-']);

		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, []);
	});

	test('model invalidates states for many lines insert', () => {
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 1), '0\n-\n+')]);
		assert.equal(thisModel.getLineCount(), 7);
		thisModel.getLineTokens(7);
		checkAndClear(thisHighlighter, ['0', '-', '+']);

		thisModel.getLineTokens(7);
		checkAndClear(thisHighlighter, []);
	});

	test('model invalidates states for one new line', () => {
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '\n')]);
		thisModel.applyEdits([EditOperation.insert(new Position(2, 1), 'a')]);
		thisModel.getLineTokens(6);
		checkAndClear(thisHighlighter, ['1', 'a']);
	});

	test('model invalidates states for one line delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.insert(new Position(1, 2), '-')]);
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['-']);

		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, []);
	});

	test('model invalidates states for many lines delete', () => {
		thisModel.getLineTokens(5);
		checkAndClear(thisHighlighter, ['1', '2', '3', '4', '5']);

		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
		thisModel.getLineTokens(3);
		checkAndClear(thisHighlighter, ['3']);

		thisModel.getLineTokens(3);
		checkAndClear(thisHighlighter, []);
	});
});



suite('Editor Model - Model Modes 2', () => {

	var thisHighlighter: ModelModes.ModelMode1;
	var thisModel: Model.Model;

	setup(() => {
		thisHighlighter = new ModelModes.ModelMode2();
		var text =
			'Line1' + '\r\n' +
			'Line2' + '\n' +
			'Line3' + '\n' +
			'Line4' + '\r\n' +
			'Line5';
		thisModel = new Model.Model(text, thisHighlighter);
	});

	teardown(() => {
		thisModel.dispose();
	});
	test('getTokensForInvalidLines one text insert', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '-')]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines two text insert', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([
			EditOperation.insert(new Position(1, 6), '-'),
			EditOperation.insert(new Position(3, 6), '-')
		]);

		invalidEqual(thisModel, [0, 2]);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1-', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one multi-line text insert, one small text insert', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.insert(new Position(1, 6), '\nNew line\nAnother new line')]);
		thisModel.applyEdits([EditOperation.insert(new Position(5, 6), '-')]);
		invalidEqual(thisModel, [0, 4]);
		thisModel.getLineTokens(7);
		statesEqual(thisModel, ['', 'Line1', 'New line', 'Another new line', 'Line2', 'Line3-', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 5))]);
		invalidEqual(thisModel, [0]);
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', '1', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines one line delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(4);
		statesEqual(thisModel, ['', 'Line2', 'Line3', 'Line4', 'Line5']);
	});

	test('getTokensForInvalidLines multiple lines delete text', () => {
		thisModel.getLineTokens(5);
		statesEqual(thisModel, ['', 'Line1', 'Line2', 'Line3', 'Line4', 'Line5']);
		thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 3))]);
		invalidEqual(thisModel, [0]);
		statesEqual(thisModel, ['', 'Line3', 'Line4', 'Line5']);
		thisModel.getLineTokens(3);
		statesEqual(thisModel, ['', 'ne3', 'Line4', 'Line5']);
	});
});


suite('Editor Model - Token Iterator', () => {

	var thisModel: Model.Model;

	setup(() => {
		var nmode = new ModelModes.NMode(3);
		var text =
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n' +
			'foobarfoobar' + '\r\n';
		thisModel = new Model.Model(text, nmode);
	});

	teardown(() => {
		thisModel.dispose();
	});

	test('all tokens with ranges', () => {
		var calls = 0;
		var ranges = [
			[1, 4, 4, 7, 7, 10, 10, 13],
			[1, 4, 4, 7, 7, 10, 10, 13],
			[1, 4, 4, 7, 7, 10, 10, 13],
		];
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			var a = [], line = 0;
			while(iter.hasNext()) {
				calls++;
				if(a.length === 0) {
					a = ranges.shift();
					line += 1;
				}
				var next = iter.next();
				assert.equal(next.lineNumber, line);
				assert.equal(next.startColumn, a.shift());
				assert.equal(next.endColumn, a.shift());
			}
		});
		assert.equal(calls, 12, 'calls');
	});

	test('all tokens from beginning with next', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while(iter.hasNext()) {
				iter.next();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from beginning with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while(iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 1);
	});

	test('all tokens from end with prev', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasPrev()) {
				iter.prev();
				n++;
			}
		});
		assert.equal(n, 12);
	});

	test('all tokens from end with next', () => {
		var n = 0;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasNext()) {
				iter.next();
				n++;
			}
		});
		assert.equal(n, 1);
	});

	test('prev and next are assert.equal at start', () => {
		var calls = 0;
		thisModel.tokenIterator(new Position(1, 2), (iter) => {
			calls++;
			var next = iter.next();
			var prev = iter.prev();
			assert.deepEqual(next, prev);
		});
		assert.equal(calls, 1, 'calls');
	});

	test('position variance within token', () => {
		var calls = 0;

		thisModel.tokenIterator(new Position(1, 4), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		thisModel.tokenIterator(new Position(1, 5), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		thisModel.tokenIterator(new Position(1, 6), (iter) => {
			calls++;
			var next = iter.next();
			assert.equal(next.lineNumber, 1);
			assert.equal(next.startColumn, 4);
			assert.equal(next.endColumn, 7);
		});

		assert.equal(calls, 3, 'calls');
	});

	test('iterator allows next/prev', () => {
		var n = 0;
		var up = [], down = [];
		thisModel.tokenIterator(new Position(1, 1), (iter) => {
			while(iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
			while(iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while(up.length) {
			assert.deepEqual(up.pop(), down.shift());
		}
	});

	test('iterator allows prev/next', () => {
		var n = 0;
		var up = [], down = [];
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			while(iter.hasPrev()) {
				var prev = iter.prev();
				down.push(prev);
				n++;
			}
			while(iter.hasNext()) {
				var next = iter.next();
				up.push(next);
				n++;
			}
		});
		assert.equal(n, 24);
		assert.equal(up.length, 12);
		assert.equal(down.length, 12);
		while(up.length) {
			assert.deepEqual(up.pop(), down.shift());
		}
	});


	test('iterator can not be used outside of callback', () => {
		var illegalIterReference;
		thisModel.tokenIterator(new Position(3, 12), (iter) => {
			illegalIterReference = iter;
		});


		try {
			illegalIterReference.hasNext();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.next();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.hasPrev();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
		try {
			illegalIterReference.prev();
			assert.ok(false);
		} catch(e) {
			assert.ok(true);
		}
	});
});


