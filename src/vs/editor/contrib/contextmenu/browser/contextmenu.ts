/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import Lifecycle = require('vs/base/common/lifecycle');
import SortedList = require('vs/base/common/sortedList');
import {KeybindingsUtils} from 'vs/platform/keybinding/common/keybindingsUtils';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode, Keybinding} from 'vs/base/common/keyCodes';

interface IPosition {
	x:number;
	y:number;
}

class ContextMenuController implements EditorCommon.IEditorContribution {

	public static ID = 'editor.contrib.contextmenu';

	private contextMenuService:IContextMenuService;
	private contextViewService: IContextViewService;
	private keybindingService: IKeybindingService;

	private _editor:EditorBrowser.ICodeEditor;
	private _toDispose:Lifecycle.IDisposable[];
	private _contextMenuIsBeingShownCount:number;

	constructor(editor:EditorBrowser.ICodeEditor, @IContextMenuService contextMenuService: IContextMenuService, @IContextViewService contextViewService: IContextViewService, @IKeybindingService keybindingService: IKeybindingService) {
		this.contextMenuService = contextMenuService;
		this.contextViewService = contextViewService;
		this.keybindingService = keybindingService;
		this._editor = editor;

		this._toDispose = [];

		this._contextMenuIsBeingShownCount = 0;

		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.ContextMenu, (e:EditorBrowser.IMouseEvent)=>this._onContextMenu(e)));
		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.KeyDown, (e:DOM.IKeyboardEvent)=> {
			if (e.keyCode === KeyCode.ContextMenu) {
				// Chrome is funny like that
				e.preventDefault();
				e.stopPropagation();
				this.showContextMenu();
			}
		}));
	}

	private _onContextMenu(e:EditorBrowser.IMouseEvent): void {
		if (!this._editor.getConfiguration().contextmenu) {
			this._editor.focus();
			// Ensure the cursor is at the position of the mouse click
			if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
				this._editor.setPosition(e.target.position);
			}
			return; // Context menu is turned off through configuration
		}

		if (e.target.type === EditorCommon.MouseTargetType.OVERLAY_WIDGET) {
			return; // allow native menu on widgets to support right click on input field for example in find
		}

		e.event.preventDefault();

		if (e.target.type !== EditorCommon.MouseTargetType.CONTENT_TEXT && e.target.type !== EditorCommon.MouseTargetType.CONTENT_EMPTY && e.target.type !== EditorCommon.MouseTargetType.TEXTAREA) {
			return; // only support mouse click into text or native context menu key for now
		}

		// Ensure the editor gets focus if it hasn't, so the right events are being sent to other contributions
		this._editor.focus();

		// Ensure the cursor is at the position of the mouse click
		if (e.target.position && !this._editor.getSelection().containsPosition(e.target.position)) {
			this._editor.setPosition(e.target.position);
		}

		// Unless the user triggerd the context menu through Shift+F10, use the mouse position as menu position
		var forcedPosition:IPosition;
		if (e.target.type !== EditorCommon.MouseTargetType.TEXTAREA) {
			forcedPosition = { x: e.event.posx, y: e.event.posy + 1 };
		}

		// Show the context menu
		this.showContextMenu(forcedPosition);
	}

	public showContextMenu(forcedPosition?:IPosition): void {
		if (!this._editor.getConfiguration().contextmenu) {
			return; // Context menu is turned off through configuration
		}

		if (!this.contextMenuService) {
			this._editor.focus();
			return;	// We need the context menu service to function
		}

		var position = this._editor.getPosition();
		var editorModel = this._editor.getModel();
		if (!position || !editorModel) {
			return;
		}

		// Ensure selection is visible
		this._editor.revealPosition(position);

		// Find actions available for menu
		var menuActions = this._getMenuActions();

		// Show menu if we have actions to show
		if (menuActions.length > 0) {
			this._doShowContextMenu(menuActions, forcedPosition);
		}
	}

	private _getMenuActions(): Actions.IAction[] {
		var editorModel = this._editor.getModel();
		if (!editorModel) {
			return [];
		}

		var allActions = <EditorAction[]>this._editor.getActions();
		var contributedActions = allActions.filter((action)=>(typeof action.shouldShowInContextMenu === 'function') && action.shouldShowInContextMenu() && action.isSupported());

		return this._prepareActions(contributedActions);
	}

	private _prepareActions(actions:EditorAction[]):Actions.IAction[] {
		var list = new SortedList.SortedList<string, SortedList.SortedList<string, EditorAction>>();

		actions.forEach((action)=>{
			var groups = action.getGroupId().split('/');
			var actionsForGroup = list.getValue(groups[0]);
			if (!actionsForGroup) {
				actionsForGroup = new SortedList.SortedList<string, EditorAction>();
				list.add(groups[0], actionsForGroup);
			}

			actionsForGroup.add(groups[1] || groups[0], action);
		});

		var sortedAndGroupedActions:Actions.IAction[] = [];
		var groupIterator = list.getIterator();
		while(groupIterator.moveNext()) {
			var group = groupIterator.current.value;
			var actionsIterator = group.getIterator();
			while(actionsIterator.moveNext()) {
				var action = actionsIterator.current.value;
				sortedAndGroupedActions.push(action);
			}

			if (groupIterator.hasNext()) {
				sortedAndGroupedActions.push(new ActionBar.Separator());
			}
		}

		return sortedAndGroupedActions;
	}

	private _doShowContextMenu(actions:Actions.IAction[], forcedPosition:IPosition = null): void {

		// Make the editor believe one of its widgets is focused
		this._editor.beginForcedWidgetFocus();

		// Disable hover
		var oldHoverSetting = this._editor.getConfiguration().hover;
		this._editor.updateOptions({
			hover: false
		});

		var menuPosition = forcedPosition;
		if (!menuPosition) {

			var cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());

			// Translate to absolute editor position
			var editorCoords = DOM.getDomNodePosition(this._editor.getDomNode());
			var posx = editorCoords.left + cursorCoords.left;
			var posy = editorCoords.top + cursorCoords.top + cursorCoords.height;

			menuPosition = { x: posx, y: posy };
		}

		// Show menu
		this.contextMenuService.showContextMenu({
			getAnchor: () => menuPosition,

			getActions: () => {
				return TPromise.as(actions);
			},

			getActionItem: (action) => {
				var keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionBar.ActionItem(action, action, { label: true, keybinding: this.keybindingService.getLabelFor(keybinding) });
				}

				var customActionItem = <any>action;
				if (typeof customActionItem.getActionItem === 'function') {
					return customActionItem.getActionItem();
				}

				return null;
			},

			getKeyBinding: (action): Keybinding => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled:boolean) => {
				this._contextMenuIsBeingShownCount--;
				this._editor.focus();
				this._editor.endForcedWidgetFocus();
				this._editor.updateOptions({
					hover: oldHoverSetting
				});
			}
		});
	}

	private _keybindingFor(action: Actions.IAction): Keybinding {
		var opts = this.keybindingService.lookupKeybindings(action.id);
		if (opts.length > 0) {
			return opts[0]; // only take the first one
		}
		return null;
	}

	public getId(): string {
		return ContextMenuController.ID;
	}

	public dispose(): void {
		if (this._contextMenuIsBeingShownCount > 0) {
			this.contextViewService.hideContextView();
		}

		this._toDispose = Lifecycle.disposeAll(this._toDispose);
	}
}

class ShowContextMenu extends EditorAction {

	public static ID = 'editor.action.showContextMenu';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.TextFocus);
	}

	public run(): TPromise<boolean> {
		var contribution = <ContextMenuController>this.editor.getContribution(ContextMenuController.ID);
		if (!contribution) {
			return TPromise.as(null);
		}

		contribution.showContextMenu();

		return TPromise.as(null);
	}
}

EditorBrowserRegistry.registerEditorContribution(ContextMenuController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ShowContextMenu, ShowContextMenu.ID, nls.localize('action.showContextMenu.label', "Show Editor Context Menu"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.Shift | KeyCode.F10
}));