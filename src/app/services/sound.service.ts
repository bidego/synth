import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable()
export class SoundService {
    private keyUp: BehaviorSubject<KeyboardEvent> = new BehaviorSubject(null);

    public notes = [
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
    }]
    constructor(private audioCtx:AudioContext){
    }
    private gainNode:GainNode = this.audioCtx.createGain();
    
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