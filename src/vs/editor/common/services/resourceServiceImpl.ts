/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter, IEmitterEvent, ListenerUnbind, ListenerCallback} from 'vs/base/common/eventEmitter';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IResourceService, ResourceEvents, IResourceChangedEvent, IResourceAddedEvent, IResourceRemovedEvent} from 'vs/editor/common/services/resourceService';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';

export class ResourceService extends EventEmitter implements IResourceService {
	public serviceId = IResourceService;
	private data:{[url:string]:EditorCommon.IMirrorModel;};
	private unbinds:{[url:string]:ListenerUnbind[];};

	constructor() {
		super();
		this.data = {};
		this.unbinds = {};
	}

	public addListener_(eventType: string, listener: ListenerCallback): ListenerUnbind {
		return super.addListener(eventType, listener);
	}

	public addListener2_(eventType: string, listener: ListenerCallback): IDisposable {
		return super.addListener2(eventType, listener);
	}

	private _anonymousModelId(input:string): string {
		var r = '';
		for (var i = 0; i < input.length; i++) {
			var ch = input[i];
			if (ch >= '0' && ch <= '9') {
				r += '0';
				continue;
			}
			if (ch >= 'a' && ch <= 'z') {
				r += 'a';
				continue;
			}
			if (ch >= 'A' && ch <= 'Z') {
				r += 'A';
				continue;
			}
			r += ch;
		}
		return r;
	}

	public insert(url:URI, element:EditorCommon.IMirrorModel): void {
		// console.log('INSERT: ' + url.toString());
		if (this.contains(url)) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ResourceService: Cannot add model ' + this._anonymousModelId(url.toString()) + ' because it already exists!');
		}

		// add resource
		var key = url.toString();
		this.data[key] = element;
		this.unbinds[key] = [];
		this.unbinds[key].push(element.addBulkListener((value:IEmitterEvent[]) => {
			this.emit(ResourceEvents.CHANGED, <IResourceChangedEvent>{ url: url, originalEvents: value });
		}));

		// event
		this.emit(ResourceEvents.ADDED, <IResourceAddedEvent>{ url: url, addedElement: element });
	}

	public get(url:URI):EditorCommon.IMirrorModel {
		if(!this.data[url.toString()]) {
			return null;
		}
		return this.data[url.toString()];
	}

	public all():EditorCommon.IMirrorModel[] {
		return Object.keys(this.data).map((key) => {
			return this.data[key];
		});
	}

	public contains(url:URI):boolean {
		return !!this.data[url.toString()];
	}

	public remove(url:URI):void {
		// console.log('REMOVE: ' + url.toString());
		if(!this.contains(url)) {
			return;
		}

		var key = url.toString(),
			element = this.data[key],
			i = 1;

		// stop listen
		while(this.unbinds[key].length > 0) { this.unbinds[key].pop()(); }

		// removal
		delete this.unbinds[key];
		delete this.data[key];

		// event
		this.emit(ResourceEvents.REMOVED, <IResourceRemovedEvent>{ url: url, removedElement: element });
	}
}
