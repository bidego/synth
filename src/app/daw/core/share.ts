/**
 * Enlaces para compartir una sesion: el proyecto va dentro del hash de la URL (lo que sigue a `#`),
 * asi que no hace falta ningun servidor. Formato del hash:  #s=<tipo><datos>
 *   tipo "z": JSON comprimido (deflate-raw) y codificado en base64url
 *   tipo "j": JSON sin comprimir, base64url (navegadores sin CompressionStream)
 * El contenido de un enlace NO es confiable: se descomprime con un tope de tamano.
 */

export const SHARE_PREFIX = '#s=';
// Tope de lo que se acepta al descomprimir: protege de "bombas" (unos pocos KB que se expanden a GB)
export const MAX_SHARE_BYTES = 12 * 1024 * 1024;
// Mas largo que esto no entra en la mayoria de los chats y correos
export const SHARE_SOFT_LIMIT = 60000;

const hasCompression = (): boolean => typeof (window as any).CompressionStream == 'function'
    && typeof (window as any).DecompressionStream == 'function';

function toBase64Url(bytes: Uint8Array): string {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK)
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}

async function pipe(bytes: Uint8Array, stream: any, limit: number): Promise<Uint8Array> {
    const reader = new (window as any).Response((new Blob([bytes]) as any).stream().pipeThrough(stream)).body.getReader();
    const chunks: Array<Uint8Array> = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.length;
        if (total > limit) {
            reader.cancel();
            throw new Error('El enlace se expande a demasiado tamano');
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
}

/** Texto del hash (sin el prefijo) para un proyecto. */
export async function encodeShare(json: string): Promise<string> {
    const raw = new TextEncoder().encode(json);
    if (!hasCompression())
        return 'j' + toBase64Url(raw);
    const packed = await pipe(raw, new (window as any).CompressionStream('deflate-raw'), MAX_SHARE_BYTES);
    return 'z' + toBase64Url(packed);
}

/** El proyecto (objeto sin validar) de un hash. Lanza un Error con un mensaje para el usuario si no sirve. */
export async function decodeShare(payload: string): Promise<any> {
    if (!payload || !/^[zj][A-Za-z0-9_-]+$/.test(payload))
        throw new Error('El enlace no tiene el formato esperado');
    let bytes: Uint8Array;
    try {
        bytes = fromBase64Url(payload.slice(1));
    } catch (e) {
        throw new Error('El enlace esta danado o incompleto');
    }
    if (payload[0] == 'z') {
        if (!hasCompression())
            throw new Error('Este navegador no puede abrir enlaces comprimidos (usa uno mas nuevo o pedi el archivo .json)');
        try {
            bytes = await pipe(bytes, new (window as any).DecompressionStream('deflate-raw'), MAX_SHARE_BYTES);
        } catch (e) {
            throw new Error(e && /tamano/.test(e.message) ? e.message : 'El enlace esta danado o incompleto');
        }
    } else if (bytes.length > MAX_SHARE_BYTES) {
        throw new Error('El enlace es demasiado grande');
    }
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        throw new Error('El contenido del enlace no es una sesion valida');
    }
}
