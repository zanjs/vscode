/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import modesExtensions = require('vs/editor/common/modes/modesRegistry');

modesExtensions.registerMode({
	id: 'html',
	extensions: ['.html', '.htm', '.shtml', '.mdoc', '.jsp', '.asp', '.aspx', '.jshtm'],
	aliases: ['HTML', 'htm', 'html', 'xhtml'],
	mimetypes: ['text/html', 'text/x-jshtm', 'text/template', 'text/ng-template'],
	moduleId: 'vs/languages/html/common/html',
	ctorName: 'HTMLMode'
});
