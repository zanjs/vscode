/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import languageDef = require('vs/editor/standalone-languages/xml');
import T = require('vs/editor/standalone-languages/test/testUtil');

var Bracket = {
	Open: 1,
	Close: -1
};

T.testTokenization('xml', languageDef.language, [
	// Complete Start Tag with Whitespace
	[{
	line: '<person>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-person.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<person/>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-person.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: 'tag.tag-person.xml', bracket: Bracket.Close },
		{ startIndex: 8, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<person >',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-person.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<person />',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-person.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'tag.tag-person.xml', bracket: Bracket.Close },
		{ startIndex: 9, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Incomplete Start Tag
	[{
	line: '<',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '<person',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-person.xml', bracket: Bracket.Open }
	]}],

	[{
	line: '<input',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-input.xml', bracket: Bracket.Open }
	]}],

	// Invalid Open Start Tag
	[{
	line: '< person',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '< person>',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: 'i <person;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 3, type: 'tag.tag-person.xml' },
		{ startIndex: 9, type: '' }
	]}],

	// Tag with Attribute
	[{
	line: '<tool name="">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 13, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<tool name="Monaco">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 19, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<tool name=\'Monaco\'>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 19, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Tag with Attributes
	[{
	line: '<tool name="Monaco" version="1.0">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'attribute.name.xml' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'attribute.value.xml' },
		{ startIndex: 33, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Tag with Name-Only-Attribute
	[{
	line: '<tool name>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<tool name version>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.name.xml' },
		{ startIndex: 18, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Tag with Attribute And Whitespace
	[{
	line: '<tool name=  "monaco">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 13, type: 'attribute.value.xml' },
		{ startIndex: 21, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<tool name = "monaco">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 13, type: 'attribute.value.xml' },
		{ startIndex: 21, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Tag with Invalid Attribute Name
	[{
	line: '<tool name!@#="bar">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 15, type: 'attribute.name.xml' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Tag with Invalid Attribute Value
	[{
	line: '<tool name=">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tool.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 12, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}],

	// Complete End Tag
	[{
	line: '</person>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-person.xml', bracket: Bracket.Close },
		{ startIndex: 8, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}],

	// Complete End Tag with Whitespace
	[{
	line: '</person  >',
	tokens: [
		{ startIndex: 0, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-person.xml', bracket: Bracket.Close },
		{ startIndex: 8, type: '' },
		{ startIndex: 10, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}],

	// Incomplete End Tag
	[{
	line: '</person',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	// Comments
	[{
	line: '<!-- -->',
	tokens: [
		{ startIndex: 0, type: 'comment.xml', bracket: Bracket.Open },
		{ startIndex: 4, type: 'comment.content.xml' },
		{ startIndex: 5, type: 'comment.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<!--a>monaco</a -->',
	tokens: [
		{ startIndex: 0, type: 'comment.xml', bracket: Bracket.Open },
		{ startIndex: 4, type: 'comment.content.xml' },
		{ startIndex: 16, type: 'comment.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<!--a>\nmonaco \ntools</a -->',
	tokens: [
		{ startIndex: 0, type: 'comment.xml', bracket: Bracket.Open },
		{ startIndex: 4, type: 'comment.content.xml' },
		{ startIndex: 24, type: 'comment.xml', bracket: Bracket.Close }
	]}],

	// CDATA
	[{
	line: '<tools><![CDATA[<person/>]]></tools>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tools.xml' },
		{ startIndex: 6, type: 'delimiter.start.xml', bracket: Bracket.Close },
		{ startIndex: 7, type: 'delimiter.cdata.xml', bracket: Bracket.Open },
		{ startIndex: 16, type: '' },
		{ startIndex: 25, type: 'delimiter.cdata.xml', bracket: Bracket.Close },
		{ startIndex: 28, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 30, type: 'tag.tag-tools.xml', bracket: Bracket.Close },
		{ startIndex: 35, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}],

	[{
	line: '<tools>\n	<![CDATA[\n		<person/>\n	]]>\n</tools>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-tools.xml' },
		{ startIndex: 6, type: 'delimiter.start.xml', bracket: Bracket.Close },
		{ startIndex: 7, type: '' },
		{ startIndex: 9, type: 'delimiter.cdata.xml', bracket: Bracket.Open },
		{ startIndex: 18, type: '' },
		{ startIndex: 32, type: 'delimiter.cdata.xml', bracket: Bracket.Close },
		{ startIndex: 35, type: '' },
		{ startIndex: 36, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 38, type: 'tag.tag-tools.xml', bracket: Bracket.Close },
		{ startIndex: 43, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}],

	// Generated from sample
	[{
	line: '<?xml version="1.0"?>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'metatag.instruction.xml' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'attribute.value.xml' },
		{ startIndex: 19, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '<configuration xmlns:xdt="http://schemas.microsoft.com/XML-Document-Transform">',
	tokens: [
		{ startIndex: 0, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 1, type: 'tag.tag-configuration.xml', bracket: Bracket.Open },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'attribute.name.xml' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'attribute.value.xml' },
		{ startIndex: 78, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '  <connectionStrings>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 3, type: 'tag.tag-connectionstrings.xml', bracket: Bracket.Open },
		{ startIndex: 20, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '    <add name="MyDB" ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: 'tag.tag-add.xml', bracket: Bracket.Open },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'attribute.name.xml' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'attribute.value.xml' },
		{ startIndex: 20, type: '' }
	]}, {
	line: '      connectionString="value for the deployed Web.config file" ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'attribute.value.xml' },
		{ startIndex: 63, type: '' }
	]}, {
	line: '      xdt:Transform="SetAttributes" xdt:Locator="Match(name)"/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'attribute.value.xml' },
		{ startIndex: 35, type: '' },
		{ startIndex: 36, type: 'attribute.name.xml' },
		{ startIndex: 47, type: '' },
		{ startIndex: 48, type: 'attribute.value.xml' },
		{ startIndex: 61, type: 'tag.tag-add.xml', bracket: Bracket.Close },
		{ startIndex: 62, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '  </connectionStrings>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 4, type: 'tag.tag-connectionstrings.xml', bracket: Bracket.Close },
		{ startIndex: 21, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}, {
	line: '  <system.web>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 3, type: 'tag.tag-system.web.xml', bracket: Bracket.Open },
		{ startIndex: 13, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '    <customErrors defaultRedirect="GenericError.htm"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: 'tag.tag-customerrors.xml', bracket: Bracket.Open },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'attribute.name.xml' },
		{ startIndex: 33, type: '' },
		{ startIndex: 34, type: 'attribute.value.xml' }
	]}, {
	line: '      mode="RemoteOnly" xdt:Transform="Replace">',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'attribute.name.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.value.xml' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'attribute.name.xml' },
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'attribute.value.xml' },
		{ startIndex: 47, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '      <error statusCode="500" redirect="InternalError.htm"/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: 'tag.tag-error.xml', bracket: Bracket.Open },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'attribute.name.xml' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'attribute.value.xml' },
		{ startIndex: 29, type: '' },
		{ startIndex: 30, type: 'attribute.name.xml' },
		{ startIndex: 38, type: '' },
		{ startIndex: 39, type: 'attribute.value.xml' },
		{ startIndex: 58, type: 'tag.tag-error.xml', bracket: Bracket.Close },
		{ startIndex: 59, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '    </customErrors>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 6, type: 'tag.tag-customerrors.xml', bracket: Bracket.Close },
		{ startIndex: 18, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}, {
	line: '  </system.web>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 4, type: 'tag.tag-system.web.xml', bracket: Bracket.Close },
		{ startIndex: 14, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}, {
	line: '	',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '	<!-- The stuff below was added for extra tokenizer testing -->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'comment.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: 'comment.content.xml' },
		{ startIndex: 60, type: 'comment.xml', bracket: Bracket.Close }
	]}, {
	line: '	<!-- A multi-line comment <with> </with>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'comment.xml', bracket: Bracket.Open },
		{ startIndex: 5, type: 'comment.content.xml' }
	]}, {
	line: '       <tags>',
	tokens: [
		{ startIndex: 0, type: 'comment.content.xml' }
	]}, {
	line: '				 -->',
	tokens: [
		{ startIndex: 0, type: 'comment.content.xml' },
		{ startIndex: 5, type: 'comment.xml', bracket: Bracket.Close }
	]}, {
	line: '	<!DOCTYPE another meta tag>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 3, type: 'metatag.declaration.xml' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'attribute.name.xml' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'attribute.name.xml' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'attribute.name.xml' },
		{ startIndex: 27, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<tools><![CDATA[Some text and tags <person/>]]></tools>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-tools.xml', bracket: Bracket.Open },
		{ startIndex: 7, type: 'delimiter.start.xml', bracket: Bracket.Close },
		{ startIndex: 8, type: 'delimiter.cdata.xml', bracket: Bracket.Open },
		{ startIndex: 17, type: '' },
		{ startIndex: 45, type: 'delimiter.cdata.xml', bracket: Bracket.Close },
		{ startIndex: 48, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 50, type: 'tag.tag-tools.xml', bracket: Bracket.Close },
		{ startIndex: 55, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}, {
	line: '	<aSelfClosingTag with="attribute" />',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-aselfclosingtag.xml', bracket: Bracket.Open },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'attribute.name.xml' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'attribute.value.xml' },
		{ startIndex: 34, type: '' },
		{ startIndex: 35, type: 'tag.tag-aselfclosingtag.xml', bracket: Bracket.Close },
		{ startIndex: 36, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<aSelfClosingTag with="attribute"/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-aselfclosingtag.xml', bracket: Bracket.Open },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'attribute.name.xml' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'attribute.value.xml' },
		{ startIndex: 34, type: 'tag.tag-aselfclosingtag.xml', bracket: Bracket.Close },
		{ startIndex: 35, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<namespace:aSelfClosingTag otherspace:with="attribute"/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-namespace:aselfclosingtag.xml', bracket: Bracket.Open },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'attribute.name.xml' },
		{ startIndex: 43, type: '' },
		{ startIndex: 44, type: 'attribute.value.xml' },
		{ startIndex: 55, type: 'tag.tag-namespace:aselfclosingtag.xml', bracket: Bracket.Close },
		{ startIndex: 56, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<valid-name also_valid this.one=\'too is valid\'/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-valid-name.xml', bracket: Bracket.Open },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'attribute.name.xml' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'attribute.name.xml' },
		{ startIndex: 32, type: '' },
		{ startIndex: 33, type: 'attribute.value.xml' },
		{ startIndex: 47, type: 'tag.tag-valid-name.xml', bracket: Bracket.Close },
		{ startIndex: 48, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<aSimpleSelfClosingTag />',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-asimpleselfclosingtag.xml', bracket: Bracket.Open },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'tag.tag-asimpleselfclosingtag.xml', bracket: Bracket.Close },
		{ startIndex: 25, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '	<aSimpleSelfClosingTag/>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.start.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-asimpleselfclosingtag.xml', bracket: Bracket.Open },
		{ startIndex: 23, type: 'tag.tag-asimpleselfclosingtag.xml', bracket: Bracket.Close },
		{ startIndex: 24, type: 'delimiter.start.xml', bracket: Bracket.Close }
	]}, {
	line: '</configuration>',
	tokens: [
		{ startIndex: 0, type: 'delimiter.end.xml', bracket: Bracket.Open },
		{ startIndex: 2, type: 'tag.tag-configuration.xml', bracket: Bracket.Close },
		{ startIndex: 15, type: 'delimiter.end.xml', bracket: Bracket.Close }
	]}]
]);
