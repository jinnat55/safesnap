const region = () => document.getElementById('announcer') as HTMLElement;

/** Every visual change in the app is also announced here, so motion never hides meaning. */
export function announce(message: string): void {
  const el = region();
  el.textContent = '';
  window.setTimeout(() => {
    el.textContent = message;
  }, 60);
}
