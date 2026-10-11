import { App } from './app/App';

new App().start().catch((err: unknown) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="position:fixed;inset:auto 16px 16px;color:#e06060;font-family:monospace">Failed to start: ${String(err)}</p>`,
  );
});
