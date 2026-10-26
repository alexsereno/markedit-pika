export const css = `
.markedit-pika { color-scheme: light dark; --preview-background:var(--pika-background,Canvas); background:var(--preview-background); color:var(--pika-text,CanvasText); width:min(420px,calc(100vw - 48px)); max-height:calc(100vh - 48px); overflow:auto; box-sizing:border-box; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:12px; padding:26px 24px 20px; box-shadow:0 16px 60px #0003; font:13px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif; text-align:left; animation:pika-fade-in 160ms ease-out; }
.markedit-pika::backdrop { background:#0003; }
.markedit-pika * { box-sizing:border-box; }
.markedit-pika h1 { margin:0 24px 20px 0; font-size:15px; font-weight:600; }
.markedit-pika p { margin:0 0 16px; }
.markedit-pika label { display:block; margin:14px 0; font-weight:500; }
.markedit-pika input { appearance:auto; display:block; width:100%; margin-top:6px; padding:5px 7px; border:1px solid color-mix(in srgb,currentColor 22%,transparent); border-radius:5px; background:Field; color:FieldText; font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
.markedit-pika .token-help { display:inline-block; margin-top:-6px; color:LinkText; text-decoration:none; font-size:12px; }
.markedit-pika .token-help:hover { text-decoration:underline; }
.markedit-pika footer { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:24px; flex-wrap:wrap; }
.markedit-pika button:not(.cm-previewClose) { appearance:auto; font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; min-width:70px; padding:4px 12px; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:6px; background:ButtonFace; color:ButtonText; box-shadow:0 1px 1px #0001; }
.markedit-pika button.primary { background:AccentColor; color:white; border-color:transparent; }
.markedit-pika :focus-visible { outline:2px solid AccentColor; outline-offset:2px; }
.markedit-pika :disabled { opacity:.5; }
.markedit-pika details { margin-top:18px; color:color-mix(in srgb,currentColor 65%,transparent); }
.markedit-pika summary { font-size:12px; cursor:default; }
.markedit-pika .status { margin:16px 0 0; font-size:12px; overflow-wrap:anywhere; }
.markedit-pika .error { color:light-dark(#b3261e,#ffaaa2); }
.markedit-pika [hidden] { display:none!important; }
/* MarkEdit preview close control (MIT, MarkEdit.app); kept scoped to this sheet. */
.markedit-pika .cm-previewClose { position:absolute; z-index:1; top:8px; right:12px; width:24px; height:24px; padding:0; border:0; outline:none; border-radius:50%; background:transparent; color:inherit; }
.markedit-pika.cm-previewKeyboardFocus .cm-previewClose:focus-visible { outline:1px solid currentColor; outline-offset:2px; }
.markedit-pika .cm-previewClose::before { content:''; position:absolute; inset:4px; background:color-mix(in srgb,currentColor 50%,var(--preview-background,Canvas)); mask:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><path fill-rule="evenodd" d="M9 0a9 9 0 1 0 0 18A9 9 0 0 0 9 0z M9 7.94l-2.47-2.47a.75.75 0 0 0-1.06 1.06L7.94 9l-2.47 2.47a.75.75 0 0 0 1.06 1.06L9 10.06l2.47 2.47a.75.75 0 0 0 1.06-1.06L10.06 9l2.47-2.47a.75.75 0 0 0-1.06-1.06z"/></svg>') center / 16px 16px no-repeat; }
.markedit-pika .cm-previewClose:active::before { background:color-mix(in srgb,currentColor 65%,var(--preview-background,Canvas)); }
@keyframes pika-fade-in { from { opacity:0; } to { opacity:1; } }
@media(prefers-reduced-motion:reduce) { .markedit-pika { animation:none; } }
`;
