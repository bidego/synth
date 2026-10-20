// Pruebas del motor de Poly Five (sin JUCE). Uso: pf_tests [--wav carpeta] [--calibrate] [--dump salida.f32 sonido nota cuadros]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>
#include "../engine/pf_engine.h"

using namespace pf;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; std::printf("  FALLA: "); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static const double SR = 44100.0;
typedef std::vector<float> Buf;

static Buf render(Engine& e, int n)
{
    Buf l(static_cast<size_t>(n), 0.f), r(static_cast<size_t>(n), 0.f);
    int done = 0;
    while (done < n) {
        const int len = std::min(n - done, 64 + (done / 64) % 5 * 90);
        e.process(l.data() + done, r.data() + done, len);
        done += len;
    }
    return l;
}

static float peak(const Buf& v, size_t from = 0, size_t to = size_t(-1))
{
    float p = 0;
    for (size_t i = from; i < v.size() && i < to; i++) p = std::max(p, std::fabs(v[i]));
    return p;
}

static float rms(const Buf& v, size_t from, size_t to)
{
    double s = 0; size_t n = 0;
    for (size_t i = from; i < v.size() && i < to; i++) { s += double(v[i]) * v[i]; n++; }
    return n ? float(std::sqrt(s / double(n))) : 0.f;
}

static double pitch(const Buf& v, size_t from, size_t len, double lo, double hi)
{
    double bestLag = 0, best = -1e30;
    for (double f = lo; f <= hi; f *= 1.0004) {
        const size_t lag = size_t(SR / f + 0.5);
        double c = 0;
        for (size_t i = from; i + lag < from + len && i + lag < v.size(); i++) c += double(v[i]) * v[i + lag];
        if (c > best) { best = c; bestLag = double(lag); }
    }
    return SR / bestLag;
}

static std::vector<double> spectrum(const Buf& v, size_t from, size_t n)
{
    std::vector<std::complex<double>> a(n);
    for (size_t i = 0; i < n; i++) {
        const double w = 0.5 - 0.5 * std::cos(2.0 * M_PI * double(i) / double(n - 1));
        a[i] = (from + i < v.size() ? double(v[from + i]) : 0.0) * w;
    }
    for (size_t i = 1, j = 0; i < n; i++) {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) std::swap(a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1) {
        const double ang = -2.0 * M_PI / double(len);
        const std::complex<double> wl(std::cos(ang), std::sin(ang));
        for (size_t i = 0; i < n; i += len) {
            std::complex<double> w(1);
            for (size_t k = 0; k < len / 2; k++) {
                const auto u = a[i + k], t = a[i + k + len / 2] * w;
                a[i + k] = u + t; a[i + k + len / 2] = u - t; w *= wl;
            }
        }
    }
    std::vector<double> p(n / 2);
    for (size_t i = 0; i < n / 2; i++) p[i] = std::norm(a[i]);
    return p;
}

static double brightness(const Buf& v, size_t from, size_t to)
{
    double d = 0, t = 0;
    for (size_t i = from + 1; i < to && i < v.size(); i++) { const double x = v[i] - v[i - 1]; d += x * x; t += double(v[i]) * v[i]; }
    return t > 0 ? std::sqrt(d / t) : 0.0;
}

static void writeWav(const std::string& path, const Buf& v)
{
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return;
    const uint32_t n = uint32_t(v.size()), bytes = n * 2, rate = uint32_t(SR);
    auto w32 = [&](uint32_t x) { std::fwrite(&x, 4, 1, f); };
    auto w16 = [&](uint16_t x) { std::fwrite(&x, 2, 1, f); };
    std::fwrite("RIFF", 1, 4, f); w32(36 + bytes); std::fwrite("WAVEfmt ", 1, 8, f);
    w32(16); w16(1); w16(1); w32(rate); w32(rate * 2); w16(2); w16(16); std::fwrite("data", 1, 4, f); w32(bytes);
    for (float x : v) { const int16_t s = int16_t(std::max(-1.f, std::min(1.f, x)) * 32767); std::fwrite(&s, 2, 1, f); }
    std::fclose(f);
}


static Engine fresh() { Engine e; e.prepare(SR); return e; }

// Patch limpio: solo el oscilador A en sierra, filtro abierto, contornos neutros, sin deriva
static Engine clean(int aOct = 2)
{
    Engine e = fresh();
    e.setDriftAmount(0.f);
    e.setParam(AOct, float(aOct)); e.setParam(ASaw, 1); e.setParam(APulse, 0);
    e.setParam(MixA, 1.f); e.setParam(MixB, 0.f); e.setParam(MixNoise, 0.f);
    e.setParam(Cutoff, 1.f); e.setParam(Resonance, 0.f); e.setParam(EnvAmt, 0.f); e.setParam(KbdTrack, 2);
    e.setParam(AAtk, 0.f); e.setParam(ADec, 0.3f); e.setParam(ASus, 1.f); e.setParam(Volume, 0.7f);
    return e;
}

static void testSilence()
{
    std::printf("silencio sin notas\n");
    Engine e = fresh();
    CHECK(peak(render(e, 8820)) < 1e-4f, "sale audio sin tocar nada");
}

static void testPitch()
{
    std::printf("altura: octavas y oscilador B\n");
    for (int oct = 0; oct <= 4; ++oct) {
        Engine e = clean(oct);
        e.noteOn(57, 0.5f);   // A3 = 220 Hz en 8'
        Buf r = render(e, 44100);
        const double expect = 220.0 * std::pow(2.0, oct - 2);
        const double f = pitch(r, 12000, 16000, expect * 0.8, expect * 1.25);
        CHECK(std::fabs(f / expect - 1.0) < 0.01, "octava %d: %.1f Hz (esperado %.1f)", oct, f, expect);
    }
    Engine e = clean(2);
    e.setParam(MixA, 0.f); e.setParam(MixB, 1.f); e.setParam(BOct, 2); e.setParam(BSaw, 1);
    e.noteOn(57, 0.5f);
    Buf r = render(e, 44100);
    const double f = pitch(r, 12000, 16000, 180.0, 280.0);
    CHECK(std::fabs(f / 220.0 - 1.0) < 0.01, "el oscilador B: %.1f Hz", f);
}

static void testPolyphony()
{
    std::printf("polifonia: cinco notas suenan a la vez y la sexta roba una voz\n");
    Engine e = clean(2);
    const int chord[5] = { 48, 52, 55, 58, 62 };
    for (int n : chord) e.noteOn(n, 0.5f);
    Buf r = render(e, 44100);
    const size_t n = 32768;
    auto p = spectrum(r, 8000, n);
    auto at = [&](double f) { const size_t k = size_t(f / SR * double(n) + 0.5); double m = 0; for (size_t j = k - 3; j <= k + 3; ++j) m = std::max(m, p[j]); return m; };
    double minRel = 1e30, total = 0;
    for (int note : chord) total += at(440.0 * std::pow(2.0, (note - 69) / 12.0));
    for (int note : chord) minRel = std::min(minRel, at(440.0 * std::pow(2.0, (note - 69) / 12.0)) / (total / 5.0));
    std::printf("  voces activas: %d; la nota mas debil esta a %.2f del promedio\n", e.activeVoices(), minRel);
    CHECK(e.activeVoices() == 5, "deberian sonar 5 voces (%d)", e.activeVoices());
    CHECK(minRel > 0.25, "falta alguna de las cinco notas");
    e.noteOn(65, 0.5f);   // la sexta
    Buf r2 = render(e, 22050);
    CHECK(e.activeVoices() == 5 && peak(r2) < 1.f, "la sexta nota deberia robar una voz sin pasar de 5");
    for (int note : { 48, 52, 55, 58, 62, 65 }) e.noteOff(note);
    render(e, 44100 * 3);
    CHECK(e.activeVoices() == 0, "quedaron voces sonando");
}

static void testAliasing()
{
    std::printf("aliasing\n");
    for (int pulse = 0; pulse < 2; ++pulse) {
        Engine e = clean(2);
        e.setParam(ASaw, pulse ? 0 : 1); e.setParam(APulse, pulse ? 1 : 0);
        e.noteOn(88, 0.5f);
        Buf r = render(e, 44100);
        const size_t n = 16384;
        auto p = spectrum(r, 10000, n);
        const double f0 = 440.0 * std::pow(2.0, (88 - 69) / 12.0);
        std::vector<char> harm(p.size(), 0);
        for (int h = 1; h * f0 < 21000.0; ++h) {
            const long c = long(h * f0 / SR * double(n) + 0.5);
            for (long k = c - 5; k <= c + 5; ++k) if (k >= 0 && k < long(p.size())) harm[size_t(k)] = 1;
        }
        double good = 0, bad = 0;
        for (size_t k = size_t(200.0 / SR * double(n)); k < size_t(20000.0 / SR * double(n)); ++k) (harm[k] ? good : bad) += p[k];
        const double db = 10.0 * std::log10(bad / good);
        std::printf("  %s: componentes falsas a %.1f dB\n", pulse ? "pulso" : "sierra", db);
        CHECK(db < -40.0, "aliasing alto (%.1f dB)", db);
    }
}

static void testFilter()
{
    std::printf("filtro de 24 dB y autooscilacion\n");
    const double fs = SR * kOversample, fc = 2000.0;
    auto gainAt = [&](double f, float k) {
        Ladder l; l.setCutoff(fc, fs);
        const int n = int(fs * 0.2);
        double sIn = 0, sOut = 0;
        for (int i = 0; i < n; ++i) {
            const float x = 0.03f * float(std::sin(2.0 * M_PI * f * double(i) / fs));
            const float y = l.process(x, k);
            if (i > n / 2) { sIn += double(x) * x; sOut += double(y) * y; }
        }
        return std::sqrt(sOut / sIn);
    };
    const double g2 = gainAt(fc, 0.f), g3 = gainAt(fc * 3, 0.f), g6 = gainAt(fc * 6, 0.f);
    std::printf("  ganancia a fc %.3f (esperado 0.25), a 3fc %.4f, a 6fc %.5f (razon %.1f)\n", g2, g3, g6, g3 / g6);
    CHECK(std::fabs(g2 - 0.25) < 0.05, "la ganancia en fc deberia ser -12 dB (%.3f)", g2);
    CHECK(g3 / g6 > 12.0 && g3 / g6 < 20.0, "la pendiente no es de 24 dB/oct (%.1f)", g3 / g6);
    Ladder l; l.setCutoff(fc, fs);
    std::vector<float> y(size_t(fs * 0.5));
    for (size_t i = 0; i < y.size(); ++i) y[i] = l.process(i == 0 ? 0.5f : 0.f, 4.6f);
    int crossings = 0; double first = -1, last = 0;
    for (size_t i = y.size() / 2 + 1; i < y.size(); ++i)
        if (y[i - 1] < 0 && y[i] >= 0) { crossings++; if (first < 0) first = double(i); last = double(i); }
    const double freq = crossings > 1 ? (crossings - 1) * fs / (last - first) : 0.0;
    std::printf("  autooscilacion a %.0f Hz (fc = %.0f)\n", freq, fc);
    CHECK(std::fabs(freq / fc - 1.0) < 0.08, "la autooscilacion no esta en fc (%.0f Hz)", freq);
}

static void testContours()
{
    std::printf("envolventes ADSR\n");
    {
        Engine e = clean(2);
        e.setParam(AAtk, 0.5f);
        e.noteOn(48, 0.5f);
        Buf r = render(e, 44100);
        const float a1 = rms(r, 1000, 2200), a2 = rms(r, 6000, 7200), a3 = rms(r, 30000, 32000);
        std::printf("  ataque (0.1 s): rms %.3f -> %.3f -> %.3f\n", double(a1), double(a2), double(a3));
        CHECK(a1 < a2 * 0.8f && a2 < a3 * 1.08f, "el ataque no sube de a poco");
    }
    {
        Engine e = clean(2);
        e.setParam(ARel, 0.5f);
        e.noteOn(48, 0.5f);
        render(e, 22050);
        e.noteOff(48);
        Buf r = render(e, 44100);
        const float early = rms(r, 0, 800), at100 = rms(r, 4400, 5200), late = rms(r, 30000, 31000);
        std::printf("  liberacion: %.3f -> a 0.1 s %.4f -> a 0.7 s %.5f\n", double(early), double(at100), double(late));
        CHECK(at100 > early * 0.08f && late < early * 0.01f, "la liberacion no se comporta");
    }
    {   // El barrido del filtro: arranca abierto y se cierra
        Engine e = fresh();
        e.setDriftAmount(0.f);
        e.setParam(Cutoff, 0.2f); e.setParam(EnvAmt, 0.9f); e.setParam(FDec, 0.6f); e.setParam(FSus, 0.f); e.setParam(ASus, 1.f);
        e.noteOn(48, 0.5f);
        Buf r = render(e, 44100);
        const double early = rms(r, 500, 5000), late = rms(r, 30000, 36000);
        std::printf("  nivel al inicio %.3f, despues %.3f (el filtro se cierra)\n", early, late);
        CHECK(early > late * 1.5, "el filtro no se cierra con el decaimiento");
    }
}

static void testSyncAndPolyMod()
{
    std::printf("sync, poly-mod y rueda de modulacion\n");
    {   // Sync: A esclavo de B: el tono sigue a B y el timbre cambia con la frecuencia de A
        Engine e = clean(2);
        e.setParam(Sync, 1); e.setParam(BSaw, 1); e.setParam(BOct, 2); e.setParam(MixA, 1.f);
        e.setParam(ATune, 1.0f); e.setParam(AOct, 3);   // A una octava y un semitono arriba de B (con una octava exacta el sync no se oiria)
        e.noteOn(57, 0.5f);
        Buf r = render(e, 44100);
        const double f = pitch(r, 12000, 16000, 150.0, 330.0);
        CHECK(std::fabs(f / 220.0 - 1.0) < 0.02, "con sync el tono deberia seguir a B (%.1f Hz)", f);
        Engine g = clean(2);
        g.setParam(AOct, 3); g.setParam(ATune, 1.0f);
        g.noteOn(57, 0.5f);
        Buf s = render(g, 44100);
        const double b1 = brightness(r, 12000, 40000), b2 = brightness(s, 12000, 40000);
        std::printf("  brillo con sync %.3f, sin sync %.3f\n", b1, b2);
        CHECK(std::fabs(b1 - b2) > 0.01, "el sync no cambia el sonido");
    }
    {   // Poly-mod: la envolvente del filtro empuja la frecuencia de A
        Engine e = clean(2);
        e.setParam(PmEnv, 0.4f); e.setParam(PmFreqA, 1); e.setParam(FDec, 0.7f); e.setParam(FSus, 0.f);
        e.noteOn(57, 0.5f);
        Buf r = render(e, 44100);
        const double early = pitch(r, 300, 3000, 150.0, 700.0), late = pitch(r, 36000, 5000, 150.0, 700.0);
        std::printf("  poly-mod env->freq A: %.1f Hz al inicio, %.1f Hz despues\n", early, late);
        CHECK(early > late * 1.15, "la envolvente no mueve la frecuencia de A");
    }
    {   // Rueda: el LFO hace vibrato en A cuando el destino esta activo
        Engine e = clean(2);
        e.setParam(WmFreqA, 1); e.setParam(LfoFreq, 0.45f); e.setParam(ModWheel, 1.f);
        e.noteOn(57, 0.5f);
        Buf r = render(e, 44100 * 2);
        double lo = 1e9, hi = 0;
        for (int w = 0; w < 14; ++w) {
            const double f = pitch(r, 6000 + size_t(w) * 5500, 4400, 150.0, 330.0);
            lo = std::min(lo, f); hi = std::max(hi, f);
        }
        const double cents = 1200.0 * std::log2(hi / lo);
        std::printf("  vibrato por la rueda: %.0f cents\n", cents);
        CHECK(cents > 80.0, "la rueda no mueve el tono (%.0f cents)", cents);
    }
}

static void testUnisonAndGlide()
{
    std::printf("unison y glide\n");
    {   // Unison: una nota hace sonar las 5 voces y se escuchan batidos
        Engine e = clean(2);
        e.setDriftAmount(0.f);
        e.setParam(Unison, 1);
        e.noteOn(57, 0.5f);
        Buf r = render(e, 44100);
        CHECK(e.activeVoices() == 5, "el unison deberia usar las 5 voces (%d)", e.activeVoices());
        // Con voces desafinadas el nivel oscila (batidos): la envolvente de amplitud tiene varianza
        double mn = 1e9, mx = 0;
        for (size_t i = 12000; i + 441 < r.size(); i += 441) { const double v = rms(r, i, i + 441); mn = std::min(mn, v); mx = std::max(mx, v); }
        std::printf("  unison: nivel entre %.3f y %.3f\n", mn, mx);
        CHECK(mx > mn * 1.15, "no se oyen batidos entre las voces");
        e.noteOn(64, 0.5f);
        e.noteOff(64);
        Buf r2 = render(e, 22050);
        const double f = pitch(r2, 8000, 6000, 150.0, 330.0);
        CHECK(std::fabs(f / 220.0 - 1.0) < 0.02, "al soltar la ultima deberia volver a la anterior (%.1f Hz)", f);
    }
    {   // Glide
        Engine e = clean(2);
        e.setParam(GlideOn, 1); e.setParam(Glide, 0.6f);
        e.noteOn(48, 0.5f); render(e, 22050); e.noteOff(48);
        e.noteOn(60, 0.5f);
        Buf r = render(e, 44100 * 3);
        const double early = pitch(r, 800, 3000, 110.0, 330.0), mid = pitch(r, 22050, 3000, 110.0, 330.0), late = pitch(r, 44100 * 3 - 12000, 8000, 110.0, 330.0);
        std::printf("  glide: %.1f Hz -> %.1f Hz -> %.1f Hz\n", early, mid, late);
        CHECK(early < 150.0 && mid > 160.0 && mid < 205.0 && std::fabs(late / 261.63 - 1.0) < 0.045, "el glide no se comporta");
    }
}

static void testPresetLibrary()
{
    std::printf("sonidos: cada uno suena, no recorta y se distingue\n");
    const auto& list = presets();
    std::vector<std::pair<float, double>> prints;
    for (size_t i = 0; i < list.size(); ++i) {
        float pk = 0;
        Engine e = fresh();
        e.loadPreset(int(i));
        const int chord[5] = { 48, 52, 55, 59, 62 };
        for (int round = 0; round < 3; ++round) {
            for (int n : chord) e.noteOn(n + (round == 1 ? 12 : round == 2 ? -12 : 0), 0.9f);
            pk = std::max(pk, peak(render(e, 22050)));
            for (int n : chord) e.noteOff(n + (round == 1 ? 12 : round == 2 ? -12 : 0));
            render(e, 6000);
        }
        Engine g = fresh();
        g.loadPreset(int(i));
        g.noteOn(48, 0.8f); g.noteOn(55, 0.8f);
        Buf r2 = render(g, 33000);
        prints.push_back({ rms(r2, 2000, 33000), brightness(r2, 2000, 33000) });
        std::printf("  %-14s pico %.2f\n", list[i].name, double(pk));
        CHECK(pk > 0.03f && pk < 0.995f, "%s: pico %.3f", list[i].name, double(pk));
    }
    for (size_t i = 0; i < list.size(); ++i)
        for (size_t j = i + 1; j < list.size(); ++j)
            CHECK(!(std::fabs(prints[i].first - prints[j].first) < 1e-6f && std::fabs(prints[i].second - prints[j].second) < 1e-6), "%s y %s son identicos", list[i].name, list[j].name);
}

static void testRobustness()
{
    std::printf("estabilidad: parametros y notas al azar\n");
    std::mt19937 rng(5);
    std::uniform_real_distribution<float> u(0.f, 1.f);
    for (int round = 0; round < 40; ++round) {
        Engine e;
        e.prepare(round % 2 ? 48000.0 : 44100.0);
        for (int step = 0; step < 60; ++step) {
            for (int k = 0; k < 8; ++k) {
                const int id = int(u(rng) * NumParams) % NumParams;
                const ParamInfo& info = paramInfo(id);
                e.setParam(id, info.choices ? std::floor(u(rng) * float(info.choices)) : u(rng));
            }
            const float x = u(rng);
            if (x < 0.55f) e.noteOn(24 + int(u(rng) * 80), u(rng));
            else if (x < 0.85f) e.noteOff(24 + int(u(rng) * 80));
            else if (x < 0.92f) e.setBend(u(rng) * 2 - 1);
            else if (x < 0.96f) e.setModWheelExt(u(rng));
            else e.allNotesOff();
            std::vector<float> l(256), r(256);
            e.process(l.data(), r.data(), 256);
            for (size_t i = 0; i < l.size(); ++i)
                if (!(std::isfinite(l[i]) && std::fabs(l[i]) <= 1.0f)) { CHECK(false, "muestra invalida %g (ronda %d paso %d)", double(l[i]), round, step); return; }
        }
    }
}

static void testDeterminism()
{
    std::printf("determinismo\n");
    Buf a, b;
    for (int k = 0; k < 2; ++k) {
        Engine e = fresh();
        e.loadPreset(1);
        e.noteOn(48, 0.7f); e.noteOn(55, 0.9f);
        (k ? b : a) = render(e, 20000);
    }
    CHECK(a == b, "dos corridas iguales dieron audio distinto");
}

static void bench()
{
    Engine e = fresh();
    e.loadPreset(1);
    for (int n : { 48, 52, 55, 59, 62 }) e.noteOn(n, 0.9f);
    std::vector<float> l(512), r(512);
    const int blocks = int(10 * SR / 512);
    const auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < blocks; i++) e.process(l.data(), r.data(), 512);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::printf("rendimiento: 10 s de audio con 5 voces en %.3f s (%.0fx tiempo real, %.1f%% de un nucleo)\n", secs, 10.0 / secs, secs / 10.0 * 100.0);
}

// Un VOLUMEN por sonido que los deja parejos: se mide con un acorde de tres notas
static void calibrate()
{
    const auto& list = presets();
    std::vector<double> loud, pk;
    for (size_t i = 0; i < list.size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        e.setParam(Volume, 0.5f);
        for (int n : { 48, 55, 59 }) e.noteOn(n, 0.8f);
        Buf r = render(e, 33000);
        double best = 0;
        for (size_t k = 0; k + 2205 <= r.size(); k += 441) {
            double s = 0;
            for (size_t j = k; j < k + 2205; j++) s += double(r[j]) * r[j];
            best = std::max(best, std::sqrt(s / 2205.0));
        }
        loud.push_back(best);
        Engine g = fresh();
        g.loadPreset(int(i));
        g.setParam(Volume, 0.5f);
        for (int n : { 48, 52, 55, 59, 62 }) g.noteOn(n, 0.9f);
        pk.push_back(peak(render(g, 33000)));
    }
    std::vector<double> s = loud;
    std::sort(s.begin(), s.end());
    const double target = s[s.size() / 2];
    std::printf("{\n");
    for (size_t i = 0; i < list.size(); ++i) {
        double v = 0.5 * target / std::max(loud[i], 1e-6);
        v = std::min(v, 0.5 * 0.75 / std::max(pk[i], 1e-6));
        v = std::max(0.2, std::min(1.0, v));
        std::printf("  \"%s\": %.2f%s\n", list[i].name, v, i + 1 < list.size() ? "," : "");
    }
    std::printf("}\n");
}

// Guion fijo para comparar con la version web (polyfive/tests/compare_js.js)
static void dumpScript(const char* path, int preset, int note, int frames)
{
    Engine e = fresh();
    e.loadPreset(preset);
    std::vector<float> all, l(128), r(128);
    int pos = 0;
    auto at = [&](int num, int den) { return (frames * num / den) / 128 * 128; };
    while (pos < frames) {
        if (pos == 0) { e.noteOn(note, 0.9f); e.noteOn(note + 4, 0.8f); }
        if (pos == at(1, 5)) e.noteOn(note + 7, 0.7f);
        if (pos == at(2, 5)) { e.noteOn(note + 11, 0.9f); e.noteOn(note + 14, 0.6f); e.noteOn(note + 17, 0.8f); }   // sexta nota: roba una voz
        if (pos == at(3, 5)) { e.noteOff(note); e.noteOff(note + 4); }
        if (pos == at(7, 10)) e.setBend(0.5f);
        if (pos == at(4, 5)) { e.noteOff(note + 7); e.noteOff(note + 11); e.noteOff(note + 14); e.noteOff(note + 17); }
        e.process(l.data(), r.data(), 128);
        all.insert(all.end(), l.begin(), l.end());
        pos += 128;
    }
    FILE* f = std::fopen(path, "wb");
    if (!f) return;
    std::fwrite(all.data(), sizeof(float), all.size(), f);
    std::fclose(f);
}

static void demoWavs(const std::string& dir)
{
    const auto& list = presets();
    for (size_t i = 0; i < list.size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        Buf all;
        const int prog[4][3] = { { 48, 55, 60 }, { 46, 53, 58 }, { 44, 51, 56 }, { 43, 50, 59 } };
        for (auto& ch : prog) {
            for (int n : ch) e.noteOn(n, 0.85f);
            Buf a = render(e, 33000);
            for (int n : ch) e.noteOff(n);
            Buf b = render(e, 11000);
            all.insert(all.end(), a.begin(), a.end());
            all.insert(all.end(), b.begin(), b.end());
        }
        std::string name = list[i].name;
        for (auto& c : name) if (c == ' ' || c == '.') c = '_';
        writeWav(dir + "/polyfive_" + name + ".wav", all);
    }
    std::printf("renders en %s\n", dir.c_str());
}

int main(int argc, char** argv)
{
    if (argc > 1 && !std::strcmp(argv[1], "--calibrate")) { calibrate(); return 0; }
    if (argc > 5 && !std::strcmp(argv[1], "--dump")) { dumpScript(argv[2], std::atoi(argv[3]), std::atoi(argv[4]), std::atoi(argv[5])); return 0; }
    testSilence();
    testPitch();
    testPolyphony();
    testAliasing();
    testFilter();
    testContours();
    testSyncAndPolyMod();
    testUnisonAndGlide();
    testPresetLibrary();
    testRobustness();
    testDeterminism();
    bench();
    for (int i = 1; i + 1 < argc; i++)
        if (!std::strcmp(argv[i], "--wav")) demoWavs(argv[i + 1]);
    if (failures) { std::printf("\n%d fallas\n", failures); return 1; }
    std::printf("\ntodo bien\n");
    return 0;
}
