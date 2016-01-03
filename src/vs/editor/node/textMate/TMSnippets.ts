/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import snippets = require('vs/editor/contrib/snippet/common/snippet');
import json = require('vs/base/common/json');
import modesExt = require('vs/editor/common/modes/modesRegistry');
import paths = require('vs/base/common/paths');
import {IModelService} from 'vs/editor/common/services/modelService';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {LanguageExtensions} from 'vs/editor/common/modes/languageExtensionPoint';

import pfs = require('vs/base/node/pfs');

export interface ITMSnippetsExtensionPoint {
	language: string;
	path: string;
}

export function snippetUpdated(modeId: string, filePath: string) {
	return pfs.readFile(filePath).then((fileContents) => {
		var errors: string[] = [];
		var snippets = json.parse(fileContents.toString(), errors);
		var adaptedSnippets = TMSnippetsAdaptor.adapt(snippets);
		modesExt.registerSnippets(modeId, filePath, adaptedSnippets);
	});
}

let snippetsExtensionPoint = PluginsRegistry.registerExtensionPoint<ITMSnippetsExtensionPoint[]>('snippets', {
	description: nls.localize('vscode.extension.contributes.snippets', 'Contributes textmate snippets.'),
	type: 'array',
	default: [{ language: '', path: '' }],
	items: {
		type: 'object',
		default: { language: '{{id}}', path: './snippets/{{id}}.json.'},
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.snippets.language', 'Language id for which this snippet is contributed to.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.snippets.path', 'Path of the snippets file. The path is relative to the extension folder and typically starts with \'./snippets/\'.'),
				type: 'string'
			}
		}
	}
});

export class MainProcessTextMateSnippet {
	private _modelService: IModelService;

	constructor(
		@IModelService modelService: IModelService
	) {
		this._modelService = modelService;

		snippetsExtensionPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let tmSnippets = extensions[i].value;
				for (let j = 0; j < tmSnippets.length; j++) {
					this._withTMSnippetContribution(extensions[i].description.extensionFolderPath, tmSnippets[j], extensions[i].collector);
				}
			}
		});
	}

	private _withTMSnippetContribution(extensionFolderPath:string, snippet:ITMSnippetsExtensionPoint, collector:IMessageCollector): void {
		if (!snippet.language || (typeof snippet.language !== 'string') || !LanguageExtensions.isRegisteredMode(snippet.language)) {
			collector.error(nls.localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", snippetsExtensionPoint.name, String(snippet.language)));
			return;
		}
		if (!snippet.path || (typeof snippet.path !== 'string')) {
			collector.error(nls.localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", snippetsExtensionPoint.name, String(snippet.path)));
			return;
		}
		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, snippet.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", snippetsExtensionPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		let modeId = snippet.language;

		PluginsRegistry.registerOneTimeActivationEventListener('onLanguage:' + modeId, () => {
			this.registerDefinition(modeId, normalizedAbsolutePath);
		});
	}

	public registerDefinition(modeId: string, filePath: string): void {
		pfs.readFile(filePath).then((fileContents) => {
			var errors: string[] = [];
			var snippets = json.parse(fileContents.toString(), errors);
			var adaptedSnippets = TMSnippetsAdaptor.adapt(snippets);
			modesExt.registerDefaultSnippets(modeId, adaptedSnippets);
		});
	}
}

class TMSnippetsAdaptor {

	public static adapt(snippets: any): Modes.ISuggestion[]{
		var topLevelProperties = Object.keys(snippets),
			result: Modes.ISuggestion[] = [];

		var processSnippet = (snippet: any, description: string) => {
			var prefix = snippet['prefix'];
			var bodyStringOrArray = snippet['body'];

			if (Array.isArray(bodyStringOrArray)) {
				bodyStringOrArray = bodyStringOrArray.join('\n');
			}

			if (typeof prefix === 'string' && typeof bodyStringOrArray === 'string') {
				var convertedSnippet = TMSnippetsAdaptor.convertSnippet(bodyStringOrArray);
				if (convertedSnippet !== null) {
					result.push({
						type: 'snippet',
						label: prefix,
						documentationLabel: snippet['description'] || description,
						codeSnippet: convertedSnippet
					});
				}
			}
		}

		topLevelProperties.forEach(topLevelProperty => {
			var scopeOrTemplate = snippets[topLevelProperty];
			if (scopeOrTemplate['body'] && scopeOrTemplate['prefix']) {
				processSnippet(scopeOrTemplate, topLevelProperty);
			} else {
				var snippetNames = Object.keys(scopeOrTemplate);
				snippetNames.forEach(name => {
					processSnippet(scopeOrTemplate[name], name);
				})
			}
		});
		return result;
	}

	private static convertSnippet(textMateSnippet: string): string {
		return snippets.CodeSnippet.convertExternalSnippet(textMateSnippet, snippets.ExternalSnippetType.TextMateSnippet);
	}
}
