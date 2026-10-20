// Pruebas del motor de Acid Line (sin JUCE). Uso: ac_tests [--wav carpeta] [--calibrate] [--dump salida.f32 sonido nota cuadros]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>
#include "../engine/ac_engine.h"

using namespace ac;

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

// Patch "limpio": filtro abierto, sin barrido ni resonancia
static Engine clean(int wave = 0)
{
    Engine e = fresh();
    e.setParam(Waveform, float(wave)); e.setParam(Cutoff, 1.f); e.setParam(Resonance, 0.f); e.setParam(EnvMod, 0.f);
    e.setParam(Accent, 0.f); e.setParam(Drive, 0.f); e.setParam(Volume, 0.7f);
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
    std::printf("altura\n");
    for (int wave = 0; wave < 2; ++wave)
        for (int note : { 36, 48, 60 }) {
            Engine e = clean(wave);
            e.setDriftAmount(0.f);
            e.noteOn(note, 0.5f);
            Buf r = render(e, 44100);
            const double expect = 440.0 * std::pow(2.0, (note - 69) / 12.0);
            const double f = pitch(r, 12000, 16000, expect * 0.8, expect * 1.25);
            CHECK(std::fabs(f / expect - 1.0) < 0.01, "onda %d nota %d: %.1f Hz (esperado %.1f)", wave, note, f, expect);
        }
}

static void testAliasing()
{
    std::printf("aliasing\n");
    for (int wave : { 0, 1 }) {
        Engine e = clean(wave);
        e.setDriftAmount(0.f);
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
        std::printf("  onda %d: componentes falsas a %.1f dB\n", wave, db);
        CHECK(db < -45.0, "aliasing alto (%.1f dB)", db);
    }
}

static void testFilter()
{
    std::printf("filtro: 18 dB/oct y resonancia\n");
    const double fs = SR * kOversample, fc = 1500.0;
    auto gainAt = [&](double f, float k) {
        Ladder3 l; l.setCutoff(fc, fs);
        const int n = int(fs * 0.2);
        double sIn = 0, sOut = 0;
        for (int i = 0; i < n; ++i) {
            const float x = 0.03f * float(std::sin(2.0 * M_PI * f * double(i) / fs));
            const float y = l.process(x, k);
            if (i > n / 2) { sIn += double(x) * x; sOut += double(y) * y; }
        }
        return std::sqrt(sOut / sIn);
    };
    const double g4 = gainAt(fc * 4, 0.f), g8 = gainAt(fc * 8, 0.f), g16 = gainAt(fc * 16, 0.f);
    std::printf("  ganancia a 4fc %.4f, 8fc %.5f, 16fc %.6f (razon por octava %.1f)\n", g4, g8, g16, g8 / g16);
    CHECK(g8 / g16 > 6.5 && g8 / g16 < 9.5, "la pendiente no es de 18 dB/oct (razon %.1f)", g8 / g16);
    CHECK(g4 < 0.03, "el filtro no atenua");
    // La resonancia levanta el corte y le saca graves
    const double peakRes = gainAt(fc, 3.6f), peakFlat = gainAt(fc, 0.f);
    const double bassRes = gainAt(fc / 8, 3.6f), bassFlat = gainAt(fc / 8, 0.f);
    std::printf("  resonancia: en fc x%.1f; graves x%.2f\n", peakRes / peakFlat, bassRes / bassFlat);
    CHECK(peakRes / peakFlat > 3.0, "la resonancia no levanta el corte");
    CHECK(bassRes / bassFlat < 0.5, "la resonancia deberia sacarle graves");
}

static void testEnvelopeAndAccent()
{
    std::printf("barrido del filtro y acento\n");
    {   // El filtro arranca abierto y se cierra con el decaimiento
        Engine e = fresh();
        e.setParam(Waveform, 0); e.setParam(Cutoff, 0.15f); e.setParam(Resonance, 0.3f); e.setParam(EnvMod, 0.9f); e.setParam(Decay, 0.3f); e.setParam(Accent, 0.f);
        e.noteOn(40, 0.5f);
        Buf r = render(e, 44100);
        const double early = brightness(r, 200, 2000), late = brightness(r, 30000, 36000);
        std::printf("  brillo al inicio %.3f, despues %.3f\n", early, late);
        CHECK(early > late * 1.5, "el filtro no se cierra con el decaimiento");
    }
    {   // Mas decaimiento = el barrido dura mas
        double shortB = 0, longB = 0;
        for (int k = 0; k < 2; ++k) {
            Engine e = fresh();
            e.setParam(Cutoff, 0.15f); e.setParam(EnvMod, 0.9f); e.setParam(Decay, k ? 0.9f : 0.1f); e.setParam(Accent, 0.f);
            e.noteOn(40, 0.5f);
            Buf r = render(e, 44100);
            (k ? longB : shortB) = brightness(r, 14000, 20000);
        }
        std::printf("  brillo a 0.3 s con decay corto %.3f, largo %.3f\n", shortB, longB);
        CHECK(longB > shortB * 1.3, "el decay no alarga el barrido");
    }
    {   // Acento: mas fuerte y mas brillante que sin acento
        float lvl[2]; double br[2];
        for (int k = 0; k < 2; ++k) {
            Engine e = fresh();
            e.setParam(Cutoff, 0.3f); e.setParam(Resonance, 0.6f); e.setParam(EnvMod, 0.5f); e.setParam(Accent, 0.8f);
            e.noteOn(40, k ? 0.95f : 0.4f);   // velocidad >= umbral = acento
            Buf r = render(e, 22050);
            lvl[k] = rms(r, 600, 8000); br[k] = brightness(r, 600, 8000);
        }
        std::printf("  rms sin/con acento %.3f / %.3f, brillo %.3f / %.3f\n", double(lvl[0]), double(lvl[1]), br[0], br[1]);
        CHECK(lvl[1] > lvl[0] * 1.2f, "el acento no sube el volumen");
        CHECK(br[1] > br[0], "el acento no abre el filtro");
    }
}

static void testSlide()
{
    std::printf("slide: las notas ligadas se deslizan sin reiniciar\n");
    Engine e = clean(0);
    e.setDriftAmount(0.f);
    e.setParam(SlideTime, 0.5f);
    e.noteOn(40, 0.5f);
    render(e, 22050);
    e.noteOn(52, 0.5f);   // ligada: sube una octava deslizando
    Buf r = render(e, 22050);
    const double early = pitch(r, 200, 2500, 70.0, 260.0), late = pitch(r, 15000, 4000, 70.0, 260.0);
    std::printf("  slide: al inicio %.1f Hz, despues %.1f Hz (nota 52 = %.1f)\n", early, late, 440.0 * std::pow(2.0, (52 - 69) / 12.0));
    CHECK(early < 140.0 && std::fabs(late / 164.81 - 1.0) < 0.03, "el slide no se comporta");
    // Sin ligar (nota nueva despues de soltar) no hay slide: salta directo
    Engine g = clean(0);
    g.setDriftAmount(0.f);
    g.setParam(SlideTime, 0.9f);
    g.noteOn(40, 0.5f); render(g, 11025); g.noteOff(40); render(g, 4000);
    g.noteOn(52, 0.5f);
    Buf s = render(g, 8000);
    const double f = pitch(s, 600, 3000, 70.0, 260.0);
    CHECK(std::fabs(f / 164.81 - 1.0) < 0.03, "una nota nueva no deberia deslizarse (%.1f Hz)", f);
    // La ligada no reinicia el barrido del filtro
    Engine h = fresh();
    h.setParam(Cutoff, 0.15f); h.setParam(EnvMod, 0.9f); h.setParam(Decay, 0.3f); h.setParam(Accent, 0.f);
    h.noteOn(40, 0.5f);
    Buf pre = render(h, 30000);
    const double bPre = brightness(pre, 24000, 30000);
    h.noteOn(43, 0.5f);
    Buf post = render(h, 8000);
    const double bPost = brightness(post, 4000, 8000);
    std::printf("  brillo antes %.3f, despues de la ligada %.3f\n", bPre, bPost);
    CHECK(bPost < bPre * 2.0, "la nota ligada reinicio el barrido");
}

static void testDriveAndWaves()
{
    std::printf("overdrive y formas de onda\n");
    double b[2];
    for (int k = 0; k < 2; ++k) {
        Engine e = clean(0);
        e.setParam(Cutoff, 0.5f); e.setParam(Drive, k ? 0.9f : 0.f);
        e.noteOn(40, 0.5f);
        Buf r = render(e, 22050);
        b[k] = brightness(r, 4000, 22000);
    }
    std::printf("  brillo sin/con drive: %.3f / %.3f\n", b[0], b[1]);
    CHECK(b[1] > b[0] * 1.1, "el drive no agrega armonicos");
    // La cuadrada tiene solo armonicos impares: el 2do es mucho menor que en la sierra
    double ratio[2];
    for (int w = 0; w < 2; ++w) {
        Engine e = clean(w);
        e.setDriftAmount(0.f);
        e.noteOn(45, 0.5f);   // 110 Hz
        Buf r = render(e, 44100);
        const size_t n = 32768;
        auto p = spectrum(r, 8000, n);
        auto at = [&](double f) { const size_t k = size_t(f / SR * double(n) + 0.5); double m = 0; for (size_t j = k - 3; j <= k + 3; ++j) m = std::max(m, p[j]); return m; };
        ratio[w] = at(220.0) / at(110.0);
    }
    std::printf("  2do armonico / fundamental: sierra %.3f, cuadrada %.5f\n", ratio[0], ratio[1]);
    CHECK(ratio[1] < ratio[0] * 0.05, "la cuadrada deberia tener solo armonicos impares");
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
        for (int n : { 33, 36, 40, 45 }) {
            e.noteOn(n, 0.9f);
            pk = std::max(pk, peak(render(e, 16000)));
            e.noteOff(n);
            render(e, 6000);
        }
        Engine g = fresh();
        g.loadPreset(int(i));
        g.noteOn(36, 0.6f);
        Buf r2 = render(g, 22050);
        prints.push_back({ rms(r2, 1000, 22050), brightness(r2, 1000, 22050) });
        std::printf("  %-14s pico %.2f\n", list[i].name, double(pk));
        CHECK(pk > 0.03f && pk < 0.995f, "%s: pico %.3f", list[i].name, double(pk));
    }
    for (size_t i = 0; i < list.size(); ++i)
        for (size_t j = i + 1; j < list.size(); ++j)
            CHECK(!(std::fabs(prints[i].first - prints[j].first) < 1e-6f && std::fabs(prints[i].second - prints[j].second) < 1e-6), "%s y %s son identicos", list[i].name, list[j].name);
}

static void testRobustness()
{
    std::printf("estabilidad\n");
    std::mt19937 rng(3);
    std::uniform_real_distribution<float> u(0.f, 1.f);
    for (int round = 0; round < 40; ++round) {
        Engine e;
        e.prepare(round % 2 ? 48000.0 : 44100.0);
        for (int step = 0; step < 60; ++step) {
            for (int k = 0; k < 4; ++k) {
                const int id = int(u(rng) * NumParams) % NumParams;
                const ParamInfo& info = paramInfo(id);
                e.setParam(id, info.choices ? std::floor(u(rng) * float(info.choices)) : u(rng));
            }
            const float x = u(rng);
            if (x < 0.5f) e.noteOn(24 + int(u(rng) * 60), u(rng));
            else if (x < 0.85f) e.noteOff(24 + int(u(rng) * 60));
            else if (x < 0.92f) e.setBend(u(rng) * 2 - 1);
            else e.allNotesOff();
            std::vector<float> l(256), r(256);
            e.process(l.data(), r.data(), 256);
            for (size_t i = 0; i < l.size(); ++i)
                if (!(std::isfinite(l[i]) && std::fabs(l[i]) <= 1.0f)) { CHECK(false, "muestra invalida %g", double(l[i])); return; }
        }
    }
}

static void testDeterminism()
{
    std::printf("determinismo\n");
    Buf a, b;
    for (int k = 0; k < 2; ++k) {
        Engine e = fresh();
        e.loadPreset(2);
        e.noteOn(36, 0.9f);
        (k ? b : a) = render(e, 20000);
    }
    CHECK(a == b, "dos corridas iguales dieron audio distinto");
}

static void bench()
{
    Engine e = fresh();
    e.setParam(Drive, 0.4f);
    e.noteOn(40, 1.f);
    std::vector<float> l(512), r(512);
    const int blocks = int(10 * SR / 512);
    const auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < blocks; i++) e.process(l.data(), r.data(), 512);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::printf("rendimiento: 10 s de audio en %.3f s (%.0fx tiempo real, %.1f%% de un nucleo)\n", secs, 10.0 / secs, secs / 10.0 * 100.0);
}

// Un volumen por sonido que los deja parejos: se mide con una nota grave con acento
static void calibrate()
{
    const auto& list = presets();
    std::vector<double> loud, pk;
    for (size_t i = 0; i < list.size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        e.setParam(Volume, 0.5f);
        e.noteOn(36, 0.6f);
        Buf r = render(e, 22050);
        double best = 0;
        for (size_t k = 0; k + 2205 <= r.size(); k += 441) {
            double s = 0;
            for (size_t j = k; j < k + 2205; j++) s += double(r[j]) * r[j];
            best = std::max(best, std::sqrt(s / 2205.0));
        }
        loud.push_back(best);
        pk.push_back(peak(r));
    }
    std::vector<double> s = loud;
    std::sort(s.begin(), s.end());
    const double target = s[s.size() / 2];
    std::printf("{\n");
    for (size_t i = 0; i < list.size(); ++i) {
        double v = 0.5 * target / std::max(loud[i], 1e-6);
        v = std::min(v, 0.5 * 0.8 / std::max(pk[i], 1e-6));
        v = std::max(0.2, std::min(1.0, v));
        std::printf("  \"%s\": %.2f%s\n", list[i].name, v, i + 1 < list.size() ? "," : "");
    }
    std::printf("}\n");
}

// Guion fijo para comparar con la version web (acidline/tests/compare_js.js)
static void dumpScript(const char* path, int preset, int note, int frames)
{
    Engine e = fresh();
    e.loadPreset(preset);
    std::vector<float> all, l(128), r(128);
    int pos = 0;
    while (pos < frames) {
        if (pos == 0) e.noteOn(note, 0.9f);
        if (pos == (frames * 3 / 10) / 128 * 128) e.noteOn(note + 7, 0.5f);      // ligada: slide
        if (pos == (frames * 5 / 10) / 128 * 128) e.noteOff(note + 7);           // suelta: vuelve a la anterior
        if (pos == (frames * 65 / 100) / 128 * 128) e.noteOff(note);
        if (pos == (frames * 75 / 100) / 128 * 128) e.noteOn(note + 12, 0.95f);  // nota nueva con acento
        if (pos == (frames * 9 / 10) / 128 * 128) e.noteOff(note + 12);
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
        // Un patron corto de 16 pasos: notas, acentos y slides
        const int pat[16] = { 36, 36, 48, 36, 39, 36, 43, 36, 36, 48, 36, 41, 36, 34, 36, 46 };
        const bool acc[16] = { 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 };
        const bool slide[16] = { 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1 };
        for (int s = 0; s < 16; ++s) {
            const int step = 5512;   // 16avos a ~120 bpm
            e.noteOn(pat[s], acc[s] ? 0.95f : 0.5f);
            Buf a = render(e, slide[s] ? step : step * 3 / 4);
            if (slide[s] && s + 1 < 16) { /* la nota siguiente entra antes de soltar: slide */ }
            else { e.noteOff(pat[s]); }
            all.insert(all.end(), a.begin(), a.end());
            if (!slide[s]) { Buf g = render(e, step / 4); all.insert(all.end(), g.begin(), g.end()); }
            else { e.noteOff(pat[s]); }
        }
        std::string name = list[i].name;
        for (auto& c : name) if (c == ' ') c = '_';
        writeWav(dir + "/acid_" + name + ".wav", all);
    }
    std::printf("renders en %s\n", dir.c_str());
}

int main(int argc, char** argv)
{
    if (argc > 1 && !std::strcmp(argv[1], "--calibrate")) { calibrate(); return 0; }
    if (argc > 5 && !std::strcmp(argv[1], "--dump")) { dumpScript(argv[2], std::atoi(argv[3]), std::atoi(argv[4]), std::atoi(argv[5])); return 0; }
    testSilence();
    testPitch();
    testAliasing();
    testFilter();
    testEnvelopeAndAccent();
    testSlide();
    testDriveAndWaves();
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
