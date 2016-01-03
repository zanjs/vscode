/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Event, {Emitter} from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import platform = require('vs/platform/platform');
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import {IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import JSONContributionRegistry = require('vs/platform/jsonschemas/common/jsonContributionRegistry');


export var Extensions = {
	Configuration: 'base.contributions.configuration'
};

export interface IConfigurationRegistry {

	/**
	 * Register a configuration to the registry.
	 */
	registerConfiguration(configuration: IConfigurationNode): void;

	/**
	 * Event that fires whenver a configuratio has been
	 * registered.
	 */
	onDidRegisterConfiguration: Event<IConfigurationRegistry>;

	/**
	 * Returns all configurations contributed to this registry.
	 */
	getConfigurations(): IConfigurationNode[];
}

export interface IConfigurationNode {
	id?: string;
	order?: number;
	type?: string;
	title?: string;
	description?: string;
	default?: any;
	properties?: { [path: string]: IJSONSchema; };
	allOf?: IJSONSchema[];
	definitions?: { [path: string]: IJSONSchema; };
}

class ConfigurationRegistry implements IConfigurationRegistry {
	private configurationContributors: IConfigurationNode[];
	private hasJSONContributions: boolean;
	private _onDidRegisterConfiguration: Emitter<IConfigurationRegistry>;

	constructor() {
		this.configurationContributors = [];
		this.hasJSONContributions = false;
		this._onDidRegisterConfiguration = new Emitter<IConfigurationRegistry>();
	}

	public get onDidRegisterConfiguration() {
		return this._onDidRegisterConfiguration.event;
	}

	public registerConfiguration(configuration: IConfigurationNode): void {
		this.configurationContributors.push(configuration);

		this.registerJSONConfiguration(configuration);
		this._onDidRegisterConfiguration.fire(this);
	}

	public getConfigurations(): IConfigurationNode[] {
		return this.configurationContributors.slice(0);
	}

	private registerJSONConfiguration(configuration: IConfigurationNode) {
		var schemaId = strings.format('local://schemas/settings/{0}', configuration.id);

		var schema = <IJSONSchema> objects.clone(configuration);
		schema.id = schemaId;

		var contributionRegistry = <JSONContributionRegistry.IJSONContributionRegistry>platform.Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
		contributionRegistry.registerSchema(schemaId, schema);

		contributionRegistry.addSchemaFileAssociation('inmemory://defaults/settings.json', schemaId);
		contributionRegistry.addSchemaFileAssociation('%APP_SETTINGS_HOME%/settings.json', schemaId);
		contributionRegistry.addSchemaFileAssociation('/.vscode/settings.json', schemaId);
	}
}

var configurationRegistry = new ConfigurationRegistry();
platform.Registry.add(Extensions.Configuration, configurationRegistry);

let configurationExtPoint = PluginsRegistry.registerExtensionPoint<IConfigurationNode>('configuration', {
	description: nls.localize('vscode.extension.contributes.configuration', 'Contributes configuration settings.'),
	type: 'object',
	default: { title: '', properties: {}},
	properties: {
		title: {
			description: nls.localize('vscode.extension.contributes.configuration.title', 'A summary of the settings. This label will be used in the settings file as separating comment.'),
			type: 'string'
		},
		properties: {
			description: nls.localize('vscode.extension.contributes.configuration.properties', 'Description of the configuration properties.'),
			type: 'object',
			additionalProperties: {
				$ref: 'http://json-schema.org/draft-04/schema#'
			}
		}
	}
});

configurationExtPoint.setHandler((extensions) => {
	for (var i = 0; i < extensions.length; i++) {
		var configuration = <IConfigurationNode> extensions[i].value;
		var collector = extensions[i].collector;

		if (configuration.type && configuration.type !== 'object') {
			collector.warn(nls.localize('invalid.type', "if set, 'configuration.type' must be set to 'object"));
		} else {
			configuration.type = 'object';
		}

		if (configuration.title && (typeof configuration.title !== 'string')) {
			collector.error(nls.localize('invalid.title', "'configuration.title' must be a string"));
		}

		if (configuration.properties && (typeof configuration.properties !== 'object') ) {
			collector.error(nls.localize('invalid.properties', "'configuration.properties' must be an object"));
			return;
		}
		var clonedConfiguration = objects.clone(configuration);
		clonedConfiguration.id = extensions[i].description.id;
		configurationRegistry.registerConfiguration(clonedConfiguration);
	}
});
