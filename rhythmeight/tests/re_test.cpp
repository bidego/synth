// Pruebas del motor de Rhythm Eight (sin JUCE). Uso: re_tests [--wav carpeta] [--dump salida.f32 sonido cuadros]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "../engine/re_engine.h"

using namespace re;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; std::printf("  FALLA: "); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static const double SR = 44100.0;
typedef std::vector<float> Buf;

static Buf render(Engine& e, int n, Buf* right = nullptr)
{
    Buf l(static_cast<size_t>(n), 0.f), r(static_cast<size_t>(n), 0.f);
    int done = 0;
    while (done < n) {
        const int len = std::min(n - done, 64 + (done / 64) % 5 * 90);
        e.process(l.data() + done, r.data() + done, len);
        done += len;
    }
    if (right) *right = r;
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

static double brightness(const Buf& v, size_t from, size_t to)
{
    double d = 0, t = 0;
    for (size_t i = from + 1; i < to && i < v.size(); i++) { const double x = v[i] - v[i - 1]; d += x * x; t += double(v[i]) * v[i]; }
    return t > 0 ? std::sqrt(d / t) : 0.0;
}

/** Cuanto dura el sonido: ultima muestra por encima de -50 dB del pico. */
static double tail(const Buf& v)
{
    const float lim = peak(v) * 0.003f;
    size_t last = 0;
    for (size_t i = 0; i < v.size(); i++) if (std::fabs(v[i]) > lim) last = i;
    return double(last) / SR;
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

static Buf hit(int inst, int n = 44100, Engine* use = nullptr)
{
    Engine e = fresh();
    Engine& eng = use ? *use : e;
    eng.trigger(inst, 0.8, false);
    return render(eng, n);
}

static void testSilence()
{
    std::printf("silencio sin golpes\n");
    Engine e = fresh();
    CHECK(peak(render(e, 8820)) < 1e-6f, "sale audio sin tocar nada");
    CHECK(e.activeVoices() == 0, "hay voces activas sin tocar nada");
}

static void testVoices()
{
    std::printf("las 13 voces: nivel, duracion y sin valores raros\n");
    // Duracion maxima esperada (s) de cada una con los valores de fabrica
    const double maxTail[kInst] = { 2.3, 1.0, 1.6, 1.4, 1.2, 0.1, 0.12, 0.8, 0.25, 0.9, 9.0, 1.5, 0.35 };
    for (int i = 0; i < kInst; ++i) {
        Buf b = hit(i, 44100 * 10);
        const float p = peak(b);
        const double t = tail(b);
        std::printf("  %-10s pico %.3f  dura %.2f s\n", instName(i), p, t);
        CHECK(p > 0.25f && p < 1.0f, "%s: pico %.3f fuera de 0.25..1", instName(i), p);
        CHECK(t < maxTail[i], "%s: dura %.2f s (maximo %.2f)", instName(i), t, maxTail[i]);
        bool bad = false;
        for (float x : b) if (!std::isfinite(x)) bad = true;
        CHECK(!bad, "%s: valores no finitos", instName(i));
    }
}

static void testBassDrum()
{
    std::printf("bombo: altura, decaimiento y afinacion\n");
    Engine e = fresh();
    e.trigger(BD, 0.8, false);
    Buf b = render(e, 44100);
    const double f = pitch(b, 3000, 8000, 30, 120);
    CHECK(f > 40 && f < 80, "el bombo suena a %.1f Hz (esperado 40..80)", f);
    // decaimiento: mas largo con Decay arriba
    Engine s = fresh(); s.setParam(BdDecay, 0.1f);
    Engine l = fresh(); l.setParam(BdDecay, 0.9f);
    CHECK(tail(hit(BD, 44100 * 4, &l)) > tail(hit(BD, 44100 * 4, &s)) * 2.0, "Decay no alarga el bombo");
    // afinacion
    Engine lo = fresh(); lo.setParam(BdTune, 0.1f);
    Engine hi = fresh(); hi.setParam(BdTune, 0.9f);
    const double flo = pitch(hit(BD, 44100, &lo), 4000, 8000, 25, 200), fhi = pitch(hit(BD, 44100, &hi), 4000, 8000, 25, 200);
    CHECK(fhi > flo * 1.5, "Tune no sube el bombo (%.1f -> %.1f)", flo, fhi);
    // Tone agrega el golpe del ataque
    Engine t0 = fresh(); t0.setParam(BdTone, 0.f);
    Engine t1 = fresh(); t1.setParam(BdTone, 1.f);
    CHECK(brightness(hit(BD, 2000, &t1), 0, 400) > brightness(hit(BD, 2000, &t0), 0, 400) * 1.5, "Tone no agrega ataque al bombo");
}

static void testToms()
{
    std::printf("toms: de grave a agudo\n");
    double prev = 0;
    for (int i = LT; i <= HT; ++i) {
        const double f = pitch(hit(i), 6000, 4000, 60, 400);
        std::printf("  %s %.1f Hz\n", instName(i), f);
        CHECK(f > prev * 1.15, "%s no es mas agudo que el anterior", instName(i));
        prev = f;
    }
    Engine s = fresh(); s.setParam(LtDecay, 0.1f);
    Engine l = fresh(); l.setParam(LtDecay, 0.9f);
    CHECK(tail(hit(LT, 44100 * 3, &l)) > tail(hit(LT, 44100 * 3, &s)) * 2.0, "Decay no alarga el tom");
}

static void testSnareAndNoise()
{
    std::printf("caja: Snappy agrega ruido; claves y rim son tonales; maracas y hats son brillantes\n");
    Engine a = fresh(); a.setParam(SdSnappy, 0.f);
    Engine b = fresh(); b.setParam(SdSnappy, 1.f);
    const Buf lo = hit(SD, 44100, &a), hi = hit(SD, 44100, &b);
    CHECK(brightness(hi, 0, 8000) > brightness(lo, 0, 8000) * 1.2, "Snappy no agrega ruido a la caja");
    CHECK(tail(hi) > tail(lo), "Snappy no alarga la caja");
    CHECK(brightness(hit(MA), 0, 4000) > brightness(hit(BD), 0, 4000) * 5, "las maracas no son brillantes");
    CHECK(brightness(hit(CH), 0, 4000) > brightness(hit(SD), 0, 4000), "el hi-hat cerrado no es brillante");
    const double f = pitch(hit(CL), 200, 800, 1500, 4000);
    CHECK(f > 2000 && f < 3000, "las claves suenan a %.0f Hz", f);
}

static void testHats()
{
    std::printf("hi-hats: el cerrado corta al abierto; Decay alarga\n");
    Engine e = fresh();
    e.trigger(OH, 0.8, false);
    Buf open = render(e, 22050);
    Engine c = fresh();
    c.trigger(OH, 0.8, false);
    render(c, 4410);
    c.trigger(CH, 0.8, false);
    Buf choked = render(c, 22050);
    CHECK(rms(choked, 4000, 12000) < rms(open, 8410, 16410) * 0.3 + 1e-6, "el hi-hat cerrado no corta al abierto");
    Engine s = fresh(); s.setParam(OhDecay, 0.f);
    Engine l = fresh(); l.setParam(OhDecay, 1.f);
    CHECK(tail(hit(OH, 44100 * 3, &l)) > tail(hit(OH, 44100 * 3, &s)) * 2.0, "Decay no alarga el hi-hat abierto");
    Engine cs = fresh(); cs.setParam(CyDecay, 0.f);
    Engine cl = fresh(); cl.setParam(CyDecay, 1.f);
    CHECK(tail(hit(CY, 44100 * 12, &cl)) > tail(hit(CY, 44100 * 12, &cs)) * 1.5, "Decay no alarga el platillo");
    Engine t0 = fresh(); t0.setParam(CyTone, 0.f);
    Engine t1 = fresh(); t1.setParam(CyTone, 1.f);
    CHECK(brightness(hit(CY, 8000, &t1), 0, 6000) > brightness(hit(CY, 8000, &t0), 0, 6000), "Tone no aclara el platillo");
}

static void testLevels()
{
    std::printf("niveles: la perilla escala el volumen de cada voz\n");
    const int lv[kInst] = { BdLevel, SdLevel, LtLevel, MtLevel, HtLevel, RsLevel, ClLevel, CpLevel, MaLevel, CbLevel, CyLevel, OhLevel, ChLevel };
    for (int i = 0; i < kInst; ++i) {
        Engine z = fresh(); z.setParam(lv[i], 0.f);
        Engine h = fresh(); h.setParam(lv[i], 0.5f);
        Engine f = fresh(); f.setParam(lv[i], 1.f);
        CHECK(peak(hit(i, 12000, &z)) < 1e-6f, "%s: Level 0 no calla la voz", instName(i));
        CHECK(peak(hit(i, 12000, &f)) > peak(hit(i, 12000, &h)) * 1.5f, "%s: Level no sube el volumen", instName(i));
    }
}

static void testMidi()
{
    std::printf("MIDI: notas de bateria General MIDI\n");
    for (int i = 0; i < kInst; ++i) {
        Engine e = fresh();
        e.noteOn(instNote(i), 0.8f);
        CHECK(e.activeVoices() == 1, "la nota %d no toca %s", instNote(i), instName(i));
        CHECK(noteToInst(instNote(i)) == i, "noteToInst(%d)", instNote(i));
    }
    Engine e = fresh();
    e.noteOn(60, 1.f);
    CHECK(e.activeVoices() == 0, "una nota que no es de bateria suena");
    // Velocidad
    Engine a = fresh(), b = fresh();
    a.noteOn(36, 0.3f); b.noteOn(36, 1.f);
    CHECK(peak(render(b, 4000)) > peak(render(a, 4000)) * 1.5f, "la velocidad no cambia el volumen");
    // allNotesOff
    Engine k = fresh();
    k.noteOn(36, 1.f); k.noteOn(38, 1.f);
    k.allNotesOff();
    CHECK(k.activeVoices() == 0, "allNotesOff no apaga las voces");
}

/** Muestras (inicio) donde empieza un golpe: sube de la envolvente por encima de un umbral tras silencio. */
static std::vector<int> onsets(const Buf& v, float thr = 0.05f)
{
    std::vector<int> o;
    int quiet = 1 << 20;
    for (size_t i = 0; i < v.size(); i++) {
        if (std::fabs(v[i]) > thr) { if (quiet > 2000) o.push_back(int(i)); quiet = 0; }
        else quiet++;
    }
    return o;
}

static void testSequencer()
{
    std::printf("secuenciador: tiempo, pasos, acento, shuffle y largo\n");
    // 120 BPM: un paso (semicorchea) = 0.125 s = 5512.5 muestras
    Engine e = fresh();
    e.setParam(Tempo, float((120.0 - 40.0) / 200.0));
    e.setPatternString(RS, "x...x...x...x...");
    CHECK(e.step(RS, 0) == 1 && e.step(RS, 1) == 0, "setPatternString");
    e.setParam(Run, 1);
    Buf b = render(e, 44100 * 2 + 100);
    auto o = onsets(b);
    CHECK(o.size() >= 4 && o.size() <= 5, "se esperaban 4 golpes en 2 s y hubo %zu", o.size());
    if (o.size() >= 3) {
        const double d = double(o[2] - o[1]);
        CHECK(std::fabs(d - 22050.0) < 60.0, "separacion entre golpes %.0f (esperado 22050)", d);
    }
    CHECK(e.currentStep() >= 0, "currentStep con el secuenciador andando");
    e.setParam(Run, 0);
    render(e, 100);
    CHECK(e.currentStep() == -1, "currentStep tras parar");

    // El tempo cambia la separacion
    Engine f = fresh();
    f.setParam(Tempo, float((240.0 - 40.0) / 200.0));
    f.setPatternString(RS, "x...x...x...x...");
    f.setParam(Run, 1);
    auto of = onsets(render(f, 44100 * 2));
    CHECK(of.size() >= 7, "a 240 BPM se esperaban 8 golpes y hubo %zu", of.size());

    // Acento: mas fuerte
    Engine g = fresh();
    g.setParam(Tempo, 0.4f);
    g.setPatternString(SD, "x...X...");
    g.setParam(Steps, 2);   // 8 pasos
    g.setParam(Run, 1);
    Buf gb = render(g, int(SR * 1.2));
    const float p0 = peak(gb, 0, size_t(0.2 * SR)), p1 = peak(gb, size_t(0.5 * SR), size_t(0.7 * SR));
    CHECK(p1 > p0 * 1.15f, "el acento no suena mas fuerte (%.3f vs %.3f)", p1, p0);

    // Shuffle: los pasos impares llegan tarde
    Engine h2 = fresh();
    h2.setParam(Tempo, float((120.0 - 40.0) / 200.0));
    h2.setParam(Shuffle, 1.f);
    h2.setPatternString(RS, "xx..............");
    h2.setParam(Run, 1);
    auto o2 = onsets(render(h2, 22050), 0.05f);
    CHECK(o2.size() >= 2, "shuffle: faltan golpes");
    if (o2.size() >= 2) {
        const double gap = double(o2[1] - o2[0]);
        CHECK(std::fabs(gap - 5512.5 * 1.5) < 80.0, "shuffle: el paso impar llego a %.0f muestras (esperado ~%.0f)", gap, 5512.5 * 1.5);
    }

    // Largo del patron: 4 pasos repiten cada 4
    Engine k = fresh();
    k.setParam(Tempo, float((120.0 - 40.0) / 200.0));
    k.setParam(Steps, 3);   // 4 pasos
    k.setPatternString(RS, "x...............");
    k.setParam(Run, 1);
    auto ok = onsets(render(k, 44100 * 2));
    CHECK(ok.size() >= 3, "largo 4: golpes %zu", ok.size());
    if (ok.size() >= 2)
        CHECK(std::fabs(double(ok[1] - ok[0]) - 22050.0) < 80.0, "largo 4: separacion %d", ok[1] - ok[0]);
}

static void testHostSync()
{
    std::printf("sincronia con el anfitrion\n");
    Engine e = fresh();
    e.setParam(Sync, 1);
    e.setPatternString(BD, "x...x...x...x...");
    // Parado: silencio aunque Run este activo
    e.setParam(Run, 1);
    e.setTransport(false, 0.0, 120.0);
    CHECK(peak(render(e, 4000)) < 1e-6f, "suena con el anfitrion parado");
    // Andando, en negra 1.0 cae el segundo golpe del patron (paso 4)
    e.setTransport(true, 0.9, 120.0);
    Buf b(2000), r(2000);
    e.process(b.data(), r.data(), 2000);
    // a 120 BPM, 0.1 negra = 0.05 s = 2205 muestras: el golpe cae despues de 2000 muestras; renderizo mas
    e.setTransport(true, 0.9 + 2000.0 * 120.0 / (60.0 * SR), 120.0);
    Buf b2(2000), r2(2000);
    e.process(b2.data(), r2.data(), 2000);
    CHECK(peak(b2) > 0.2f, "el paso en la negra 1 no sono (pico %.3f)", peak(b2));
    CHECK(e.bpm() == 120.0, "bpm del anfitrion");
}

static void testPresets()
{
    std::printf("sonidos: cada patron suena, sin saturar ni valores raros\n");
    const int n = int(presets().size());
    CHECK(n >= 12, "se esperaban al menos 12 patrones y hay %d", n);
    for (int i = 0; i < n; ++i) {
        Engine e = fresh();
        e.loadPreset(i);
        e.setParam(Run, 1);
        Buf b = render(e, int(SR * 6));
        const float p = peak(b);
        bool bad = false;
        for (float x : b) if (!std::isfinite(x)) bad = true;
        std::printf("  %-18s %-8s pico %.3f  %.0f BPM\n", presets()[size_t(i)].name, presets()[size_t(i)].category, p, e.bpm());
        CHECK(!bad, "%s: valores no finitos", presets()[size_t(i)].name);
        CHECK(p > 0.3f && p <= 1.0f, "%s: pico %.3f", presets()[size_t(i)].name, p);
        CHECK(rms(b, 0, b.size()) > 0.03f, "%s: casi no suena", presets()[size_t(i)].name);
    }
}

static void testDeterminism()
{
    std::printf("determinismo y estereo\n");
    auto run = [] {
        Engine e = fresh();
        e.loadPreset(3);
        e.setParam(Run, 1);
        return render(e, 30000);
    };
    Buf a = run(), b = run();
    CHECK(a == b, "dos corridas iguales dan audio distinto");
    Engine e = fresh();
    e.trigger(HT, 0.8, false);
    Buf r;
    Buf l = render(e, 8000, &r);
    double dl = 0;
    for (size_t i = 0; i < l.size(); i++) dl += std::fabs(l[i] - r[i]);
    CHECK(dl > 1e-3, "el tom agudo deberia estar a un costado");
}

static void testSampleRates()
{
    std::printf("otras frecuencias de muestreo\n");
    for (double sr : { 22050.0, 48000.0, 96000.0 }) {
        Engine e;
        e.prepare(sr);
        e.trigger(BD, 0.8, false);
        e.trigger(CY, 0.8, false);
        std::vector<float> l(static_cast<size_t>(sr)), r(static_cast<size_t>(sr));
        e.process(l.data(), r.data(), int(l.size()));
        float p = 0; bool bad = false;
        for (float x : l) { p = std::max(p, std::fabs(x)); if (!std::isfinite(x)) bad = true; }
        CHECK(!bad && p > 0.2f && p <= 1.f, "%.0f Hz: pico %.3f", sr, p);
    }
}

static void testPerformance()
{
    std::printf("rendimiento\n");
    Engine e = fresh();
    e.loadPreset(3);
    e.setPatternString(BD, "xxxxxxxxxxxxxxxx");
    e.setPatternString(CY, "xxxxxxxxxxxxxxxx");
    e.setPatternString(OH, "xxxxxxxxxxxxxxxx");
    e.setPatternString(CP, "xxxxxxxxxxxxxxxx");
    e.setParam(Tempo, 1.f);
    e.setParam(Run, 1);
    const auto t0 = std::chrono::steady_clock::now();
    const int frames = 44100 * 10;
    Buf l(512), r(512);
    for (int done = 0; done < frames; done += 512) e.process(l.data(), r.data(), 512);
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    const double load = secs / 10.0;
    std::printf("  10 s de audio en %.3f s (%.1f %% de un nucleo)\n", secs, load * 100.0);
    CHECK(load < 0.15, "demasiado lento: %.1f %% de un nucleo", load * 100.0);
}

static void demoWavs(const char* dir)
{
    for (size_t i = 0; i < presets().size(); ++i) {
        Engine e = fresh();
        e.loadPreset(int(i));
        e.setParam(Run, 1);
        Buf b = render(e, int(SR * 8));
        std::string name = presets()[i].name;
        for (char& c : name) if (c == ' ') c = '_';
        writeWav(std::string(dir) + "/" + name + ".wav", b);
    }
    for (int i = 0; i < kInst; ++i)
        writeWav(std::string(dir) + "/voz_" + instCode(i) + ".wav", hit(i, int(SR * 2.5)));
    std::printf("wavs en %s\n", dir);
}

/** Guion fijo (golpes y patron) para compararlo con el motor web: audio izquierdo en float32 crudo. */
static void dumpScript(const char* path, int preset, int frames)
{
    Engine e = fresh();
    e.loadPreset(preset);
    Buf out(static_cast<size_t>(frames)), r(128);
    Buf l(128);
    for (int pos = 0; pos < frames; pos += 128) {
        if (pos == 0) e.setParam(Run, 1);
        if (pos == 128 * 100) { e.trigger(BD, 1.0, true); e.noteOn(38, 0.7f); }
        if (pos == 128 * 200) { e.noteOn(46, 0.9f); e.noteOn(56, 0.5f); }
        if (pos == 128 * 260) e.noteOn(42, 0.9f);
        if (pos == 128 * 300) e.noteOn(49, 1.0f);
        const int len = std::min(128, frames - pos);
        e.process(l.data(), r.data(), len);
        for (int i = 0; i < len; i++) out[size_t(pos + i)] = l[size_t(i)];
    }
    FILE* f = std::fopen(path, "wb");
    if (!f) return;
    std::fwrite(out.data(), 4, out.size(), f);
    std::fclose(f);
}

int main(int argc, char** argv)
{
    if (argc > 4 && !std::strcmp(argv[1], "--dump")) { dumpScript(argv[2], std::atoi(argv[3]), std::atoi(argv[4])); return 0; }
    testSilence();
    testVoices();
    testBassDrum();
    testToms();
    testSnareAndNoise();
    testHats();
    testLevels();
    testMidi();
    testSequencer();
    testHostSync();
    testPresets();
    testDeterminism();
    testSampleRates();
    testPerformance();
    for (int i = 1; i + 1 < argc; ++i)
        if (!std::strcmp(argv[i], "--wav")) demoWavs(argv[i + 1]);
    std::printf(failures ? "\n%d pruebas fallaron\n" : "\ntodo bien\n", failures);
    return failures ? 1 : 0;
}
