import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioUnlock } from './audio-unlock';

/**
 * Lo comun a todo el audio del navegador: el contexto, su desbloqueo (iOS/Safari) y el bus de
 * eventos de teclado. El resto del audio vive en los modulos del rack.
 */
@Injectable()
export class SoundService {
    private keyUp: BehaviorSubject<KeyboardEvent> = new BehaviorSubject(null);
    private unlocker: AudioUnlock;

    constructor(private audioCtx: AudioContext) {
        this.unlocker = new AudioUnlock(audioCtx);
        // Sin esto la pantalla no se entera de que el contexto paso a 'running' (o volvio a suspenderse)
        audioCtx.addEventListener('statechange', () => {});
    }

    /** 'running' = suena; 'suspended' / 'interrupted' = hace falta un toque del usuario. */
    get audioState(): string {
        return this.audioCtx.state;
    }

    get sampleRate(): number {
        return this.audioCtx.sampleRate;
    }

    get baseLatency(): number {
        return (this.audioCtx as any).baseLatency || 0;
    }

    /** Debe llamarse desde un gesto (click / touchend). */
    unlock() {
        this.unlocker.unlock();
    }

    get listenKey() {
        return this.keyUp.asObservable();
    }
    public emiteEventKey(evt: KeyboardEvent): void {
        this.keyUp.next(evt);
    }
}
