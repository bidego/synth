import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FxConfig, DEFAULT_FX } from './presets';

export class NoteModel {
    name:String;
    position:number;
    frequency:number;
}
@Injectable()
export class SoundService {
    private keyUp: BehaviorSubject<KeyboardEvent> = new BehaviorSubject(null);

    public notes:Array<NoteModel> = [
    {
        name: 'C',
        position: 4,
        frequency: 261.63
    }, {
        name: 'C#',
        position: 4,
        frequency: 277.18
    }, {
        name: 'D',
        position: 4,
        frequency: 293.66
    },{
        name: 'Eb',
        position: 4,
        frequency: 311.13
    },{
        name: 'E',
        position: 4,
        frequency: 329.53
    },{
        name: 'F',
        position: 4,
        frequency: 349.23
    },{
        name: 'F#',
        position: 4,
        frequency: 369.99
    },{
        name: 'G',
        position: 4,
        frequency: 391.99
    },{
        name: 'Ab',
        position: 4,
        frequency: 415.30
    },{
        name: 'A',
        position: 4,
        frequency: 440
    },{
        name: 'Bb',
        position: 4,
        frequency: 466.16
    },{
        name: 'B',
        position: 4,
        frequency: 493.88
    }]
    constructor(private audioCtx:AudioContext){
        this.buildMasterChain();
        this.setFx(DEFAULT_FX);
    }
    private gainNode:GainNode = this.audioCtx.createGain();

    // Bus al que se conectan todos los osciladores
    public input:GainNode;
    // Todo el audio pasa por este analyser antes de salir a los parlantes
    public analyser:AnalyserNode;
    public fx:FxConfig = { ...DEFAULT_FX };
    private delay:DelayNode;
    private feedback:GainNode;
    private delayWet:GainNode;
    private reverbWet:GainNode;

    // input -> dry ------------------------------> sum -> compresor -> analyser -> destino
    //       -> delay (con realimentacion) -> wet -> sum
    //       -> reverb (convolver) --------> wet -> sum
    private buildMasterChain():void {
        const ctx = this.audioCtx;
        this.input = ctx.createGain();
        const dry = ctx.createGain();
        const sum = ctx.createGain();

        this.delay = ctx.createDelay(2);
        this.feedback = ctx.createGain();
        const delayTone = ctx.createBiquadFilter();
        delayTone.type = 'lowpass';
        delayTone.frequency.value = 3500;
        this.delayWet = ctx.createGain();

        const reverb = ctx.createConvolver();
        reverb.buffer = this.createImpulse(2.8, 3);
        this.reverbWet = ctx.createGain();

        // Muchas capas suman volumen: el compresor evita que sature
        const compressor = ctx.createDynamicsCompressor();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;

        this.input.connect(dry);
        dry.connect(sum);
        this.input.connect(this.delay);
        this.delay.connect(delayTone);
        delayTone.connect(this.feedback);
        this.feedback.connect(this.delay);
        delayTone.connect(this.delayWet);
        this.delayWet.connect(sum);
        this.input.connect(reverb);
        reverb.connect(this.reverbWet);
        this.reverbWet.connect(sum);
        sum.connect(compressor);
        compressor.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    // Respuesta al impulso sintetica: ruido estereo con decaimiento exponencial
    private createImpulse(seconds:number, decay:number):AudioBuffer {
        const rate = this.audioCtx.sampleRate;
        const length = Math.floor(rate * seconds);
        const buffer = this.audioCtx.createBuffer(2, length, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++)
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
        return buffer;
    }

    public setFx(fx:Partial<FxConfig>):void {
        Object.assign(this.fx, fx);
        const t = this.audioCtx.currentTime;
        this.delay.delayTime.setTargetAtTime(this.fx.delayTime, t, 0.05);
        this.feedback.gain.setTargetAtTime(Math.min(this.fx.delayFeedback, 0.9), t, 0.05);
        this.delayWet.gain.setTargetAtTime(this.fx.delayMix, t, 0.05);
        this.reverbWet.gain.setTargetAtTime(this.fx.reverbMix, t, 0.05);
    }

    public play(freq, time, delay):void {
        const oscillator:OscillatorNode = this.audioCtx.createOscillator();
        oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        oscillator.type = 'sine'; 
        oscillator.frequency.value = freq;
        oscillator.start(this.audioCtx.currentTime + delay);
        oscillator.stop(this.audioCtx.currentTime + delay + time);
    }
    get listenKey(){
        return this.keyUp.asObservable();
    }
    public emiteEventKey(evt:KeyboardEvent):void{
        this.keyUp.next(evt);
    }

}