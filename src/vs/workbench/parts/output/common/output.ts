/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import {Registry} from 'vs/platform/platform';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {IEditor, Position} from 'vs/platform/editor/common/editor';

/**
 * Mime type used by the output editor.
 */
export const OUTPUT_MIME = 'text/x-monaco-output';

/**
 * Id used by the output editor.
 */
export const OUTPUT_MODE_ID = 'Log';

/**
 * Output editor input id.
 */
export const OUTPUT_EDITOR_INPUT_ID = 'vs.output';

/**
 * Output from any not defined channel is here
 */
export const DEFAULT_OUTPUT_CHANNEL = '';

export const Extensions = {
	OutputChannels: 'workbench.contributions.outputChannels'
};

export const OUTPUT_SERVICE_ID = 'outputService';

/**
 * The output event informs when new output got received.
 */
export interface IOutputEvent {
	output: string;
	channel?: string;
}

export var IOutputService = createDecorator<IOutputService>(OUTPUT_SERVICE_ID);

/**
 * The output service to manage output from the various processes running.
 */
export interface IOutputService {
	serviceId: ServiceIdentifier<any>;
	/**
	 * Appends output to the given channel.
	 */
	append(output: string): void;
	append(channel: string, output: string): void;

	/**
	 * Returns the received output.
	 *
	 * The optional channel allows to ask for output for a specific channel. If you leave the
	 * channel out, you get the default channels output.
	 */
	getOutput(channel?: string): string;

	/**
	 * Returns all channels that received output in the current session.
	 */
	getChannels(): string[];

	/**
	 * Clears all received output.
	 *
	 * The optional channel allows to clear the output for a specific channel. If you leave the
	 * channel out, you get clear the default channels output.
	 */
	clearOutput(channel?: string): void;

	/**
	 * Opens the output for the given channel
	 *
	 * The optional channel allows to show the output for a specific channel. If you leave the
	 * channel out, you show the default channels output.
	 */
	showOutput(channel?: string, sideBySide?: boolean|Position, preserveFocus?: boolean): TPromise<IEditor>;

	/**
	 * Allows to register on Output events
	 */
	onOutput: Event<IOutputEvent>;

	/**
	 * Allows to register on a new Output channel getting filled with output
	 */
	onOutputChannel: Event<string>;
}

export interface IOutputChannelRegistry {

	/**
	 * Make an output channel known to the output world.
	 */
	registerChannel(name: string): void;

	/**
	 * Returns the list of channels known to the output world.
	 */
	getChannels(): string[];
}

class OutputChannelRegistry implements IOutputChannelRegistry {
	private channels: string[];

	constructor() {
		this.channels = [];
	}

	public registerChannel(name: string): void {
		if (this.channels.indexOf(name) === -1) {
			this.channels.push(name);
		}
	}

	public getChannels(): string[] {
		return this.channels.slice(0);
	}
}

Registry.add(Extensions.OutputChannels, new OutputChannelRegistry());