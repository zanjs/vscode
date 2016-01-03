/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEventEmitter} from 'vs/base/common/eventEmitter';

import {ISelection} from 'vs/platform/selection/common/selection';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var IEditorService = createDecorator<IEditorService>('editorService');

export interface IEditorService {
	serviceId: ServiceIdentifier<any>;
	/**
	 * Specific overload to open an instance of IResourceInput.
	 */
	openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Specific overload to resolve a IResourceInput to an editor model with a text representation.
	 */
	resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
}

export interface IEditorModel extends IEventEmitter {
}

export interface ITextEditorModel extends IEditorModel {
	textEditorModel: any;
}

export interface IResourceInput extends ITextInput {

	/**
	 * The resource URL of the resource to open.
	 */
	resource: URI;
}

export interface ITextInput {

	/**
	 * The mime type of the text input if known.
	 */
	mime?: string;

	/**
	 * Optional options to use when opening the text input.
	 */
	options?: {

		/**
		 * Text editor selection.
		 */
		selection?: {
			startLineNumber: number;
			startColumn: number;
			endLineNumber?: number;
			endColumn?: number;
		};

		/**
		 * Will force the editor to open even if the input is already showing.
		 */
		forceOpen?: boolean;

		/**
		 * Will open the editor but not move keyboard focus into the editor.
		 */
		preserveFocus?: boolean;

		/**
		 * Ensures that the editor is being activated even if the input is already showing. This only applies
		 * if there is more than one editor open already and preserveFocus is set to false.
		 */
		forceActive?: boolean;
	};
}

export interface IEditor {

	/**
	 * The assigned input of this editor.
	 */
	input: IEditorInput;

	/**
	 * The assigned options of this editor.
	 */
	options: IEditorOptions;

	/**
	 * The assigned position of this editor.
	 */
	position: Position;

	/**
	 * Returns the unique identifier of this editor.
	 */
	getId(): string;

	/**
	 * Returns the underlying control of this editor.
	 */
	getControl(): IEventEmitter;

	/**
	 * Returns the selection of this editor.
	 */
	getSelection(): ISelection;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;
}

/**
 * Possible locations for opening an editor.
 */
export enum Position {

	/** Opens the editor in the LEFT most position replacing the input currently showing */
	LEFT = 0,

	/** Opens the editor in the CENTER position replacing the input currently showing */
	CENTER = 1,

	/** Opens the editor in the RIGHT most position replacing the input currently showing */
	RIGHT = 2
}

export var POSITIONS = [Position.LEFT, Position.CENTER, Position.RIGHT];

export interface IEditorInput extends IEventEmitter {

	/**
	 * Returns the identifier of this input or null if none.
	 */
	getId(): string;

	/**
	 * Returns the display name of this input.
	 */
	getName(): string;

	/**
	 * Returns if the other object matches this input.
	 */
	matches(other: any): boolean;
}

export interface IEditorOptions {

	/**
	 * Returns if the other object matches this options.
	 */
	matches(other: any): boolean;
}
