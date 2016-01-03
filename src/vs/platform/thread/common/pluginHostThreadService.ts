/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import remote = require('vs/base/common/remote');
import descriptors = require('vs/platform/instantiation/common/descriptors');

import abstractThreadService = require('./abstractThreadService');
import threadService = require('./threadService');
import {readThreadSynchronizableObjects} from 'vs/platform/thread/common/threadService';
import {IThreadService, IThreadSynchronizableObject, ThreadAffinity, IThreadServiceStatusListener} from 'vs/platform/thread/common/thread';

export class PluginHostThreadService extends abstractThreadService.AbstractThreadService implements IThreadService {
	public serviceId = IThreadService;
	protected _remoteCom: remote.IRemoteCom;

	constructor(remoteCom: remote.IRemoteCom) {
		super(false);
		this._remoteCom = remoteCom;
		this._remoteCom.registerBigHandler(this);

		// Register all statically instantiated synchronizable objects
		readThreadSynchronizableObjects().forEach((obj) => this.registerInstance(obj));
	}

	MainThread(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): TPromise<any> {
		return target.apply(obj, params);
	}

	OneWorker(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[], affinity:ThreadAffinity): TPromise<any> {
		return TPromise.as(null);
	}

	AllWorkers(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): TPromise<any> {
		return TPromise.as(null);
	}

	Everywhere(obj:IThreadSynchronizableObject<any>, methodName:string, target:Function, params:any[]): TPromise<any> {
		return target.apply(obj, params);
	}

	ensureWorkers(): void {
		// Nothing to do
	}

	addStatusListener(listener:IThreadServiceStatusListener): void {
		// Nothing to do
	}

	removeStatusListener(listener:IThreadServiceStatusListener): void {
		// Nothing to do
	}

	protected _registerAndInstantiateMainProcessActor<T>(id: string, descriptor: descriptors.SyncDescriptor0<T>): T {
		return this._getOrCreateProxyInstance(this._remoteCom, id, descriptor);
	}

	protected _registerMainProcessActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}

	protected _registerAndInstantiatePluginHostActor<T>(id: string, descriptor: descriptors.SyncDescriptor0<T>): T {
		return this._getOrCreateLocalInstance(id, descriptor);
	}

	protected _registerPluginHostActor<T>(id: string, actor:T): void {
		this._registerLocalInstance(id, actor);
	}

	protected _registerAndInstantiateWorkerActor<T>(id: string, descriptor: descriptors.SyncDescriptor0<T>, whichWorker:ThreadAffinity): T {
		throw new Error('Not supported in this runtime context! Cannot communicate directly from Plugin Host to Worker!');
	}

	protected _registerWorkerActor<T>(id: string, actor:T): void {
		throw new Error('Not supported in this runtime context!');
	}
}