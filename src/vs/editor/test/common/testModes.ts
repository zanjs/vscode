/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import stream = require('vs/editor/common/modes/lineStream');
import servicesUtil = require('vs/editor/test/common/servicesTestUtils');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';

export class CommentState extends AbstractState {

	constructor(mode:modes.IMode, stateCount:number) {
		super(mode);
	}

	public makeClone():CommentState {
		return this;
	}

	public equals(other:modes.IState):boolean {
		return true;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type: 'state' };
	}
}

export class CommentMode extends AbstractMode<AbstractModeWorker> {

	private commentsConfig:modes.ICommentsConfiguration;

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor(commentsConfig:modes.ICommentsConfiguration) {
		super({ id: 'tests.commentMode', workerParticipants: [] }, null, null);
		this.commentsConfig = commentsConfig;

		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new CommentState(this, 0)
		}, false, false);
	}

	public getCommentsConfiguration():modes.ICommentsConfiguration {
		return this.commentsConfig;
	}
}

export class CursorState extends AbstractState {

	constructor(mode:CursorMode) {
		super(mode);
	}

	public makeClone():CursorState {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return this === other;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type: 'foooooo' };
	}
}

export class TestingMode implements modes.IMode {
	public getId():string {
		return 'testing';
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}

export class AbstractIndentingMode extends TestingMode {

	public getElectricCharacters():string[] {
		return null;
	}

	public onElectricCharacter(context:modes.ILineContext, offset:number):modes.IElectricAction {
		return null;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return null;
	}

}

export class IndentingMode extends AbstractIndentingMode {

	public electricCharacterSupport: modes.IElectricCharacterSupport;

	constructor() {
		super();
		this.electricCharacterSupport = this;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return {
			indentAction:modes.IndentAction.Indent
		};
	}
}

export class NonIndentingMode extends AbstractIndentingMode {

	public electricCharacterSupport: modes.IElectricCharacterSupport;

	constructor() {
		super();
		this.electricCharacterSupport = this;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return {
			indentAction:modes.IndentAction.None
		};
	}
}

export class IndentOutdentMode extends AbstractIndentingMode {

	public electricCharacterSupport: modes.IElectricCharacterSupport;

	constructor() {
		super();
		this.electricCharacterSupport = this;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return {
			indentAction:modes.IndentAction.IndentOutdent
		};
	}
}

export class CursorMode extends AbstractIndentingMode {

	public tokenizationSupport: modes.ITokenizationSupport;
	public electricCharacterSupport: modes.IElectricCharacterSupport;

	constructor() {
		super();
		this.tokenizationSupport = new supports.TokenizationSupport(this, this, false, false);
		this.electricCharacterSupport = this;
	}

	public getInitialState():modes.IState {
		return new CursorState(this);
	}

	public getElectricCharacters():string[] {
		return null;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return null;
	}
}

export class SurroundingState extends AbstractState {

	constructor(mode:SurroundingMode) {
		super(mode);
	}

	public makeClone():SurroundingState {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return this === other;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type: '' };
	}
}

export class SurroundingMode extends AbstractIndentingMode {

	public tokenizationSupport: modes.ITokenizationSupport;
	public electricCharacterSupport: modes.IElectricCharacterSupport;
	public characterPairSupport: modes.ICharacterPairSupport;

	constructor() {
		super();
		this.tokenizationSupport = new supports.TokenizationSupport(this, this, false, false);
		this.electricCharacterSupport = this;

		this.characterPairSupport = new supports.CharacterPairSupport(this, {
			autoClosingPairs: [{ open: '(', close: ')' }]});
	}

	public getInitialState():modes.IState {
		return new SurroundingState(this);
	}

	public getElectricCharacters():string[] {
		return null;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return null;
	}
}

export class ModelState1 extends AbstractState {

	constructor(mode:modes.IMode) {
		super(mode);
	}

	public makeClone():ModelState1 {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return this === other;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		(<ModelMode1>this.getMode()).calledFor.push(stream.next());
		stream.advanceToEOS();
		return { type: '' };
	}
}

export class ModelMode1 extends TestingMode {
	public calledFor:string[];

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.calledFor = [];
		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new ModelState1(this)
		}, false, false);
	}
}

export class ModelState2 extends AbstractState {

	private prevLineContent:string;

	constructor(mode:ModelMode2, prevLineContent:string) {
		super(mode);
		this.prevLineContent = prevLineContent;
	}

	public makeClone():ModelState2 {
		return new ModelState2(<ModelMode2>this.getMode(), this.prevLineContent);
	}

	public equals(other: modes.IState):boolean {
		return (other instanceof ModelState2) && (this.prevLineContent === (<ModelState2>other).prevLineContent);
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		var line= '';
		while (!stream.eos()) {
			line+= stream.next();
		}
		this.prevLineContent= line;
		return { type: '' };
	}
}

export class ModelMode2 extends TestingMode {
	public calledFor:any[];

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.calledFor = null;
		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new ModelState2(this, '')
		}, false, false);
	}
}

export class BracketState extends AbstractState {

	private allResults:{
		[key:string]:modes.ITokenizationResult;
	};

	constructor(mode:modes.IMode) {
		super(mode);
		this.allResults = null;
	}

	public makeClone():BracketState {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return true;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		this.initializeAllResults();
		stream.setTokenRules('{}[]()', '');
		var token= stream.nextToken();
		// Strade compiler bug: can't reference self in Object return creation.
		var state:modes.IState = this;
		if (this.allResults.hasOwnProperty(token)) {
			return this.allResults[token];
		} else {
			return {
				type: '',
				bracket: modes.Bracket.None,
				nextState: state
			};
		}
	}

	public initializeAllResults(): void {
		if (this.allResults !== null)
			return;
		this.allResults = {};
		var brackets:any= {
			'{': '}',
			'[': ']',
			'(': ')'
		};

		var type= 1;
		var state:modes.IState = this;
		for (var x in brackets) {
			this.allResults[x]= {
				type: 'bracket' + type,
				bracket: modes.Bracket.Open,
				nextState: state
			};
			this.allResults[brackets[x]] = {
				type: 'bracket' + type,
				bracket: modes.Bracket.Close,
				nextState: state
			};
			type++;
		}
	}
}

export class BracketMode extends TestingMode {

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new BracketState(this)
		}, false, false);
	}
}

export class NState extends AbstractState {

	private n:number;
	private allResults:modes.ITokenizationResult[];

	constructor(mode:modes.IMode, n:number) {
		super(mode);
		this.n = n;
		this.allResults = null;
	}


	public makeClone():NState {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return true;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		var ndash = this.n, value = '';
		while(!stream.eos() && ndash > 0) {
			value += stream.next();
			ndash--;
		}
		return { type: 'n-' + (this.n - ndash) + '-' + value };
	}
}

export class NMode extends TestingMode {

	private n:number;

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor(n:number) {
		this.n = n;
		super();
		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new NState(this, this.n)
		}, false, false);
	}
}