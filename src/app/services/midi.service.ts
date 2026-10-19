import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { NoteMsg } from '../daw/core/types';
import { noteName } from './keyboard-map';

export type MidiStatus = 'unsupported' | 'insecure' | 'pending' | 'ready' | 'denied';

const BEND_RANGE_CENTS = 200; // +-2 semitonos, el estandar

/**
 * Web MIDI: conecta cualquier controlador USB/Bluetooth que el navegador vea, tambien
 * los que se enchufen despues (plug and play). Publica los mensajes como notas; los modulos
 * de teclado los reenvian por sus cables.
 */
@Injectable()
export class MidiService {
    public status: MidiStatus = 'pending';
    public devices: Array<string> = [];
    public lastEvent: string = '';
    public readonly messages = new Subject<NoteMsg>();
    private access: any;

    constructor(private zone: NgZone) {
        const nav = navigator as any;
        if (!nav.requestMIDIAccess) {
            // Los navegadores solo exponen MIDI en contextos seguros (https o localhost)
            this.status = window.isSecureContext ? 'unsupported' : 'insecure';
            return;
        }
        nav.requestMIDIAccess().then(
            access => this.zone.run(() => {
                this.access = access;
                access.onstatechange = () => this.zone.run(() => this.refresh());
                this.status = 'ready';
                this.refresh();
            }),
            () => this.zone.run(() => this.status = 'denied')
        );
    }

    // Se llama al iniciar y cada vez que se conecta/desconecta un dispositivo
    private refresh() {
        const names = [];
        this.access.inputs.forEach(input => {
            if (input.state == 'connected') {
                names.push(input.name);
                input.onmidimessage = (msg: any) => this.zone.run(() => this.handle(msg.data));
            }
        });
        this.devices = names;
        // Un dispositivo que se desenchufa con notas sonando no manda note-off
        if (!names.length)
            this.messages.next({ type: 'allOff' });
    }

    private handle(data: Uint8Array) {
        const status = data[0] & 0xF0;
        const d1 = data[1], d2 = data[2];
        if (status == 0x90 && d2 > 0) {
            this.messages.next({ type: 'on', midi: d1, velocity: d2 / 127 });
            this.lastEvent = noteName(d1) + ' vel ' + d2;
        } else if (status == 0x80 || status == 0x90) {
            this.messages.next({ type: 'off', midi: d1 });
        } else if (status == 0xB0) {
            if (d1 == 64)
                this.messages.next({ type: 'sustain', on: d2 >= 64 });
            else if (d1 == 120 || d1 == 123)
                this.messages.next({ type: 'allOff' });
            else
                this.messages.next({ type: 'cc', cc: d1, value: d2 });
        } else if (status == 0xE0) {
            // Pitch bend: 14 bits, 8192 = centro
            const value = ((d2 << 7) | d1) - 8192;
            this.messages.next({ type: 'bend', cents: value / 8192 * BEND_RANGE_CENTS });
        }
    }

    get message(): string {
        switch (this.status) {
            case 'ready': return this.devices.length
                ? this.devices.join(', ')
                : 'ningun dispositivo: conecta un teclado MIDI y se detecta solo';
            case 'insecure': return 'requiere https o localhost';
            case 'unsupported': return 'este navegador no lo soporta (en iPhone/iPad ningun navegador lo tiene; usa Chrome o Edge en computadora o Android)';
            case 'denied': return 'permiso denegado (habilitalo en el candado de la barra)';
            default: return 'esperando permiso...';
        }
    }
}
