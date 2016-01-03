/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/gotoSymbolHandler';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import arrays = require('vs/base/common/arrays');
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import {IContext, Mode, IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenModel, IHighlight} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
import {Extensions as QuickOpenExtensions, QuickOpenHandler, EditorQuickOpenEntryGroup} from 'vs/workbench/browser/quickopen';
import {QuickOpenAction} from 'vs/workbench/browser/actions/quickOpenAction';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {TextEditorOptions, EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import filters = require('vs/base/common/filters');
import {IEditor, IModelDecorationsChangeAccessor, OverviewRulerLane, IModelDeltaDecoration, IRange, IModel, ITokenizedModel, IDiffEditorModel, IEditorViewState} from 'vs/editor/common/editorCommon';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {Position} from 'vs/platform/editor/common/editor';
import {OutlineRegistry, getOutlineEntries} from 'vs/editor/contrib/quickOpen/common/quickOpen';

export const GOTO_SYMBOL_PREFIX = '@';
export const SCOPE_PREFIX = ':';

export class GotoSymbolAction extends QuickOpenAction {

	public static ID = 'workbench.action.gotoSymbol';
	public static LABEL = nls.localize('gotoSymbol', "Go to Symbol...");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, GOTO_SYMBOL_PREFIX, quickOpenService);
	}
}

class OutlineModel extends QuickOpenModel {
	private outline: Outline;

	constructor(outline: Outline, entries: SymbolEntry[]) {
		super(entries);

		this.outline = outline;
	}

	public dofilter(searchValue: string): void {

		// Normalize search
		let normalizedSearchValue = searchValue;
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			normalizedSearchValue = normalizedSearchValue.substr(SCOPE_PREFIX.length);
		}

		// Check for match and update visibility and group label
		this.entries.forEach((entry: SymbolEntry) => {

			// Clear all state first
			entry.setGroupLabel(null);
			entry.setShowBorder(false);
			entry.setHighlights(null);
			entry.setHidden(false);

			// Filter by search
			if (normalizedSearchValue) {
				let highlights = filters.matchesFuzzy(normalizedSearchValue, entry.getLabel());
				if (highlights) {
					entry.setHighlights(highlights);
					entry.setHidden(false);
				} else if (!entry.isHidden()) {
					entry.setHidden(true);
				}
			}
		});

		// Sort properly if actually searching
		if (searchValue) {
			if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
				this.entries.sort(this.sortScoped.bind(this, searchValue.toLowerCase()));
			} else {
				this.entries.sort(this.sortNormal.bind(this, searchValue.toLowerCase()));
			}
		}

		// Otherwise restore order as appearing in outline
		else {
			this.entries.sort((a: SymbolEntry, b: SymbolEntry) => a.getIndex() - b.getIndex());
		}

		// Mark all type groups
		let visibleResults = <SymbolEntry[]>this.getEntries(true);
		if (visibleResults.length > 0 && searchValue.indexOf(SCOPE_PREFIX) === 0) {
			let currentType: string = null;
			let currentResult: SymbolEntry = null;
			let typeCounter = 0;

			for (let i = 0; i < visibleResults.length; i++) {
				let result = visibleResults[i];

				// Found new type
				if (currentType !== result.getType()) {

					// Update previous result with count
					if (currentResult) {
						currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter, this.outline));
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
				currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter, this.outline));
			}
		}

		// Mark first entry as outline
		else if (visibleResults.length > 0) {
			visibleResults[0].setGroupLabel(nls.localize('symbols', "symbols ({0})", visibleResults.length));
		}
	}

	private sortNormal(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {

		// Handle hidden elements
		if (elementA.isHidden() && elementB.isHidden()) {
			return 0;
		} else if (elementA.isHidden()) {
			return 1;
		} else if (elementB.isHidden()) {
			return -1;
		}

		let elementAName = elementA.getLabel().toLowerCase();
		let elementBName = elementB.getLabel().toLowerCase();

		// Compare by name
		let r = strings.localeCompare(elementAName, elementBName);
		if (r !== 0) {
			return r;
		}

		// If name identical sort by range instead
		let elementARange = elementA.getRange();
		let elementBRange = elementB.getRange();

		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private sortScoped(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {

		// Handle hidden elements
		if (elementA.isHidden() && elementB.isHidden()) {
			return 0;
		} else if (elementA.isHidden()) {
			return 1;
		} else if (elementB.isHidden()) {
			return -1;
		}

		// Remove scope char
		searchValue = searchValue.substr(SCOPE_PREFIX.length);

		// Sort by type first if scoped search
		let elementAType = elementA.getType();
		let elementBType = elementB.getType();
		let r = strings.localeCompare(elementAType, elementBType);
		if (r !== 0) {
			return r;
		}

		// Special sort when searching in scoped mode
		if (searchValue) {
			let elementAName = elementA.getLabel().toLowerCase();
			let elementBName = elementB.getLabel().toLowerCase();

			// Compare by name
			r = strings.localeCompare(elementAName, elementBName);
			if (r !== 0) {
				return r;
			}
		}

		// Default to sort by range
		let elementARange = elementA.getRange();
		let elementBRange = elementB.getRange();

		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private renderGroupLabel(type: string, count: number, outline: Outline): string {
		if (outline.outlineGroupLabel) {
			let label = outline.outlineGroupLabel[type];
			if (label) {
				return nls.localize('grouplabel', "{0} ({1})", label, count);
			}
		}
		switch (type) {
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
}

class SymbolEntry extends EditorQuickOpenEntryGroup {
	private editorService: IWorkbenchEditorService;
	private index: number;
	private name: string;
	private meta: string;
	private type: string;
	private icon: string;
	private description: string;
	private range: IRange;
	private handler: GotoSymbolHandler;

	constructor(index: number, name: string, meta: string, type: string, description: string, icon: string, range: IRange, highlights: IHighlight[], editorService: IWorkbenchEditorService, handler: GotoSymbolHandler) {
		super();

		this.index = index;
		this.name = name;
		this.meta = meta;
		this.type = type;
		this.icon = icon;
		this.description = description;
		this.range = range;
		this.setHighlights(highlights);
		this.editorService = editorService;
		this.handler = handler;
	}

	public getIndex(): number {
		return this.index;
	}

	public getLabel(): string {
		return this.name;
	}

	public getMeta(): string {
		return this.meta;
	}

	public getIcon(): string {
		return this.icon;
	}

	public getDescription(): string {
		return this.description;
	}

	public getType(): string {
		return this.type;
	}

	public getRange(): IRange {
		return this.range;
	}

	public getInput(): EditorInput {
		return <EditorInput>this.editorService.getActiveEditorInput();
	}

	public getOptions(): EditorOptions {
		let options = new TextEditorOptions();
		options.selection(this.range.startLineNumber, this.range.startColumn, this.range.startLineNumber, this.range.startColumn);

		return options;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(context: IContext): boolean {

		// Check for sideBySide use
		let event = context.event;
		let sideBySide = (event && (event.ctrlKey || event.metaKey || (event.payload && event.payload.originalEvent && (event.payload.originalEvent.ctrlKey || event.payload.originalEvent.metaKey))));
		if (sideBySide) {
			this.editorService.openEditor(this.getInput(), this.getOptions(), true).done(null, errors.onUnexpectedError);
		}

		// Apply selection and focus
		else {
			let range = this.toSelection();
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				let editor = <IEditor>activeEditor.getControl();
				editor.setSelection(range);
				editor.revealRangeInCenter(range);
			}
		}

		return true;
	}

	private runPreview(): boolean {

		// Select Outline Position
		let range = this.toSelection();
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			let editorControl = <IEditor>activeEditor.getControl();
			editorControl.revealRangeInCenter(range);

			// Decorate if possible
			if (types.isFunction(editorControl.changeDecorations)) {
				this.handler.decorateOutline(this.range, range, editorControl, activeEditor.position);
			}
		}

		return false;
	}

	private toSelection(): IRange {
		return {
			startLineNumber: this.range.startLineNumber,
			startColumn: this.range.startColumn || 1,
			endLineNumber: this.range.startLineNumber,
			endColumn: this.range.startColumn || 1
		};
	}
}

interface Outline {
	entries: OutlineNode[];
	outlineGroupLabel?: { [name: string]: string; };
}

interface OutlineNode {
	label: string;
	containerLabel?: string;
	type: string;
	icon?: string;
	range: IRange;
	children?: OutlineNode[];
	parentScope?: string[];
}

interface IEditorLineDecoration {
	lineHighlightId: string;
	lineDecorationId: string;
	position: Position;
}

export class GotoSymbolHandler extends QuickOpenHandler {
	private outlineToModelCache: { [modelId: string]: OutlineModel; };
	private lineHighlightDecorationId: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState;
	private activeOutlineRequest: TPromise<OutlineModel>;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this.outlineToModelCache = {};
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			let editor = this.editorService.getActiveEditor();
			this.lastKnownEditorViewState = (<IEditor>editor.getControl()).saveViewState();
		}

		// Resolve Outline Model
		return this.getActiveOutline().then((outline) => {

			// Filter by search
			outline.dofilter(searchValue);

			return outline;
		});
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noSymbolsMatching', "No symbols matching");
		}

		return nls.localize('noSymbolsFound', "No symbols found");
	}

	public canRun(): boolean | string {
		let canRun = false;

		let editor = this.editorService.getActiveEditor();
		if (editor instanceof BaseTextEditor) {
			let editorControl = <IEditor>editor.getControl();
			let model = editorControl.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}


			if (model && types.isFunction((<ITokenizedModel>model).getMode)) {
				canRun = OutlineRegistry.has(<IModel>model);
			}
		}

		return canRun ? true : editor instanceof BaseTextEditor ? nls.localize('cannotRunGotoSymbolInFile', "Unfortunately we have no symbol information for the file") : nls.localize('cannotRunGotoSymbol', "Open a text file first to go to a symbol");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		searchValue = searchValue.trim();

		// Remove any type pattern (:) from search value as needed
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			searchValue = searchValue.substr(SCOPE_PREFIX.length);
		}

		return {
			autoFocusPrefixMatch: searchValue,
			autoFocusFirstEntry: !!searchValue
		};
	}

	private toQuickOpenEntries(outline: Outline): SymbolEntry[] {
		let results: SymbolEntry[] = [];

		// Flatten
		let flattened: OutlineNode[] = [];
		if (outline) {
			this.flatten(outline.entries, flattened);
		}

		for (let i = 0; i < flattened.length; i++) {
			let element = flattened[i];
			let label = strings.trim(element.label);
			let meta: string = null;

			// Show parent scope as description
			let description: string = element.containerLabel;
			if (element.parentScope) {
				description = arrays.tail(element.parentScope);
			}

			// Add
			let icon = element.icon || element.type;
			results.push(new SymbolEntry(i, label, meta, element.type, description, icon, element.range, null, this.editorService, this));
		}

		return results;
	}

	private flatten(outline: OutlineNode[], flattened: OutlineNode[], parentScope?: string[]): void {
		for (let i = 0; i < outline.length; i++) {
			let element = outline[i];
			flattened.push(element);

			if (parentScope) {
				element.parentScope = parentScope;
			}

			if (element.children) {
				let elementScope: string[] = [];
				if (parentScope) {
					elementScope = parentScope.slice(0);
				}
				elementScope.push(element.label);

				this.flatten(element.children, flattened, elementScope);
			}
		}
	}

	private getActiveOutline(): TPromise<OutlineModel> {
		if (!this.activeOutlineRequest) {
			this.activeOutlineRequest = this.doGetActiveOutline();
		}

		return this.activeOutlineRequest;
	}

	private doGetActiveOutline(): TPromise<OutlineModel> {
		let editor = this.editorService.getActiveEditor();
		if (editor instanceof BaseTextEditor) {
			let editorControl = <IEditor>editor.getControl();
			let model = editorControl.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITokenizedModel>model).getMode)) {

				// Ask cache first
				let modelId = (<IModel>model).id;
				if (this.outlineToModelCache[modelId]) {
					return TPromise.as(this.outlineToModelCache[modelId]);
				}

				return getOutlineEntries(<IModel>model).then(outline => {

					let model = new OutlineModel(outline, this.toQuickOpenEntries(outline));

					this.outlineToModelCache = {}; // Clear cache, only keep 1 outline
					this.outlineToModelCache[modelId] = model;

					return model;
				});
			}
		}

		return TPromise.as<OutlineModel>(null);
	}

	public decorateOutline(fullRange: IRange, startRange: IRange, editor: IEditor, position: Position): void {
		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			let deleteDecorations: string[] = [];

			if (this.lineHighlightDecorationId) {
				deleteDecorations.push(this.lineHighlightDecorationId.lineDecorationId);
				deleteDecorations.push(this.lineHighlightDecorationId.lineHighlightId);
				this.lineHighlightDecorationId = null;
			}

			let newDecorations: IModelDeltaDecoration[] = [

				// lineHighlight at index 0
				{
					range: fullRange,
					options: {
						className: 'lineHighlight',
						isWholeLine: true
					}
				},

				// lineDecoration at index 1
				{
					range: startRange,
					options: {
						overviewRuler: {
							color: 'rgba(0, 122, 204, 0.6)',
							darkColor: 'rgba(0, 122, 204, 0.6)',
							position: OverviewRulerLane.Full
						}
					}
				}

			];

			let decorations = changeAccessor.deltaDecorations(deleteDecorations, newDecorations);
			let lineHighlightId = decorations[0];
			let lineDecorationId = decorations[1];

			this.lineHighlightDecorationId = {
				lineHighlightId: lineHighlightId,
				lineDecorationId: lineDecorationId,
				position: position
			};
		});
	}

	public clearDecorations(): void {
		if (this.lineHighlightDecorationId) {
			this.editorService.getVisibleEditors().forEach((editor) => {
				if (editor.position === this.lineHighlightDecorationId.position) {
					let editorControl = <IEditor>editor.getControl();
					editorControl.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
						changeAccessor.deltaDecorations([
							this.lineHighlightDecorationId.lineDecorationId,
							this.lineHighlightDecorationId.lineHighlightId
						], []);
					});
				}
			});

			this.lineHighlightDecorationId = null;
		}
	}

	public onClose(canceled: boolean): void {

		// Clear Cache
		this.outlineToModelCache = {};

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			let activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				let editor = <IEditor>activeEditor.getControl();
				editor.restoreViewState(this.lastKnownEditorViewState);
			}
		}

		this.lastKnownEditorViewState = null;
		this.activeOutlineRequest = null;
	}
}