#pragma once
#include <memory>
#include <vector>
#include <juce_audio_utils/juce_audio_utils.h>
#include "AcLookAndFeel.h"
#include "PluginProcessor.h"

/** Teclado de marfil con filo frontal y sostenidos negros brillantes. */
class AcKeyboard : public juce::MidiKeyboardComponent {
public:
    using juce::MidiKeyboardComponent::MidiKeyboardComponent;

    void drawWhiteNote(int midiNote, juce::Graphics& g, juce::Rectangle<float> area, bool isDown, bool isOver, juce::Colour, juce::Colour) override
    {
        auto r = area.reduced(0.6f, 0.f);
        g.setGradientFill(juce::ColourGradient::vertical(isDown ? juce::Colour(0xffe7c9a0) : juce::Colour(0xfff7f4ea), r.getY(),
                                                         isDown ? juce::Colour(0xffc9a272) : juce::Colour(0xffddd8c8), r.getBottom()));
        g.fillRect(r);
        g.setColour(juce::Colour(0xffb9b4a4));
        g.fillRect(r.withTop(r.getBottom() - (isDown ? 5.f : 11.f)));
        g.setColour(juce::Colours::white.withAlpha(isDown ? 0.f : 0.55f));
        g.fillRect(r.withTop(r.getBottom() - 12.f).withHeight(1.2f));
        g.setColour(juce::Colour(0xff2a2a27));
        g.drawRect(area, 1.f);
        if (isOver && !isDown) {
            g.setColour(juce::Colours::white.withAlpha(0.2f));
            g.fillRect(r);
        }
        if (midiNote % 12 == 0) {
            g.setColour(juce::Colour(0xff55534a));
            g.setFont(AcLookAndFeel::bold(10.f));
            g.drawText("C" + juce::String(midiNote / 12 - 2), r.withTop(r.getBottom() - 28.f).withHeight(14.f), juce::Justification::centred);
        }
    }

    void drawBlackNote(int, juce::Graphics& g, juce::Rectangle<float> area, bool isDown, bool isOver, juce::Colour) override
    {
        g.setColour(juce::Colours::black.withAlpha(0.45f));
        g.fillRect(area.translated(2.f, 0.f).withTrimmedTop(4.f));
        g.setGradientFill(juce::ColourGradient::vertical(isDown ? juce::Colour(0xff6a3b1d) : juce::Colour(0xff2b2b2f), area.getY(),
                                                         isDown ? juce::Colour(0xff3d2011) : juce::Colour(0xff09090a), area.getBottom()));
        g.fillRect(area);
        g.setColour(juce::Colours::white.withAlpha(isOver ? 0.28f : 0.12f));
        g.fillRect(area.reduced(3.f, 0.f).withHeight(area.getHeight() - 10.f).withWidth(2.f).translated(1.f, 2.f));
        g.setColour(juce::Colours::black);
        g.drawRect(area, 1.f);
    }
};

/** Una perilla del panel: la tapa, la escala alrededor y el nombre debajo (en tinta oscura sobre la tapa plateada). */
class AcKnob : public juce::Component {
public:
    AcKnob(AcidProcessor& p, int paramId, bool bipolar, const juce::String& label, juce::LookAndFeel& laf);
    ~AcKnob() override { slider_.setLookAndFeel(nullptr); }
    void paint(juce::Graphics&) override;
    void resized() override;
    static constexpr int kW = 104, kH = 120;

private:
    juce::Slider slider_;
    bool bipolar_;
    juce::String label_;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment_;
};

/** Interruptor de palanca de dos posiciones. */
class AcRocker : public juce::ToggleButton {
public:
    AcRocker(AcidProcessor& p, int paramId, const juce::String& label, juce::LookAndFeel& laf);
    ~AcRocker() override { setLookAndFeel(nullptr); }
    static constexpr int kW = 56, kH = 74;

private:
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> attachment_;
};

/** Rueda de tono (vuelve al centro al soltarla). */
class AcWheel : public juce::Component {
public:
    std::function<void(float)> onChange;
    void setValue(float v);
    void paint(juce::Graphics&) override;
    void mouseDown(const juce::MouseEvent&) override { dragStart_ = value_; }
    void mouseDrag(const juce::MouseEvent& e) override { setValue(dragStart_ - float(e.getDistanceFromDragStartY()) / (float(getHeight()) * 0.5f)); }
    void mouseUp(const juce::MouseEvent&) override { setValue(0.f); }
    void mouseDoubleClick(const juce::MouseEvent&) override { setValue(0.f); }

private:
    float value_ = 0.f, dragStart_ = 0.f;
};

class AcidEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit AcidEditor(AcidProcessor&);
    ~AcidEditor() override;

    void paint(juce::Graphics&) override {}
    void resized() override;

    // El panel se dibuja siempre a este tamano y se escala al de la ventana
    static constexpr int kWidth = 1340, kHeight = 560;

private:
    class Content;
    void timerCallback() override;

    AcLookAndFeel laf_;
    juce::ComponentBoundsConstrainer constrainer_;
    std::unique_ptr<Content> content_;
};
