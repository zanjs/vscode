/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./tree';
import WinJS = require('vs/base/common/winjs.base');
import TreeDefaults = require('vs/base/parts/tree/browser/treeDefaults');
import Events = require('vs/base/common/eventEmitter');
import Model = require('vs/base/parts/tree/common/treeModel');
import View = require('./treeView');
import _ = require('vs/base/parts/tree/common/tree');
import { INavigator, MappedNavigator } from 'vs/base/common/iterator';

export class TreeContext implements _.ITreeContext {

	public tree:_.ITree;
	public configuration:_.ITreeConfiguration;
	public options:_.ITreeOptions;

	public dataSource:_.IDataSource;
	public renderer:_.IRenderer;
	public controller:_.IController;
	public dnd:_.IDragAndDrop;
	public filter:_.IFilter;
	public sorter:_.ISorter;

	constructor(tree:_.ITree, configuration:_.ITreeConfiguration, options:_.ITreeOptions = {}) {
		this.tree = tree;
		this.configuration = configuration;
		this.options = options;

		if (!configuration.dataSource) {
			throw new Error('You must provide a Data Source to the tree.');
		}

		this.dataSource = configuration.dataSource;
		this.renderer = configuration.renderer || new TreeDefaults.LegacyRenderer();
		this.controller = configuration.controller || new TreeDefaults.DefaultController();
		this.dnd = configuration.dnd || new TreeDefaults.DefaultDragAndDrop();
		this.filter = configuration.filter || new TreeDefaults.DefaultFilter();
		this.sorter = configuration.sorter || null;
	}
}

export class Tree extends Events.EventEmitter implements _.ITree {

	private container:HTMLElement;
	private configuration:_.ITreeConfiguration;
	private options:_.ITreeOptions;

	private context:_.ITreeContext;
	private model:Model.TreeModel;
	private view:View.TreeView;

	constructor(container:HTMLElement, configuration:_.ITreeConfiguration, options:_.ITreeOptions = {}) {
		super();

		this.container = container;
		this.configuration = configuration;
		this.options = options;

		this.options.twistiePixels = typeof this.options.twistiePixels === 'number' ? this.options.twistiePixels : 32;
		this.options.indentPixels = typeof this.options.indentPixels === 'number' ? this.options.indentPixels : 12;
		this.options.alwaysFocused = this.options.alwaysFocused === true ? true : false;
		this.options.bare = this.options.bare === true ? true : false;
		this.options.useShadows = this.options.useShadows === false ? false : true;
		this.options.paddingOnRow = this.options.paddingOnRow === false ? false : true;

		this.context = new TreeContext(this, configuration, options);
		this.model = new Model.TreeModel(this.context);
		this.view = new View.TreeView(this.context, this.container);

		this.view.setModel(this.model);

		this.addEmitter(this.model);
		this.addEmitter(this.view);
	}

	public getHTMLElement(): HTMLElement {
		return this.view.getHTMLElement();
	}

	public layout(height?:number): void {
		this.view.layout(height);
	}

	public DOMFocus(): void {
		this.view.focus();
	}

	public isDOMFocused(): boolean {
		return this.view.isFocused();
	}

	public DOMBlur(): void {
		this.view.blur();
	}

	public onVisible(): void {
		this.view.onVisible();
	}

	public onHidden(): void {
		this.view.onHidden();
	}

	public setInput(element:any): WinJS.Promise {
		return this.model.setInput(element);
	}

	public getInput(): any {
		return this.model.getInput();
	}

	public refresh(element:any = null, recursive = true): WinJS.Promise {
		return this.model.refresh(element, recursive);
	}

	public refreshAll(elements:any[], recursive = true): WinJS.Promise {
		return this.model.refreshAll(elements, recursive);
	}

	public expand(element:any):WinJS.Promise {
		return this.model.expand(element);
	}

	public expandAll(elements:any[]):WinJS.Promise {
		return this.model.expandAll(elements);
	}

	public collapse(element:any, recursive:boolean = false):WinJS.Promise {
		return this.model.collapse(element);
	}

	public collapseAll(elements:any[] = null, recursive:boolean = false):WinJS.Promise {
		return this.model.collapseAll(elements, recursive);
	}

	public toggleExpansion(element:any):WinJS.Promise {
		return this.model.toggleExpansion(element);
	}

	public toggleExpansionAll(elements:any[]):WinJS.Promise {
		return this.model.toggleExpansionAll(elements);
	}

	public isExpanded(element:any):boolean {
		return this.model.isExpanded(element);
	}

	public getExpandedElements(): any[] {
		return this.model.getExpandedElements();
	}

	public reveal(element:any, relativeTop:number = null): WinJS.Promise {
		return this.model.reveal(element, relativeTop);
	}

	public getScrollPosition(): number {
		return this.view.getScrollPosition();
	}

	public setScrollPosition(pos: number): void {
		this.view.setScrollPosition(pos);
	}

	getContentHeight(): number {
		return this.view.getTotalHeight();
	}

	public setHighlight(element?:any, eventPayload?:any):void {
		this.model.setHighlight(element, eventPayload);
	}

	public getHighlight():any {
		return this.model.getHighlight();
	}

	public isHighlighted(element:any):boolean {
		return this.model.isFocused(element);
	}

	public clearHighlight(eventPayload?:any): void {
		this.model.setHighlight(null, eventPayload);
	}

	public select(element:any, eventPayload?:any): void {
		this.model.select(element, eventPayload);
	}

	public selectRange(fromElement: any, toElement: any, eventPayload?:any): void {
		this.model.selectRange(fromElement, toElement, eventPayload);
	}

	public deselectRange(fromElement: any, toElement: any, eventPayload?:any): void {
		this.model.deselectRange(fromElement, toElement, eventPayload);
	}

	public selectAll(elements:any[], eventPayload?:any): void {
		this.model.selectAll(elements, eventPayload);
	}

	public deselect(element:any, eventPayload?:any): void {
		this.model.deselect(element, eventPayload);
	}

	public deselectAll(elements:any[], eventPayload?:any): void {
		this.model.deselectAll(elements, eventPayload);
	}

	public setSelection(elements:any[], eventPayload?:any): void {
		this.model.setSelection(elements, eventPayload);
	}

	public toggleSelection(element:any, eventPayload?:any): void {
		this.model.toggleSelection(element, eventPayload);
	}

	public isSelected(element:any):boolean {
		return this.model.isSelected(element);
	}

	public getSelection(): any[] {
		return this.model.getSelection();
	}

	public clearSelection(eventPayload?:any): void {
		this.model.setSelection([], eventPayload);
	}

	public selectNext(count?:number, clearSelection?: boolean, eventPayload?:any): void {
		this.model.selectNext(count, clearSelection, eventPayload);
	}

	public selectPrevious(count?:number, clearSelection?: boolean, eventPayload?:any): void {
		this.model.selectPrevious(count, clearSelection, eventPayload);
	}

	public selectParent(clearSelection?: boolean, eventPayload?:any): void {
		this.model.selectParent(clearSelection, eventPayload);
	}

	public setFocus(element?:any, eventPayload?:any): void {
		this.model.setFocus(element, eventPayload);
	}

	public isFocused(element:any):boolean {
		return this.model.isFocused(element);
	}

	public getFocus(): any {
		return this.model.getFocus();
	}

	public focusNext(count?:number, eventPayload?:any): void {
		this.model.focusNext(count, eventPayload);
	}

	public focusPrevious(count?:number, eventPayload?:any): void {
		this.model.focusPrevious(count, eventPayload);
	}

	public focusParent(eventPayload?:any): void {
		this.model.focusParent(eventPayload);
	}

	public focusFirst(eventPayload?:any): void {
		this.model.focusFirst(eventPayload);
	}

	public focusNth(index:number, eventPayload?:any): void {
		this.model.focusNth(index, eventPayload);
	}

	public focusLast(eventPayload?:any): void {
		this.model.focusLast(eventPayload);
	}

	public focusNextPage(eventPayload?:any): void {
		this.view.focusNextPage(eventPayload);
	}

	public focusPreviousPage(eventPayload?:any): void {
		this.view.focusPreviousPage(eventPayload);
	}

	public clearFocus(eventPayload?:any): void {
		this.model.setFocus(null, eventPayload);
	}

	public addTraits(trait:string, elements: any[]): void {
		this.model.addTraits(trait, elements);
	}

	public removeTraits(trait: string, elements: any[]): void {
		this.model.removeTraits(trait, elements);
	}

	public toggleTrait(trait: string, element: any): void {
		this.model.hasTrait(trait, element) ? this.model.removeTraits(trait, [element])
			: this.model.addTraits(trait, [element]);
	}

	public hasTrait(trait: string, element: any): boolean {
		return this.model.hasTrait(trait, element);
	}

	public withFakeRow(fn:(container:HTMLElement)=>any):any {
		return this.view.withFakeRow(fn);
	}

	getNavigator(): INavigator<any> {
		return new MappedNavigator(this.model.getNavigator(), i => i && i.getElement());
	}

	public dispose(): void {
		if (this.model !== null) {
			this.model.dispose();
			this.model = null;
		}
		if (this.view !== null) {
			this.view.dispose();
			this.view = null;
		}

		super.dispose();
	}
}
