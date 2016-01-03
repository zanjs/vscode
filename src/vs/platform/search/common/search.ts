/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {PPromise} from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var ID = 'searchService';

export var ISearchService = createDecorator<ISearchService>(ID);
/**
 * A service that enables to search for files or with in files.
 */
export interface ISearchService {
	serviceId: ServiceIdentifier<any>;
	search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem>;
}

export interface IQueryOptions {
	rootResources?: uri[];
	filePattern?: string;
	excludePattern?: glob.IExpression;
	includePattern?: glob.IExpression;
	maxResults?: number;
	fileEncoding?: string;
	matchFuzzy?: boolean;
}

export interface ISearchQuery extends IQueryOptions {
	type: QueryType;
	contentPattern?: IPatternInfo;
}

export enum QueryType {
	File = 1,
	Text = 2
}

export interface IPatternInfo {
	pattern: string;
	isRegExp?: boolean;
	isWordMatch?: boolean;
	isCaseSensitive?: boolean;
}

export interface IFileMatch {
	resource?: uri;
	lineMatches?: ILineMatch[];
}

export interface ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];
}

export interface IProgress {
	total?: number;
	worked?: number;
}

export interface ISearchProgressItem extends IFileMatch, IProgress {
	// Marker interface to indicate the possible values for progress calls from the engine
}

export interface ISearchComplete {
	limitHit?: boolean;
	results: IFileMatch[];
}


// ---- very simple implementation of the search model --------------------

export class FileMatch implements IFileMatch {
	public lineMatches: LineMatch[] = [];
	constructor(public resource: uri) {
		// empty
	}
}

export class LineMatch implements ILineMatch {
	constructor(public preview: string, public lineNumber: number, public offsetAndLengths: number[][]) {
		// empty
	}
}

export interface ISearchConfiguration extends IFilesConfiguration {
	search: {
		exclude: glob.IExpression;
	};

	filePicker: {
		alternateFileNameMatching: boolean;
	};
}