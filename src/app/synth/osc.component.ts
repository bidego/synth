import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterContentInit, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { SoundService, NoteModel } from '../services/sound.service';
import { OscConfig, WaveType } from '../services/presets';

const newLocal = 100;
@Component({
  selector: 'osc-component',
  templateUrl: './osc.component.html',
  styleUrls: ['./osc.component.css']
})
export class OscComponent implements OnInit, AfterContentInit, AfterViewInit, OnDestroy {
    public version:String = "0.1v";
    private static COUNT:number = 0;
    private osc: OscillatorNode;
    private gainNode: GainNode;
    private frequencyValue:number;
    private volumeValue:number;
    waveType;
    // Configuracion inicial (presets), se aplica cuando la vista esta lista
    public config: OscConfig;
    private keySub: Subscription;
    @ViewChild("osc", { static: false })
    private me:ElementRef;
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
    @ViewChild("note", { static: false })
    private noteSelect:ElementRef;
    @ViewChild("sine", { static: false })
    private sine:ElementRef;
    @ViewChild("square", { static: false })
    private square:ElementRef;
    @ViewChild("triangle", { static: false })
    private triangle:ElementRef;
    @ViewChild("sawtooth", { static: false })
    private sawtooth:ElementRef;
    
    private triggerKeyValue:String;
    public notes: Array<NoteModel>;
    public keys: Array<String>;

    constructor(private audioCtx:AudioContext, private soundService: SoundService) {
        OscComponent.increaseCount();
        this.notes = this.soundService.notes;
        this.keys = [ "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l"];
    }
    ngOnInit() {
    }
    ngAfterContentInit() {
        this.initializeOscilator();
        this.keySub = this.soundService.listenKey.subscribe(e => this.handleKeys(e));
    }
    ngAfterViewInit() {
        if (this.config)
            this.applyConfig(this.config);
    }
    ngOnDestroy() {
        this.keySub.unsubscribe();
        this.disconnectGainNode(null);
        try {
            this.osc.stop();
        } catch (e) {
            // Nunca arranco
        }
        OscComponent.COUNT--;
    }
    applyConfig(c: OscConfig) {
        this.setWaveType(c.wave);
        this.frequencyValue = c.frequency;
        this.sliderFrequency.nativeElement.value = c.frequency;
        this.frequencyView.nativeElement.value = c.frequency;
        this.osc.frequency.value = c.frequency;
        this.volumeValue = this.limit(c.volume);
        this.sliderVolume.nativeElement.value = this.volumeValue;
        this.volumeView.nativeElement.value = this.volumeValue;
        this.gainNode.gain.value = this.volumeValue;
        this.triggerKey.nativeElement.value = c.key;
        this.triggerKeyValue = c.key;
        const note = this.notes.find(n => Math.abs(n.frequency - c.frequency) < 0.01);
        if (note)
            this.noteSelect.nativeElement.value = String(note.frequency);
    }
    static increaseCount() {
        OscComponent.COUNT++;
    }
    static getCount() {
        return OscComponent.COUNT || 0;
    }

    toggleWaveType(event) {
        this.setWaveType(event.srcElement.value);
    }

    setWaveType(type: WaveType) {
        const waveTypes = [ this.sine, this.sawtooth, this.triangle, this.square];
        this.osc.type = type;
        waveTypes.forEach( function waveTypeReducer(el) {
            el.nativeElement.setAttribute("style", type == el.nativeElement.value ? "color: #F00" : "");
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
        this.gainNode.connect(this.soundService.analyser);
        this.me.nativeElement.setAttribute("style", "background-color: #F88")
    }
    disconnectGainNode(event) {
        try {
            this.gainNode.disconnect(this.soundService.analyser)
            this.me.nativeElement.setAttribute("style", "")
        } catch {
            // TODO: Se dispara el callback handleKeys al inicio
        }
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
        if (e && e.key) {
            let triggerValue = this.triggerKeyValue || this.triggerKey ? this.triggerKey.nativeElement.selectedOptions[0].value : null;
            if (e.type == "keydown") {
                if (e.key == triggerValue) {
                    this.connectGainNode(e);
                }
            } else {
                if (e.key == triggerValue) 
                    this.disconnectGainNode(null);
            }
        }
    }
    handleKeyChange(event) {
        this.triggerKeyValue = event.srcElement.value;
    }
    handleNoteChange(event) {
        let { value:note } = event.srcElement;
        this.sliderFrequency.nativeElement.value = note;
        this.frequencyView.nativeElement.value = note;
        
    }
    limit = n => n >= 0.5 ? 0.5 : n;

}
