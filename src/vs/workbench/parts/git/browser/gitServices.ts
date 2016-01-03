/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import platform = require('vs/base/common/platform');
import winjs = require('vs/base/common/winjs.base');
import lifecycle = require('vs/base/common/lifecycle');
import types = require('vs/base/common/types');
import actions = require('vs/base/common/actions');
import errors = require('vs/base/common/errors');
import mime = require('vs/base/common/mime');
import paths = require('vs/base/common/paths');
import ee = require('vs/base/common/eventEmitter');
import wbevents = require('vs/workbench/common/events');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import git = require('vs/workbench/parts/git/common/git');
import model = require('vs/workbench/parts/git/common/gitModel');
import giteditorinputs = require('vs/workbench/parts/git/browser/gitEditorInputs');
import operations = require('vs/workbench/parts/git/browser/gitOperations');
import filesCommon = require('vs/workbench/parts/files/common/files');
import { IFileService, EventType as FileEventType, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import async = require('vs/base/common/async');
import severity from 'vs/base/common/severity';
import {IOutputService} from 'vs/workbench/parts/output/common/output';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import URI from 'vs/base/common/uri';

function toReadablePath(path: string): string {
	if (!platform.isWindows) {
		return path;
	}

	return path.replace(/\//g, '\\');
}

class EditorInputCache
{
	private gitService: git.IGitService;
	private fileService: IFileService;
	private eventService: IEventService;
	private instantiationService: IInstantiationService;
	private editorService: IWorkbenchEditorService;
	private contextService: IWorkspaceContextService;
	private cache: { [key: string]: winjs.TPromise<WorkbenchEditorCommon.EditorInput> };
	private toDispose: lifecycle.IDisposable[];

	constructor(gitService: git.IGitService, // gitService passed as argument, not by injection
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IEventService eventService: IEventService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this.instantiationService = instantiationService;
		this.fileService = fileService;
		this.eventService = eventService;
		this.editorService = editorService;
		this.contextService = contextService;

		this.gitService = gitService;

		this.cache = {};
		this.toDispose = [];

		this.toDispose.push(this.gitService.getModel().addListener2('fileStatus:dispose', (fileStatus: git.IFileStatus) => this.onFileStatusDispose(fileStatus)));
	}

	public getInput(status: git.IFileStatus): winjs.TPromise<WorkbenchEditorCommon.EditorInput> {
		var result = this.cache[status.getId()];

		if (result) {
			return result;
		}

		result = this.createInput(status);
		this.cache[status.getId()] = result;
		return result;
	}

	private createInput(status: git.IFileStatus): winjs.TPromise<WorkbenchEditorCommon.EditorInput> {
		return winjs.TPromise.join<WorkbenchEditorCommon.EditorInput>([this.createLeftInput(status), this.createRightInput(status)]).then((result) => {
			var leftInput = result[0];
			var rightInput = result[1];

			var fileSegment: string;
			var folderSegment: string;

			if (status.getStatus() === git.Status.INDEX_RENAMED) {
				let pathComponents = status.getRename().split('/');
				fileSegment = pathComponents[pathComponents.length - 1];
				folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));
			} else {
				let pathComponents = status.getPathComponents();
				fileSegment = pathComponents[pathComponents.length - 1];
				folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));
			}

			if (!leftInput) {
				if (!rightInput) {
					var error = new Error(nls.localize('cantOpen', "Can't open this git resource."));
					(<git.IGitServiceError> error).gitErrorCode = git.GitErrorCodes.CantOpenResource;
					return winjs.Promise.wrapError(error);
				}

				return winjs.Promise.as(rightInput);
			}

			switch (status.getStatus()) {
				case git.Status.INDEX_MODIFIED:
					return winjs.Promise.as(new giteditorinputs.GitIndexDiffEditorInput(fileSegment, nls.localize('gitIndexChanges', "{0} - Changes on index", folderSegment), leftInput, rightInput, status));
				case git.Status.INDEX_RENAMED:
					return winjs.Promise.as(new giteditorinputs.GitIndexDiffEditorInput(fileSegment, nls.localize('gitIndexChangesRenamed', "{0} - Renamed - Changes on index", folderSegment), leftInput, rightInput, status));
				case git.Status.MODIFIED:
					return winjs.Promise.as(new giteditorinputs.GitWorkingTreeDiffEditorInput(fileSegment, nls.localize('workingTreeChanges', "{0} - Changes on working tree", folderSegment), leftInput, rightInput, status));
				default:
					return winjs.Promise.as(new giteditorinputs.GitDiffEditorInput(fileSegment, nls.localize('gitMergeChanges', "{0} - Merge changes", folderSegment), leftInput, rightInput, status));
			}
		}).then((editorInput) => {
			return editorInput;
		}, (errs) => {
			return winjs.Promise.wrapError(types.isArray(errs) ? errs[0] || errs[1] : errs);
		});
	}

	private createLeftInput(status: git.IFileStatus): winjs.Promise {
		var path = status.getPath();
		var model = this.gitService.getModel();

		switch (status.getStatus()) {
			case git.Status.INDEX_MODIFIED:
			case git.Status.INDEX_RENAMED:
				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			case git.Status.MODIFIED:
				var indexStatus = model.getStatus().find(path, git.StatusType.INDEX);

				if (indexStatus && indexStatus.getStatus() === git.Status.INDEX_RENAMED) {
					return this.gitService.show(indexStatus.getRename(), status, '~', status.getMimetype());
				}

				if (indexStatus) {
					return this.gitService.show(path, status, '~', status.getMimetype());
				}

				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			default:
				return winjs.Promise.as(null);
		}
	}

	private createRightInput(status: git.IFileStatus): winjs.Promise {
		const model = this.gitService.getModel();
		const path = status.getPath();
		let resource = URI.file(paths.join(model.getRepositoryRoot(), path));

		switch (status.getStatus()) {
			case git.Status.INDEX_MODIFIED:
			case git.Status.INDEX_ADDED:
			case git.Status.INDEX_COPIED:
				return this.gitService.show(path, status, '~', status.getMimetype());

			case git.Status.INDEX_RENAMED:
				return this.gitService.show(status.getRename(), status, '~', status.getMimetype());

			case git.Status.INDEX_DELETED:
			case git.Status.DELETED:
				return this.gitService.show(path, status, 'HEAD', status.getMimetype());

			case git.Status.MODIFIED:
			case git.Status.UNTRACKED:
			case git.Status.IGNORED:
				var indexStatus = model.getStatus().find(path, git.StatusType.INDEX);

				if (indexStatus && indexStatus.getStatus() === git.Status.INDEX_RENAMED) {
					resource = URI.file(paths.join(model.getRepositoryRoot(), indexStatus.getRename()));
				}

				return this.editorService.inputToType({ resource });

			case git.Status.BOTH_MODIFIED:
				return this.editorService.inputToType({ resource });

			default:
				return winjs.Promise.as(null);
		}
	}

	private onFileStatusDispose(fileStatus: git.IFileStatus): void {
		var id = fileStatus.getId();
		var editorInputPromise = this.cache[id];

		if (editorInputPromise) {
			editorInputPromise.done((editorInput) => { this.eventuallyDispose(editorInput); });
			delete this.cache[id];
		}
	}

	/**
	 * If the disposed status is the same as this input's status, we must try to dispose the input.
	 * But we should not do it while the input is still open. This method will eventually call dispose
	 * when the editor input goes out of the visible editors.
	 */
	private eventuallyDispose(editorInput: WorkbenchEditorCommon.EditorInput): void {
		if (!this.maybeDispose(editorInput)) {
			var listener = this.eventService.addListener2(wbevents.EventType.EDITOR_INPUT_CHANGED, () => {
				if (this.maybeDispose(editorInput)) {
					listener.dispose();
				}
			});
		}
	}

	private maybeDispose(editorInput: WorkbenchEditorCommon.EditorInput): boolean {
		if (!this.editorService.getVisibleEditors().some((editor) => editor.input && editor.input.matches(editorInput))) {
			editorInput.dispose();
			return true;
		}

		return false;
	}

	public dispose(): void {
		Object.keys(this.cache).forEach(key => {
			this.cache[key].done((editorInput) => { editorInput.dispose(); });
			delete this.cache[key];
		});

		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}

export class AutoFetcher implements git.IAutoFetcher, lifecycle.IDisposable
{
	private static MIN_TIMEOUT = 2 * 60 * 1000; // every two minutes
	private static MAX_TIMEOUT = 5 * 60 * 1000; // every five minutes

	private _state: git.AutoFetcherState;
	private gitService: git.IGitService;
	private eventService: IEventService;
	private messageService: IMessageService;
	private configurationService: IConfigurationService;
	private instantiationService: IInstantiationService;
	private currentRequest: winjs.Promise;
	private timeout: number;
	private toDispose: lifecycle.IDisposable[];
	private gitServiceStateDisposable: lifecycle.IDisposable;

	constructor(gitService: git.IGitService, // gitService passed as argument, not by injection
		@IEventService eventService: IEventService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._state = git.AutoFetcherState.Disabled;
		this.gitService = gitService;
		this.eventService = eventService;
		this.messageService = messageService;
		this.configurationService = configurationService;
		this.instantiationService = instantiationService;
		this.currentRequest = null;
		this.timeout = AutoFetcher.MIN_TIMEOUT;

		this.toDispose = [];
		this.toDispose.push(this.configurationService.addListener2(ConfigurationServiceEventTypes.UPDATED, e => this.onConfiguration(e.config.git)));
		configurationService.loadConfiguration('git').done(c => this.onConfiguration(c));
	}

	public get state(): git.AutoFetcherState {
		return this._state;
	}

	private onConfiguration(config: git.IGitConfiguration): void {
		if (config.autofetch === false) {
			this.disable();
		} else {
			this.enable();
		}
	}

	public enable(): void {
		if (this._state !== git.AutoFetcherState.Disabled) {
			return;
		}

		this.gitServiceStateDisposable = this.gitService.addListener2(git.ServiceEvents.STATE_CHANGED, (e) => this.onGitServiceStateChange(e));
		this._state = git.AutoFetcherState.Active;
		this.onGitServiceStateChange(this.gitService.getState());
	}

	public disable(): void {
		if (this.gitServiceStateDisposable) {
			this.gitServiceStateDisposable.dispose();
			this.gitServiceStateDisposable = null;
		}

		this.deactivate();
		this._state = git.AutoFetcherState.Disabled;
	}

	private onGitServiceStateChange(state: git.ServiceState): void {
		if (state === git.ServiceState.OK) {
			this.activate();
		} else {
			this.deactivate();
		}
	}

	public activate(): void {
		if (this.currentRequest) {
			this.currentRequest.cancel();
		}

		this._state = git.AutoFetcherState.Active;
		this.loop();
	}

	public deactivate(): void {
		if (!this.currentRequest) {
			return;
		}

		this._state = git.AutoFetcherState.Inactive;
		this.currentRequest.cancel();
		this.currentRequest = null;
	}

	private loop(): void {
		this._state = git.AutoFetcherState.Fetching;
		this.currentRequest = this.gitService.fetch().then(() => {
			this.timeout = AutoFetcher.MIN_TIMEOUT;
		}, (err) => {
			if (errors.isPromiseCanceledError(err)) {
				return winjs.Promise.wrapError(err);
			} else if (err.gitErrorCode === git.GitErrorCodes.AuthenticationFailed) {
				return winjs.Promise.wrapError(err);
			} else {
				this.timeout = Math.min(Math.round(this.timeout * 1.2), AutoFetcher.MAX_TIMEOUT); // backoff
			}
		});

		this.currentRequest.then(() => {
			this._state = git.AutoFetcherState.Active;
			this.currentRequest = winjs.Promise.timeout(this.timeout);
			return this.currentRequest;
		}).then(() => this.loop(), (err) => this.deactivate());
	}

	public dispose(): void {
		this.disable();
	}
}

interface IGitCredentialRequest {
	guid: string;
	scope: git.IGitCredentialScope;
}

export class GitService extends ee.EventEmitter
	implements
		git.IGitService {

	static ID = 'Monaco.IDE.UI.Services.GitService';

	public serviceId = git.IGitService;
	private eventService: IEventService;
	private contextService: IWorkspaceContextService;
	private messageService: IMessageService;
	private instantiationService:IInstantiationService;
	private editorService: IWorkbenchEditorService;
	private lifecycleService: ILifecycleService;
	private outputService: IOutputService;
	private raw: git.IRawGitService;

	private state: git.ServiceState;
	private operations: git.IGitOperation[];
	private model: git.IModel;
	private inputCache: EditorInputCache;
	private remoteListenerUnbind:ee.ListenerUnbind;
	private toDispose: lifecycle.IDisposable[];
	private needsRefresh: boolean;
	private refreshDelayer: async.ThrottledDelayer<void>;
	private autoFetcher: AutoFetcher;

	constructor(
		raw: git.IRawGitService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEventService eventService: IEventService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IOutputService outputService: IOutputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();

		this.instantiationService = instantiationService;
		this.eventService = eventService;
		this.messageService = messageService;
		this.editorService = editorService;
		this.outputService = outputService;
		this.contextService = contextService;
		this.lifecycleService = lifecycleService;

		this.raw = raw;
		this.state = git.ServiceState.NotInitialized;
		this.operations = [];
		this.model = new model.Model();
		this.toDispose = [];

		this.needsRefresh = false;
		this.refreshDelayer = new async.PeriodThrottledDelayer<void>(500, 10000);
		this.autoFetcher = this.instantiationService.createInstance(AutoFetcher, this);

		this.registerListeners();

		this.inputCache = this.instantiationService.createInstance(EditorInputCache, this);

		this.triggerStatus(true); // trigger initial status
	}

	private registerListeners():void {
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_CHANGES,(e) => this.onFileChanges(e)));
		this.toDispose.push(this.eventService.addListener2(filesCommon.EventType.FILE_SAVED, (e) => this.onLocalFileChange(e)));
		this.toDispose.push(this.eventService.addListener2(filesCommon.EventType.FILE_REVERTED, (e) => this.onLocalFileChange(e)));
		this.lifecycleService.onShutdown(this.dispose, this);
	}

	private triggerStatus(force: boolean = false): void {
		if (this.isInitialized() && !this.isIdle() && !force) {
			this.refreshDelayer.cancel();
			return;
		}

		var onError = async.once<any, void>(e => {
			if (!errors.isPromiseCanceledError(e)) {
				this.messageService.show(severity.Error, e);
			}
		});

		this.refreshDelayer.trigger(() => this.status()).done(null, onError);
	}

	private onLocalFileChange(e:filesCommon.LocalFileChangeEvent): void {
		var shouldTriggerStatus = e.gotUpdated() && paths.basename(e.getAfter().resource.fsPath) === '.gitignore';

		if (!shouldTriggerStatus) {
			return;
		}

		this.triggerStatus();
	}

	private onFileChanges(e: FileChangesEvent): void {
		var isIdle = this.isIdle();

		var shouldTriggerStatus = e.changes.some(c => {
			var workspacePath = this.contextService.toWorkspaceRelativePath(c.resource);
			if (!workspacePath) {
				return false; // ignore out of workspace files
			}

			// for .gitindex, the service must be idle
			if ('.git/index' === workspacePath) {
				return isIdle;
			}

			// for anything other that .git*
			if (!/^\.git/.test(workspacePath)) {
				return true;
			}

			// added or deleted .git folder
			if (workspacePath === '.git') {
				return c.type === FileChangeType.ADDED || c.type === FileChangeType.DELETED;
			}

			return ['.git/index.lock', '.git/FETCH_HEAD', '.gitignore', '.gitmodules'].indexOf(workspacePath) === -1;
		});

		if (!shouldTriggerStatus) {
			return;
		}

		this.triggerStatus();
	}

	private onGitServiceOperationEnd(e: { operation: git.IGitOperation; }): void {
		if (e.operation.id === git.ServiceOperations.COMMAND) {
			this.triggerStatus();
		}
	}

	public getState(): git.ServiceState {
		return this.state;
	}

	public getModel(): git.IModel {
		return this.model;
	}

	public status(): winjs.Promise {
		return this.run(git.ServiceOperations.STATUS, () => this.raw.status());
	}

	public init(): winjs.Promise {
		return this.run(git.ServiceOperations.INIT, () => this.raw.init());
	}

	public add(files?: git.IFileStatus[]): winjs.Promise {
		return this.run(git.ServiceOperations.ADD, () => this.raw.add(GitService.toPaths(files)));
	}

	public stage(filePath: string, content: string): winjs.Promise {
		return this.run(git.ServiceOperations.STAGE, () => this.raw.stage(filePath, content));
	}

	public branch(name: string, checkout: boolean = false): winjs.Promise {
		return this.run(git.ServiceOperations.BRANCH, () => this.raw.branch(name, checkout));
	}

	public checkout(treeish: string = '', files: git.IFileStatus[] = null): winjs.Promise {
		return this.run(git.ServiceOperations.CHECKOUT, () => this.raw.checkout(treeish, GitService.toPaths(files)));
	}

	public clean(files: git.IFileStatus[]): winjs.Promise {
		return this.run(git.ServiceOperations.CLEAN, () => this.raw.clean(files.map((s) => s.getPath())));
	}

	public undo(): winjs.Promise {
		return this.run(git.ServiceOperations.UNDO, () => this.raw.undo());
	}

	public reset(treeish: string, hard?: boolean): winjs.Promise {
		return this.run(git.ServiceOperations.RESET, () => this.raw.reset(treeish, hard));
	}

	public revertFiles(treeish: string, files?: git.IFileStatus[]): winjs.Promise {
		return this.run(git.ServiceOperations.RESET, () => this.raw.revertFiles(treeish, (files || []).map((s) => s.getPath())));
	}

	public fetch(): winjs.Promise {
		return this.run(git.ServiceOperations.BACKGROUND_FETCH, () => this.raw.fetch());
	}

	public pull(rebase?: boolean): winjs.Promise {
		return this.run(git.ServiceOperations.PULL, () => this.raw.pull(rebase));
	}

	public push(remote?: string, name?: string, options?:git.IPushOptions): winjs.Promise {
		return this.run(git.ServiceOperations.PUSH, () => this.raw.push(remote, name, options));
	}

	public sync(): winjs.Promise {
		return this.run(git.ServiceOperations.SYNC, () => this.raw.sync());
	}

	public commit(message:string, amend: boolean = false, stage: boolean = false): winjs.Promise {
		return this.run(git.ServiceOperations.COMMIT, () => this.raw.commit(message, amend, stage));
	}

	public detectMimetypes(path: string, treeish: string = '~'): winjs.Promise {
		return this.raw.detectMimetypes(path, treeish);
	}

	private run(operationId: string, fn: () => winjs.Promise): winjs.Promise {
		return this.raw.serviceState().then(state => {
			if (state === git.RawServiceState.GitNotFound) {
				this.transition(git.ServiceState.NoGit);
				return winjs.Promise.as(null);
			} else if (state === git.RawServiceState.Disabled) {
				this.transition(git.ServiceState.Disabled);
				return winjs.Promise.as(null);
			} else {
				return this._run(operationId, fn);
			}
		});
	}

	private _run(operationId: string, fn: () => winjs.Promise): winjs.Promise {
		var operation = new operations.GitOperation(operationId, fn);

		this.operations.push(operation);
		this.emit(git.ServiceEvents.OPERATION_START, operation);
		this.emit(git.ServiceEvents.OPERATION, operation);

		var onDone = (error: any = null) => {
			var index = this.operations.indexOf(operation);

			if (index > -1) {
				this.operations.splice(index, 1);
			}

			var e = { operation: operation, error: error };
			this.emit(git.ServiceEvents.OPERATION_END, e);
			this.onGitServiceOperationEnd(e);
			this.emit(git.ServiceEvents.OPERATION, operation);
		};

		return operation.run().then((status: git.IRawStatus) => {
			this.model.update(status);

			onDone();

			if (status) {
				this.transition(types.isUndefinedOrNull(status.state) ? git.ServiceState.OK : status.state);
			} else {
				this.transition(git.ServiceState.NotARepo);
			}

			return this.model;
		}, (e) => {
			onDone(e);

			if (errors.isPromiseCanceledError(e)) {
				return winjs.Promise.wrapError(e);
			}

			var gitErrorCode: string = e.gitErrorCode || null;

			if (gitErrorCode === git.GitErrorCodes.NotAtRepositoryRoot) {
				this.transition(git.ServiceState.NotAtRepoRoot);
				return winjs.Promise.as(this.model);
			}

			this.emit(git.ServiceEvents.ERROR, e);
			this.transition(git.ServiceState.OK);

			if (gitErrorCode === git.GitErrorCodes.NoUserNameConfigured || gitErrorCode === git.GitErrorCodes.NoUserEmailConfigured) {
				this.messageService.show(severity.Warning, nls.localize('configureUsernameEmail', "Please configure your git user name and e-mail."));

				return winjs.Promise.as(null);

			} else if (gitErrorCode === git.GitErrorCodes.BadConfigFile) {
				this.messageService.show(severity.Error, nls.localize('badConfigFile', "Git {0}", e.message));
				return winjs.Promise.as(null);

			} else if (gitErrorCode === git.GitErrorCodes.UnmergedChanges) {
				this.messageService.show(severity.Warning, nls.localize('unmergedChanges', "You should first resolve the unmerged changes before committing your changes."));
				return winjs.Promise.as(null);
			}

			var error: Error;
			var showOutputAction = new actions.Action('show.gitOutput', nls.localize('showOutput', "Show Output"), null, true, () => this.outputService.showOutput('Git'));
			var cancelAction = new actions.Action('close.message', nls.localize('cancel', "Cancel"), null, true, ()=>winjs.Promise.as(true));

			error = errors.create(
				nls.localize('checkNativeConsole', "There was an issue running a git operation. Please review the output or use a console to check the state of your repository."),
				{ actions: [showOutputAction, cancelAction] }
			);

			(<any>error).gitErrorCode = gitErrorCode;
			return winjs.Promise.wrapError(error);
		});
	}

	private transition(state: git.ServiceState): void {
		var oldState = this.state;

		this.state = state;

		if (state !== oldState) {
			this.emit(git.ServiceEvents.STATE_CHANGED, state);
		}
	}

	public buffer(path: string, treeish: string = '~'): winjs.TPromise<string> {
		return this.raw.show(path, treeish);
	}

	public show(path: string, status: git.IFileStatus, treeish: string = '~', mimetype: string = 'text/plain'): winjs.Promise {
		return this.detectMimetypes(path, treeish).then((mimetypes:string[]) => {
			var pathComponents = status.getPathComponents();
			var fileSegment = pathComponents[pathComponents.length - 1];
			var folderSegment = toReadablePath(pathComponents.slice(0, pathComponents.length - 1).join('/'));

			var description:string;

			if (treeish === '~') {
				description = nls.localize('changesFromIndex', "{0} - Changes on index", folderSegment);
			} else {
				description = nls.localize('changesFromTree', "{0} - Changes on {1}", folderSegment, treeish);
			}

			if (mime.isUnspecific(mimetypes)) {
				mimetypes = mime.guessMimeTypes(path); // guess from path if our detection did not yield results
			}

			// Binary: our story is weak here for binary files on the index. Since we run natively, we do not have a way currently
			// to e.g. show images as binary inside the renderer because images need to be served through a URL to show. We could revisit this by
			// allowing to use data URLs for resource inputs to render them. However, this would mean potentially loading a large file into memory
			//
			// Our solution now is to detect binary files and immediately return an input that is flagged as binary unknown mime type.
			if (mime.isBinaryMime(mime.guessMimeTypes(path)) || mimetypes.indexOf(mime.MIME_BINARY) >= 0) {
				return winjs.Promise.wrapError(new Error('The resource seems to be binary and cannot be displayed'));
			}

			// Text
			return winjs.Promise.as(this.instantiationService.createInstance(giteditorinputs.NativeGitIndexStringEditorInput, fileSegment, description, mimetypes.join(', '), status, path, treeish));
		});
	}

	public getInput(status: git.IFileStatus): winjs.TPromise<WorkbenchEditorCommon.EditorInput> {
		return this.inputCache.getInput(status).then(null, (err) => {
			if (err.gitErrorCode = git.GitErrorCodes.CantOpenResource) {
				this.messageService.show(severity.Warning, nls.localize('cantOpenResource', "Can't open this git resource."));
				return winjs.Promise.as(null);
			}

			return winjs.Promise.wrapError(err);
		});
	}

	public isInitialized(): boolean {
		return this.state === git.ServiceState.OK;
	}

	public isIdle(): boolean {
		return this.isInitialized() && !this.operations.some(op => op.id !== git.ServiceOperations.BACKGROUND_FETCH);
	}

	public getRunningOperations(): git.IGitOperation[] {
		return this.operations;
	}

	public onOutput(): winjs.Promise {
		return this.raw.onOutput();
	}

	public getAutoFetcher(): git.IAutoFetcher {
		return this.autoFetcher;
	}

	private static toPaths(files: git.IFileStatus[]): string[] {
		if (!files) {
			return null;
		}

		return files.map((status) => {
			/*	In the case that a file was renamed in the index and (changed || deleted) in the
				working tree, we must use its new name, running the checkout command.
			*/

			switch (status.getStatus()) {
				case git.Status.MODIFIED:
				case git.Status.DELETED:
					if (status.getRename()) {
						return status.getRename();
					}

				default:
					return status.getPath();
			}
		});
	}

	public dispose(): void {
		this.emit(git.ServiceEvents.DISPOSE);

		if (this.model) {
			this.model.dispose();
			this.model = null;
		}

		if (this.remoteListenerUnbind) {
			this.remoteListenerUnbind();
			this.remoteListenerUnbind = null;
		}

		super.dispose();
	}
}