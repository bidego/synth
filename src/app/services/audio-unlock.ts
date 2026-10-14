// Un WAV de medio segundo de silencio (8 kHz, 8 bits, mono) para mantener viva la sesion de audio
function silentWavUrl(): string {
    const rate = 8000, frames = rate / 2;
    const buf = new ArrayBuffer(44 + frames);
    const v = new DataView(buf);
    const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); v.setUint32(4, 36 + frames, true); text(8, 'WAVE'); text(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    text(36, 'data'); v.setUint32(40, frames, true);
    new Uint8Array(buf, 44).fill(128);   // 128 = silencio en PCM de 8 bits
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Desbloqueo de audio para Safari / iOS. El navegador crea el AudioContext "suspendido" y solo lo
 * deja arrancar dentro de un gesto del usuario, y en iOS ese gesto tiene que ser `click` o `touchend`
 * (`pointerdown` / `touchstart` no cuentan). Ademas el interruptor de silencio del iPhone apaga el
 * Web Audio de las paginas aunque el navegador muestre el parlante.
 */
export class AudioUnlock {
    private silent: HTMLAudioElement;

    constructor(private ctx: AudioContext) {
        ['touchend', 'pointerup', 'click', 'keydown'].forEach(type =>
            document.addEventListener(type, () => this.unlock(), { capture: true, passive: true }));
    }

    /** Se llama desde un gesto. Es barato: no hace nada si ya esta todo andando. */
    unlock() {
        // Que el interruptor de silencio no apague el audio (Safari 16.4+)
        const session = (navigator as any).audioSession;
        if (session) {
            try {
                if (session.type !== 'playback')
                    session.type = 'playback';
            } catch (e) {}
        } else {
            this.playSilentElement();
        }
        if (this.ctx.state !== 'running') {
            const resumed = this.ctx.resume();
            if (resumed && resumed.catch)
                resumed.catch(() => {});
            // Truco clasico de iOS: reproducir un buffer vacio dentro del gesto
            try {
                const src = this.ctx.createBufferSource();
                src.buffer = this.ctx.createBuffer(1, 1, 22050);
                src.connect(this.ctx.destination);
                src.start(0);
            } catch (e) {}
        }
    }

    // Sin audioSession, iOS trata a la pagina como "reproduciendo medios" si hay un <audio> sonando
    // (aunque sea silencio), y asi ignora el interruptor de silencio
    private playSilentElement() {
        try {
            if (!this.silent) {
                const el = document.createElement('audio');
                el.src = silentWavUrl();
                el.loop = true;
                el.setAttribute('playsinline', '');
                el.setAttribute('aria-hidden', 'true');
                this.silent = el;
            }
            if (this.silent.paused) {
                const played = this.silent.play();
                if (played && played.catch)
                    played.catch(() => {});
            }
        } catch (e) {}
    }
}
