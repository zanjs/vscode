/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IReferenceSupport, IReference} from 'vs/editor/common/modes';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

export const ReferenceRegistry = new LanguageFeatureRegistry<IReferenceSupport>('referenceSupport');

export function findReferences(model: IModel, position: IPosition): TPromise<IReference[]> {

	// collect references from all providers
	const promises = ReferenceRegistry.ordered(model).map(provider => {
		return provider.findReferences(model.getAssociatedResource(), position, true).then(result => {
			if (Array.isArray(result)) {
				return <IReference[]> result;
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		let result: IReference[] = [];
		for (let ref of references) {
			if (ref) {
				result.push(...ref);
			}
		}
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeReferenceProvider', findReferences);