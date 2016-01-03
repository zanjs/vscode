/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Model = require('./parameterHintsModel');
import Widget = require('./parameterHintsWidget');
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {ParameterHintsRegistry} from '../common/parameterHints';

class ParameterHintsController implements EditorCommon.IEditorContribution {
	static ID = 'editor.controller.parameterHints';

	public static get(editor:EditorCommon.ICommonCodeEditor): ParameterHintsController {
		return <ParameterHintsController>editor.getContribution(ParameterHintsController.ID);
	}

	private editor:EditorBrowser.ICodeEditor;
	private model: Model.ParameterHintsModel;
	private widget: Widget.ParameterHintsWidget;
	private parameterHintsVisible: IKeybindingContextKey<boolean>;

	constructor(editor:EditorBrowser.ICodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		this.editor = editor;
		this.model = new Model.ParameterHintsModel(this.editor);
		this.parameterHintsVisible = keybindingService.createKey(CONTEXT_PARAMETER_HINTS_VISIBLE, false);
		this.widget = new Widget.ParameterHintsWidget(this.model, this.editor, () => {
			this.parameterHintsVisible.set(true);
		}, () => {
			this.parameterHintsVisible.reset();
		});
	}

	public dispose(): void {
		this.model.dispose();
		this.model = null;

		this.widget.destroy();
		this.widget = null;
	}

	public getId(): string {
		return ParameterHintsController.ID;
	}

	public closeWidget(): void {
		this.widget.cancel();
	}

	public showPrevHint(): void {
		this.widget.selectPrevious();
	}

	public showNextHint(): void {
		this.widget.selectNext();
	}

	public trigger(): void {
		this.model.trigger(undefined, 0);
	}
}

export class TriggerParameterHintsAction extends EditorAction {

	static ID = 'editor.action.triggerParameterHints';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public isSupported(): boolean {
		return ParameterHintsRegistry.has(this.editor.getModel()) && super.isSupported();
	}

	public run():TPromise<boolean> {
		ParameterHintsController.get(this.editor).trigger();
		return TPromise.as(true);
	}
}

var CONTEXT_PARAMETER_HINTS_VISIBLE = 'parameterHintsVisible';

var weight = CommonEditorRegistry.commandWeight(75);

EditorBrowserRegistry.registerEditorContribution(ParameterHintsController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(TriggerParameterHintsAction, TriggerParameterHintsAction.ID, nls.localize('parameterHints.trigger.label', "Trigger Parameter Hints"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space
}));
CommonEditorRegistry.registerEditorCommand('closeParameterHints', weight, { primary: KeyCode.Escape }, true, CONTEXT_PARAMETER_HINTS_VISIBLE,(ctx, editor, args) => {
	ParameterHintsController.get(editor).closeWidget();
});
CommonEditorRegistry.registerEditorCommand('showPrevParameterHint', weight, { primary: KeyCode.UpArrow }, true, CONTEXT_PARAMETER_HINTS_VISIBLE,(ctx, editor, args) => {
	ParameterHintsController.get(editor).showPrevHint();
});
CommonEditorRegistry.registerEditorCommand('showNextParameterHint', weight, { primary: KeyCode.DownArrow }, true, CONTEXT_PARAMETER_HINTS_VISIBLE,(ctx, editor, args) => {
	ParameterHintsController.get(editor).showNextHint();
});
