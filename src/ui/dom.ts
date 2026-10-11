/** Tiny DOM helpers for the HTML UI layer. */

export function el<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`UI element not found: ${selector}`);
  return found;
}

export type ScreenId = 'menu' | 'loading' | 'pause' | 'settings';

export function showScreen(id: ScreenId | null): void {
  for (const s of document.querySelectorAll<HTMLElement>('.screen')) s.hidden = s.id !== `screen-${id}`;
  // Focus the first button so keyboard users can act immediately.
  if (id) document.querySelector<HTMLElement>(`#screen-${id} button.primary`)?.focus();
}

/** Wires every [data-action] button inside a screen to a handler map. */
export function bindActions(screen: HTMLElement, handlers: Record<string, () => void>): void {
  screen.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const action = btn?.dataset.action;
    if (action && handlers[action]) handlers[action]();
  });
}
