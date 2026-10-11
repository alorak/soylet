/**
 * Lightweight accessible popover selector used for TTS model and voice choices.
 * Each choice is a real button, supports keyboard arrows, Enter/Space and Escape.
 */
const pickers = new Set();

export function closePickers() {
  for (const picker of pickers) picker.close();
}

export function createPicker({ trigger, popover, control, onSelect, type = 'model' }) {
  let choices = [];
  let selectedValue = '';
  function options() { return [...popover.querySelectorAll('[role="option"]')]; }
  function close(restoreFocus = false) {
    if (popover.hidden) return;
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function open() {
    if (trigger.disabled || !choices.length) return;
    for (const other of pickers) if (other !== api) other.close();
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const items = options();
    (items.find(item => item.getAttribute('aria-selected') === 'true') || items[0])?.focus();
  }
  const api = { close };
  pickers.add(api);
  trigger.addEventListener('click', () => popover.hidden ? open() : close(true));
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
      if (event.key === 'ArrowUp') options().at(-1)?.focus();
    }
  });
  popover.addEventListener('keydown', event => {
    const items = options();
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') { close(); return; }
    let next = index;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index + items.length - 1) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!control.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (!control.contains(event.target)) close();
  });

  function setChoices(nextChoices, selected) {
    selectedValue = selected;
    choices = nextChoices;
    // Rendering can occur during downloads; do not leave a stale open panel.
    close();
    popover.replaceChildren();
    for (const choice of choices) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `picker-option${choice.installed === false ? ' unavailable' : ''}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(choice.id === selectedValue));
      option.tabIndex = -1;
      option.dataset.value = choice.id;

      const main = document.createElement('span');
      main.className = type === 'voice' ? 'picker-option-voice' : 'picker-option-name';
      if (type === 'voice') {
        const avatar = document.createElement('span');
        avatar.className = 'voice-avatar';
        avatar.textContent = choice.id;
        const text = document.createElement('span');
        text.className = 'picker-option-name';
        text.textContent = choice.label;
        main.append(avatar, text);
      } else {
        main.textContent = choice.label;
      }
      const status = document.createElement('span');
      status.className = 'picker-option-status';
      status.textContent = choice.status;
      option.append(main, status);
      option.addEventListener('click', () => {
        close(true);
        onSelect(choice);
      });
      popover.append(option);
    }
  }
  return { ...api, setChoices };
}
