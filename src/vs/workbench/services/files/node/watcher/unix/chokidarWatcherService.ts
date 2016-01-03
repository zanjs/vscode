/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import chokidar = require('chokidar');
import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

import {Promise} from 'vs/base/common/winjs.base';
import {FileChangeType} from 'vs/platform/files/common/files';
import {ThrottledDelayer} from 'vs/base/common/async';
import strings = require('vs/base/common/strings');

import {IWatcherRequest, WatcherService} from 'vs/workbench/services/files/node/watcher/unix/watcherService';
import watcher = require('vs/workbench/services/files/node/watcher/common');

export class ChokidarWatcherService extends WatcherService {

	private static FS_EVENT_DELAY = 50; // aggregate and only emit events when changes have stopped for this duration (in ms)
	private static EVENT_SPAM_WARNING_THRESHOLD = 60 * 1000; // warn after certain time span of event spam

	private spamCheckStartTime:number;
	private spamWarningLogged:boolean;

	public watch(request: IWatcherRequest): Promise {
		let watcherOpts: any = {
			ignoreInitial: true,
			ignorePermissionErrors: true,
			followSymlinks: true, // this is the default of chokidar and supports file events through symlinks
			ignored: request.ignored
		};

		let chokidarWatcher = chokidar.watch(request.basePath, watcherOpts);

		let undeliveredFileEvents: watcher.IRawFileChange[] = [];
		let fileEventDelayer = new ThrottledDelayer(ChokidarWatcherService.FS_EVENT_DELAY);

		return new Promise((c, e, p) => {
			chokidarWatcher.on('all', (type: string, path: string) => {
				if (path.indexOf(request.basePath) < 0) {
					return; // we really only care about absolute paths here in our basepath context here
				}

				let event: watcher.IRawFileChange = null;

				// Change
				if (type === 'change') {
					event = {
						type: 0,
						path: path
					};
				}

				// Add
				else if (type === 'add' || type === 'addDir') {
					event = {
						type: 1,
						path: path
					};
				}

				// Delete
				else if (type === 'unlink' || type === 'unlinkDir') {
					event = {
						type: 2,
						path: path
					};
				}

				if (event) {

					// Logging
					if (request.verboseLogging) {
						console.log(event.type === FileChangeType.ADDED ? '[ADDED]' : event.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', event.path);
					}

					// Check for spam
					let now = Date.now();
					if (undeliveredFileEvents.length === 0) {
						this.spamWarningLogged = false;
						this.spamCheckStartTime = now;
					} else if (!this.spamWarningLogged && this.spamCheckStartTime + ChokidarWatcherService.EVENT_SPAM_WARNING_THRESHOLD < now) {
						this.spamWarningLogged = true;
						console.warn(strings.format('Watcher is busy catching up with {0} file changes in 60 seconds. Latest changed path is "{1}"', undeliveredFileEvents.length, event.path));
					}

					// Add to buffer
					undeliveredFileEvents.push(event);

					// Delay and send buffer
					fileEventDelayer.trigger(() => {
						let events = undeliveredFileEvents;
						undeliveredFileEvents = [];

						// Broadcast to clients normalized
						let res = watcher.normalize(events);
						p(res);

						// Logging
						if (request.verboseLogging) {
							res.forEach(r => {
								console.log(' >> normalized', r.type === FileChangeType.ADDED ? '[ADDED]' : r.type === FileChangeType.DELETED ? '[DELETED]' : '[CHANGED]', r.path);
							});
						}

						return Promise.as(null);
					});
				}
			});

			chokidarWatcher.on('error', (error: Error) => {
				if (error) {
					console.error(error.toString());
				}
			});
		}, () => {
			chokidarWatcher.close();
			fileEventDelayer.cancel();
		});
	}
}
