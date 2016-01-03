/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');

export interface IConfiguration {
	editor:EditorCommon.IEditorOptions;
}

class ConfigClass implements IConfiguration {

	public editor: EditorCommon.IEditorOptions;

	constructor() {
		this.editor = {
			lineNumbers: true,
			selectOnLineNumbers: true,
			lineNumbersMinChars: 5,
			glyphMargin: false,
			lineDecorationsWidth: 10,
			revealHorizontalRightPadding: 30,
			roundedSelection: true,
			theme: 'vs',
			readOnly: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			cursorBlinking: 'blink',
			hideCursorInOverviewRuler: false,
			scrollBeyondLastLine: true,
			automaticLayout: false,
			wrappingColumn: 300,
			wrappingIndent: 'same',
			wordWrapBreakBeforeCharacters: '{([+',
			wordWrapBreakAfterCharacters: ' \t})]?|&,;',
			wordWrapBreakObtrusiveCharacters: '.',
			tabFocusMode: false,
			// stopLineTokenizationAfter
			// stopRenderingLineAfter
			longLineBoundary: 300,
			forcedTokenizationBoundary: 1000,

			// Features
			hover: true,
			contextmenu: true,
			mouseWheelScrollSensitivity: 1,
			quickSuggestions: true,
			quickSuggestionsDelay: 10,
			iconsInSuggestions: true,
			autoClosingBrackets: true,
			formatOnType: false,
			suggestOnTriggerCharacters: true,
			selectionHighlight: true,
			outlineMarkers: false,
			referenceInfos: true,
			renderWhitespace: false,

			tabSize: 4,
			insertSpaces: true,
			fontFamily: '',
			fontSize: 0,
			lineHeight: 0
		};
	}
}

export var DefaultConfig: IConfiguration = new ConfigClass();