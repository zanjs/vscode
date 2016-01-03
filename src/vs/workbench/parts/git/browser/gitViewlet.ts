/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/gitViewlet';
import winjs = require('vs/base/common/winjs.base');
import lifecycle = require('vs/base/common/lifecycle');
import eventemitter = require('vs/base/common/eventEmitter');
import $ = require('vs/base/browser/builder');
import actions = require('vs/base/common/actions');
import viewlet = require('vs/workbench/browser/viewlet');
import git = require('vs/workbench/parts/git/common/git');
import contrib = require('vs/workbench/parts/git/browser/gitWorkbenchContributions');
import view = require('vs/workbench/parts/git/browser/views/view');
import changes = require('vs/workbench/parts/git/browser/views/changes/changesView');
import empty = require('vs/workbench/parts/git/browser/views/empty/emptyView');
import gitless = require('vs/workbench/parts/git/browser/views/gitless/gitlessView');
import notroot = require('vs/workbench/parts/git/browser/views/notroot/notrootView');
import noworkspace = require('vs/workbench/parts/git/browser/views/noworkspace/noworkspaceView');
import { DisabledView } from './views/disabled/disabledView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IProgressService, IProgressRunner} from 'vs/platform/progress/common/progress';
import {ISelection, Selection} from 'vs/platform/selection/common/selection';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

import IGitService = git.IGitService;

export class GitViewlet
	extends viewlet.Viewlet
	implements view.IController
{
	private progressService: IProgressService;
	private gitService: git.IGitService;
	private instantiationService: IInstantiationService;

	private $el: $.Builder;
	private currentView: view.IView;
	private progressRunner: IProgressRunner;

	private currentDimension:$.Dimension;
	private views: { [id:string]: view.IView; };

	private toDispose: lifecycle.IDisposable[];

	constructor(@ITelemetryService telemetryService: ITelemetryService, @IProgressService progressService: IProgressService, @IInstantiationService instantiationService: IInstantiationService, @IGitService gitService: IGitService) {
		super(contrib.VIEWLET_ID, telemetryService);

		this.progressService = progressService;
		this.instantiationService = instantiationService;
		this.gitService = gitService;

		this.progressRunner = null;
		this.views = <any> {};
		this.toDispose = [];

		var views: view.IView[] = [
			this.instantiationService.createInstance(changes.ChangesView, this.getActionRunner()),
			this.instantiationService.createInstance(empty.EmptyView, this, this.getActionRunner()),
			this.instantiationService.createInstance(gitless.GitlessView),
			new notroot.NotRootView(),
			new noworkspace.NoWorkspaceView(),
			new DisabledView()
		];

		views.forEach(v => {
			this.views[v.ID] = v;
			this.toDispose.push(v);
		});

		this.toUnbind.push(this.gitService.addBulkListener(() => this.onGitServiceChanges()));
	}

	// GitView.IController

	public setView(id: string): winjs.Promise {
		if (!this.$el) {
			return winjs.Promise.as(null);
		}

		var view = this.views[id];

		if (!view) {
			return winjs.Promise.wrapError(new Error('Could not find view.'));
		}

		if (this.currentView === view) {
			return winjs.Promise.as(null);
		}

		var promise = winjs.Promise.as(null);

		if (this.currentView) {
			promise = this.currentView.setVisible(false);
		}

		var element = view.element;
		this.currentView = view;
		this.updateTitleArea();

		var el = this.$el.getHTMLElement();
		while (el.firstChild) {
			el.removeChild(el.firstChild);
		}

		el.appendChild(element);
		view.layout(this.currentDimension);

		return promise.then(() => view.setVisible(true));
	}

	// Viewlet

	public create(parent:$.Builder): winjs.TPromise<void> {
		super.create(parent);

		this.$el = parent.div().addClass('git-viewlet');

		return winjs.Promise.as(null);
	}

	public setVisible(visible:boolean): winjs.TPromise<void> {
		if (visible) {
			this.onGitServiceChanges();

			this.gitService.status().done();

			return super.setVisible(visible).then(() => {
				if (this.currentView) {
					return this.currentView.setVisible(visible);
				}
			});
		} else {
			return (this.currentView ? this.currentView.setVisible(visible) : winjs.Promise.as(null)).then(() => {
				super.setVisible(visible);
			});
		}
	}

	public focus():void {
		super.focus();

		if (this.currentView) {
			this.currentView.focus();
		}
	}

	public layout(dimension:$.Dimension = this.currentDimension):void {
		this.currentDimension = dimension;

		if (this.currentView) {
			this.currentView.layout(dimension);
		}
	}

	public getActions(): actions.IAction[] {
		return this.currentView ? this.currentView.getActions() : [];
	}

	public getSecondaryActions(): actions.IAction[] {
		return this.currentView ? this.currentView.getSecondaryActions() : [];
	}

	public getSelection(): ISelection {
		if (!this.currentView) {
			return Selection.EMPTY;
		}

		return this.currentView.getSelection();
	}

	public getControl(): eventemitter.IEventEmitter {
		if (!this.currentView) {
			return null;
		}

		return this.currentView.getControl();
	}

	// Event handlers

	private onGitServiceChanges(): void {
		if (this.progressRunner) {
			this.progressRunner.done();
		}

		if (this.gitService.getState() === git.ServiceState.NoGit) {
			this.setView('gitless');
			this.progressRunner = null;
		} else if (this.gitService.getState() === git.ServiceState.Disabled) {
			this.setView('disabled');
			this.progressRunner = null;
		} else if (this.gitService.getState() === git.ServiceState.NotARepo) {
			this.setView('empty');
			this.progressRunner = null;
		} else if (this.gitService.getState() === git.ServiceState.NotAWorkspace) {
			this.setView('noworkspace');
			this.progressRunner = null;
		} else if (this.gitService.getState() === git.ServiceState.NotAtRepoRoot) {
			this.setView('notroot');
			this.progressRunner = null;
		} else if (this.gitService.isIdle()) {
			this.setView('changes');
			this.progressRunner = null;
		} else {
			this.progressRunner = this.progressService.show(true);
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		this.views = null;

		super.dispose();
	}
}
