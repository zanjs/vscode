/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// Interfaces for WinJS

export interface ValueCallback {
	(value:any):any;
}

export interface EventCallback {
	(value:any):void;
}

export interface ErrorCallback {
	(error:any):any;
}

export interface ProgressCallback {
	(progress:any):any;
}

export declare class Promise {
	constructor(init:(complete:ValueCallback, error:ErrorCallback, progress:ProgressCallback)=>void, oncancel?: any);

	static as(value:any):Promise;
	static join(promises:{[name:string]:Promise;}):Promise;
	static join(promises:Promise[]):Promise;
	static any(promises:Promise[]):Promise;
	static timeout(delay:number):Promise;
	static wrapError(error:any):Promise;
	static is(value: any): boolean;
	static addEventListener(type:string, fn:EventCallback):void;

	public then(success?:ValueCallback, error?:ErrorCallback, progress?:ProgressCallback):Promise;
	public then<U>(success?:ValueCallback, error?:ErrorCallback, progress?:ProgressCallback):TPromise<U>;
	public done(success?:ValueCallback, error?:ErrorCallback, progress?:ProgressCallback):void;
	public cancel():void;
}

export interface IXHROptions {
	type?:string;
	url?:string;
	user?:string;
	password?:string;
	responseType?:string;
	headers?:any;
	customRequestInitializer?:(req:any)=>void;
	data?:any;
}

export declare function xhr(options:IXHROptions):TPromise<XMLHttpRequest>;
export declare function decoratePromise(promise:Promise, successCallback?:ValueCallback, errorCallback?:ErrorCallback):Promise;
export declare function decoratePromise<T>(promise:TPromise<T>, successCallback?:TValueCallback<T>, errorCallback?:ErrorCallback):TPromise<T>;

// --- Generic promise
export interface TValueCallback<T> {
	(value:T):void;
}

export interface TValueCallback<T> {
	(value:T):void;
}

export interface TProgressCallback<T> {
	(progress:T):void;
}

export declare class TPromise<V> {

	constructor(init:(complete: TValueCallback<V>, error:(err:any)=>void, progress:ProgressCallback)=>void, oncancel?: any);

	public then<U>(success?: (value:V)=>TPromise<U>, error?: (err:any)=>TPromise<U>, progress?:ProgressCallback): TPromise<U>;
	public then<U>(success?: (value:V)=>TPromise<U>, error?: (err:any)=>U, progress?:ProgressCallback): TPromise<U>;
	public then<U>(success?: (value:V)=>TPromise<U>, error?: (err:any)=>void, progress?:ProgressCallback): TPromise<U>;
	public then<U>(success?: (value:V)=>U, error?: (err:any)=>TPromise<U>, progress?:ProgressCallback): TPromise<U>;
	public then<U>(success?: (value:V)=>U, error?: (err:any)=>U, progress?:ProgressCallback): TPromise<U>;
	public then<U>(success?: (value:V)=>U, error?: (err:any)=>void, progress?:ProgressCallback): TPromise<U>;

	public done(success?: (value:V)=>void, error?: (err:any)=>any, progress?:ProgressCallback): void;
	public cancel():void;

	public static as<ValueType>(value:ValueType):TPromise<ValueType>;
	public static is(value: any): boolean;
	public static timeout(delay:number):TPromise<void>;
	public static join<ValueType>(promises:TPromise<ValueType>[]):TPromise<ValueType[]>;
	public static join<ValueType>(promises: {[n:string]:TPromise<ValueType>}):TPromise<{[n:string]:ValueType}>;
	public static any<ValueType>(promises:TPromise<ValueType>[]):TPromise<{ key:string; value:TPromise<ValueType>;}>;
	public static wrapError<ValueType>(error:any):TPromise<ValueType>;
}

// --- Generic promise with generic progress value
export declare class PPromise<C,P> extends TPromise<C> {

	constructor(init:(complete: TValueCallback<C>, error:(err:any)=>void, progress: TProgressCallback<P>)=>void, oncancel?: any);

	public then<U>(success?: (value:C)=>PPromise<U,P>, error?: (err:any)=>PPromise<U,P>, progress?:(value:P)=>void): PPromise<U,P>;
	public then<U>(success?: (value:C)=>PPromise<U,P>, error?: (err:any)=>U, progress?:(value:P)=>void): PPromise<U,P>;
	public then<U>(success?: (value:C)=>PPromise<U,P>, error?: (err:any)=>void, progress?:(value:P)=>void): PPromise<U,P>;
	public then<U>(success?: (value:C)=>U, error?: (err:any)=>PPromise<C,P>, progress?:(value:P)=>void): PPromise<U,P>;
	public then<U>(success?: (value:C)=>U, error?: (err:any)=>U, progress?:(value:P)=>void): PPromise<U,P>;
	public then<U>(success?: (value:C)=>U, error?: (err:any)=>void, progress?:(value:P)=>void): PPromise<U,P>;

	public done(success?: (value:C)=>void, error?: (err:any)=>any, progress?:(value:P)=>void): void;
	public cancel():void;

	public static as<V>(value:V):TPromise<V>;
	public static timeout(delay:number):PPromise<void, void>;
	public static join<C,P>(promises:PPromise<C,P>[]):PPromise<C,P[]>;
	public static join<C,P>(promises: {[n:string]:PPromise<C,P>}):PPromise<{[n:string]:C},P>;
	public static any<C,P>(promises:PPromise<C,P>[]):PPromise<{ key:string; value:PPromise<C,P>;},P>;
	public static wrapError<V>(error:any):TPromise<V>;
}