/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import errors = require('vs/base/common/errors');
import objects = require('vs/base/common/objects');
import marshalling = require('vs/base/common/marshalling');
import hash = require('vs/base/common/hash');
import instantiation = require('./instantiation');

export class AbstractDescriptor<T> {

	constructor(private _staticArguments:any[]) {
		// empty
	}

	public appendStaticArguments(more:any[]):void {
		this._staticArguments.push.apply(this._staticArguments, more);
	}

	public staticArguments():any[];
	public staticArguments(nth:number):any;
	public staticArguments(nth?:number):any[] {
		if(isNaN(nth)) {
			return this._staticArguments.slice(0);
		} else {
			return this._staticArguments[nth];
		}
	}

	_validate(type:T):void {
		if(!type) {
			throw errors.illegalArgument('can not be falsy');
		}
	}
}

export class SyncDescriptor<T> extends AbstractDescriptor<T> implements objects.IEqualable {

	constructor(private _ctor:any, ...staticArguments:any[]) {
		super(staticArguments);
	}

	public get ctor():any {
		return this._ctor;
	}

	public equals(other:any):boolean {
		if(other === this) {
			return true;
		}
		if(!(other instanceof SyncDescriptor)) {
			return false;
		}
		return (<SyncDescriptor<T>> other).ctor === this.ctor;
	}

	public hashCode():number {
		return 61 * (1 + this.ctor.length);
	}

	protected bind(...moreStaticArguments): SyncDescriptor<T> {
		var allArgs = [];
		allArgs = allArgs.concat(this.staticArguments());
		allArgs = allArgs.concat(moreStaticArguments);
		return new SyncDescriptor<T>(this._ctor, ...allArgs);
	}
}

export interface CreateSyncFunc {
	<T>(ctor:instantiation.IConstructorSignature0<T>): SyncDescriptor0<T>;
	<A1, T>(ctor:instantiation.IConstructorSignature1<A1, T>): SyncDescriptor1<A1, T>;
	<A1, T>(ctor:instantiation.IConstructorSignature1<A1, T>, a1: A1): SyncDescriptor0<T>;


	<T>(ctor:instantiation.INewConstructorSignature0<T>): SyncDescriptor0<T>;

	<A1, T>(ctor:instantiation.INewConstructorSignature1<A1, T>): SyncDescriptor1<A1, T>;
	<A1, T>(ctor:instantiation.INewConstructorSignature1<A1, T>, a1: A1): SyncDescriptor0<T>;

	<A1, A2, T>(ctor:instantiation.INewConstructorSignature2<A1, A2, T>): SyncDescriptor2<A1, A2, T>;
	<A1, A2, T>(ctor:instantiation.INewConstructorSignature2<A1, A2, T>, a1: A1): SyncDescriptor1<A2, T>;
	<A1, A2, T>(ctor:instantiation.INewConstructorSignature2<A1, A2, T>, a1: A1, a2: A2): SyncDescriptor0<T>;

	<A1, A2, A3, T>(ctor:instantiation.INewConstructorSignature3<A1, A2, A3, T>): SyncDescriptor3<A1, A2, A3, T>;
	<A1, A2, A3, T>(ctor:instantiation.INewConstructorSignature3<A1, A2, A3, T>, a1: A1): SyncDescriptor2<A2, A3, T>;
	<A1, A2, A3, T>(ctor:instantiation.INewConstructorSignature3<A1, A2, A3, T>, a1: A1, a2: A2): SyncDescriptor1<A3, T>;
	<A1, A2, A3, T>(ctor:instantiation.INewConstructorSignature3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor0<T>;

	<A1, A2, A3, A4, T>(ctor:instantiation.INewConstructorSignature4<A1, A2, A3, A4, T>): SyncDescriptor4<A1, A2, A3, A4, T>;
	<A1, A2, A3, A4, T>(ctor:instantiation.INewConstructorSignature4<A1, A2, A3, A4, T>, a1: A1): SyncDescriptor3<A2, A3, A4, T>;
	<A1, A2, A3, A4, T>(ctor:instantiation.INewConstructorSignature4<A1, A2, A3, A4, T>, a1: A1, a2: A2): SyncDescriptor2<A3, A4, T>;
	<A1, A2, A3, A4, T>(ctor:instantiation.INewConstructorSignature4<A1, A2, A3, A4, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor1<A4, T>;
	<A1, A2, A3, A4, T>(ctor:instantiation.INewConstructorSignature4<A1, A2, A3, A4, T>, a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor0<T>;

	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>): SyncDescriptor5<A1, A2, A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>, a1: A1): SyncDescriptor4<A2, A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2): SyncDescriptor3<A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor2<A4, A5, T>;
	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor1<A5, T>;
	<A1, A2, A3, A4, A5, T>(ctor:instantiation.INewConstructorSignature5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor0<T>;

	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>): SyncDescriptor6<A1, A2, A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1): SyncDescriptor5<A2, A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2): SyncDescriptor4<A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor3<A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor2<A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor1<A6, T>;
	<A1, A2, A3, A4, A5, A6, T>(ctor:instantiation.INewConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor0<T>;

	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>): SyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1): SyncDescriptor6<A2, A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2): SyncDescriptor5<A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor4<A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor3<A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor2<A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor1<A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(ctor:instantiation.INewConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescriptor0<T>;

	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>): SyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1): SyncDescriptor7<A2, A3, A4, A5, A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2): SyncDescriptor6<A3, A4, A5, A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3): SyncDescriptor5<A4, A5, A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor4<A5, A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor3<A6, A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor2<A7, A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescriptor1<A8, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor:instantiation.INewConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): SyncDescriptor0<T>;
}
export var createSyncDescriptor:CreateSyncFunc = <T>(ctor:any, ...staticArguments:any[]): any => {
	return new SyncDescriptor<T>(ctor, ...staticArguments);
}

export interface SyncDescriptor0<T> {
	ctor:any;
	bind(): SyncDescriptor0<T>;
}
export interface SyncDescriptor1<A1, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor0<T>;
}
export interface SyncDescriptor2<A1, A2, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor1<A2, T>;
	bind(a1: A1, a2: A2): SyncDescriptor0<T>;
}
export interface SyncDescriptor3<A1, A2, A3, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor2<A2, A3, T>;
	bind(a1: A1, a2: A2): SyncDescriptor1<A3, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor0<T>;
}
export interface SyncDescriptor4<A1, A2, A3, A4, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor3<A2, A3, A4, T>;
	bind(a1: A1, a2: A2): SyncDescriptor2<A3, A4, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor1<A4, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor0<T>;
}
export interface SyncDescriptor5<A1, A2, A3, A4, A5, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor4<A2, A3, A4, A5, T>;
	bind(a1: A1, a2: A2): SyncDescriptor3<A3, A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor2<A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor1<A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor0<T>;
}
export interface SyncDescriptor6<A1, A2, A3, A4, A5, A6, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor5<A2, A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2): SyncDescriptor4<A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor3<A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor2<A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor1<A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor0<T>;
}
export interface SyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor6<A2, A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2): SyncDescriptor5<A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor4<A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor3<A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor2<A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor1<A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescriptor0<T>;
}
export interface SyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T> {
	ctor:any;
	bind(a1: A1): SyncDescriptor7<A2, A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2): SyncDescriptor6<A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescriptor5<A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescriptor4<A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescriptor3<A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescriptor2<A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescriptor1<A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): SyncDescriptor0<T>;
}

export interface IAsyncDescriptor {
	moduleName:string;
	ctorName:string;
}

export interface ISerializedAsyncDescriptor {
	$isAsyncDescriptor:boolean;
	$moduleName:string;
	$ctorName:string;
	$staticArguments: any[];
}

marshalling.registerMarshallingContribution({

	canSerialize: (obj:any): boolean => {
		return obj instanceof AsyncDescriptor;
	},

	serialize: (asyncDescriptor:AsyncDescriptor<any>, serialize:(obj:any)=>any): ISerializedAsyncDescriptor => {
		return {
			$isAsyncDescriptor: true,
			$moduleName: asyncDescriptor.moduleName,
			$ctorName: asyncDescriptor.ctorName,
			$staticArguments: serialize(asyncDescriptor.staticArguments())
		};
	},

	canDeserialize: (obj:ISerializedAsyncDescriptor): boolean => {
		return obj.$isAsyncDescriptor;
	},

	deserialize: (obj:ISerializedAsyncDescriptor, deserialize:(obj:any)=>any): any => {
		var r = new AsyncDescriptor<any>(obj.$moduleName, obj.$ctorName);
		r.appendStaticArguments(deserialize(obj.$staticArguments));
		return r;
	}
});

export class AsyncDescriptor<T> extends AbstractDescriptor<T> implements IAsyncDescriptor, objects.IEqualable {

	public static create<T>(moduleName:string, ctorName:string):AsyncDescriptor<T> {
		return new AsyncDescriptor<T>(moduleName, ctorName);
	}

	constructor(private _moduleName:string, private _ctorName?:string, ...staticArguments:any[]) {
		super(staticArguments);
	}

	public get moduleName():string {
		return this._moduleName;
	}

	public get ctorName():string {
		return this._ctorName;
	}

	public equals(other:any):boolean {
		if(other === this) {
			return true;
		}
		if(!(other instanceof AsyncDescriptor)) {
			return false;
		}
		return (<AsyncDescriptor<any>> other).moduleName === this.moduleName &&
			(<AsyncDescriptor<any>> other).ctorName === this.ctorName;
	}

	public hashCode():number {
		return hash.computeMurmur2StringHashCode(this.moduleName) * hash.computeMurmur2StringHashCode(this.ctorName);
	}

	protected bind(...moreStaticArguments): AsyncDescriptor<T> {
		var allArgs = [];
		allArgs = allArgs.concat(this.staticArguments());
		allArgs = allArgs.concat(moreStaticArguments);
		return new AsyncDescriptor<T>(this.moduleName, this.ctorName, ...allArgs);
	}
}

export interface CreateAsyncFunc0 {
	<T>(moduleName:string, ctorName:string): AsyncDescriptor0<T>;
	<A1, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor0<T>;
	<A1, A2, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor0<T>;
	<A1, A2, A3, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor0<T>;
	<A1, A2, A3, A4, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor0<T>;
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor0<T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor0<T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): AsyncDescriptor0<T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): AsyncDescriptor0<T>;
}

export interface CreateAsyncFunc1 {
	<A1, T>(moduleName:string, ctorName:string): AsyncDescriptor1<A1, T>;
	<A1, A2, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor1<A2, T>;
	<A1, A2, A3, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor1<A3, T>;
	<A1, A2, A3, A4, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor1<A4, T>;
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor1<A5, T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor1<A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor1<A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): AsyncDescriptor1<A8, T>;
}

export interface CreateAsyncFunc2 {
	<A1, A2, T>(moduleName:string, ctorName:string): AsyncDescriptor2<A1, A2, T>;
	<A1, A2, A3, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor2<A2, A3, T>;
	<A1, A2, A3, A4, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor2<A3, A4, T>;
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor2<A4, A5, T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor2<A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor2<A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor2<A7, A8, T>;
}

export interface CreateAsyncFunc3 {
	<A1, A2, A3, T>(moduleName:string, ctorName:string): AsyncDescriptor3<A1, A2, A3, T>;
	<A1, A2, A3, A4, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor3<A2, A3, A4, T>;
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor3<A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor3<A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor3<A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor3<A6, A7, A8, T>;
}

export interface CreateAsyncFunc4 {
	<A1, A2, A3, A4, T>(moduleName:string, ctorName:string): AsyncDescriptor4<A1, A2, A3, A4, T>;
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor4<A2, A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor4<A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor4<A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor4<A5, A6, A7, A8, T>;
}

export interface CreateAsyncFunc5 {
	<A1, A2, A3, A4, A5, T>(moduleName:string, ctorName:string): AsyncDescriptor5<A1, A2, A3, A4, A5, T>;
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor5<A2, A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor5<A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2, a3: A3): AsyncDescriptor5<A4, A5, A6, A7, A8, T>;
}

export interface CreateAsyncFunc6 {
	<A1, A2, A3, A4, A5, A6, T>(moduleName:string, ctorName:string): AsyncDescriptor6<A1, A2, A3, A4, A5, A6, T>;
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor6<A2, A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1, a2: A2): AsyncDescriptor6<A3, A4, A5, A6, A7, A8, T>;
}

export interface CreateAsyncFunc7 {
	<A1, A2, A3, A4, A5, A6, A7, T>(moduleName:string, ctorName:string): AsyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T>;
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string, a1: A1): AsyncDescriptor7<A2, A3, A4, A5, A6, A7, A8, T>;
}

export interface CreateAsyncFunc8 {
	<A1, A2, A3, A4, A5, A6, A7, A8, T>(moduleName:string, ctorName:string): AsyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T>;
}

var _createAsyncDescriptor = <T>(moduleName:string, ctorName:string, ...staticArguments:any[]): any => {
	return new AsyncDescriptor<T>(moduleName, ctorName, ...staticArguments);
}
export var createAsyncDescriptor0:CreateAsyncFunc0 = _createAsyncDescriptor;
export var createAsyncDescriptor1:CreateAsyncFunc1 = _createAsyncDescriptor;
export var createAsyncDescriptor2:CreateAsyncFunc2 = _createAsyncDescriptor;
export var createAsyncDescriptor3:CreateAsyncFunc3 = _createAsyncDescriptor;
export var createAsyncDescriptor4:CreateAsyncFunc4 = _createAsyncDescriptor;
export var createAsyncDescriptor5:CreateAsyncFunc5 = _createAsyncDescriptor;
export var createAsyncDescriptor6:CreateAsyncFunc6 = _createAsyncDescriptor;
export var createAsyncDescriptor7:CreateAsyncFunc7 = _createAsyncDescriptor;

export interface AsyncDescriptor0<T> {
	moduleName:string;
	bind(): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor1<A1, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor2<A1, A2, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor1<A2, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor3<A1, A2, A3, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor2<A2, A3, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor1<A3, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor4<A1, A2, A3, A4, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor3<A2, A3, A4, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor2<A3, A4, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor1<A4, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor5<A1, A2, A3, A4, A5, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor4<A2, A3, A4, A5, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor3<A3, A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor2<A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor1<A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor6<A1, A2, A3, A4, A5, A6, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor5<A2, A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor4<A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor3<A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor2<A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor1<A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor6<A2, A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor5<A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor4<A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor3<A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor2<A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor1<A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): AsyncDescriptor0<T>;
}
export interface AsyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T> {
	moduleName:string;
	bind(a1: A1): AsyncDescriptor7<A2, A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2): AsyncDescriptor6<A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3): AsyncDescriptor5<A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): AsyncDescriptor4<A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): AsyncDescriptor3<A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): AsyncDescriptor2<A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): AsyncDescriptor1<A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): AsyncDescriptor0<T>;
}