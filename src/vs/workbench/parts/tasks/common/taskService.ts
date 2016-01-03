/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { TerminateResponse } from 'vs/base/common/processes';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ITaskSummary, TaskDescription, TaskEvent, TaskType } from 'vs/workbench/parts/tasks/common/taskSystem';

export { ITaskSummary, TaskDescription, TaskEvent, TaskType };

export var ITaskService = createDecorator<ITaskService>('taskService');

export namespace TaskServiceEvents {
	export let Active: string = 'active';
	export let Inactive: string = 'inactive';
	export let ConfigChanged: string = 'configChanged';
	export let Terminated: string = 'terminated';
}

export interface ITaskService extends IEventEmitter {
	serviceId: ServiceIdentifier<any>
	build(): TPromise<ITaskSummary>;
	rebuild(): TPromise<ITaskSummary>;
	clean(): TPromise<ITaskSummary>;
	runTest(): TPromise<ITaskSummary>;
	run(taskIdentifier: string): TPromise<ITaskSummary>;
	isActive(): TPromise<boolean>;
	terminate(): TPromise<TerminateResponse>;
	tasks(): TPromise<TaskDescription[]>;
}