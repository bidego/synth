#include "PluginEditor.h"

namespace {

// Disposicion del panel (coordenadas del diseno, 1500 x 800)
constexpr int kPanelX = 70, kPanelY = 10, kPanelW = 1500, kPanelH = 516;
constexpr int kRowATitle = 84, kRowAKnobTop = 100, kRowARocker = 214;
constexpr int kRowBTitle = 300, kRowBKnobTop = 318, kRowBRocker = 438;

juce::Colour ink() { return MdLookAndFeel::white(); }

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
    g.setFont(MdLookAndFeel::bold(11.f));
    const float tw = juce::GlyphArrangement::getStringWidth(MdLookAndFeel::bold(11.f), name) + 18.f;
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

// ---------------------------------------------------------------- MoogKnob

MoogKnob::MoogKnob(ModelDProcessor& p, int paramId, KnobScale scale, const juce::String& label, juce::LookAndFeel& laf)
    : scale_(scale), label_(label)
{
    const auto& info = md::paramInfo(paramId);
    if (scale == KnobScale::Steps)
        steps_ = juce::StringArray::fromTokens(info.labels, "|", "");
    slider_.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    slider_.setRotaryParameters(MdLookAndFeel::kStart, MdLookAndFeel::kEnd, true);
    slider_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    slider_.setLookAndFeel(&laf);
    slider_.setPopupDisplayEnabled(true, true, nullptr);
    slider_.setMouseDragSensitivity(info.choices > 0 ? 90 : 220);
    slider_.setDoubleClickReturnValue(true, double(info.def));
    addAndMakeVisible(slider_);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.apvts, info.id, slider_);
}

void MoogKnob::resized()
{
    slider_.setBounds(22, 22, 60, 60);
}

void MoogKnob::paint(juce::Graphics& g)
{
    const juce::Point<float> c(float(kW) * 0.5f, 52.f);   // centro de la perilla
    auto at = [&](float prop, float radius) {
        const float a = MdLookAndFeel::kStart + prop * (MdLookAndFeel::kEnd - MdLookAndFeel::kStart);
        return juce::Point<float>(c.x + std::sin(a) * radius, c.y - std::cos(a) * radius);
    };
    g.setColour(ink().withAlpha(0.9f));
    if (scale_ == KnobScale::Ten || scale_ == KnobScale::Bipolar) {
        for (int i = 0; i <= 10; ++i) {
            const bool major = i % 5 == 0;
            const auto p0 = at(float(i) / 10.f, major ? 33.f : 34.f), p1 = at(float(i) / 10.f, major ? 41.f : 38.f);
            g.drawLine(p0.x, p0.y, p1.x, p1.y, major ? 1.6f : 1.1f);
        }
        g.setFont(MdLookAndFeel::bold(10.f));
        for (int i = 0; i <= 10; i += 5) {   // 0, 5 y 10 (o -5, 0 y +5)
            const juce::String t = scale_ == KnobScale::Ten ? juce::String(i) : (i - 5 > 0 ? "+" : "") + juce::String(i - 5);
            const auto p = at(float(i) / 10.f, i == 5 ? 47.f : 45.f);
            g.drawText(t, juce::Rectangle<float>(22.f, 12.f).withCentre(p), juce::Justification::centred);
        }
    } else if (scale_ == KnobScale::Steps) {
        const int n = steps_.size();
        g.setFont(MdLookAndFeel::bold(9.f));
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
            MdLookAndFeel::drawWaveIcon(g, i, juce::Rectangle<float>(14.f, 10.f).withCentre(p), ink());
        }
    }
    g.setColour(ink());
    g.setFont(MdLookAndFeel::bold(9.5f));
    g.drawFittedText(label_, 6, 88, kW - 12, 28, juce::Justification::centredTop, 2);
}

// ---------------------------------------------------------------- Rocker

Rocker::Rocker(ModelDProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf)
{
    setLookAndFeel(&laf);
    setButtonText(label);
    setClickingTogglesState(true);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment>(p.apvts, md::paramInfo(paramId).id, *this);
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
        g.setColour(MdLookAndFeel::orange());
        g.fillRect(r.getX() + 1.f, r.getCentreY() - 1.f, 4.f, 2.f);
        g.fillRect(r.getRight() - 5.f, r.getCentreY() - 1.f, 4.f, 2.f);
    }
}

// ---------------------------------------------------------------- Content

class ModelDEditor::Content : public juce::Component {
public:
    Content(ModelDProcessor& p, MdLookAndFeel& laf)
        : proc_(p), laf_(laf),
          keyboard_(p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard),
          pitch_(true), mod_(false)
    {
        using namespace md;
        // Perillas: id, centro x, centro y, escala, nombre
        struct K { int id; int cx; int cy; KnobScale scale; const char* label; };
        const int ya = kRowAKnobTop + 52, yb = kRowBKnobTop + 52;
        const std::vector<K> knobs = {
            { Tune, 138, ya, KnobScale::Bipolar, "TUNE" }, { Glide, 234, ya, KnobScale::Ten, "GLIDE" }, { ModMix, 330, ya, KnobScale::Ten, "MODULATION MIX" },
            { Osc1Range, 446, ya, KnobScale::Steps, "RANGE" }, { Osc1Wave, 550, ya, KnobScale::Waves, "WAVEFORM" },
            { Osc2Range, 676, ya, KnobScale::Steps, "RANGE" }, { Osc2Tune, 780, ya, KnobScale::Bipolar, "FREQUENCY" }, { Osc2Wave, 884, ya, KnobScale::Waves, "WAVEFORM" },
            { Osc3Range, 1010, ya, KnobScale::Steps, "RANGE" }, { Osc3Tune, 1114, ya, KnobScale::Bipolar, "FREQUENCY" }, { Osc3Wave, 1218, ya, KnobScale::Waves, "WAVEFORM" },
            { Volume, 1352, ya, KnobScale::Ten, "VOLUME" }, { Velocity, 1442, ya, KnobScale::Ten, "VELOCITY" },
            { Vol1, 138, yb, KnobScale::Ten, "OSC 1" }, { Vol2, 234, yb, KnobScale::Ten, "OSC 2" }, { Vol3, 330, yb, KnobScale::Ten, "OSC 3" }, { VolNoise, 426, yb, KnobScale::Ten, "NOISE" },
            { Cutoff, 650, yb, KnobScale::Bipolar, "CUTOFF FREQUENCY" }, { Emphasis, 746, yb, KnobScale::Ten, "EMPHASIS" }, { ContourAmt, 842, yb, KnobScale::Ten, "AMOUNT OF CONTOUR" },
            { FAtk, 974, yb, KnobScale::Ten, "ATTACK" }, { FDec, 1070, yb, KnobScale::Ten, "DECAY" }, { FSus, 1166, yb, KnobScale::Ten, "SUSTAIN" },
            { LAtk, 1286, yb, KnobScale::Ten, "ATTACK" }, { LDec, 1382, yb, KnobScale::Ten, "DECAY" }, { LSus, 1478, yb, KnobScale::Ten, "SUSTAIN" },
        };
        for (const auto& k : knobs) {
            knobs_.push_back(std::make_unique<MoogKnob>(p, k.id, k.scale, k.label, laf));
            addAndMakeVisible(*knobs_.back());
            knobs_.back()->setBounds(k.cx - MoogKnob::kW / 2, k.cy - 52, MoogKnob::kW, MoogKnob::kH);
        }
        // Interruptores de palanca: id, centro x, arriba y, nombre
        struct R { int id; int cx; int top; const char* label; };
        const std::vector<R> rockers = {
            { GlideOn, 234, kRowARocker, "GLIDE" }, { OscMod, 300, kRowARocker, "OSCILLATOR MOD" }, { FiltMod, 366, kRowARocker, "FILTER MOD" },
            { Osc3Kbd, 1114, kRowARocker, "OSC 3 KEYBOARD" }, { A440, 1526, kRowAKnobTop + 20, "A-440" },
            { Osc1On, 138, kRowBRocker, "OSC 1" }, { Osc2On, 234, kRowBRocker, "OSC 2" }, { Osc3On, 330, kRowBRocker, "OSC 3" }, { NoiseOn, 426, kRowBRocker, "NOISE" },
            { NoiseType, 522, kRowBKnobTop + 34, "PINK NOISE" },
            { Kbd1, 706, kRowBRocker, "KEYBOARD 1" }, { Kbd2, 786, kRowBRocker, "KEYBOARD 2" }, { DecayOn, 1382, kRowBRocker, "DECAY" },
        };
        for (const auto& r : rockers) {
            rockers_.push_back(std::make_unique<Rocker>(p, r.id, r.label, laf));
            addAndMakeVisible(*rockers_.back());
            rockers_.back()->setBounds(r.cx - Rocker::kW / 2, r.top, Rocker::kW, Rocker::kH);
        }

        // Sonidos: lista agrupada por categoria con anterior / siguiente
        juce::String last;
        const auto& list = md::presets();
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
        keyboard_.setAvailableRange(41, 84);
        keyboard_.setLowestVisibleKey(41);
        keyboard_.setKeyWidth(50.f);
        keyboard_.setBlackNoteLengthProportion(0.62f);
        keyboard_.setBlackNoteWidthProportion(0.58f);
        keyboard_.setScrollButtonsVisible(false);
        keyboard_.setWantsKeyboardFocus(false);
        addAndMakeVisible(keyboard_);

        setSize(ModelDEditor::kWidth, ModelDEditor::kHeight);
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
        const bool g = proc_.gate.load();
        if (g != gateLit_) {
            gateLit_ = g;
            repaint(gateArea_);
        }
        const int prog = proc_.getCurrentProgram();
        if (prog + 1 != presets_.getSelectedId())
            presets_.setSelectedId(prog + 1, juce::dontSendNotification);
    }

    void resized() override
    {
        presets_.setBounds(1260, 24, 250, 28);
        prev_.setBounds(1222, 24, 34, 28);
        next_.setBounds(1514, 24, 34, 28);
        gateArea_ = { 1140, 30, 16, 16 };
        pitch_.setBounds(104, 574, 44, 190);
        mod_.setBounds(158, 574, 44, 190);
        keyboard_.setBounds(250, 574, 1300, 190);
        background_ = renderBackground(getWidth(), getHeight());
    }

    void paint(juce::Graphics& g) override
    {
        g.drawImageAt(background_, 0, 0);
        // LED del gate
        const auto led = gateArea_.toFloat().reduced(2.f);
        if (gateLit_) {
            g.setColour(MdLookAndFeel::orange().withAlpha(0.4f));
            g.fillEllipse(led.expanded(5.f));
        }
        g.setColour(gateLit_ ? juce::Colour(0xffff9a3c) : juce::Colour(0xff3c1f0c));
        g.fillEllipse(led);
        g.setColour(juce::Colours::black);
        g.drawEllipse(led, 1.f);
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
        g.setFont(MdLookAndFeel::bold(32.f, "Avenir Next"));
        g.drawText("MODEL D", kPanelX + 24, 16, 260, 40, juce::Justification::centredLeft);
        g.setColour(MdLookAndFeel::orange());
        g.fillRect(kPanelX + 24, 56, 150, 3);
        g.setColour(MdLookAndFeel::dim());
        g.setFont(MdLookAndFeel::bold(10.5f));
        g.drawText("MONOPHONIC SYNTHESIZER", kPanelX + 190, 40, 260, 16, juce::Justification::centredLeft);
        g.setFont(MdLookAndFeel::bold(9.f));
        g.drawText("GATE", 1100, 33, 34, 12, juce::Justification::centredRight);
        g.drawText("PRESET", 1222, 12, 80, 12, juce::Justification::centredLeft);

        // Secciones
        drawSection(g, "CONTROLLERS", 92, 394, kRowATitle);
        drawSection(g, "OSCILLATOR BANK", 408, 1288, kRowATitle);
        drawSection(g, "OUTPUT", 1304, 1550, kRowATitle);
        drawSection(g, "MIXER", 92, 574, kRowBTitle);
        drawSection(g, "FILTER", 594, 898, kRowBTitle);
        drawSection(g, "FILTER CONTOUR", 918, 1222, kRowBTitle);
        drawSection(g, "LOUDNESS CONTOUR", 1242, 1550, kRowBTitle);
        g.setFont(MdLookAndFeel::bold(9.f));
        g.setColour(MdLookAndFeel::dim());
        for (const auto& s2 : { std::make_pair("OSCILLATOR 1", 498), std::make_pair("OSCILLATOR 2", 780), std::make_pair("OSCILLATOR 3", 1114) })
            g.drawText(s2.first, s2.second - 70, kRowAKnobTop - 8, 140, 12, juce::Justification::centred);

        // Banco: debajo del panel, donde viven las ruedas y el teclado
        const auto bench = juce::Rectangle<float>(float(kPanelX), float(kPanelY + kPanelH + 14), float(kPanelW), float(h) - float(kPanelY + kPanelH + 14));
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff16130f), bench.getY(), juce::Colour(0xff060504), bench.getBottom()));
        g.fillRect(bench);
        g.setColour(juce::Colours::black.withAlpha(0.7f));
        g.fillRect(bench.withHeight(6.f));
        g.setColour(MdLookAndFeel::dim());
        g.setFont(MdLookAndFeel::bold(9.f));
        g.drawText("PITCH", 100, 764, 52, 12, juce::Justification::centred);
        g.drawText("MOD", 154, 764, 52, 12, juce::Justification::centred);
        return img;
    }

    ModelDProcessor& proc_;
    MdLookAndFeel& laf_;
    std::vector<std::unique_ptr<MoogKnob>> knobs_;
    std::vector<std::unique_ptr<Rocker>> rockers_;
    juce::ComboBox presets_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    MoogKeyboard keyboard_;
    Wheel pitch_, mod_;
    juce::Image background_;
    juce::Rectangle<int> gateArea_;
    bool gateLit_ = false;
};

// ---------------------------------------------------------------- Editor

ModelDEditor::ModelDEditor(ModelDProcessor& p) : juce::AudioProcessorEditor(p)
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

ModelDEditor::~ModelDEditor()
{
    stopTimer();
    content_.reset();
}

void ModelDEditor::resized()
{
    content_->setBounds(0, 0, kWidth, kHeight);
    content_->setTransform(juce::AffineTransform::scale(float(getWidth()) / float(kWidth)));
}

void ModelDEditor::timerCallback()
{
    content_->refresh();
}
