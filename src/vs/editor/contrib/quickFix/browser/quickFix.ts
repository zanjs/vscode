/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {onUnexpectedError} from 'vs/base/common/errors';
import quickFixSelectionWidget = require('./quickFixSelectionWidget');
import quickFixModel = require('./quickFixModel');
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import Severity from 'vs/base/common/severity';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import codeEditorWidget = require('vs/editor/browser/widget/codeEditorWidget');
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {IEventService} from 'vs/platform/event/common/event';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IMessageService} from 'vs/platform/message/common/message';
import {bulkEdit} from 'vs/editor/common/services/bulkEdit';
import {QuickFixRegistry, IQuickFix2} from '../common/quickFix';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class QuickFixController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.quickFixController';

	static getQuickFixController(editor:EditorCommon.ICommonCodeEditor): QuickFixController {
		return <QuickFixController>editor.getContribution(QuickFixController.ID);
	}

	private eventService: IEventService;
	private editorService: IEditorService;
	private messageService: IMessageService;

	private editor:EditorBrowser.ICodeEditor;
	private model:quickFixModel.QuickFixModel;
	private suggestWidget: quickFixSelectionWidget.QuickFixSelectionWidget;
	private quickFixWidgetVisible: IKeybindingContextKey<boolean>;

	constructor(editor: EditorBrowser.ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEventService eventService: IEventService,
		@IEditorService editorService: IEditorService,
		@IMessageService messageService: IMessageService
	) {
		this.editor = editor;
		this.model = new quickFixModel.QuickFixModel(this.editor, markerService, this.onAccept.bind(this));
		this.eventService = eventService;
		this.editorService = editorService;
		this.messageService = messageService;

		this.quickFixWidgetVisible = keybindingService.createKey(CONTEXT_QUICK_FIX_WIDGET_VISIBLE, false);
		this.suggestWidget = new quickFixSelectionWidget.QuickFixSelectionWidget(this.editor, telemetryService,() => {
			this.quickFixWidgetVisible.set(true)
		},() => {
			this.quickFixWidgetVisible.reset();
		});
		this.suggestWidget.setModel(this.model);
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private onAccept(fix: IQuickFix2, range: EditorCommon.IRange): void {
		var model = this.editor.getModel();
		if (!model) {
			return;
		}

		fix.support.runQuickFixAction(this.editor.getModel().getAssociatedResource(), range, { command: fix.command, score: fix.score }).then(result => {
			if (result) {
				if (result.message) {
					this.messageService.show(Severity.Info, result.message);
				}
				if (result.edits) {
					return bulkEdit(this.eventService, this.editorService, this.editor, result.edits);
				}
			}
			return TPromise.as(0);
		}).done(undefined, err => {
			onUnexpectedError(err);
		});
	}

	public run():TPromise<boolean> {
		this.model.triggerDialog(false, this.editor.getPosition());
		this.editor.focus();

		return TPromise.as(false);
	}

	public dispose(): void {
		if (this.suggestWidget) {
			this.suggestWidget.destroy();
			this.suggestWidget = null;
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	public acceptSelectedSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.acceptSelectedSuggestion();
		}
	}
	public closeWidget(): void {
		if (this.model) {
			this.model.cancelDialog();
		}
	}
	public selectNextSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNext();
		}
	}
	public selectNextPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNextPage();
		}
	}
	public selectPrevSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPrevious();
		}
	}
	public selectPrevPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPreviousPage();
		}
	}
}

export class QuickFixAction extends EditorAction {

	static ID = 'editor.action.quickFix';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public isSupported(): boolean {
		var model = this.editor.getModel();
		return QuickFixRegistry.has(model) && !this.editor.getConfiguration().readOnly;
	}

	public run():TPromise<boolean> {
		return QuickFixController.getQuickFixController(this.editor).run();
	}
}

var CONTEXT_QUICK_FIX_WIDGET_VISIBLE = 'quickFixWidgetVisible';

var weight = CommonEditorRegistry.commandWeight(80);

// register action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(QuickFixAction, QuickFixAction.ID, nls.localize('quickfix.trigger.label', "Quick Fix"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.US_DOT
}));
CommonEditorRegistry.registerEditorCommand('acceptQuickFixSuggestion', weight, { primary: KeyCode.Enter, secondary: [KeyCode.Tab] }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.acceptSelectedSuggestion();
});
CommonEditorRegistry.registerEditorCommand('closeQuickFixWidget', weight, { primary: KeyCode.Escape }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.closeWidget();
});
CommonEditorRegistry.registerEditorCommand('selectNextQuickFix', weight, { primary: KeyCode.DownArrow }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.selectNextSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectNextPageQuickFix', weight, { primary: KeyCode.PageDown }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.selectNextPageSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevQuickFix', weight, { primary: KeyCode.UpArrow }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.selectPrevSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevPageQuickFix', weight, { primary: KeyCode.PageUp }, false, CONTEXT_QUICK_FIX_WIDGET_VISIBLE,(ctx, editor, args) => {
	var controller = QuickFixController.getQuickFixController(editor);
	controller.selectPrevPageSuggestion();
});

EditorBrowserRegistry.registerEditorContribution(QuickFixController);