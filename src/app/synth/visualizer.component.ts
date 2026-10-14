import { Component, ElementRef, NgZone, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';
import { SoundService } from '../services/sound.service';
import { UiService } from '../services/ui.service';

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
    private clock = 0;
    private onResize = () => this.resize();

    constructor(private soundService: SoundService, private zone: NgZone, private ui: UiService) {}

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
        this.clock += 0.016;
        // Sin sonido el arte no debe quedar plano: 1 = silencio total, 0 = suena con fuerza
        const ambient = Math.max(0, Math.min(1, 1 - energy * 25));

        // Fade en vez de clear: deja estela
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.ui.zen ? 'rgba(0, 0, 0, 0.17)' : 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'lighter';

        this.drawSpectrum(width, height);
        // Onda principal, replicada y espejada con distintos colores
        // En modo limpio el arte es lo unico visible: mas grueso y brillante
        const boost = this.ui.zen ? 1.2 : 1;
        this.drawWave(width, height, 0, 1, this.hue, (4 + energy * 16) * boost);
        this.drawWave(width, height, 0, -1, this.hue + 120, (2 + energy * 8) * boost);
        this.drawWave(width, height, height * 0.25, 0.5, this.hue + 240, 2);
        if (ambient > 0.02)
            this.drawAmbient(width, height, ambient);
    }

    /**
     * Olas suaves que respiran solas. Se desvanecen cuando entra sonido real,
     * que pasa a dibujar la onda y el espectro verdaderos.
     */
    private drawAmbient(width: number, height: number, amount: number) {
        const { ctx } = this;
        const t = this.clock;
        const boost = this.ui.zen ? 1.4 : 1;
        // Barras de espectro sinteticas, apenas visibles
        const bars = 48;
        const barWidth = width / bars;
        for (let i = 0; i < bars; i++) {
            const h = (0.35 + 0.35 * Math.sin(t * 0.9 + i * 0.35) * Math.sin(t * 0.37 + i * 0.11)) * height * 0.22 * amount;
            ctx.fillStyle = `hsla(${(this.hue + i * 5) % 360}, 90%, 55%, ${0.10 * amount * boost})`;
            ctx.fillRect(i * barWidth, height - h, barWidth - 2, h);
            ctx.fillRect(i * barWidth, 0, barWidth - 2, h);
        }
        // Tres olas superpuestas con fases distintas
        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            const hue = this.hue + layer * 110;
            const breathe = 0.55 + 0.45 * Math.sin(t * 0.5 + layer * 2);
            for (let x = 0; x <= width; x += 6) {
                const nx = x / width;
                const y = height / 2 + (layer - 1) * height * 0.12 + height * 0.11 * amount * breathe * (
                    Math.sin(nx * 7 + t * (0.8 + layer * 0.3) + layer) * 0.6 +
                    Math.sin(nx * 17 - t * 1.3 + layer * 3) * 0.25 +
                    Math.sin(nx * 3 + t * 0.4) * 0.4);
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.lineWidth = (3 - layer * 0.6) * boost;
            ctx.strokeStyle = `hsla(${hue % 360}, 100%, 62%, ${0.75 * amount})`;
            ctx.shadowBlur = 18;
            ctx.shadowColor = `hsl(${hue % 360}, 100%, 60%)`;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
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
        // Con la mezcla "lighter" el brillo se acumula: a volumen alto el centro quedaba blanco puro
        ctx.globalAlpha = this.ui.zen ? 0.6 : 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
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
            ctx.fillStyle = `hsla(${(this.hue + i * 4) % 360}, 100%, 50%, ${this.ui.zen ? 0.34 : 0.2})`;
            // Espejado arriba y abajo
            ctx.fillRect(i * barWidth, height - h, barWidth - 2, h);
            ctx.fillRect(i * barWidth, 0, barWidth - 2, h);
        }
    }
}
