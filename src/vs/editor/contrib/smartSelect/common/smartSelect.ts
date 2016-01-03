/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Arrays = require('vs/base/common/arrays');
import {TPromise} from 'vs/base/common/winjs.base';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import TokenSelectionSupport = require('./tokenSelectionSupport');
import tokenTree = require('./tokenTree');
import {Range} from 'vs/editor/common/core/range';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation'
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

// --- selection state machine

class State {

	public editor:EditorCommon.ICommonCodeEditor;
	public next:State;
	public previous:State;
	public selection:EditorCommon.IEditorRange;

	constructor(editor:EditorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.next = null;
		this.previous = null;
		this.selection = editor.getSelection();
	}
}

// --- shared state between grow and shrink actions
var state:State = null;
var ignoreSelection = false;

// -- action implementation

class SmartSelect extends EditorAction {

	private _forward: boolean;
	private _tokenSelectionSupport: TokenSelectionSupport;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, forward: boolean, instantiationService: IInstantiationService) {
		super(descriptor, editor, Behaviour.TextFocus | Behaviour.UpdateOnModelChange);
		this._tokenSelectionSupport = instantiationService.createInstance(TokenSelectionSupport);
		this._forward = forward;
	}

	public run(): TPromise<boolean> {

		var selection = this.editor.getSelection();
		var model = this.editor.getModel();
		var selectionSupport = model.getMode().logicalSelectionSupport || this._tokenSelectionSupport;

		// forget about current state
		if (state) {
			if (state.editor !== this.editor) {
				state = null;
			}
		}

		var promise:TPromise<void> = TPromise.as(null);
		if (!state) {

			promise = selectionSupport.getRangesToPosition(model.getAssociatedResource(), selection.getStartPosition()).then((elements: Modes.ILogicalSelectionEntry[]) => {

				if (Arrays.isFalsyOrEmpty(elements)) {
					return;
				}

				var lastState: State;
				elements.filter((element) => {
					// filter ranges inside the selection
					var selection = this.editor.getSelection();
					var range = new Range(element.range.startLineNumber, element.range.startColumn, element.range.endLineNumber, element.range.endColumn);
					return range.containsPosition(selection.getStartPosition()) && range.containsPosition(selection.getEndPosition());

				}).forEach((element) => {
					// create ranges
					var range = element.range;
					var state = new State(this.editor);
					state.selection = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
					if (lastState) {
						state.next = lastState;
						lastState.previous = state;
					}
					lastState = state;
				});

				// insert current selection
				var editorState = new State(this.editor);
				editorState.next = lastState;
				if (lastState) {
					lastState.previous = editorState;
				}
				state = editorState;

				// listen to caret move and forget about state
				var unhook: () => void = this.editor.addListener(EditorCommon.EventType.CursorPositionChanged,(e: EditorCommon.ICursorPositionChangedEvent) => {
					if (ignoreSelection) {
						return;
					}
					state = null;
					unhook();
				});
			});
		}

		return promise.then(() => {

			if (!state) {
				return;
			}

			state = this._forward ? state.next : state.previous;
			if (!state) {
				return;
			}

			ignoreSelection = true;
			try {
				this.editor.setSelection(state.selection);
			} finally {
				ignoreSelection = false;
			}

			return true;
		});
	}
}

class GrowSelectionAction extends SmartSelect {

	public static ID = 'editor.action.smartSelect.grow';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		super(descriptor, editor, true, instantiationService);
	}
}

class ShrinkSelectionAction extends SmartSelect {

	public static ID = 'editor.action.smartSelect.shrink';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		super(descriptor, editor, false, instantiationService);
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(GrowSelectionAction, GrowSelectionAction.ID, nls.localize('smartSelect.grow', "Expand Select"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.RightArrow }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ShrinkSelectionAction, ShrinkSelectionAction.ID, nls.localize('smartSelect.shrink', "Shrink Select"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.LeftArrow }
}));
