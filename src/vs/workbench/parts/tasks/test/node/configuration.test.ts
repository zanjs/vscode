/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import Severity from 'vs/base/common/severity';

import * as Platform from 'vs/base/common/platform';
import { ProblemMatcher, FileLocationKind, ProblemPattern, ApplyToKind } from 'vs/platform/markers/common/problemMatcher';

import * as TaskSystem from 'vs/workbench/parts/tasks/common/taskSystem';
import { parse, ParseResult, ILogger, ExternalTaskRunnerConfiguration } from 'vs/workbench/parts/tasks/node/processRunnerConfiguration';

class Logger implements ILogger {
	public receivedMessage: boolean = false;
	public lastMessage: string = null;

	public log(message: string): void {
		this.receivedMessage = true;
		this.lastMessage = message;
	}
}

class ConfiguationBuilder {

	public result: TaskSystem.TaskRunnerConfiguration;

	constructor(command: string) {
		this.result = {
			command,
			isShellCommand: false,
			args: [],
			options: {
				cwd: '${workspaceRoot}'
			},
			tasks: Object.create(null)
		};
	}

	public shell(value: boolean): ConfiguationBuilder {
		this.result.isShellCommand= value;
		return this;
	}

	public args(value: string[]): ConfiguationBuilder {
		this.result.args = value;
		return this;
	}

	public options(value: TaskSystem.CommandOptions): ConfiguationBuilder {
		this.result.options = value;
		return this;
	}

	public task(name: string): TaskBuilder {
		let builder = new TaskBuilder(this, name);
		this.result.tasks[builder.result.name] = builder.result;
		return builder;
	}
}

class TaskBuilder {

	public result: TaskSystem.TaskDescription;

	constructor(public parent: ConfiguationBuilder, name: string) {
		this.result = {
			id: name,
			name: name,
			showOutput: TaskSystem.ShowOutput.Always,
			suppressTaskName: false,
			echoCommand: false,
			isWatching: false,
			promptOnClose: true,
			problemMatchers: []
		};
	}

	public args(value: string[]): TaskBuilder {
		this.result.args = value;
		return this;
	}

	public showOutput(value: TaskSystem.ShowOutput): TaskBuilder {
		this.result.showOutput = value;
		return this;
	}

	public suppressTaskName(value: boolean): TaskBuilder {
		this.result.suppressTaskName = value;
		return this;
	}

	public echoCommand(value: boolean): TaskBuilder {
		this.result.echoCommand = value;
		return this;
	}

	public isWatching(value: boolean): TaskBuilder {
		this.result.isWatching = value;
		return this;
	}

	public promptOnClose(value: boolean): TaskBuilder {
		this.result.promptOnClose = value;
		return this;
	}

	public problemMatcher(): ProblemMatcherBuilder {
		let builder = new ProblemMatcherBuilder(this);
		this.result.problemMatchers.push(builder.result);
		return builder;
	}
}

class ProblemMatcherBuilder {

	public result: ProblemMatcher;

	constructor(public parent: TaskBuilder) {
		this.result = {
			owner: 'external',
			applyTo: ApplyToKind.allDocuments,
			severity: undefined,
			fileLocation: FileLocationKind.Relative,
			filePrefix: '${cwd}',
			pattern: undefined
		}
	}

	public owner(value: string): ProblemMatcherBuilder {
		this.result.owner = value;
		return this;
	}

	public applyTo(value: ApplyToKind): ProblemMatcherBuilder {
		this.result.applyTo = value;
		return this;
	}

	public severity(value: Severity): ProblemMatcherBuilder {
		this.result.severity = value;
		return this;
	}

	public fileLocation(value: FileLocationKind): ProblemMatcherBuilder {
		this.result.fileLocation = value;
		return this;
	}

	public filePrefix(value: string): ProblemMatcherBuilder {
		this.result.filePrefix = value;
		return this;
	}

	public pattern(regExp: RegExp): PatternBuilder {
		let builder = new PatternBuilder(this, regExp);
		if (!this.result.pattern) {
			this.result.pattern = builder.result;
		}
		return builder;
	}
}

class PatternBuilder {
	public result: ProblemPattern;

	constructor(public parent: ProblemMatcherBuilder, regExp: RegExp) {
		this.result = {
			regexp: regExp,
			file: 1,
			message: 4,
			line: 2,
			column : 3
		}
	}

	public file(value: number): PatternBuilder {
		this.result.file = value;
		return this;
	}

	public message(value: number): PatternBuilder {
		this.result.message = value;
		return this;
	}

	public location(value: number): PatternBuilder {
		this.result.location = value;
		return this;
	}

	public line(value: number): PatternBuilder {
		this.result.line = value;
		return this;
	}

	public column(value: number): PatternBuilder {
		this.result.column = value;
		return this;
	}

	public endLine(value: number): PatternBuilder {
		this.result.endLine = value;
		return this;
	}

	public endColumn(value: number): PatternBuilder {
		this.result.endColumn = value;
		return this;
	}

	public code(value: number): PatternBuilder {
		this.result.code = value;
		return this;
	}

	public severity(value: number): PatternBuilder {
		this.result.severity = value;
		return this;
	}

	public loop(value: boolean): PatternBuilder {
		this.result.loop = value;
		return this;
	}

	public mostSignifikant(value: boolean): PatternBuilder {
		this.result.mostSignifikant = value;
		return this;
	}
}


suite('Tasks Configuration parsing tests', () => {
	test('tasks: all default', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.task('tsc').
			suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc"
			}, builder);
	});

	test('tasks: global isShellCommand', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.shell(true).
			task('tsc').
				suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				isShellCommand: true
			},
			builder);
	});

	test('tasks: global show output silent', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			task('tsc').
				suppressTaskName(true).
				showOutput(TaskSystem.ShowOutput.Silent);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				showOutput: 'silent'
			},
			builder
		);
	});

	test('tasks: global promptOnClose default', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.task('tsc').
			suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				promptOnClose: true
			},
			builder
		);
	});

	test('tasks: global promptOnClose', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.task('tsc').
			suppressTaskName(true).
			promptOnClose(false);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				promptOnClose: false
			},
			builder
		);
	})

	test('tasks: global promptOnClose default watching', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.task('tsc').
			suppressTaskName(true).
			isWatching(true).
			promptOnClose(false);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				isWatching: true
			},
			builder
		);
	})

	test('tasks: global show output never', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			task('tsc').
				suppressTaskName(true).
				showOutput(TaskSystem.ShowOutput.Never);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				showOutput: 'never'
			},
			builder
		);
	});

	test('tasks: global echo Command', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			task('tsc').
				suppressTaskName(true).
				echoCommand(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				echoCommand: true
			},
			builder
		);
	});

	test('tasks: global args', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			args(['--p']).
			task('tsc').
				suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				args: [
					'--p'
				]
			},
			builder
		);
	});

	test('tasks: options - cwd', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			options({
					cwd: "myPath"
				}).
			task('tsc').
				suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				options: {
					cwd: "myPath"
				}
			},
			builder
		);
	});

	test('tasks: options - env', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			options({ cwd: '${workspaceRoot}', env: { key: 'value' } }).
			task('tsc').
				suppressTaskName(true);
		testGobalCommand(
			{
				version: '0.1.0',
				command: "tsc",
				options: {
					env: {
						key: 'value'
					}
				}
			},
			builder
		);
	});

	test('tasks: os windows', () => {
		let name: string = Platform.isWindows ? 'tsc.win' : 'tsc'
		let builder = new ConfiguationBuilder(name);
		builder.
			task(name).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			windows: {
				command: 'tsc.win'
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: os windows & global isShellCommand', () => {
		let name: string = Platform.isWindows ? 'tsc.win' : 'tsc'
		let builder = new ConfiguationBuilder(name);
		builder.
			shell(true).
			task(name).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			isShellCommand: true,
			windows: {
				command: 'tsc.win'
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: os mac', () => {
		let name: string = Platform.isMacintosh ? 'tsc.osx' : 'tsc'
		let builder = new ConfiguationBuilder(name);
		builder.
			task(name).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			osx: {
				command: 'tsc.osx'
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: os linux', () => {
		let name: string = Platform.isLinux ? 'tsc.linux' : 'tsc'
		let builder = new ConfiguationBuilder(name);
		builder.
			task(name).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			linux: {
				command: 'tsc.linux'
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: overwrite showOutput', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			task('tsc').
				showOutput(Platform.isWindows ? TaskSystem.ShowOutput.Always : TaskSystem.ShowOutput.Never).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			showOutput: 'never',
			windows: {
				showOutput: 'always'
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: overwrite echo Command', () => {
		let builder = new ConfiguationBuilder('tsc');
		builder.
			task('tsc').
				echoCommand(Platform.isWindows ? false : true).
				suppressTaskName(true);
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			echoCommand: true,
			windows: {
				echoCommand: false
			}
		};
		testGobalCommand(external, builder);
	});

	test('tasks: global problemMatcher one', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			problemMatcher: '$tsc'
		};
		testDefaultProblemMatcher(external, 1);
	});

	test('tasks: global problemMatcher two', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			problemMatcher: ['$tsc', '$msCompile']
		};
		testDefaultProblemMatcher(external, 2);
	});

	test('tasks: task definition', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName');
		testConfiguration(external, builder);
	});

	test('tasks: build task', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isBuildCommand: true
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName');
		let result = testConfiguration(external, builder);
		assert.ok(result.defaultBuildTaskIdentifier);
	});

	test('tasks: default build task', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'build'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('build');
		let result = testConfiguration(external, builder);
		assert.ok(result.defaultBuildTaskIdentifier);
	});

	test('tasks: test task', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isTestCommand: true
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName');
		let result = testConfiguration(external, builder);
		assert.ok(result.defaultTestTaskIdentifier);
	});

	test('tasks: default test task', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('test');
		let result = testConfiguration(external, builder);
		assert.ok(result.defaultTestTaskIdentifier);
	});

	test('tasks: task with values', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'test',
					showOutput: 'never',
					echoCommand: true,
					args: ['--p'],
					isWatching: true
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('test').
			showOutput(TaskSystem.ShowOutput.Never).
			echoCommand(true).
			args(['--p']).
			isWatching(true).
			promptOnClose(false);

		let result = testConfiguration(external, builder);
		assert.ok(result.defaultTestTaskIdentifier);
	});

	test('tasks: task inherits global values', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			showOutput: 'never',
			echoCommand: true,
			tasks: [
				{
					taskName: 'test'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('test').
			showOutput(TaskSystem.ShowOutput.Never).
			echoCommand(true);

		let result = testConfiguration(external, builder);
		assert.ok(result.defaultTestTaskIdentifier);
	});

	test('tasks: problem matcher default', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher .* regular expression', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: '.*'
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().pattern(/.*/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher owner, applyTo, severity and fileLocation', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						owner: 'myOwner',
						applyTo: 'closedDocuments',
						severity: 'warning',
						fileLocation: 'absolute',
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().
			owner('myOwner').
			applyTo(ApplyToKind.closedDocuments).
			severity(Severity.Warning).
			fileLocation(FileLocationKind.Absolute).
			filePrefix(undefined).
			pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem matcher fileLocation and filePrefix', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						fileLocation: ['relative', 'myPath'],
						pattern: {
							regexp: 'abc'
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().
			fileLocation(FileLocationKind.Relative).
			filePrefix('myPath').
			pattern(/abc/);
		testConfiguration(external, builder);
	});

	test('tasks: problem pattern location', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc',
							file: 10,
							message: 11,
							location: 12,
							severity: 13,
							code: 14
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().
			pattern(/abc/).file(10).message(11).location(12).severity(13).code(14);
		testConfiguration(external, builder);
	});

	test('tasks: problem pattern line & column', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					problemMatcher: {
						pattern: {
							regexp: 'abc',
							file: 10,
							message: 11,
							line: 12,
							column: 13,
							endLine: 14,
							endColumn: 15,
							severity: 16,
							code: 17
						}
					}
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').problemMatcher().
			pattern(/abc/).file(10).message(11).
			line(12).column(13).endLine(14).endColumn(15).
			severity(16).code(17);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close default', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').promptOnClose(true);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close watching', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					isWatching: true
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').isWatching(true).promptOnClose(false);
		testConfiguration(external, builder);
	});

	test('tasks: prompt on close set', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskName',
					promptOnClose: false
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskName').promptOnClose(false);
		testConfiguration(external, builder);
	});

	test('tasks: two tasks', () => {
		let external: ExternalTaskRunnerConfiguration = {
			version: '0.1.0',
			command: 'tsc',
			tasks: [
				{
					taskName: 'taskNameOne'
				},
				{
					taskName: 'taskNameTwo'
				}
			]
		};
		let builder = new ConfiguationBuilder('tsc');
		builder.task('taskNameOne');
		builder.task('taskNameTwo');
		testConfiguration(external, builder);
	});

	function testDefaultProblemMatcher(external: ExternalTaskRunnerConfiguration, resolved: number) {
		let logger = new Logger();
		let result = parse(external, logger);
		assert.ok(!logger.receivedMessage);
		let config = result.configuration;
		let keys = Object.keys(config.tasks);
		assert.strictEqual(keys.length, 1);
		let task = config.tasks[keys[0]];
		assert.ok(task)
		assert.strictEqual(task.problemMatchers.length, resolved);

	}

	function testGobalCommand(external: ExternalTaskRunnerConfiguration, builder: ConfiguationBuilder) {
		let result = testConfiguration(external, builder);
		assert.ok(result.defaultBuildTaskIdentifier);
		assert.ok(!result.defaultTestTaskIdentifier);
	}

	function testConfiguration(external: ExternalTaskRunnerConfiguration, builder: ConfiguationBuilder): ParseResult {
		let logger = new Logger();
		let result = parse(external, logger);
		if (logger.receivedMessage) {
			assert.ok(false, logger.lastMessage);
		}
		assertConfiguration(result, builder.result);
		return result;
	}

	function assertConfiguration(result: ParseResult, expected: TaskSystem.TaskRunnerConfiguration) {
		assert.ok(result.validationStatus.isOK());
		let actual = result.configuration;
		assert.strictEqual(actual.command, expected.command);
		assert.strictEqual(actual.isShellCommand, expected.isShellCommand);
		assert.deepEqual(actual.args, expected.args);
		assert.strictEqual(typeof actual.options, typeof expected.options);
		if (actual.options && expected.options) {
			assert.strictEqual(actual.options.cwd, expected.options.cwd);
			assert.strictEqual(typeof actual.options.env, typeof expected.options.env);
			if (actual.options.env && expected.options.env) {
				assert.deepEqual(actual.options.env, expected.options.env);
			}
		}
		assert.strictEqual(typeof actual.tasks, typeof expected.tasks);
		if (actual.tasks && expected.tasks) {
			// We can't compare Ids since the parser uses UUID which are random
			// So create a new map using the name.
			let actualTasks: { [key: string]: TaskSystem.TaskDescription; } = Object.create(null);
			Object.keys(actual.tasks).forEach((key) => {
				let task = actual.tasks[key];
				assert.ok(!actualTasks[task.name]);
				actualTasks[task.name] = task;
			});
			let actualKeys = Object.keys(actualTasks);
			let expectedKeys = Object.keys(expected.tasks);
			assert.strictEqual(actualKeys.length, expectedKeys.length);
			actualKeys.forEach((key) => {
				let actualTask = actualTasks[key];
				let expectedTask = expected.tasks[key];
				assert.ok(expectedTask);
				assertTask(actualTask, expectedTask);
			});
		}
	}

	function assertTask(actual: TaskSystem.TaskDescription, expected: TaskSystem.TaskDescription) {
		assert.ok(actual.id);
		assert.strictEqual(actual.name, expected.name, 'name');
		assert.strictEqual(actual.showOutput, expected.showOutput, 'showOutput');
		assert.strictEqual(actual.suppressTaskName, expected.suppressTaskName, 'suppressTaskName');
		assert.strictEqual(actual.echoCommand, expected.echoCommand, 'echoCommand');
		assert.strictEqual(actual.isWatching, expected.isWatching, 'isWatching');
		assert.strictEqual(actual.promptOnClose, expected.promptOnClose, 'promptOnClose');
		assert.strictEqual(typeof actual.problemMatchers, typeof expected.problemMatchers);
		if (actual.problemMatchers && expected.problemMatchers) {
			assert.strictEqual(actual.problemMatchers.length, expected.problemMatchers.length);
			for (let i = 0; i < actual.problemMatchers.length; i++) {
				assertProblemMatcher(actual.problemMatchers[i], expected.problemMatchers[i]);
			}
		}
	}

	function assertProblemMatcher(actual: ProblemMatcher, expected: ProblemMatcher) {
		assert.strictEqual(actual.owner, expected.owner);
		assert.strictEqual(actual.applyTo, expected.applyTo);
		assert.strictEqual(actual.severity, expected.severity);
		assert.strictEqual(actual.fileLocation, expected.fileLocation);
		assert.strictEqual(actual.filePrefix, expected.filePrefix);
		if (actual.pattern && expected.pattern) {
			assertProblemPatterns(actual.pattern, expected.pattern);
		}
	}

	function assertProblemPatterns(actual: ProblemPattern | ProblemPattern[], expected: ProblemPattern | ProblemPattern[]) {
		assert.strictEqual(typeof actual, typeof expected);
		if (Array.isArray(actual)) {
			let actuals = <ProblemPattern[]>actual;
			let expecteds = <ProblemPattern[]>expected;
			assert.strictEqual(actuals.length, expecteds.length);
			for (let i = 0; i < actuals.length; i++) {
				assertProblemPattern(actuals[i], expecteds[i]);
			}
		} else {
			assertProblemPattern(<ProblemPattern>actual, <ProblemPattern>expected);
		}
	}

	function assertProblemPattern(actual: ProblemPattern, expected: ProblemPattern) {
		assert.equal(actual.regexp.toString(), expected.regexp.toString());
		assert.strictEqual(actual.file, expected.file);
		assert.strictEqual(actual.message, expected.message);
		if (typeof expected.location !== 'undefined') {
			assert.strictEqual(actual.location, expected.location);
		} else {
			assert.strictEqual(actual.line, expected.line);
			assert.strictEqual(actual.column, expected.column);
			assert.strictEqual(actual.endLine, expected.endLine);
			assert.strictEqual(actual.endColumn, expected.endColumn);
		}
		assert.strictEqual(actual.code, expected.code);
		assert.strictEqual(actual.severity, expected.severity);
		assert.strictEqual(actual.loop, expected.loop);
		assert.strictEqual(actual.mostSignifikant, expected.mostSignifikant);
	}
});