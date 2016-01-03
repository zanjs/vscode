/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import htmlMode = require('vs/languages/html/common/html');
import winjs = require('vs/base/common/winjs.base');
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import handlebarsTokenTypes = require('vs/languages/handlebars/common/handlebarsTokenTypes');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModeService} from 'vs/editor/common/services/modeService';

export enum States {
	HTML,
	Expression,
	UnescapedExpression
}

export class HandlebarsState extends htmlMode.State {

	constructor(mode:Modes.IMode,
		public kind:htmlMode.States,
		public handlebarsKind:States,
		public lastTagName:string,
		public lastAttributeName:string,
		public embeddedContentType:string,
		public attributeValueQuote:string,
		public attributeValue:string) {

		super(mode, kind, lastTagName, lastAttributeName, embeddedContentType, attributeValueQuote, attributeValue);
	}

	public makeClone(): HandlebarsState {
		return new HandlebarsState(this.getMode(), this.kind, this.handlebarsKind, this.lastTagName, this.lastAttributeName, this.embeddedContentType, this.attributeValueQuote, this.attributeValue);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof HandlebarsState) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream) : Modes.ITokenizationResult {
		switch(this.handlebarsKind) {
			case States.HTML:
				if (stream.advanceIfString('{{{').length > 0) {
					this.handlebarsKind = States.UnescapedExpression;
					return { type: handlebarsTokenTypes.EMBED_UNESCAPED, bracket: Modes.Bracket.Open };
				}
				else if (stream.advanceIfString('{{').length > 0) {
					this.handlebarsKind = States.Expression;
					return { type: handlebarsTokenTypes.EMBED, bracket: Modes.Bracket.Open };
				}
			break;

			case States.Expression:
			case States.UnescapedExpression:
				if (this.handlebarsKind === States.Expression && stream.advanceIfString('}}').length > 0) {
					this.handlebarsKind = States.HTML;
					return { type: handlebarsTokenTypes.EMBED, bracket: Modes.Bracket.Close };
				}
				else if (this.handlebarsKind === States.UnescapedExpression &&stream.advanceIfString('}}}').length > 0) {
					this.handlebarsKind = States.HTML;
					return { type: handlebarsTokenTypes.EMBED_UNESCAPED, bracket: Modes.Bracket.Close };
				}
				else if(stream.skipWhitespace().length > 0) {
					return { type: ''};
				}

				if(stream.peek() === '#') {
					stream.advanceWhile(/^[^\s}]/);
					return { type: handlebarsTokenTypes.KEYWORD, bracket: Modes.Bracket.Open };
				}

				if(stream.peek() === '/') {
					stream.advanceWhile(/^[^\s}]/);
					return { type: handlebarsTokenTypes.KEYWORD, bracket: Modes.Bracket.Close };
				}

				if(stream.advanceIfString('else')) {
					var next = stream.peek();
					if(next === ' ' || next === '\t' || next === '}') {
						return { type: handlebarsTokenTypes.KEYWORD };
					}
					else {
						stream.goBack(4);
					}
				}

				if(stream.advanceWhile(/^[^\s}]/).length > 0) {
					return { type: handlebarsTokenTypes.VARIABLE };
				}
			break;
		}
		return super.tokenize(stream);
	}
}

export class HandlebarsMode extends htmlMode.HTMLMode<htmlWorker.HTMLWorker> {

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService
	) {
		super(descriptor, instantiationService, threadService, modeService);

		this.formattingSupport = null;

		this.onEnterSupport = new OnEnterSupport(this.getId(), {
			brackets: [
				{ open: '<!--', close: '-->' },
				{ open: '{{', close: '}}' },
			]
		});
	}

	public asyncCtor(): winjs.Promise {
		return super.asyncCtor().then(() => {
			var pairs = this.characterPairSupport.getAutoClosingPairs().slice(0).concat([
				{ open: '{', close: '}'}
			]);

			this.characterPairSupport = new supports.CharacterPairSupport(this, {
				autoClosingPairs:  pairs.slice(0),
				surroundingPairs: [
					{ open: '<', close: '>' },
					{ open: '"', close: '"' },
					{ open: '\'', close: '\'' }
				]
			});
		});
	}

	public getInitialState() : Modes.IState {
		return new HandlebarsState(this, htmlMode.States.Content, States.HTML, '', '', '', '', '');
	}

	public getLeavingNestedModeData(line:string, state:Modes.IState):supports.ILeavingNestedModeData {
		var leavingNestedModeData = super.getLeavingNestedModeData(line, state);
		if (leavingNestedModeData) {
			leavingNestedModeData.stateAfterNestedMode = new HandlebarsState(this, htmlMode.States.Content, States.HTML, '', '', '', '', '');
		}
		return leavingNestedModeData;
	}
}
