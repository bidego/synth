class Oscilator {

    static count = 0;
    constructor() {
        this.audioCtx,this.osc, this.gainNode;
        Oscilator.increaseCount();
        this.id = Oscilator.getCount();
        this.renderView();
    }

    static increaseCount() {
        Oscilator.count ++;
    }

    static getCount() {
        return Oscilator.count || 0;
    }

    renderView() {
        this.container = document.createElement("div");
        this.container.innerHTML = this.getView();
        let body = document.querySelector("body");
        console.log(body)
        body.appendChild(this.container);
        this.addListeners();
    }
    addListeners() {
        this.slider = Get("frequencySlider" + Oscilator.getCount());
        this.volume = Get("volumeSlider" + Oscilator.getCount());
        this.play = Get("play" + Oscilator.getCount());
        this.stop = Get("stop" + Oscilator.getCount());

        this.oscType = {
            square: Get("square" + Oscilator.getCount()),
            sine: Get("sine" + Oscilator.getCount()),
            sawtooth: Get("sawtooth" + Oscilator.getCount()),
            triangle: Get("triangle" + Oscilator.getCount())
        }
        for(let e in this.oscType) {
            this.oscType[e].addEventListener("click", function(el) {
                this.waveType = e;
                this.osc.type = this.waveType;
                console.log(el);
                Object.keys(this.oscType).forEach(x=>this.oscType[x].setAttribute("style",""))
                el.srcElement.setAttribute("style", "color:#F00")
            }.bind(this));
        }
        this.stop.addEventListener("click", function(e) {
            this.osc.stop();
        }.bind(this))
        this.play.addEventListener("click", function(e) {
            this.initializeOscilator(this.slider.value, this.volume.value/1000);
            this.osc.start();
        }.bind(this))
        this.slider.addEventListener("mousedown", function(e) {
            this.slider.addEventListener("mousemove", this.handleFrequence.bind(this), true);
        }.bind(this))
        this.slider.addEventListener("mouseup", function(e){
            this.slider.removeEventListener("mousemove", this.handleFrequence.bind(this), true);
        }.bind(this))

        this.volume.addEventListener("mousedown", function(e) {
            this.volume.addEventListener("mousemove", this.handleVolume.bind(this), true);
        }.bind(this))
        this.volume.addEventListener("mouseup", function(e){
            this.volume.removeEventListener("mousemove", this.handleVolume.bind(this), true);
        }.bind(this))
    }

    getView() {
        return `<div class="containerFrequency">
            <input class="slider sliderFrequency" type="range" min="20" max="1000" value="600" id="frequencySlider${Oscilator.getCount()}">
            <div class="botonera">
                <button id="play${Oscilator.getCount()}">&#9658;</button>
                <button id="stop${Oscilator.getCount()}">&#9632;</button>
            </div>
            <div class="oscType">
                <button style="color:#F00" id="sine${Oscilator.getCount()}">sine</button>
                <button id="square${Oscilator.getCount()}">square</button>
                <button id="sawtooth${Oscilator.getCount()}">sawtooth</button>
                <button id="triangle${Oscilator.getCount()}">triangle</button>
            </div>
            <div>
                <div id="volumeView${Oscilator.getCount()}"></div>
                <div id="frequencyView${Oscilator.getCount()}"></div>
            </div>
        </div>
        <input class="slider sliderVolume" orient="vertical" type="range" min="0" max="500" value="100" id="volumeSlider${Oscilator.getCount()}">`;
    }

    initializeOscilator(freq = 500, vol = 0.1) {
        console.log("Oscilator Initialized");
        this.audioCtx = new AudioContext();
        this.gainNode = this.audioCtx.createGain();
        this.osc = this.audioCtx.createOscillator();
        this.osc.type = this.waveType || 'sine';
        this.osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        this.osc.connect(this.gainNode);
        this.gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        this.gainNode.connect(this.audioCtx.destination);
        Get(`frequencyView${this.id}`).innerHTML = `${freq}hz`;
        Get(`volumeView${this.id}`).innerHTML = `${vol}db`;
    }
    handleFrequence(e) {
        this.frequencyValue = e.srcElement.value;
        this.osc.frequency.setValueAtTime(this.frequencyValue, this.audioCtx.currentTime);
        Get(`frequencyView${this.id}`).innerHTML = `${this.frequencyValue}hz`;
    }
    handleVolume(e) {
        this.volumeValue = this.limit(e.srcElement.value/1000);
        this.gainNode.gain.setValueAtTime(this.volumeValue, this.audioCtx.currentTime);
        Get(`volumeView${this.id}`).innerHTML = `${this.volumeValue}db`;
    }

    limit = n => n >= 0.5 ? 0.5 : n;

}
