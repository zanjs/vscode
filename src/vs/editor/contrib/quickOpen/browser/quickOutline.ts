/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import 'vs/css!./quickOutline';
import nls = require('vs/nls');
import Arrays = require('vs/base/common/arrays');
import {TPromise} from 'vs/base/common/winjs.base';
import Errors = require('vs/base/common/errors');
import Strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import Filters = require('vs/base/common/filters');
import QuickOpenWidget = require('vs/base/parts/quickopen/browser/quickOpenWidget');
import QuickOpenModel = require('vs/base/parts/quickopen/browser/quickOpenModel');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import EditorQuickOpen = require('./editorQuickOpen');
import {Behaviour} from 'vs/editor/common/editorAction';
import {INullService} from 'vs/platform/instantiation/common/instantiation';

var SCOPE_PREFIX = ':';

class SymbolEntry extends QuickOpenModel.QuickOpenEntryGroup {
	private name:string;
	private meta:string;
	private type: string;
	private description: string;
	private range:EditorCommon.IRange;
	private editor:EditorCommon.ICommonCodeEditor;
	private decorator:EditorQuickOpen.IDecorator;

	constructor(name:string, meta:string, type:string, description:string, range:EditorCommon.IRange, highlights:QuickOpenModel.IHighlight[], editor:EditorCommon.ICommonCodeEditor, decorator:EditorQuickOpen.IDecorator) {
		super();

		this.name = name;
		this.meta = meta;
		this.type = type;
		this.description = description;
		this.range = range;
		this.setHighlights(highlights);
		this.editor = editor;
		this.decorator = decorator;
	}

	public getLabel():string {
		return this.name;
	}

	public getMeta():string {
		return this.meta;
	}

	public getIcon():string {
		return this.type;
	}

	public getDescription():string {
		return this.description;
	}

	public getType():string {
		return this.type;
	}

	public getRange():EditorCommon.IRange {
		return this.range;
	}

	public run(mode:QuickOpen.Mode, context:QuickOpenModel.IContext):boolean {
		if (mode === QuickOpen.Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(context:QuickOpenModel.IContext):boolean {

		// Apply selection and focus
		var range = this.toSelection();
		this.editor.setSelection(range);
		this.editor.revealRangeInCenter(range);
		this.editor.focus();

		return true;
	}

	private runPreview():boolean {

		// Select Outline Position
		var range = this.toSelection();
		this.editor.revealRangeInCenter(range);

		// Decorate if possible
		this.decorator.decorateLine(this.range, this.editor);

		return false;
	}

	private toSelection():EditorCommon.IRange {
		return {
			startLineNumber: this.range.startLineNumber,
			startColumn: this.range.startColumn || 1,
			endLineNumber: this.range.startLineNumber,
			endColumn: this.range.startColumn || 1
		};
	}
}

interface OutlineNode {
	label:string;
	type:string;
	range:EditorCommon.IRange;
	children?:OutlineNode[];
	parentScope?:string[];
}

export class QuickOutlineAction extends EditorQuickOpen.BaseEditorQuickOpenAction {

	public static ID = 'editor.action.quickOutline';

	private cachedResult:Modes.IOutlineEntry[];

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, nls.localize('QuickOutlineAction.label', "Go to Symbol..."), Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
	}

	public getGroupId(): string {
		return '1_goto/5_visitSymbol';
	}

	public isSupported(): boolean {
		var mode = this.editor.getModel().getMode();

		return !!mode && !!mode.outlineSupport && super.isSupported();
	}

	public run():TPromise<boolean> {
		var model = this.editor.getModel();
		var mode = model.getMode();
		var outlineSupport = mode.outlineSupport;

		// Only works for models with outline support
		if(!outlineSupport) {
			return null;
		}

		// Resolve outline
		var promise = outlineSupport.getOutline(model.getAssociatedResource());
		return promise.then((result:Modes.IOutlineEntry[])=>{
			if (Array.isArray(result) && result.length > 0) {

				// Cache result
				this.cachedResult = result;

				return super.run();
			}

			return TPromise.as(true);
		}, (err)=>{
			Errors.onUnexpectedError(err);
			return false;
		});
	}

	_getModel(value:string):QuickOpenModel.QuickOpenModel {
		var model = new QuickOpenModel.QuickOpenModel();
		var entries = this.toQuickOpenEntries(this.cachedResult, value);
		model.addEntries(entries);

		return model;
	}

	_getAutoFocus(searchValue:string):QuickOpen.IAutoFocus {

		// Remove any type pattern (:) from search value as needed
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			searchValue = searchValue.substr(SCOPE_PREFIX.length);
		}

		return {
			autoFocusPrefixMatch: searchValue,
			autoFocusFirstEntry: !!searchValue
		};
	}

	_getInputAriaLabel(): string {
		return nls.localize('quickOutlineActionInput', "Type the name of an identifier you wish to navigate to");
	}

	private toQuickOpenEntries(outline:OutlineNode[], searchValue:string):SymbolEntry[] {
		var results:SymbolEntry[] = [];

		// Flatten
		var flattened:OutlineNode[] = [];
		if (outline) {
			this.flatten(outline, flattened);
		}

		// Convert to Entries
		var normalizedSearchValue = searchValue;
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			normalizedSearchValue = normalizedSearchValue.substr(SCOPE_PREFIX.length);
		}

		for (var i = 0; i < flattened.length; i++) {
			var element = flattened[i];
			var label = Strings.trim(element.label);
			var meta:string = null;

			// Parse out parameters from method/function if present
			if (element.type === 'method' || element.type === 'function') {
				var indexOf = label.indexOf('(');
				if (indexOf > 0) {
					meta = label.substr(indexOf);
					label = label.substr(0, indexOf);
				} else {
					meta = '()'; // otherwise make clear this is a method by adding ()
				}
			}

			// Check for meatch
			var highlights = Filters.matchesFuzzy(normalizedSearchValue, label);
			if (highlights) {

				// Show parent scope as description
				var description:string = null;
				if (element.parentScope) {
					description = Arrays.tail(element.parentScope);
				}

				// Add
				results.push(new SymbolEntry(label, meta, element.type, description, element.range, highlights, this.editor, this));
			}
		}

		// Sort properly if actually searching
		if (searchValue) {
			if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
				results = results.sort(this.sortScoped.bind(this, searchValue.toLowerCase()));
			} else {
				results = results.sort(this.sortNormal.bind(this, searchValue.toLowerCase()));
			}
		}

		// Mark all type groups
		if (results.length > 0 && searchValue.indexOf(SCOPE_PREFIX) === 0) {
			var currentType:string = null;
			var currentResult:SymbolEntry = null;
			var typeCounter = 0;

			for (var i = 0; i < results.length; i++) {
				var result = results[i];

				// Found new type
				if (currentType !== result.getType()) {

					// Update previous result with count
					if (currentResult) {
						currentResult.setGroupLabel(this.typeToLabel(currentType, typeCounter));
					}

					currentType = result.getType();
					currentResult = result;
					typeCounter = 1;

					result.setShowBorder(i > 0);
				}

				// Existing type, keep counting
				else {
					typeCounter++;
				}
			}

			// Update previous result with count
			if (currentResult) {
				currentResult.setGroupLabel(this.typeToLabel(currentType, typeCounter));
			}
		}

		// Mark first entry as outline
		else if (results.length > 0) {
			results[0].setGroupLabel(nls.localize('symbols', "symbols ({0})", results.length));
		}

		return results;
	}

	private typeToLabel(type:string, count:number):string {
		switch(type) {
			case 'module': return nls.localize('modules', "modules ({0})", count);
			case 'class': return nls.localize('class', "classes ({0})", count);
			case 'interface': return nls.localize('interface', "interfaces ({0})", count);
			case 'method': return nls.localize('method', "methods ({0})", count);
			case 'function': return nls.localize('function', "functions ({0})", count);
			case 'property': return nls.localize('property', "properties ({0})", count);
			case 'variable': return nls.localize('variable', "variables ({0})", count);
			case 'var': return nls.localize('variable2', "variables ({0})", count);
			case 'constructor': return nls.localize('_constructor', "constructors ({0})", count);
			case 'call': return nls.localize('call', "calls ({0})", count);
		}

		return type;
	}

	private flatten(outline:OutlineNode[], flattened:OutlineNode[], parentScope?:string[]):void {
		for (var i = 0; i < outline.length; i++) {
			var element = outline[i];
			flattened.push(element);

			if (parentScope) {
				element.parentScope = parentScope;
			}

			if (element.children) {
				var elementScope:string[] = [];
				if (parentScope) {
					elementScope = parentScope.slice(0);
				}
				elementScope.push(element.label);

				this.flatten(element.children, flattened, elementScope);
			}
		}
	}

	private sortNormal(searchValue:string, elementA:SymbolEntry, elementB:SymbolEntry):number {
		var elementAName = elementA.getLabel().toLowerCase();
		var elementBName = elementB.getLabel().toLowerCase();

		// Compare by name
		var r = Strings.localeCompare(elementAName, elementBName);
		if (r !== 0) {
			return r;
		}

		// If name identical sort by range instead
		var elementARange = elementA.getRange();
		var elementBRange = elementB.getRange();
		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private sortScoped(searchValue:string, elementA:SymbolEntry, elementB:SymbolEntry):number {

		// Remove scope char
		searchValue = searchValue.substr(SCOPE_PREFIX.length);

		// Sort by type first if scoped search
		var elementAType = elementA.getType();
		var elementBType = elementB.getType();
		var r = Strings.localeCompare(elementAType, elementBType);
		if (r !== 0) {
			return r;
		}

		// Special sort when searching in scoped mode
		if (searchValue) {
			var elementAName = elementA.getLabel().toLowerCase();
			var elementBName = elementB.getLabel().toLowerCase();

			// Compare by name
			var r = Strings.localeCompare(elementAName, elementBName);
			if (r !== 0) {
				return r;
			}
		}

		// Default to sort by range
		var elementARange = elementA.getRange();
		var elementBRange = elementB.getRange();
		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	_onClose(canceled:boolean):void {
		super._onClose(canceled);

		// Clear Cache
		this.cachedResult = null;
	}

	public dispose(): void {
		super.dispose();

		// Clear Cache
		this.cachedResult = null;
	}
}