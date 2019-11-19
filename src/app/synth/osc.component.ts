import { Component, OnInit, ViewChild, ElementRef, AfterContentInit, OnChanges, SimpleChange, SimpleChanges, Output, Input, AfterViewInit } from '@angular/core';
import { SoundService, NoteModel } from '../services/sound.service';
import { SocketService } from '../services/socket.service';
import { Event } from '../models/events.model';
import { OscModel } from '../models/osc.model';
import { ThrowStmt } from '@angular/compiler';

@Component({
  selector: 'osc-component',
  templateUrl: './osc.component.html',
  styleUrls: ['./osc.component.css']
})
export class OscComponent implements OnInit, AfterContentInit, AfterViewInit {
    public version:String = "0.1v";
    private static COUNT:number = 0;
    private osc: OscillatorNode;
    private gainNode: GainNode;

    private oscParams: OscModel = new OscModel();

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

    ioConnection: any;

    constructor(private audioCtx:AudioContext,
        private soundService: SoundService,
        private socket$: SocketService) {
        OscComponent.increaseCount();
        this.oscParams.id = OscComponent.getCount().toString();
        this.notes = this.soundService.notes;
        this.keys = [ "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d", "f", "g", "h", "j", "k", "l"];
    }
    ngOnInit() {
        this.initSocketEvents();
    }
    private initSocketEvents(): void {
        this.socket$.onEvent(Event.NOTIFY_OSC_CHANGE)
        .subscribe((msg) => {
            let { data:osc } = msg.body.feed;
            if (osc.id == this.oscParams.id) {
                this.oscParams = osc
                this.digestFrequency();
                this.digestVolume();
                this.digestWaveType();
            }
        });
        this.socket$.onEvent(Event.NOTIFY_KEY_EVENT)
        .subscribe((msg) => {
            this.digesKeys(msg.data);
        });

    }
    
    ngAfterContentInit() {
        this.initializeOscilator();
        this.soundService.listenKey.subscribe(e => this.handleKeys(e));
    }
    ngAfterViewInit() {
        this.oscParams.hz = this.sliderFrequency.nativeElement.value;
        this.oscParams.gain = this.sliderVolume.nativeElement.value
        this.oscParams.waveType = this.osc.type;
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
        this.osc.type = this.oscParams.waveType = srcElement.value;
        waveTypes.forEach( function waveTypeReducer(el) {
            if (srcElement.value == el.nativeElement.value) 
                el.nativeElement.setAttribute(...selected);
            else 
                el.nativeElement.setAttribute(...deselected);
        });
        this.socket$.emit(Event.OSC_CHANGE, this.oscParams);
    }
    digestWaveType() {
        let { waveType:type } = this.oscParams;
        const selected = [ "style", "color: #F00" ];
        const deselected = [ "style", "" ];
        const waveTypes = [ this.sine, this.sawtooth, this.triangle, this.square];
        this.osc.type = type;
        waveTypes.forEach( function waveTypeReducer(el) {
            if (type == el.nativeElement.value) 
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
        this.gainNode.connect(this.audioCtx.destination);
        this.me.nativeElement.setAttribute("style", "background-color: #F88")
    }
    disconnectGainNode(event) {
        try {
            this.gainNode.disconnect(this.audioCtx.destination)
            this.me.nativeElement.setAttribute("style", "")
        } catch {
            // TODO: Se dispara el callback handleKeys al inicio
        }
    }
    initializeOscilator() {
        console.log("Oscilator Initialized");
        this.gainNode = this.audioCtx.createGain();
        this.osc = this.audioCtx.createOscillator();
        this.osc.type = this.oscParams.waveType || 'sine';
        this.osc.connect(this.gainNode);
    }

    handleFrequency(e) {
        console.log(e)
        this.oscParams.hz = e.value || e.hz || e.srcElement.value;
        if (e.srcElement.type != "range")
            this.sliderFrequency.nativeElement.value = this.oscParams.hz;
        else    
            this.frequencyView.nativeElement.value = this.oscParams.hz;
        this.osc.frequency.setValueAtTime(this.oscParams.hz, this.audioCtx.currentTime);
        this.socket$.emit(Event.OSC_CHANGE, this.oscParams);
    }
    digestFrequency() {
        this.sliderFrequency.nativeElement.value = this.oscParams.hz;
        this.frequencyView.nativeElement.value = this.oscParams.hz;
        this.osc.frequency.setValueAtTime(this.oscParams.hz, this.audioCtx.currentTime);
    }

    handleVolume(e) {
        let value = e.value || e.srcElement.value
        this.oscParams.gain = this.limit(value);
        if (e.srcElement.type != "range")
            this.sliderVolume.nativeElement.value = this.oscParams.gain;
        else
            this.volumeView.nativeElement.value = this.oscParams.gain
        this.gainNode.gain.setValueAtTime(this.oscParams.gain, this.audioCtx.currentTime);
        this.socket$.emit(Event.OSC_CHANGE, this.oscParams);
    }
    digestVolume() {
        this.sliderVolume.nativeElement.value = this.oscParams.gain;
        this.volumeView.nativeElement.value = this.oscParams.gain
        this.gainNode.gain.setValueAtTime(this.oscParams.gain, this.audioCtx.currentTime);
    }
    handleKeys(e:KeyboardEvent) {
        if (e && e.key) {
            let triggerValue = this.triggerKeyValue || this.triggerKey ? this.triggerKey.nativeElement.selectedOptions[0].value : null;
            if (e.key == triggerValue) {
                if (e.type == "keydown") {
                    this.connectGainNode(e);
                } else {
                    this.disconnectGainNode(null);
                }
                this.socket$.emit(Event.KEY_EVENT, { type: e.type, key: e.key});
            }
        }
    }
    digesKeys(e: {type:string,key:string}) {
        let triggerValue = this.triggerKeyValue || this.triggerKey ? this.triggerKey.nativeElement.selectedOptions[0].value : null;
        if (e.key == triggerValue) {
            if (e.type == "keydown") {
                this.connectGainNode(e);
            }else {
                this.disconnectGainNode(null);
            }
            setTimeout(() => {
                this.socket$.emit(Event.KEY_EVENT, { type: e.type, key: e.key});
            }, Math.floor(1000/60*this.socket$.tempo));
            
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
