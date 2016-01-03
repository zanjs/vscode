/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import env = require('vs/base/common/platform');
import uri from 'vs/base/common/uri';
import { IAction, Action } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import keyboard = require('vs/base/browser/keyboardEvent');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import editorcommon = require('vs/editor/common/editorCommon');
import { DebugHoverWidget } from 'vs/workbench/parts/debug/browser/debugHoverWidget';
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import debug = require('vs/workbench/parts/debug/common/debug');
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export class DebugEditorContribution implements editorcommon.IEditorContribution {

	static ID = 'editor.contrib.debug';

	private toDispose: lifecycle.IDisposable[];
	private breakpointHintDecoration: string[];
	private hoverWidget: DebugHoverWidget;

	constructor(
		private editor: editorbrowser.ICodeEditor,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService:IInstantiationService
	) {
		this.breakpointHintDecoration = [];
		this.toDispose = [];
		this.hoverWidget = new DebugHoverWidget(this.editor, this.debugService);
		this.registerListeners();
	}

	private getContextMenuActions(breakpoint: debug.IBreakpoint, uri: uri, lineNumber: number): TPromise<IAction[]> {
		const actions = [];
		if (breakpoint) {
			actions.push(this.instantiationService.createInstance(debugactions.RemoveBreakpointAction, debugactions.RemoveBreakpointAction.ID, debugactions.RemoveBreakpointAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.EditConditionalBreakpointAction, debugactions.EditConditionalBreakpointAction.ID, debugactions.EditConditionalBreakpointAction.LABEL, this.editor, lineNumber));
			actions.push(this.instantiationService.createInstance(debugactions.ToggleEnablementAction, debugactions.ToggleEnablementAction.ID, debugactions.ToggleEnablementAction.LABEL));
		} else {
			actions.push(new Action(
				'addBreakpoint',
				nls.localize('addBreakpoint', "Add Breakpoint"),
				null,
				true,
				() =>  this.debugService.toggleBreakpoint({ uri, lineNumber })
			));
			actions.push(this.instantiationService.createInstance(debugactions.AddConditionalBreakpointAction, debugactions.AddConditionalBreakpointAction.ID, debugactions.AddConditionalBreakpointAction.LABEL, this.editor, lineNumber));
		}

		return TPromise.as(actions);
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseDown, (e: editorbrowser.IMouseEvent) => {
			if (e.target.type !== editorcommon.MouseTargetType.GUTTER_GLYPH_MARGIN || /* after last line */ e.target.detail) {
				return;
			}
			if (!this.debugService.canSetBreakpointsIn(this.editor.getModel(), e.target.position.lineNumber)) {
				return;
			}

			const lineNumber = e.target.position.lineNumber;
			const uri = this.editor.getModel().getAssociatedResource();

			if (e.event.rightButton) {
				const anchor = { x: e.event.posx + 1, y: e.event.posy };
				const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === lineNumber && bp.source.uri.toString() === uri.toString()).pop();

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => this.getContextMenuActions(breakpoint, uri, lineNumber),
					getActionsContext: () => breakpoint
				});
			} else {
				this.debugService.toggleBreakpoint({ uri, lineNumber });
			}
		}));

		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseMove, (e: editorbrowser.IMouseEvent) => {
			var showBreakpointHintAtLineNumber = -1;
			if (e.target.type === editorcommon.MouseTargetType.GUTTER_GLYPH_MARGIN && this.debugService.canSetBreakpointsIn(this.editor.getModel(), e.target.position.lineNumber)) {
				if (!e.target.detail) {
					// is not after last line
					showBreakpointHintAtLineNumber = e.target.position.lineNumber;
				}
			}
			this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
		}));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseLeave, (e: editorbrowser.IMouseEvent) => {
			this.ensureBreakpointHintDecoration(-1);
		}));
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => this.onDebugStateUpdate()));

		// hover listeners & hover widget
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseDown, (e: editorbrowser.IMouseEvent) => this.onEditorMouseDown(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseMove, (e: editorbrowser.IMouseEvent) => this.onEditorMouseMove(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseLeave, (e: editorbrowser.IMouseEvent) => this.hoverWidget.hide()));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.KeyDown, (e: keyboard.StandardKeyboardEvent) => this.onKeyDown(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.toDispose.push(this.editor.addListener2('scroll', () => this.hoverWidget.hide()));
	}

	public getId(): string {
		return DebugEditorContribution.ID;
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		var newDecoration: editorcommon.IModelDeltaDecoration[] = [];
		if (showBreakpointHintAtLineNumber !== -1) {
			newDecoration.push({
				options: DebugEditorContribution.BREAKPOINT_HELPER_DECORATION,
				range: {
					startLineNumber: showBreakpointHintAtLineNumber,
					startColumn: 1,
					endLineNumber: showBreakpointHintAtLineNumber,
					endColumn: 1
				}
			});
		}

		this.breakpointHintDecoration = this.editor.deltaDecorations(this.breakpointHintDecoration, newDecoration);
	}

	private onDebugStateUpdate(): void {
		if (this.debugService.getState() !== debug.State.Stopped) {
			this.hoverWidget.hide();
		}
		this.contextService.updateOptions('editor', {
			hover: this.debugService.getState() !== debug.State.Stopped
		});
	}

	private onModelChanged(): void {
		this.hoverWidget.hide();
	}

	// hover business

	private onEditorMouseDown(mouseEvent: editorbrowser.IMouseEvent): void {
		if (mouseEvent.target.type === editorcommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID) {
			return;
		}

		this.hoverWidget.hide();
	}

	private onEditorMouseMove(mouseEvent: editorbrowser.IMouseEvent): void {
		if (this.debugService.getState() !== debug.State.Stopped) {
			return;
		}

		const targetType = mouseEvent.target.type;
		const stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === editorcommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of content hover widget
			return;
		}

		if (targetType === editorcommon.MouseTargetType.CONTENT_TEXT) {
			this.hoverWidget.showAt(mouseEvent.target.range);
		} else {
			this.hoverWidget.hide();
		}
	}

	private onKeyDown(e: keyboard.StandardKeyboardEvent): void {
		const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey) {
			// do not hide hover when Ctrl/Meta is pressed
			this.hoverWidget.hide();
		}
	}

	// end hover business

	private static BREAKPOINT_HELPER_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph-hint',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}
