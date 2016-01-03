/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IMatch} from 'vs/base/common/filters';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import EditorCommon = require('vs/editor/common/editorCommon');
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import URI from 'vs/base/common/uri';
import {IDisposable} from 'vs/base/common/lifecycle';
import {AsyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';

export interface IWorkerParticipantDescriptor {
	modeId:string;
	descriptor: AsyncDescriptor0<IWorkerParticipant>;
}

export interface IWorkerParticipant {

}

export enum Bracket {
	None = 0,
	Open = 1,
	Close = -1
}

export interface ITokenizationResult {
	type?:string;
	bracket?:Bracket;
	nextState?:IState;
}

export interface IState {
	clone():IState;
	equals(other:IState):boolean;
	getMode():IMode;
	tokenize(stream:IStream):ITokenizationResult;
	getStateData(): IState;
	setStateData(state:IState):void;
}

/**
 * An IStream is a character & token stream abstraction over a line of text. It
 *  is never multi-line. The stream can be navigated character by character, or
 *  token by token, given some token rules.
 */
export interface IStream {

	/**
	 * Returns the current character position of the stream on the line.
	 */
	pos():number;

	/**
	 * Returns true iff the stream is at the end of the line.
	 */
	eos():boolean;

	/**
	 * Returns the next character in the stream.
	 */
	peek():string;

	/**
	 * Returns the next character in the stream, and advances it by one character.
	 */
	next(): string;
	next2(): void;

	/**
	 * Advances the stream by `n` characters.
	 */
	advance(n:number):string;

	/**
	 * Advances the stream until the end of the line.
	 */
	advanceToEOS():string;

	/**
	 * Brings the stream back `n` characters.
	 */
	goBack(n:number):void;

	/**
	 *  Advances the stream if the next characters validate a condition. A condition can be
	 *
	 *      - a regular expression (always starting with ^)
	 * 			EXAMPLES: /^\d+/, /^function|var|interface|class/
	 *
	 *  	- a string
	 * 			EXAMPLES: "1954", "albert"
	 */
	advanceIfCharCode(charCode: number): string;
	advanceIfCharCode2(charCode:number): number;

	advanceIfString(condition: string): string;
	advanceIfString2(condition: string): number;

	advanceIfStringCaseInsensitive(condition: string): string;
	advanceIfStringCaseInsensitive2(condition: string): number;

	advanceIfRegExp(condition: RegExp): string;
	advanceIfRegExp2(condition:RegExp): number;


	/**
	 * Advances the stream while the next characters validate a condition. Check #advanceIf for
	 * details on the possible types for condition.
	 */
	advanceWhile(condition:string):string;
	advanceWhile(condition:RegExp):string;

	/**
	 * Advances the stream until the some characters validate a condition. Check #advanceIf for
	 * details on the possible types for condition. The `including` boolean value indicates
	 * whether the stream will advance the characters that matched the condition as well, or not.
	 */
	advanceUntil(condition: string, including: boolean): string;
	advanceUntil(condition: RegExp, including: boolean): string;

	advanceUntilString(condition: string, including: boolean): string;
	advanceUntilString2(condition: string, including: boolean): number;

	/**
	 * The token rules define how consecutive characters should be put together as a token,
	 * or separated into two different tokens. They are given through a separator characters
	 * string and a whitespace characters string. A separator is always one token. Consecutive
	 * whitespace is always one token. Everything in between these two token types, is also a token.
	 *
	 * 	EXAMPLE: stream.setTokenRules("+-", " ");
	 * 	Setting these token rules defines the tokens for the string "123+456 -    7" as being
	 * 		["123", "+", "456", " ", "-", "    ", "7"]
	 */
	setTokenRules(separators:string, whitespace:string):void;

	/**
	 * Returns the next token, given that the stream was configured with token rules.
	 */
	peekToken():string;

	/**
	 * Returns the next token, given that the stream was configured with token rules, and advances the
	 * stream by the exact length of the found token.
	 */
	nextToken():string;

	/**
	 * Returns the next whitespace, if found. Returns an empty string otherwise.
	 */
	peekWhitespace():string;

	/**
	 * Returns the next whitespace, if found, and advances the stream by the exact length of the found
	 * whitespace. Returns an empty string otherwise.
	 */
	skipWhitespace(): string;
	skipWhitespace2(): number;
}

export interface IModeDescriptor {
	id:string;
	workerParticipants:AsyncDescriptor0<IWorkerParticipant>[];
}

export interface ILineContext {
	getLineContent(): string;

	modeTransitions: IModeTransition[];

	getTokenCount(): number;
	getTokenStartIndex(tokenIndex:number): number;
	getTokenType(tokenIndex:number): string;
	getTokenBracket(tokenIndex:number): Bracket;
	getTokenText(tokenIndex:number): string;
	getTokenEndIndex(tokenIndex:number): number;
	findIndexOfOffset(offset:number): number;
}

export interface IMode {

	getId(): string;

	/**
	 * Return a mode "similar" to this one that strips any "smart" supports.
	 */
	toSimplifiedMode(): IMode;

	addSupportChangedListener?(callback: (e: EditorCommon.IModeSupportChangedEvent) => void): IDisposable;

	/**
	 * Register a support by name. Only optional.
	 */
	registerSupport?<T>(support:string, callback:(mode:IMode)=>T): IDisposable;

	/**
	 * Optional adapter to support tokenization.
	 */
	tokenizationSupport?: ITokenizationSupport;

	/**
	 * Optional adapter to support showing occurrences of words or such.
	 */
	occurrencesSupport?:IOccurrencesSupport;

	/**
	 * Optional adapter to support revealing the declaration of a symbol.
	 */
	declarationSupport?: IDeclarationSupport;

	/**
	 * Optional adapter to support revealing the type declaration of a symbol.
	 */
	typeDeclarationSupport?: ITypeDeclarationSupport;

	/**
	 * Optional adapter to support finding references to a symbol.
	 */
	referenceSupport?:IReferenceSupport;

	/**
	 * Optional adapter to support intellisense.
	 */
	suggestSupport?:ISuggestSupport;

	/**
	 * Optional adapter to support intellisense.
	 */
	parameterHintsSupport?:IParameterHintsSupport;

	/**
	 * Optional adapter to support showing extra info in tokens.
	 */
	extraInfoSupport?:IExtraInfoSupport;

	/**
	 * Optional adapter to support showing an outline.
	 */
	outlineSupport?:IOutlineSupport;

	/**
	 * Optional adapter to support logical selection.
	 */
	logicalSelectionSupport?:ILogicalSelectionSupport;

	/**
	 * Optional adapter to support formatting.
	 */
	formattingSupport?:IFormattingSupport;

	/**
	 * Optional adapter to support inplace-replace.
	 */
	inplaceReplaceSupport?:IInplaceReplaceSupport;

	/**
	 * Optional adapter to support diff'ing two models.
	 */
	diffSupport?:IDiffSupport;

	/**
	 * Optional adapter to support diff'ing a model with its original version.
	 */
	dirtyDiffSupport?:IDirtyDiffSupport;

	/**
	 * Optional adapter to support output for a model (e.g. markdown -> html)
	 */
	emitOutputSupport?:IEmitOutputSupport;

	/**
	 * Optional adapter to support detecting links.
	 */
	linkSupport?:ILinkSupport;

	/**
	 * Optional adapter to support configuring this mode.
	 */
	configSupport?:IConfigurationSupport;

	/**
	 * Optional adapter to support electric characters.
	 */
	electricCharacterSupport?:IElectricCharacterSupport;

	/**
	 * Optional adapter to support comment insertion.
	 */
	commentsSupport?:ICommentsSupport;

	/**
	 * Optional adapter to support insertion of character pair.
	 */
	characterPairSupport?:ICharacterPairSupport;

	/**
	 * Optional adapter to support classification of tokens.
	 */
	tokenTypeClassificationSupport?:ITokenTypeClassificationSupport;

	/**
	 * Optional adapter to support quick fix of typing errors.
	 */
	quickFixSupport?:IQuickFixSupport;

	/**
	 * Optional adapter to show code lens
	 */
	codeLensSupport?:ICodeLensSupport;

	/**
	 * Optional adapter to support renaming
	 */
	renameSupport?: IRenameSupport;

	/**
	 * Optional adapter to support task running
	 */
	taskSupport?: ITaskSupport;

	onEnterSupport?: IOnEnterSupport;
}

/**
 * Interface used for tokenization
 */
export interface IToken {
	startIndex:number;
	type:string;
	bracket:Bracket;
}

export interface IModeTransition {
	startIndex: number;
	mode: IMode;
}

export interface ILineTokens {
	tokens: IToken[];
	actualStopOffset: number;
	endState: IState;
	modeTransitions: IModeTransition[];
	retokenize?:TPromise<void>;
}

export interface ITokenizationSupport {

	shouldGenerateEmbeddedModels: boolean;

	getInitialState():IState;

	// add offsetDelta to each of the returned indices
	// stop tokenizing at absolute value stopAtOffset (i.e. stream.pos() + offsetDelta > stopAtOffset)
	tokenize(line:string, state:IState, offsetDelta?:number, stopAtOffset?:number):ILineTokens;
}

/**
 * Interface used to get extra info for a symbol
 */
export interface IComputeExtraInfoResult {
	range: EditorCommon.IRange;
	value?: string;
	htmlContent?: IHTMLContentElement[];
	className?: string;
}
export interface IExtraInfoSupport {
	computeInfo(resource:URI, position:EditorCommon.IPosition):TPromise<IComputeExtraInfoResult>;
}


export interface ISuggestion {
	label: string;
	codeSnippet: string;
	type: string;
	typeLabel?: string;
	documentationLabel?: string;
	filterText?: string;
	sortText?: string;
	noAutoAccept?: boolean;
	overwriteBefore?: number;
	overwriteAfter?: number;
}

export interface ISuggestResult {
	currentWord: string;
	suggestions:ISuggestion[];
	incomplete?: boolean;
}

export interface ISuggestionFilter {
	// Should return whether `suggestion` is a good suggestion for `word`
	(word: string, suggestion: ISuggestion): IMatch[];
}

export interface ISuggestionCompare {
	(one: ISuggestion, other: ISuggestion): number;
}

/**
 * Interface used to get completion suggestions at a specific location.
 */
export interface ISuggestSupport {

	/**
	 * Compute all completions for the given resource at the given position.
	 */
	suggest(resource: URI, position: EditorCommon.IPosition, triggerCharacter?: string): TPromise<ISuggestResult[]>;

	/**
	 * Compute more details for the given suggestion.
	 */
	getSuggestionDetails?:(resource:URI, position:EditorCommon.IPosition, suggestion:ISuggestion)=>TPromise<ISuggestion>;

	getFilter():ISuggestionFilter;
	getSorter?():ISuggestionCompare;
	getTriggerCharacters():string[];
	shouldShowEmptySuggestionList():boolean;
	shouldAutotriggerSuggest(context:ILineContext, offset:number, triggeredByCharacter:string):boolean;
}

/**
 * Interface used to quick fix typing errors while accesing member fields.
 */
export interface IQuickFix {
	command: ICommand;
	score: number;
}

export interface IQuickFixResult {
	edits?: IResourceEdit[];
	message?: string;
}

export interface IQuickFixSupport {
	getQuickFixes(resource: URI, range: IMarker | EditorCommon.IRange): TPromise<IQuickFix[]>;
	//TODO@joh this should be removed in the furture such that we can trust the command and it's args
	runQuickFixAction(resource: URI, range: EditorCommon.IRange, quickFix: IQuickFix):TPromise<IQuickFixResult>;
}

export interface IParameter {
	label:string;
	documentation?:string;
	signatureLabelOffset?:number;
	signatureLabelEnd?:number;
}

export interface ISignature {
	label:string;
	documentation?:string;
	parameters:IParameter[];
}

export interface IParameterHints {
	currentSignature:number;
	currentParameter:number;
	signatures:ISignature[];
}

export interface IParameterHintsContribution {
	triggerCharacters: string[];
	excludeTokens: string[];
	getParameterHints: (resource: URI, position: EditorCommon.IPosition) => TPromise<IParameterHints>;
}

/**
 * Interface used to get parameter hints.
 */
export interface IParameterHintsSupport {
	getParameterHintsTriggerCharacters(): string[];
	shouldTriggerParameterHints(context: ILineContext, offset: number): boolean;
	getParameterHints(resource: URI, position: EditorCommon.IPosition, triggerCharacter?: string): TPromise<IParameterHints>;
}


export interface IOccurence {
	kind?:string;
	range:EditorCommon.IRange;
}

/**
 * Interface used to find occurrences of a symbol
 */
export interface IOccurrencesSupport {
	findOccurrences(resource:URI, position:EditorCommon.IPosition, strict?:boolean):TPromise<IOccurence[]>;
}


/**
 * Interface used to find declarations on a symbol
 */
export interface IReference {
	resource: URI;
	range: EditorCommon.IRange;
}

/**
 * Interface used to find references to a symbol
 */
export interface IReferenceSupport {

	/**
	 * @returns true if on the given line (and its tokens) at the given
	 * 	offset reference search can be invoked.
	 */
	canFindReferences(context:ILineContext, offset:number):boolean;

	/**
	 * @returns a list of reference of the symbol at the position in the
	 * 	given resource.
	 */
	findReferences(resource:URI, position:EditorCommon.IPosition, includeDeclaration:boolean):TPromise<IReference[]>;
}

/**
 * Interface used to find declarations on a symbol
 */
export interface IDeclarationSupport {
	canFindDeclaration(context:ILineContext, offset:number):boolean;
	findDeclaration(resource:URI, position:EditorCommon.IPosition):TPromise<IReference|IReference[]>;
}

export interface ITypeDeclarationSupport {
	canFindTypeDeclaration(context:ILineContext, offset:number):boolean;
	findTypeDeclaration(resource:URI, position:EditorCommon.IPosition):TPromise<IReference>;
}

/**
 * Interface used to compute an outline
 */
export interface IOutlineEntry {
	label: string;
	containerLabel?: string;
	type: string;
	icon?: string; // icon class or null to use the default images based on the type
	range: EditorCommon.IRange;
	children?: IOutlineEntry[];
}

export interface IOutlineSupport {
	getOutline(resource:URI):TPromise<IOutlineEntry[]>;
	outlineGroupLabel?: { [name: string]: string; };
}

/**
 * Interface used to compute a hierachry of logical ranges.
 */
export interface ILogicalSelectionEntry {
	type:string;
	range:EditorCommon.IRange;
}
export interface ILogicalSelectionSupport {
	getRangesToPosition(resource:URI, position:EditorCommon.IPosition):TPromise<ILogicalSelectionEntry[]>;
}

/**
 * Interface used to format a model
 */
export interface IFormattingOptions {
	tabSize:number;
	insertSpaces:boolean;
}

/**
 * Supports to format source code. There are three levels
 * on which formatting can be offered:
 * (1) format a document
 * (2) format a selectin
 * (3) format on keystroke
 */
export interface IFormattingSupport {

	formatDocument?: (resource: URI, options: IFormattingOptions) => TPromise<EditorCommon.ISingleEditOperation[]>;

	formatRange?: (resource: URI, range: EditorCommon.IRange, options: IFormattingOptions) => TPromise<EditorCommon.ISingleEditOperation[]>;

	autoFormatTriggerCharacters?: string[];

	formatAfterKeystroke?: (resource: URI, position: EditorCommon.IPosition, ch: string, options: IFormattingOptions) => TPromise<EditorCommon.ISingleEditOperation[]>;
}

export interface IInplaceReplaceSupportResult {
	value: string;
	range:EditorCommon.IRange;
}

/**
 * Interface used to navigate with a value-set.
 */
export interface IInplaceReplaceSupport {
	navigateValueSet(resource:URI, range:EditorCommon.IRange, up:boolean):TPromise<IInplaceReplaceSupportResult>;
}


/**
 * Interface used to compute the diff between two models.
 */
export interface IDiffSupport {
	computeDiff(original:URI, modified:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.ILineChange[]>;
}


/**
 * Interface used to compute the diff between a model and its original version.
 */
export interface IDirtyDiffSupport {
	computeDirtyDiff(resource:URI, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]>;
}

/**
 * Interface used to get output for a language that supports transformation (e.g. markdown -> html)
 */
export interface IEmitOutputSupport {
	getEmitOutput(resource:URI):TPromise<IEmitOutput>;
}

export interface IEmitOutput {
	filename?:string;
	content:string;
}

/**
 * Interface used to detect links.
 */
export interface ILink {

	range: EditorCommon.IRange;

	/**
	 * The url of the link.
	 * The url should be absolute and will not get any special treatment.
	 */
	url: string;

	extraInlineClassName?: string;
}

export interface ILinkSupport {
	computeLinks(resource:URI):TPromise<ILink[]>;
}

/**
 * Interface used to define a configurable editor mode.
 */
export interface IConfigurationSupport {
	configure(options:any):TPromise<boolean>;
}




/**
 * Interface used to support electric characters
 */
export interface IElectricAction {
	// Only one of the following properties should be defined:

	// The line will be indented at the same level of the line
	// which contains the matching given bracket type.
	matchBracketType?:string;

	// The text will be appended after the electric character.
	appendText?:string;

	// The number of characters to advance the cursor, useful with appendText
	advanceCount?:number;
}

export enum IndentAction {
	None,
	Indent,
	IndentOutdent,
	Outdent
}

/**
 * An action the editor executes when 'enter' is being pressed
 */
export interface IEnterAction {
	indentAction:IndentAction;
	appendText?:string;
	removeText?:number;
}

export interface IElectricCharacterSupport {
	getElectricCharacters():string[];
	// Should return opening bracket type to match indentation with
	onElectricCharacter(context:ILineContext, offset:number):IElectricAction;
	onEnter(context:ILineContext, offset:number):IEnterAction;
}

export interface IOnEnterSupport {
	onEnter(model:EditorCommon.ITokenizedModel, position: EditorCommon.IPosition): IEnterAction;
}

/**
 * Interface used to support insertion of mode specific comments.
 */
export interface ICommentsConfiguration {
	lineCommentTokens?:string[];
	blockCommentStartToken?:string;
	blockCommentEndToken?:string;
}
export interface ICommentsSupport {
	getCommentsConfiguration():ICommentsConfiguration;
}



/**
 * Interface used to support insertion of matching characters like brackets and qoutes.
 */
export interface IAutoClosingPair {
	open:string;
	close:string;
}
export interface ICharacterPairSupport {
	getAutoClosingPairs():IAutoClosingPairConditional[];
	shouldAutoClosePair(character:string, context:ILineContext, offset:number):boolean;
	getSurroundingPairs():IAutoClosingPair[];
}

/**
 * Interface used to support the classification of tokens.
 */
export interface ITokenTypeClassificationSupport {
	getWordDefinition():RegExp;
}

export interface IResourceEdit {
	resource: URI;
	range?: EditorCommon.IRange;
	newText: string;
}

export interface IRenameResult {
	currentName: string;
	edits: IResourceEdit[];
	rejectReason?: string;
}

/**
 * Interface used to support renaming of symbols
 */
export interface IRenameSupport {

	filter?: string[];

	rename(resource: URI, position: EditorCommon.IPosition, newName: string): TPromise<IRenameResult>;
}

export interface ICommand {
	id: string;
	title: string;
	arguments?: any[];
}

export interface ICodeLensSymbol {
	range: EditorCommon.IRange;
	id?: string;
	command?: ICommand;
}

/**
 * Interface used for the code lense support
 */
export interface ICodeLensSupport {
	findCodeLensSymbols(resource: URI): TPromise<ICodeLensSymbol[]>;
	resolveCodeLensSymbol(resource: URI, symbol: ICodeLensSymbol): TPromise<ICodeLensSymbol>;
}

export interface ITaskSummary {
}

/**
 * Interface to support building via a langauge service
 */
export interface ITaskSupport {
	build?():TPromise<ITaskSummary>;
	rebuild?():TPromise<ITaskSummary>;
	clean?():TPromise<void>;
}

/**
 * Standard brackets used for auto indentation
 */
export interface IBracketPair {
	tokenType:string;
	open:string;
	close:string;
	isElectric:boolean;
}

/**
 * Regular expression based brackets. These are always electric.
 */
export interface IRegexBracketPair {
	openTrigger?: string; // The character that will trigger the evaluation of 'open'.
	open: RegExp; // The definition of when an opening brace is detected. This regex is matched against the entire line upto, and including the last typed character (the trigger character).
	closeComplete?: string; // How to complete a matching open brace. Matches from 'open' will be expanded, e.g. '</$1>'
	matchCase?: boolean; // If set to true, the case of the string captured in 'open' will be detected an applied also to 'closeComplete'.
						// This is useful for cases like BEGIN/END or begin/end where the opening and closing phrases are unrelated.
						// For identical phrases, use the $1 replacement syntax above directly in closeComplete, as it will
						// include the proper casing from the captured string in 'open'.
						// Upper/Lower/Camel cases are detected. Camel case dection uses only the first two characters and assumes
						// that 'closeComplete' contains wors separated by spaces (e.g. 'End Loop')

	closeTrigger?: string; // The character that will trigger the evaluation of 'close'.
	close?: RegExp; // The definition of when a closing brace is detected. This regex is matched against the entire line upto, and including the last typed character (the trigger character).
	tokenType?: string; // The type of the token. Matches from 'open' or 'close' will be expanded, e.g. 'keyword.$1'.
					// Only used to auto-(un)indent a closing bracket.
}

/**
 * Definition of documentation comments (e.g. Javadoc/JSdoc)
 */
export interface IDocComment {
	scope: string; // What tokens should be used to detect a doc comment (e.g. 'comment.documentation').
	open: string; // The string that starts a doc comment (e.g. '/**')
	lineStart: string; // The string that appears at the start of each line, except the first and last (e.g. ' * ').
	close?: string; // The string that appears on the last line and closes the doc comment (e.g. ' */').
}

export interface IAutoClosingPairConditional extends IAutoClosingPair {
	notIn?: string[];
}

export interface ICharacterPairContribution {
	autoClosingPairs: IAutoClosingPairConditional[];
	surroundingPairs?: IAutoClosingPair[];
}