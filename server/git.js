'use strict';
// Trabaja con el repositorio git usando el comando `git` (sin shell: los argumentos van como arreglo).
// El token nunca se escribe en la configuracion del repositorio ni en la linea de comandos: llega por GIT_ASKPASS,
// que lo lee de una variable de entorno que solo ve el proceso hijo.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

class Git {
    /**
     * @param {string} dir        carpeta del repositorio (se crea si no existe)
     * @param {object} opts       { remote, branch, token, authorName, authorEmail }
     */
    constructor(dir, opts) {
        this.dir = dir;
        this.remote = opts.remote || '';
        this.branch = opts.branch || 'main';
        this.token = opts.token || '';
        this.authorName = opts.authorName || 'Syntotec';
        this.authorEmail = opts.authorEmail || 'syntotec@localhost';
        this.askpass = path.join(path.dirname(dir), path.basename(dir) + '.askpass.sh');
    }

    /** Saca el token de cualquier texto que vaya a un log o a una respuesta. */
    scrub(text) {
        let out = String(text);
        if (this.token)
            out = out.split(this.token).join('***');
        // URLs con usuario:clave
        return out.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1***@');
    }

    run(args, { network = false, allowFail = false } = {}) {
        const env = Object.assign({}, process.env, {
            GIT_TERMINAL_PROMPT: '0',
            GIT_AUTHOR_NAME: this.authorName, GIT_AUTHOR_EMAIL: this.authorEmail,
            GIT_COMMITTER_NAME: this.authorName, GIT_COMMITTER_EMAIL: this.authorEmail
        });
        if (network && this.token) {
            env.GIT_ASKPASS = this.askpass;
            env.SYNTOTEC_GIT_TOKEN = this.token;
        }
        return new Promise((resolve, reject) => {
            execFile('git', args, { cwd: this.dir, env, timeout: 120000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err && !allowFail) {
                    const e = new Error('git ' + args[0] + ': ' + this.scrub((stderr || err.message || '').trim()).slice(0, 500));
                    e.code = err.code;
                    return reject(e);
                }
                resolve({ ok: !err, out: String(stdout).trim(), err: this.scrub(String(stderr).trim()) });
            });
        });
    }

    /** Prepara el repositorio: lo clona/inicializa y trae lo que haya en el remoto. */
    async init() {
        fs.mkdirSync(this.dir, { recursive: true });
        if (this.token) {
            fs.writeFileSync(this.askpass,
                '#!/bin/sh\ncase "$1" in\n  Username*) echo x-access-token ;;\n  *) echo "$SYNTOTEC_GIT_TOKEN" ;;\nesac\n', { mode: 0o700 });
        }
        if (!fs.existsSync(path.join(this.dir, '.git'))) {
            await this.run(['init']);
            await this.run(['symbolic-ref', 'HEAD', 'refs/heads/' + this.branch]);
        }
        await this.run(['config', 'user.name', this.authorName]);
        await this.run(['config', 'user.email', this.authorEmail]);
        if (this.remote) {
            const has = await this.run(['remote', 'get-url', 'origin'], { allowFail: true });
            if (!has.ok)
                await this.run(['remote', 'add', 'origin', this.remote]);
            else if (has.out !== this.remote)
                await this.run(['remote', 'set-url', 'origin', this.remote]);
            await this.fetchAndReset();
        }
    }

    /** Si el remoto ya tiene la rama, el repositorio local pasa a ser igual a ella (el remoto manda al arrancar). */
    async fetchAndReset() {
        const f = await this.run(['fetch', 'origin', this.branch], { network: true, allowFail: true });
        if (!f.ok) {
            // Un remoto vacio (sin la rama todavia) es normal en el primer arranque
            if (/couldn't find remote ref|no such ref|Couldn't find remote ref/i.test(f.err))
                return false;
            throw new Error('git fetch: ' + f.err.slice(0, 500));
        }
        await this.run(['checkout', '-B', this.branch, 'FETCH_HEAD']);
        return true;
    }

    async head() {
        const r = await this.run(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
        return r.ok ? r.out : '';
    }

    /** Agrega todo lo de `projects/`, y si hay cambios hace un commit. Devuelve true si hubo commit. */
    async commitAll(message) {
        await this.run(['add', '-A', '--', 'projects']);
        const diff = await this.run(['diff', '--cached', '--quiet'], { allowFail: true });
        if (diff.ok)
            return false;
        await this.run(['commit', '-q', '-m', message]);
        return true;
    }

    /** Sube la rama. Si el remoto avanzo (otro servidor o un humano), se rebasa y se reintenta una vez. */
    async push() {
        if (!this.remote)
            return { pushed: false, rebased: false };
        let r = await this.run(['push', 'origin', 'HEAD:refs/heads/' + this.branch], { network: true, allowFail: true });
        if (r.ok)
            return { pushed: true, rebased: false };
        const rb = await this.run(['pull', '--rebase', '--autostash', 'origin', this.branch], { network: true, allowFail: true });
        if (!rb.ok) {
            await this.run(['rebase', '--abort'], { allowFail: true });
            throw new Error('git pull --rebase: ' + rb.err.slice(0, 500));
        }
        r = await this.run(['push', 'origin', 'HEAD:refs/heads/' + this.branch], { network: true, allowFail: true });
        if (!r.ok)
            throw new Error('git push: ' + r.err.slice(0, 500));
        return { pushed: true, rebased: true };
    }

    /** Trae cambios del remoto (hechos por otros). Devuelve true si la rama avanzo. */
    async pull() {
        if (!this.remote)
            return false;
        const before = await this.head();
        const r = await this.run(['pull', '--rebase', '--autostash', 'origin', this.branch], { network: true, allowFail: true });
        if (!r.ok) {
            await this.run(['rebase', '--abort'], { allowFail: true });
            if (/couldn't find remote ref/i.test(r.err))
                return false;
            throw new Error('git pull: ' + r.err.slice(0, 500));
        }
        return (await this.head()) !== before;
    }
}

module.exports = { Git };
