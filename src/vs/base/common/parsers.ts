/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import { IStringDictionary } from 'vs/base/common/collections';

export enum ValidationState {
	OK = 0,
	Info = 1,
	Warning = 2,
	Error = 3,
	Fatal = 4
}

export class ValidationStatus {
	private _state:ValidationState;

	constructor() {
		this._state = ValidationState.OK;
	}

	public get state():ValidationState {
		return this._state;
	}

	public set state(value:ValidationState) {
		if (value > this._state) {
			this._state = value;
		}
	}

	public isOK(): boolean {
		return this._state === ValidationState.OK;
	}

	public isFatal(): boolean {
		return this._state === ValidationState.Fatal;
	}
}

export interface ILogger {
	log(value:string):void;
}

export abstract class Parser {

	private _logger: ILogger;
	private validationStatus: ValidationStatus;

	constructor(logger: ILogger, validationStatus: ValidationStatus = new ValidationStatus()) {
		this._logger = logger;
		this.validationStatus = validationStatus;
	}

	public get logger(): ILogger {
		return this._logger;
	}

	public get status(): ValidationStatus {
		return this.validationStatus;
	}

	protected log(message: string): void {
		this._logger.log(message);
	}

	protected is(value: any, func: (value:any) => boolean, wrongTypeState?: ValidationState, wrongTypeMessage?: string, undefinedState?: ValidationState, undefinedMessage?: string): boolean {
		if (Types.isUndefined(value)) {
			if (undefinedState) this.validationStatus.state = undefinedState;
			if (undefinedMessage) this.log(undefinedMessage);
			return false;
		}
		if (!func(value)) {
			if (wrongTypeState) this.validationStatus.state = wrongTypeState;
			if (wrongTypeMessage) this.log(wrongTypeMessage);
			return false;
		}
		return true;
	}

	protected static merge<T>(destination: T, source: T, overwrite: boolean): void {
		Object.keys(source).forEach((key) => {
			let destValue = destination[key];
			let sourceValue = source[key];
			if (Types.isUndefined(sourceValue)) {
				return;
			}
			if (Types.isUndefined(destValue)) {
				destination[key] = sourceValue;
			} else {
				if (overwrite) {
					let source
					if (Types.isObject(destValue) && Types.isObject(sourceValue)) {
						this.merge(destValue, sourceValue, overwrite);
					} else {
						destination[key] = sourceValue;
					}
				}
			}
		});
	}
}

export interface ISystemVariables {
	resolve(value: string): string;
	resolve(value: string[]): string[];
	resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	[key: string]: any;
}

export abstract class AbstractSystemVariables implements ISystemVariables {

	public resolve(value: string): string;
	public resolve(value: string[]): string[];
	public resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	public resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	public resolve(value: any): any {
		if (Types.isString(value)) {
			return this.__resolveString(value);
		} else if (Types.isArray(value)) {
			return this.__resolveArray(value);
		} else if (Types.isObject(value)) {
			return this.__resolveLiteral(value);
		}

		return value;
	}

	private __resolveString(value: string): string {
		let regexp = /\$\{(.*?)\}/g;
		return value.replace(regexp, (match: string, name: string) => {
			let newValue = (<any>this)[name];
			if (Types.isString(newValue)) {
				return newValue;
			} else {
				return match && match.indexOf('env.') > 0 ? '' : match;
			}
		});
	}

	private __resolveLiteral(values: IStringDictionary<string | IStringDictionary<string> | string[]>): IStringDictionary<string | IStringDictionary<string> | string[]> {
		let result: IStringDictionary<string | IStringDictionary<string> | string[]> = Object.create(null);
		Object.keys(values).forEach(key => {
			let value = values[key];
			result[key] = <any>this.resolve(<any>value);
		});
		return result;
	}

	private __resolveArray(value: string[]): string[] {
		return value.map(s => this.__resolveString(s));
	}
}