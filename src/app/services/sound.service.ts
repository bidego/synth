import { Injectable } from '@angular/core';

@Injectable()
export class SoundService {
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
    public audioCtx = new (window['AudioContext'] || window['webkitAudioContext'])();
    private gainNode = this.audioCtx.createGain();
    public play(freq, time, delay) {
        const oscillator = this.audioCtx.createOscillator();
        oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        oscillator.type = 'sine'; 
        oscillator.frequency.value = freq;
        oscillator.start(this.audioCtx.currentTime + delay);
        oscillator.stop(this.audioCtx.currentTime + delay + time);
    }
}