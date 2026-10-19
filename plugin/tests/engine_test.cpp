// Pruebas del motor de audio (sin JUCE): altura, niveles, liberacion, filtro, velocidad, chorus, estabilidad numerica.
// Uso: juno_tests [--wav carpeta]   (con --wav deja un par de renders para escuchar)
#include <cmath>
#include <cstdio>
#include <chrono>
#include <cstring>
#include <random>
#include <string>
#include <vector>
#include "../engine/juno_engine.h"

using namespace juno;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; std::printf("  FALLA: "); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static const double SR = 44100.0;

struct Render { std::vector<float> l, r; };

static Render render(Engine& e, int n) {
    Render out; out.l.resize(size_t(n)); out.r.resize(size_t(n));
    int done = 0;
    while (done < n) {   // en bloques de tamanos distintos, como un anfitrion
        const int len = std::min(n - done, 64 + (done / 64) % 5 * 100);
        e.process(out.l.data() + done, out.r.data() + done, len);
        done += len;
    }
    return out;
}

static float peak(const std::vector<float>& v, size_t from = 0, size_t to = size_t(-1)) {
    float p = 0;
    for (size_t i = from; i < v.size() && i < to; i++) p = std::max(p, std::fabs(v[i]));
    return p;
}

static float rms(const std::vector<float>& v, size_t from, size_t to) {
    double s = 0; size_t n = 0;
    for (size_t i = from; i < v.size() && i < to; i++) { s += double(v[i]) * v[i]; n++; }
    return n ? float(std::sqrt(s / double(n))) : 0.f;
}

// Frecuencia fundamental por autocorrelacion
static double pitch(const std::vector<float>& v, size_t from, size_t len, double lo, double hi) {
    double bestLag = 0, best = -1e30;
    for (double f = lo; f <= hi; f *= 1.0005) {
        const size_t lag = size_t(SR / f + 0.5);
        double c = 0;
        for (size_t i = from; i + lag < from + len && i + lag < v.size(); i++) c += double(v[i]) * v[i + lag];
        if (c > best) { best = c; bestLag = double(lag); }
    }
    return SR / bestLag;
}

// Energia por encima de una frecuencia (una pasada simple de diferencias: mucha mas energia = mas brillo)
static float brightness(const std::vector<float>& v, size_t from, size_t to) {
    double d = 0, t = 0;
    for (size_t i = from + 1; i < to && i < v.size(); i++) { const double x = v[i] - v[i - 1]; d += x * x; t += double(v[i]) * v[i]; }
    return t > 0 ? float(std::sqrt(d / t)) : 0.f;
}

static void writeWav(const std::string& path, const Render& r) {
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return;
    const uint32_t n = uint32_t(r.l.size()), bytes = n * 4, rate = uint32_t(SR);
    auto w32 = [&](uint32_t x) { std::fwrite(&x, 4, 1, f); };
    auto w16 = [&](uint16_t x) { std::fwrite(&x, 2, 1, f); };
    std::fwrite("RIFF", 1, 4, f); w32(36 + bytes); std::fwrite("WAVEfmt ", 1, 8, f);
    w32(16); w16(1); w16(2); w32(rate); w32(rate * 4); w16(4); w16(16); std::fwrite("data", 1, 4, f); w32(bytes);
    for (uint32_t i = 0; i < n; i++) {
        const int16_t a = int16_t(std::max(-1.f, std::min(1.f, r.l[i])) * 32767), b = int16_t(std::max(-1.f, std::min(1.f, r.r[i])) * 32767);
        std::fwrite(&a, 2, 1, f); std::fwrite(&b, 2, 1, f);
    }
    std::fclose(f);
}

static Engine fresh() { Engine e; e.prepare(SR); return e; }

static void testSilence() {
    std::printf("silencio sin notas\n");
    Engine e = fresh();
    Render r = render(e, 4410);
    CHECK(peak(r.l) == 0.f && peak(r.r) == 0.f, "salio audio sin tocar nada (%g)", double(peak(r.l)));
}

static void testPitch() {
    std::printf("altura de las notas y rangos\n");
    for (int range = 0; range <= 2; range++) {
        Engine e = fresh();
        e.setParam(Range, float(range));
        e.setParam(Sub, 0); e.setParam(Pulse, 0);          // solo la sierra: fundamental limpia
        e.setParam(VcfFreq, 0.95f);
        e.noteOn(69, 1.f);
        Render r = render(e, 44100);
        const double expect = 440.0 * std::pow(2.0, range - 1);
        const double f = pitch(r.l, 8000, 16000, expect * 0.8, expect * 1.25);
        std::printf("  rango %d: esperado %.1f Hz, medido %.1f Hz\n", range, expect, f);
        CHECK(std::fabs(f / expect - 1.0) < 0.01, "altura fuera de 1%% (rango %d)", range);
    }
}

static void testLevels() {
    std::printf("niveles: ningun sonido recorta con acordes de 6 voces\n");
    const auto& list = presets();
    for (size_t i = 0; i < list.size(); i++) {
        Engine e = fresh();
        e.loadPreset(int(i));
        const int chord[6] = { 48, 52, 55, 60, 64, 67 };
        float pk = 0;
        for (int k = 0; k < 6; k++) {
            for (int c : chord) e.noteOn(c, 1.f);
            Render r = render(e, 22050);
            pk = std::max(pk, std::max(peak(r.l), peak(r.r)));
            for (int c : chord) e.noteOff(c);
            render(e, 4000);
        }
        std::printf("  %-13s pico %.2f\n", list[i].name, double(pk));
        CHECK(pk < 0.99f, "%s recorta (pico %.2f)", list[i].name, double(pk));
        CHECK(pk > 0.02f || std::strcmp(list[i].name, "Pluck") == 0, "%s casi no suena (pico %.3f)", list[i].name, double(pk));
    }
}

static void testRelease() {
    std::printf("liberacion: despues de soltar vuelve al silencio\n");
    Engine e = fresh();
    e.setParam(Rel, 0.3f);
    e.noteOn(60, 1.f);
    render(e, 22050);
    e.noteOff(60);
    Render r = render(e, 44100 * 4);
    const float tail = peak(r.l, size_t(44100 * 3), size_t(-1));
    CHECK(tail < 1e-3f, "queda sonido despues de la liberacion (%g)", double(tail));
    CHECK(e.activeVoices() == 0, "quedan voces activas");
}

static void testVelocity() {
    std::printf("velocidad: las notas suaves suenan mas bajas y mas oscuras\n");
    float level[2], bright[2];
    for (int k = 0; k < 2; k++) {
        Engine e = fresh();
        e.noteOn(60, k ? 1.f : 0.2f);
        Render r = render(e, 22050);
        level[k] = rms(r.l, 8000, 22000);
        bright[k] = brightness(r.l, 8000, 22000);
    }
    std::printf("  rms suave %.3f fuerte %.3f | brillo suave %.3f fuerte %.3f\n", double(level[0]), double(level[1]), double(bright[0]), double(bright[1]));
    CHECK(level[0] < level[1] * 0.7f, "la nota suave no es mas baja");
    CHECK(bright[0] < bright[1], "la nota suave no es mas oscura");
    Engine e = fresh();
    e.setParam(VelVca, 0); e.setParam(VelVcf, 0);
    e.noteOn(60, 0.2f);
    Render a = render(e, 22050);
    Engine f = fresh();
    f.setParam(VelVca, 0); f.setParam(VelVcf, 0);
    f.noteOn(60, 1.f);
    Render b = render(f, 22050);
    CHECK(std::fabs(rms(a.l, 8000, 22000) / rms(b.l, 8000, 22000) - 1.f) < 0.02f, "con la sensibilidad en 0 la velocidad no deberia importar");
}

static void testFilter() {
    std::printf("filtro: el corte y la resonancia\n");
    float bright[3];
    float cut[3] = { 0.2f, 0.5f, 0.9f };
    for (int k = 0; k < 3; k++) {
        Engine e = fresh();
        e.setParam(VcfFreq, cut[k]); e.setParam(VcfEnv, 0); e.setParam(VcfKybd, 0);
        e.noteOn(48, 1.f);
        Render r = render(e, 22050);
        bright[k] = brightness(r.l, 8000, 22000);
    }
    std::printf("  brillo con corte bajo/medio/alto: %.3f %.3f %.3f\n", double(bright[0]), double(bright[1]), double(bright[2]));
    CHECK(bright[0] < bright[1] && bright[1] < bright[2], "el corte no abre el sonido de forma monotona");
    // Autooscilacion: con la resonancia al maximo y sin senal, suena sola cerca del corte
    Engine e = fresh();
    e.setParam(Saw, 0); e.setParam(Pulse, 0); e.setParam(Sub, 0); e.setParam(Noise, 0.02f);
    e.setParam(VcfRes, 1.f); e.setParam(VcfFreq, 0.45f); e.setParam(VcfEnv, 0); e.setParam(VcfKybd, 0);
    e.noteOn(60, 1.f);
    Render r = render(e, 44100);
    const float tonal = rms(r.l, 30000, 44000);
    std::printf("  autooscilacion: rms %.4f\n", double(tonal));
    CHECK(tonal > 0.005f, "la resonancia maxima no oscila");
}

static void testChorus() {
    std::printf("chorus: el estereo se abre\n");
    Engine e = fresh();
    e.setParam(Chorus, 1);
    e.noteOn(60, 1.f);
    Render r = render(e, 44100);
    double diff = 0;
    for (size_t i = 20000; i < r.l.size(); i++) diff += std::fabs(r.l[i] - r.r[i]);
    CHECK(diff / 24000.0 > 0.002, "el chorus no separa los canales");
    Engine m = fresh();
    m.noteOn(60, 1.f);
    Render rm = render(m, 44100);
    double same = 0;
    for (size_t i = 20000; i < rm.l.size(); i++) same += std::fabs(rm.l[i] - rm.r[i]);
    CHECK(same == 0.0, "sin chorus los canales deberian ser iguales");
}

static void testModes() {
    std::printf("modos: poly 1, poly 2, unison, portamento\n");
    for (int mode = 0; mode < 3; mode++) {
        Engine e = fresh();
        e.setParam(VoiceMode, float(mode));
        for (int i = 0; i < 12; i++) e.noteOn(40 + i * 3, 0.8f);   // mas notas que voces: roba
        Render r = render(e, 22050);
        CHECK(peak(r.l) > 0.01f && peak(r.l) < 1.f, "modo %d: pico %.3f", mode, double(peak(r.l)));
        for (int i = 0; i < 12; i++) e.noteOff(40 + i * 3);
        render(e, 44100 * 4);
        CHECK(e.activeVoices() == 0, "modo %d: quedaron voces sonando", mode);
    }
    // Unison: al soltar la ultima vuelve a la anterior
    Engine u = fresh();
    u.setParam(VoiceMode, 2);
    u.setParam(Pulse, 0); u.setParam(Sub, 0); u.setParam(VcfFreq, 0.95f); u.setParam(VcfEnv, 0);
    u.noteOn(60, 1.f); render(u, 8000);
    u.noteOn(67, 1.f); render(u, 8000);
    u.noteOff(67);
    Render r = render(u, 22050);
    const double f = pitch(r.l, 8000, 12000, 200.0, 340.0);
    std::printf("  unison tras soltar la 2da: %.1f Hz (esperado ~261.6)\n", f);
    CHECK(std::fabs(f / 261.63 - 1.0) < 0.03, "unison no volvio a la nota anterior");
    // Portamento: la altura sube de a poco
    Engine p = fresh();
    p.setParam(PortaOn, 1); p.setParam(PortaTime, 0.6f);
    p.setParam(Pulse, 0); p.setParam(Sub, 0); p.setParam(VcfFreq, 0.95f);
    p.setParam(Rel, 0.05f);
    p.noteOn(48, 1.f); render(p, 22050);
    p.noteOff(48);
    p.noteOn(60, 1.f);
    Render r2 = render(p, 44100 * 2);
    const double early = pitch(r2.l, 0, 4000, 110.0, 340.0);
    const double late = pitch(r2.l, 44100 + 20000, 8000, 110.0, 340.0);
    std::printf("  portamento: al inicio %.1f Hz, despues %.1f Hz\n", early, late);
    CHECK(early < late * 0.93, "el portamento no se nota");
}

static void testBendAndPedal() {
    std::printf("bender y pedal de sustain\n");
    Engine e = fresh();
    e.setParam(Pulse, 0); e.setParam(Sub, 0); e.setParam(VcfFreq, 0.95f);
    e.setParam(BendDco, 0.17f);   // 200 cents a tope
    e.noteOn(69, 1.f);
    Render a = render(e, 22050);
    e.setBend(1.f);
    Render b = render(e, 22050);
    const double fa = pitch(a.l, 8000, 12000, 380.0, 520.0), fb = pitch(b.l, 8000, 12000, 380.0, 560.0);
    std::printf("  sin bender %.1f Hz, con bender %.1f Hz\n", fa, fb);
    CHECK(fb > fa * 1.08 && fb < fa * 1.15, "el bender no sube ~200 cents");
    Engine p = fresh();
    p.sustainPedal(true);
    p.noteOn(60, 1.f); p.noteOff(60);
    Render held = render(p, 44100 * 3);
    CHECK(rms(held.l, 44100 * 2, 44100 * 3) > 0.01f, "con el pedal la nota deberia seguir sonando");
    p.sustainPedal(false);
    Render gone = render(p, 44100 * 6);
    CHECK(peak(gone.l, 44100 * 5, size_t(-1)) < 1e-3f, "al soltar el pedal la nota deberia irse");
}

static void testRobustness() {
    std::printf("estabilidad: parametros y notas al azar, sin NaN ni explosiones\n");
    std::mt19937 rng(7);
    std::uniform_real_distribution<float> u(0.f, 1.f);
    for (int round = 0; round < 40; round++) {
        Engine e;
        e.prepare(round % 2 ? 48000.0 : 44100.0);
        for (int step = 0; step < 60; step++) {
            for (int k = 0; k < 6; k++) {
                const int id = int(u(rng) * NumParams) % NumParams;
                const ParamInfo& info = paramInfo(id);
                e.setParam(id, info.choices ? std::floor(u(rng) * float(info.choices)) : u(rng));
            }
            const float x = u(rng);
            if (x < 0.5f) e.noteOn(24 + int(u(rng) * 80), u(rng));
            else if (x < 0.8f) e.noteOff(24 + int(u(rng) * 80));
            else if (x < 0.85f) e.sustainPedal(u(rng) < 0.5f);
            else if (x < 0.9f) e.setBend(u(rng) * 2 - 1);
            else if (x < 0.92f) e.allNotesOff();
            std::vector<float> l(256), r(256);
            e.process(l.data(), r.data(), 256);
            for (size_t i = 0; i < l.size(); i++)
                if (!(std::isfinite(l[i]) && std::isfinite(r[i]) && std::fabs(l[i]) <= 1.0f)) {
                    CHECK(false, "muestra invalida (%g, %g) ronda %d paso %d", double(l[i]), double(r[i]), round, step);
                    return;
                }
        }
    }
}

static void testDeterminism() {
    std::printf("determinismo\n");
    Render a, b;
    for (int k = 0; k < 2; k++) {
        Engine e = fresh();
        e.loadPreset(2);
        e.noteOn(55, 0.7f); e.noteOn(62, 0.9f);
        (k ? b : a) = render(e, 20000);
    }
    CHECK(a.l == b.l && a.r == b.r, "dos corridas iguales dieron audio distinto");
}

static void demoWavs(const std::string& dir) {
    const auto& list = presets();
    for (size_t i = 0; i < list.size(); i++) {
        Engine e = fresh();
        e.loadPreset(int(i));
        Render all;
        const int notes[4] = { 48, 55, 60, 64 };
        for (int n : notes) {
            e.noteOn(n, 0.9f); e.noteOn(n + 7, 0.7f); e.noteOn(n + 12, 0.8f);
            Render a = render(e, 30000);
            e.noteOff(n); e.noteOff(n + 7); e.noteOff(n + 12);
            Render b = render(e, 15000);
            all.l.insert(all.l.end(), a.l.begin(), a.l.end()); all.r.insert(all.r.end(), a.r.begin(), a.r.end());
            all.l.insert(all.l.end(), b.l.begin(), b.l.end()); all.r.insert(all.r.end(), b.r.begin(), b.r.end());
        }
        std::string name = list[i].name;
        for (auto& c : name) if (c == ' ') c = '_';
        writeWav(dir + "/juno_" + name + ".wav", all);
    }
    std::printf("renders en %s\n", dir.c_str());
}

static void bench() {
    Engine e = fresh();
    e.loadPreset(2);   // Strings: pulso con PWM por LFO, chorus I+II
    for (int n : { 48, 52, 55, 60, 64, 67 }) e.noteOn(n, 0.9f);
    std::vector<float> l(512), r(512);
    const int blocks = int(10 * SR / 512);
    const auto t0 = std::chrono::steady_clock::now();
    for (int i = 0; i < blocks; i++) e.process(l.data(), r.data(), 512);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::printf("rendimiento: 10 s de audio con 6 voces en %.3f s (%.0fx tiempo real, %.1f%% de un nucleo)\n", secs, 10.0 / secs, secs / 10.0 * 100.0);
}

int main(int argc, char** argv) {
    testSilence();
    testPitch();
    testLevels();
    testRelease();
    testVelocity();
    testFilter();
    testChorus();
    testModes();
    testBendAndPedal();
    testRobustness();
    testDeterminism();
    bench();
    for (int i = 1; i + 1 < argc; i++)
        if (!std::strcmp(argv[i], "--wav")) demoWavs(argv[i + 1]);
    if (failures) { std::printf("\n%d fallas\n", failures); return 1; }
    std::printf("\ntodo bien\n");
    return 0;
}
