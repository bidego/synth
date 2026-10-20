#include "PluginEditor.h"

namespace {

// Nombres cortos del panel (indexados por juno::ParamId)
const char* const kSliderLabel[juno::NumParams] = {
    "PORTA", "", "", "BEND DCO", "BEND VCF", "RATE", "DELAY", "LFO", "PWM", "", "", "", "", "SUB", "NOISE", "",
    "FREQ", "RES", "ENV", "LFO", "KYBD", "", "LEVEL", "", "A", "D", "S", "R", "VCA", "VCF", ""
};
const char* const kSwitchLabel[juno::NumParams] = {
    "", "PORTAMENTO", "VOICES", "", "", "", "", "", "", "PWM", "RANGE", "PULSE", "SAW", "", "", "HPF",
    "", "", "", "", "", "ENV", "", "VCA", "", "", "", "", "", "", "CHORUS"
};

juce::Font bold(float h) { return juce::Font(juce::FontOptions(h, juce::Font::bold)); }

} // namespace

// ---------------------------------------------------------------- PanelSlider

PanelSlider::PanelSlider(JunoProcessor& p, int paramId, juce::LookAndFeel& laf)
    : label_(kSliderLabel[paramId])
{
    slider_.setSliderStyle(juce::Slider::LinearVertical);
    slider_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    slider_.setLookAndFeel(&laf);
    slider_.setPopupDisplayEnabled(true, true, nullptr);
    slider_.setDoubleClickReturnValue(true, double(juno::paramInfo(paramId).def));
    addAndMakeVisible(slider_);
    attachment_ = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.apvts, juno::paramInfo(paramId).id, slider_);
}

void PanelSlider::resized()
{
    slider_.setBounds(18, 0, 34, 150);
}

void PanelSlider::paint(juce::Graphics& g)
{
    // La escala de 0 a 10 sigue el recorrido real del capuchon
    g.setFont(juce::Font(juce::FontOptions(8.5f)));
    for (int i = 0; i <= 10; ++i) {
        const float y = float(slider_.getPositionOfValue(i / 10.0)) + float(slider_.getY());
        g.setColour(JunoLookAndFeel::dim());
        g.fillRect(14.f, y - 0.5f, 4.f, 1.f);
        g.drawText(juce::String(i), 0, int(y) - 5, 12, 10, juce::Justification::centredRight);
    }
    g.setColour(JunoLookAndFeel::dim());
    g.setFont(bold(9.5f));
    g.drawText(label_, 0, 156, getWidth(), 14, juce::Justification::centred);
}

// ---------------------------------------------------------------- PanelSwitch

PanelSwitch::PanelSwitch(JunoProcessor& p, int paramId, juce::LookAndFeel& laf)
    : label_(kSwitchLabel[paramId])
{
    const auto& info = juno::paramInfo(paramId);
    auto names = juce::StringArray::fromTokens(info.labels, "|", "");
    if (paramId == juno::EnvPol)
        names = juce::StringArray("-", "+");   // 0 = invertida, 1 = normal
    for (int i = 0; i < names.size(); ++i) {
        auto b = std::make_unique<juce::TextButton>(names[i]);
        b->setLookAndFeel(&laf);
        b->setClickingTogglesState(false);
        b->onClick = [this, i] { attachment_->setValueAsCompleteGesture(float(i)); };
        addAndMakeVisible(*b);
        width_ += juce::jmax(26, names[i].length() * 7 + 14);
        buttons_.push_back(std::move(b));
    }
    attachment_ = std::make_unique<juce::ParameterAttachment>(*p.apvts.getParameter(info.id), [this](float v) { update(v); });
    attachment_->sendInitialUpdate();
}

void PanelSwitch::update(float index)
{
    for (size_t i = 0; i < buttons_.size(); ++i)
        buttons_[i]->setToggleState(int(index + 0.5f) == int(i), juce::dontSendNotification);
}

void PanelSwitch::resized()
{
    int x = 0;
    for (auto& b : buttons_) {
        const int w = juce::jmax(26, b->getButtonText().length() * 7 + 14);
        b->setBounds(x, 15, w - 2, 22);
        x += w;
    }
}

void PanelSwitch::paint(juce::Graphics& g)
{
    g.setColour(JunoLookAndFeel::dim());
    g.setFont(bold(9.5f));
    g.drawText(label_, 0, 0, getWidth(), 13, juce::Justification::centredLeft);
}

// ---------------------------------------------------------------- Content

class JunoEditor::Content : public juce::Component {
public:
    Content(JunoProcessor& p, JunoLookAndFeel& laf)
        : proc_(p), laf_(laf),
          keyboard_(p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard)
    {
        struct Def { const char* name; std::vector<int> sliders; std::vector<int> switches; int row; };
        using namespace juno;
        const std::vector<Def> defs = {
            { "PORTAMENTO", { PortaTime, BendDco, BendVcf }, { PortaOn, VoiceMode }, 0 },
            { "LFO", { LfoRate, LfoDelay }, {}, 0 },
            { "DCO", { DcoLfo, Pwm, Sub, Noise }, { Range, PwmMode, Pulse, Saw }, 0 },
            { "HPF", {}, { Hpf }, 0 },
            { "VCF", { VcfFreq, VcfRes, VcfEnv, VcfLfo, VcfKybd }, { EnvPol }, 1 },
            { "VCA", { VcaLevel }, { VcaMode }, 1 },
            { "ENVELOPE", { Atk, Dec, Sus, Rel }, {}, 1 },
            { "VELOCITY", { VelVca, VelVcf }, {}, 1 },
            { "CHORUS", {}, { Chorus }, 1 },
        };
        constexpr int rowTop[2] = { 86, 86 + 232 };
        int cursor[2] = { 20, 20 };
        for (const auto& d : defs) {
            int switchW = 0;
            std::vector<PanelSwitch*> mine;
            for (int id : d.switches) {
                switches_.push_back(std::make_unique<PanelSwitch>(p, id, laf));
                mine.push_back(switches_.back().get());
                switchW = juce::jmax(switchW, switches_.back()->idealWidth());
            }
            const int sliderW = 52 * int(d.sliders.size());
            const int inner = sliderW + (switchW ? switchW + (sliderW ? 14 : 0) : 0);
            const int w = inner + 28;
            const int x = cursor[d.row], y = rowTop[d.row];
            sections_.push_back({ d.name, { x, y, w, 214 } });
            int sx = x + 14;
            for (int id : d.sliders) {
                sliders_.push_back(std::make_unique<PanelSlider>(p, id, laf));
                addAndMakeVisible(*sliders_.back());
                sliders_.back()->setBounds(sx, y + 32, 52, 174);
                sx += 52;
            }
            int sy = y + 38;
            for (auto* sw : mine) {
                addAndMakeVisible(*sw);
                sw->setBounds(sx + (sliderW ? 14 : 0), sy, sw->idealWidth(), 40);
                sy += (sliderW ? 46 : 52);
            }
            cursor[d.row] += w;
        }

        // Sonidos: lista agrupada por categoria con anterior / siguiente
        juce::String lastCategory;
        const auto& list = juno::presets();
        for (size_t i = 0; i < list.size(); ++i) {
            if (lastCategory != list[i].category) {
                if (i > 0)
                    presets_.addSeparator();
                presets_.addSectionHeading(list[i].category);
                lastCategory = list[i].category;
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

        // Bender (vuelve al centro al soltarlo) y rueda de modulacion
        for (auto* s : { &bender_, &mod_ }) {
            s->setSliderStyle(juce::Slider::LinearVertical);
            s->setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
            s->setLookAndFeel(&laf);
            addAndMakeVisible(*s);
        }
        bender_.setRange(-1.0, 1.0, 0.0);
        bender_.setValue(0.0, juce::dontSendNotification);
        bender_.onValueChange = [this] { proc_.setUiBend(float(bender_.getValue())); };
        bender_.onDragEnd = [this] { bender_.setValue(0.0, juce::sendNotificationSync); };
        mod_.setRange(0.0, 1.0, 0.0);
        mod_.onValueChange = [this] { proc_.setUiMod(float(mod_.getValue())); };

        keyboard_.setLookAndFeel(&laf);
        keyboard_.setAvailableRange(36, 96);
        keyboard_.setLowestVisibleKey(36);
        keyboard_.setKeyWidth(27.6f);
        keyboard_.setScrollButtonsVisible(false);
        keyboard_.setWantsKeyboardFocus(false);
        keyboard_.setColour(juce::MidiKeyboardComponent::keyDownOverlayColourId, JunoLookAndFeel::red().withAlpha(0.8f));
        keyboard_.setColour(juce::MidiKeyboardComponent::mouseOverKeyOverlayColourId, juce::Colours::white.withAlpha(0.2f));
        keyboard_.setColour(juce::MidiKeyboardComponent::blackNoteColourId, juce::Colour(0xff17181a));
        keyboard_.setColour(juce::MidiKeyboardComponent::whiteNoteColourId, juce::Colour(0xffe9e9e2));
        addAndMakeVisible(keyboard_);
        setSize(JunoEditor::kWidth, JunoEditor::kHeight);
    }

    ~Content() override
    {
        // Los componentes hijos no pueden quedar apuntando a un LookAndFeel que se destruye antes
        for (auto& s : sliders_) s->setLookAndFeel(nullptr);
        for (auto* c : { (juce::Component*) &presets_, (juce::Component*) &prev_, (juce::Component*) &next_, (juce::Component*) &bender_,
                         (juce::Component*) &mod_, (juce::Component*) &keyboard_ })
            c->setLookAndFeel(nullptr);
    }

    void refresh()
    {
        const int v = proc_.voices.load();
        const int prog = proc_.getCurrentProgram();
        if (v != lit_) {
            lit_ = v;
            repaint(ledArea_);
        }
        if (prog + 1 != presets_.getSelectedId())
            presets_.setSelectedId(prog + 1, juce::dontSendNotification);
    }

    void resized() override
    {
        const int w = getWidth();
        presets_.setBounds(w - 330, 22, 250, 26);
        prev_.setBounds(w - 366, 22, 32, 26);
        next_.setBounds(w - 76, 22, 32, 26);
        ledArea_ = { w - 520, 28, 140, 14 };
        const int ky = getHeight() - 92;
        bender_.setBounds(20, ky, 40, 78);
        mod_.setBounds(66, ky, 40, 78);
        keyboard_.setBounds(120, ky, w - 140, 78);
    }

    void paint(juce::Graphics& g) override
    {
        const auto b = getLocalBounds().toFloat();
        g.setGradientFill(juce::ColourGradient::vertical(juce::Colour(0xff34353a), 0.f, juce::Colour(0xff25262a), b.getHeight()));
        g.fillAll();
        g.setColour(juce::Colour(0xff111113));
        g.drawRect(b, 2.f);
        g.setColour(juce::Colour(0xff4a4b50));
        g.drawRect(b.reduced(2.f), 1.f);

        // Logotipo
        g.setColour(JunoLookAndFeel::ink());
        g.setFont(juce::Font(juce::FontOptions("Georgia", 34.f, juce::Font::bold | juce::Font::italic)));
        g.drawText("JUNO-106", 22, 12, 220, 44, juce::Justification::centredLeft);
        g.setColour(JunoLookAndFeel::dim());
        g.setFont(bold(11.f));
        g.drawText("POLYPHONIC SYNTHESIZER", 246, 18, 260, 14, juce::Justification::centredLeft);
        const juce::Colour stripe[4] = { juce::Colour(0xffd8402a), juce::Colour(0xffee8a1d), juce::Colour(0xfff2c21c), juce::Colour(0xff3b82c4) };
        for (int i = 0; i < 4; ++i) {
            g.setColour(stripe[i]);
            g.fillRect(246 + i * 40, 38, 40, 6);
        }

        // Voces sonando
        g.setColour(JunoLookAndFeel::dim());
        g.setFont(bold(9.f));
        g.drawText("VOICES", ledArea_.getX() - 54, ledArea_.getY(), 50, 14, juce::Justification::centredRight);
        for (int i = 0; i < 6; ++i) {
            const auto led = juce::Rectangle<float>(float(ledArea_.getX() + i * 22), float(ledArea_.getY()), 12.f, 12.f);
            const bool on = i < lit_;
            if (on) {
                g.setColour(juce::Colour(0xffff4a2e).withAlpha(0.35f));
                g.fillEllipse(led.expanded(4.f));
            }
            g.setColour(on ? juce::Colour(0xffff4a2e) : juce::Colour(0xff4a1a14));
            g.fillEllipse(led);
            g.setColour(juce::Colour(0xff111113));
            g.drawEllipse(led, 1.f);
        }

        // Secciones: nombre entre dos lineas y un filo a la izquierda
        for (const auto& s : sections_) {
            const auto& a = s.area;
            g.setColour(juce::Colour(0xff55565b));
            g.fillRect(a.getX(), a.getY() + 4, 1, a.getHeight() - 4);
            g.setColour(JunoLookAndFeel::ink());
            g.setFont(bold(11.f));
            const juce::String name = s.name;
            const float tw = 11.f * 0.62f * float(name.length()) + 12.f;
            const float mid = float(a.getCentreX());
            g.drawText(name, juce::Rectangle<float>(mid - tw * 0.5f, float(a.getY()), tw, 14.f), juce::Justification::centred);
            g.setColour(juce::Colour(0xff8c8d92));
            g.fillRect(float(a.getX() + 10), float(a.getY() + 7), mid - tw * 0.5f - float(a.getX() + 10), 1.f);
            g.fillRect(mid + tw * 0.5f, float(a.getY() + 7), float(a.getRight() - 10) - (mid + tw * 0.5f), 1.f);
        }
        g.setColour(JunoLookAndFeel::dim());
        g.setFont(bold(8.5f));
        g.drawText("BENDER", 12, getHeight() - 104, 56, 12, juce::Justification::centred);
        g.drawText("MOD", 58, getHeight() - 104, 56, 12, juce::Justification::centred);
    }

private:
    void step(int delta)
    {
        const int n = proc_.getNumPrograms();
        proc_.setCurrentProgram((proc_.getCurrentProgram() + delta + n) % n);
        presets_.setSelectedId(proc_.getCurrentProgram() + 1, juce::dontSendNotification);
    }

    struct SectionRect { juce::String name; juce::Rectangle<int> area; };

    JunoProcessor& proc_;
    JunoLookAndFeel& laf_;
    std::vector<SectionRect> sections_;
    std::vector<std::unique_ptr<PanelSlider>> sliders_;
    std::vector<std::unique_ptr<PanelSwitch>> switches_;
    juce::ComboBox presets_;
    juce::TextButton prev_ { "<" }, next_ { ">" };
    juce::Slider bender_, mod_;
    juce::MidiKeyboardComponent keyboard_;
    juce::Rectangle<int> ledArea_;
    int lit_ = 0;
};

// ---------------------------------------------------------------- Editor

JunoEditor::JunoEditor(JunoProcessor& p) : juce::AudioProcessorEditor(p)
{
    content_ = std::make_unique<Content>(p, laf_);
    addAndMakeVisible(*content_);
    constrainer_.setFixedAspectRatio(double(kWidth) / double(kHeight));
    constrainer_.setSizeLimits(kWidth / 2, kHeight / 2, kWidth * 3 / 2, kHeight * 3 / 2);
    setConstrainer(&constrainer_);
    setResizable(true, true);
    setSize(kWidth, kHeight);
    startTimerHz(25);
}

JunoEditor::~JunoEditor()
{
    stopTimer();
    content_.reset();
}

void JunoEditor::resized()
{
    content_->setBounds(0, 0, kWidth, kHeight);
    content_->setTransform(juce::AffineTransform::scale(float(getWidth()) / float(kWidth)));
}

void JunoEditor::timerCallback()
{
    content_->refresh();
}
