/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import types = require('vs/base/common/types');
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {IEditorOptions, IEditorViewState} from 'vs/editor/common/editorCommon';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {EditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {TextEditorOptions, EditorModel, EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {BaseTextEditorModel} from 'vs/workbench/browser/parts/editor/textEditorModel';
import {LogEditorInput} from 'vs/workbench/browser/parts/editor/logEditorInput';
import {UntitledEditorInput} from 'vs/workbench/browser/parts/editor/untitledEditorInput';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {UntitledEditorEvent, EventType} from 'vs/workbench/common/events';
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
 * An editor implementation that is capable of showing string inputs or promise inputs that resolve to a string.
 * Uses the Monaco TextEditor widget to show the contents.
 */
export class StringEditor extends BaseTextEditor {

	public static ID = 'workbench.editors.stringEditor';

	private defaultWrappingColumn: number;
	private defaultLineNumbers: boolean;
	private mapResourceToEditorViewState: { [resource: string]: IEditorViewState; };

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

		super(StringEditor.ID, telemetryService, instantiationService, contextService, storageService, messageService, configurationService, eventService, editorService, modeService);

		this.defaultWrappingColumn = DefaultConfig.editor.wrappingColumn;
		this.defaultLineNumbers = DefaultConfig.editor.lineNumbers;

		this.mapResourceToEditorViewState = Object.create(null);

		this.toUnbind.push(this.eventService.addListener(EventType.UNTITLED_FILE_DELETED, (e: UntitledEditorEvent) => this.onUntitledDeletedEvent(e)));
	}

	private onUntitledDeletedEvent(e: UntitledEditorEvent): void {
		delete this.mapResourceToEditorViewState[e.resource.toString()];
	}

	public getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('textEditor', "Text Editor");
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
				textOptions.apply(this.getControl());
			}

			return TPromise.as<void>(null);
		}

		// Remember view settings if input changes
		if (oldInput instanceof UntitledEditorInput) {
			this.mapResourceToEditorViewState[oldInput.getResource().toString()] = this.getControl().saveViewState();
		}

		// Different Input (Reload)
		return this.editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel: EditorModel) => {

			// Assert Model instance
			if (!(resolvedModel instanceof BaseTextEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. String editor requires a model instance of BaseTextEditorModel.');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
				return null;
			}

			// Set Editor Model
			let textEditor = this.getControl();
			let textEditorModel = (<BaseTextEditorModel>resolvedModel).textEditorModel;
			textEditor.setModel(textEditorModel);

			// Apply Options from TextOptions
			let optionsGotApplied = false;
			let textOptions = <TextEditorOptions>options;
			if (textOptions && types.isFunction(textOptions.apply)) {
				optionsGotApplied = textOptions.apply(textEditor);
			}

			// Otherwise restore View State
			if (!optionsGotApplied && input instanceof UntitledEditorInput) {
				let viewState = this.mapResourceToEditorViewState[input.getResource().toString()];
				if (viewState) {
					textEditor.restoreViewState(viewState);
				}
			}

			// Apply options again because input has changed
			textEditor.updateOptions(this.getCodeEditorOptions());

			// Auto reveal last line for log editors
			if (input instanceof LogEditorInput) {
				this.revealLastLine();
			}
		});
	}

	protected applyConfiguration(configuration: any): void {

		// Remember some settings that we overwrite from #getCodeEditorOptions()
		let editorConfig = configuration && configuration[EditorConfiguration.EDITOR_SECTION];
		if (editorConfig) {
			this.defaultWrappingColumn = editorConfig.wrappingColumn;
			this.defaultLineNumbers = editorConfig.lineNumbers;
		}

		super.applyConfiguration(configuration);
	}

	protected getCodeEditorOptions(): IEditorOptions {
		let options = super.getCodeEditorOptions();

		let input = this.getInput();
		let isLog = input instanceof LogEditorInput;
		let isUntitled = input instanceof UntitledEditorInput;

		options.readOnly = !isUntitled; 				// all string editors are readonly except for the untitled one

		if (isLog) {
			options.wrappingColumn = 0;					// all log editors wrap
			options.lineNumbers = false;				// all log editors hide line numbers
		} else {
			options.wrappingColumn = this.defaultWrappingColumn; 	// otherwise make sure to restore the defaults
			options.lineNumbers = this.defaultLineNumbers; 			// otherwise make sure to restore the defaults
		}

		return options;
	}

	/**
	 * Reveals the last line of this editor if it has a model set.
	 */
	public revealLastLine(): void {
		let codeEditor = <ICodeEditor>this.getControl();
		let model = codeEditor.getModel();
		if (model) {
			let lastLine = model.getLineCount();
			codeEditor.revealLine(lastLine);
		}
	}

	public supportsSplitEditor(): boolean {
		return true;
	}

	public focus(): void {
		super.focus();

		// Auto reveal last line for log editors
		if (this.getInput() instanceof LogEditorInput) {
			this.revealLastLine();
		}
	}

	public clearInput(): void {

		// Keep editor view state in settings to restore when coming back
		if (this.input instanceof UntitledEditorInput) {
			this.mapResourceToEditorViewState[(<UntitledEditorInput>this.input).getResource().toString()] = this.getControl().saveViewState();
		}

		// Clear Model
		this.getControl().setModel(null);

		super.clearInput();
	}
}