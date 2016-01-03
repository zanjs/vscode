/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/commandsHandler';
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import {IAction, Action} from 'vs/base/common/actions';
import {toErrorMessage} from 'vs/base/common/errors';
import {Mode, IContext, IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntryGroup, IHighlight, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {SyncActionDescriptor, IActionsService} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
import {Registry} from 'vs/platform/platform';
import {Extensions as QuickOpenExtensions, QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import filters = require('vs/base/common/filters');
import {ICommonCodeEditor, IEditorActionDescriptorData} from 'vs/editor/common/editorCommon';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';

export const ALL_COMMANDS_PREFIX = '>';
export const EDITOR_COMMANDS_PREFIX = '$';

export class ShowAllCommandsAction extends QuickOpenAction {

	public static ID = 'workbench.action.showCommands';
	public static LABEL = nls.localize('showTriggerActions', "Show All Commands");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, ALL_COMMANDS_PREFIX, quickOpenService);
	}
}

class BaseCommandEntry extends QuickOpenEntryGroup {
	private key: string;
	private description: string;

	constructor(
		key: string,
		description: string,
		highlights: IHighlight[],
		@IMessageService protected messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();

		this.key = key;
		this.description = description;
		this.setHighlights(highlights);
	}

	public getLabel(): string {
		return this.description;
	}

	public getGroupLabel(): string {
		return this.key;
	}

	protected onError(error?: Error): void {
		let message = !error ? nls.localize('canNotRun', "Command '{0}' can not be run from here.", this.description) : toErrorMessage(error);

		this.messageService.show(Severity.Error, message);
	}

	protected runAction(action: IAction): void {

		// Use a timeout to give the quick open widget a chance to close itself first
		Promise.timeout(50).done(() => {
			if (action && action.enabled) {
				try {
					this.telemetryService.publicLog('workbenchActionExecuted', { id: action.id, from: 'quick open' });
					(action.run() || Promise.as(null)).done(() => {
						action.dispose();
					}, (err) => this.onError(err));
				} catch (error) {
					this.onError(error);
				}
			} else {
				this.messageService.show(Severity.Info, nls.localize('actionNotEnabled', "Command '{0}' is not enabled in the current context.", this.getLabel()));
			}
		}, (err) => this.onError(err));
	}
}

class CommandEntry extends BaseCommandEntry {
	private actionDescriptor: SyncActionDescriptor;

	constructor(
		key: string,
		description: string,
		highlights: IHighlight[],
		actionDescriptor: SyncActionDescriptor,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(key, description, highlights, messageService, telemetryService);

		this.actionDescriptor = actionDescriptor;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			let action = <Action>this.instantiationService.createInstance(this.actionDescriptor.syncDescriptor);
			this.runAction(action);

			return true;
		}

		return false;
	}
}

class EditorActionCommandEntry extends BaseCommandEntry {
	private action: IAction;

	constructor(
		key: string,
		description: string,
		highlights: IHighlight[],
		action: IAction,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(key, description, highlights, messageService, telemetryService);

		this.action = action;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			this.runAction(this.action);

			return true;
		}

		return false;
	}
}


class ActionCommandEntry extends BaseCommandEntry {
	private action: IAction;

	constructor(
		key: string,
		description: string,
		highlights: IHighlight[],
		action: IAction,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(key, description, highlights, messageService, telemetryService);

		this.action = action;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			this.runAction(this.action);

			return true;
		}

		return false;
	}
}

export class CommandsHandler extends QuickOpenHandler {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMessageService private messageService: IMessageService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IActionsService private actionsService: IActionsService
	) {
		super();
	}

	protected includeWorkbenchCommands(): boolean {
		return true;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Workbench Actions (if prefix asks for all commands)
		let workbenchEntries: CommandEntry[] = [];
		if (this.includeWorkbenchCommands()) {
			let workbenchActions = (<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions)).getWorkbenchActions();
			workbenchEntries = this.actionDescriptorsToEntries(workbenchActions, searchValue);
		}

		// Editor Actions
		let activeEditor = this.editorService.getActiveEditor();
		let activeEditorControl = <any>(activeEditor ? activeEditor.getControl() : null);

		let editorActions: IAction[] = [];
		if (activeEditorControl && types.isFunction(activeEditorControl.getActions)) {
			editorActions = activeEditorControl.getActions();
		}

		let editorEntries = this.editorActionsToEntries(editorActions, searchValue);

		// Other Actions
		let otherActions = this.actionsService.getActions();
		let otherEntries = this.otherActionsToEntries(otherActions, searchValue);

		// Concat
		let entries = [...workbenchEntries, ...editorEntries, ...otherEntries];

		// Remove duplicates
		entries = arrays.distinct(entries, (entry) => entry.getLabel() + entry.getGroupLabel());

		// Sort by name
		entries = entries.sort(this.sort);

		return TPromise.as(new QuickOpenModel(entries));
	}

	private actionDescriptorsToEntries(actionDescriptors: SyncActionDescriptor[], searchValue: string): CommandEntry[] {
		let entries: CommandEntry[] = [];
		let registry = (<IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions));

		for (let i = 0; i < actionDescriptors.length; i++) {
			let actionDescriptor = actionDescriptors[i];
			let keys = this.keybindingService.lookupKeybindings(actionDescriptor.id).map(k => this.keybindingService.getLabelFor(k));

			if (actionDescriptor.label) {
				let label = actionDescriptor.label;
				let category = registry.getCategory(actionDescriptor.id);
				if (category) {
					label = nls.localize('commandLabel', "{0}: {1}", category, label);
				}

				let highlights = filters.matchesFuzzy(searchValue, label);
				if (highlights) {
					entries.push(this.instantiationService.createInstance(CommandEntry, keys.length > 0 ? keys.join(', ') : '', label, highlights, actionDescriptor));
				}
			}
		}

		return entries;
	}

	private editorActionsToEntries(actions: IAction[], searchValue: string): EditorActionCommandEntry[] {
		let entries: EditorActionCommandEntry[] = [];

		for (let i = 0; i < actions.length; i++) {
			let action = actions[i];

			let editorAction = <EditorAction>action;

			if (!editorAction.isSupported()) {
				continue; // do not show actions that are not supported in this context
			}

			let keys = this.keybindingService.lookupKeybindings(editorAction.id).map(k => this.keybindingService.getLabelFor(k));

			if (action.label) {
				let highlights = filters.matchesFuzzy(searchValue, action.label);
				if (highlights) {
					entries.push(this.instantiationService.createInstance(EditorActionCommandEntry, keys.length > 0 ? keys.join(', ') : '', action.label, highlights, action));
				}
			}
		}

		return entries;
	}

	private otherActionsToEntries(actions: IAction[], searchValue: string): ActionCommandEntry[] {
		let entries: ActionCommandEntry[] = [];

		for (let action of actions) {
			let keys = this.keybindingService.lookupKeybindings(action.id).map(k => this.keybindingService.getLabelFor(k));
			let highlights = filters.matchesFuzzy(searchValue, action.label);
			if (highlights) {
				entries.push(this.instantiationService.createInstance(ActionCommandEntry, keys.join(', '), action.label, highlights, action));
			}
		}

		return entries;
	}

	private sort(elementA: QuickOpenEntryGroup, elementB: QuickOpenEntryGroup): number {
		let elementAName = elementA.getLabel().toLowerCase();
		let elementBName = elementB.getLabel().toLowerCase();

		return strings.localeCompare(elementAName, elementBName);
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue.trim()
		};
	}

	public getClass(): string {
		return 'commands-handler';
	}

	public getEmptyLabel(searchString: string): string {
		return nls.localize('noCommandsMatching', "No commands matching");
	}
}

export class EditorCommandsHandler extends CommandsHandler {

	protected includeWorkbenchCommands(): boolean {
		return false;
	}
}

export class QuickCommandsEditorAction extends EditorAction {

	public static ID = 'editor.action.quickCommand';

	constructor(
		descriptor: IEditorActionDescriptorData,
		editor: ICommonCodeEditor,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);

		this.label = nls.localize('QuickCommandsAction.label', "Show Editor Commands");
	}

	public getGroupId(): string {
		return '4_tools/1_commands';
	}

	public run(): Promise {

		// Pass focus to editor first before running quick open action
		this.editor.focus();

		// Show with prefix
		this.quickOpenService.show('$');

		return super.run();
	}
}