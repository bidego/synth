// Pruebas del motor del Model D (sin JUCE). Uso: md_tests [--wav carpeta] [--calibrate]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>
#include "../engine/md_engine.h"

using namespace md;

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

// FFT radix-2: potencia espectral (suma de |X|^2) de una ventana de Hann
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

static double bandEnergy(const std::vector<double>& p, double f0, double f1, size_t n)
{
    double e = 0;
    for (size_t k = size_t(f0 / SR * double(n)); k <= size_t(f1 / SR * double(n)) && k < p.size(); k++) e += p[k];
    return e;
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

// Un patch "limpio": solo el oscilador 1 en sierra, filtro abierto, contornos neutros, sin deriva audible
static Engine clean(int wave = 2, int range = 3)
{
    Engine e = fresh();
    e.setParam(Osc1Wave, float(wave)); e.setParam(Osc1Range, float(range));
    e.setParam(Osc2On, 0); e.setParam(Osc3On, 0); e.setParam(Vol1, 1.f);
    e.setParam(Cutoff, 1.f); e.setParam(Emphasis, 0); e.setParam(ContourAmt, 0);
    e.setParam(Kbd1, 0); e.setParam(Kbd2, 0);
    e.setParam(LAtk, 0); e.setParam(LDec, 0.3f); e.setParam(LSus, 1.f); e.setParam(Volume, 0.7f);
    return e;
}

static void testSilence()
{
    std::printf("silencio sin notas\n");
    Engine e = fresh();
    Buf r = render(e, 8820);
    CHECK(peak(r) < 1e-4f, "sale audio sin tocar nada (%g)", double(peak(r)));
}

static void testPitch()
{
    std::printf("altura: rangos y ondas\n");
    for (int range = 1; range <= 5; ++range) {
        Engine e = clean(2, range);
        e.noteOn(57, 1.f);   // A3 = 220 Hz en 8'
        Buf r = render(e, 44100);
        const double expect = 220.0 * std::pow(2.0, range - 3);
        const double f = pitch(r, 12000, 16000, expect * 0.8, expect * 1.25);
        std::printf("  rango %d: esperado %.1f Hz, medido %.1f Hz\n", range, expect, f);
        CHECK(std::fabs(f / expect - 1.0) < 0.01, "altura fuera de 1%% (rango %d)", range);
    }
    for (int wave = 0; wave <= 5; ++wave) {
        Engine e = clean(wave, 3);
        e.noteOn(57, 1.f);
        Buf r = render(e, 44100);
        const double f = pitch(r, 12000, 16000, 190.0, 250.0);
        CHECK(std::fabs(f / 220.0 - 1.0) < 0.015, "onda %d: %.1f Hz", wave, f);
    }
}

static void testAliasing()
{
    std::printf("aliasing: la sierra aguda casi no tiene componentes falsas\n");
    for (int wave : { 2, 3 }) {
        Engine e = clean(wave, 3);
        e.setDriftAmount(0.f);   // la deriva ensancha los armonicos y se confundiria con aliasing
        e.noteOn(96, 1.f);   // C7: 2093 Hz
        Buf r = render(e, 44100);
        const size_t n = 16384;
        auto p = spectrum(r, 10000, n);
        const double f0 = 440.0 * std::pow(2.0, (96 - 69) / 12.0);
        // Energia de los armonicos (+-4 bins) y de todo lo demas (por debajo de 20 kHz)
        std::vector<char> harm(p.size(), 0);
        for (int h = 1; h * f0 < 21000.0; ++h) {
            const long c = long(h * f0 / SR * double(n) + 0.5);
            for (long k = c - 5; k <= c + 5; ++k) if (k >= 0 && k < long(p.size())) harm[size_t(k)] = 1;
        }
        double good = 0, bad = 0;
        for (size_t k = size_t(200.0 / SR * double(n)); k < size_t(20000.0 / SR * double(n)); ++k) (harm[k] ? good : bad) += p[k];
        const double db = 10.0 * std::log10(bad / good);
        std::printf("  onda %d: componentes falsas a %.1f dB del total\n", wave, db);
        CHECK(db < -50.0, "aliasing alto en la onda %d (%.1f dB)", wave, db);
    }
}

static void testLadder()
{
    std::printf("filtro de escalera: pendiente de 24 dB y autooscilacion\n");
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
    const double g1 = gainAt(fc / 4, 0.f), g2 = gainAt(fc, 0.f), g3 = gainAt(fc * 4, 0.f), g4 = gainAt(fc * 8, 0.f);
    std::printf("  ganancia a fc/4: %.3f, a fc: %.3f (esperado 0.25), a 4fc: %.4f, a 8fc: %.5f\n", g1, g2, g3, g4);
    CHECK(std::fabs(g1 - 0.885) < 0.02, "a fc/4 un polo de 4 deberia dar 0.885 (%.3f)", g1);
    CHECK(std::fabs(g2 - 0.25) < 0.04, "la ganancia en fc deberia ser -12 dB (%.3f)", g2);
    CHECK(g3 < 0.012, "pendiente insuficiente (%.4f)", g3);
    CHECK(g3 / g4 > 12.0 && g3 / g4 < 20.0, "la pendiente no es de 24 dB/oct (%.1f)", g3 / g4);
    // Resonancia al maximo: oscila cerca de fc
    Ladder l; l.setCutoff(fc, fs);
    std::vector<float> y(size_t(fs * 0.5));
    for (size_t i = 0; i < y.size(); ++i) y[i] = l.process(i == 0 ? 0.5f : 0.f, 4.6f);
    int crossings = 0; double first = -1, last = 0;
    for (size_t i = y.size() / 2 + 1; i < y.size(); ++i)
        if (y[i - 1] < 0 && y[i] >= 0) { crossings++; if (first < 0) first = double(i); last = double(i); }
    const double freq = crossings > 1 ? (crossings - 1) * fs / (last - first) : 0.0;
    std::printf("  autooscilacion a %.0f Hz (fc = %.0f)\n", freq, fc);
    CHECK(std::fabs(freq / fc - 1.0) < 0.06, "la autooscilacion no esta en fc (%.0f Hz)", freq);
    double amp = 0; for (size_t i = y.size() * 3 / 4; i < y.size(); ++i) amp = std::max(amp, double(std::fabs(y[i])));
    CHECK(amp > 0.05 && amp < 3.0, "amplitud de la autooscilacion fuera de rango (%.2f)", amp);
}

static void testContours()
{
    std::printf("contornos: ataque, decaimiento y liberacion\n");
    {
        Engine e = clean(3);
        e.setParam(LAtk, 0.5f);   // 0.1 s
        e.setParam(LSus, 1.f);
        e.noteOn(48, 1.f);
        Buf r = render(e, 44100);
        const float a1 = rms(r, 1000, 2200), a2 = rms(r, 6000, 7200), a3 = rms(r, 30000, 32000);
        std::printf("  ataque (0.1 s): rms %.3f -> %.3f -> %.3f\n", double(a1), double(a2), double(a3));
        CHECK(a1 < a2 * 0.8f && a2 < a3 * 1.02f, "el ataque no sube de a poco");
    }
    for (int dec = 1; dec >= 0; --dec) {
        Engine e = clean(3);
        e.setParam(DecayOn, float(dec)); e.setParam(LDec, 0.5f);
        e.noteOn(48, 1.f);
        render(e, 22050);
        e.noteOff(48);
        Buf r = render(e, 44100);
        const float early = rms(r, 0, 800), at100 = rms(r, 4400, 5200), late = rms(r, 30000, 31000);
        std::printf("  liberacion con Decay=%d: %.3f -> a 0.1 s %.4f -> a 0.7 s %.5f\n", dec, double(early), double(at100), double(late));
        if (dec) { CHECK(at100 > early * 0.08f, "con Decay la liberacion deberia ser larga"); CHECK(late < early * 0.01f, "la cola no se apaga"); }
        else CHECK(at100 < early * 0.02f, "sin Decay la liberacion deberia ser corta");
    }
}

static void testLegatoAndGlide()
{
    std::printf("monofonico: legato sin reiniciar contornos, ultima nota y glide\n");
    {
        Engine e = clean(3);
        e.setParam(LSus, 0.3f); e.setParam(LDec, 0.4f);
        e.noteOn(48, 1.f);
        render(e, 66000);   // 1.5 s: ya en el sustain
        Buf before = render(e, 4000);
        e.noteOn(52, 1.f);   // ligado
        Buf after = render(e, 6000);
        const float a = rms(before, 500, 3500), b = rms(after, 500, 5500);
        std::printf("  rms antes %.4f, despues de la nota ligada %.4f\n", double(a), double(b));
        CHECK(b < a * 1.25f, "tocar ligado no deberia reiniciar el ataque");
    }
    {
        Engine e = clean(2);
        e.noteOn(60, 1.f); render(e, 8000);
        e.noteOn(67, 1.f); render(e, 8000);
        e.noteOff(67);
        Buf r = render(e, 22050);
        const double f = pitch(r, 6000, 10000, 200.0, 340.0);
        std::printf("  al soltar la 2da vuelve a %.1f Hz (esperado 261.6)\n", f);
        CHECK(std::fabs(f / 261.63 - 1.0) < 0.02, "no volvio a la nota anterior");
    }
    {
        Engine e = clean(2);
        e.setParam(GlideOn, 1); e.setParam(Glide, 0.6f);
        e.noteOn(48, 1.f); render(e, 22050);
        e.noteOn(60, 1.f);
        Buf r = render(e, 44100 * 3);
        const double early = pitch(r, 800, 3000, 110.0, 330.0), mid = pitch(r, 22050, 3000, 110.0, 330.0), late = pitch(r, 44100 * 3 - 12000, 8000, 110.0, 330.0);
        std::printf("  glide: a 0.02 s %.1f Hz, a 0.5 s %.1f Hz, a 2.7 s %.1f Hz\n", early, mid, late);
        CHECK(early < 150.0 && mid > 160.0 && mid < 200.0 && std::fabs(late / 261.63 - 1.0) < 0.045, "el glide no se comporta");
    }
}

static void testModulationAndTracking()
{
    std::printf("modulacion, seguimiento de teclado, ruido y mezclador\n");
    {   // Vibrato: el osc 3 (LO, libre) mueve el tono de los osc 1 y 2
        Engine e = clean(2);
        e.setParam(Osc3Range, 0); e.setParam(Osc3Kbd, 0); e.setParam(Osc3Tune, 0.62f); e.setParam(Osc3Wave, 0);
        e.setParam(OscMod, 1); e.setParam(ModWheel, 1.f);
        e.noteOn(57, 1.f);
        Buf r = render(e, 44100 * 2);
        double lo = 1e9, hi = 0;
        for (int w = 0; w < 14; ++w) {
            const double f = pitch(r, 6000 + size_t(w) * 5500, 4400, 150.0, 320.0);
            lo = std::min(lo, f); hi = std::max(hi, f);
        }
        const double cents = 1200.0 * std::log2(hi / lo);
        std::printf("  vibrato: el tono varia %.0f cents\n", cents);
        CHECK(cents > 120.0, "la modulacion no mueve el tono (%.0f cents)", cents);
    }
    {   // Seguimiento de teclado: una nota aguda sale mas brillante con el filtro siguiendola
        float bright[2];
        for (int k = 0; k < 2; ++k) {
            Engine e = clean(2);
            e.setParam(Cutoff, 0.6f); e.setParam(Kbd1, k); e.setParam(Kbd2, k);
            e.noteOn(84, 1.f);
            Buf r = render(e, 22050);
            bright[k] = rms(r, 6000, 22050);
        }
        std::printf("  volumen sin/con seguimiento (nota aguda, filtro medio): %.3f / %.3f\n", double(bright[0]), double(bright[1]));
        CHECK(bright[1] > bright[0] * 1.3f, "el seguimiento de teclado no abre el filtro");
    }
    {   // Ruido blanco vs rosa
        double ratio[2];
        for (int k = 0; k < 2; ++k) {
            Engine e = fresh();
            e.setParam(Osc1On, 0); e.setParam(Osc2On, 0); e.setParam(NoiseOn, 1); e.setParam(VolNoise, 0.9f); e.setParam(NoiseType, float(k));
            e.setParam(Cutoff, 1.f); e.setParam(Emphasis, 0); e.setParam(ContourAmt, 0); e.setParam(LSus, 1.f);
            e.noteOn(60, 1.f);
            Buf r = render(e, 44100 * 2);
            auto p = spectrum(r, 20000, 32768);
            ratio[k] = bandEnergy(p, 100, 400, 32768) / bandEnergy(p, 4000, 16000, 32768);
        }
        std::printf("  energia graves/agudos: blanco %.4f, rosa %.4f\n", ratio[0], ratio[1]);
        CHECK(ratio[1] > ratio[0] * 6.0, "el ruido rosa no tiene mas graves que el blanco");
    }
    {   // Mezclador: con todo al maximo la suma satura (no es lineal)
        float one, two;
        for (int k = 0; k < 2; ++k) {
            Engine e = clean(2);
            e.setParam(Osc2On, k); e.setParam(Osc2Wave, 2); e.setParam(Vol2, 1.f);
            e.setParam(Osc2Tune, 0.5f);
            e.noteOn(48, 1.f);
            Buf r = render(e, 22050);
            (k ? two : one) = rms(r, 6000, 22000);
        }
        std::printf("  rms con 1 oscilador %.3f, con 2 (maximo) %.3f\n", double(one), double(two));
        CHECK(two < one * 1.8f, "la mezcla deberia saturar (no sumar lineal)");
    }
    {   // A-440
        Engine e = fresh();
        e.setParam(A440, 1); e.setParam(Osc1On, 0); e.setParam(Osc2On, 0);
        Buf r = render(e, 22050);
        const double f = pitch(r, 6000, 8000, 400.0, 480.0);
        CHECK(std::fabs(f - 440.0) < 3.0, "el A-440 no suena a 440 (%.1f)", f);
    }
}

static void testPresetLibrary()
{
    std::printf("sonidos: cada uno suena, no recorta y se distingue\n");
    const auto& list = presets();
    std::vector<std::pair<float, float>> prints;
    for (size_t i = 0; i < list.size(); ++i) {
        float pk = 0;
        Engine e = fresh();
        e.loadPreset(int(i));
        for (int n : { 36, 43, 48, 55 }) {
            e.noteOn(n, 0.9f);
            Buf r = render(e, 22050);
            pk = std::max(pk, peak(r));
            e.noteOff(n);
            render(e, 8000);
        }
        Engine g = fresh();
        g.loadPreset(int(i));
        g.noteOn(48, 0.8f);
        Buf r2 = render(g, 33000);
        double d = 0, t = 0;
        for (size_t k = 2000; k < r2.size(); k++) { const double x = r2[k] - r2[k - 1]; d += x * x; t += double(r2[k]) * r2[k]; }
        prints.push_back({ rms(r2, 2000, 33000), float(std::sqrt(d / std::max(t, 1e-12))) });
        std::printf("  %-18s pico %.2f\n", list[i].name, double(pk));
        CHECK(pk > 0.03f && pk < 0.995f, "%s: pico %.3f", list[i].name, double(pk));
        CHECK(std::isfinite(prints.back().second), "%s: brillo invalido", list[i].name);
    }
    for (size_t i = 0; i < list.size(); ++i)
        for (size_t j = i + 1; j < list.size(); ++j)
            CHECK(!(std::fabs(prints[i].first - prints[j].first) < 1e-6f && std::fabs(prints[i].second - prints[j].second) < 1e-6f),
                  "%s y %s son identicos", list[i].name, list[j].name);
}

static void testRobustness()
{
    std::printf("estabilidad: parametros y notas al azar\n");
    std::mt19937 rng(11);
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
            if (x < 0.5f) e.noteOn(24 + int(u(rng) * 80), u(rng));
            else if (x < 0.8f) e.noteOff(24 + int(u(rng) * 80));
            else if (x < 0.9f) e.setBend(u(rng) * 2 - 1);
            else if (x < 0.95f) e.setModWheelExt(u(rng));
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
        e.noteOn(40, 0.7f);
        (k ? b : a) = render(e, 20000);
    }
    CHECK(a == b, "dos corridas iguales dieron audio distinto");
}

static void bench()
{
    Engine e = fresh();
    e.setParam(Osc3On, 1); e.setParam(Vol3, 0.8f); e.setParam(NoiseOn, 1); e.setParam(VolNoise, 0.3f); e.setParam(Emphasis, 0.6f);
    e.noteOn(40, 1.f);
    std::vector<float> l(512), r(512);
    const int blocks = int(10 * SR / 512);
    const auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < blocks; i++) e.process(l.data(), r.data(), 512);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::printf("rendimiento: 10 s de audio (3 osciladores + ruido + filtro, sobremuestreo x%d) en %.3f s (%.0fx tiempo real, %.1f%% de un nucleo)\n",
                kOversample, secs, 10.0 / secs, secs / 10.0 * 100.0);
}

// Un VOLUMEN por sonido que los deja parejos: se mide con una nota grave sostenida
static void calibrate()
{
    const auto& list = presets();
    std::vector<double> loud, pk;
    for (size_t i = 0; i < list.size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        e.setParam(Volume, 0.5f);
        e.noteOn(43, 0.8f);
        Buf r = render(e, 33000);
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

static void demoWavs(const std::string& dir)
{
    const auto& list = presets();
    for (size_t i = 0; i < list.size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        Buf all;
        const int notes[8] = { 36, 36, 43, 41, 48, 46, 43, 36 };
        for (int n : notes) {
            e.noteOn(n, 0.9f);
            Buf a = render(e, 11000);
            e.noteOff(n);
            Buf b = render(e, 8000);
            all.insert(all.end(), a.begin(), a.end());
            all.insert(all.end(), b.begin(), b.end());
        }
        std::string name = list[i].name;
        for (auto& c : name) if (c == ' ' || c == '.') c = '_';
        writeWav(dir + "/modeld_" + name + ".wav", all);
    }
    std::printf("renders en %s\n", dir.c_str());
}

// Para comparar con la version web (modeld/tests/compare_js.js): un guion fijo de notas y el audio crudo (float32 mono)
static void dumpScript(const char* path, int preset, int note, int frames)
{
    Engine e = fresh();
    e.loadPreset(preset);
    std::vector<float> all;
    all.reserve(size_t(frames));
    std::vector<float> l(128), r(128);
    int pos = 0;
    while (pos < frames) {
        if (pos == 0) e.noteOn(note, 0.9f);
        if (pos == (frames * 2 / 5) / 128 * 128) e.noteOn(note + 7, 0.7f);
        if (pos == (frames * 13 / 20) / 128 * 128) e.noteOff(note + 7);
        if (pos == (frames * 4 / 5) / 128 * 128) e.noteOff(note);
        e.process(l.data(), r.data(), 128);
        all.insert(all.end(), l.begin(), l.end());
        pos += 128;
    }
    FILE* f = std::fopen(path, "wb");
    if (!f) return;
    std::fwrite(all.data(), sizeof(float), all.size(), f);
    std::fclose(f);
}

int main(int argc, char** argv)
{
    if (argc > 1 && !std::strcmp(argv[1], "--calibrate")) { calibrate(); return 0; }
    if (argc > 5 && !std::strcmp(argv[1], "--dump")) { dumpScript(argv[2], std::atoi(argv[3]), std::atoi(argv[4]), std::atoi(argv[5])); return 0; }
    testSilence();
    testPitch();
    testAliasing();
    testLadder();
    testContours();
    testLegatoAndGlide();
    testModulationAndTracking();
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
