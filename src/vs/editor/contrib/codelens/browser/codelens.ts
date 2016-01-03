/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./codelens';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {format} from 'vs/base/common/strings';
import lifecycle = require('vs/base/common/lifecycle');
import schedulers = require('vs/base/common/async');
import Severity from 'vs/base/common/severity';
import dom = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import referenceSearch = require('vs/editor/contrib/referenceSearch/browser/referenceSearch');
import {IModelService} from 'vs/editor/common/services/modelService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IMessageService} from 'vs/platform/message/common/message';
import {Range} from 'vs/editor/common/core/range';
import {CodeLensRegistry, ICodeLensData, getCodeLensData} from '../common/codelens';


class CodeLensViewZone implements EditorBrowser.IViewZone {

	public afterLineNumber:number;
	public heightInLines:number;
	public suppressMouseDown:boolean;

	public domNode: HTMLElement;

	constructor(afterLineNumber:number) {

		this.afterLineNumber = afterLineNumber;
		this.heightInLines = 1;
		this.suppressMouseDown = true;

		this.domNode = document.createElement('div');
	}

	public setAfterLineNumber(afterLineNumber:number): void {
		this.afterLineNumber = afterLineNumber;
	}
}

class CodeLensContentWidget implements EditorBrowser.IContentWidget {

	private static ID = 0;

	private _id:string;

	private _domNode: HTMLElement;
	private _subscription: Function;
	private _symbolRange: EditorCommon.IEditorRange;
	private _widgetPosition: EditorBrowser.IContentWidgetPosition;
	private _editor: EditorBrowser.ICodeEditor;
	private _commands: { [id: string]: Modes.ICommand } = Object.create(null);

	public constructor(editor: EditorBrowser.ICodeEditor, symbolRange: EditorCommon.IEditorRange,
		keybindingService: IKeybindingService, messageService: IMessageService) {

		this._id = 'codeLensWidget' + (++CodeLensContentWidget.ID);
		this._editor = editor;

		this.setSymbolRange(symbolRange);

		this._domNode = document.createElement('span');
		this._domNode.style.height = `${editor.getConfiguration().lineHeight}px`;
		this._domNode.innerHTML = '&nbsp;';
		dom.addClass(this._domNode, 'codelens-decoration');
		dom.addClass(this._domNode, 'invisible-cl');
		this._subscription = dom.addListener(this._domNode, 'click', e => {
			let element = <HTMLElement>e.target;
			if (element.tagName === 'A' && element.id) {
				let command = this._commands[element.id];
				if (command) {
					editor.focus();
					keybindingService.executeCommand(command.id, command.arguments).done(undefined, err => {
						messageService.show(Severity.Error, err);
					});
				}
			}
		});

		this.updateVisibility();
	}

	public dispose(): void {
		this._subscription();
		this._symbolRange = null;
	}

	public updateVisibility() : void {
		if (this.isVisible()) {
			dom.removeClass(this._domNode, 'invisible-cl');
			dom.addClass(this._domNode, 'fadein');
		}
	}

	public withCommands(symbols: Modes.ICodeLensSymbol[]): void {
		this._commands = Object.create(null);
		if (!symbols || !symbols.length) {
			this._domNode.innerHTML = 'no commands';
			return;
		}

		let html: string[] = [];
		for (let i = 0; i < symbols.length; i++) {
			let command = symbols[i].command;
			let part: string;
			if (command.id) {
				part = format('<a id={0}>{1}</a>', i, command.title);
				this._commands[i] = command;
			} else {
				part = format('<span>{0}</span>', command.title);
			}
			html.push(part);
		}

		this._domNode.innerHTML = html.join('<span>&nbsp;|&nbsp;</span>');
		this._editor.layoutContentWidget(this);
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public setSymbolRange(range:EditorCommon.IEditorRange): void {
		this._symbolRange = range;

		var lineNumber = range.startLineNumber;
		var column = this._editor.getModel().getLineFirstNonWhitespaceColumn(lineNumber);
		this._widgetPosition = {
			position: { lineNumber: lineNumber, column: column },
			preference: [EditorBrowser.ContentWidgetPositionPreference.ABOVE]
		};
	}

	public getPosition(): EditorBrowser.IContentWidgetPosition {
		return this._widgetPosition;
	}

	public isVisible(): boolean {
		return this._domNode.hasAttribute('monaco-visible-content-widget');
	}
}

function modelsVersionId(modelService: IModelService, modeId: string): number {
	var result = 1;
	var models = modelService.getModels()
		.filter(model => model.getMode().getId() === modeId)
		.map((model) => {
			return {
				url: model.getAssociatedResource().toString(),
				versionId: model.getVersionId()
			};
		})
		.sort((a, b) => {
			if (a.url < b.url) {
				return -1;
			}
			if (a.url > b.url) {
				return 1;
			}
			return 0;
		});

	for (var i = 0; i < models.length; i++) {
		result = (((31 * result) | 0) + models[i].versionId) | 0;
	}

	return result;
}

interface IDecorationIdCallback {
	(decorationId:string):void;
}

class CodeLensHelper {

	private _removeDecorations:string[];
	private _addDecorations:EditorCommon.IModelDeltaDecoration[];
	private _addDecorationsCallbacks:IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	public addDecoration(decoration:EditorCommon.IModelDeltaDecoration, callback:IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	public removeDecoration(decorationId:string): void {
		this._removeDecorations.push(decorationId);
	}

	public commit(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor): void {
		var resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
		for (let i = 0, len = resultingDecorations.length; i < len; i++) {
			this._addDecorationsCallbacks[i](resultingDecorations[i]);
		}
	}

}

class CodeLens {

	private _viewZone:CodeLensViewZone;
	private _viewZoneId:number;
	private _contentWidget:CodeLensContentWidget;
	private _decorationIds: string[];
	private _data: ICodeLensData[];
	private _editor:EditorBrowser.ICodeEditor;
	private _lastUpdateStateId: number;
	private _lastUpdateModelsVersionId: number;

	public constructor(data: ICodeLensData[], editor: EditorBrowser.ICodeEditor,
		helper: CodeLensHelper,
		viewZoneChangeAccessor: EditorBrowser.IViewZoneChangeAccessor,
		keybindingService: IKeybindingService, messageService: IMessageService) {

		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		let range: EditorCommon.IRange;
		this._data.forEach((data, i) => {

			helper.addDecoration({
				range: data.symbol.range,
				options: {}
			}, id => this._decorationIds[i] = id);

			// the range contain all lenses on this line
			for (let lensData of this._data) {
				if (!range) {
					range = lensData.symbol.range;
				} else {
					range = Range.plusRange(range, lensData.symbol.range);
				}
			}
		});

		this._viewZone = new CodeLensViewZone(range.startLineNumber - 1);
		this._contentWidget = new CodeLensContentWidget(editor, Range.lift(range), keybindingService, messageService);

		this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
		this._editor.addContentWidget(this._contentWidget);

		this._lastUpdateModelsVersionId = -1;
	}

	public dispose(helper:CodeLensHelper, viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
		}
		this._editor.removeContentWidget(this._contentWidget);

		this._contentWidget.dispose();
	}

	public isValid(): boolean {
		return this._decorationIds.some(id => {
			let range = this._editor.getModel().getDecorationRange(id);
			return range && !range.isEmpty();
		});
	}

	public updateCodeLensSymbols(data: ICodeLensData[]): void {
		this._data = data;
	}

	public computeIfNecessary(currentModelsVersionId: number, model: EditorCommon.IModel): ICodeLensData[] {
		this._contentWidget.updateVisibility(); // trigger the fade in
		if (!this._contentWidget.isVisible()) {
			return null;
		}

		if (this._lastUpdateModelsVersionId === currentModelsVersionId) {
			return null;
		}

		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			this._data[i].symbol.range = model.getDecorationRange(this._decorationIds[i]);
		}
		return this._data;
	}

	public updateCommands(symbols: Modes.ICodeLensSymbol[], currentModelsVersionId: number): void {
		this._contentWidget.withCommands(symbols);
		this._lastUpdateModelsVersionId = currentModelsVersionId;
	}

	public getLineNumber(): number {
		var range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	public update(viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid()) {
			var range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);

			this._viewZone.setAfterLineNumber(range.startLineNumber - 1);
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);

			this._contentWidget.setSymbolRange(range);
			this._editor.layoutContentWidget(this._contentWidget);
		}
	}
}

export class CodeLensContribution implements EditorCommon.IEditorContribution {

	public static ID = 'css.editor.codeLens';

	private static INSTANCE_COUNT = 0;

	private _instanceCount:number;
	private _editor:EditorBrowser.ICodeEditor;
	private _modelService: IModelService;

	private _globalToDispose:lifecycle.IDisposable[];

	private _localToDispose:lifecycle.IDisposable[];
	private _lenses:CodeLens[];
	private _currentFindCodeLensSymbolsPromise:TPromise<ICodeLensData[]>;
	private _modelChangeCounter: number;
	private _configurationService: IConfigurationService;
	private _keybindingService: IKeybindingService;
	private _messageService: IMessageService;
	private _codeLenseDisabledByMode: boolean;

	private _currentFindOccPromise:TPromise<any>;

	constructor(editor: EditorBrowser.ICodeEditor, @IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMessageService messageService: IMessageService) {

		this._instanceCount = (++CodeLensContribution.INSTANCE_COUNT);
		this._editor = editor;
		this._modelService = modelService;
		this._configurationService = configurationService;
		this._keybindingService = keybindingService;
		this._messageService = messageService;

		this._globalToDispose = [];
		this._localToDispose = [];
		this._lenses = [];
		this._currentFindCodeLensSymbolsPromise = null;
		this._modelChangeCounter = 0;
		this._codeLenseDisabledByMode = true;

		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.onModelChange()));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.onModelChange()));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged,(e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.codeLensSupport) {
				this.onModelChange();
			}
		}));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ConfigurationChanged,(e: EditorCommon.IConfigurationChangedEvent) => {
			if (e.referenceInfos) {
				this.onModelChange();
			}
		}));
		this._globalToDispose.push(CodeLensRegistry.onDidChange(this.onModelChange, this));
		this.onModelChange();
	}

	public dispose(): void {
		this.localDispose();
		this._globalToDispose = lifecycle.disposeAll(this._globalToDispose);
	}

	private localDispose(): void {
		if (this._currentFindCodeLensSymbolsPromise) {
			this._currentFindCodeLensSymbolsPromise.cancel();
			this._currentFindCodeLensSymbolsPromise = null;
			this._modelChangeCounter++;
		}
		if (this._currentFindOccPromise) {
			this._currentFindOccPromise.cancel();
			this._currentFindOccPromise = null;
		}
		this._localToDispose = lifecycle.disposeAll(this._localToDispose);
	}

	public getId():string {
		return CodeLensContribution.ID;
	}

	private onModelChange(): void {

		this.localDispose();

		var model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (!this._editor.getConfiguration().referenceInfos) {
			return;
		}

		if (!CodeLensRegistry.has(model)) {
			return;
		}

		var scheduler = new schedulers.RunOnceScheduler(() => {
			if (this._currentFindCodeLensSymbolsPromise) {
				this._currentFindCodeLensSymbolsPromise.cancel();
			}

			this._currentFindCodeLensSymbolsPromise = getCodeLensData(model);

			var counterValue = ++this._modelChangeCounter;
			this._currentFindCodeLensSymbolsPromise.then((result) => {
				if (counterValue === this._modelChangeCounter) { // only the last one wins
					this.renderCodeLensSymbols(result);
					detectVisible.schedule();
				}
			}, (error) => {
				errors.onUnexpectedError(error);
			});
		}, 250);
		var detectVisible = new schedulers.RunOnceScheduler(() => {
			this._onViewportChanged(model.getMode().getId());
		}, 500);
		this._localToDispose.push(scheduler);
		this._localToDispose.push(detectVisible);
		this._localToDispose.push(model.addBulkListener2((events) => {
			var hadChange = false;
			for (var i = 0; i < events.length; i++) {
				var eventType = events[i].getType();
				if (eventType === EditorCommon.EventType.ModelContentChanged) {
					hadChange = true;
					break;
				}
			}
			if (hadChange) {
				this._editor.changeDecorations((changeAccessor) => {
					this._editor.changeViewZones((viewAccessor) => {
						var toDispose: CodeLens[] = [];
						this._lenses.forEach((lens) => {
							if (lens.isValid()) {
								lens.update(viewAccessor);
							} else {
								toDispose.push(lens);
							}
						});

						let helper = new CodeLensHelper();
						toDispose.forEach((l) => {
							l.dispose(helper, viewAccessor);
							this._lenses.splice(this._lenses.indexOf(l), 1);
						});
						helper.commit(changeAccessor);
					});
				});

				// Compute new `visible` code lenses
				detectVisible.schedule();
				// Ask for all references again
				scheduler.schedule();
			}
		}));
		this._localToDispose.push(this._editor.addListener2('scroll', (e) => {
			detectVisible.schedule();
		}));
		this._localToDispose.push({
			dispose: () => {
				if (this._editor.getModel()) {
					this._editor.changeDecorations((changeAccessor) => {
						this._editor.changeViewZones((accessor) => {
							this._disposeAllLenses(changeAccessor, accessor);
						});
					});
				} else {
					// No accessors available
					this._disposeAllLenses(null, null);
				}
			}
		});

		scheduler.schedule();
	}

	private _disposeAllLenses(decChangeAccessor: EditorCommon.IModelDecorationsChangeAccessor, viewZoneChangeAccessor: EditorBrowser.IViewZoneChangeAccessor): void {
		let helper = new CodeLensHelper();
		this._lenses.forEach((lens) => lens.dispose(helper, viewZoneChangeAccessor));
		if (decChangeAccessor) {
			helper.commit(decChangeAccessor);
		}
		this._lenses = [];
	}

	private renderCodeLensSymbols(symbols: ICodeLensData[]): void {
		if (!symbols) {
			symbols = [];
		} else {
			symbols = symbols.sort((a, b) => Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range));
		}

		let maxLineNumber = this._editor.getModel().getLineCount();
		let groups: ICodeLensData[][] = [];
		let lastGroup: ICodeLensData[];

		for (let symbol of symbols) {
			let line = symbol.symbol.range.startLineNumber;
			if (line < 1 || line >= maxLineNumber) {
				// invalid code lens
				continue;
			} else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
				// on same line as previous
				lastGroup.push(symbol);
			} else {
				// on later line as previous
				lastGroup = [symbol];
				groups.push(lastGroup);
			}
		}

		var centeredRange = this._editor.getCenteredRangeInViewport();
		var shouldRestoreCenteredRange = (groups.length !== this._lenses.length);
		this._editor.changeDecorations((changeAccessor) => {
			this._editor.changeViewZones((accessor) => {

				var codeLensIndex = 0, groupsIndex = 0, helper = new CodeLensHelper();

				while (groupsIndex < groups.length && codeLensIndex < this._lenses.length) {

					var symbolsLineNumber = groups[groupsIndex][0].symbol.range.startLineNumber;
					var codeLensLineNumber = this._lenses[codeLensIndex].getLineNumber();

					if (codeLensLineNumber < symbolsLineNumber) {
						this._lenses[codeLensIndex].dispose(helper, accessor);
						this._lenses.splice(codeLensIndex, 1);
					} else if (codeLensLineNumber === symbolsLineNumber) {
						this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex]);
						groupsIndex++;
						codeLensIndex++;
					} else {
						this._lenses.splice(codeLensIndex, 0, new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._keybindingService, this._messageService));
						codeLensIndex++;
						groupsIndex++;
					}
				}

				// Delete extra code lenses
				while (codeLensIndex < this._lenses.length) {
					this._lenses[codeLensIndex].dispose(helper, accessor);
					this._lenses.splice(codeLensIndex, 1);
				}

				// Create extra symbols
				while (groupsIndex < groups.length) {
					this._lenses.push(new CodeLens(groups[groupsIndex], this._editor, helper, accessor, this._keybindingService, this._messageService));
					groupsIndex++;
				}

				helper.commit(changeAccessor);
			});
		});
		if (shouldRestoreCenteredRange) {
			this._editor.revealRangeInCenter(centeredRange);
		}
	}

	private _onViewportChanged(modeId: string): void {
		if (this._currentFindOccPromise) {
			this._currentFindOccPromise.cancel();
			this._currentFindOccPromise = null;
		}

		var model = this._editor.getModel();
		if (!model) {
			return;
		}

		var currentModelsVersionId = modelsVersionId(this._modelService, modeId);

		var toResolve: ICodeLensData[][] = [];
		var lenses: CodeLens[] = [];
		this._lenses.forEach((lens) => {
			var request = lens.computeIfNecessary(currentModelsVersionId, model);
			if (request) {
				toResolve.push(request);
				lenses.push(lens);
			}
		});

		if (toResolve.length === 0) {
			return;
		}

		var resource = model.getAssociatedResource();
		var promises = toResolve.map((request, i) => {

			let resolvedSymbols = new Array<Modes.ICodeLensSymbol>(request.length);
			let promises = request.map((request, i) => {
				return request.support.resolveCodeLensSymbol(resource, request.symbol).then(symbol => {
					resolvedSymbols[i] = symbol;
				});
			});

			return TPromise.join(promises).then(() => {
				lenses[i].updateCommands(resolvedSymbols, currentModelsVersionId);
			})
		});

		this._currentFindOccPromise = TPromise.join(promises).then(() => {
			this._currentFindOccPromise = null;
		});
	}
}

EditorBrowserRegistry.registerEditorContribution(CodeLensContribution);
