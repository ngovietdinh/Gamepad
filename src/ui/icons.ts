const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  hint: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
  edges: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 8h8v8H8z" stroke-dasharray="2 2.4"/>'),
  ghost: svg('<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="m3.5 16 5-5 4 4 2.5-2.5 5 5"/><circle cx="15.5" cy="9.5" r="1.4"/>'),
  scatter: svg('<rect x="3.5" y="4" width="6" height="6" rx="1" transform="rotate(-12 6.5 7)"/><rect x="14" y="3.5" width="6" height="6" rx="1" transform="rotate(14 17 6.5)"/><rect x="5" y="14" width="6" height="6" rx="1" transform="rotate(8 8 17)"/><rect x="14.5" y="14.5" width="6" height="6" rx="1" transform="rotate(-6 17.5 17.5)"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  rotateCw: svg('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V9h-4.5"/>'),
  rotateCcw: svg('<path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M5 4.5V9h4.5"/>'),
  flip: svg('<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 7 4 17h5zM15 7l5 10h-5z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  spin: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/>'),
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  pencil: svg('<path d="M4 20l1.2-4.6L16.5 4.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M14.5 6l3.5 3.5"/>'),
};

export type IconName = keyof typeof icons;
