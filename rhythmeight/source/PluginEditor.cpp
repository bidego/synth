#include "PluginEditor.h"
#include <algorithm>
#include <cmath>

namespace {

// Disposicion del panel (coordenadas del diseno, 1400 x 790)
constexpr int kPanelX = 20, kPanelY = 10, kPanelW = 1360, kPanelH = 770;
constexpr int kInnerX = 60, kInnerR = 1340;
constexpr int kRow1Title = 84, kRow1Knobs = 96;
constexpr int kRow2Title = 200, kRow2Knobs = 212;
constexpr int kPatTitle = 312, kGridY = 326;
constexpr int kGroupGap = 14;

juce::Colour ink() { return ReLookAndFeel::white(); }

void drawSection(juce::Graphics& g, const juce::String& name, int x0, int x1, int y)
{
    const auto font = ReLookAndFeel::bold(10.f);
    g.setFont(font);
    const float tw = juce::GlyphArrangement::getStringWidth(font, name) + 10.f;
    const float mid = float(x0 + x1) * 0.5f;
    g.setColour(ink());
    g.drawText(name, juce::Rectangle<float>(mid - tw * 0.5f, float(y) - 8.f, tw, 16.f), juce::Justification::centred);
    g.setColour(juce::Colour(0xffb9b6aa));
    g.fillRect(float(x0), float(y), std::max(0.f, mid - tw * 0.5f - float(x0)), 1.5f);
    g.fillRect(mid + tw * 0.5f, float(y), std::max(0.f, float(x1) - (mid + tw * 0.5f)), 1.5f);
    g.fillRect(float(x0), float(y), 1.5f, 8.f);
    g.fillRect(float(x1) - 1.5f, float(y), 1.5f, 8.f);
}

} // namespace

// ---------------------------------------------------------------- ReKnob

ReKnob::ReKnob(RhythmEightProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf) : label_(label)
{
    const auto& info = re::paramInfo(paramId);
    slider_.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    slider_.setRotaryParameters(ReLookAndFeel::kStart, ReLookAndFeel::kEnd, true);
    slider_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    slider_.setLookAndFeel(&laf);
    slider_.setPopupDisplayEnabled(true, true, nullptr);
    slider_.setMouseDragSensitivity(220);
    slider_.setDoubleClickReturnValue(true, double(info.def));
    addAndMakeVisible(slider_);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.apvts, info.id, slider_);
}

void ReKnob::resized()
{
    slider_.setBounds(14, 12, 44, 44);
}

void ReKnob::paint(juce::Graphics& g)
{
    const juce::Point<float> c(float(kW) * 0.5f, 34.f);   // centro de la perilla
    g.setColour(ink().withAlpha(0.9f));
    for (int i = 0; i <= 10; ++i) {
        const float a = ReLookAndFeel::kStart + float(i) / 10.f * (ReLookAndFeel::kEnd - ReLookAndFeel::kStart);
        const bool major = i % 5 == 0;
        const float r0 = 25.f, r1 = major ? 31.f : 28.f;
        g.drawLine(c.x + std::sin(a) * r0, c.y - std::cos(a) * r0, c.x + std::sin(a) * r1, c.y - std::cos(a) * r1, major ? 1.5f : 1.f);
    }
    g.setColour(ink());
    g.setFont(ReLookAndFeel::bold(9.5f));
    g.drawFittedText(label_, 2, 62, kW - 4, 20, juce::Justification::centredTop, 1);
}

// ---------------------------------------------------------------- StepGrid

bool StepGrid::cellAt(juce::Point<int> p, int& inst, int& step) const
{
    inst = (p.y - kTop) / kRowPitch;
    if (p.y < kTop || inst >= re::kInst || (p.y - kTop) % kRowPitch >= kCellH)
        return false;
    for (int s = 0; s < re::kSteps; ++s)
        if (p.x >= cellX(s) && p.x < cellX(s) + kCellW) {
            step = s;
            return true;
        }
    return false;
}

void StepGrid::mouseDown(const juce::MouseEvent& e)
{
    const auto p = e.getPosition();
    int inst = 0, step = 0;
    if (p.x < kLabelW && p.y >= kTop && (p.y - kTop) / kRowPitch < re::kInst && (p.y - kTop) % kRowPitch < kCellH) {
        flash_ = (p.y - kTop) / kRowPitch;
        proc_.triggerFromUi(flash_);
        repaint();
        return;
    }
    if (cellAt(p, inst, step)) {
        paintValue_ = (proc_.getStep(inst, step) + 1) % 3;   // vacio -> golpe -> acento -> vacio
        proc_.setStep(inst, step, paintValue_);
        lastInst_ = inst;
        lastStep_ = step;
        repaint();
    } else {
        lastInst_ = lastStep_ = -1;
    }
}

void StepGrid::mouseDrag(const juce::MouseEvent& e)
{
    int inst = 0, step = 0;
    if (flash_ < 0 && cellAt(e.getPosition(), inst, step) && (inst != lastInst_ || step != lastStep_)) {
        lastInst_ = inst;
        lastStep_ = step;
        if (proc_.getStep(inst, step) != paintValue_) {
            proc_.setStep(inst, step, paintValue_);
            repaint();
        }
    }
}

void StepGrid::paint(juce::Graphics& g)
{
    const int cur = proc_.currentStep.load();
    const int len = proc_.patternLength.load();

    for (int s = 0; s < re::kSteps; ++s) {
        const float cx = float(cellX(s) + kCellW / 2);
        const bool inLoop = s < len;
        // LED del paso actual
        const auto led = juce::Rectangle<float>(9.f, 9.f).withCentre({ cx, 8.f });
        if (s == cur) {
            g.setColour(ReLookAndFeel::red().withAlpha(0.45f));
            g.fillEllipse(led.expanded(5.f));
        }
        g.setColour(s == cur ? juce::Colour(0xffff5a45) : juce::Colour(0xff451a14).withAlpha(inLoop ? 1.f : 0.5f));
        g.fillEllipse(led);
        g.setColour(juce::Colours::black);
        g.drawEllipse(led, 1.f);
        // Numero del paso
        g.setColour(ink().withAlpha(inLoop ? 0.85f : 0.35f));
        g.setFont(ReLookAndFeel::bold(10.f));
        g.drawText(juce::String(s + 1), juce::Rectangle<float>(cx - 14.f, 16.f, 28.f, 14.f), juce::Justification::centred);
    }

    for (int inst = 0; inst < re::kInst; ++inst) {
        const int y = rowY(inst);
        // Rotulo de la voz: se ve como un boton que dispara el golpe
        const auto label = juce::Rectangle<float>(0.5f, float(y) + 0.5f, float(kLabelW), float(kCellH) - 1.f);
        const bool lit = flash_ == inst;
        g.setGradientFill(juce::ColourGradient::vertical(lit ? juce::Colour(0xff6a5a3a) : juce::Colour(0xff2f3033), label.getY(), juce::Colour(0xff17181a), label.getBottom()));
        g.fillRoundedRectangle(label, 3.f);
        g.setColour(lit ? ReLookAndFeel::orange() : juce::Colour(0xff626364));
        g.drawRoundedRectangle(label, 3.f, 1.f);
        g.setColour(ink());
        g.setFont(ReLookAndFeel::bold(12.f));
        g.drawText(juce::String(re::instCode(inst)).toUpperCase(), juce::Rectangle<float>(label.getX() + 8.f, label.getY(), 26.f, label.getHeight()), juce::Justification::centredLeft);
        g.setColour(ReLookAndFeel::dim());
        g.setFont(ReLookAndFeel::bold(9.f));
        g.drawText(juce::String(re::instName(inst)).toUpperCase(), juce::Rectangle<float>(label.getX() + 34.f, label.getY(), label.getWidth() - 38.f, label.getHeight()), juce::Justification::centredLeft);

        for (int s = 0; s < re::kSteps; ++s) {
            const auto cell = juce::Rectangle<float>(float(cellX(s)), float(y), float(kCellW), float(kCellH));
            const auto base = ReLookAndFeel::groupColour(s / 4);
            const int v = proc_.getStep(inst, s);
            const float fade = s < len ? 1.f : 0.35f;
            juce::Colour top, bottom;
            if (v == 2) {            // acento: el mas brillante
                top = base.brighter(0.5f);
                bottom = base.brighter(0.1f);
            } else if (v == 1) {     // golpe
                top = base.withMultipliedBrightness(0.82f);
                bottom = base.withMultipliedBrightness(0.6f);
            } else {                 // vacio: el boton apagado, con un tinte del color de su grupo
                top = base.withMultipliedBrightness(0.3f).withMultipliedSaturation(0.8f);
                bottom = base.withMultipliedBrightness(0.18f);
            }
            if (v == 2) {
                g.setColour(base.withAlpha(0.35f * fade));
                g.fillRoundedRectangle(cell.expanded(2.5f), 5.f);
            }
            g.setGradientFill(juce::ColourGradient::vertical(top.withAlpha(fade), cell.getY(), bottom.withAlpha(fade), cell.getBottom()));
            g.fillRoundedRectangle(cell, 3.f);
            if (v > 0) {
                g.setColour(juce::Colours::white.withAlpha((v == 2 ? 0.55f : 0.28f) * fade));
                g.drawLine(cell.getX() + 4.f, cell.getY() + 1.5f, cell.getRight() - 4.f, cell.getY() + 1.5f, 1.f);
            }
            if (v == 2) {            // marca de acento
                g.setColour(juce::Colours::white.withAlpha(0.9f * fade));
                g.fillEllipse(juce::Rectangle<float>(7.f, 7.f).withCentre(cell.getCentre()));
            }
            g.setColour(juce::Colours::black.withAlpha(0.8f * fade));
            g.drawRoundedRectangle(cell, 3.f, 1.f);
            if (s == cur) {
                g.setColour(juce::Colours::white.withAlpha(0.22f));
                g.fillRoundedRectangle(cell, 3.f);
            }
        }
    }
}

// ---------------------------------------------------------------- Content

class RhythmEightEditor::Content : public juce::Component {
public:
    Content(RhythmEightProcessor& p, ReLookAndFeel& laf)
        : proc_(p), laf_(laf), grid_(p), run_("RUN")
    {
        using namespace re;
        // Perillas por voz: id, nombre; las posiciones salen del orden y la anchura de cada grupo
        struct K { int id; const char* label; };
        struct G { const char* title; int row; std::vector<K> knobs; };
        const std::vector<G> groups = {
            { "BASS DRUM", 1, { { BdLevel, "LEVEL" }, { BdTune, "TUNE" }, { BdDecay, "DECAY" }, { BdTone, "TONE" } } },
            { "SNARE DRUM", 1, { { SdLevel, "LEVEL" }, { SdTune, "TUNE" }, { SdTone, "TONE" }, { SdSnappy, "SNAPPY" } } },
            { "LOW TOM", 1, { { LtLevel, "LEVEL" }, { LtTune, "TUNE" }, { LtDecay, "DECAY" } } },
            { "MID TOM", 1, { { MtLevel, "LEVEL" }, { MtTune, "TUNE" }, { MtDecay, "DECAY" } } },
            { "HI TOM", 1, { { HtLevel, "LEVEL" }, { HtTune, "TUNE" }, { HtDecay, "DECAY" } } },
            { "RIM SHOT", 2, { { RsLevel, "LEVEL" } } },
            { "CLAVES", 2, { { ClLevel, "LEVEL" } } },
            { "HAND CLAP", 2, { { CpLevel, "LEVEL" } } },
            { "MARACAS", 2, { { MaLevel, "LEVEL" } } },
            { "COWBELL", 2, { { CbLevel, "LEVEL" }, { CbTune, "TUNE" } } },
            { "CYMBAL", 2, { { CyLevel, "LEVEL" }, { CyTone, "TONE" }, { CyDecay, "DECAY" } } },
            { "OPEN HAT", 2, { { OhLevel, "LEVEL" }, { OhDecay, "DECAY" } } },
            { "CLOSED HAT", 2, { { ChLevel, "LEVEL" } } },
        };
        int x1 = kInnerX, x2 = kInnerX;
        for (const auto& grp : groups) {
            int& x = grp.row == 1 ? x1 : x2;
            const int top = grp.row == 1 ? kRow1Knobs : kRow2Knobs;
            const int w = int(grp.knobs.size()) * ReKnob::kW;
            sections_.push_back({ grp.title, x, x + w - 4, grp.row == 1 ? kRow1Title : kRow2Title });
            for (const auto& k : grp.knobs) {
                addKnob(k.id, k.label, x, top);
                x += ReKnob::kW;
            }
            x += kGroupGap;
        }
        // Seccion maestra: a la derecha de la segunda fila
        int xm = kInnerR - 4 * ReKnob::kW;
        sections_.push_back({ "MASTER", xm, kInnerR - 4, kRow2Title });
        for (const K& k : { K { Tempo, "TEMPO" }, K { Shuffle, "SHUFFLE" }, K { Accent, "ACCENT" }, K { Volume, "VOLUME" } }) {
            addKnob(k.id, k.label, xm, kRow2Knobs);
            xm += ReKnob::kW;
        }

        // Selectores de largo y sincronia, y el boton RUN
        setupCombo(steps_, Steps, stepsAttachment_);
        setupCombo(sync_, Sync, syncAttachment_);
        run_.setLookAndFeel(&laf);
        run_.setClickingTogglesState(true);
        addAndMakeVisible(run_);
        runAttachment_ = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment>(p.apvts, paramInfo(Run).id, run_);

        // Sonidos: lista agrupada por categoria con anterior / siguiente
        juce::String last;
        const auto& list = re::presets();
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

        addAndMakeVisible(grid_);
        setSize(RhythmEightEditor::kWidth, RhythmEightEditor::kHeight);
        refresh();
    }

    ~Content() override
    {
        presets_.setLookAndFeel(nullptr);
        prev_.setLookAndFeel(nullptr);
        next_.setLookAndFeel(nullptr);
        steps_.setLookAndFeel(nullptr);
        sync_.setLookAndFeel(nullptr);
        run_.setLookAndFeel(nullptr);
    }

    void refresh()
    {
        const int cur = proc_.currentStep.load();
        const int rev = proc_.patternRevision();
        const int len = proc_.patternLength.load();
        const int shown = shownBpm();
        const bool host = sync_.getSelectedId() == 2;
        if (cur != lastStep_ || rev != lastRev_ || len != lastLen_) {
            lastStep_ = cur;
            lastRev_ = rev;
            lastLen_ = len;
            grid_.repaint();
        }
        if (shown != lastBpm_ || host != lastHost_) {
            lastBpm_ = shown;
            lastHost_ = host;
            repaint(bpmArea_.expanded(4));
        }
        const int prog = proc_.getCurrentProgram();
        if (prog + 1 != presets_.getSelectedId())
            presets_.setSelectedId(prog + 1, juce::dontSendNotification);
    }

    void resized() override
    {
        run_.setBounds(470, 22, 84, 30);
        bpmArea_ = { 570, 20, 96, 34 };
        sync_.setBounds(690, 24, 110, 28);
        steps_.setBounds(820, 24, 80, 28);
        prev_.setBounds(1018, 24, 34, 28);
        presets_.setBounds(1056, 24, 246, 28);
        next_.setBounds(1306, 24, 34, 28);
        grid_.setBounds(kInnerX, kGridY, kInnerR - kInnerX, StepGrid::kGridH);
        background_ = renderBackground(getWidth(), getHeight());
    }

    void paint(juce::Graphics& g) override
    {
        g.drawImageAt(background_, 0, 0);
        // Pantalla del tempo
        g.setColour(juce::Colour(0xff0a0b0c));
        g.fillRoundedRectangle(bpmArea_.toFloat(), 4.f);
        g.setColour(juce::Colour(0xff5a5b5c));
        g.drawRoundedRectangle(bpmArea_.toFloat().reduced(0.5f), 4.f, 1.f);
        g.setColour(lastHost_ ? ReLookAndFeel::yellow() : juce::Colour(0xffff7a3a));
        g.setFont(ReLookAndFeel::bold(22.f, "Courier New"));
        g.drawText(juce::String(lastBpm_), bpmArea_.withTrimmedRight(34).withTrimmedLeft(4), juce::Justification::centredRight);
        g.setFont(ReLookAndFeel::bold(9.f));
        g.setColour(ReLookAndFeel::dim());
        g.drawText("BPM", bpmArea_.withLeft(bpmArea_.getRight() - 32), juce::Justification::centredLeft);
    }

private:
    struct Section { juce::String name; int x0, x1, y; };

    void addKnob(int id, const char* label, int x, int top)
    {
        knobs_.push_back(std::make_unique<ReKnob>(proc_, id, label, laf_));
        addAndMakeVisible(*knobs_.back());
        knobs_.back()->setBounds(x, top, ReKnob::kW, ReKnob::kH);
    }

    void setupCombo(juce::ComboBox& box, int paramId, std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment>& attachment)
    {
        const auto& info = re::paramInfo(paramId);
        box.addItemList(juce::StringArray::fromTokens(info.labels, "|", ""), 1);
        box.setLookAndFeel(&laf_);
        addAndMakeVisible(box);
        attachment = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(proc_.apvts, info.id, box);
    }

    /** BPM a mostrar: el del anfitrion con Sync = Host, o el de la perilla Tempo. */
    int shownBpm() const
    {
        if (proc_.apvts.getRawParameterValue(re::paramInfo(re::Sync).id)->load() >= 0.5f)
            return juce::roundToInt(proc_.bpm.load());
        return juce::roundToInt(40.f + 200.f * proc_.apvts.getRawParameterValue(re::paramInfo(re::Tempo).id)->load());
    }

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
        g.fillAll(juce::Colour(0xff0d0d0e));

        // Chasis de carbon con un destello suave arriba
        const auto panel = juce::Rectangle<float>(float(kPanelX), float(kPanelY), float(kPanelW), float(kPanelH));
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff3a3c3f), panel.getY(), juce::Colour(0xff232426), panel.getBottom()));
        g.fillRoundedRectangle(panel, 8.f);
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colours::white.withAlpha(0.08f), panel.getY(), juce::Colours::white.withAlpha(0.0f), panel.getY() + 180.f));
        g.fillRoundedRectangle(panel, 8.f);
        juce::Random rnd(11);
        for (int i = 0; i < 6000; ++i) {   // grano fino de la pintura
            g.setColour((rnd.nextBool() ? juce::Colours::white : juce::Colours::black).withAlpha(0.035f));
            g.fillRect(panel.getX() + rnd.nextFloat() * panel.getWidth(), panel.getY() + rnd.nextFloat() * panel.getHeight(), 1.f, 1.f);
        }
        g.setColour(juce::Colour(0xff5a5c5f));
        g.drawRoundedRectangle(panel, 8.f, 1.5f);
        g.setColour(juce::Colours::white.withAlpha(0.14f));
        g.drawLine(panel.getX() + 10.f, panel.getY() + 1.5f, panel.getRight() - 10.f, panel.getY() + 1.5f, 1.f);
        // Tornillos de las esquinas
        for (const auto p : { juce::Point<float>(panel.getX() + 14.f, panel.getY() + 14.f), juce::Point<float>(panel.getRight() - 14.f, panel.getY() + 14.f),
                              juce::Point<float>(panel.getX() + 14.f, panel.getBottom() - 14.f), juce::Point<float>(panel.getRight() - 14.f, panel.getBottom() - 14.f) }) {
            g.setColour(juce::Colour(0xff17181a));
            g.fillEllipse(juce::Rectangle<float>(9.f, 9.f).withCentre(p));
            g.setColour(juce::Colour(0xff77797c));
            g.drawEllipse(juce::Rectangle<float>(9.f, 9.f).withCentre(p), 1.f);
            g.drawLine(p.x - 3.f, p.y + 1.f, p.x + 3.f, p.y - 1.f, 1.2f);
        }

        // Marca y tira de colores como el panel clasico
        g.setColour(ink());
        g.setFont(ReLookAndFeel::bold(30.f, "Avenir Next"));
        g.drawText("RHYTHM EIGHT", kInnerX, 14, 320, 38, juce::Justification::centredLeft);
        const juce::Colour stripe[4] = { ReLookAndFeel::red(), ReLookAndFeel::orange(), ReLookAndFeel::yellow(), ReLookAndFeel::cream() };
        for (int i = 0; i < 4; ++i) {
            g.setColour(stripe[i]);
            g.fillRect(kInnerX + i * 40, 54, 40, 4);
        }
        g.setColour(ReLookAndFeel::dim());
        g.setFont(ReLookAndFeel::bold(10.f));
        g.drawText("ANALOG RHYTHM COMPOSER", kInnerX + 176, 46, 220, 14, juce::Justification::centredLeft);
        g.setFont(ReLookAndFeel::bold(9.f));
        g.drawText("TEMPO", 570, 9, 96, 12, juce::Justification::centred);
        g.drawText("SYNC", 690, 11, 110, 12, juce::Justification::centred);
        g.drawText("LENGTH", 820, 11, 80, 12, juce::Justification::centred);
        g.drawText("PRESET", 1056, 11, 246, 12, juce::Justification::centred);

        // Secciones
        for (const auto& s : sections_)
            drawSection(g, s.name, s.x0, s.x1, s.y);
        drawSection(g, "PATTERN  -  16 STEP SEQUENCER", kInnerX, kInnerR, kPatTitle);
        g.setColour(ReLookAndFeel::dim());
        g.setFont(ReLookAndFeel::bold(9.f));
        g.drawText("CLICK A STEP: HIT / ACCENT / OFF   -   DRAG TO PAINT   -   CLICK A VOICE NAME TO PLAY IT   -   MIDI: GM DRUM NOTES", kInnerX, kGridY + StepGrid::kGridH + 2, kInnerR - kInnerX, 14, juce::Justification::centred);
        return img;
    }

    RhythmEightProcessor& proc_;
    ReLookAndFeel& laf_;
    std::vector<std::unique_ptr<ReKnob>> knobs_;
    std::vector<Section> sections_;
    StepGrid grid_;
    juce::ComboBox presets_, steps_, sync_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    juce::ToggleButton run_;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> stepsAttachment_, syncAttachment_;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> runAttachment_;
    juce::Image background_;
    juce::Rectangle<int> bpmArea_;
    int lastStep_ = -2, lastRev_ = -1, lastLen_ = -1, lastBpm_ = 0;
    bool lastHost_ = false;
};

// ---------------------------------------------------------------- Editor

RhythmEightEditor::RhythmEightEditor(RhythmEightProcessor& p) : juce::AudioProcessorEditor(p)
{
    content_ = std::make_unique<Content>(p, laf_);
    addAndMakeVisible(*content_);
    constrainer_.setFixedAspectRatio(double(kWidth) / double(kHeight));
    constrainer_.setSizeLimits(kWidth / 2, kHeight / 2, kWidth * 3 / 2, kHeight * 3 / 2);
    setConstrainer(&constrainer_);
    setResizable(true, true);
    setSize(kWidth * 3 / 4, kHeight * 3 / 4);
    startTimerHz(30);
}

RhythmEightEditor::~RhythmEightEditor()
{
    stopTimer();
    content_.reset();
}

void RhythmEightEditor::resized()
{
    content_->setBounds(0, 0, kWidth, kHeight);
    content_->setTransform(juce::AffineTransform::scale(float(getWidth()) / float(kWidth)));
}

void RhythmEightEditor::timerCallback()
{
    content_->refresh();
}
