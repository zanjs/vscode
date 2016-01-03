/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import paths = require('vs/base/common/paths');
import {ILink, IMode, IWorkerParticipant} from 'vs/editor/common/modes';
import {Range} from 'vs/editor/common/core/range';
import {IWorkspaceContextService, IWorkspace} from 'vs/platform/workspace/common/workspace';

/**
 * A base class of text editor worker that helps with detecting links in the text that point to files in the workspace.
 */
export class OutputWorker extends AbstractModeWorker {
	private _contextService: IWorkspaceContextService;
	private patterns: RegExp[];

	constructor(mode: IMode, participants: IWorkerParticipant[], @IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService, @IWorkspaceContextService contextService:IWorkspaceContextService) {
		super(mode, participants, resourceService, markerService);

		this._contextService = contextService;

		let workspace = this._contextService.getWorkspace();
		this.patterns = workspace ? OutputWorker.createPatterns(workspace) : [];
	}

	public get contextService(): IWorkspaceContextService {
		return this._contextService;
	}

	public computeLinks(resource: URI): TPromise<ILink[]> {
		return super.computeLinks(resource).then((links) => {
			if (!this.patterns.length) {
				return links;
			}

			let model = this.resourceService.get(resource);

			for (let i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
				links.push(...OutputWorker.detectLinks(model.getLineContent(i), i, this.patterns, this._contextService));
			}

			return links;
		});
	}

	public static createPatterns(workspace: IWorkspace): RegExp[] {
		let patterns: RegExp[] = [];

		let workspaceRootVariants = arrays.distinct([
			paths.normalize(workspace.resource.fsPath, true),
			paths.normalize(workspace.resource.fsPath, false)
		]);

		workspaceRootVariants.forEach((workspaceRoot) => {

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js on line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '(\\S*) on line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js:line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '(\\S*):line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts(45): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts (45): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts(45,18): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts (45,18): error
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '([^\\s\\(\\)]*)(\\s?\\((\\d+)(,(\\d+))?)\\)', 'gi'));

			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts
			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts:336
			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts:336:9
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?', 'gi'));
		});

		return patterns;
	}

	/**
	 * Detect links. Made public static to allow for tests.
	 */
	public static detectLinks(line: string, lineIndex: number, patterns: RegExp[], contextService: IWorkspaceContextService): ILink[] {
		let links: ILink[] = [];

		patterns.forEach((pattern) => {
			pattern.lastIndex = 0; // the holy grail of software development

			let match: RegExpExecArray;
			let offset = 0;
			while ((match = pattern.exec(line)) !== null) {

				// Convert the relative path information to a resource that we can use in links
				let workspaceRelativePath = strings.replaceAll(strings.rtrim(match[1], '.'), '\\', '/'); // remove trailing "." that likely indicate end of sentence
				let resource:string;
				try {
					resource = contextService.toResource(workspaceRelativePath).toString();
				} catch (error) {
					continue; // we might find an invalid URI and then we dont want to loose all other links
				}

				// Append line/col information to URI if matching
				if (match[3]) {
					let lineNumber = match[3];

					if (match[5]) {
						let columnNumber = match[5];
						resource = strings.format('{0}#{1},{2}', resource, lineNumber, columnNumber);
					} else {
						resource = strings.format('{0}#{1}', resource, lineNumber);
					}
				}

				let fullMatch = strings.rtrim(match[0], '.'); // remove trailing "." that likely indicate end of sentence

				let index = line.indexOf(fullMatch, offset);
				offset += index + fullMatch.length;

				var linkRange = {
					startColumn: index + 1,
					startLineNumber: lineIndex,
					endColumn: index + 1 + fullMatch.length,
					endLineNumber: lineIndex
				};

				if (links.some((link) => Range.areIntersectingOrTouching(link.range, linkRange))) {
					return; // Do not detect duplicate links
				}

				links.push({
					range: linkRange,
					url: resource
				});
			}
		});

		return links;
	}
}