/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./noworkspaceView';
import nls = require('vs/nls');
import winjs = require('vs/base/common/winjs.base');
import ee = require('vs/base/common/eventEmitter');
import view = require('vs/workbench/parts/git/browser/views/view');
import builder = require('vs/base/browser/builder');
import actions = require('vs/base/common/actions');
import {ISelection, Selection} from 'vs/platform/selection/common/selection';
var $ = builder.$;

export class NoWorkspaceView
	extends ee.EventEmitter
	implements view.IView
{
	public ID = 'noworkspace';
	private _element: HTMLElement;

	public get element(): HTMLElement {
		if (!this._element) {
			this.render();
		}

		return this._element;
	}

	private render(): void {
		this._element = $([
			'<div class="noworkspace-view">',
			'<p>', nls.localize('noWorkspace', "There is no currently opened folder."), '</p>',
			'<p>', nls.localize('pleaseRestart', "Open a folder with a Git repository in order to access Git features."), '</p>',
			'</div>'
		].join('')).getHTMLElement();
	}

	public focus(): void {
		return;
	}

	public layout(dimension: builder.Dimension): void {
		return;
	}

	public setVisible(visible:boolean): winjs.TPromise<void> {
		return winjs.Promise.as(null);
	}

	public getSelection(): ISelection {
		return Selection.EMPTY;
	}

	public getControl(): ee.IEventEmitter {
		return null;
	}

	public getActions(): actions.IAction[] {
		return [];
	}

	public getSecondaryActions(): actions.IAction[] {
		return [];
	}
}