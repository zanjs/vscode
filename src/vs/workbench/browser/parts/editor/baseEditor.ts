/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Action, IAction} from 'vs/base/common/actions';
import {ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import types = require('vs/base/common/types');
import {Builder} from 'vs/base/browser/builder';
import {Registry} from 'vs/platform/platform';
import {Viewlet} from 'vs/workbench/browser/viewlet';
import {EditorInput, IFileEditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {IEditor, Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IInstantiationService, IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor, AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

/**
 * The base class of editors in the workbench. Editors register themselves for specific editor inputs.
 * Editors are layed out in the editor part of the workbench. Only one editor can be open at a time.
 * Each editor has a minimized representation that is good enough to provide some information about the
 * state of the editor data.
 * The workbench will keep an editor alive after it has been created and show/hide it based on
 * user interaction. The lifecycle of a editor goes in the order create(), setVisible(true|false),
 * layout(), setInput(), focus(), dispose(). During use of the workbench, a editor will often receive a
 * clearInput, setVisible, layout and focus call, but only one create and dispose call.
 *
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseEditor extends Viewlet implements IEditor {
	private _input: EditorInput;
	private _options: EditorOptions;
	private _position: Position;

	constructor(id: string, telemetryService: ITelemetryService) {
		super(id, telemetryService);
	}

	public get input(): EditorInput {
		return this._input;
	}

	/**
	 * Returns the current input of this editor or null if none.
	 */
	public getInput(): EditorInput {
		return this._input || null;
	}

	public get options(): EditorOptions {
		return this._options;
	}

	/**
	 * Returns the current options of this editor or null if none.
	 */
	public getOptions(): EditorOptions {
		return this._options || null;
	}

	/**
	 * Note: Clients should not call this method, the monaco workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Sets the given input with the options to the part. An editor has to deal with the
	 * situation that the same input is being set with different options.
	 */
	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		this._input = input;
		this._options = options;

		return TPromise.as<void>(null);
	}

	/**
	 * Called to indicate to the editor that the input should be cleared and resources associated with the
	 * input should be freed.
	 */
	public clearInput(): void {
		this._input = null;
		this._options = null;
	}

	public create(parent: Builder): TPromise<void> {
		let res = super.create(parent);

		// Create Editor
		this.createEditor(parent);

		return res;
	}

	/**
	 * Called to create the editor in the parent builder.
	 */
	public abstract createEditor(parent: Builder): void;

	/**
	 * Overload this function to allow for passing in a position argument.
	 */
	public setVisible(visible: boolean, position: Position = null): TPromise<void> {
		let promise = super.setVisible(visible);

		this._position = position;

		return promise;
	}

	/**
	 * Called when the position of the editor changes while it is visible.
	 */
	public changePosition(position: Position): void {
		this._position = position;
	}

	/**
	 * The position this editor is showing in or null if none.
	 */
	public get position(): Position {
		return this._position;
	}

	/**
	 * Controls if the editor shows an action to split the input of the editor to the side. Subclasses should override
	 * if they are capable of showing the same editor input side by side.
	 */
	public supportsSplitEditor(): boolean {
		return false;
	}

	public dispose(): void {
		this._input = null;
		this._options = null;

		// Super Dispose
		super.dispose();
	}
}

/**
 * A lightweight descriptor of an editor. The descriptor is deferred so that heavy editors
 * can load lazily in the workbench.
 */
export class EditorDescriptor extends AsyncDescriptor<BaseEditor> {
	private id: string;
	private name: string;

	constructor(id: string, name: string, moduleId: string, ctorName: string) {
		super(moduleId, ctorName);

		this.id = id;
		this.name = name;
	}

	public getId(): string {
		return this.id;
	}

	public getName(): string {
		return this.name;
	}

	public describes(obj: any): boolean {
		return obj instanceof BaseEditor && (<BaseEditor>obj).getId() === this.id;
	}
}

export const Extensions = {
	Editors: 'workbench.contributions.editors'
};

export interface IEditorRegistry {

	/**
	 * Registers an editor to the platform for the given input type. The second parameter also supports an
	 * array of input classes to be passed in. If the more than one editor is registered for the same editor
	 * input, the input itself will be asked which editor it prefers if this method is provided. Otherwise
	 * the first editor in the list will be returned.
	 *
	 * @param editorInputDescriptor a constructor function that returns an instance of EditorInput for which the
	 * registered editor should be used for.
	 */
	registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>): void;
	registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>[]): void;

	/**
	 * Returns the editor descriptor for the given input or null if none.
	 */
	getEditor(input: EditorInput): EditorDescriptor;

	/**
	 * Returns the editor descriptor for the given identifier or null if none.
	 */
	getEditorById(editorId: string): EditorDescriptor;

	/**
	 * Returns an array of registered editors known to the platform.
	 */
	getEditors(): EditorDescriptor[];

	/**
	 * Registers the default input to be used for files in the workbench.
	 *
	 * @param editorInputDescriptor a descriptor that resolves to an instance of EditorInput that
	 * should be used to handle file inputs.
	 */
	registerDefaultFileInput(editorInputDescriptor: AsyncDescriptor<IFileEditorInput>): void;

	/**
	 * Returns a descriptor of the default input to be used for files in the workbench.
	 *
	 * @return a descriptor that resolves to an instance of EditorInput that should be used to handle
	 * file inputs.
	 */
	getDefaultFileInput(): AsyncDescriptor<IFileEditorInput>;

	/**
	 * Registers a editor input factory for the given editor input to the registry. An editor input factory
	 * is capable of serializing and deserializing editor inputs from string data.
	 *
	 * @param editorInputId the identifier of the editor input
	 * @param factory the editor input factory for serialization/deserialization
	 */
	registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void;

	/**
	 * Returns the editor input factory for the given editor input.
	 *
	 * @param editorInputId the identifier of the editor input
	 */
	getEditorInputFactory(editorInputId: string): IEditorInputFactory;

	setInstantiationService(service: IInstantiationService): void;
}

export interface IEditorInputFactory {

	/**
	 * Returns a string representation of the provided editor input that contains enough information
	 * to deserialize back to the original editor input from the deserialize() method.
	 */
	serialize(editorInput: EditorInput): string;

	/**
	 * Returns an editor input from the provided serialized form of the editor input. This form matches
	 * the value returned from the serialize() method.
	 */
	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput;
}

const INPUT_DESCRIPTORS_PROPERTY = '__$inputDescriptors';

class EditorRegistry implements IEditorRegistry {
	private editors: EditorDescriptor[];
	private instantiationService: IInstantiationService;
	private defaultFileInputDescriptor: AsyncDescriptor<IFileEditorInput>;
	private editorInputFactoryConstructors: { [editorInputId: string]: IConstructorSignature0<IEditorInputFactory> } = Object.create(null);
	private editorInputFactoryInstances: { [editorInputId: string]: IEditorInputFactory } = Object.create(null);

	constructor() {
		this.editors = [];
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;

		for (let key in this.editorInputFactoryConstructors) {
			let element = this.editorInputFactoryConstructors[key];
			this.createEditorInputFactory(key, element);
		}

		this.editorInputFactoryConstructors = {};
	}

	private createEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		let instance = this.instantiationService.createInstance(ctor);
		this.editorInputFactoryInstances[editorInputId] = instance;
	}

	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: SyncDescriptor<EditorInput>[]): void;
	public registerEditor(descriptor: EditorDescriptor, editorInputDescriptor: any): void {

		// Support both non-array and array parameter
		let inputDescriptors: SyncDescriptor<EditorInput>[] = [];
		if (!types.isArray(editorInputDescriptor)) {
			inputDescriptors.push(editorInputDescriptor);
		} else {
			inputDescriptors = editorInputDescriptor;
		}

		// Register (Support multiple Editors per Input)
		descriptor[INPUT_DESCRIPTORS_PROPERTY] = inputDescriptors;
		this.editors.push(descriptor);
	}

	public getEditor(input: EditorInput): EditorDescriptor {
		let findEditorDescriptors = (input: EditorInput, byInstanceOf?: boolean): EditorDescriptor[]=> {
			let matchingDescriptors: EditorDescriptor[] = [];

			for (let i = 0; i < this.editors.length; i++) {
				let editor = this.editors[i];
				let inputDescriptors = <SyncDescriptor<EditorInput>[]>editor[INPUT_DESCRIPTORS_PROPERTY];
				for (let j = 0; j < inputDescriptors.length; j++) {
					let inputClass = inputDescriptors[j].ctor;

					// Direct check on constructor type (ignores prototype chain)
					if (!byInstanceOf && (<any>input).constructor === inputClass) {
						matchingDescriptors.push(editor);
						break;
					}

					// Normal instanceof check
					else if (byInstanceOf && input instanceof inputClass) {
						matchingDescriptors.push(editor);
						break;
					}
				}
			}

			// If no descriptors found, continue search using instanceof and prototype chain
			if (!byInstanceOf && matchingDescriptors.length === 0) {
				return findEditorDescriptors(input, true);
			}

			if (byInstanceOf) {
				return matchingDescriptors;
			}

			return matchingDescriptors;
		};

		let descriptors = findEditorDescriptors(input);
		if (descriptors && descriptors.length > 0) {

			// Ask the input for its preferred Editor
			let preferredEditorId = input.getPreferredEditorId(descriptors.map(d => d.getId()));
			if (preferredEditorId) {
				return this.getEditorById(preferredEditorId);
			}

			// Otherwise, first come first serve
			return descriptors[0];
		}

		return null;
	}

	public getEditorById(editorId: string): EditorDescriptor {
		for (let i = 0; i < this.editors.length; i++) {
			let editor = this.editors[i];
			if (editor.getId() === editorId) {
				return editor;
			}
		}

		return null;
	}

	public getEditors(): EditorDescriptor[] {
		return this.editors.slice(0);
	}

	public setEditors(editorsToSet: EditorDescriptor[]): void {
		this.editors = editorsToSet;
	}

	public getEditorInputs(): any[] {
		let inputClasses: any[] = [];
		for (let i = 0; i < this.editors.length; i++) {
			let editor = this.editors[i];
			let editorInputDescriptors = <SyncDescriptor<EditorInput>[]>editor[INPUT_DESCRIPTORS_PROPERTY];
			inputClasses.push(...editorInputDescriptors.map(descriptor=> descriptor.ctor));
		}

		return inputClasses;
	}

	public registerDefaultFileInput(editorInputDescriptor: AsyncDescriptor<IFileEditorInput>): void {
		this.defaultFileInputDescriptor = editorInputDescriptor;
	}

	public getDefaultFileInput(): AsyncDescriptor<IFileEditorInput> {
		return this.defaultFileInputDescriptor;
	}

	public registerEditorInputFactory(editorInputId: string, ctor: IConstructorSignature0<IEditorInputFactory>): void {
		if (!this.instantiationService) {
			this.editorInputFactoryConstructors[editorInputId] = ctor;
		} else {
			this.createEditorInputFactory(editorInputId, ctor);
		}
	}

	public getEditorInputFactory(editorInputId: string): IEditorInputFactory {
		return this.editorInputFactoryInstances[editorInputId];
	}
}

Registry.add(Extensions.Editors, new EditorRegistry());

/**
 * The context that will be passed in to the EditorInputActionContributor.
 */
export interface IEditorInputActionContext {
	editor: BaseEditor;
	input: EditorInput;
	position: Position;
}

/**
 * A variant of the action bar contributor to register actions to specific editor inputs of the editor. This allows to have more
 * fine grained control over actions compared to contributing an action to a specific editor.
 */
export class EditorInputActionContributor extends ActionBarContributor {

	// The following data structures are partitioned into arrays of Position (left, center, right)
	private mapEditorInputActionContextToPrimaryActions: { [id: string]: IEditorInputAction[] }[];
	private mapEditorInputActionContextToSecondaryActions: { [id: string]: IEditorInputAction[] }[];

	constructor() {
		super();

		this.mapEditorInputActionContextToPrimaryActions = this.createPositionArray();
		this.mapEditorInputActionContextToSecondaryActions = this.createPositionArray();
	}

	private createPositionArray(): any[] {
		let array: any[] = [];

		for (let i = 0; i < POSITIONS.length; i++) {
			array[i] = {};
		}

		return array;
	}

	/* Subclasses can override to provide a custom cache implementation */
	protected toId(context: IEditorInputActionContext): string {
		return context.editor.getId() + context.input.getId();
	}

	private clearInputsFromCache(position: Position, isPrimary: boolean): void {
		if (isPrimary) {
			this.doClearInputsFromCache(this.mapEditorInputActionContextToPrimaryActions[position]);
		} else {
			this.doClearInputsFromCache(this.mapEditorInputActionContextToSecondaryActions[position]);
		}
	}

	private doClearInputsFromCache(cache: { [id: string]: IEditorInputAction[] }): void {
		for (let key in cache) {
			if (cache.hasOwnProperty(key)) {
				let cachedActions = cache[key];
				cachedActions.forEach((action) => {
					action.input = null;
					action.position = null;
				});
			}
		}
	}

	/**
	 * Returns true if this contributor has actions for the given editor input. Subclasses must not
	 * override this method but instead hasActionsForEditorInput();
	 */
	public hasActions(context: IEditorInputActionContext): boolean {
		if (!this.checkEditorContext(context)) {
			return false;
		}

		// Ask Cache
		if (this.mapEditorInputActionContextToPrimaryActions[context.position][this.toId(context)]) {
			return true;
		}

		// Ask Client
		return this.hasActionsForEditorInput(context);
	}

	/**
	 * Returns an array of actions for the given editor input. Subclasses must not override this
	 * method but instead getActionsForEditorInput();
	 */
	public getActions(context: IEditorInputActionContext): IAction[] {
		if (!this.checkEditorContext(context)) {
			return [];
		}

		// This will cause any cached action to be set with null for the current editor input to prevent
		// leaking actions that still think the current editor input is what was set before.
		this.clearInputsFromCache(context.position, true /* primary actions */);

		// First consult cache
		let editorInput = context.input;
		let editorPosition = context.position;
		let cachedActions = this.mapEditorInputActionContextToPrimaryActions[context.position][this.toId(context)];
		if (cachedActions) {

			// Update the input field and position in all actions to indicate this change and return
			cachedActions.forEach((action) => {
				action.input = editorInput;
				action.position = editorPosition;
			});

			return cachedActions;
		}

		// Otherwise collect and keep in cache
		let actions = this.getActionsForEditorInput(context);
		actions.forEach((action) => {
			action.input = editorInput;
			action.position = editorPosition;
		});

		this.mapEditorInputActionContextToPrimaryActions[context.position][this.toId(context)] = actions;

		return actions;
	}

	/**
	 * Returns true if this contributor has actions for the given editor input. Subclasses must not
	 * override this method but instead hasSecondaryActionsForEditorInput();
	 */
	public hasSecondaryActions(context: IEditorInputActionContext): boolean {
		if (!this.checkEditorContext(context)) {
			return false;
		}

		// Ask Cache
		if (this.mapEditorInputActionContextToSecondaryActions[context.position][this.toId(context)]) {
			return true;
		}

		// Ask Client
		return this.hasSecondaryActionsForEditorInput(context);
	}

	/**
	 * Returns an array of actions for the given editor input. Subclasses must not override this
	 * method but instead getSecondaryActionsForEditorInput();
	 */
	public getSecondaryActions(context: IEditorInputActionContext): IAction[] {
		if (!this.checkEditorContext(context)) {
			return [];
		}

		// This will cause any cached action to be set with null for the current editor input to prevent
		// leaking actions that still think the current editor input is what was set before.
		this.clearInputsFromCache(context.position, false /* secondary actions */);

		// First consult cache
		let editorInput = context.input;
		let editorPosition = context.position;
		let cachedActions = this.mapEditorInputActionContextToSecondaryActions[context.position][this.toId(context)];
		if (cachedActions) {

			// Update the input field and position in all actions to indicate this change and return
			cachedActions.forEach((action) => {
				action.input = editorInput;
				action.position = editorPosition;
			});

			return cachedActions;
		}

		// Otherwise collect and keep in cache
		let actions = this.getSecondaryActionsForEditorInput(context);
		actions.forEach((action) => {
			action.input = editorInput;
			action.position = editorPosition;
		});

		this.mapEditorInputActionContextToSecondaryActions[context.position][this.toId(context)] = actions;

		return actions;
	}

	private checkEditorContext(context: IEditorInputActionContext): boolean {
		return context && context.input instanceof EditorInput && context.editor instanceof BaseEditor && !types.isUndefinedOrNull(context.position);
	}

	/**
	 * Returns true if this contributor has primary actions for the given editor input.
	 */
	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return false;
	}

	/**
	 * Returns an array of primary actions for the given editor input.
	 */
	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		return [];
	}

	/**
	 * Returns true if this contributor has secondary actions for the given editor input.
	 */
	public hasSecondaryActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return false;
	}

	/**
	 * Returns an array of secondary actions for the given editor input.
	 */
	public getSecondaryActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		return [];
	}
}

/**
 * An editorinput action is contributed to an editor based on the editor input of the editor that is currently
 * active. When the editor input changes, the action will be get the new editor input set so that the enablement
 * state can be updated. In addition the position of the editor for the given input is applied.
 */
export interface IEditorInputAction extends IAction {

	/**
	 * The input of the editor for which this action is running.
	 */
	input: EditorInput;

	/**
	 * The position of the editor for which this action is running.
	 */
	position: Position;

	/**
	 * Implementors to define if the action is enabled or not.
	 */
	isEnabled(): boolean;
}

export class EditorInputAction extends Action implements IEditorInputAction {
	private _input: EditorInput;
	private _position: Position;

	public get input(): EditorInput {
		return this._input;
	}

	public set input(input: EditorInput) {
		this._input = input;
		this.enabled = this.isEnabled();
	}

	public get position(): Position {
		return this._position;
	}

	public set position(position: Position) {
		this._position = position;
	}

	public isEnabled(): boolean {
		return !!this._input;
	}
}