/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/binarydiffeditor';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import {Sash, ISashEvent, IVerticalSashLayoutProvider} from 'vs/base/browser/ui/sash/sash';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {ResourceViewer} from 'vs/base/browser/ui/resourceviewer/resourceViewer';
import {IScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/impl/scrollableElement';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {BinaryEditorModel} from 'vs/workbench/browser/parts/editor/binaryEditorModel';
import {DiffEditorModel} from 'vs/workbench/browser/parts/editor/diffEditorModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

/**
 * An implementation of editor for diffing binary files like images or videos.
 */
export class BinaryResourceDiffEditor extends BaseEditor implements IVerticalSashLayoutProvider {

	public static ID = 'workbench.editors.binaryResourceDiffEditor';

	private static MIN_CONTAINER_WIDTH = 100;

	private leftBinaryContainer: Builder;
	private leftScrollbar: IScrollableElement;
	private rightBinaryContainer: Builder;
	private rightScrollbar: IScrollableElement;
	private sash: Sash;
	private dimension: Dimension;
	private leftContainerWidth: number;
	private startLeftContainerWidth: number;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(BinaryResourceDiffEditor.ID, telemetryService);
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('binaryDiffEditor', "Binary Diff Viewer");
	}

	public createEditor(parent: Builder): void {

		// Left Container for Binary
		let leftBinaryContainerElement = document.createElement('div');
		leftBinaryContainerElement.className = 'binary-container';
		this.leftBinaryContainer = $(leftBinaryContainerElement);
		this.leftBinaryContainer.tabindex(0); // enable focus support

		// Left Custom Scrollbars
		this.leftScrollbar = new ScrollableElement(leftBinaryContainerElement, { horizontal: 'hidden', vertical: 'hidden' });
		parent.getHTMLElement().appendChild(this.leftScrollbar.getDomNode());
		$(this.leftScrollbar.getDomNode()).addClass('binarydiff-left');

		// Sash
		this.sash = new Sash(parent.getHTMLElement(), this);
		this.sash.addListener('start', () => this.onSashDragStart());
		this.sash.addListener('change', (e: ISashEvent) => this.onSashDrag(e));
		this.sash.addListener('end', () => this.onSashDragEnd());

		// Right Container for Binary
		let rightBinaryContainerElement = document.createElement('div');
		rightBinaryContainerElement.className = 'binary-container';
		this.rightBinaryContainer = $(rightBinaryContainerElement);
		this.rightBinaryContainer.tabindex(0); // enable focus support

		// Right Custom Scrollbars
		this.rightScrollbar = new ScrollableElement(rightBinaryContainerElement, { horizontal: 'hidden', vertical: 'hidden' });
		parent.getHTMLElement().appendChild(this.rightScrollbar.getDomNode());
		$(this.rightScrollbar.getDomNode()).addClass('binarydiff-right');
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		let oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		let forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {
			return TPromise.as<void>(null);
		}

		// Different Input (Reload)
		return this.editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel: DiffEditorModel) => {

			// Assert model instance
			if (!(resolvedModel.originalModel instanceof BinaryEditorModel) || !(resolvedModel.modifiedModel instanceof BinaryEditorModel)) {
				return TPromise.wrapError<void>(nls.localize('cannotDiffTextToBinary', "Comparing binary files to non binary files is currently not supported"));
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading a diff takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
				return null;
			}

			// Render original
			let original = <BinaryEditorModel>resolvedModel.originalModel;
			this.renderInput(original.getName(), original.getResource(), true);

			// Render modified
			let modified = <BinaryEditorModel>resolvedModel.modifiedModel;
			this.renderInput(modified.getName(), modified.getResource(), false);
		});
	}

	private renderInput(name: string, resource: URI, isOriginal: boolean): void {

		// Reset Sash to default 50/50 ratio if needed
		if (this.leftContainerWidth && this.dimension && this.leftContainerWidth !== this.dimension.width / 2) {
			this.leftContainerWidth = this.dimension.width / 2;
			this.layoutContainers();
			this.sash.layout();
		}

		// Pass to ResourceViewer
		let container = isOriginal ? this.leftBinaryContainer : this.rightBinaryContainer;
		let scrollbar = isOriginal ? this.leftScrollbar : this.rightScrollbar;

		ResourceViewer.show(name, resource, container, scrollbar);
	}

	public clearInput(): void {

		// Empty HTML Container
		$(this.leftBinaryContainer).empty();
		$(this.rightBinaryContainer).empty();

		super.clearInput();
	}

	public layout(dimension: Dimension): void {
		let oldDimension = this.dimension;
		this.dimension = dimension;

		// Calculate left hand container width based on sash move or fallback to 50% by default
		if (!this.leftContainerWidth || !oldDimension) {
			this.leftContainerWidth = this.dimension.width / 2;
		} else {
			let sashRatio = this.leftContainerWidth / oldDimension.width;
			this.leftContainerWidth = this.dimension.width * sashRatio;
		}

		// Sash positioning
		this.sash.layout();

		// Pass on to Binary Containers and Scrollbars
		this.layoutContainers();
	}

	private layoutContainers(): void {

		// Size left container
		this.leftBinaryContainer.size(this.leftContainerWidth, this.dimension.height);
		this.leftScrollbar.onElementDimensions();
		this.leftScrollbar.onElementInternalDimensions();

		// Size right container
		this.rightBinaryContainer.size(this.dimension.width - this.leftContainerWidth, this.dimension.height);
		this.rightScrollbar.onElementDimensions();
		this.rightScrollbar.onElementInternalDimensions();
	}

	private onSashDragStart(): void {
		this.startLeftContainerWidth = this.leftContainerWidth;
	}

	private onSashDrag(e: ISashEvent): void {

		// Update Widths and keep in bounds of MIN_CONTAINER_WIDTH for both sides
		let newLeftContainerWidth = this.startLeftContainerWidth + e.currentX - e.startX;
		this.leftContainerWidth = Math.max(BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH, newLeftContainerWidth);
		if (this.dimension.width - this.leftContainerWidth < BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH) {
			this.leftContainerWidth = this.dimension.width - BinaryResourceDiffEditor.MIN_CONTAINER_WIDTH;
		}

		// Pass on to Binary Containers and Scrollbars
		this.layoutContainers();
	}

	private onSashDragEnd(): void {
		this.sash.layout();
	}

	public getVerticalSashTop(sash: Sash): number {
		return 0;
	}

	public getVerticalSashLeft(sash: Sash): number {
		return this.leftContainerWidth;
	}

	public getVerticalSashHeight(sash: Sash): number {
		return this.dimension.height;
	}

	public focus(): void {
		this.rightBinaryContainer.domFocus();
	}

	public dispose(): void {

		// Sash
		this.sash.dispose();

		// Dispose Scrollbar
		this.leftScrollbar.dispose();
		this.rightScrollbar.dispose();

		// Destroy Container
		this.leftBinaryContainer.destroy();
		this.rightBinaryContainer.destroy();

		super.dispose();
	}
}