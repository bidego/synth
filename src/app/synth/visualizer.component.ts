import { Component, ElementRef, NgZone, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { SoundService } from '../services/sound.service';

@Component({
    selector: 'app-visualizer',
    template: '<canvas #canvas></canvas>',
    styles: [`
        canvas {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: -1;
            background: #000;
        }
    `]
})
export class VisualizerComponent implements AfterViewInit, OnDestroy {
    @ViewChild('canvas', { static: true })
    private canvasRef: ElementRef<HTMLCanvasElement>;
    private ctx: CanvasRenderingContext2D;
    private frameId: number;
    private wave: Uint8Array;
    private spectrum: Uint8Array;
    private hue = 0;
    private onResize = () => this.resize();

    constructor(private soundService: SoundService, private zone: NgZone) {}

    ngAfterViewInit() {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d');
        const analyser = this.soundService.analyser;
        this.wave = new Uint8Array(analyser.fftSize);
        this.spectrum = new Uint8Array(analyser.frequencyBinCount);
        this.resize();
        window.addEventListener('resize', this.onResize);
        // Fuera de la zona de Angular para no disparar change detection en cada frame
        this.zone.runOutsideAngular(() => this.draw());
    }

    ngOnDestroy() {
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
    }

    private resize() {
        const canvas = this.canvasRef.nativeElement;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    private draw = () => {
        this.frameId = requestAnimationFrame(this.draw);
        const { ctx } = this;
        const { width, height } = this.canvasRef.nativeElement;
        const analyser = this.soundService.analyser;
        analyser.getByteTimeDomainData(this.wave);
        analyser.getByteFrequencyData(this.spectrum);

        // Energia general: hace que la imagen reaccione al volumen
        let energy = 0;
        for (let i = 0; i < this.spectrum.length; i++) energy += this.spectrum[i];
        energy = energy / this.spectrum.length / 255;
        this.hue = (this.hue + 0.5 + energy * 4) % 360;

        // Fade en vez de clear: deja estela
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';

        this.drawSpectrum(width, height);
        // Onda principal, replicada y espejada con distintos colores
        this.drawWave(width, height, 0, 1, this.hue, 4 + energy * 16);
        this.drawWave(width, height, 0, -1, this.hue + 120, 2 + energy * 8);
        this.drawWave(width, height, height * 0.25, 0.5, this.hue + 240, 2);
    }

    private drawWave(width: number, height: number, offsetY: number, scale: number, hue: number, lineWidth: number) {
        const { ctx, wave } = this;
        const step = width / (wave.length - 1);
        ctx.beginPath();
        for (let i = 0; i < wave.length; i++) {
            const v = (wave[i] - 128) / 128;
            const x = i * step;
            const y = height / 2 + offsetY + v * height * 0.4 * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = `hsl(${hue % 360}, 100%, 60%)`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    private drawSpectrum(width: number, height: number) {
        const { ctx, spectrum } = this;
        const bars = 64;
        const barWidth = width / bars;
        const binsPerBar = Math.floor(spectrum.length / 4 / bars) || 1;
        for (let i = 0; i < bars; i++) {
            let sum = 0;
            for (let j = 0; j < binsPerBar; j++) sum += spectrum[i * binsPerBar + j];
            const h = (sum / binsPerBar / 255) * height * 0.5;
            ctx.fillStyle = `hsla(${(this.hue + i * 4) % 360}, 100%, 50%, 0.2)`;
            // Espejado arriba y abajo
            ctx.fillRect(i * barWidth, height - h, barWidth - 2, h);
            ctx.fillRect(i * barWidth, 0, barWidth - 2, h);
        }
    }
}
