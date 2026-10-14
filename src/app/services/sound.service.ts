import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { FxConfig, DEFAULT_FX } from './presets';
import { MasterChain } from './master-chain';
import { AudioUnlock } from './audio-unlock';

@Injectable()
export class SoundService {
    private keyUp: BehaviorSubject<KeyboardEvent> = new BehaviorSubject(null);
    private chain: MasterChain;
    public fx: FxConfig = { ...DEFAULT_FX };
    // Avisa cuando cambian los efectos (el looper los guarda con el proyecto)
    public fxChanged = new Subject<void>();

    private unlocker: AudioUnlock;

    constructor(private audioCtx: AudioContext) {
        this.chain = new MasterChain(audioCtx);
        this.chain.setFx(this.fx);
        this.unlocker = new AudioUnlock(audioCtx);
        // Sin esto la pantalla no se entera de que el contexto paso a 'running' (o volvio a suspenderse)
        audioCtx.addEventListener('statechange', () => {});
    }

    /** 'running' = suena; 'suspended' / 'interrupted' = hace falta un toque del usuario. */
    get audioState(): string {
        return this.audioCtx.state;
    }

    /** Debe llamarse desde un gesto (click / touchend). */
    unlock() {
        this.unlocker.unlock();
    }

    // Bus al que se conectan todas las voces
    get input(): GainNode {
        return this.chain.input;
    }

    // Todo el audio pasa por este analyser antes de salir a los parlantes
    get analyser(): AnalyserNode {
        return this.chain.analyser;
    }

    public setFx(fx: Partial<FxConfig>): void {
        Object.assign(this.fx, fx);
        this.chain.setFx(this.fx);
        this.fxChanged.next();
    }

    get listenKey() {
        return this.keyUp.asObservable();
    }
    public emiteEventKey(evt: KeyboardEvent): void {
        this.keyUp.next(evt);
    }
}
