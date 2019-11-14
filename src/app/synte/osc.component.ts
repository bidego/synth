import { Component, OnInit, ViewChild, ElementRef, AfterContentInit } from '@angular/core';

const newLocal = 100;
@Component({
  selector: 'osc-component',
  templateUrl: './osc.component.html',
  styleUrls: ['./osc.component.css']
})
export class OscComponent implements OnInit, AfterContentInit {
    version = "0.1v";
    private static COUNT = 0;
    private osc;
    slider;
    volume;
    gainNode;
    frequencyValue;
    volumeValue;
    waveType;
    @ViewChild("frequencyView", { static: false })
    private frequencyView:ElementRef;
    @ViewChild("volumeView", { static: false })
    private volumeView:ElementRef;
    @ViewChild("sliderFrequency", { static: false })
    private sliderFrequency:ElementRef;
    @ViewChild("sliderVolume", { static: false })
    private sliderVolume:ElementRef;
    @ViewChild("play", { static: false })
    private play:ElementRef;
    @ViewChild("stop", { static: false })
    private stop:ElementRef;
    @ViewChild("sine", { static: false })
    private sine:ElementRef;
    @ViewChild("square", { static: false })
    private square:ElementRef;
    @ViewChild("triangle", { static: false })
    private triangle:ElementRef;
    @ViewChild("sawtooth", { static: false })
    private sawtooth:ElementRef;

    constructor(private audioCtx:AudioContext) {
        OscComponent.increaseCount();
    }
    ngOnInit() {
        this.initializeOscilator();
    }
    static increaseCount() {
        OscComponent.COUNT++;
    }
    static getCount() {
        return OscComponent.COUNT || 0;
    }

    toggleWaveType(event) {
        let { srcElement } = event;
        const waveTypes = [ this.sine, this.sawtooth, this.triangle, this.square];
        this.osc.type = srcElement.value;
        waveTypes.forEach( el => {
            if (srcElement.value == el.nativeElement.value) 
                el.nativeElement.setAttribute("style", "color: #F00");
            else 
                el.nativeElement.setAttribute("style", "");
        });
    }
    ngAfterContentInit(){
    }

    connectGainNode(event) {
        try {
            this.osc.start();
        } catch (e) {
            // No hacer nada, ya esta corriendo el clock. Mejorar
        }
        this.gainNode.connect(this.audioCtx.destination)
    }
    disconnectGainNode(event) {
        this.gainNode.disconnect(this.audioCtx.destination)
    }
    initializeOscilator(freq = 500, vol = 0.1) {
        console.log("Oscilator Initialized");
        this.gainNode = this.audioCtx.createGain();
        this.osc = this.audioCtx.createOscillator();
        this.osc.type = this.waveType || 'sine';
        this.osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        this.osc.connect(this.gainNode);
        this.gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
    handleFrequency(e) {
        this.frequencyValue = e.value || e.srcElement.value;
        if (e.srcElement.range != "range")
            this.sliderFrequency.nativeElement.value = this.frequencyValue;
        else
            this.frequencyView.nativeElement.value = this.frequencyValue
        this.osc.frequency.setValueAtTime(this.frequencyValue, this.audioCtx.currentTime);
    }
    handleVolume(e) {
        let value = e.value || e.srcElement.value
        this.volumeValue = this.limit(value);
        if (e.srcElement.type != "range")
            this.sliderVolume.nativeElement.value = this.volumeValue;
        else
            this.volumeView.nativeElement.value = this.volumeValue
        this.gainNode.gain.setValueAtTime(this.volumeValue, this.audioCtx.currentTime);
    }
    limit = n => n >= 0.5 ? 0.5 : n;
}
