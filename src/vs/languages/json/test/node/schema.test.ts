/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import http = require('vs/base/common/http');
import winjs = require('vs/base/common/winjs.base');
import SchemaService = require('vs/languages/json/common/jsonSchemaService');
import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');
import JsonSchema = require('vs/base/common/jsonSchema');
import Json = require('vs/base/common/json');
import Parser = require('vs/languages/json/common/parser/jsonParser');
import pfs = require('vs/base/node/pfs');
import path = require('path');
import {IRequestService} from 'vs/platform/request/common/request';

suite('JSON - schema', () => {
	var fixureDocuments = {
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json': 'deploymentTemplate.json',
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json': 'deploymentParameters.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Authorization.json': 'Microsoft.Authorization.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Resources.json': 'Microsoft.Resources.json',
		'http://schema.management.azure.com/schemas/2014-04-01-preview/Microsoft.Sql.json': 'Microsoft.Sql.json',
		'http://schema.management.azure.com/schemas/2014-06-01/Microsoft.Web.json': 'Microsoft.Web.json',
		'http://schema.management.azure.com/schemas/2014-04-01/SuccessBricks.ClearDB.json': 'SuccessBricks.ClearDB.json',
		'http://schema.management.azure.com/schemas/2015-08-01/Microsoft.Compute.json': 'Microsoft.Compute.json'
	}

	var requestServiceMock = <IRequestService> {
		makeRequest: (options:http.IXHROptions) : winjs.TPromise<http.IXHRResponse> => {
			var uri = options.url;
			if (uri.length && uri[uri.length - 1] === '#') {
				uri = uri.substr(0, uri.length - 1);
			}
			var fileName = fixureDocuments[uri];
			if (fileName) {
				var fixtures = require.toUrl('../common/fixtures');
				return pfs.readFile(path.join(fixtures, fileName)).then(value => {
					return { responseText: value.toString(), status: 200 };
				}, error => {
					return winjs.TPromise.wrapError({ responseText: '', status: 404 });
				})
			}
			return winjs.TPromise.wrapError({ responseText: '', status: 404 });
		}
	}

	test('Resolving $refs', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		service.setSchemaContributions({ schemas: {
			"https://myschemastore/main" : {
				id: 'https://myschemastore/main',
				type: 'object',
				properties: {
					child: {
						'$ref': 'https://myschemastore/child'
					}
				}
			},
			"https://myschemastore/child" :{
				id: 'https://myschemastore/child',
				type: 'bool',
				description: 'Test description'
			}
		}});

		service.getResolvedSchema('https://myschemastore/main').then(fs => {
			assert.deepEqual(fs.schema.properties['child'], {
				id: 'https://myschemastore/child',
				type: 'bool',
				description: 'Test description'
			});
		}).done(() => testDone(), (error) => {
			testDone(error);
		});

	});

	test('FileSchema', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);

		service.setSchemaContributions({ schemas: {
			"main" : {
				id: 'main',
				type: 'object',
				properties: {
					child: {
						type: 'object',
						properties: {
							'grandchild': {
								type: 'number',
								description: 'Meaning of Life'
							}
						}
					}
				}
			}
		}});

		service.getResolvedSchema('main').then(fs => {
			var section = fs.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Array FileSchema', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);

		service.setSchemaContributions({ schemas: {
			"main" : {
				id: 'main',
				type: 'object',
				properties: {
					child: {
						type: 'array',
						items: {
							'type': 'object',
							'properties': {
								'grandchild': {
									type: 'number',
									description: 'Meaning of Life'
								}
							}
						}
					}
				}
			}
		}});

		service.getResolvedSchema('main').then(fs => {
			var section = fs.getSection(['child','0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Missing subschema', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);

		service.setSchemaContributions({ schemas: {
			"main" : {
				id: 'main',
				type: 'object',
				properties: {
					child: {
						type: 'object'
					}
				}
			}
		}});

		service.getResolvedSchema('main').then(fs => {
			var section = fs.getSection(['child','grandchild']);
			assert.strictEqual(section, null);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Preloaded Schema', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		var id = 'https://myschemastore/test1';
		var schema : JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'object',
					properties: {
						'grandchild': {
							type: 'number',
							description: 'Meaning of Life'
						}
					}
				}
			}
		};

		service.registerExternalSchema(id, [ '*.json' ], schema);

		service.getSchemaForResource('test.json', null).then((schema) => {
			var section = schema.getSection(['child','grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('External Schema', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		var id = 'https://myschemastore/test1';
		var schema : JsonSchema.IJSONSchema = {
				type: 'object',
				properties: {
					child: {
						type: 'object',
						properties: {
							'grandchild': {
								type: 'number',
								description: 'Meaning of Life'
							}
						}
					}
				}
			};

		service.registerExternalSchema(id, [ '*.json' ], schema);

		service.getSchemaForResource('test.json', null).then((schema) => {
			var section = schema.getSection(['child','grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});


	test('Resolving in-line $refs', function (testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		var id = 'https://myschemastore/test1';

		var schema:JsonSchema.IJSONSchema = {
			id: 'main',
			type: 'object',
			definitions: {
				'grandchild': {
					type: 'number',
					description: 'Meaning of Life'
				}
			},
			properties: {
				child: {
					type: 'array',
					items: {
						'type': 'object',
						'properties': {
							'grandchild': {
								$ref: '#/definitions/grandchild'
							}
						}
					}
				}
			}
		};

		service.registerExternalSchema(id, [ '*.json' ], schema);

		service.getSchemaForResource('test.json', null).then((fs) => {
			var section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Resolving in-line $refs automatically for external schemas', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		var id = 'https://myschemastore/test1';
		var schema:JsonSchema.IJSONSchema = {
			id: 'main',
			type: 'object',
			definitions: {
				'grandchild': {
					type: 'number',
					description: 'Meaning of Life'
				}
			},
			properties: {
				child: {
					type: 'array',
					items: {
						'type': 'object',
						'properties': {
							'grandchild': {
								$ref: '#/definitions/grandchild'
							}
						}
					}
				}
			}
		};

		var fsm = service.registerExternalSchema(id, [ '*.json' ], schema);
		fsm.getResolvedSchema().then((fs) => {
			var section = fs.getSection(['child','0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});


	test('Clearing External Schemas', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);
		var id1 = 'http://myschemastore/test1';
		var schema1:JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'number'
				}
			}
		};

		var id2 = 'http://myschemastore/test2';
		var schema2:JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema(id1, [ 'test.json', 'bar.json' ], schema1);

		service.getSchemaForResource('test.json', null).then((schema) => {
			var section = schema.getSection(['child']);
			assert.equal(section.type, 'number');

			service.clearExternalSchemas();

			service.registerExternalSchema(id2, [ '*.json' ], schema2);

			return service.getSchemaForResource('test.json', null).then((schema) => {
				var section = schema.getSection(['child']);
				assert.equal(section.type, 'string');
			});
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Schema contributions', function(testDone) {
		var service = new SchemaService.JSONSchemaService(requestServiceMock);

		service.setSchemaContributions({ schemas: {
			"http://myschemastore/myschemabar" : {
				id: 'main',
				type: 'object',
				properties: {
					foo: {
						type: 'string'
					}
				}
			}
		}, schemaAssociations: {
			'*.bar': ['http://myschemastore/myschemabar', 'http://myschemastore/myschemafoo']
		}});

		var id2 = 'http://myschemastore/myschemafoo';
		var schema2:JsonSchema.IJSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema(id2, null, schema2);

		service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
			assert.deepEqual(resolvedSchema.errors, []);
			assert.equal(2, resolvedSchema.schema.allOf.length);

			service.clearExternalSchemas();
			return service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
				assert.equal(resolvedSchema.errors.length, 1);
				assert.ok(resolvedSchema.errors[0].indexOf("Problems loading reference 'http://myschemastore/myschemafoo'") === 0);

				service.clearExternalSchemas();
				service.registerExternalSchema(id2, null, schema2);
				return service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
					assert.equal(resolvedSchema.errors.length, 0);
				});
			});
		}).done(() => testDone(), (error) => {
			testDone(error);
		});
	});

	test('Resolving circular $refs', function(testDone) {

		var service : SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock);

		var input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"name": "SQLServer",
					"type": "Microsoft.Sql/servers",
					"location": "West US",
					"apiVersion": "2014-04-01-preview",
					"dependsOn": [ ],
					"tags": {
						"displayName": "SQL Server"
					},
					"properties": {
						"administratorLogin": "asdfasd",
						"administratorLoginPassword": "asdfasdfasd"
					}
				}
			]
		}
		var parser = new Parser.JSONParser();
		var document = parser.parse(JSON.stringify(input));

		service.getSchemaForResource('file://doc/mydoc.json', document).then(resolveSchema => {
			assert.deepEqual(resolveSchema.errors, []);

			var content = JSON.stringify(resolveSchema.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			var matchingSchemas = [];
			document.validate(resolveSchema.schema, matchingSchemas);
			assert.deepEqual(document.errors, []);
			assert.deepEqual(document.warnings, []);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});

	});

	test('Resolving circular $refs, invalid document', function(testDone) {

		var service : SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock);

		var input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"name": "foo",
					"type": "Microsoft.Resources/deployments",
					"apiVersion": "2015-01-01",
				}
			]
		}
		var parser = new Parser.JSONParser();
		var document = parser.parse(JSON.stringify(input));

		service.getSchemaForResource('file://doc/mydoc.json', document).then(resolveSchema => {
			assert.deepEqual(resolveSchema.errors, []);

			var content = JSON.stringify(resolveSchema.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			var matchingSchemas = [];
			document.validate(resolveSchema.schema, matchingSchemas);
			assert.deepEqual(document.errors, []);
			assert.equal(document.warnings.length, 1);
		}).done(() => testDone(), (error) => {
			testDone(error);
		});

	});

	test('Validate Azure Resource Dfinition', function(testDone) {


		var service : SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock);

		var input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"apiVersion": "2015-06-15",
					"type": "Microsoft.Compute/virtualMachines",
					"name": "a",
					"location": "West US",
					"properties": {
						"hardwareProfile": {
							"vmSize": "Small"
						},
						"osProfile": {
							"computername": "a",
							"adminUsername": "a",
							"adminPassword": "a"
						},
						"storageProfile": {
							"imageReference": {
								"publisher": "a",
								"offer": "a",
								"sku": "a",
								"version": "latest"
							},
							"osDisk": {
								"name": "osdisk",
								"vhd": {
									"uri": "[concat('http://', 'b','.blob.core.windows.net/',variables('vmStorageAccountContainerName'),'/',variables('OSDiskName'),'.vhd')]"
								},
								"caching": "ReadWrite",
								"createOption": "FromImage"
							}
						},
						"networkProfile": {
							"networkInterfaces": [
								{
									"id": "[resourceId('Microsoft.Network/networkInterfaces',variables('nicName'))]"
								}
							]
						},
						"diagnosticsProfile": {
							"bootDiagnostics": {
								"enabled": "true",
								"storageUri": "[concat('http://',parameters('newStorageAccountName'),'.blob.core.windows.net')]"
							}
						}
					}
				}
			]
		}
		var parser = new Parser.JSONParser();
		var document = parser.parse(JSON.stringify(input));

		service.getSchemaForResource('file://doc/mydoc.json', document).then(resolvedSchema => {
			assert.deepEqual(resolvedSchema.errors, []);

			document.validate(resolvedSchema.schema);

			assert.equal(document.warnings.length, 1);
			assert.equal(document.warnings[0].message, 'Missing property "computerName"');
		}).done(() => testDone(), (error) => {
			testDone(error);
		});

	});

});
