/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import keyboardController = require('vs/base/browser/keyboardController');
import DomUtils = require('vs/base/browser/dom');
import Platform = require('vs/base/common/platform');
import Browser = require('vs/base/browser/browser');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EventEmitter = require('vs/base/common/eventEmitter');
import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import Schedulers = require('vs/base/common/async');
import Lifecycle = require('vs/base/common/lifecycle');
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {CommonKeybindings} from 'vs/base/common/keyCodes';

enum ReadFromTextArea {
	Type,
	Paste
}

class TextAreaState {
	private value:string;
	private selectionStart:number;
	private selectionEnd:number;
	private selectionToken:number;

	constructor(value:string, selectionStart:number, selectionEnd:number, selectionToken:number) {
		this.value = value;
		this.selectionStart = selectionStart;
		this.selectionEnd = selectionEnd;
		this.selectionToken = selectionToken;
	}

	public toString(): string {
		return '[ <' + this.value + '>, selectionStart: ' + this.selectionStart + ', selectionEnd: ' + this.selectionEnd + ']';
	}

	public static fromTextArea(textArea:HTMLTextAreaElement, selectionToken:number): TextAreaState {
		return new TextAreaState(textArea.value, textArea.selectionStart, textArea.selectionEnd, selectionToken);
	}

	public static fromEditorSelectionAndPreviousState(model:EditorCommon.IViewModel, selection:EditorCommon.IEditorRange, previousSelectionToken:number): TextAreaState {
		if (Browser.isIPad) {
			// Do not place anything in the textarea for the iPad
			return new TextAreaState('', 0, 0, selectionStartLineNumber);
		}

		var LIMIT_CHARS = 100;
		var PADDING_LINES_COUNT = 0;

		var selectionStartLineNumber = selection.startLineNumber,
			selectionStartColumn = selection.startColumn,
			selectionEndLineNumber = selection.endLineNumber,
			selectionEndColumn = selection.endColumn,
			selectionEndLineNumberMaxColumn = model.getLineMaxColumn(selectionEndLineNumber);

		// If the selection is empty and we have switched line numbers, expand selection to full line (helps Narrator trigger a full line read)
		if (selection.isEmpty() && previousSelectionToken !== selectionStartLineNumber) {
			selectionStartColumn = 1;
			selectionEndColumn = selectionEndLineNumberMaxColumn;
		}

		// `pretext` contains the text before the selection
		var pretext = '';
		var startLineNumber = Math.max(1, selectionStartLineNumber - PADDING_LINES_COUNT);
		if (startLineNumber < selectionStartLineNumber) {
			pretext = model.getValueInRange(new Range(startLineNumber, 1, selectionStartLineNumber, 1), EditorCommon.EndOfLinePreference.LF);
		}
		pretext += model.getValueInRange(new Range(selectionStartLineNumber, 1, selectionStartLineNumber, selectionStartColumn), EditorCommon.EndOfLinePreference.LF);
		if (pretext.length > LIMIT_CHARS) {
			pretext = pretext.substring(pretext.length - LIMIT_CHARS, pretext.length);
		}


		// `posttext` contains the text after the selection
		var posttext = '';
		var endLineNumber = Math.min(selectionEndLineNumber + PADDING_LINES_COUNT, model.getLineCount());
		posttext += model.getValueInRange(new Range(selectionEndLineNumber, selectionEndColumn, selectionEndLineNumber, selectionEndLineNumberMaxColumn), EditorCommon.EndOfLinePreference.LF);
		if (endLineNumber > selectionEndLineNumber) {
			posttext = '\n' + model.getValueInRange(new Range(selectionEndLineNumber + 1, 1, endLineNumber, model.getLineMaxColumn(endLineNumber)), EditorCommon.EndOfLinePreference.LF);
		}
		if (posttext.length > LIMIT_CHARS) {
			posttext = posttext.substring(0, LIMIT_CHARS);
		}


		// `text` contains the text of the selection
		var text = model.getValueInRange(new Range(selectionStartLineNumber, selectionStartColumn, selectionEndLineNumber, selectionEndColumn), EditorCommon.EndOfLinePreference.LF);
		if (text.length > 2 * LIMIT_CHARS) {
			text = text.substring(0, LIMIT_CHARS) + String.fromCharCode(8230) + text.substring(text.length - LIMIT_CHARS, text.length);
		}

		return new TextAreaState(pretext + text + posttext, pretext.length, pretext.length + text.length, selectionStartLineNumber);
	}

	public getSelectionStart(): number {
		return this.selectionStart;
	}

	public resetSelection(): void {
		this.selectionStart = this.value.length;
		this.selectionEnd = this.value.length;
	}

	public getValue(): string {
		return this.value;
	}

	public getSelectionToken(): number {
		return this.selectionToken;
	}

	public applyToTextArea(textArea:HTMLTextAreaElement, select:boolean): void {
		if (textArea.value !== this.value) {
			textArea.value = this.value;
		}
		if (select) {
			try {
				var scrollState = DomUtils.saveParentsScrollTop(textArea);
				textArea.focus();
				textArea.setSelectionRange(this.selectionStart, this.selectionEnd);
				DomUtils.restoreParentsScrollTop(textArea, scrollState);
			} catch(e) {
				// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
			}
		}
	}

	public extractNewText(previousState:TextAreaState): string {
		if (this.selectionStart !== this.selectionEnd) {
			// There is a selection in the textarea => ignore input
			return '';
		}
		if (!previousState) {
			return this.value;
		}
		var previousPrefix = previousState.value.substring(0, previousState.selectionStart);
		var previousSuffix = previousState.value.substring(previousState.selectionEnd, previousState.value.length);

		// In IE, pressing Insert will bring the typing into overwrite mode
		if (Browser.isIE11orEarlier && document.queryCommandValue('OverWrite')) {
			previousSuffix = previousSuffix.substr(1);
		}

		var value = this.value;
		if (value.substring(0, previousPrefix.length) === previousPrefix) {
			value = value.substring(previousPrefix.length);
		}
		if (value.substring(value.length - previousSuffix.length, value.length) === previousSuffix) {
			value = value.substring(0, value.length - previousSuffix.length);
		}
		return value;
	}
}

export class KeyboardHandler extends ViewEventHandler implements Lifecycle.IDisposable {

	private context:EditorBrowser.IViewContext;
	private viewController:EditorBrowser.IViewController;
	private viewHelper:EditorBrowser.IKeyboardHandlerHelper;
	private textArea:HTMLTextAreaElement;
	private selection:EditorCommon.IEditorRange;
	private hasFocus:boolean;
	private kbController:keyboardController.IKeyboardController;
	private listenersToRemove:EventEmitter.ListenerUnbind[];

	private asyncReadFromTextArea: Schedulers.RunOnceScheduler;
	private asyncSetSelectionToTextArea: Schedulers.RunOnceScheduler;
	private asyncTriggerCut: Schedulers.RunOnceScheduler;

	// keypress, paste & composition end also trigger an input event
	// the popover input method on macs triggers only an input event
	// in this case the expectInputTime would be too much in the past
	private justHadAPaste:boolean;
	private justHadACut:boolean;
	private lastKeyPressTime:number;
	private lastCompositionEndTime:number;
	private lastValueWrittenToTheTextArea:string;
	private cursorPosition:EditorCommon.IEditorPosition;
	private contentLeft:number;
	private contentWidth:number;
	private scrollLeft:number;

	private previousSetTextAreaState:TextAreaState;
	private textareaIsShownAtCursor: boolean;

	private lastCopiedValue: string;
	private lastCopiedValueIsFromEmptySelection: boolean;

	constructor(context:EditorBrowser.IViewContext, viewController:EditorBrowser.IViewController, viewHelper:EditorBrowser.IKeyboardHandlerHelper) {
		super();

		this.context = context;
		this.viewController = viewController;
		this.textArea = viewHelper.textArea;
		this.viewHelper = viewHelper;
		this.selection = new Range(1, 1, 1, 1);
		this.cursorPosition = new Position(1, 1);
		this.contentLeft = 0;
		this.contentWidth = 0;
		this.scrollLeft = 0;

		this.asyncReadFromTextArea = new Schedulers.RunOnceScheduler(null, 0);
		this.asyncSetSelectionToTextArea = new Schedulers.RunOnceScheduler(() => this._writePlaceholderAndSelectTextArea(), 0);
		this.asyncTriggerCut = new Schedulers.RunOnceScheduler(() => this._triggerCut(), 0);

		this.lastCopiedValue = null;
		this.lastCopiedValueIsFromEmptySelection = false;
		this.previousSetTextAreaState = null;

		this.hasFocus = false;

		this.justHadAPaste = false;
		this.justHadACut = false;
		this.lastKeyPressTime = 0;
		this.lastCompositionEndTime = 0;
		this.lastValueWrittenToTheTextArea = '';

		this.kbController = new keyboardController.KeyboardController(this.textArea);

		this.listenersToRemove = [];

		this.listenersToRemove.push(this.kbController.addListener('keydown', (e) => this._onKeyDown(e)));
		this.listenersToRemove.push(this.kbController.addListener('keyup', (e) => this._onKeyUp(e)));
		this.listenersToRemove.push(this.kbController.addListener('keypress', (e) => this._onKeyPress(e)));
//		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'change', (e) => this._scheduleLookout(EditorCommon.Handler.Type)));

		this.textareaIsShownAtCursor = false;

		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'compositionstart', (e) => {
			var timeSinceLastCompositionEnd = (new Date().getTime()) - this.lastCompositionEndTime;
			if (!this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = true;
				this.showTextAreaAtCursor(timeSinceLastCompositionEnd >= 100);
			}
			this.asyncReadFromTextArea.cancel();
		}));

		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'compositionend', (e) => {
			if (this.textareaIsShownAtCursor) {
				this.textareaIsShownAtCursor = false;
				this.hideTextArea();
			}
			this.lastCompositionEndTime = (new Date()).getTime();
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
		}));

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (Browser.isIPad) {
			this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'input', (e) => {
				var myTime = (new Date()).getTime();
				// A keypress will trigger an input event (very quickly)
				var keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					this._scheduleReadFromTextArea(ReadFromTextArea.Type);
					this.lastKeyPressTime = 0;
				}
			}));
		}

		// on the mac the character viewer input generates an input event (no keypress)
		// on windows, the Chinese IME, when set to insert wide punctuation generates an input event (no keypress)
		this.listenersToRemove.push(this.kbController.addListener('input', (e) => {
			// Ignore input event if we are in composition mode
			if (!this.textareaIsShownAtCursor) {
				this._scheduleReadFromTextArea(ReadFromTextArea.Type);
			}
		}));

		if (Platform.isMacintosh) {

			this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'input', (e) => {

				// We are fishing for the input event that comes in the mac popover input method case


				// A paste will trigger an input event, but the event might happen very late
				if (this.justHadAPaste) {
					this.justHadAPaste = false;
					return;
				}

				// A cut will trigger an input event, but the event might happen very late
				if (this.justHadACut) {
					this.justHadACut = false;
					return;
				}

				var myTime = (new Date()).getTime();

				// A keypress will trigger an input event (very quickly)
				var keyPressDeltaTime = myTime - this.lastKeyPressTime;
				if (keyPressDeltaTime <= 500) {
					return;
				}

				// A composition end will trigger an input event (very quickly)
				var compositionEndDeltaTime = myTime - this.lastCompositionEndTime;
				if (compositionEndDeltaTime <= 500) {
					return;
				}

				// Ignore input if we are in the middle of a composition
				if (this.textareaIsShownAtCursor) {
					return;
				}

				// Ignore if the textarea has selection
				if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
					return;
				}

				// In Chrome, only the first character gets replaced, while in Safari the entire line gets replaced
				var typedText:string;
				var textAreaValue = this.textArea.value;

				if (!Browser.isChrome) {
					// TODO: Also check this on Safari & FF before removing this
					return;
				}

				if (this.lastValueWrittenToTheTextArea.length !== textAreaValue.length) {
					return;
				}

				var prefixLength = Strings.commonPrefixLength(this.lastValueWrittenToTheTextArea, textAreaValue);
				var suffixLength = Strings.commonSuffixLength(this.lastValueWrittenToTheTextArea, textAreaValue);

				if (prefixLength + suffixLength + 1 !== textAreaValue.length) {
					return;
				}

				typedText = textAreaValue.charAt(prefixLength);

				this.executeReplacePreviousChar(typedText);

				this.previousSetTextAreaState = TextAreaState.fromTextArea(this.textArea, 0);
				this.asyncSetSelectionToTextArea.schedule();
			}));
		}




		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'cut', (e) => this._onCut(e)));
		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'copy', (e) => this._onCopy(e)));
		this.listenersToRemove.push(DomUtils.addListener(this.textArea, 'paste', (e) => this._onPaste(e)));

		this._writePlaceholderAndSelectTextArea();

		this.context.addEventHandler(this);
	}

	public dispose(): void {
		this.context.removeEventHandler(this);
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
		this.kbController.dispose();
		this.asyncReadFromTextArea.dispose();
		this.asyncSetSelectionToTextArea.dispose();
		this.asyncTriggerCut.dispose();
	}

	private showTextAreaAtCursor(emptyIt:boolean): void {

		var interestingLineNumber:number,
			interestingColumn1:number,
			interestingColumn2:number;

		// In IE we cannot set .value when handling 'compositionstart' because the entire composition will get canceled.
		if (Browser.isIE11orEarlier) {
			// Ensure selection start is in viewport
			interestingLineNumber = this.selection.startLineNumber;
			interestingColumn1 = this.selection.startColumn;
			interestingColumn2 = this.previousSetTextAreaState.getSelectionStart() + 1;
		} else {
			// Ensure primary cursor is in viewport
			interestingLineNumber = this.cursorPosition.lineNumber;
			interestingColumn1 = this.cursorPosition.column;
			interestingColumn2 = interestingColumn1;
		}

		// Ensure range is in viewport
		var revealInterestingColumn1Event:EditorCommon.IViewRevealRangeEvent = {
			range: new Range(interestingLineNumber, interestingColumn1, interestingLineNumber, interestingColumn1),
			verticalType: EditorCommon.VerticalRevealType.Simple,
			revealHorizontal: true
		};
		this.context.privateViewEventBus.emit(EditorCommon.ViewEventNames.RevealRangeEvent, revealInterestingColumn1Event);

		// Find range pixel position
		var visibleRange1 = this.viewHelper.visibleRangeForPositionRelativeToEditor(interestingLineNumber, interestingColumn1);
		var visibleRange2 = this.viewHelper.visibleRangeForPositionRelativeToEditor(interestingLineNumber, interestingColumn2);

		if (Browser.isIE11orEarlier) {
			// Position textarea at the beginning of the line
			if (visibleRange1 && visibleRange2) {
				this.textArea.style.top = visibleRange1.top + 'px';
				this.textArea.style.left = this.contentLeft + visibleRange1.left - visibleRange2.left - this.scrollLeft + 'px';
				this.textArea.style.width = this.contentWidth + 'px';
			}
		} else {
			// Position textarea at cursor location
			if (visibleRange1) {
				this.textArea.style.left = this.contentLeft + visibleRange1.left - this.scrollLeft + 'px';
				this.textArea.style.top = visibleRange1.top + 'px';
			}

			// Empty the textarea
			if (emptyIt) {
				this.setTextAreaState(new TextAreaState('', 0, 0, 0), false);
			}
		}

		// Show the textarea
		this.textArea.style.height = this.context.configuration.editor.lineHeight + 'px';
		DomUtils.addClass(this.viewHelper.viewDomNode, 'ime-input');
	}

	private hideTextArea(): void {
		this.textArea.style.height = '';
		this.textArea.style.width = '';
		this.textArea.style.left = '0px';
		this.textArea.style.top = '0px';
		DomUtils.removeClass(this.viewHelper.viewDomNode, 'ime-input');
	}

	// --- begin event handlers

	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this.scrollLeft = e.scrollLeft;
		return false;
	}

	public onViewFocusChanged(isFocused:boolean): boolean {
		this.hasFocus = isFocused;
		if (this.hasFocus) {
			this.asyncSetSelectionToTextArea.schedule();
		}
		return false;
	}

	public onCursorSelectionChanged(e:EditorCommon.IViewCursorSelectionChangedEvent): boolean {
		this.selection = e.selection;
		this.asyncSetSelectionToTextArea.schedule();
		return false;
	}

	public onCursorPositionChanged(e:EditorCommon.IViewCursorPositionChangedEvent): boolean {
		this.cursorPosition = e.position;
		return false;
	}

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		this.contentLeft = layoutInfo.contentLeft;
		this.contentWidth = layoutInfo.contentWidth;
		return false;
	}

	// --- end event handlers

	private setTextAreaState(textAreaState:TextAreaState, select:boolean): void {
		// IE doesn't like calling select on a hidden textarea and the textarea is hidden during the tests
		var shouldSetSelection = select && this.hasFocus;

		if (!shouldSetSelection) {
			textAreaState.resetSelection();
		}

		this.lastValueWrittenToTheTextArea = textAreaState.getValue();
		textAreaState.applyToTextArea(this.textArea, shouldSetSelection);

		this.previousSetTextAreaState = textAreaState;
	}

	private _onKeyDown(e:DomUtils.IKeyboardEvent): void {
		if (e.equals(CommonKeybindings.ESCAPE)) {
			// Prevent default always for `Esc`, otherwise it will generate a keypress
			// See http://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
			e.preventDefault();
		}
		this.viewController.emitKeyDown(e);
		// Work around for issue spotted in electron on the mac
		// TODO@alex: check if this issue exists after updating electron
		// Steps:
		//  * enter a line at an offset
		//  * go down to a line with [
		//  * go up, go left, go right
		//  => press ctrl+h => a keypress is generated even though the keydown is prevent defaulted
		// Another case would be if focus goes outside the app on keydown (spotted under windows)
		// Steps:
		//  * press Ctrl+K
		//  * press R
		//  => focus moves out while keydown is not finished
		setTimeout(() => {
			// cancel reading if previous keydown was canceled, but a keypress/input were still generated
			if (e.browserEvent && e.browserEvent.defaultPrevented) {
				// this._scheduleReadFromTextArea
				this.asyncReadFromTextArea.cancel();
				this.asyncSetSelectionToTextArea.schedule();
			}
		}, 0);
	}

	private _onKeyUp(e:DomUtils.IKeyboardEvent): void {
		this.viewController.emitKeyUp(e);
	}

	private _onKeyPress(e:DomUtils.IKeyboardEvent): void {
		if (!this.hasFocus) {
			// Sometimes, when doing Alt-Tab, in FF, a 'keypress' is sent before a 'focus'
			return;
		}

		this.lastKeyPressTime = (new Date()).getTime();

		// on the iPad the text area is not fast enough to get the content of the keypress,
		// so we leverage the input event instead
		if (!Browser.isIPad) {
			this._scheduleReadFromTextArea(ReadFromTextArea.Type);
		}
	}

	// ------------- Operations that are always executed asynchronously

	private _scheduleReadFromTextArea(command:ReadFromTextArea): void {
		this.asyncSetSelectionToTextArea.cancel();
		this.asyncReadFromTextArea.setRunner(() => this._readFromTextArea(command));
		this.asyncReadFromTextArea.schedule();
	}

	/**
	 * Read text from textArea and trigger `command` on the editor
	 */
	private _readFromTextArea(command:ReadFromTextArea): void {
		var previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
		var observedState = TextAreaState.fromTextArea(this.textArea, previousSelectionToken);
		var txt = observedState.extractNewText(this.previousSetTextAreaState);

		if (txt !== '') {
			if (command === ReadFromTextArea.Type) {
//				console.log("deduced input:", txt);
				this.executeType(txt);
			} else {
				this.executePaste(txt);
			}
		}

		this.previousSetTextAreaState = observedState;
		this.asyncSetSelectionToTextArea.schedule();
	}

	private executePaste(txt:string): void {
		if(txt === '') {
			return;
		}

		var pasteOnNewLine = false;
		if (Browser.enableEmptySelectionClipboard) {
			pasteOnNewLine = (txt === this.lastCopiedValue && this.lastCopiedValueIsFromEmptySelection);
		}
		this.viewController.paste('keyboard', txt, pasteOnNewLine);
	}

	private executeType(txt:string): void {
		if(txt === '') {
			return;
		}

		this.viewController.type('keyboard', txt);
	}

	private executeReplacePreviousChar(txt: string): void {
		this.viewController.replacePreviousChar('keyboard', txt);
	}

	private _writePlaceholderAndSelectTextArea(): void {
		if (!this.textareaIsShownAtCursor) {
			// Do not write to the textarea if it is visible.
			var previousSelectionToken = this.previousSetTextAreaState ? this.previousSetTextAreaState.getSelectionToken() : 0;
			var newState = TextAreaState.fromEditorSelectionAndPreviousState(this.context.model, this.selection, previousSelectionToken);
			this.setTextAreaState(newState, true);
		}
	}

	// ------------- Clipboard operations

	private _onPaste(e:Event): void {
		if (e && (<any>e).clipboardData) {
			e.preventDefault();
			this.executePaste((<any>e).clipboardData.getData('text/plain'));
		} else if (e && (<any>window).clipboardData) {
			e.preventDefault();
			this.executePaste((<any>window).clipboardData.getData('Text'));
		} else {
			if (this.textArea.selectionStart !== this.textArea.selectionEnd) {
				// Clean up the textarea, to get a clean paste
				this.setTextAreaState(new TextAreaState('', 0, 0, 0), false);
			}
			this._scheduleReadFromTextArea(ReadFromTextArea.Paste);
		}
		this.justHadAPaste = true;
	}

	private _onCopy(e:Event): void {
		this._ensureClipboardGetsEditorSelection(e);
	}

	private _triggerCut(): void {
		this.viewController.cut('keyboard');
	}

	private _onCut(e:Event): void {
		this._ensureClipboardGetsEditorSelection(e);
		this.asyncTriggerCut.schedule();
		this.justHadACut = true;
	}

	private _ensureClipboardGetsEditorSelection(e:Event): void {
		var whatToCopy = this._getPlainTextToCopy();
		if (e && (<any>e).clipboardData) {
			(<any>e).clipboardData.setData('text/plain', whatToCopy);
//			(<any>e).clipboardData.setData('text/html', this._getHTMLToCopy());
			e.preventDefault();
		} else if (e && (<any>window).clipboardData) {
			(<any>window).clipboardData.setData('Text', whatToCopy);
			e.preventDefault();
		} else {
			this.setTextAreaState(new TextAreaState(whatToCopy, 0, whatToCopy.length, 0), true);
		}

		if (Browser.enableEmptySelectionClipboard) {
			if (Browser.isFirefox) {
				// When writing "LINE\r\n" to the clipboard and then pasting,
				// Firefox pastes "LINE\n", so let's work around this quirk
				this.lastCopiedValue = whatToCopy.replace(/\r\n/g, '\n');
			} else {
				this.lastCopiedValue = whatToCopy;
			}

			var selections = this.context.model.getSelections();
			this.lastCopiedValueIsFromEmptySelection = (selections.length === 1 && selections[0].isEmpty());
		}
	}

	private _getPlainTextToCopy(): string {
		var newLineCharacter = (Platform.isWindows ? '\r\n' : '\n');
		var eolPref = (Platform.isWindows ? EditorCommon.EndOfLinePreference.CRLF : EditorCommon.EndOfLinePreference.LF);
		var selections = this.context.model.getSelections();

		if (selections.length === 1) {
			var range:EditorCommon.IEditorRange = selections[0];
			if (range.isEmpty()) {
				if (Browser.enableEmptySelectionClipboard) {
					var modelLineNumber = this.context.model.convertViewPositionToModelPosition(range.startLineNumber, 1).lineNumber;
					return this.context.model.getModelLineContent(modelLineNumber) + newLineCharacter;
				} else {
					return '';
				}
			}

			return this.context.model.getValueInRange(range, eolPref);
		} else {
			selections = selections.slice(0).sort(Range.compareRangesUsingStarts);
			var result: string[] = [];
			for (var i = 0; i < selections.length; i++) {
				result.push(this.context.model.getValueInRange(selections[i], eolPref));
			}

			return result.join(newLineCharacter);
		}

	}

//	private static _getHTMLLine(model:Editor.IModel, lineNumber:number, startColumn:number, endColumn:number, output:string[]): void {
//		var lineText = model.getLineContent(lineNumber);
//		var tokens = model.getLineTokens(lineNumber);
//
//		if (lineText.length > 0) {
//			var charCode:number,
//				i:number,
//				len = lineText.length,
//				tokenIndex = -1,
//				nextTokenIndex = (tokens.length > tokenIndex + 1 ? tokens[tokenIndex + 1].startIndex : len);
//
//			for (i = 0; i < len; i++) {
//				if (i === nextTokenIndex) {
//					tokenIndex++;
//					nextTokenIndex = (tokens.length > tokenIndex + 1 ? tokens[tokenIndex + 1].startIndex : len);
//					if (i > 0) {
//						output.push('</span>');
//					}
//					output.push('<span class="token ');
//					output.push(tokens[tokenIndex].type.replace(/[^a-z0-9]/gi, ' '));
//					output.push('">');
//				}
//
//				charCode = lineText.charCodeAt(i);
//
//				if (charCode === _lowerThan) {
//					output.push('&lt;');
//				} else if (charCode === _greaterThan) {
//					output.push('&gt;');
//				} else if (charCode === _ampersand) {
//					output.push('&amp;');
//				} else {
//					output.push(lineText.charAt(i));
//				}
//			}
//		}
//	}
//
//	private _getHTMLToCopy(): string {
//		var range:Editor.IEditorRange = this.context.cursor.getSelection();
//		var append = '';
//		if (range.isEmpty()) {
//			var lineNumber = range.startLineNumber;
//			range = new Range(lineNumber, 1, lineNumber, this.context.model.getLineMaxColumn(lineNumber));
//			append = '\n';
//		}
//
//		var r:string[] = [];
//		for (var i = range.startLineNumber; i <= range.endLineNumber; i++) {
//			KeyboardHandler._getHTMLLine(this.context.model, i, 1, this.context.model.getLineMaxColumn(i), r);
//		}
//
//		console.log(r.join('') + append);
//
//		return r.join('') + append;
//	}
}

