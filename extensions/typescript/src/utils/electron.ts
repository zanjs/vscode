/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import os = require('os');
import net = require('net');
import cp = require('child_process');

export interface IForkOptions {
	cwd?: string;
	env?: any;
	encoding?: string;
	execArgv?: string[];
}

function makeRandomHexString(length:number): string {
	let chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
	let result = '';
	for (let i = 0; i < length; i++) {
		let idx = Math.floor(chars.length * Math.random());
		result += chars[idx];
	}
	return result;
}

function generatePipeName(): string {
	var randomName = 'vscode-' + makeRandomHexString(40);
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\' + randomName + '-sock';
	}

	// Mac/Unix: use socket file
	return path.join(os.tmpdir(), randomName + '.sock');
}

function generatePatchedEnv(env:any, stdInPipeName:string, stdOutPipeName:string): any {
	// Set the two unique pipe names and the electron flag as process env

	var newEnv:any = {};
	for (var key in env) {
		newEnv[key] = env[key];
	}

	newEnv['STDIN_PIPE_NAME'] = stdInPipeName;
	newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName;
	newEnv['ATOM_SHELL_INTERNAL_RUN_AS_NODE'] = '1';

	return newEnv;
}

export function fork(modulePath: string, args: string[], options: IForkOptions, callback:(error:any, cp:cp.ChildProcess)=>void): void {

	var callbackCalled = false;
	var resolve = (result: cp.ChildProcess) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(null, result);
	};
	var reject = (err:any) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(err, null);
	};

	// Generate two unique pipe names
	var stdInPipeName = generatePipeName();
	var stdOutPipeName = generatePipeName();

	var newEnv = generatePatchedEnv(options.env || process.env, stdInPipeName, stdOutPipeName);

	var childProcess: cp.ChildProcess;

	// Begin listening to stdout pipe
	var server = net.createServer((stream) => {
		// The child process will write exactly one chunk with content `ready` when it has installed a listener to the stdin pipe

		stream.once('data', (chunk:Buffer) => {
			// The child process is sending me the `ready` chunk, time to connect to the stdin pipe
			childProcess.stdin = <any>net.connect(stdInPipeName);

			// From now on the childProcess.stdout is available for reading
			childProcess.stdout = stream;

			resolve(childProcess);
		});
	});
	server.listen(stdOutPipeName);

	var serverClosed = false;
	var closeServer = () => {
		if (serverClosed) {
			return;
		}
		serverClosed = true;
		server.close();
	}

	// Create the process
	let bootstrapperPath = path.join(__dirname, 'electronForkStart');
	childProcess = cp.fork(bootstrapperPath, [modulePath].concat(args), <any>{
		silent: true,
		cwd: options.cwd,
		env: newEnv,
		execArgv: options.execArgv
	});

	childProcess.once('error', (err:Error) => {
		closeServer();
		reject(err);
	});

	childProcess.once('exit', (err:Error) => {
		closeServer();
		reject(err);
	});
}
