/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import platform = require('vs/platform/platform');
import abr = require('vs/workbench/browser/actionBarRegistry');
import { Promise } from 'vs/base/common/winjs.base';
import { basename } from 'vs/base/common/paths';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import editorcommon = require('vs/editor/common/editorCommon');
import {TextModel} from 'vs/editor/common/model/textModel';
import baseeditor = require('vs/workbench/browser/parts/editor/baseEditor');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import tdeditor = require('vs/workbench/browser/parts/editor/textDiffEditor');
import teditor = require('vs/workbench/browser/parts/editor/textEditor');
import files = require('vs/workbench/parts/files/browser/files');
import filesCommon = require('vs/workbench/parts/files/common/files');
import gitcontrib = require('vs/workbench/parts/git/browser/gitWorkbenchContributions');
import { IGitService, Status, IFileStatus, StatusType } from 'vs/workbench/parts/git/common/git';
import gitei = require('vs/workbench/parts/git/browser/gitEditorInputs');
import stageranges = require('vs/workbench/parts/git/common/stageRanges');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPartService, Parts} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IFileService, IFileStat} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import wbar = require('vs/workbench/browser/actionRegistry');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenChangeAction, SyncAction, PullAction, PushAction, PublishAction, StartGitBranchAction, StartGitCheckoutAction } from './gitActions';
import Severity from 'vs/base/common/severity';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';

function getStatus(gitService: IGitService, contextService: IWorkspaceContextService, input: WorkbenchEditorCommon.IFileEditorInput): IFileStatus {
	const model = gitService.getModel();
	const repositoryRoot = model.getRepositoryRoot();
	const statusModel = model.getStatus();
	const repositoryRelativePath = paths.normalize(paths.relative(repositoryRoot, input.getResource().fsPath));

	return statusModel.getWorkingTreeStatus().find(repositoryRelativePath) ||
			statusModel.getIndexStatus().find(repositoryRelativePath);
}

class OpenInDiffAction extends baseeditor.EditorInputAction {

	static ID = 'workbench.git.action.openInDiff';
	static Label = nls.localize('switchToChangesView', "Switch to Changes View");

	private gitService: IGitService;
	private viewletService: IViewletService;
	private editorService: IWorkbenchEditorService;
	private partService: IPartService;
	private contextService: IWorkspaceContextService;
	private toDispose: lifecycle.IDisposable[];

	constructor(@IWorkbenchEditorService editorService: IWorkbenchEditorService, @IGitService gitService: IGitService, @IViewletService viewletService: IViewletService, @IPartService partService: IPartService, @IWorkspaceContextService contextService : IWorkspaceContextService) {
		super(OpenInDiffAction.ID, OpenInDiffAction.Label);

		this.class = 'git-action open-in-diff';
		this.gitService = gitService;
		this.viewletService = viewletService;
		this.editorService = editorService;
		this.partService = partService;
		this.contextService = contextService;

		this.toDispose = [this.gitService.addBulkListener2(() => this.onGitStateChanged())];

		this.enabled = this.isEnabled();
	}

	public isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!(typeof this.gitService.getModel().getRepositoryRoot() === 'string')) {
			return false;
		}

		var status = this.getStatus();

		return status && (
			status.getStatus() === Status.MODIFIED ||
			status.getStatus() === Status.INDEX_MODIFIED ||
			status.getStatus() === Status.INDEX_RENAMED
		);
	}

	private onGitStateChanged():void {
		if (this.gitService.isIdle()) {
			this.enabled = this.isEnabled();
		}
	}

	private getStatus():IFileStatus {
		return getStatus(this.gitService, this.contextService, <filesCommon.FileEditorInput> this.input);
	}

	public run(event?: any): Promise {
		var sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		var editor = <editorbrowser.ICodeEditor> this.editorService.getActiveEditor().getControl();
		var viewState = editor ? editor.saveViewState() : null;

		return this.gitService.getInput(this.getStatus()).then((input) => {
			var promise = Promise.as(null);

			if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
				promise = this.viewletService.openViewlet(gitcontrib.VIEWLET_ID, false);
			}

			return promise.then(() => {
				var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
				options.forceOpen = true;
				options.autoRevealFirstChange = false;

				return this.editorService.openEditor(input, options, sideBySide).then((editor) => {
					if (viewState) {
						var codeEditor = <editorbrowser.ICodeEditor> this.editorService.getActiveEditor().getControl();
						codeEditor.restoreViewState({
							original: { },
							modified: viewState
						});
					}
				});
			});
		});
	}

	public dispose():void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}

class OpenInEditorAction extends baseeditor.EditorInputAction {

	private static DELETED_STATES = [Status.BOTH_DELETED, Status.DELETED, Status.DELETED_BY_US, Status.INDEX_DELETED];
	static ID = 'workbench.git.action.openInEditor';
	static LABEL = nls.localize('openInEditor', "Switch to Editor View");

	private gitService: IGitService;
	private fileService: IFileService;
	private viewletService: IViewletService;
	private editorService: IWorkbenchEditorService;
	private partService: IPartService;
	private contextService: IWorkspaceContextService;

	constructor(@IFileService fileService: IFileService, @IWorkbenchEditorService editorService: IWorkbenchEditorService, @IGitService gitService: IGitService, @IViewletService viewletService: IViewletService, @IPartService partService: IPartService, @IWorkspaceContextService contextService: IWorkspaceContextService) {
		super(OpenInEditorAction.ID, OpenInEditorAction.LABEL);

		this.class = 'git-action open-in-editor';
		this.gitService = gitService;
		this.fileService = fileService;
		this.viewletService = viewletService;
		this.editorService = editorService;
		this.partService = partService;
		this.contextService = contextService;

		this.enabled = this.isEnabled();
	}

	public isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!(typeof this.gitService.getModel().getRepositoryRoot() === 'string')) {
			return false;
		}

		var status:IFileStatus = (<any>this.input).getFileStatus();
		if (OpenInEditorAction.DELETED_STATES.indexOf(status.getStatus()) > -1) {
			return false;
		}

		return true;
	}

	public run(event?: any): Promise {
		const model = this.gitService.getModel();
		const resource = URI.file(paths.join(model.getRepositoryRoot(), this.getRepositoryRelativePath()));
		const sideBySide = !!(event && (event.ctrlKey || event.metaKey));
		const modifiedViewState = this.saveTextViewState();

		return this.fileService.resolveFile(resource).then(stat => {
			return this.editorService.openEditor({
				resource: stat.resource,
				mime: stat.mime,
				options: {
					forceOpen: true
				}
			}, sideBySide).then(editor => {
				this.restoreTextViewState(modifiedViewState);

				if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
					return this.viewletService.openViewlet(filesCommon.VIEWLET_ID, false);
				}
			});
		});
	}

	private saveTextViewState():editorcommon.IEditorViewState {
		var textEditor = this.getTextEditor();
		if (textEditor) {
			return textEditor.saveViewState();
		}

		return null;
	}

	private restoreTextViewState(state:editorcommon.IEditorViewState):void {
		var textEditor = this.getTextEditor();
		if (textEditor) {
			return textEditor.restoreViewState(state);
		}
	}

	private getTextEditor(): editorcommon.ICommonCodeEditor {
		var editor = this.editorService.getActiveEditor();

		if (editor instanceof tdeditor.TextDiffEditor) {
			return (<editorbrowser.IDiffEditor>editor.getControl()).getModifiedEditor();
		} else if (editor instanceof teditor.BaseTextEditor) {
			return <editorbrowser.ICodeEditor> editor.getControl();
		}

		return null;
	}

	private getRepositoryRelativePath():string {
		var status: IFileStatus = (<any> this.input).getFileStatus();

		if (status.getStatus() === Status.INDEX_RENAMED) {
			return status.getRename();
		} else {
			var indexStatus = this.gitService.getModel().getStatus().find(status.getPath(), StatusType.INDEX);

			if (indexStatus && indexStatus.getStatus() === Status.INDEX_RENAMED) {
				return indexStatus.getRename();
			} else {
				return status.getPath();
			}
		}
	}
}

export class StageRangesAction extends baseeditor.EditorInputAction {
	private gitService: IGitService;
	private editorService: IWorkbenchEditorService;
	private editor:editorbrowser.IDiffEditor;

	constructor(editor:tdeditor.TextDiffEditor, @IGitService gitService: IGitService, @IWorkbenchEditorService editorService : IWorkbenchEditorService) {
		super('workbench.git.action.stageRanges', nls.localize('stageSelectedLines', "Stage Selected Lines"));

		this.editorService = editorService;
		this.gitService = gitService;
		this.editor = editor.getControl();
		this.editor.addListener(editorcommon.EventType.CursorSelectionChanged, this.updateEnablement.bind(this));
		this.editor.addListener(editorcommon.EventType.DiffUpdated, this.updateEnablement.bind(this));
		this.class = 'git-action stage-ranges';
	}

	public isEnabled():boolean {
		if (!super.isEnabled()) {
			return false;
		}

		if (!this.gitService || !this.editorService) {
			return false;
		}

		var changes = this.editor.getLineChanges();
		var selections = this.editor.getSelections();

		if (!changes || !selections || selections.length === 0) {
			return false;
		}

		return stageranges.getSelectedChanges(changes, selections).length > 0;
	}

	public run():Promise {
		var result = stageranges.stageRanges(this.editor);

		var status = (<gitei.GitWorkingTreeDiffEditorInput>this.input).getFileStatus();
		var path = status.getPath();
		var viewState = this.editor.saveViewState();

		return this.gitService.stage(status.getPath(), result).then(() => {
			var statusModel = this.gitService.getModel().getStatus();

			status = statusModel.getWorkingTreeStatus().find(path) || statusModel.getIndexStatus().find(path);

			if (status) {
				return this.gitService.getInput(status).then((input) => {
					var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
					options.forceOpen = true;
					options.autoRevealFirstChange = false;

					return this.editorService.openEditor(input, options, this.position).then(() => {
						this.editor.restoreViewState(viewState);
					});
				});
			}
		});
	}

	private updateEnablement():void {
		this.enabled = this.isEnabled();
	}
}

class FileEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService:IInstantiationService;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasActionsForEditorInput(context:baseeditor.IEditorInputActionContext):boolean {
		return context.input instanceof filesCommon.FileEditorInput;
	}

	public getActionsForEditorInput(context:baseeditor.IEditorInputActionContext):baseeditor.IEditorInputAction[] {
		return [ this.instantiationService.createInstance(OpenInDiffAction) ];
	}
}

class GitEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService:IInstantiationService;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasActionsForEditorInput(context:baseeditor.IEditorInputActionContext):boolean {
		return gitei.isGitEditorInput(context.input);
	}

	public getActionsForEditorInput(context:baseeditor.IEditorInputActionContext):baseeditor.IEditorInputAction[] {
		return [ this.instantiationService.createInstance(OpenInEditorAction) ];
	}
}

class GitWorkingTreeDiffEditorActionContributor extends baseeditor.EditorInputActionContributor {
	private instantiationService:IInstantiationService;

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.instantiationService = instantiationService;
	}

	public hasSecondaryActionsForEditorInput(context:baseeditor.IEditorInputActionContext):boolean {
		return (context.input instanceof gitei.GitWorkingTreeDiffEditorInput && context.editor instanceof tdeditor.TextDiffEditor);
	}

	public getSecondaryActionsForEditorInput(context:baseeditor.IEditorInputActionContext):baseeditor.IEditorInputAction[] {
		return [ this.instantiationService.createInstance(StageRangesAction, <tdeditor.TextDiffEditor>context.editor) ];
	}
}

class GlobalOpenChangeAction extends OpenChangeAction {

	static ID = 'workbench.git.action.globalOpenChange';
	static LABEL = nls.localize('openChange', "Open Change");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IGitService gitService: IGitService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IViewletService protected viewletService: IViewletService,
		@IPartService protected partService: IPartService
	) {
		super(editorService, gitService);
	}

	public getInput(): WorkbenchEditorCommon.IFileEditorInput {
		return WorkbenchEditorCommon.asFileEditorInput(this.editorService.getActiveEditorInput());
	}

	public run(context?: any): Promise {
		let input = this.getInput();

		if (!input) {
			return Promise.as(null);
		}

		let status = getStatus(this.gitService, this.contextService, input);

		if (!status) {
			return Promise.as(null);
		}

		var sideBySide = !!(context && (context.ctrlKey || context.metaKey));
		var editor = <editorbrowser.ICodeEditor> this.editorService.getActiveEditor().getControl();
		var viewState = editor ? editor.saveViewState() : null;

		return this.gitService.getInput(status).then((input) => {
			var promise = Promise.as(null);

			if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
				promise = this.viewletService.openViewlet(gitcontrib.VIEWLET_ID, false);
			}

			return promise.then(() => {
				var options = new WorkbenchEditorCommon.TextDiffEditorOptions();
				options.forceOpen = true;
				options.autoRevealFirstChange = false;

				return this.editorService.openEditor(input, options, sideBySide).then((editor) => {
					if (viewState) {
						var codeEditor = <editorbrowser.ICodeEditor> this.editorService.getActiveEditor().getControl();
						codeEditor.restoreViewState({
							original: { },
							modified: viewState
						});
					}
				});
			});
		});

		return Promise.as(true);
	}
}

var actionBarRegistry = <abr.IActionBarRegistry> platform.Registry.as(abr.Extensions.Actionbar);
actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, FileEditorActionContributor);
actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, GitEditorActionContributor);
actionBarRegistry.registerActionBarContributor(abr.Scope.EDITOR, GitWorkingTreeDiffEditorActionContributor);

let workbenchActionRegistry = (<wbar.IWorkbenchActionRegistry> platform.Registry.as(wbar.Extensions.WorkbenchActions));

// Register Actions
const category = nls.localize('git', "Git");
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(GlobalOpenChangeAction, GlobalOpenChangeAction.ID, GlobalOpenChangeAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PullAction, PullAction.ID, PullAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PushAction, PushAction.ID, PushAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SyncAction, SyncAction.ID, SyncAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PublishAction, PublishAction.ID, PublishAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(StartGitBranchAction, StartGitBranchAction.ID, StartGitBranchAction.LABEL), category);
workbenchActionRegistry.registerWorkbenchAction(new SyncActionDescriptor(StartGitCheckoutAction, StartGitCheckoutAction.ID, StartGitCheckoutAction.LABEL), category);
