/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/activityaction';
import nls = require('vs/nls');
import {Builder, $} from 'vs/base/browser/builder';
import {DelayedDragHandler} from 'vs/base/browser/dnd';
import {Action} from 'vs/base/common/actions';
import {BaseActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IEmitterEvent} from 'vs/base/common/eventEmitter';
import {ProgressBadge, TextBadge, NumberBadge, IBadge} from 'vs/workbench/services/activity/common/activityService';

export class ActivityAction extends Action {

	static BADGE = 'badge';

	private badge: IBadge;

	constructor(id: string, name: string, clazz: string) {
		super(id, name, clazz);

		this.badge = null;
	}

	public activate(): void {
		if (!this.checked) {
			this.checked = true;
			this.emit('checked', { source: this });
		}
	}

	public deactivate(): void {
		if (this.checked) {
			this.checked = false;
			this.emit('checked', { source: this });
		}
	}

	public getBadge(): IBadge {
		return this.badge;
	}

	public setBadge(badge: IBadge): void {
		this.badge = badge;
		this.emit(ActivityAction.BADGE, { source: this });
	}
}

export class ActivityActionItem extends BaseActionItem {

	private $e: Builder;
	private name: string;
	private _keybinding: string;
	private cssClass: string;
	private $badge: Builder;
	private $badgeContent: Builder;

	constructor(action: Action, activityName: string = action.label, keybinding: string = null) {
		super(null, action);

		this.cssClass = action.class;
		this.name = activityName;
		this._keybinding = keybinding;
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.$e = $('a.action-label').attr({
			tabIndex: '0',
			role: 'menuitem'
		}).appendTo(this.builder);

		if (this.cssClass) {
			this.$e.addClass(this.cssClass);
		}

		this.$badge = this.builder.div({ 'class': 'badge' }, (badge: Builder) => {
			this.$badgeContent = badge.div({ 'class': 'badge-content', 'role': 'presentation' });
		});

		this.$badge.hide();

		this.keybinding = this._keybinding; // force update

		// Activate on drag over to reveal targets
		[this.$badge, this.$e].forEach(b => new DelayedDragHandler(b.getHTMLElement(), () => {
			if (!this.getAction().checked) {
				this.getAction().run();
			}
		}));
	}

	public focus(): void {
		this.$e.domFocus();
	}

	public setBadge(badge: IBadge): void {
		this.updateBadge(badge);
	}

	public set keybinding(keybinding: string) {
		this._keybinding = keybinding;

		if (!this.$e) {
			return;
		}

		let title: string;

		if (keybinding) {
			title = nls.localize('titleKeybinding', "{0} ({1})", this.name, keybinding);
		} else {
			title = this.name;
		}

		this.$e.title(title);
		this.$badge.title(title);
	}

	private updateBadge(badge: IBadge): void {
		this.$badgeContent.empty();
		this.$badge.hide();

		if (badge) {

			// Number
			if (badge instanceof NumberBadge) {
				let n = (<NumberBadge>badge).number;

				if (n) {
					this.$badgeContent.text(n > 99 ? '99+' : n.toString());
					this.$badge.show();
				}
			}

			// Text
			else if (badge instanceof TextBadge) {
				this.$badgeContent.text((<TextBadge>badge).text);
				this.$badge.show();
			}

			// Progress
			else if (badge instanceof ProgressBadge) {
				this.$badge.show();
			}

			this.$e.attr('aria-label', this.name + ' - ' + badge.getDescription());
		}
	}

	public _updateClass(): void {
		if (this.cssClass) {
			this.$badge.removeClass(this.cssClass);
		}

		this.cssClass = this.getAction().class;
		this.$badge.addClass(this.cssClass);
	}

	public _updateChecked(): void {
		if (this.getAction().checked) {
			this.$e.addClass('active');
		} else {
			this.$e.removeClass('active');
		}
	}

	public _updateUnknown(event: IEmitterEvent): void {
		if (event.getType() === ActivityAction.BADGE) {
			let action = this.getAction();
			if (action instanceof ActivityAction) {
				this.updateBadge((<ActivityAction> action).getBadge());
			}
		}
	}

	public _updateEnabled(): void {
		if (this.getAction().enabled) {
			this.builder.removeClass('disabled');
		} else {
			this.builder.addClass('disabled');
		}
	}

	public dispose(): void {
		super.dispose();

		this.$badge.destroy();
		this.$e.destroy();
	}
}