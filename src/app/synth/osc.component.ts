import { Component, OnInit, ViewChild, ElementRef, AfterContentInit } from '@angular/core';
import { SoundService } from '../services/sound.service';

const newLocal = 100;
@Component({
  selector: 'osc-component',
  templateUrl: './osc.component.html',
  styleUrls: ['./osc.component.css']
})
export class OscComponent implements OnInit, AfterContentInit {
    public version:String = "0.1v";
    private static COUNT:number = 0;
    private osc: OscillatorNode;
    private gainNode: GainNode;
    private frequencyValue:number;
    private volumeValue:number;
    waveType;
    @ViewChild("frequencyView", { static: false })
    private frequencyView:ElementRef;
    @ViewChild("volumeView", { static: false })
    private volumeView:ElementRef;
    @ViewChild("sliderFrequency", { static: false })
    private sliderFrequency:ElementRef;
    @ViewChild("sliderVolume", { static: false })
    private sliderVolume:ElementRef;
    @ViewChild("triggerKey", { static: false })
    private triggerKey:ElementRef;
    @ViewChild("sine", { static: false })
    private sine:ElementRef;
    @ViewChild("square", { static: false })
    private square:ElementRef;
    @ViewChild("triangle", { static: false })
    private triangle:ElementRef;
    @ViewChild("sawtooth", { static: false })
    private sawtooth:ElementRef;

    constructor(private audioCtx:AudioContext, private soundService: SoundService) {
        OscComponent.increaseCount();
    }
    ngOnInit() {
    }
    ngAfterContentInit() {
        this.initializeOscilator();
        this.soundService.listenKey.subscribe(e => this.handleKeys(e));
    }
    static increaseCount() {
        OscComponent.COUNT++;
    }
    static getCount() {
        return OscComponent.COUNT || 0;
    }

    toggleWaveType(event) {
        let { srcElement } = event;
        const selected = [ "style", "color: #F00" ];
        const deselected = [ "style", "" ];
        const waveTypes = [ this.sine, this.sawtooth, this.triangle, this.square];
        this.osc.type = srcElement.value;
        waveTypes.forEach( function waveTypeReducer(el) {
            if (srcElement.value == el.nativeElement.value) 
                el.nativeElement.setAttribute(...selected);
            else 
                el.nativeElement.setAttribute(...deselected);
        });
    }

    connectGainNode(event) {
        try {
            this.osc.frequency.setValueAtTime(this.sliderFrequency.nativeElement.value, this.audioCtx.currentTime);
            this.gainNode.gain.setValueAtTime(this.sliderVolume.nativeElement.value, this.audioCtx.currentTime);
            this.osc.start();
        } catch (e) {
            // No hacer nada, ya esta corriendo el clock. Mejorar
        }
        this.gainNode.connect(this.audioCtx.destination)
    }
    disconnectGainNode(event) {
        this.gainNode.disconnect(this.audioCtx.destination)
    }
    initializeOscilator() {
        console.log("Oscilator Initialized");
        this.gainNode = this.audioCtx.createGain();
        this.osc = this.audioCtx.createOscillator();
        this.osc.type = this.waveType || 'sine';
        this.osc.connect(this.gainNode);
    }

    handleFrequency(e) {
        this.frequencyValue = e.value || e.srcElement.value;
        if (e.srcElement.type != "range")
            this.sliderFrequency.nativeElement.value = this.frequencyValue;
        else
            this.frequencyView.nativeElement.value = this.frequencyValue;
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
    handleKeys(e:KeyboardEvent) {
        if (e && e.key && e.key && e.key == this.triggerKey.nativeElement.selectedOptions[0].value) {
            this.connectGainNode(e);
            setTimeout(this.disconnectGainNode.bind(this),100);
        }
    }
    handleNoteChange(event) {
        this.triggerKey.nativeElement.selectedOptions = [ event.srcElement ];
    }
    limit = n => n >= 0.5 ? 0.5 : n;

}
