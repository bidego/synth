#include "PluginEditor.h"

namespace {

constexpr int kCY = 178;

juce::Colour ink() { return AcLookAndFeel::ink(); }

void drawSection(juce::Graphics& g, const juce::String& name, int x0, int x1, int y)
{
    g.setFont(AcLookAndFeel::bold(11.f));
    const float tw = juce::GlyphArrangement::getStringWidth(AcLookAndFeel::bold(11.f), name) + 18.f;
    const float mid = float(x0 + x1) * 0.5f;
    g.setColour(ink());
    g.drawText(name, juce::Rectangle<float>(mid - tw * 0.5f, float(y) - 8.f, tw, 16.f), juce::Justification::centred);
    g.fillRect(float(x0), float(y), mid - tw * 0.5f - float(x0), 1.5f);
    g.fillRect(mid + tw * 0.5f, float(y), float(x1) - (mid + tw * 0.5f), 1.5f);
    g.fillRect(float(x0), float(y), 1.5f, 8.f);
    g.fillRect(float(x1) - 1.5f, float(y), 1.5f, 8.f);
}

void drawWavePath(juce::Graphics& g, bool square, juce::Rectangle<float> r)
{
    juce::Path p;
    auto pt = [&](float fx, float fy) { return juce::Point<float>(r.getX() + fx * r.getWidth(), r.getY() + fy * r.getHeight()); };
    if (square) { p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.f, 0.1f)); p.lineTo(pt(0.5f, 0.1f)); p.lineTo(pt(0.5f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); }
    else { p.startNewSubPath(pt(0.f, 0.9f)); p.lineTo(pt(0.7f, 0.1f)); p.lineTo(pt(0.7f, 0.9f)); p.lineTo(pt(1.f, 0.9f)); }
    g.setColour(ink());
    g.strokePath(p, juce::PathStrokeType(1.6f, juce::PathStrokeType::mitered, juce::PathStrokeType::butt));
}

} // namespace

// ---------------------------------------------------------------- AcKnob

AcKnob::AcKnob(AcidProcessor& p, int paramId, bool bipolar, const juce::String& label, juce::LookAndFeel& laf)
    : bipolar_(bipolar), label_(label)
{
    const auto& info = ac::paramInfo(paramId);
    slider_.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    slider_.setRotaryParameters(AcLookAndFeel::kStart, AcLookAndFeel::kEnd, true);
    slider_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    slider_.setLookAndFeel(&laf);
    slider_.setPopupDisplayEnabled(true, true, nullptr);
    slider_.setMouseDragSensitivity(220);
    slider_.setDoubleClickReturnValue(true, double(info.def));
    addAndMakeVisible(slider_);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.apvts, info.id, slider_);
}

void AcKnob::resized()
{
    slider_.setBounds(22, 22, 60, 60);
}

void AcKnob::paint(juce::Graphics& g)
{
    const juce::Point<float> c(float(kW) * 0.5f, 52.f);
    auto at = [&](float prop, float radius) {
        const float a = AcLookAndFeel::kStart + prop * (AcLookAndFeel::kEnd - AcLookAndFeel::kStart);
        return juce::Point<float>(c.x + std::sin(a) * radius, c.y - std::cos(a) * radius);
    };
    g.setColour(ink());
    for (int i = 0; i <= 10; ++i) {
        const bool major = i % 5 == 0;
        const auto p0 = at(float(i) / 10.f, major ? 33.f : 34.f), p1 = at(float(i) / 10.f, major ? 41.f : 38.f);
        g.drawLine(p0.x, p0.y, p1.x, p1.y, major ? 1.6f : 1.1f);
    }
    g.setFont(AcLookAndFeel::bold(10.f));
    for (int i = 0; i <= 10; i += 5) {
        const juce::String t = !bipolar_ ? juce::String(i) : (i - 5 > 0 ? "+" : "") + juce::String(i - 5);
        const auto p = at(float(i) / 10.f, i == 5 ? 47.f : 45.f);
        g.drawText(t, juce::Rectangle<float>(22.f, 12.f).withCentre(p), juce::Justification::centred);
    }
    g.setFont(AcLookAndFeel::bold(9.5f));
    g.drawFittedText(label_, 6, 88, kW - 12, 28, juce::Justification::centredTop, 2);
}

// ---------------------------------------------------------------- AcRocker

AcRocker::AcRocker(AcidProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf)
{
    setLookAndFeel(&laf);
    setButtonText(label);
    setClickingTogglesState(true);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment>(p.apvts, ac::paramInfo(paramId).id, *this);
}

// ---------------------------------------------------------------- AcWheel

void AcWheel::setValue(float v)
{
    value_ = juce::jlimit(-1.f, 1.f, v);
    repaint();
    if (onChange)
        onChange(value_);
}

void AcWheel::paint(juce::Graphics& g)
{
    const auto r = getLocalBounds().toFloat();
    g.setColour(juce::Colour(0xff050506));
    g.fillRoundedRectangle(r, 5.f);
    const auto w = r.reduced(4.f, 5.f);
    juce::ColourGradient body(juce::Colour(0xff0d0d0f), w.getX(), 0.f, juce::Colour(0xff0d0d0f), w.getRight(), 0.f, false);
    body.addColour(0.35, juce::Colour(0xff5e5e64));
    body.addColour(0.5, juce::Colour(0xff77777d));
    body.addColour(0.7, juce::Colour(0xff2b2b2f));
    g.setGradientFill(body);
    g.fillRoundedRectangle(w, 3.f);
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
    g.setColour(AcLookAndFeel::orange());
    g.fillRect(r.getX() + 1.f, r.getCentreY() - 1.f, 4.f, 2.f);
    g.fillRect(r.getRight() - 5.f, r.getCentreY() - 1.f, 4.f, 2.f);
}

// ---------------------------------------------------------------- Content

class AcidEditor::Content : public juce::Component {
public:
    Content(AcidProcessor& p, AcLookAndFeel& laf)
        : proc_(p), keyboard_(p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard)
    {
        using namespace ac;
        struct K { int id; int cx; bool bipolar; const char* label; };
        const std::vector<K> knobs = {
            { Tune, 208, true, "TUNING" },
            { Cutoff, 330, false, "CUTOFF FREQUENCY" }, { Resonance, 440, false, "RESONANCE" }, { EnvMod, 550, false, "ENV MOD" }, { Decay, 660, false, "DECAY" },
            { Accent, 774, false, "ACCENT" }, { AccentVel, 886, false, "VELOCITY THRESHOLD" },
            { SlideTime, 1018, false, "SLIDE TIME" }, { Drive, 1124, false, "DRIVE" },
            { Volume, 1244, false, "VOLUME" },
        };
        for (const auto& k : knobs) {
            knobs_.push_back(std::make_unique<AcKnob>(p, k.id, k.bipolar, k.label, laf));
            addAndMakeVisible(*knobs_.back());
            knobs_.back()->setBounds(k.cx - AcKnob::kW / 2, kCY - 52, AcKnob::kW, AcKnob::kH);
        }
        wave_ = std::make_unique<AcRocker>(p, Waveform, "", laf);
        addAndMakeVisible(*wave_);
        wave_->setBounds(106 - AcRocker::kW / 2, 150, AcRocker::kW, AcRocker::kH);

        juce::String last;
        const auto& list = ac::presets();
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

        addAndMakeVisible(pitch_);
        pitch_.onChange = [this](float v) { proc_.setUiBend(v); };
        keyboard_.setLookAndFeel(&laf);
        keyboard_.setAvailableRange(36, 72);
        keyboard_.setLowestVisibleKey(36);
        keyboard_.setKeyWidth(52.f);
        keyboard_.setBlackNoteLengthProportion(0.62f);
        keyboard_.setBlackNoteWidthProportion(0.6f);
        keyboard_.setScrollButtonsVisible(false);
        keyboard_.setWantsKeyboardFocus(false);
        addAndMakeVisible(keyboard_);
        setSize(AcidEditor::kWidth, AcidEditor::kHeight);
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
        const bool g = proc_.gate.load(), a = proc_.accentLit.load() && g;
        if (g != gateLit_ || a != accentLit_) {
            gateLit_ = g;
            accentLit_ = a;
            repaint(ledArea_);
        }
        const int prog = proc_.getCurrentProgram();
        if (prog + 1 != presets_.getSelectedId())
            presets_.setSelectedId(prog + 1, juce::dontSendNotification);
    }

    void resized() override
    {
        presets_.setBounds(1050, 28, 240, 28);
        prev_.setBounds(1012, 28, 34, 28);
        next_.setBounds(1294, 28, 34, 28);
        pitch_.setBounds(64, 338, 44, 190);
        keyboard_.setBounds(136, 338, 1144, 190);
        ledArea_ = { 790, 36, 170, 24 };
        background_ = renderBackground(getWidth(), getHeight());
    }

    void paint(juce::Graphics& g) override
    {
        g.drawImageAt(background_, 0, 0);
        auto led = [&](juce::Rectangle<float> r, bool on, juce::Colour lit, juce::Colour dark) {
            if (on) {
                g.setColour(lit.withAlpha(0.4f));
                g.fillEllipse(r.expanded(5.f));
            }
            g.setColour(on ? lit : dark);
            g.fillEllipse(r);
            g.setColour(juce::Colours::black);
            g.drawEllipse(r, 1.f);
        };
        led({ 838.f, 41.f, 12.f, 12.f }, accentLit_, juce::Colour(0xffff4a2e), juce::Colour(0xff4b1411));
        led({ 934.f, 41.f, 12.f, 12.f }, gateLit_, juce::Colour(0xffff9a3c), juce::Colour(0xff5a2a14));
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
        // Chasis gris oscuro
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff34363b), 0.f, juce::Colour(0xff212327), float(h)));
        g.fillAll();

        // Tapa plateada con cepillado vertical
        const auto top = juce::Rectangle<float>(22.f, 10.f, 1296.f, 308.f);
        g.setColour(juce::Colours::black.withAlpha(0.45f));
        g.fillRoundedRectangle(top.translated(0.f, 6.f).expanded(2.f), 10.f);
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xffd4d7db), top.getY(), juce::Colour(0xff9fa3a9), top.getBottom()));
        g.fillRoundedRectangle(top, 8.f);
        juce::Random rnd(11);
        {
            juce::Graphics::ScopedSaveState save(g);
            g.reduceClipRegion(top.toNearestInt());
            for (int i = 0; i < 1500; ++i) {
                const float x = top.getX() + rnd.nextFloat() * top.getWidth();
                g.setColour((rnd.nextBool() ? juce::Colours::white : juce::Colours::black).withAlpha(0.04f + rnd.nextFloat() * 0.07f));
                g.drawLine(x, top.getY(), x, top.getBottom(), 1.f);
            }
            g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::white.withAlpha(0.5f), top.getY(), juce::Colours::white.withAlpha(0.0f), top.getY() + 90.f));
            g.fillRect(top);
            g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::black.withAlpha(0.0f), top.getBottom() - 30.f, juce::Colours::black.withAlpha(0.25f), top.getBottom()));
            g.fillRect(top);
        }
        g.setColour(juce::Colour(0xff6b6e74));
        g.drawRoundedRectangle(top, 8.f, 1.f);
        g.setColour(juce::Colours::white.withAlpha(0.8f));
        g.drawLine(top.getX() + 8.f, top.getY() + 1.f, top.getRight() - 8.f, top.getY() + 1.f, 1.f);

        // Marca
        g.setColour(ink());
        g.setFont(juce::Font(juce::FontOptions("Avenir Next", 34.f, juce::Font::bold | juce::Font::italic)));
        g.drawText("ACID LINE", 56, 22, 260, 40, juce::Justification::centredLeft);
        const juce::Colour stripe[3] = { juce::Colour(0xffd8402a), juce::Colour(0xffee8a1d), juce::Colour(0xfff2c21c) };
        for (int i = 0; i < 3; ++i) {
            g.setColour(stripe[i]);
            g.fillRect(58.f + float(i) * 160.f / 3.f, 64.f, 160.f / 3.f, 5.f);
        }
        g.setColour(juce::Colour(0xff33353a));
        g.setFont(AcLookAndFeel::bold(10.5f));
        g.drawText("BASS SYNTHESIZER", 240, 52, 260, 16, juce::Justification::centredLeft);
        g.setFont(AcLookAndFeel::bold(9.f));
        g.drawText("ACCENT", 790, 44, 44, 12, juce::Justification::centredLeft);
        g.drawText("GATE", 900, 44, 30, 12, juce::Justification::centredLeft);
        g.drawText("PRESET", 1012, 14, 80, 12, juce::Justification::centredLeft);

        drawSection(g, "OSCILLATOR", 40, 262, 100);
        drawSection(g, "FILTER AND CONTOUR", 278, 710, 100);
        drawSection(g, "ACCENT", 726, 950, 100);
        drawSection(g, "SLIDE AND DRIVE", 966, 1170, 100);
        drawSection(g, "OUTPUT", 1186, 1300, 100);

        // Forma de onda: sierra arriba, cuadrada abajo
        drawWavePath(g, false, { 91.f, 126.f, 30.f, 18.f });
        drawWavePath(g, true, { 91.f, 222.f, 30.f, 18.f });
        g.setColour(ink());
        g.setFont(AcLookAndFeel::bold(9.5f));
        g.drawText("WAVEFORM", 56, 244, 100, 12, juce::Justification::centred);

        g.setColour(AcLookAndFeel::dim());
        g.setFont(AcLookAndFeel::bold(9.f));
        g.drawText("PITCH", 60, 530, 52, 12, juce::Justification::centred);
        return img;
    }

    AcidProcessor& proc_;
    std::vector<std::unique_ptr<AcKnob>> knobs_;
    std::unique_ptr<AcRocker> wave_;
    juce::ComboBox presets_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    AcKeyboard keyboard_;
    AcWheel pitch_;
    juce::Image background_;
    juce::Rectangle<int> ledArea_;
    bool gateLit_ = false, accentLit_ = false;
};

// ---------------------------------------------------------------- Editor

AcidEditor::AcidEditor(AcidProcessor& p) : juce::AudioProcessorEditor(p)
{
    content_ = std::make_unique<Content>(p, laf_);
    addAndMakeVisible(*content_);
    constrainer_.setFixedAspectRatio(double(kWidth) / double(kHeight));
    constrainer_.setSizeLimits(kWidth / 2, kHeight / 2, kWidth * 3 / 2, kHeight * 3 / 2);
    setConstrainer(&constrainer_);
    setResizable(true, true);
    setSize(kWidth * 4 / 5, kHeight * 4 / 5);
    startTimerHz(25);
}

AcidEditor::~AcidEditor()
{
    stopTimer();
    content_.reset();
}

void AcidEditor::resized()
{
    content_->setBounds(0, 0, kWidth, kHeight);
    content_->setTransform(juce::AffineTransform::scale(float(getWidth()) / float(kWidth)));
}

void AcidEditor::timerCallback()
{
    content_->refresh();
}
