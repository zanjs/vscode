/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {BaseBinaryResourceEditor} from 'vs/workbench/browser/parts/editor/binaryEditor';
import {BINARY_FILE_EDITOR_ID} from 'vs/workbench/parts/files/common/files';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

/**
 * An implementation of editor for binary files like images or videos leveraging the FileEditorInput.
 */
export class BinaryFileEditor extends BaseBinaryResourceEditor {

	public static ID = BINARY_FILE_EDITOR_ID;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(BinaryFileEditor.ID, telemetryService, editorService);
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('binaryFileEditor', "Binary File Viewer");
	}

	public supportsSplitEditor(): boolean {
		return true; // yes, we can!
	}
}