/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {strictEqual, equal} from 'assert';
import {join} from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import {FileEditorDescriptor} from 'vs/workbench/parts/files/browser/files';
import {Registry} from 'vs/platform/platform';
import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';

const ExtensionId = Extensions.Editors;

class MyClass { }
class MyOtherClass { }

suite('Files - TextFileEditor', () => {

	test("TextFile Editor Registration", function() {
		let d1 = new FileEditorDescriptor("ce-id1", "name", "vs/workbench/parts/files/browser/tests/contentEditor.test", "MyClass", ["test-text/html", "test-text/javascript"]);
		let d2 = new FileEditorDescriptor("ce-id2", "name", "vs/workbench/parts/files/browser/tests/contentEditor.test", "MyOtherClass", ["test-text/css", "test-text/javascript"]);

		let oldEditors = Registry.as(ExtensionId).getEditors();
		Registry.as(ExtensionId).setEditors([]);

		let oldEditorCnt = Registry.as(ExtensionId).getEditors().length;
		let oldInputCnt = Registry.as(ExtensionId).getEditorInputs().length;

		Registry.as(ExtensionId).registerEditor(d1, new SyncDescriptor(FileEditorInput));
		Registry.as(ExtensionId).registerEditor(d2, new SyncDescriptor(FileEditorInput));

		equal(Registry.as(ExtensionId).getEditors().length, oldEditorCnt + 2);
		equal(Registry.as(ExtensionId).getEditorInputs().length, oldInputCnt + 2);

		strictEqual(Registry.as(ExtensionId).getEditor(new FileEditorInput(URI.file(join('C:\\', "/foo/bar/foobar.html")), "test-text/html", void 0, void 0, void 0, void 0)), d1);
		strictEqual(Registry.as(ExtensionId).getEditor(new FileEditorInput(URI.file(join('C:\\', "/foo/bar/foobar.js")), "test-text/javascript", void 0, void 0, void 0, void 0)), d1);
		strictEqual(Registry.as(ExtensionId).getEditor(new FileEditorInput(URI.file(join('C:\\', "/foo/bar/foobar.css")), "test-text/css", void 0, void 0, void 0, void 0)), d2);

		Registry.as(ExtensionId).setEditors(oldEditors);
	});
});