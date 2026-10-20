#include "PluginEditor.h"

namespace {

// Disposicion del panel (coordenadas del diseno, 1500 x 800)
constexpr int kPanelX = 70, kPanelY = 10, kPanelW = 1820, kPanelH = 516;
constexpr int kRowATitle = 84, kRowAKnobTop = 100, kRowARocker = 214;
constexpr int kRowBTitle = 300, kRowBKnobTop = 318, kRowBRocker = 438;

juce::Colour ink() { return PfLookAndFeel::white(); }

void drawWood(juce::Graphics& g, juce::Rectangle<int> r, int seed)
{
    const auto b = r.toFloat();
    juce::Graphics::ScopedSaveState save(g);
    g.reduceClipRegion(r);
    g.setGradientFill(juce::ColourGradient(juce::Colour(0xff82502c), b.getX(), 0.f, juce::Colour(0xff4a2813), b.getRight(), 0.f, false));
    g.fillRect(b);
    juce::Random rnd(seed);
    for (int i = 0; i < 170; ++i) {
        const float x = b.getX() + rnd.nextFloat() * b.getWidth();
        const float amp = 1.5f + rnd.nextFloat() * 3.5f, phase = rnd.nextFloat() * 6.28f, freq = 0.006f + rnd.nextFloat() * 0.012f;
        juce::Path p;
        p.startNewSubPath(x, b.getY());
        for (int y = 0; y <= int(b.getHeight()); y += 16)
            p.lineTo(x + std::sin(float(y) * freq + phase) * amp, b.getY() + float(y));
        g.setColour(rnd.nextBool() ? juce::Colour(0xff2a1509).withAlpha(0.07f + rnd.nextFloat() * 0.12f)
                                   : juce::Colour(0xffc28a58).withAlpha(0.04f + rnd.nextFloat() * 0.08f));
        g.strokePath(p, juce::PathStrokeType(0.5f + rnd.nextFloat() * 1.6f));
    }
    // Brillo del barniz y sombras de borde
    g.setGradientFill(juce::ColourGradient(juce::Colours::white.withAlpha(0.0f), b.getX(), 0.f, juce::Colours::white.withAlpha(0.0f), b.getRight(), 0.f, false));
    juce::ColourGradient sheen(juce::Colours::white.withAlpha(0.0f), b.getX(), 0.f, juce::Colours::white.withAlpha(0.0f), b.getRight(), 0.f, false);
    sheen.addColour(0.28, juce::Colours::white.withAlpha(0.1f));
    sheen.addColour(0.45, juce::Colours::white.withAlpha(0.0f));
    g.setGradientFill(sheen);
    g.fillRect(b);
    g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::black.withAlpha(0.35f), b.getY(), juce::Colours::black.withAlpha(0.0f), b.getY() + 60.f));
    g.fillRect(b.withHeight(60.f));
    g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::black.withAlpha(0.0f), b.getBottom() - 80.f, juce::Colours::black.withAlpha(0.45f), b.getBottom()));
    g.fillRect(b.withTop(b.getBottom() - 80.f));
    g.setColour(juce::Colours::black.withAlpha(0.6f));
    g.drawRect(b, 2.f);
}

void drawSection(juce::Graphics& g, const juce::String& name, int x0, int x1, int y)
{
    g.setFont(PfLookAndFeel::bold(11.f));
    const float tw = juce::GlyphArrangement::getStringWidth(PfLookAndFeel::bold(11.f), name) + 18.f;
    const float mid = float(x0 + x1) * 0.5f;
    g.setColour(ink());
    g.drawText(name, juce::Rectangle<float>(mid - tw * 0.5f, float(y) - 8.f, tw, 16.f), juce::Justification::centred);
    g.setColour(juce::Colour(0xffd9d6cb));
    g.fillRect(float(x0), float(y), mid - tw * 0.5f - float(x0), 1.5f);
    g.fillRect(mid + tw * 0.5f, float(y), float(x1) - (mid + tw * 0.5f), 1.5f);
    g.fillRect(float(x0), float(y), 1.5f, 8.f);
    g.fillRect(float(x1) - 1.5f, float(y), 1.5f, 8.f);
}

} // namespace

// ---------------------------------------------------------------- PfKnob

PfKnob::PfKnob(PolyFiveProcessor& p, int paramId, KnobScale scale, const juce::String& label, juce::LookAndFeel& laf)
    : scale_(scale), label_(label)
{
    const auto& info = pf::paramInfo(paramId);
    if (scale == KnobScale::Steps) {
        steps_ = juce::StringArray::fromTokens(info.labels, "|", "");
        if (paramId == pf::KbdTrack) steps_ = juce::StringArray("OFF", "1/2", "FULL");
        if (paramId == pf::LfoShape) steps_ = juce::StringArray("TRI", "SAW", "SQR");
    }
    slider_.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    slider_.setRotaryParameters(PfLookAndFeel::kStart, PfLookAndFeel::kEnd, true);
    slider_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    slider_.setLookAndFeel(&laf);
    slider_.setPopupDisplayEnabled(true, true, nullptr);
    slider_.setMouseDragSensitivity(info.choices > 0 ? 90 : 220);
    slider_.setDoubleClickReturnValue(true, double(info.def));
    addAndMakeVisible(slider_);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.apvts, info.id, slider_);
}

void PfKnob::resized()
{
    slider_.setBounds(22, 22, 60, 60);
}

void PfKnob::paint(juce::Graphics& g)
{
    const juce::Point<float> c(float(kW) * 0.5f, 52.f);   // centro de la perilla
    auto at = [&](float prop, float radius) {
        const float a = PfLookAndFeel::kStart + prop * (PfLookAndFeel::kEnd - PfLookAndFeel::kStart);
        return juce::Point<float>(c.x + std::sin(a) * radius, c.y - std::cos(a) * radius);
    };
    g.setColour(ink().withAlpha(0.9f));
    if (scale_ == KnobScale::Ten || scale_ == KnobScale::Bipolar) {
        for (int i = 0; i <= 10; ++i) {
            const bool major = i % 5 == 0;
            const auto p0 = at(float(i) / 10.f, major ? 33.f : 34.f), p1 = at(float(i) / 10.f, major ? 41.f : 38.f);
            g.drawLine(p0.x, p0.y, p1.x, p1.y, major ? 1.6f : 1.1f);
        }
        g.setFont(PfLookAndFeel::bold(10.f));
        for (int i = 0; i <= 10; i += 5) {   // 0, 5 y 10 (o -5, 0 y +5)
            const juce::String t = scale_ == KnobScale::Ten ? juce::String(i) : (i - 5 > 0 ? "+" : "") + juce::String(i - 5);
            const auto p = at(float(i) / 10.f, i == 5 ? 47.f : 45.f);
            g.drawText(t, juce::Rectangle<float>(22.f, 12.f).withCentre(p), juce::Justification::centred);
        }
    } else if (scale_ == KnobScale::Steps) {
        const int n = steps_.size();
        g.setFont(PfLookAndFeel::bold(9.f));
        for (int i = 0; i < n; ++i) {
            const float prop = float(i) / float(n - 1);
            const auto p0 = at(prop, 33.f), p1 = at(prop, 38.f), p = at(prop, 44.f);
            g.drawLine(p0.x, p0.y, p1.x, p1.y, 1.5f);
            g.drawText(steps_[i], juce::Rectangle<float>(22.f, 12.f).withCentre(p), juce::Justification::centred);
        }
    } else {
        for (int i = 0; i < 6; ++i) {
            const float prop = float(i) / 5.f;
            const auto p0 = at(prop, 33.f), p1 = at(prop, 38.f), p = at(prop, 45.f);
            g.drawLine(p0.x, p0.y, p1.x, p1.y, 1.5f);
            PfLookAndFeel::drawWaveIcon(g, i, juce::Rectangle<float>(14.f, 10.f).withCentre(p), ink());
        }
    }
    g.setColour(ink());
    g.setFont(PfLookAndFeel::bold(9.5f));
    g.drawFittedText(label_, 6, 88, kW - 12, 28, juce::Justification::centredTop, 2);
}

// ---------------------------------------------------------------- Rocker

Rocker::Rocker(PolyFiveProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf)
{
    setLookAndFeel(&laf);
    setButtonText(label);
    setClickingTogglesState(true);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment>(p.apvts, pf::paramInfo(paramId).id, *this);
}

// ---------------------------------------------------------------- Wheel

void Wheel::setValue(float v)
{
    value_ = juce::jlimit(springs_ ? -1.f : 0.f, 1.f, v);
    repaint();
    if (onChange)
        onChange(value_);
}

void Wheel::mouseDrag(const juce::MouseEvent& e)
{
    const float span = float(getHeight()) * (springs_ ? 0.5f : 0.9f);
    setValue(dragStartValue_ - float(e.getDistanceFromDragStartY()) / span);
}

void Wheel::paint(juce::Graphics& g)
{
    const auto r = getLocalBounds().toFloat();
    // Pozo oscuro donde gira la rueda
    g.setColour(juce::Colour(0xff050506));
    g.fillRoundedRectangle(r, 5.f);
    const auto w = r.reduced(4.f, 5.f);
    juce::ColourGradient body(juce::Colour(0xff0d0d0f), w.getX(), 0.f, juce::Colour(0xff0d0d0f), w.getRight(), 0.f, false);
    body.addColour(0.35, juce::Colour(0xff5e5e64));
    body.addColour(0.5, juce::Colour(0xff77777d));
    body.addColour(0.7, juce::Colour(0xff2b2b2f));
    g.setGradientFill(body);
    g.fillRoundedRectangle(w, 3.f);
    // Estrias que giran con el valor
    juce::Graphics::ScopedSaveState save(g);
    g.reduceClipRegion(w.toNearestInt());
    const float offset = value_ * 90.f;
    for (float y = w.getY() - 20.f; y < w.getBottom() + 20.f; y += 9.f) {
        const float yy = y + std::fmod(offset, 9.f);
        g.setColour(juce::Colours::black.withAlpha(0.5f));
        g.drawLine(w.getX(), yy, w.getRight(), yy, 1.6f);
        g.setColour(juce::Colours::white.withAlpha(0.1f));
        g.drawLine(w.getX(), yy + 1.8f, w.getRight(), yy + 1.8f, 1.f);
    }
    g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::black.withAlpha(0.7f), w.getY(), juce::Colours::black.withAlpha(0.0f), w.getY() + 34.f));
    g.fillRect(w);
    g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::black.withAlpha(0.0f), w.getBottom() - 34.f, juce::Colours::black.withAlpha(0.7f), w.getBottom()));
    g.fillRect(w);
    if (springs_) {   // marca del centro
        g.setColour(PfLookAndFeel::orange());
        g.fillRect(r.getX() + 1.f, r.getCentreY() - 1.f, 4.f, 2.f);
        g.fillRect(r.getRight() - 5.f, r.getCentreY() - 1.f, 4.f, 2.f);
    }
}

// ---------------------------------------------------------------- Content

class PolyFiveEditor::Content : public juce::Component {
public:
    Content(PolyFiveProcessor& p, PfLookAndFeel& laf)
        : proc_(p), laf_(laf),
          keyboard_(p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard),
          pitch_(true), mod_(false)
    {
        using namespace pf;
        // Perillas: id, centro x, centro y, escala, nombre
        struct K { int id; int cx; int cy; KnobScale scale; const char* label; };
        const int ya = kRowAKnobTop + 52, yb = kRowBKnobTop + 52;
        const std::vector<K> knobs = {
            { AOct, 138, ya, KnobScale::Steps, "OCTAVE" }, { ATune, 234, ya, KnobScale::Bipolar, "TUNE" }, { APw, 330, ya, KnobScale::Ten, "PULSE WIDTH" },
            { BOct, 478, ya, KnobScale::Steps, "OCTAVE" }, { BFreq, 574, ya, KnobScale::Bipolar, "FREQUENCY" }, { BFine, 670, ya, KnobScale::Bipolar, "FINE" }, { BPw, 766, ya, KnobScale::Ten, "PULSE WIDTH" },
            { PmEnv, 962, ya, KnobScale::Ten, "FILTER ENV" }, { PmB, 1058, ya, KnobScale::Ten, "OSC B" },
            { MixA, 1226, ya, KnobScale::Ten, "OSC A" }, { MixB, 1322, ya, KnobScale::Ten, "OSC B" }, { MixNoise, 1418, ya, KnobScale::Ten, "NOISE" },
            { Glide, 1558, ya, KnobScale::Ten, "GLIDE" }, { Tune, 1654, ya, KnobScale::Bipolar, "MASTER TUNE" }, { Volume, 1750, ya, KnobScale::Ten, "VOLUME" }, { Velocity, 1846, ya, KnobScale::Ten, "VELOCITY" },
            { Cutoff, 138, yb, KnobScale::Ten, "CUTOFF" }, { Resonance, 234, yb, KnobScale::Ten, "RESONANCE" }, { EnvAmt, 330, yb, KnobScale::Ten, "ENVELOPE AMOUNT" }, { KbdTrack, 426, yb, KnobScale::Steps, "KEYBOARD" },
            { FAtk, 586, yb, KnobScale::Ten, "ATTACK" }, { FDec, 682, yb, KnobScale::Ten, "DECAY" }, { FSus, 778, yb, KnobScale::Ten, "SUSTAIN" }, { FRel, 874, yb, KnobScale::Ten, "RELEASE" },
            { AAtk, 1002, yb, KnobScale::Ten, "ATTACK" }, { ADec, 1098, yb, KnobScale::Ten, "DECAY" }, { ASus, 1194, yb, KnobScale::Ten, "SUSTAIN" }, { ARel, 1290, yb, KnobScale::Ten, "RELEASE" },
            { LfoFreq, 1426, yb, KnobScale::Ten, "FREQUENCY" }, { LfoShape, 1522, yb, KnobScale::Steps, "SHAPE" }, { LfoAmt, 1618, yb, KnobScale::Ten, "INITIAL AMOUNT" }, { WmMix, 1714, yb, KnobScale::Ten, "LFO / NOISE" },
        };
        for (const auto& k : knobs) {
            knobs_.push_back(std::make_unique<PfKnob>(p, k.id, k.scale, k.label, laf));
            addAndMakeVisible(*knobs_.back());
            knobs_.back()->setBounds(k.cx - PfKnob::kW / 2, k.cy - 52, PfKnob::kW, PfKnob::kH);
        }
        // Interruptores de palanca: id, centro x, arriba y, nombre
        struct R { int id; int cx; int top; const char* label; };
        const std::vector<R> rockers = {
            { ASaw, 138, kRowARocker, "SAW" }, { APulse, 234, kRowARocker, "PULSE" }, { Sync, 330, kRowARocker, "SYNC" },
            { BSaw, 450, kRowARocker, "SAW" }, { BTri, 530, kRowARocker, "TRIANGLE" }, { BPulse, 610, kRowARocker, "PULSE" }, { BLow, 690, kRowARocker, "LOW FREQ" }, { BKbd, 770, kRowARocker, "KEYBOARD" },
            { PmFreqA, 936, kRowARocker, "FREQ A" }, { PmPwA, 1008, kRowARocker, "PW A" }, { PmFilter, 1080, kRowARocker, "FILTER" },
            { GlideOn, 1558, kRowARocker, "GLIDE" }, { Unison, 1654, kRowARocker, "UNISON" },
            { WmFreqA, 1426, kRowBRocker, "FREQ A" }, { WmFreqB, 1482, kRowBRocker, "FREQ B" }, { WmPwA, 1538, kRowBRocker, "PW A" }, { WmPwB, 1594, kRowBRocker, "PW B" }, { WmFilter, 1650, kRowBRocker, "FILTER" },
        };
        for (const auto& r : rockers) {
            rockers_.push_back(std::make_unique<Rocker>(p, r.id, r.label, laf));
            addAndMakeVisible(*rockers_.back());
            rockers_.back()->setBounds(r.cx - Rocker::kW / 2, r.top, Rocker::kW, Rocker::kH);
        }

        // Sonidos: lista agrupada por categoria con anterior / siguiente
        juce::String last;
        const auto& list = pf::presets();
        for (size_t i = 0; i < list.size(); ++i) {
            if (last != list[i].category) {
                if (i > 0)
                    presets_.addSeparator();
                presets_.addSectionHeading(list[i].category);
                last = list[i].category;
            }
            presets_.addItem(list[i].name, int(i) + 1);
        }
        presets_.setLookAndFeel(&laf);
        presets_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification);
        presets_.onChange = [this] { proc_.setCurrentProgram(presets_.getSelectedId() - 1); };
        addAndMakeVisible(presets_);
        for (auto* b : { &prev_, &next_ }) {
            b->setLookAndFeel(&laf);
            addAndMakeVisible(*b);
        }
        prev_.onClick = [this] { step(-1); };
        next_.onClick = [this] { step(1); };

        // Ruedas y teclado
        addAndMakeVisible(pitch_);
        addAndMakeVisible(mod_);
        pitch_.onChange = [this](float v) { proc_.setUiBend(v); };
        mod_.onChange = [this](float v) { proc_.setUiMod(v); };
        keyboard_.setLookAndFeel(&laf);
        keyboard_.setAvailableRange(36, 96);
        keyboard_.setLowestVisibleKey(36);
        keyboard_.setKeyWidth(46.f);
        keyboard_.setBlackNoteLengthProportion(0.62f);
        keyboard_.setBlackNoteWidthProportion(0.58f);
        keyboard_.setScrollButtonsVisible(false);
        keyboard_.setWantsKeyboardFocus(false);
        addAndMakeVisible(keyboard_);

        setSize(PolyFiveEditor::kWidth, PolyFiveEditor::kHeight);
    }

    ~Content() override
    {
        presets_.setLookAndFeel(nullptr);
        prev_.setLookAndFeel(nullptr);
        next_.setLookAndFeel(nullptr);
        keyboard_.setLookAndFeel(nullptr);
    }

    void refresh()
    {
        const int v = proc_.voices.load();
        if (v != lit_) {
            lit_ = v;
            repaint(ledArea_);
        }
        const int prog = proc_.getCurrentProgram();
        if (prog + 1 != presets_.getSelectedId())
            presets_.setSelectedId(prog + 1, juce::dontSendNotification);
    }

    void resized() override
    {
        presets_.setBounds(1580, 24, 250, 28);
        prev_.setBounds(1542, 24, 34, 28);
        next_.setBounds(1834, 24, 34, 28);
        ledArea_ = { 1436, 28, 96, 18 };
        pitch_.setBounds(104, 574, 44, 190);
        mod_.setBounds(158, 574, 44, 190);
        keyboard_.setBounds(230, 574, 1656, 190);
        background_ = renderBackground(getWidth(), getHeight());
    }

    void paint(juce::Graphics& g) override
    {
        g.drawImageAt(background_, 0, 0);
        // LEDs de las voces
        for (int i = 0; i < 5; ++i) {
            const auto led = juce::Rectangle<float>(float(ledArea_.getX() + 2 + i * 18), float(ledArea_.getY() + 3), 12.f, 12.f);
            const bool on = i < lit_;
            if (on) {
                g.setColour(PfLookAndFeel::orange().withAlpha(0.4f));
                g.fillEllipse(led.expanded(5.f));
            }
            g.setColour(on ? juce::Colour(0xffff9a3c) : juce::Colour(0xff3c1f0c));
            g.fillEllipse(led);
            g.setColour(juce::Colours::black);
            g.drawEllipse(led, 1.f);
        }
    }

private:
    void step(int delta)
    {
        const int n = proc_.getNumPrograms();
        proc_.setCurrentProgram((proc_.getCurrentProgram() + delta + n) % n);
        presets_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification);
    }

    juce::Image renderBackground(int w, int h)
    {
        juce::Image img(juce::Image::ARGB, juce::jmax(1, w), juce::jmax(1, h), true);
        juce::Graphics g(img);

        // Fondo y carcasa
        g.fillAll(juce::Colour(0xff0b0a09));
        drawWood(g, { 0, 0, kPanelX, h }, 7);
        drawWood(g, { kPanelX + kPanelW, 0, w - kPanelX - kPanelW, h }, 19);

        // Panel de control negro con un destello suave arriba
        const auto panel = juce::Rectangle<float>(float(kPanelX), float(kPanelY), float(kPanelW), float(kPanelH));
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff19191c), panel.getY(), juce::Colour(0xff0a0a0c), panel.getBottom()));
        g.fillRoundedRectangle(panel, 7.f);
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::white.withAlpha(0.07f), panel.getY(), juce::Colours::white.withAlpha(0.0f), panel.getY() + 200.f));
        g.fillRoundedRectangle(panel, 7.f);
        juce::Random rnd(5);
        for (int i = 0; i < 6000; ++i) {   // grano fino de la pintura
            g.setColour((rnd.nextBool() ? juce::Colours::white : juce::Colours::black).withAlpha(0.03f));
            g.fillRect(panel.getX() + rnd.nextFloat() * panel.getWidth(), panel.getY() + rnd.nextFloat() * panel.getHeight(), 1.f, 1.f);
        }
        g.setColour(juce::Colour(0xff39393d));
        g.drawRoundedRectangle(panel, 7.f, 1.5f);
        g.setColour(juce::Colours::white.withAlpha(0.12f));
        g.drawLine(panel.getX() + 8.f, panel.getY() + 1.5f, panel.getRight() - 8.f, panel.getY() + 1.5f, 1.f);

        // Marca
        g.setColour(ink());
        g.setFont(PfLookAndFeel::bold(32.f, "Avenir Next"));
        g.drawText("POLY FIVE", kPanelX + 24, 16, 300, 40, juce::Justification::centredLeft);
        g.setColour(PfLookAndFeel::orange());
        g.fillRect(kPanelX + 24, 56, 150, 3);
        g.setColour(PfLookAndFeel::dim());
        g.setFont(PfLookAndFeel::bold(10.5f));
        g.drawText("POLYPHONIC SYNTHESIZER", kPanelX + 200, 40, 260, 16, juce::Justification::centredLeft);
        g.setFont(PfLookAndFeel::bold(9.f));
        g.drawText("VOICES", 1380, 33, 48, 12, juce::Justification::centredRight);
        g.drawText("PRESET", 1542, 12, 80, 12, juce::Justification::centredLeft);

        // Secciones
        drawSection(g, "OSCILLATOR A", 92, 394, kRowATitle);
        drawSection(g, "OSCILLATOR B", 410, 880, kRowATitle);
        drawSection(g, "POLY-MOD", 896, 1140, kRowATitle);
        drawSection(g, "MIXER", 1156, 1470, kRowATitle);
        drawSection(g, "PERFORMANCE", 1490, 1890, kRowATitle);
        drawSection(g, "FILTER", 92, 520, kRowBTitle);
        drawSection(g, "FILTER ENVELOPE", 536, 930, kRowBTitle);
        drawSection(g, "AMPLIFIER ENVELOPE", 946, 1340, kRowBTitle);
        drawSection(g, "LFO AND WHEEL-MOD", 1360, 1770, kRowBTitle);
        g.setFont(PfLookAndFeel::bold(9.f));
        g.setColour(PfLookAndFeel::dim());
        g.drawText("WHEEL-MOD DESTINATIONS", 1380, 432, 300, 12, juce::Justification::centred);

        // Banco: debajo del panel, donde viven las ruedas y el teclado
        const auto bench = juce::Rectangle<float>(float(kPanelX), float(kPanelY + kPanelH + 14), float(kPanelW), float(h) - float(kPanelY + kPanelH + 14));
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff16130f), bench.getY(), juce::Colour(0xff060504), bench.getBottom()));
        g.fillRect(bench);
        g.setColour(juce::Colours::black.withAlpha(0.7f));
        g.fillRect(bench.withHeight(6.f));
        g.setColour(PfLookAndFeel::dim());
        g.setFont(PfLookAndFeel::bold(9.f));
        g.drawText("PITCH", 100, 764, 52, 12, juce::Justification::centred);
        g.drawText("MOD", 154, 764, 52, 12, juce::Justification::centred);
        return img;
    }

    PolyFiveProcessor& proc_;
    PfLookAndFeel& laf_;
    std::vector<std::unique_ptr<PfKnob>> knobs_;
    std::vector<std::unique_ptr<Rocker>> rockers_;
    juce::ComboBox presets_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    PfKeyboard keyboard_;
    Wheel pitch_, mod_;
    juce::Image background_;
    juce::Rectangle<int> ledArea_;
    int lit_ = 0;
};

// ---------------------------------------------------------------- Editor

PolyFiveEditor::PolyFiveEditor(PolyFiveProcessor& p) : juce::AudioProcessorEditor(p)
{
    content_ = std::make_unique<Content>(p, laf_);
    addAndMakeVisible(*content_);
    constrainer_.setFixedAspectRatio(double(kWidth) / double(kHeight));
    constrainer_.setSizeLimits(kWidth / 2, kHeight / 2, kWidth * 3 / 2, kHeight * 3 / 2);
    setConstrainer(&constrainer_);
    setResizable(true, true);
    setSize(kWidth * 3 / 4, kHeight * 3 / 4);
    startTimerHz(25);
}

PolyFiveEditor::~PolyFiveEditor()
{
    stopTimer();
    content_.reset();
}

void PolyFiveEditor::resized()
{
    content_->setBounds(0, 0, kWidth, kHeight);
    content_->setTransform(juce::AffineTransform::scale(float(getWidth()) / float(kWidth)));
}

void PolyFiveEditor::timerCallback()
{
    content_->refresh();
}
