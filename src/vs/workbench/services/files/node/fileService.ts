/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import paths = require('path');
import fs = require('fs');
import os = require('os');
import crypto = require('crypto');
import assert = require('assert');
import iconv = require('iconv-lite');

import files = require('vs/platform/files/common/files');
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import baseMime = require('vs/base/common/mime');
import basePaths = require('vs/base/common/paths');
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import objects = require('vs/base/common/objects');
import extfs = require('vs/base/node/extfs');
import {nfcall, Limiter, ThrottledDelayer} from 'vs/base/common/async';
import uri from 'vs/base/common/uri';
import nls = require('vs/nls');

import pfs = require('vs/base/node/pfs');
import encoding = require('vs/base/node/encoding');
import mime = require('vs/base/node/mime');
import flow = require('vs/base/node/flow');
import {FileWatcher as UnixWatcherService} from 'vs/workbench/services/files/node/watcher/unix/watcherService';
import {FileWatcher as WindowsWatcherService} from 'vs/workbench/services/files/node/watcher/win32/watcherService';
import {toFileChangesEvent, normalize, IRawFileChange} from 'vs/workbench/services/files/node/watcher/common';
import {IEventService} from 'vs/platform/event/common/event';

export interface IEncodingOverride {
	resource: uri;
	encoding: string;
}

export interface IFileServiceOptions {
	tmpDir?: string;
	errorLogger?: (msg: string) => void;
	encoding?: string;
	encodingOverride?: IEncodingOverride[];
	watcherIgnoredPatterns?: string[];
	disableWatcher?: boolean;
	verboseLogging?: boolean;
}

function etag(stat: fs.Stats): string;
function etag(size: number, mtime: number): string;
function etag(arg1: any, arg2?: any): string {
	let size: number;
	let mtime: number;
	if (typeof arg2 === 'number') {
		size = arg1;
		mtime = arg2;
	} else {
		size = (<fs.Stats>arg1).size;
		mtime = (<fs.Stats>arg1).mtime.getTime();
	}

	return '"' + crypto.createHash('sha1').update(String(size) + String(mtime)).digest('hex') + '"';
}

export class FileService implements files.IFileService {

	public serviceId = files.IFileService;

	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static MAX_FILE_SIZE = 50 * 1024 * 1024;  // do not try to load larger files than that
	private static MAX_DEGREE_OF_PARALLEL_FS_OPS = 10; // degree of parallel fs calls that we accept at the same time

	private basePath: string;
	private tmpPath: string;
	private options: IFileServiceOptions;

	private eventEmitter: IEventService;

	private workspaceWatcherToDispose: () => void;

	private activeFileChangesWatchers: { [resource: string]: fs.FSWatcher; };
	private fileChangesWatchDelayer: ThrottledDelayer<void>;
	private undeliveredRawFileChangesEvents: IRawFileChange[];

	constructor(basePath: string, eventEmitter: IEventService, options: IFileServiceOptions) {
		this.basePath = basePath ? paths.normalize(basePath) : void 0;

		if (this.basePath && this.basePath.indexOf('\\\\') === 0 && strings.endsWith(this.basePath, paths.sep)) {
			// for some weird reason, node adds a trailing slash to UNC paths
			// we never ever want trailing slashes as our base path unless
			// someone opens root ("/").
			// See also https://github.com/nodejs/io.js/issues/1765
			this.basePath = strings.rtrim(this.basePath, paths.sep);
		}

		if (this.basePath && !paths.isAbsolute(basePath)) {
			throw new Error('basePath has to be an absolute path');
		}

		this.options = options || Object.create(null);
		this.eventEmitter = eventEmitter;
		this.tmpPath = this.options.tmpDir || os.tmpdir();

		if (this.options && !this.options.errorLogger) {
			this.options.errorLogger = console.error;
		}

		if (this.basePath && !this.options.disableWatcher) {
			if (process.platform === 'win32') {
				this.setupWin32WorkspaceWatching();
			} else {
				this.setupUnixWorkspaceWatching();
			}
		}

		this.activeFileChangesWatchers = Object.create(null);
		this.fileChangesWatchDelayer = new ThrottledDelayer<void>(FileService.FS_EVENT_DELAY);
		this.undeliveredRawFileChangesEvents = [];
	}

	public updateOptions(options: IFileServiceOptions): void {
		if (options) {
			objects.mixin(this.options, options); // overwrite current options
		}
	}

	private setupWin32WorkspaceWatching(): void {
		this.workspaceWatcherToDispose = new WindowsWatcherService(this.basePath, this.options.watcherIgnoredPatterns, this.eventEmitter, this.options.errorLogger, this.options.verboseLogging).startWatching();
	}

	private setupUnixWorkspaceWatching(): void {
		this.workspaceWatcherToDispose = new UnixWatcherService(this.basePath, this.options.watcherIgnoredPatterns, this.eventEmitter, this.options.errorLogger, this.options.verboseLogging).startWatching();
	}

	public resolveFile(resource: uri, options?: files.IResolveFileOptions): TPromise<files.IFileStat> {
		return this.resolve(resource, options);
	}

	public resolveContent(resource: uri, options?: files.IResolveContentOptions): TPromise<files.IContent> {
		let absolutePath = this.toAbsolutePath(resource);

		// 1.) detect mimes
		return nfcall(mime.detectMimesFromFile, absolutePath).then((detected: mime.IMimeAndEncoding) => {
			let isText = detected.mimes.indexOf(baseMime.MIME_BINARY) === -1;

			// Return error early if client only accepts text and this is not text
			if (options && options.acceptTextOnly && !isText) {
				return Promise.wrapError(<files.IFileOperationResult>{
					message: nls.localize('fileBinaryError', "File seems to be binary and cannot be opened as text"),
					fileOperationResult: files.FileOperationResult.FILE_IS_BINARY
				});
			}

			let etag = options && options.etag;
			let enc = options && options.encoding;

			// 2.) get content
			return this.resolveFileContent(resource, etag, enc /* give user choice precedence */ || detected.encoding).then((content) => {

				// set our knowledge about the mime on the content obj
				content.mime = detected.mimes.join(', ');

				return content;
			});
		}, (error) => {

			// bubble up existing file operation results
			if (!types.isUndefinedOrNull((<files.IFileOperationResult>error).fileOperationResult)) {
				return Promise.wrapError(error);
			}

			// on error check if the file does not exist or is a folder and return with proper error result
			return pfs.exists(absolutePath).then((exists) => {

				// Return if file not found
				if (!exists) {
					return Promise.wrapError(<files.IFileOperationResult>{
						message: nls.localize('fileNotFoundError', "File not found ({0})", absolutePath),
						fileOperationResult: files.FileOperationResult.FILE_NOT_FOUND
					});
				}

				// Otherwise check for file being a folder?
				return pfs.stat(absolutePath).then((stat) => {
					if (stat.isDirectory()) {
						return Promise.wrapError(<files.IFileOperationResult>{
							message: nls.localize('fileIsDirectoryError', "File is directory ({0})", absolutePath),
							fileOperationResult: files.FileOperationResult.FILE_IS_DIRECTORY
						});
					}

					// otherwise just give up
					return Promise.wrapError(error);
				});
			});
		});
	}

	public resolveContents(resources: uri[]): TPromise<files.IContent[]> {
		let limiter = new Limiter(FileService.MAX_DEGREE_OF_PARALLEL_FS_OPS);

		let contentPromises = <TPromise<files.IContent>[]>[];
		resources.forEach((resource) => {
			contentPromises.push(limiter.queue(() => this.resolveFileContent(resource).then((content) => content, (error) => Promise.as(null /* ignore errors gracefully */))));
		});

		return TPromise.join(contentPromises).then((contents) => {
			return arrays.coalesce(contents);
		});
	}

	public updateContent(resource: uri, value: string, options: files.IUpdateContentOptions = Object.create(null)): TPromise<files.IFileStat> {
		let absolutePath = this.toAbsolutePath(resource);

		// 1.) check file
		return this.checkFile(absolutePath, options).then((exists) => {
			let createParentsPromise: Promise;
			if (exists) {
				createParentsPromise = Promise.as(null);
			} else {
				createParentsPromise = pfs.mkdirp(paths.dirname(absolutePath));
			}

			// 2.) create parents as needed
			return createParentsPromise.then(() => {
				let encodingToWrite = this.getEncoding(resource, options.charset);

				// UTF16 without BOM makes no sense so always add it
				let addBomPromise: TPromise<boolean> = TPromise.as(false);
				if (encodingToWrite === encoding.UTF16be || encodingToWrite === encoding.UTF16le) {
					addBomPromise = TPromise.as(true);
				}

				// UTF8 only gets a BOM if the file had it alredy
				else if (exists && encodingToWrite === encoding.UTF8) {
					addBomPromise = nfcall(encoding.detectEncodingByBOM, absolutePath).then((enc) => enc === encoding.UTF8); // only for UTF8 we need to check if we have to preserve a BOM
				}

				// 3.) check to add UTF BOM
				return addBomPromise.then((addBom) => {
					let writeFilePromise: Promise;

					// Write fast if we do UTF 8 without BOM
					if (!addBom && encodingToWrite === encoding.UTF8) {
						writeFilePromise = pfs.writeFile(absolutePath, value, encoding.UTF8);
					}

					// Otherwise use Iconv-Lite for encoding
					else {
						let encoded = iconv.encode(value, encodingToWrite, { addBOM: addBom });
						writeFilePromise = pfs.writeFile(absolutePath, encoded);
					}

					// 4.) set contents
					return writeFilePromise.then(() => {

						// 5.) resolve
						return this.resolve(resource);
					});
				});
			});
		});
	}

	public createFile(resource: uri, content: string = ''): TPromise<files.IFileStat> {
		return this.updateContent(resource, content);
	}

	public createFolder(resource: uri): TPromise<files.IFileStat> {

		// 1.) create folder
		let absolutePath = this.toAbsolutePath(resource);
		return pfs.mkdirp(absolutePath).then(() => {

			// 2.) resolve
			return this.resolve(resource);
		});
	}

	public rename(resource: uri, newName: string): TPromise<files.IFileStat> {
		let newPath = paths.join(paths.dirname(resource.fsPath), newName);

		return this.moveFile(resource, uri.file(newPath));
	}

	public moveFile(source: uri, target: uri, overwrite?: boolean): TPromise<files.IFileStat> {
		return this.moveOrCopyFile(source, target, false, overwrite);
	}

	public copyFile(source: uri, target: uri, overwrite?: boolean): TPromise<files.IFileStat> {
		return this.moveOrCopyFile(source, target, true, overwrite);
	}

	private moveOrCopyFile(source: uri, target: uri, keepCopy: boolean, overwrite: boolean): TPromise<files.IFileStat> {
		let sourcePath = this.toAbsolutePath(source);
		let targetPath = this.toAbsolutePath(target);

		// 1.) move / copy
		return this.doMoveOrCopyFile(sourcePath, targetPath, keepCopy, overwrite).then(() => {

			// 2.) resolve
			return this.resolve(target);
		});
	}

	private doMoveOrCopyFile(sourcePath: string, targetPath: string, keepCopy: boolean, overwrite: boolean): TPromise<boolean /* exists */> {

		// 1.) check if target exists
		return pfs.exists(targetPath).then((exists) => {
			let isCaseRename = sourcePath.toLowerCase() === targetPath.toLowerCase();

			// Return early with conflict if target exists and we are not told to overwrite
			if (exists && !isCaseRename && !overwrite) {
				return Promise.wrapError(<files.IFileOperationResult>{
					fileOperationResult: files.FileOperationResult.FILE_MOVE_CONFLICT
				});
			}

			// 2.) make sure target is deleted before we move/copy unless this is a case rename of the same file
			let deleteTargetPromise = Promise.as(null);
			if (exists && !isCaseRename) {
				if (basePaths.isEqualOrParent(sourcePath, targetPath)) {
					return Promise.wrapError(nls.localize('unableToMoveCopyError', "Unable to move/copy. File would replace folder it is contained in.")); // catch this corner case!
				}

				deleteTargetPromise = this.del(uri.file(targetPath));
			}

			return deleteTargetPromise.then(() => {

				// 3.) make sure parents exists
				return pfs.mkdirp(paths.dirname(targetPath)).then(() => {
					// 4.) copy/move
					if (keepCopy) {
						return nfcall(extfs.copy, sourcePath, targetPath);
					} else {
						return nfcall(extfs.mv, sourcePath, targetPath);
					}
				}).then(() => exists);
			});
		});
	}

	public importFile(source: uri, targetFolder: uri): TPromise<files.IImportResult> {
		let sourcePath = this.toAbsolutePath(source);
		let targetResource = uri.file(paths.join(targetFolder.fsPath, paths.basename(source.fsPath)));
		let targetPath = this.toAbsolutePath(targetResource);

		// 1.) resolve
		return pfs.stat(sourcePath).then((stat) => {
			if (stat.isDirectory()) {
				return Promise.wrapError(nls.localize('foldersCopyError', "Folders cannot be copied into the workspace. Please select individual files to copy them.")); // for now we do not allow to import a folder into a workspace
			}

			// 2.) copy
			return this.doMoveOrCopyFile(sourcePath, targetPath, true, true).then((exists) => {

				// 3.) resolve
				return this.resolve(targetResource).then((stat) => <files.IImportResult>{ isNew: !exists, stat: stat });
			});
		});
	}

	public del(resource: uri): Promise {
		let absolutePath = this.toAbsolutePath(resource);

		return nfcall(extfs.del, absolutePath, this.tmpPath);
	}

	// Helpers

	private toAbsolutePath(arg1: uri | files.IFileStat): string {
		let resource: uri;
		if (uri.isURI(arg1)) {
			resource = <uri>arg1;
		} else {
			resource = (<files.IFileStat>arg1).resource;
		}

		assert.ok(resource && resource.scheme === 'file', 'Invalid resource: ' + resource);

		return paths.normalize(resource.fsPath);
	}

	private resolve(resource: uri, options: files.IResolveFileOptions = Object.create(null)): TPromise<files.IFileStat> {
		return this.toStatResolver(resource)
			.then(model => model.resolve(options));
	}

	private toStatResolver(resource: uri): TPromise<StatResolver> {
		let absolutePath = this.toAbsolutePath(resource);

		return pfs.stat(absolutePath).then((stat: fs.Stats) => {
			return new StatResolver(resource, stat.isDirectory(), stat.mtime.getTime(), stat.size);
		});
	}

	private resolveFileContent(resource: uri, etag?: string, enc?: string): TPromise<files.IContent> {
		let absolutePath = this.toAbsolutePath(resource);

		// 1.) stat
		return this.resolve(resource).then((model) => {

			// Return early if file not modified since
			if (etag && etag === model.etag) {
				return Promise.wrapError(<files.IFileOperationResult>{
					fileOperationResult: files.FileOperationResult.FILE_NOT_MODIFIED_SINCE
				});
			}

			// Return early if file is too large to load
			if (types.isNumber(model.size) && model.size > FileService.MAX_FILE_SIZE) {
				return Promise.wrapError(<files.IFileOperationResult>{
					fileOperationResult: files.FileOperationResult.FILE_TOO_LARGE
				});
			}

			// 2.) read contents
			return new Promise((c, e) => {
				let done = false;
				let chunks: NodeBuffer[] = [];
				let fileEncoding = this.getEncoding(model.resource, enc);

				const reader = fs.createReadStream(absolutePath).pipe(iconv.decodeStream(fileEncoding)); // decode takes care of stripping any BOMs from the file content

				reader.on('data', (buf) => {
					chunks.push(buf);
				});

				reader.on('error', (error) => {
					if (!done) {
						done = true;
						e(error);
					}
				});

				reader.on('end', () => {
					let content: files.IContent = <any>model;
					content.value = chunks.join('');
					content.charset = fileEncoding; // make sure to store the charset in the model to restore it later when writing

					if (!done) {
						done = true;
						c(content);
					}
				});
			});
		});
	}

	private getEncoding(resource: uri, candidate?: string): string {
		let fileEncoding: string;

		let override = this.getEncodingOverride(resource);
		if (override) {
			fileEncoding = override;
		} else if (candidate) {
			fileEncoding = candidate;
		} else if (this.options) {
			fileEncoding = this.options.encoding;
		}

		if (!fileEncoding || !iconv.encodingExists(fileEncoding)) {
			fileEncoding = encoding.UTF8; // the default is UTF 8
		}

		return fileEncoding;
	}

	private getEncodingOverride(resource: uri): string {
		if (resource && this.options.encodingOverride && this.options.encodingOverride.length) {
			for (let i = 0; i < this.options.encodingOverride.length; i++) {
				let override = this.options.encodingOverride[i];

				// check if the resource is a child of the resource with override and use
				// the provided encoding in that case
				if (resource.toString().indexOf(override.resource.toString() + '/') === 0) {
					return override.encoding;
				}
			}
		}

		return null;
	}

	private checkFile(absolutePath: string, options: files.IUpdateContentOptions): TPromise<boolean /* exists */> {
		return pfs.exists(absolutePath).then((exists) => {
			if (exists) {
				return pfs.stat(absolutePath).then((stat: fs.Stats) => {
					if (stat.isDirectory()) {
						return Promise.wrapError(new Error('Expected file is actually a directory'));
					}

					// Dirty write prevention
					if (typeof options.mtime === 'number' && typeof options.etag === 'string' && options.mtime < stat.mtime.getTime()) {

						// Find out if content length has changed
						if (options.etag !== etag(stat.size, options.mtime)) {
							return Promise.wrapError(<files.IFileOperationResult>{
								message: 'File Modified Since',
								fileOperationResult: files.FileOperationResult.FILE_MODIFIED_SINCE
							});
						}
					}

					let mode = stat.mode;
					let readonly = !(mode & 128);

					// Throw if file is readonly and we are not instructed to overwrite
					if (readonly && !options.overwriteReadonly) {
						return Promise.wrapError(<files.IFileOperationResult>{
							message: nls.localize('fileReadOnlyError', "File is Read Only"),
							fileOperationResult: files.FileOperationResult.FILE_READ_ONLY
						});
					}

					if (readonly) {
						mode = mode | 128;
						return pfs.chmod(absolutePath, mode).then(() => exists);
					}

					return TPromise.as<boolean>(exists);
				});
			}

			return TPromise.as<boolean>(exists);
		});
	}

	public watchFileChanges(resource: uri): void {
		assert.ok(resource && resource.scheme === 'file', 'Invalid resource for watching: ' + resource);

		let fsPath = resource.fsPath;

		// Create or get watcher for provided path
		let watcher = this.activeFileChangesWatchers[resource.toString()];
		if (!watcher) {
			try {
				watcher = fs.watch(fsPath); // will be persistent but not recursive
			} catch (error) {
				// the path might not exist anymore, ignore this error and return
				return;
			}

			this.activeFileChangesWatchers[resource.toString()] = watcher;

			// eventType is either 'rename' or 'change'
			watcher.on('change', (eventType: string) => {
				if (eventType !== 'change') {
					return; // only care about changes for now ('rename' is not reliable and can be send even if the file is still there with some tools)
				}

				// add to bucket of undelivered events
				this.undeliveredRawFileChangesEvents.push({
					type: files.FileChangeType.UPDATED,
					path: fsPath
				});

				// handle emit through delayer to accommodate for bulk changes
				this.fileChangesWatchDelayer.trigger(() => {
					let buffer = this.undeliveredRawFileChangesEvents;
					this.undeliveredRawFileChangesEvents = [];

					// Normalize
					let normalizedEvents = normalize(buffer);

					// Emit
					this.eventEmitter.emit(files.EventType.FILE_CHANGES, toFileChangesEvent(normalizedEvents));

					return Promise.as(null);
				});
			});
		}
	}

	public unwatchFileChanges(resource: uri): void;
	public unwatchFileChanges(path: string): void;
	public unwatchFileChanges(arg1: any): void {
		let resource = (typeof arg1 === 'string') ? uri.parse(arg1) : arg1;

		let watcher = this.activeFileChangesWatchers[resource.toString()];
		if (watcher) {
			watcher.close();
			delete this.activeFileChangesWatchers[resource.toString()];
		}
	}

	public dispose(): void {
		if (this.workspaceWatcherToDispose) {
			this.workspaceWatcherToDispose();
			this.workspaceWatcherToDispose = null;
		}

		for (let key in this.activeFileChangesWatchers) {
			let watcher = this.activeFileChangesWatchers[key];
			watcher.close();
		}
		this.activeFileChangesWatchers = Object.create(null);
	}
}

export class StatResolver {
	private resource: uri;
	private isDirectory: boolean;
	private mtime: number;
	private name: string;
	private mime: string;
	private etag: string;
	private size: number;

	constructor(resource: uri, isDirectory: boolean, mtime: number, size: number) {
		assert.ok(resource && resource.scheme === 'file', 'Invalid resource: ' + resource);

		this.resource = resource;
		this.isDirectory = isDirectory;
		this.mtime = mtime;
		this.name = paths.basename(resource.fsPath);
		this.mime = !this.isDirectory ? baseMime.guessMimeTypes(resource.fsPath).join(', ') : null;
		this.etag = etag(size, mtime);
		this.size = size;
	}

	public resolve(options: files.IResolveFileOptions): TPromise<files.IFileStat> {

		// General Data
		let fileStat: files.IFileStat = {
			resource: this.resource,
			isDirectory: this.isDirectory,
			hasChildren: undefined,
			name: this.name,
			etag: this.etag,
			size: this.size,
			mtime: this.mtime,
			mime: this.mime
		};

		// File Specific Data
		if (!this.isDirectory) {
			return TPromise.as(fileStat);
		}

		// Directory Specific Data
		else {

			// Convert the paths from options.resolveTo to absolute paths
			let absoluteTargetPaths: string[] = null;
			if (options && options.resolveTo) {
				absoluteTargetPaths = [];
				options.resolveTo.forEach((resource) => {
					absoluteTargetPaths.push(resource.fsPath);
				});
			}

			return new TPromise((c, e) => {

				// Load children
				this.resolveChildren(this.resource.fsPath, absoluteTargetPaths, options && options.resolveSingleChildDescendants, (children) => {
					children = arrays.coalesce(children); // we don't want those null children (could be permission denied when reading a child)
					fileStat.hasChildren = children && children.length > 0;
					fileStat.children = children || [];

					c(fileStat);
				});
			});
		}
	}

	private resolveChildren(absolutePath: string, absoluteTargetPaths: string[], resolveSingleChildDescendants: boolean, callback: (children: files.IFileStat[]) => void): void {
		extfs.readdir(absolutePath, (error: Error, files: string[]) => {
			if (error) {
				console.error(error);

				return callback(null); // return - we might not have permissions to read the folder
			}

			// for each file in the folder
			flow.parallel(files, (file: string, clb: (error: Error, children: files.IFileStat) => void) => {
				let fileResource = uri.file(paths.resolve(absolutePath, file));
				let fileStat: fs.Stats;
				let $this = this;

				flow.sequence(
					function onError(error: Error): void {
						console.error(error);

						clb(null, null); // return - we might not have permissions to read the folder or stat the file
					},

					function stat(): void {
						fs.stat(fileResource.fsPath, this);
					},

					function countChildren(fsstat: fs.Stats): void {
						fileStat = fsstat;

						if (fileStat.isDirectory()) {
							extfs.readdir(fileResource.fsPath, (error, result) => {
								this(null, result ? result.length : 0);
							});
						} else {
							this(null, 0);
						}
					},

					function resolve(childCount: number): void {
						let childStat: files.IFileStat = {
							resource: fileResource,
							isDirectory: fileStat.isDirectory(),
							hasChildren: childCount > 0,
							name: file,
							mtime: fileStat.mtime.getTime(),
							etag: etag(fileStat),
							size: fileStat.size,
							mime: !fileStat.isDirectory() ? baseMime.guessMimeTypes(fileResource.fsPath).join(', ') : undefined
						};

						// Return early for files
						if (!fileStat.isDirectory()) {
							return clb(null, childStat);
						}

						// Handle Folder
						let resolveFolderChildren = false;
						if (files.length === 1 && resolveSingleChildDescendants) {
							resolveFolderChildren = true;
						} else if (childCount > 0 && absoluteTargetPaths && absoluteTargetPaths.some((targetPath) => basePaths.isEqualOrParent(targetPath, fileResource.fsPath))) {
							resolveFolderChildren = true;
						}

						// Continue resolving children based on condition
						if (resolveFolderChildren) {
							$this.resolveChildren(fileResource.fsPath, absoluteTargetPaths, resolveSingleChildDescendants, (children) => {
								children = arrays.coalesce(children);  // we don't want those null children
								childStat.hasChildren = children && children.length > 0;
								childStat.children = children || [];

								clb(null, childStat);
							});
						}

						// Otherwise return result
						else {
							clb(null, childStat);
						}
					});
			}, (errors, result) => {
				callback(result);
			});
		});
	}
}