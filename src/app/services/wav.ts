/** Codifica un AudioBuffer como WAV PCM de 16 bits (sin perdida). */
export function encodeWav(buffer: AudioBuffer): Blob {
    const channels = buffer.numberOfChannels;
    const frames = buffer.length;
    const bytes = frames * channels * 2;
    const out = new ArrayBuffer(44 + bytes);
    const view = new DataView(out);
    const text = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++)
            view.setUint8(offset + i, s.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, 36 + bytes, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);                          // tamano del bloque fmt
    view.setUint16(20, 1, true);                           // PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, bytes, true);

    const data = [];
    for (let ch = 0; ch < channels; ch++)
        data.push(buffer.getChannelData(ch));
    let offset = 44;
    for (let i = 0; i < frames; i++) {
        for (let ch = 0; ch < channels; ch++) {
            const s = Math.max(-1, Math.min(1, data[ch][i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([out], { type: 'audio/wav' });
}
