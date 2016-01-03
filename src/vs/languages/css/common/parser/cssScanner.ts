/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export enum TokenType {
	Ident,
	AtKeyword,
	String,
	BadString,
	BadUri,
	Hash,
	Num,
	Percentage,
	Dimension,
	URI,
	UnicodeRange,
	CDO,
	CDC,
	Colon,
	SemiColon,
	CurlyL,
	CurlyR,
	ParenthesisL,
	ParenthesisR,
	BracketL,
	BracketR,
	Whitespace,
	Includes,
	Dashmatch,
	SubstringOperator,
	PrefixOperator,
	SuffixOperator,
	Delim,
	EMS,
	EXS,
	Length,
	Angle,
	Time,
	Freq,
	Exclamation,
	Resolution,
	Comma,
	Charset,

	EscapedJavaScript,
	BadEscapedJavaScript,
	SingleLineComment,
	EOF,
	CustomToken
}

export interface IToken {
	type: TokenType;
	text: string;
	offset: number;
	len: number;
}

export class MultiLineStream {

	private source:string;
	private len:number;
	private position:number;

	constructor(source: string) {
		this.source = source;
		this.len = source.length;
		this.position = 0;
	}

	public substring(from:number, to:number = this.position):string {
		return this.source.substring(from, to);
	}

	public eos():boolean {
		return this.len <= this.position;
	}

	public pos():number {
		return this.position;
	}

	public goBackTo(pos:number):void {
		this.position = pos;
	}

	public goBack(n:number):void {
		this.position -= n;
	}

	public advance(n:number):void {
		this.position += n;
	}

	public nextChar():number {
		return this.source.charCodeAt(this.position++) || 0;
	}

	public peekChar(n:number=0):number {
		return this.source.charCodeAt(this.position + n) || 0;
	}

	public lookbackChar(n:number=0):number {
		return this.source.charCodeAt(this.position - n) || 0;
	}

	public advanceIfChar(ch:number):boolean {
		if (ch === this.source.charCodeAt(this.position)) {
			this.position++;
			return true;
		}
		return false;
	}

	public advanceIfChars(ch:number[]):boolean {
		var i:number;
		if (this.position + ch.length > this.source.length) {
			return false;
		}
		for (i = 0; i < ch.length; i++) {
			if (this.source.charCodeAt(this.position + i) !== ch[i]) {
				return false;
			}
		}
		this.advance(i);
		return true;
	}

	public advanceWhileChar(condition:(ch:number)=>boolean):number {
		var posNow = this.position;
		while (this.position < this.len && condition(this.source.charCodeAt(this.position))) {
			this.position++;
		}
		return this.position - posNow;
	}
}

var _a = 'a'.charCodeAt(0);
var _c = 'c'.charCodeAt(0);
var _e = 'e'.charCodeAt(0);
var _f = 'f'.charCodeAt(0);
var _h = 'h'.charCodeAt(0);
var _i = 'i'.charCodeAt(0);
var _l = 'l'.charCodeAt(0);
var _p = 'p'.charCodeAt(0);
var _r = 'r'.charCodeAt(0);
var _s = 's'.charCodeAt(0);
var _t = 't'.charCodeAt(0);
var _u = 'u'.charCodeAt(0);
var _x = 'x'.charCodeAt(0);
var _z = 'z'.charCodeAt(0);
var _A = 'A'.charCodeAt(0);
var _E = 'E'.charCodeAt(0);
var _F = 'F'.charCodeAt(0);
var _I = 'I'.charCodeAt(0);
var _L = 'L'.charCodeAt(0);
var _P = 'P'.charCodeAt(0);
var _R = 'R'.charCodeAt(0);
var _U = 'U'.charCodeAt(0);
var _X = 'X'.charCodeAt(0);
var _Z = 'Z'.charCodeAt(0);
var _0 = '0'.charCodeAt(0);
var _9 = '9'.charCodeAt(0);
var _TLD = '~'.charCodeAt(0);
var _HAT = '^'.charCodeAt(0);
var _EQS = '='.charCodeAt(0);
var _PIP = '|'.charCodeAt(0);
var _MIN = '-'.charCodeAt(0);
var _USC = '_'.charCodeAt(0);
var _PRC = '%'.charCodeAt(0);
var _MUL = '*'.charCodeAt(0);
var _LPA = '('.charCodeAt(0);
var _RPA = ')'.charCodeAt(0);
var _LAN = '<'.charCodeAt(0);
var _RAN = '>'.charCodeAt(0);
var _ATS = '@'.charCodeAt(0);
var _HSH = '#'.charCodeAt(0);
var _DLR = '$'.charCodeAt(0);
var _BSL = '\\'.charCodeAt(0);
var _FSL = '/'.charCodeAt(0);
var _NWL = '\n'.charCodeAt(0);
var _CAR = '\r'.charCodeAt(0);
var _LFD = '\f'.charCodeAt(0);
var _DQO = '"'.charCodeAt(0);
var _SQO = '\''.charCodeAt(0);
var _WSP = ' '.charCodeAt(0);
var _TAB = '\t'.charCodeAt(0);
var _SEM = ';'.charCodeAt(0);
var _COL = ':'.charCodeAt(0);
var _CUL = '{'.charCodeAt(0);
var _CUR = '}'.charCodeAt(0);
var _BRL = '['.charCodeAt(0);
var _BRR = ']'.charCodeAt(0);
var _CMA = ','.charCodeAt(0);
var _DOT = '.'.charCodeAt(0);
var _BNG = '!'.charCodeAt(0);

var _url = [_u, _U, _r, _R, _l, _L, _LPA, _LPA];
var _url_prefix = [_u, _U, _r, _R, _l, _L, _MIN, _MIN, _p, _P, _r, _R, _e, _E, _f, _F, _i, _I, _x, _X, _LPA, _LPA];

var staticTokenTable:{[code:number]:TokenType;} = {};
staticTokenTable[_SEM] = TokenType.SemiColon;
staticTokenTable[_COL] = TokenType.Colon;
staticTokenTable[_CUL] = TokenType.CurlyL;
staticTokenTable[_CUR] = TokenType.CurlyR;
staticTokenTable[_BRR] = TokenType.BracketR;
staticTokenTable[_BRL] = TokenType.BracketL;
staticTokenTable[_LPA] = TokenType.ParenthesisL;
staticTokenTable[_RPA] = TokenType.ParenthesisR;
staticTokenTable[_CMA] = TokenType.Comma;

var staticUnitTable:{[code:number]:TokenType;} = {};
staticUnitTable['em'] = TokenType.EMS;
staticUnitTable['ex'] = TokenType.EXS;
staticUnitTable['px'] = TokenType.Length;
staticUnitTable['cm'] = TokenType.Length;
staticUnitTable['mm'] = TokenType.Length;
staticUnitTable['in'] = TokenType.Length;
staticUnitTable['pt'] = TokenType.Length;
staticUnitTable['pc'] = TokenType.Length;
staticUnitTable['deg'] = TokenType.Angle;
staticUnitTable['rad'] = TokenType.Angle;
staticUnitTable['grad'] = TokenType.Angle;
staticUnitTable['ms'] = TokenType.Time;
staticUnitTable['s'] = TokenType.Time;
staticUnitTable['hz'] = TokenType.Freq;
staticUnitTable['khz'] = TokenType.Freq;
staticUnitTable['%'] = TokenType.Percentage;
staticUnitTable['dpi'] = TokenType.Resolution;
staticUnitTable['dpcm'] = TokenType.Resolution;

export class Scanner {

	public stream: MultiLineStream;
	public ignoreComment = true;

	public setSource(input: string): void {
		this.stream = new MultiLineStream(input);
	}

	public finishToken(token: IToken, type: TokenType, text?: string): IToken {
		token.len = this.stream.pos() - token.offset;
		token.type = type;
		token.text = text || this.stream.substring(token.offset);
		return token;
	}

	public substring(offset:number, len:number):string {
		return this.stream.substring(offset, offset + len);
	}

	public pos():number {
		return this.stream.pos();
	}

	public goBackTo(pos: number):void {
		this.stream.goBackTo(pos);
	}

	public scan(ignoreWhitespace:boolean=true): IToken {

		var result:IToken = {
			type: undefined,
			text: undefined,
			offset: this.stream.pos(),
			len: 0
		};

		// Whitespace - if asked for
		if (this._whitespace()) {
			if (!ignoreWhitespace) {
				return this.finishToken(result, TokenType.Whitespace);
			} else {
				return this.scan(ignoreWhitespace);
			}
		}

		// Comment - CSS
		if (this._comment()) {
			if (!this.ignoreComment) {
				return this.finishToken(result, tokenType);
			} else {
				return this.scan(ignoreWhitespace);
			}
		}

		// End of file/input
		if (this.stream.eos()) {
			return this.finishToken(result, TokenType.EOF);
		}

		// CDO <!--
		if (this.stream.advanceIfChars([_LAN, _BNG, _MIN, _MIN])) {
			return this.finishToken(result, TokenType.CDO);
		}

		// CDC -->
		if (this.stream.advanceIfChars([_MIN, _MIN, _RAN])) {
			return this.finishToken(result, TokenType.CDC);
		}

		// URL
		var tokenType = this._url();
		if (tokenType !== null) {
			return this.finishToken(result, tokenType);
		}
		var content: string[] = [];
		if (this.ident(content)) {
			return this.finishToken(result, TokenType.Ident, content.join(''));
		}

		// at-keyword
		if (this.stream.advanceIfChar(_ATS)) {
			content = [ '@' ];
			if (this.ident(content)) {
				var keywordText = content.join('');
				if (keywordText === '@charset') {
					return this.finishToken(result, TokenType.Charset, keywordText);
				}
				return this.finishToken(result, TokenType.AtKeyword, keywordText);
			} else {
				return this.finishToken(result, TokenType.Delim);
			}
		}

		// hash
		if (this.stream.advanceIfChar(_HSH)) {
			content = [ '#' ];
			if (this._name(content)) {
				return this.finishToken(result, TokenType.Hash, content.join(''));
			} else {
				return this.finishToken(result, TokenType.Delim);
			}
		}

		// Important
		if (this.stream.advanceIfChar(_BNG)) {
			return this.finishToken(result, TokenType.Exclamation);
		}

		// Numbers
		if (this._number()) {

			var pos = this.stream.pos();
			content = [ this.stream.substring(result.offset, pos) ];
			if (this.stream.advanceIfChar(_PRC)) {
				// Percentage 43%
				return this.finishToken(result, TokenType.Percentage);
			} else if (this.ident(content)) {
				var dim = this.stream.substring(pos).toLowerCase();
				var tokenType = <TokenType>staticUnitTable[dim];
				if (typeof tokenType !== 'undefined') {
					// Known dimension 43px
					return this.finishToken(result, tokenType, content.join(''));
				} else {
					// Unknown dimension 43ft
					return this.finishToken(result, TokenType.Dimension, content.join(''));
				}
			}

			return this.finishToken(result, TokenType.Num);
		}

		// String, BadString
		content = [];
		var tokenType = this._string(content);
		if (tokenType !== null) {
			return this.finishToken(result, tokenType, content.join(''));
		}

		// single character tokens
		var tokenType = <TokenType>staticTokenTable[this.stream.peekChar()];
		if (typeof tokenType !== 'undefined') {
			this.stream.advance(1);
			return this.finishToken(result, tokenType);
		}

		// includes ~=
		if (this.stream.peekChar(0) === _TLD && this.stream.peekChar(1) === _EQS) {
			this.stream.advance(2);
			return this.finishToken(result, TokenType.Includes);
		}

		// DashMatch |=
		if (this.stream.peekChar(0) === _PIP && this.stream.peekChar(1) === _EQS) {
			this.stream.advance(2);
			return this.finishToken(result, TokenType.Dashmatch);
		}

		// Substring operator *=
		if (this.stream.peekChar(0) === _MUL && this.stream.peekChar(1) === _EQS) {
			this.stream.advance(2);
			return this.finishToken(result, TokenType.SubstringOperator);
		}

		// Substring operator ^=
		if (this.stream.peekChar(0) === _HAT && this.stream.peekChar(1) === _EQS) {
			this.stream.advance(2);
			return this.finishToken(result, TokenType.PrefixOperator);
		}

		// Substring operator $=
		if (this.stream.peekChar(0) === _DLR && this.stream.peekChar(1) === _EQS) {
			this.stream.advance(2);
			return this.finishToken(result, TokenType.SuffixOperator);
		}

		// Delim
		this.stream.nextChar();
		return this.finishToken(result, TokenType.Delim);
	}

	private _matchWordAnyCase(characters:number[]): boolean {
		var index = 0;
		this.stream.advanceWhileChar((ch:number) => {
			var result = characters[index] === ch || characters[index+1] === ch;
			if (result) {
				index += 2;
			}
			return result;
		});
		if (index === characters.length) {
			return true;
		} else {
			this.stream.goBack(index/2);
			return false;
		}
	}

	private _comment():boolean {
		if (this.stream.advanceIfChars([_FSL, _MUL])) {
			var success = false, hot = false;
			this.stream.advanceWhileChar((ch) => {
				if (hot && ch === _FSL) {
					success = true;
					return false;
				}
				hot = ch === _MUL;
				return true;
			});
			if (success) {
				this.stream.advance(1);
			}
			return true;
		}

		return false;
	}

	private _number():boolean {
		var npeek = 0, ch:number;
		if (this.stream.peekChar() === _DOT) {
			npeek = 1;
		}
		ch = this.stream.peekChar(npeek);
		if (ch >= _0 && ch <= _9) {
			this.stream.advance(npeek + 1);
			this.stream.advanceWhileChar((ch) => {
				return ch >= _0 && ch <= _9 || npeek === 0 && ch === _DOT;
			});
			return true;
		}
		return false;
	}

	private _newline(result: string[]):boolean {
		var ch = this.stream.peekChar();
		switch (ch) {
			case _CAR:
			case _LFD:
			case _NWL:
				this.stream.advance(1);
				result.push(String.fromCharCode(ch));
				if (ch === _CAR && this.stream.advanceIfChar(_NWL)) {
					result.push('\n');
				}
				return true;
		}


		return false;
	}

	private _escape(result: string[], includeNewLines?:boolean):boolean {
		var ch = this.stream.peekChar();
		if (ch === _BSL) {
			this.stream.advance(1);
			ch = this.stream.peekChar();
			var hexNumCount = 0;
			while (hexNumCount < 6 && (ch >= _0 && ch <= _9 || ch >= _a && ch <= _f || ch >= _A && ch <= _F)) {
				this.stream.advance(1);
				ch = this.stream.peekChar();
				hexNumCount++;
			}
			if (hexNumCount > 0) {
				try {
					var hexVal= parseInt(this.stream.substring(this.stream.pos() - hexNumCount), 16);
					if (hexVal) {
						result.push(String.fromCharCode(hexVal));
					}
				} catch (e) {
					// ignore
				}

				// optional whitespace or new line, not part of result text
				if (ch === _WSP || ch === _TAB) {
					this.stream.advance(1);
				} else {
					this._newline([]);
				}
				return true;
			}
			if (ch !== _CAR && ch !== _LFD && ch != _NWL) {
				this.stream.advance(1);
				result.push(String.fromCharCode(ch));
				return true;
			} else if (includeNewLines) {
				return this._newline(result);
			}
		}
		return false;
	}

	private _stringChar(closeQuote: number, result: string[])  {
		// not closeQuote, not backslash, not newline
		var ch = this.stream.peekChar();
		if (ch !== 0 && ch !== closeQuote && ch !== _BSL && ch !== _CAR && ch !== _LFD && ch !== _NWL) {
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	};

	private _string(result: string[]):TokenType {
		if (this.stream.peekChar() === _SQO || this.stream.peekChar() === _DQO) {
			var closeQuote = this.stream.nextChar();
			result.push(String.fromCharCode(closeQuote));

			while (this._stringChar(closeQuote, result) || this._escape(result, true)) {
				// loop
			}

			if (this.stream.peekChar() === closeQuote) {
				this.stream.nextChar();
				result.push(String.fromCharCode(closeQuote));
				return TokenType.String;
			} else {
				return TokenType.BadString;
			}
		}
		return null;
	}

	private _url():TokenType {
		if (this._matchWordAnyCase(_url) || this._matchWordAnyCase(_url_prefix)) {
			this._whitespace();
			var tokenType = TokenType.URI, stringType = this._string([]);
			if (stringType === TokenType.BadString) {
				tokenType = TokenType.BadUri;

			} else if (stringType === null) {
				this.stream.advanceWhileChar((ch) => {
					return ch !== _RPA;
				});
				tokenType = TokenType.URI;
			}
			this._whitespace();
			if (this.stream.advanceIfChar(_RPA)) {
				return tokenType;
			} else {
				return TokenType.BadUri;
			}
		}

		return null;
	}

	private _whitespace():boolean {
		var n = this.stream.advanceWhileChar((ch) => {
			return ch === _WSP || ch === _TAB || ch === _NWL || ch === _LFD || ch === _CAR;
		});
		return n > 0;
	}

	private _name(result:string[]):boolean {
		var matched = false;
		while (this._identChar(result) || this._escape(result)) {
			matched = true;
		}
		return matched;
	}

	protected ident(result:string[]):boolean {
		var pos = this.stream.pos();
		var hasMinus = this._minus(result);
		if (hasMinus && this._minus(result) /* -- */) {
			var hasContent = false;
			while (this._identChar(result) || this._escape(result)) {
				hasContent = true;
			}
			if (hasContent) {
				return true;
			}
		} else if (this._identFirstChar(result) || this._escape(result)) {
			while (this._identChar(result) || this._escape(result)) {
				// loop
			}
			return true;
		}
		this.stream.goBackTo(pos);
		return false;
	}

	private _identFirstChar(result:string[]):boolean {
		var ch = this.stream.peekChar();
		if (ch === _USC || // _
			ch >= _a && ch <= _z || // a-z
			ch >= _A && ch <= _Z || // A-Z
			ch >= 0x80 && ch <= 0xFFFF) { // nonascii
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}


	private _minus(result:string[]):boolean {
		var ch = this.stream.peekChar();
		if (ch === _MIN) {
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}

	private _identChar(result:string[]):boolean {
		var ch = this.stream.peekChar();
		if (ch === _USC || // _
			ch === _MIN || // -
			ch >= _a && ch <= _z || // a-z
			ch >= _A && ch <= _Z || // A-Z
			ch >= _0 && ch <= _9 || // 0/9
			ch >= 0x80 && ch <= 0xFFFF) { // nonascii
			this.stream.advance(1);
			result.push(String.fromCharCode(ch));
			return true;
		}
		return false;
	}
}
