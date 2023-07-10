/*
 * This file is part of the TYPO3 CMS project.
 *
 * It is free software; you can redistribute it and/or modify it under
 * the terms of the GNU General Public License, either version 2
 * of the License, or any later version.
 *
 * For the full copyright and license information, please read the
 * LICENSE.txt file that was distributed with this source code.
 *
 * The TYPO3 project - inspiring people to share!
 */

import documentService = require('TYPO3/CMS/Core/DocumentService');
import RegularEvent = require('TYPO3/CMS/Core/Event/RegularEvent');
import Viewport = require('./Viewport');

type HTMLFormChildElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Module: TYPO3/CMS/Backend/GlobalEventHandler
 *
 * + `data-global-event="change"`
 *   + `data-action-submit="..."` submits form data
 *     + `$form` parent form element of current element is submitted
 *     + `<any CSS selector>` queried element is submitted (if implementing HTMLFormElement)
 *   + `data-action-navigate="..."` navigates to URL
 *     + `$value` URL taken from value of current element
 *     + `$data` URL taken from `data-navigate-value`
 *     + `$data=~s/$value/` URL taken from `data-navigate-value`,
 *        substituting literal `${value}` and `$[value]` of current element
 * + `data-global-event="submit"`
 *   + `data-value-selector`="..."` retrieves `$value` from corresponding CSS selector
 *   + `data-action-navigate="..."` navigates to URL
 *     + `$form=~s/$value/` URL taken from `form[action]`,
 *        substituting literal `${value}` and `$[value]` taken from `data-value-selector`
 * + `data-global-event="click"`
 *   * `data-action-focus="..."` focus form field
 *   + @todo
 *
 * @example
 * <form action="..." id="...">
 *   <input name="name" value="value" data-global-event="change" data-action-submit="$form">
 * </form>
 */
class GlobalEventHandler {
  private options = {
    onChangeSelector: '[data-global-event="change"]',
    onClickSelector: '[data-global-event="click"]',
    onSubmitSelector: 'form[data-global-event="submit"]',
  };

  constructor() {
    documentService.ready().then((): void => this.registerEvents());
  };

  private registerEvents(): void {
    new RegularEvent('change', this.handleChangeEvent.bind(this))
      .delegateTo(document, this.options.onChangeSelector);
    new RegularEvent('click', this.handleClickEvent.bind(this))
      .delegateTo(document, this.options.onClickSelector);
    new RegularEvent('submit', this.handleSubmitEvent.bind(this))
      .delegateTo(document, this.options.onSubmitSelector);
  }

  private handleChangeEvent(evt: Event, resolvedTarget: HTMLElement): void {
    evt.preventDefault();
    this.handleFormChildAction(evt, resolvedTarget)
      || this.handleFormChildNavigateAction(evt, resolvedTarget);
  }

  private handleClickEvent(evt: Event, resolvedTarget: HTMLElement): void {
    evt.preventDefault();
    this.handleFormChildAction(evt, resolvedTarget);
  }

  private handleSubmitEvent(evt: Event, resolvedTarget: HTMLFormElement): void {
    evt.preventDefault();
    this.handleFormNavigateAction(evt, resolvedTarget);
  }

  private handleFormChildAction(evt: Event, resolvedTarget: HTMLElement): boolean {
    const actionSubmit: string = resolvedTarget.dataset.actionSubmit;
    const actionFocus: string = resolvedTarget.dataset.actionFocus;
    if (!actionSubmit && !actionFocus) {
      return false;
    }

    const parentForm = resolvedTarget.closest('form');

    if (actionSubmit) {
      // @example [data-action-submit]="$form"
      if (actionSubmit === '$form' && this.isHTMLFormChildElement(resolvedTarget)) {
        (resolvedTarget as HTMLFormChildElement).form.submit();
        return true;
      }
      const formCandidate = document.querySelector(actionSubmit);
      if (formCandidate instanceof HTMLFormElement) {
        formCandidate.submit();
        return true;
      }
      return false;
    }

    if (actionFocus && parentForm) {
      if (!(parentForm instanceof HTMLFormElement)) {
        return false;
      }

      const formFieldElement: HTMLElement|null = parentForm.querySelector(actionFocus);
      if (formFieldElement === null) {
        return false;
      }

      formFieldElement.focus();
    }

    return true;
  }

  private handleFormChildNavigateAction(evt: Event, resolvedTarget: HTMLElement): boolean {
    const actionNavigate: string = resolvedTarget.dataset.actionNavigate;
    if (!actionNavigate) {
      return false;
    }
    const value = this.resolveHTMLFormChildElementValue(resolvedTarget);
    const navigateValue = resolvedTarget.dataset.navigateValue;
    let locationHref = null;
    if (actionNavigate === '$data=~s/$value/' && navigateValue && value !== null) {
      locationHref = this.substituteValueVariable(navigateValue, value);
    } else if (actionNavigate === '$data' && navigateValue) {
      locationHref = navigateValue;
    } else if (actionNavigate === '$value' && value) {
      locationHref = value;
    }
    if (locationHref === null) {
      return false;
    }
    if (window === Viewport.ContentContainer.get()) {
      Viewport.ContentContainer.setUrl(locationHref);
    } else {
      window.location.href = locationHref;
    }
    return true;
  }

  private handleFormNavigateAction(evt: Event, resolvedTarget: HTMLFormElement): boolean {
    const formAction = resolvedTarget.action;
    const actionNavigate: string = resolvedTarget.dataset.actionNavigate;
    if (!formAction || !actionNavigate) {
      return false;
    }
    const navigateValue = resolvedTarget.dataset.navigateValue;
    const valueSelector = resolvedTarget.dataset.valueSelector;
    const value = this.resolveHTMLFormChildElementValue(resolvedTarget.querySelector(valueSelector));
    let locationHref = null;
    if (actionNavigate === '$form=~s/$value/' && navigateValue && value !== null) {
      locationHref = this.substituteValueVariable(navigateValue, value);
    } else if (actionNavigate === '$form') {
      locationHref = formAction;
    }
    if (locationHref === null) {
      return false;
    }
    if (window === Viewport.ContentContainer.get()) {
      Viewport.ContentContainer.setUrl(locationHref);
    } else {
      window.location.href = locationHref;
    }
    return true;
  }

  private substituteValueVariable(haystack: string, substitute: string): string {
    // replacing `${value}` and `$[value]` and its URL encoded representation
    // (`${value}` is difficult to achieve with Fluid, that's why there's `$[value]` as well)
    return haystack.replace(/(\$\{value\}|%24%7Bvalue%7D|\$\[value\]|%24%5Bvalue%5D)/gi, substitute);
  }

  private isHTMLFormChildElement(element: HTMLElement): boolean {
    return element instanceof HTMLSelectElement
      || element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement;
  }

  private resolveHTMLFormChildElementValue(element: HTMLElement): string | null {
    const type: string = element.getAttribute('type');
    if (element instanceof HTMLSelectElement) {
      return element.options[element.selectedIndex].value;
    } else if (element instanceof HTMLInputElement && type === 'checkbox') {
      // used for representing unchecked state as e.g. `data-empty-value="0"`
      const emptyValue: string = element.dataset.emptyValue;
      if (element.checked) {
        return element.value;
      } else if (typeof emptyValue !== 'undefined') {
        return emptyValue;
      } else {
        return '';
      }
    } else if (element instanceof HTMLInputElement) {
      return element.value;
    }
    return null;
  }
}

export = new GlobalEventHandler();
