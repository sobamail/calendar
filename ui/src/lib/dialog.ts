/**
 * Svelte action for a modal card: focus moves into it on mount (onto its
 * `[data-autofocus]` element when it has one) and goes back to whatever had it
 * before once the card is gone, if that element is still on the page.
 */
export function dialogFocus(node: HTMLElement) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node).focus();
    return {
        destroy() {
            if (opener?.isConnected)
                opener.focus();
        },
    };
}
