/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import errors = require('vs/base/common/errors');
import { Promise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import { IAction } from 'vs/base/common/actions';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDebugService, ServiceEvents, State } from 'vs/workbench/parts/debug/common/debug';
import { IConfigurationService, ConfigurationServiceEventTypes } from 'vs/platform/configuration/common/configuration';

export class SelectConfigActionItem extends BaseActionItem {

	private select: HTMLSelectElement;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		action: IAction,
		@IDebugService private debugService: IDebugService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(null, action);

		this.select = document.createElement('select');
		this.select.className = 'debug-select action-bar-select';

		this.toDispose = [];
		this.registerListeners(configurationService);
	}

	private registerListeners(configurationService: IConfigurationService): void {
		this.toDispose.push(dom.addStandardDisposableListener(this.select, 'change', (e) => {
			this.actionRunner.run(this._action, e.target.value).done(null, errors.onUnexpectedError);
		}));
		this.toDispose.push(this.debugService.addListener2(ServiceEvents.STATE_CHANGED, () => {
			this.select.disabled = this.debugService.getState() !== State.Inactive;
		}));
		this.toDispose.push(configurationService.addListener2(ConfigurationServiceEventTypes.UPDATED, e  => {
			this.setOptions().done(null, errors.onUnexpectedError);
		}));
	}

	public render(container: HTMLElement): void {
		dom.addClass(container, 'select-container');
		container.appendChild(this.select);
		this.setOptions().done(null, errors.onUnexpectedError);
	}

	private setOptions(): Promise {
		let previousSelectedIndex = this.select.selectedIndex;
		this.select.options.length = 0;

		return this.debugService.loadLaunchConfig().then(config => {
			if (!config || !config.configurations) {
				this.select.options.add(this.createOption('<none>'));
				this.select.disabled = true;
				return;
			}

			const configurations = config.configurations;
			this.select.disabled = configurations.length < 1;

			let found = false;
			const configurationName = this.debugService.getConfigurationName();
			for (let i = 0; i < configurations.length; i++) {
				this.select.options.add(this.createOption(configurations[i].name));
				if (configurationName === configurations[i].name) {
					this.select.selectedIndex = i;
					found = true;
				}
			}

			if (!found && configurations.length > 0) {
				if (!previousSelectedIndex || previousSelectedIndex < 0 || previousSelectedIndex >= configurations.length) {
					previousSelectedIndex = 0;
				}
				this.select.selectedIndex = previousSelectedIndex;
				return this.actionRunner.run(this._action, configurations[previousSelectedIndex].name);
			}
		});
	}

	private createOption(value: string): HTMLOptionElement {
		const option = document.createElement('option');
		option.value = value;
		option.text = value;

		return option;
	}

	public dispose(): void {
		this.debugService = null;
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}
}