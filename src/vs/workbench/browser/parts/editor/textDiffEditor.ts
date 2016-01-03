/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/textdiffeditor';
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Builder} from 'vs/base/browser/builder';
import {Action, IAction} from 'vs/base/common/actions';
import {onUnexpectedError} from 'vs/base/common/errors';
import types = require('vs/base/common/types');
import {IDiffEditor} from 'vs/editor/browser/editorBrowser';
import {IDiffEditorOptions, IEditorOptions} from 'vs/editor/common/editorCommon';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {TextEditorOptions, TextDiffEditorOptions, EditorModel, EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {StringEditorInput} from 'vs/workbench/browser/parts/editor/stringEditorInput';
import {ResourceEditorInput} from 'vs/workbench/browser/parts/editor/resourceEditorInput';
import {DiffEditorInput} from 'vs/workbench/browser/parts/editor/diffEditorInput';
import {DiffNavigator} from 'vs/editor/contrib/diffNavigator/common/diffNavigator';
import {DiffEditorWidget} from 'vs/editor/browser/widget/diffEditorWidget';
import {TextDiffEditorModel} from 'vs/workbench/browser/parts/editor/textDiffEditorModel';
import {DelegatingWorkbenchEditorService} from 'vs/workbench/services/editor/browser/editorService';
import {IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IModeService} from 'vs/editor/common/services/modeService';

/**
 * The text editor that leverages the monaco diff text editor for the editing experience.
 */
export class TextDiffEditor extends BaseTextEditor {

	public static ID = 'workbench.editors.textDiffEditor';

	private diffNavigator: DiffNavigator;
	private nextDiffAction: NavigateAction;
	private previousDiffAction: NavigateAction;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IModeService modeService: IModeService
	) {
		super(TextDiffEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, modeService);
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textDiffEditor', "Text Diff Editor");
	}

	public createEditorControl(parent: Builder): IDiffEditor {
		this.nextDiffAction = new NavigateAction(this, true);
		this.previousDiffAction = new NavigateAction(this, false);

		let delegatingService = this.instantiationService.createInstance(DelegatingWorkbenchEditorService, this, (editor: BaseEditor, input: EditorInput, options?: EditorOptions, arg4?: any) => {

			// Check if arg4 is a position argument that differs from this editors position
			if (types.isUndefinedOrNull(arg4) || arg4 === false || arg4 === this.position) {
				let activeDiffInput = <DiffEditorInput>this.getInput();
				if (input && options && activeDiffInput) {

					// Input matches modified side of the diff editor: perform the action on modified side
					if (input.matches(activeDiffInput.getModifiedInput())) {
						return this.setInput(this.getInput(), options).then(() => {
							return true;
						});
					}

					// Input matches original side of the diff editor: perform the action on original side
					else if (input.matches(activeDiffInput.getOriginalInput())) {
						let originalEditor = this.getControl().getOriginalEditor();
						if (options instanceof TextEditorOptions) {
							(<TextEditorOptions>options).apply(originalEditor);

							return TPromise.as<boolean>(true);
						}
					}
				}
			}

			return TPromise.as<boolean>(false);
		});

		// Create a special child of instantiator that will delegate all calls to openEditor() to the same diff editor if the input matches with the modified one
		let diffEditorInstantiator = this.instantiationService.createChild({
			editorService: delegatingService
		});

		return diffEditorInstantiator.createInstance(DiffEditorWidget, parent.getHTMLElement(), this.getCodeEditorOptions());
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		let oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		let forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {

			// TextOptions (avoiding instanceof here for a reason, do not change!)
			let textOptions = <TextEditorOptions>options;
			if (textOptions && types.isFunction(textOptions.apply)) {
				textOptions.apply(<IDiffEditor>this.getControl());
			}

			return TPromise.as<void>(null);
		}

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		// Different Input (Reload)
		return this.editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel: EditorModel) => {

			// Assert Model Instance
			if (!(resolvedModel instanceof TextDiffEditorModel) && this.openAsBinary(input, options)) {
				return null;
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading a diff takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
				return null;
			}

			// Editor
			let diffEditor = <IDiffEditor>this.getControl();
			diffEditor.setModel((<TextDiffEditorModel>resolvedModel).textDiffEditorModel);

			// Respect text diff editor options
			let autoRevealFirstChange = true;
			if (options instanceof TextDiffEditorOptions) {
				let textDiffOptions = (<TextDiffEditorOptions>options);
				autoRevealFirstChange = !types.isUndefinedOrNull(textDiffOptions.autoRevealFirstChange) ? textDiffOptions.autoRevealFirstChange : autoRevealFirstChange;
			}

			// listen on diff updated changes to reveal the first change
			this.diffNavigator = new DiffNavigator(diffEditor, {
				alwaysRevealFirst: autoRevealFirstChange
			});
			this.diffNavigator.addListener(DiffNavigator.Events.UPDATED, () => {
				this.nextDiffAction.updateEnablement();
				this.previousDiffAction.updateEnablement();
			});

			// Handle TextOptions
			if (options && types.isFunction((<TextEditorOptions>options).apply)) {
				(<TextEditorOptions>options).apply(<IDiffEditor>diffEditor);
			}

			// Apply options again because input has changed
			diffEditor.updateOptions(this.getCodeEditorOptions());
		}, (error) => {

			// In case we tried to open a file and the response indicates that this is not a text file, fallback to binary diff.
			if (this.isFileBinaryError(error) && this.openAsBinary(input, options)) {
				return null;
			}

			// Otherwise make sure the error bubbles up
			return Promise.wrapError(error);
		});
	}

	private openAsBinary(input: EditorInput, options: EditorOptions): boolean {
		if (input instanceof DiffEditorInput) {
			let originalInput = input.originalInput;
			let modifiedInput = input.modifiedInput;

			let binaryDiffInput = new DiffEditorInput(input.getName(), input.getDescription(), originalInput, modifiedInput, true);

			this.editorService.openEditor(binaryDiffInput, options, this.position).done(null, onUnexpectedError);

			return true;
		}

		return false;
	}

	protected getCodeEditorOptions(): IEditorOptions {
		let options: IDiffEditorOptions = super.getCodeEditorOptions();

		let input = this.input;
		if (input && types.isFunction((<DiffEditorInput>input).getModifiedInput)) {
			let modifiedInput = (<DiffEditorInput>input).getModifiedInput();
			let readOnly = modifiedInput instanceof StringEditorInput || modifiedInput instanceof ResourceEditorInput;

			options.readOnly = readOnly;
		}

		return options;
	}

	private isFileBinaryError(error: Error[]): boolean;
	private isFileBinaryError(error: Error): boolean;
	private isFileBinaryError(error: any): boolean {
		if (types.isArray(error)) {
			let errors = <Error[]>error;
			return errors.some((e) => this.isFileBinaryError(e));
		}

		return (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_IS_BINARY;
	}

	public clearInput(): void {

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		// Clear Model
		this.getControl().setModel(null);

		// Pass to super
		super.clearInput();
	}

	public getDiffNavigator(): DiffNavigator {
		return this.diffNavigator;
	}

	public getActions(): IAction[] {
		return [
			this.previousDiffAction,
			this.nextDiffAction
		];
	}

	public getSecondaryActions(): IAction[] {
		let actions = super.getSecondaryActions();

		const control = this.getControl();

		let inlineModeActive = control && !control.renderSideBySide;
		let inlineLabel = nls.localize('inlineDiffLabel', "Switch to Inline View");
		let sideBySideLabel = nls.localize('sideBySideDiffLabel', "Switch to Side by Side View");

		// Action to toggle editor mode from inline to side by side
		let toggleEditorModeAction = new Action('toggle.diff.editorMode', inlineModeActive ? sideBySideLabel : inlineLabel, null, true, () => {
			this.getControl().updateOptions(<IDiffEditorOptions>{
				renderSideBySide: inlineModeActive
			});

			inlineModeActive = !inlineModeActive;
			toggleEditorModeAction.label = inlineModeActive ? sideBySideLabel : inlineLabel;

			return Promise.as(true);
		});

		toggleEditorModeAction.order = 50; // Closer to the end

		actions.push(...[
			toggleEditorModeAction
		]);

		return actions;
	}

	public getControl(): IDiffEditor {
		return <any>super.getControl();
	}

	public dispose(): void {

		// Dispose previous diff navigator
		if (this.diffNavigator) {
			this.diffNavigator.dispose();
		}

		super.dispose();
	}
}

class NavigateAction extends Action {
	static ID_NEXT = 'workbench.action.nextDiff';
	static ID_PREV = 'workbench.action.previousDiff';

	private editor: TextDiffEditor;
	private next: boolean;

	constructor(editor: TextDiffEditor, next: boolean) {
		super(next ? NavigateAction.ID_NEXT : NavigateAction.ID_PREV);

		this.editor = editor;
		this.next = next;

		this.label = this.next ? nls.localize('navigate.next.label', "Next Change") : nls.localize('navigate.prev.label', "Previous Change");
		this.class = this.next ? 'textdiff-editor-action next' : 'textdiff-editor-action previous';
		this.enabled = false;
	}

	public run(): Promise {
		if (this.next) {
			this.editor.getDiffNavigator().next();
		} else {
			this.editor.getDiffNavigator().previous();
		}

		return null;
	}

	public updateEnablement(): void {
		this.enabled = this.editor.getDiffNavigator().canNavigate();
	}
}