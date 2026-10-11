import type { Action, InputState } from '../gameplay/input';

/** Gameplay key bindings by KeyboardEvent.code (layout-independent). */
export const GAMEPLAY_KEYS: Record<string, Action> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'hop',
  KeyS: 'grab',
  Space: 'hop',
  ArrowUp: 'aimUp',
  ArrowDown: 'aimDown',
  ArrowLeft: 'aimLeft',
  ArrowRight: 'aimRight',
};

export type Command = 'pause' | 'restart' | 'mute' | 'devOverlay';

export const COMMAND_KEYS: Record<string, Command> = {
  Escape: 'pause',
  KeyP: 'pause',
  KeyR: 'restart',
  KeyM: 'mute',
  F3: 'devOverlay',
  Backquote: 'devOverlay',
};

/**
 * Routes keyboard events into the gameplay InputState and one-shot commands.
 * Gamepad support would add a second source feeding the same InputState.
 */
export class Keyboard {
  enabled = true;
  private readonly onDown = (e: KeyboardEvent) => this.handle(e, true);
  private readonly onUp = (e: KeyboardEvent) => this.handle(e, false);
  private readonly onBlur = () => this.input.releaseAll();

  constructor(
    private readonly input: InputState,
    private readonly onCommand: (c: Command) => void,
  ) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private handle(e: KeyboardEvent, down: boolean): void {
    // Don't steal keys from form controls (settings sliders etc.) except Escape.
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName) && e.code !== 'Escape') return;

    const action = GAMEPLAY_KEYS[e.code];
    if (action) {
      e.preventDefault();
      if (e.repeat) return;
      if (down && this.enabled) this.input.press(action);
      else if (!down) this.input.release(action);
      return;
    }
    const command = COMMAND_KEYS[e.code];
    if (command && down && !e.repeat) {
      e.preventDefault();
      this.onCommand(command);
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
