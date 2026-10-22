/**
 * Logica pura de la Entrada de audio (sin Web Audio ni DOM): constraints de getUserMedia, cuenta de canales y mensajes de error.
 * Esta separada del modulo para poder probarla con Node.
 */

export const AUDIOIN_CHANNELS = 8;

export interface Chosen {
    channels: number;   // canales que se usan (1..8)
    total: number;      // canales que entrega la placa (puede ser mayor que 8)
    ignored: number;    // los que sobran y se ignoran
}

/** Cantidad valida de canales (entero >= 1) o 0. */
function valid(n: any): number {
    return typeof n == 'number' && isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

/**
 * Canales reales de la captura. `settings` es lo que dice track.getSettings().channelCount (puede faltar) y `node` lo que informa el
 * nodo de audio. Si el navegador devuelve mas canales de los que dice getSettings se usa el mayor; pero un 2 del nodo no cuenta
 * (es el valor por defecto que muchos navegadores informan aunque la fuente sea mono).
 */
export function chooseChannels(settings: any, node: any): Chosen {
    const s = valid(settings), n = valid(node);
    let total: number;
    if (!s)
        total = n || 1;
    else
        total = n > 2 && n > s ? n : s;
    return { channels: Math.min(AUDIOIN_CHANNELS, total), total, ignored: Math.max(0, total - AUDIOIN_CHANNELS) };
}

/** Texto de estado sobre los canales entregados (y el aviso si son pocos o sobran). */
export function channelsMessage(c: Chosen): { info: string; warning: string } {
    const info = 'La placa entrega ' + c.total + (c.total == 1 ? ' canal' : ' canales');
    const parts: Array<string> = [];
    if (c.total <= 2)
        parts.push('El navegador solo entrega ' + c.total + (c.total == 1 ? ' canal' : ' canales') + ' de esta placa (depende de la placa, el sistema y el navegador).');
    if (c.ignored > 0)
        parts.push('Se usan los primeros ' + AUDIOIN_CHANNELS + ' y se ignoran los otros ' + c.ignored + '.');
    return { info, warning: parts.join(' ') };
}

/**
 * Intentos de constraints, del mas completo al mas laxo. Se prueba el siguiente cuando falla uno (salvo por permiso denegado).
 * Solo constraints estandar; las propiedades sueltas son "ideal", asi que no deberian fallar por no cumplirse.
 */
export function constraintAttempts(deviceId: string, sampleRate: number): Array<{ constraints: any; label: string; fallbackDevice: boolean }> {
    const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    const full: any = { ...raw, channelCount: { ideal: AUDIOIN_CHANNELS }, latency: { ideal: 0 } };
    if (valid(sampleRate))
        full.sampleRate = { ideal: sampleRate };
    const withDev = (a: any) => deviceId ? { ...a, deviceId: { exact: deviceId } } : a;
    const list: Array<{ constraints: any; label: string; fallbackDevice: boolean }> = [
        { constraints: { audio: withDev(full) }, label: 'completo', fallbackDevice: false },
        { constraints: { audio: withDev({ ...raw }) }, label: 'sin canales ni latencia', fallbackDevice: false }
    ];
    if (deviceId) {
        list.push({ constraints: { audio: full }, label: 'entrada predeterminada', fallbackDevice: true });
        list.push({ constraints: { audio: { ...raw } }, label: 'entrada predeterminada, laxo', fallbackDevice: true });
    }
    list.push({ constraints: { audio: true }, label: 'basico', fallbackDevice: !!deviceId });
    return list;
}

/** Errores tras los que no tiene sentido reintentar con otros constraints. */
export function isFatalError(err: any): boolean {
    const n = errName(err);
    return n == 'NotAllowedError' || n == 'PermissionDeniedError' || n == 'SecurityError';
}

export function errName(err: any): string {
    return err && typeof err.name == 'string' ? err.name : '';
}

export interface Env {
    hasMediaDevices: boolean;
    secure: boolean;   // https o localhost
}

/** Por que getUserMedia no esta disponible (o '' si lo esta). */
export function unavailableMessage(env: Env): string {
    if (!env.secure)
        return 'El navegador solo permite usar la entrada de audio en paginas seguras (https o localhost). Abri la app desde una direccion https.';
    if (!env.hasMediaDevices)
        return 'Este navegador no permite acceder a la entrada de audio (no tiene mediaDevices.getUserMedia).';
    return '';
}

/** Mensaje claro para un error de getUserMedia. */
export function errorMessage(err: any): string {
    switch (errName(err)) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
        case 'SecurityError':
            return 'Permiso denegado para usar la entrada de audio. Habilitalo en el candado o el icono de microfono junto a la direccion del navegador (Permisos del sitio > Microfono > Permitir) y en el sistema (en Mac: Ajustes del Sistema > Privacidad y seguridad > Microfono, activa el navegador); despues toca "Activar entrada" de nuevo.';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'No se encontro ninguna entrada de audio. Conecta la placa o el microfono y toca "Activar entrada" de nuevo.';
        case 'NotReadableError':
        case 'TrackStartError':
        case 'AbortError':
            return 'No se pudo abrir la entrada: otra aplicacion o pestana la esta usando, o la placa no responde. Cerra lo que la use (o reconecta la placa) y proba de nuevo.';
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            return 'La entrada elegida no acepta la configuracion pedida. Proba con la entrada Predeterminada.';
        case 'TypeError':
            return 'El navegador rechazo el pedido de entrada de audio (' + (err && err.message || 'parametros invalidos') + ').';
        default:
            return 'No se pudo activar la entrada de audio' + (err && (err.message || err.name) ? ': ' + (err.message || err.name) : '') + '.';
    }
}
