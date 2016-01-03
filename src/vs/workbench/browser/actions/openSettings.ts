/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import network = require('vs/base/common/network');
import labels = require('vs/base/common/labels');
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/browser/actionRegistry';
import {StringEditorInput} from 'vs/workbench/browser/parts/editor/stringEditorInput';
import {getDefaultValuesContent} from 'vs/platform/configuration/common/model';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {Position} from 'vs/platform/editor/common/editor';
import {IFileService, IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {IMessageService, Severity, CloseAction} from 'vs/platform/message/common/message';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class BaseTwoEditorsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IFileService protected fileService: IFileService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IMessageService protected messageService: IMessageService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label);

		this.enabled = true;
	}

	protected createIfNotExists(resource: URI, contents: string): TPromise<boolean> {
		return this.fileService.resolveContent(resource, { acceptTextOnly: true }).then(null, (error) => {
			if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return this.fileService.updateContent(resource, contents).then(null, (error) => {
					return Promise.wrapError(new Error(nls.localize('fail.createSettings', "Unable to create '{0}' ({1}).", labels.getPathLabel(resource, this.contextService), error)));
				});
			}

			return Promise.wrapError(error);
		});
	}

	protected openTwoEditors(leftHandDefaultInput: StringEditorInput, editableResource: URI, defaultEditableContents: string): Promise {

		// Create as needed and open in editor
		return this.createIfNotExists(editableResource, defaultEditableContents).then(() => {
			return this.editorService.inputToType({ resource: editableResource }).then((typedRightHandEditableInput) => {
				return this.editorService.setEditors([leftHandDefaultInput, typedRightHandEditableInput]).then(() => {
					return this.editorService.focusEditor(Position.CENTER);
				});
			});
		});
	}
}

export class BaseOpenSettingsAction extends BaseTwoEditorsAction {

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, editorService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	protected open(emptySettingsContents: string, settingsResource: URI): Promise {
		return this.openTwoEditors(DefaultSettingsInput.getInstance(this.instantiationService), settingsResource, emptySettingsContents);
	}
}

export class OpenGlobalSettingsAction extends BaseOpenSettingsAction {
	public static ID = 'workbench.action.openGlobalSettings';
	public static LABEL = nls.localize('openGlobalSettings', "Open User Settings");

	public run(event?: any): Promise {

		// Inform user about workspace settings
		if (this.configurationService.hasWorkspaceConfiguration()) {
			let hide = this.messageService.show(Severity.Info, {
				message: nls.localize('workspaceHasSettings', "The currently opened folder contains workspace settings that may override user settings"),
				actions: [
					CloseAction,
					new Action('open.workspaceSettings', nls.localize('openWorkspaceSettings', "Open Workspace Settings"), null, true, () => {
						let editorCount = this.editorService.getVisibleEditors().length;

						return this.editorService.inputToType({ resource: this.contextService.toResource('.vscode/settings.json') }).then((typedInput) => {
							return this.editorService.openEditor(typedInput, null, editorCount === 2 ? Position.RIGHT : editorCount === 1 ? Position.CENTER : void 0);
						});
					})
				]
			});

			setTimeout(() => hide(), 10000 /* hide after 10 seconds */);
		}

		// Open settings
		let emptySettingsHeader = nls.localize('emptySettingsHeader', "Place your settings in this file to overwrite the default settings");

		return this.open('// ' + emptySettingsHeader + '\n{\n}', URI.file(this.contextService.getConfiguration().env.appSettingsPath));
	}
}

export class OpenGlobalKeybindingsAction extends BaseTwoEditorsAction {
	public static ID = 'workbench.action.openGlobalKeybindings';
	public static LABEL = nls.localize('openGlobalKeybindings', "Open Keyboard Shortcuts");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IFileService fileService: IFileService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService messageService: IMessageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, editorService, fileService, configurationService, messageService, contextService, keybindingService, instantiationService);
	}

	public run(event?: any): Promise {
		let emptyContents = '// ' + nls.localize('emptyKeybindingsHeader', "Place your key bindings in this file to overwrite the defaults") + '\n[\n]';

		return this.openTwoEditors(DefaultKeybindingsInput.getInstance(this.instantiationService, this.keybindingService), URI.file(this.contextService.getConfiguration().env.appKeybindingsPath), emptyContents);
	}
}

export class OpenWorkspaceSettingsAction extends BaseOpenSettingsAction {
	public static ID = 'workbench.action.openWorkspaceSettings';
	public static LABEL = nls.localize('openWorkspaceSettings', "Open Workspace Settings");

	public run(event?: any): Promise {
		if (!this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('openFolderFirst', "Open a folder first to create workspace settings"));

			return;
		}

		let emptySettingsHeader = [
			'// ' + nls.localize('emptySettingsHeader1', "Place your settings in this file to overwrite default and user settings."),
			'{',
			'}'
		].join('\n');

		return this.open(emptySettingsHeader, this.contextService.toResource('.vscode/settings.json'));
	}
}

class DefaultSettingsInput extends StringEditorInput {
	private static INSTANCE: DefaultSettingsInput;

	public static getInstance(instantiationService: IInstantiationService): DefaultSettingsInput {
		if (!DefaultSettingsInput.INSTANCE) {
			let defaults = getDefaultValuesContent();

			let defaultsHeader = '// ' + nls.localize('defaultSettingsHeader', "Overwrite settings by placing them into your settings file.");
			DefaultSettingsInput.INSTANCE = instantiationService.createInstance(DefaultSettingsInput, nls.localize('defaultName', "Default Settings"), null, defaultsHeader + '\n' + defaults, 'application/json', false);
		}

		return DefaultSettingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.create(network.schemas.inMemory, 'defaults', '/settings.json'); // URI is used to register JSON schema support
	}
}

class DefaultKeybindingsInput extends StringEditorInput {
	private static INSTANCE: DefaultKeybindingsInput;

	public static getInstance(instantiationService: IInstantiationService, keybindingService: IKeybindingService): DefaultKeybindingsInput {
		if (!DefaultKeybindingsInput.INSTANCE) {
			let defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Overwrite key bindings by placing them into your key bindings file.");
			let defaultContents = keybindingService.getDefaultKeybindings();

			DefaultKeybindingsInput.INSTANCE = instantiationService.createInstance(DefaultKeybindingsInput, nls.localize('defaultKeybindings', "Default Keyboard Shortcuts"), null, defaultsHeader + '\n' + defaultContents, 'application/json', false);
		}

		return DefaultKeybindingsInput.INSTANCE;
	}

	protected getResource(): URI {
		return URI.create(network.schemas.inMemory, 'defaults', '/keybindings.json'); // URI is used to register JSON schema support
	}
}

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
let actionRegistry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }
}), category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL), category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), category);