/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import Platform = require('vs/base/common/platform');
import {IKeybindingService, IKeybindingScopeLocation, ICommandHandler, IKeybindingItem, IKeybindings, IKeybindingContextRule, IUserFriendlyKeybinding, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode, BinaryKeybindings, Keybinding} from 'vs/base/common/keyCodes';

export interface IResolveResult {
	enterChord: number;
	commandId: string;
}

export interface IBoundCommands {
	[commandId: string]: boolean;
}

interface ICommandMap {
	[partialKeybinding: number]: ICommandEntry[];
}

interface IChordsMap {
	[partialKeybinding: number]: ICommandMap;
}

interface ICommandEntry {
	context: IKeybindingContextRule[];
	keybinding: number;
	commandId: string;
}

export class CommonKeybindingResolver {
	private _defaultKeybindings: IKeybindingItem[];
	private _defaultBoundCommands: IBoundCommands;
	private _map: ICommandMap;
	private _chords: IChordsMap;
	private _lookupMap: {
		[commandId: string]: IKeybindingItem[];
	};
	private _lookupMapUnreachable: {
		// The value contains the keybinding or first part of a chord
		[commandId: string]: number[];
	};
	private _shouldWarnOnConflict: boolean;

	constructor(defaultKeybindings: IKeybindingItem[], overrides: IKeybindingItem[], shouldWarnOnConflict:boolean = true) {
		defaultKeybindings = defaultKeybindings.slice(0).sort(sorter);

		this._defaultKeybindings = defaultKeybindings;
		this._shouldWarnOnConflict = shouldWarnOnConflict;

		this._defaultBoundCommands = Object.create(null);
		for (let i = 0, len = defaultKeybindings.length; i < len; i++) {
			this._defaultBoundCommands[defaultKeybindings[i].command] = true;
		}

		this._map = Object.create(null);
		this._lookupMap = Object.create(null);
		this._lookupMapUnreachable = Object.create(null);
		this._chords = Object.create(null);

		let defaultKeybindingsCount = defaultKeybindings.length;
		let allKeybindings = defaultKeybindings.concat(overrides);
		for (let i = 0, len = allKeybindings.length; i < len; i++) {
			let k = allKeybindings[i];
			if (k.keybinding === 0) {
				continue;
			}
			if (k.context) {
				k.context = k.context.map(CommonKeybindingResolver.normalizeRule);
			}

			let entry:ICommandEntry = {
				context: k.context,
				keybinding: k.keybinding,
				commandId: k.command
			};

			if (BinaryKeybindings.hasChord(k.keybinding)) {
				// This is a chord
				let keybindingFirstPart = BinaryKeybindings.extractFirstPart(k.keybinding);
				let keybindingChordPart = BinaryKeybindings.extractChordPart(k.keybinding);

				this._chords[keybindingFirstPart] = this._chords[keybindingFirstPart] || Object.create(null);
				this._chords[keybindingFirstPart][keybindingChordPart] = this._chords[keybindingFirstPart][keybindingChordPart] || [];
				this._chords[keybindingFirstPart][keybindingChordPart].push(entry);

				this._addKeyPress(keybindingFirstPart, entry, k, i < defaultKeybindingsCount);

			} else {
				this._addKeyPress(k.keybinding, entry, k, i < defaultKeybindingsCount);

			}
		}
	}

	private _addKeyPress(keypress: number, entry: ICommandEntry, item:IKeybindingItem, isDefault:boolean): void {

		if (!this._map[keypress]) {
			// There is no conflict so far
			this._map[keypress] = [entry];
			this._addToLookupMap(item);
			return;
		}

		var conflicts = this._map[keypress];

		for (var i = conflicts.length - 1; i >= 0; i--) {
			var conflict = conflicts[i];

			if (conflict.commandId === item.command) {
				continue;
			}

			if (BinaryKeybindings.hasChord(conflict.keybinding) && BinaryKeybindings.hasChord(entry.keybinding) && conflict.keybinding !== entry.keybinding) {
				// The conflict only shares the chord start with this command
				continue;
			}

			if (CommonKeybindingResolver.contextIsEntirelyIncluded(true, conflict.context, item.context)) {
				// `item` completely overwrites `conflict`
				if (this._shouldWarnOnConflict && isDefault) {
					console.warn('Conflict detected, command `' + conflict.commandId + '` cannot be triggered by ' + Keybinding.toUserSettingsLabel(keypress));
				}
				this._lookupMapUnreachable[conflict.commandId] = this._lookupMapUnreachable[conflict.commandId] || [];
				this._lookupMapUnreachable[conflict.commandId].push(conflict.keybinding);
			}
		}

		conflicts.push(entry);
		this._addToLookupMap(item);
	}

	/**
	 * Returns true if `a` is completely covered by `b`.
	 * Returns true if `b` is a more relaxed `a`.
	 * Return true if (`a` === true implies `b` === true).
	 */
	public static contextIsEntirelyIncluded(inNormalizedForm: boolean, a: IKeybindingContextRule[], b: IKeybindingContextRule[]): boolean {
		if (!b || b.length === 0) {
			return true;
		}
		if (!a || a.length === 0) {
			return false;
		}

		if (!inNormalizedForm) {
			a = a.map(CommonKeybindingResolver.normalizeRule);
			b = b.map(CommonKeybindingResolver.normalizeRule);
		}

		var aRules: { [rule:string]: boolean; } = Object.create(null);
		for (var i = 0, len = a.length; i < len; i++) {
			aRules[CommonKeybindingResolver._ruleToString(a[i])] = true;
		}

		for (var i = 0, len = b.length; i < len; i++) {
			if (!aRules[CommonKeybindingResolver._ruleToString(b[i])]) {
				return false;
			}
		}

		return true;
	}

	private static _ruleToString(rule: IKeybindingContextRule): string {
		var r = rule.key;
		if (typeof rule.operator === 'undefined') {
			r += ';' + KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL;
		} else {
			r += ';' + rule.operator;
		}
		if (typeof rule.operand === 'undefined') {
			r += ';' + true;
		} else {
			r += ';' + rule.operand;
		}
		return r;
	}

	public static normalizeRule(rule: IKeybindingContextRule): IKeybindingContextRule {
		if (rule.operator === KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL) {
			if (typeof rule.operand === 'boolean') {
				return {
					key: rule.key,
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL,
					operand: !rule.operand
				};
			}
		}
		return rule;
	}

	private _addToLookupMap(item: IKeybindingItem): void {
		if (!item.command) {
			return;
		}
		this._lookupMap[item.command] = this._lookupMap[item.command] || [];
		this._lookupMap[item.command].push(item);
	}

	public getDefaultBoundCommands(): IBoundCommands {
		return this._defaultBoundCommands;
	}

	public getDefaultKeybindings(): string {
		var out = new OutputBuilder();
		out.writeLine('[');
		this._defaultKeybindings.forEach(k => {
			IOSupport.writeKeybindingItem(out, k);
			out.writeLine(',');
		});
		out.writeLine(']');
		return out.toString();
	}

	public lookupKeybinding(commandId: string): Keybinding[] {
		let rawPossibleTriggers = this._lookupMap[commandId]
		if (!rawPossibleTriggers) {
			return [];
		}

		let possibleTriggers = rawPossibleTriggers.map(possibleTrigger => possibleTrigger.keybinding);

		let remove = this._lookupMapUnreachable[commandId];
		if (remove) {
			possibleTriggers = possibleTriggers.filter((possibleTrigger) => {
				return remove.indexOf(possibleTrigger) === -1;
			});
		}

		let seenKeys: number[] = [];
		let result = possibleTriggers.filter((possibleTrigger) => {
			if (seenKeys.indexOf(possibleTrigger) >= 0) {
				return false;
			}
			seenKeys.push(possibleTrigger);
			return true;
		});

		return result.map((trigger) => {
			return new Keybinding(trigger);
		}).reverse(); // sort most specific to the top
	}

	public resolve(context: any, currentChord: number, keypress: number): IResolveResult {
		// console.log('resolve: ' + Keybinding.toLabel(keypress));
		let lookupMap: ICommandEntry[] = null;

		if (currentChord !== 0) {
			let chords = this._chords[currentChord];
			if (!chords) {
				return null;
			}
			lookupMap = chords[keypress];
		} else {
			lookupMap = this._map[keypress];
		}


		let result = this._findCommand(context, lookupMap);
		if (!result) {
			return null;
		}

		if (currentChord === 0 && BinaryKeybindings.hasChord(result.keybinding)) {
			return {
				enterChord: keypress,
				commandId: null
			};
		}

		return {
			enterChord: 0,
			commandId: result.commandId
		};
	}

	private _findCommand(context: any, matches: ICommandEntry[]): ICommandEntry {
		if (!matches) {
			return null;
		}

		for (let i = matches.length - 1; i >= 0; i--) {
			let k = matches[i];

			if (!CommonKeybindingResolver.contextMatchesRules(context, k.context)) {
				continue;
			}

			return k;
		}

		return null;
	}

	public static contextMatchesRules(context: any, rules: IKeybindingContextRule[]): boolean {
		if (!rules || rules.length === 0) {
			return true;
		}
		for (var i = 0, len = rules.length; i < len; i++) {
			if (!CommonKeybindingResolver.contextMatchesRule(context, rules[i])) {
				return false;
			}
		}
		return true;
	}

	public static contextMatchesRule(context: any, rule:IKeybindingContextRule): boolean {
		var operator = (typeof rule.operator === 'undefined' ? KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL : rule.operator);
		var operand = (typeof rule.operand === 'undefined' ? true : rule.operand);

		switch (operator) {
			case KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL:
				if (operand === false) {
					// Evaluate `key == false`   as   `!key`
					return !context[rule.key];
				}
				return context[rule.key] === operand;
			case KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL:
				return context[rule.key] !== operand;
			default:
				console.warn('Unknown operator ' + operator);
		}
		return true;
	}
}

function rightPaddedString(str: string, minChars: number): string {
	if (str.length < minChars) {
		return str + (new Array(minChars - str.length).join(' '));
	}
	return str;
}

function sorter(a: IKeybindingItem, b: IKeybindingItem): number {
	if (a.weight1 !== b.weight1) {
		return a.weight1 - b.weight1;
	}
	if (a.command < b.command) {
		return -1;
	}
	if (a.command > b.command) {
		return 1;
	}
	return a.weight2 - b.weight2;
}

export class OutputBuilder {

	private _lines: string[] = [];
	private _currentLine: string = '';

	write(str: string): void {
		this._currentLine += str;
	}

	writeLine(str: string = ''): void {
		this._lines.push(this._currentLine + str);
		this._currentLine = '';
	}

	toString(): string {
		this.writeLine();
		return this._lines.join('\n');
	}
}

export class IOSupport {

	public static writeKeybindingItem(out: OutputBuilder, item: IKeybindingItem): void {
		out.write('{ "key": ' + rightPaddedString('"' + IOSupport.writeKeybinding(item.keybinding).replace(/\\/g, '\\\\') + '",', 25) + ' "command": ');
		if (item.context) {
			out.write('"' + item.command + '",');
			out.writeLine();
			if (item.context.length > 0) {
				out.write('                                     "when": "');
				IOSupport.writeKeybindingContexts(out, item.context);
				out.write('" ');
			} else {
				out.write('"when": "" ');
			}
		} else {
			out.write('"' + item.command + '" ');
		}
//		out.write(String(item.weight));
		out.write('}');
	}

	public static readKeybindingItem(input: IUserFriendlyKeybinding, index:number): IKeybindingItem {
		var key = IOSupport.readKeybinding(input.key);
		var context = IOSupport.readKeybindingContexts(input.when);
		return {
			keybinding: key,
			command: input.command,
			context: context,
			weight1: 1000,
			weight2: index
		};
	}

	private static writeKeybinding(input: number): string {
		return Keybinding.toUserSettingsLabel(input);
	}

	public static readKeybinding(input: string): number {
		if (!input) {
			return null;
		}
		input = input.toLowerCase().trim();

		var ctrlCmd = false,
			shift = false,
			alt = false,
			winCtrl = false,
			key:string = '';

		while (/^(ctrl|shift|alt|meta|win|cmd)(\+|\-)/.test(input)) {
			if (/^ctrl(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					winCtrl = true;
				} else {
					ctrlCmd = true;
				}
				input = input.substr('ctrl-'.length);
			}
			if (/^shift(\+|\-)/.test(input)) {
				shift = true;
				input = input.substr('shift-'.length);
			}
			if (/^alt(\+|\-)/.test(input)) {
				alt = true;
				input = input.substr('alt-'.length);
			}
			if (/^meta(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('meta-'.length);
			}
			if (/^win(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('win-'.length);
			}
			if (/^cmd(\+|\-)/.test(input)) {
				if (Platform.isMacintosh) {
					ctrlCmd = true;
				} else {
					winCtrl = true;
				}
				input = input.substr('cmd-'.length);
			}
		}

		if (/^(up|down|left|right)/.test(input)) {
			input = input.replace(/^(up|down|left|right)/,(captured) => {
				return captured + 'arrow';
			});
		}

		var chord: number = 0;

		var firstSpaceIdx = input.indexOf(' ');
		if (firstSpaceIdx > 0) {
			key = input.substring(0, firstSpaceIdx);
			chord = IOSupport.readKeybinding(input.substring(firstSpaceIdx));
		} else {
			key = input;
		}

		let keyCode = KeyCode.fromString(key);

		let result = 0;
		if (ctrlCmd) {
			result |= KeyMod.CtrlCmd;
		}
		if (shift) {
			result |= KeyMod.Shift;
		}
		if (alt) {
			result |= KeyMod.Alt;
		}
		if (winCtrl) {
			result |= KeyMod.WinCtrl;
		}
		result |= keyCode;
		return KeyMod.chord(result, chord);
	}

	private static writeKeybindingContexts(out: OutputBuilder, context: IKeybindingContextRule[]): void {
		var lastCtxIndex = context.length - 1;
		context.forEach((c, i) => {
			IOSupport.writeKeybindingContent(out, c);
			if (i !== lastCtxIndex) {
				out.write(' && ');
			}
		});
	}

	public static readKeybindingContexts(input: string): IKeybindingContextRule[] {
		if (!input) {
			return undefined;
		}

		var result: IKeybindingContextRule[] = [];

		var pieces = input.split('&&');
		for (var i = 0; i < pieces.length; i++) {
			result.push(IOSupport.readKeybindingContext(pieces[i]));
		}
		return result;
	}

	private static writeKeybindingContent(out: OutputBuilder, context: IKeybindingContextRule): void {
		if (context.operator) {
			if (
				(context.operator === KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL && context.operand === true)
				|| (context.operator === KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL && context.operand === false)
				) {
				out.write('!' + context.key);
				return;
			}
		}
		out.write(context.key);
		if (context.operator) {
			if (context.operator === KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL) {
				out.write(' == ');
			} else {
				out.write(' != ');
			}

			if (typeof context.operand === 'boolean') {
				out.write(context.operand);
			} else {
				out.write('\'' + context.operand + '\'');
			}
		}
	}

	private static readKeybindingContext(input: string): IKeybindingContextRule {
		input = input.trim();

		var pieces: string[], operator: string = null;
		if (input.indexOf('!=') >= 0) {
			pieces = input.split('!=');
			operator = KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL;
		} else if (input.indexOf('==') >= 0) {
			pieces = input.split('==');
			operator = KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_EQUAL;
		} else {
			if (/^\!\s*/.test(input)) {
				return {
					key: input.substr(1).trim(),
					operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL,
					operand: true
				};
			}
			return {
				key: input
			};
		}

		var operand = <any>pieces[1].trim();

		if (operand === 'true') {
			operand = true;
		} else if (operand === 'false') {
			operand = false;
		} else {
			var m = /^'([^']*)'$/.exec(operand);
			if (m) {
				operand = m[1];
			}
		}

		return {
			key: pieces[0].trim(),
			operator: operator,
			operand: operand
		};
	}
}
