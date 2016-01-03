/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import WinJS = require('vs/base/common/winjs.base');
import {DeferredAction} from 'vs/platform/actions/common/actions';
import Actions = require('vs/base/common/actions');
import EventEmitter = require('vs/base/common/eventEmitter');
import InstantiationService = require('vs/platform/instantiation/common/instantiationService');
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IEventService} from 'vs/platform/event/common/event';

export class TestAction extends Actions.Action {
	private service;
	private first:string;
	private second:string;

	constructor(first:string, second:string, @IEventService eventService: IEventService) {
		super(first);
		this.service = eventService;
		this.first = first;
		this.second = second;
	}


	public run():WinJS.Promise {
		return WinJS.Promise.as((!!this.service && !!this.first && !!this.second) ? true : false);
	}
}

class TestEventService extends EventEmitter.EventEmitter {
}

suite('Platform actions', () => {
	test('DeferredAction', (done) => {

		var services:any = {
			eventService: {}
		};

		var instantiationService = InstantiationService.create(services);

		var action = new DeferredAction(
			instantiationService,
			new AsyncDescriptor<Actions.Action>('vs/platform/actions/test/common/actions.test', 'TestAction', 'my.id', 'Second'),
			'my.test.action',
			'Hello World',
			'css'
		);

		assert.strictEqual(action.id, 'my.test.action');
		action.run().then((result) => {
			assert.strictEqual(result, true);
			assert.strictEqual(action.id, 'my.id');
			done();
		});
	});
});
