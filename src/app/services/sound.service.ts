import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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
    }
    private gainNode:GainNode = this.audioCtx.createGain();
    // Todos los osciladores pasan por este analyser antes de salir a los parlantes
    public readonly analyser:AnalyserNode = this.createMasterAnalyser();

    private createMasterAnalyser():AnalyserNode {
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        analyser.connect(this.audioCtx.destination);
        return analyser;
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