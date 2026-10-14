/** Catalogo General MIDI y credito de los bancos de sonido. */

export interface BankFont {
    id: string;        // nombre usado en la URL de los datos
    label: string;
    credit: string;
    kits: boolean;     // trae baterias GM
}

// Banco propio: los datos de muestras (formato WebAudioFont, S. Surikov) viven en src/assets/sounds y se sirven
// desde la misma app, sin depender de servidores externos. Se regeneran con scripts/fetch-sounds.sh.
export const BANK_BASE_URL = 'assets/sounds';

export const BANK_FONTS: Array<BankFont> = [
    { id: 'FluidR3_GM', label: 'FluidR3 GM', credit: 'FluidR3 GM SoundFont, (c) 2000-2002, 2008 Frank Wen (licencia MIT)', kits: true },
    { id: 'GeneralUserGS', label: 'GeneralUser GS', credit: 'GeneralUser GS, S. Christian Collins', kits: false }
];

export const FAMILIES: Array<string> = ["Piano", "Chromatic Percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth Lead", "Synth Pad", "Synth Effects", "Ethnic", "Percussive", "Sound Effects"];

/** Los 128 instrumentos GM, por numero de programa (0..127). */
export const GM_PROGRAMS: Array<string> = ["Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-Tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet", "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer", "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion", "Acoustic Guitar Nylon", "Acoustic Guitar Steel", "Electric Guitar Jazz", "Electric Guitar Clean", "Electric Guitar Muted", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics", "Acoustic Bass", "Electric Bass Finger", "Electric Bass Pick", "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2", "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani", "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs", "Synth Choir", "Orchestra Hit", "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2", "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet", "Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina", "Lead 1 Square", "Lead 2 Sawtooth", "Lead 3 Calliope", "Lead 4 Chiff", "Lead 5 Charang", "Lead 6 Voice", "Lead 7 Fifths", "Lead 8 Bass  Lead", "Pad 1 New Age", "Pad 2 Warm", "Pad 3 Polysynth", "Pad 4 Choir", "Pad 5 Bowed", "Pad 6 Metallic", "Pad 7 Halo", "Pad 8 Sweep", "Fx 1 Rain", "Fx 2 Soundtrack", "Fx 3 Crystal", "Fx 4 Atmosphere", "Fx 5 Brightness", "Fx 6 Goblins", "Fx 7 Echoes", "Fx 8 Scifi", "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bagpipe", "Fiddle", "Shanai", "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal", "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot"];

export const familyOf = (program: number): number => Math.floor(program / 8);

export interface DrumKit {
    id: number;        // variacion de kit en los datos
    label: string;
}
export const DRUM_KITS: Array<DrumKit> = [
    { id: 0, label: 'Standard' },
    { id: 8, label: 'Room' },
    { id: 16, label: 'Power' },
    { id: 24, label: 'Electronic' },
    { id: 25, label: 'TR-808' }
];

export const KIT_FIRST_NOTE = 35;
export const KIT_LAST_NOTE = 81;
// El teclado de notas se mapea al kit GM con midi - 12, asi la fila de abajo (Do3) arranca en el bombo (36)
export const KIT_NOTE_OFFSET = 12;

/** Nombre corto de cada pieza GM (35..81) para rotular el teclado. */
export const GM_DRUM_SHORT: { [note: number]: string } = {
    35: 'Kick 2', 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 40: 'Snr 2', 41: 'Tom 1', 42: 'HH', 43: 'Tom 2',
    44: 'HH ped', 45: 'Tom 3', 46: 'HH open', 47: 'Tom 4', 48: 'Tom 5', 49: 'Crash', 50: 'Tom 6', 51: 'Ride',
    52: 'China', 53: 'Bell', 54: 'Tamb', 55: 'Splash', 56: 'Cowbell', 57: 'Crash 2', 58: 'Slap', 59: 'Ride 2',
    60: 'Bongo', 61: 'Bongo L', 62: 'Conga', 63: 'Conga H', 64: 'Conga L', 65: 'Timb', 66: 'Timb L', 67: 'Agogo',
    68: 'Agogo L', 69: 'Cabasa', 70: 'Maracas', 71: 'Whistle', 72: 'Whistle L', 73: 'Guiro', 74: 'Guiro L',
    75: 'Claves', 76: 'Block', 77: 'Block L', 78: 'Cuica', 79: 'Cuica O', 80: 'Triang', 81: 'Triang O'
};

/**
 * Instrumentos que se apagan solos aunque se mantenga la tecla (piano, percusion melodica, guitarras,
 * bajos, pizzicato, arpa, timbales). El resto (cuerdas, vientos, organos, pads...) se sostiene mientras
 * la tecla este apretada: usan el loop de la muestra sin caida.
 */
export const decaysNaturally = (program: number): boolean => {
    const family = familyOf(program);
    return family == 0 || family == 1 || family == 3 || family == 4 || family == 14
        || program == 45 || program == 46 || program == 47;
};
