import { Component, Input } from '@angular/core';

/** Iconos SVG propios (sin dependencias). Heredan el color del texto (`currentColor`). */
@Component({
    selector: 'app-icon',
    template: `
<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
    [ngSwitch]="name">
    <circle *ngSwitchCase="'rec'" cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>
    <polygon *ngSwitchCase="'play'" points="7,4.5 19.5,12 7,19.5" fill="currentColor" stroke="none"/>
    <rect *ngSwitchCase="'stop'" x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>
    <polyline *ngSwitchCase="'chevron-down'" points="6 9 12 15 18 9"/>
    <polyline *ngSwitchCase="'chevron-up'" points="6 15 12 9 18 15"/>
    <polyline *ngSwitchCase="'chevron-right'" points="9 6 15 12 9 18"/>
    <polyline *ngSwitchCase="'chevron-left'" points="15 6 9 12 15 18"/>
    <g *ngSwitchCase="'menu'"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></g>
    <g *ngSwitchCase="'close'"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g>
    <g *ngSwitchCase="'plus'"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></g>
    <g *ngSwitchCase="'search'"><circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="20.5" y2="20.5"/></g>
    <g *ngSwitchCase="'eye'"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g>
    <g *ngSwitchCase="'eye-off'"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="4" y1="4" x2="20" y2="20"/></g>
    <g *ngSwitchCase="'save'"><path d="M5 4h11l3 3v13H5z"/><rect x="8" y="4" width="7" height="5"/><rect x="8" y="14" width="8" height="6"/></g>
    <g *ngSwitchCase="'download'"><line x1="12" y1="4" x2="12" y2="15"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="20" x2="19" y2="20"/></g>
    <g *ngSwitchCase="'upload'"><line x1="12" y1="16" x2="12" y2="5"/><polyline points="7 9 12 4 17 9"/><line x1="5" y1="20" x2="19" y2="20"/></g>
    <g *ngSwitchCase="'undo'"><polyline points="9 6 4 11 9 16"/><path d="M4 11h10a6 6 0 0 1 0 12h-3" transform="translate(0 -4)"/></g>
    <g *ngSwitchCase="'redo'"><polyline points="15 6 20 11 15 16"/><path d="M20 11H10a6 6 0 0 0 0 12h3" transform="translate(0 -4)"/></g>
    <g *ngSwitchCase="'trash'"><line x1="4" y1="7" x2="20" y2="7"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></g>
    <g *ngSwitchCase="'music'"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/></g>
    <path *ngSwitchCase="'folder'" d="M3 6h6l2 2h10v11H3z"/>
    <g *ngSwitchCase="'help'"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></g>
    <path *ngSwitchCase="'edit'" d="M4 20l1-4L16 5l3 3L8 19z"/>
    <g *ngSwitchCase="'keyboard'"><rect x="3" y="6" width="18" height="12" rx="2"/><line x1="7" y1="10" x2="7.01" y2="10"/><line x1="11" y1="10" x2="11.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></g>
    <g *ngSwitchCase="'volume-off'"><path d="M4 9h4l5-4v14l-5-4H4z"/><line x1="17" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="17" y2="15"/></g>
    <g *ngSwitchCase="'wave'"><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/></g>
</svg>`,
    styles: [':host { display: inline-flex; line-height: 0; }']
})
export class IconComponent {
    @Input() name: string;
    @Input() size = 16;
}
